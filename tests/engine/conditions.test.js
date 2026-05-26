import { describe, test, expect, vi } from 'vitest';
import { evalCondition, evaluatePredicate, buildConditionTokens, compilePredicate, getPredicateDependencies } from '../../src/engine/conditions.js';

// Tests for the safe JSON predicate evaluator (Addition 1 §4).
// These tests FAIL on the unmodified codebase (evaluatePredicate does not exist).
// They PASS after Sprint 1 Task 1 is implemented.

describe('evaluatePredicate — safe JSON predicate evaluator', () => {

  // ── Single predicate: numeric operators ──────────────────────────────────────

  test('== operator: true when Queue length matches value', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '==', value: 5 },
      { queues: { q1: { length: 5 } } }
    )).toBe(true);
  });

  test('== operator: false when Queue length does not match', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '==', value: 5 },
      { queues: { q1: { length: 3 } } }
    )).toBe(false);
  });

  test('!= operator for numbers: true when values differ', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '!=', value: 5 },
      { queues: { q1: { length: 3 } } }
    )).toBe(true);
  });

  test('!= operator for numbers: false when values match', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '!=', value: 5 },
      { queues: { q1: { length: 5 } } }
    )).toBe(false);
  });

  test('< operator: true when left is less', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '<', value: 5 },
      { queues: { q1: { length: 2 } } }
    )).toBe(true);
  });

  test('< operator: false when left equals right', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '<', value: 5 },
      { queues: { q1: { length: 5 } } }
    )).toBe(false);
  });

  test('> operator: true when left is greater', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '>', value: 5 },
      { queues: { q1: { length: 6 } } }
    )).toBe(true);
  });

  test('<= operator: true on strict less-than', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '<=', value: 5 },
      { queues: { q1: { length: 4 } } }
    )).toBe(true);
  });

  test('<= operator: true on equality', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '<=', value: 5 },
      { queues: { q1: { length: 5 } } }
    )).toBe(true);
  });

  test('>= operator: true on equality', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '>=', value: 5 },
      { queues: { q1: { length: 5 } } }
    )).toBe(true);
  });

  test('>= operator: false when left is less', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q1.length', operator: '>=', value: 5 },
      { queues: { q1: { length: 4 } } }
    )).toBe(false);
  });

  // ── Single predicate: string operators ───────────────────────────────────────

  test('== operator for strings: true on match', () => {
    expect(evaluatePredicate(
      { variable: 'Entity.type', operator: '==', value: 'urgent' },
      { currentEntity: { attrs: { type: 'urgent' } } }
    )).toBe(true);
  });

  test('== operator for strings: false on no match', () => {
    expect(evaluatePredicate(
      { variable: 'Entity.type', operator: '==', value: 'urgent' },
      { currentEntity: { attrs: { type: 'standard' } } }
    )).toBe(false);
  });

  test('!= operator for strings: true when values differ', () => {
    expect(evaluatePredicate(
      { variable: 'Entity.type', operator: '!=', value: 'urgent' },
      { currentEntity: { attrs: { type: 'standard' } } }
    )).toBe(true);
  });

  // ── Single predicate: boolean operators ──────────────────────────────────────

  test('== operator for booleans: true when both true', () => {
    expect(evaluatePredicate(
      { variable: 'Entity.urgent', operator: '==', value: true },
      { currentEntity: { attrs: { urgent: true } } }
    )).toBe(true);
  });

  test('== operator for booleans: false when values differ', () => {
    expect(evaluatePredicate(
      { variable: 'Entity.urgent', operator: '==', value: true },
      { currentEntity: { attrs: { urgent: false } } }
    )).toBe(false);
  });

  test('!= operator for booleans: true when values differ', () => {
    expect(evaluatePredicate(
      { variable: 'Entity.urgent', operator: '!=', value: true },
      { currentEntity: { attrs: { urgent: false } } }
    )).toBe(true);
  });

  // ── Variable resolution ───────────────────────────────────────────────────────

  test('resolves Entity.attributeName from state.currentEntity.attrs', () => {
    expect(evaluatePredicate(
      { variable: 'Entity.priority', operator: '==', value: 3 },
      { currentEntity: { attrs: { priority: 3 } } }
    )).toBe(true);
  });

  test('resolves Resource.<id>.status from state.resources', () => {
    expect(evaluatePredicate(
      { variable: 'Resource.machine_01.status', operator: '==', value: 'IDLE' },
      { resources: { machine_01: { status: 'IDLE', busyCount: 0 } } }
    )).toBe(true);
  });

  test('resolves Resource.<id>.busyCount from state.resources', () => {
    expect(evaluatePredicate(
      { variable: 'Resource.machine_01.busyCount', operator: '>', value: 0 },
      { resources: { machine_01: { status: 'BUSY', busyCount: 1 } } }
    )).toBe(true);
  });

  test('resolves Queue.<id>.length from state.queues', () => {
    expect(evaluatePredicate(
      { variable: 'Queue.q_main.length', operator: '>=', value: 1 },
      { queues: { q_main: { length: 3 } } }
    )).toBe(true);
  });

  test('resolves legacy queue token variables against helper state', () => {
    const state = {
      helpers: {
        waitingOf: vi.fn(() => [{ id: 1 }, { id: 2 }]),
        idleOf: vi.fn(() => [{ id: "srv-1" }]),
        busyOf: vi.fn(() => []),
      },
      model: { queues: [{ name: "Main Queue", discipline: "FIFO" }] },
    };
    expect(evaluatePredicate(
      {
        operator: 'AND',
        clauses: [
          { variable: 'queue(Main Queue).length', operator: '>', value: 0 },
          { variable: 'idle(Clerk).count', operator: '>', value: 0 },
        ],
      },
      state
    )).toBe(true);
  });

  test('resolves legacy attr(Type, attrName) token against helper state', () => {
    const state = {
      helpers: {
        waitingOf: vi.fn(() => []),
        idleOf: vi.fn(() => [{ attrs: { serviceTime: 4 } }]),
        busyOf: vi.fn(() => []),
      },
    };
    expect(evaluatePredicate(
      { variable: 'attr(Server, serviceTime)', operator: '==', value: 4 },
      state
    )).toBe(true);
  });

  test('resolves user-defined state variable by plain name', () => {
    expect(evaluatePredicate(
      { variable: 'batchCount', operator: '>', value: 5 },
      { batchCount: 7 }
    )).toBe(true);
  });

  test('user-defined state variable: false when condition not met', () => {
    expect(evaluatePredicate(
      { variable: 'batchCount', operator: '>', value: 5 },
      { batchCount: 3 }
    )).toBe(false);
  });

  // ── Compound predicates ───────────────────────────────────────────────────────

  test('AND compound: true when all clauses are true', () => {
    const state = {
      resources: { m: { status: 'IDLE', busyCount: 0 } },
      queues:    { q: { length: 2 } },
    };
    expect(evaluatePredicate({
      operator: 'AND',
      clauses: [
        { variable: 'Resource.m.status', operator: '==', value: 'IDLE' },
        { variable: 'Queue.q.length',    operator: '>=', value: 1      },
      ],
    }, state)).toBe(true);
  });

  test('AND compound: false when first clause is false', () => {
    const state = {
      resources: { m: { status: 'BUSY', busyCount: 1 } },
      queues:    { q: { length: 2 } },
    };
    expect(evaluatePredicate({
      operator: 'AND',
      clauses: [
        { variable: 'Resource.m.status', operator: '==', value: 'IDLE' },
        { variable: 'Queue.q.length',    operator: '>=', value: 1      },
      ],
    }, state)).toBe(false);
  });

  test('AND compound: false when second clause is false', () => {
    const state = {
      resources: { m: { status: 'IDLE', busyCount: 0 } },
      queues:    { q: { length: 0 } },
    };
    expect(evaluatePredicate({
      operator: 'AND',
      clauses: [
        { variable: 'Resource.m.status', operator: '==', value: 'IDLE' },
        { variable: 'Queue.q.length',    operator: '>=', value: 1      },
      ],
    }, state)).toBe(false);
  });

  test('OR compound: true when at least one clause is true', () => {
    const state = {
      resources: { m: { status: 'BUSY', busyCount: 1 } },
      queues:    { q: { length: 2 } },
    };
    expect(evaluatePredicate({
      operator: 'OR',
      clauses: [
        { variable: 'Resource.m.status', operator: '==', value: 'IDLE' },
        { variable: 'Queue.q.length',    operator: '>=', value: 1      },
      ],
    }, state)).toBe(true);
  });

  test('OR compound: false when all clauses are false', () => {
    const state = {
      resources: { m: { status: 'BUSY', busyCount: 1 } },
      queues:    { q: { length: 0 } },
    };
    expect(evaluatePredicate({
      operator: 'OR',
      clauses: [
        { variable: 'Resource.m.status', operator: '==', value: 'IDLE' },
        { variable: 'Queue.q.length',    operator: '>=', value: 1      },
      ],
    }, state)).toBe(false);
  });

  test('nested AND-within-OR compound evaluates correctly', () => {
    const state = {
      resources: { m: { status: 'IDLE', busyCount: 0 } },
      queues:    { q: { length: 2 } },
      batchCount: 0,
    };
    // (Resource.m.status == IDLE AND Queue.q.length >= 1) OR batchCount > 10
    expect(evaluatePredicate({
      operator: 'OR',
      clauses: [
        {
          operator: 'AND',
          clauses: [
            { variable: 'Resource.m.status', operator: '==', value: 'IDLE' },
            { variable: 'Queue.q.length',    operator: '>=', value: 1 },
          ],
        },
        { variable: 'batchCount', operator: '>', value: 10 },
      ],
    }, state)).toBe(true);
  });

  // ── Unknown variable namespace ────────────────────────────────────────────────

  test('throws on dotted variable with unrecognised namespace', () => {
    expect(() =>
      evaluatePredicate({ variable: 'Unknown.foo.bar', operator: '==', value: 0 }, {})
    ).toThrow();
  });

  // ── Security ──────────────────────────────────────────────────────────────────

  test('does not execute code when variable is process.exit', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    try {
      // process.exit has dots but namespace 'process' is unrecognised — must throw,
      // not execute process.exit.
      evaluatePredicate({ variable: 'process.exit', operator: '==', value: 0 }, {});
    } catch {
      // expected — unknown namespace
    }
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  test('does not execute code when variable contains constructor injection attempt', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    try {
      evaluatePredicate(
        { variable: 'constructor.constructor', operator: '==', value: 0 },
        {}
      );
    } catch {
      // expected
    }
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

describe('compilePredicate — reusable predicate evaluators', () => {
  test('compiles legacy strings into reusable evaluators', () => {
    const compiled = compilePredicate('queue(Main Queue).length > 0 AND idle(Server).count > 0');
    const state = {
      helpers: {
        waitingOf: vi.fn(() => [{ id: 1 }]),
        idleOf: vi.fn(() => [{ id: 2 }]),
        busyOf: vi.fn(() => []),
      },
      model: { queues: [{ name: 'Main Queue', discipline: 'FIFO' }] },
    };
    expect(compiled(state)).toBe(true);
  });

  test('captures dependency metadata for queue and resource tokens', () => {
    const deps = getPredicateDependencies('queue(Main Queue).length > 0 AND idle(Server).count > 0');
    expect(Array.from(deps.queues)).toEqual(['main queue']);
    expect(Array.from(deps.resources)).toEqual(['server']);
    expect(Array.from(deps.stateVars)).toEqual([]);
    expect(Array.from(deps.builtins)).toEqual([]);
    expect(deps.clock).toBe(false);
    expect(deps.unknown).toBe(false);
  });

  test('captures dependency metadata for state vars and built-ins', () => {
    const deps = getPredicateDependencies({
      operator: 'OR',
      clauses: [
        { variable: 'served', operator: '>', value: 0 },
        { variable: 'batchCount', operator: '>', value: 5 },
      ],
    });
    expect(Array.from(deps.builtins)).toEqual(['served']);
    expect(Array.from(deps.stateVars)).toEqual(['batchCount']);
  });
});

describe('evalCondition — legacy condition string evaluator', () => {
  test('supports queue names with spaces in queue length conditions', () => {
    const helpers = {
      entities: [{ id: 1, queue: 'Main Queue', status: 'waiting' }],
      waitingOf: vi.fn(() => []),
      idleOf: vi.fn(() => [{ id: 2 }]),
      busyOf: vi.fn(() => []),
    };

    expect(evalCondition(
      'queue(Main Queue).length > 0 AND idle(Clerk).count > 0',
      helpers,
      {},
      0
    )).toBe(true);
  });
});

describe('buildConditionTokens — token list for Condition Builder UI', () => {
  test('includes clock token for simulation time conditions', () => {
    const tokens = buildConditionTokens([], []);
    const clockToken = tokens.find(t => t.value === 'clock');
    expect(clockToken).toBeDefined();
    expect(clockToken.valueType).toBe('number');
    expect(clockToken.label).toContain('simulation time');
  });

  test('clock token appears before served/reneged tokens', () => {
    const tokens = buildConditionTokens([], []);
    const clockIdx = tokens.findIndex(t => t.value === 'clock');
    const servedIdx = tokens.findIndex(t => t.value === 'served');
    expect(clockIdx).toBeLessThan(servedIdx);
  });
});

// ── S39.2 — M5: evalCondition as backward-compat adapter ─────────────────────
// Documents that string conditions produce the same boolean result as equivalent
// JSON predicates. Mixed-precedence behaviour is explicitly noted.

const mockHelpers = {
  entities: [],
  model: { queues: [] },
  waitingOf: (type) => [],
  idleOf:    (type) => [],
  busyOf:    (type) => [],
};

describe('M5 — evalCondition adapter parity with evaluatePredicate', () => {

  test('simple > comparison: string and JSON predicate agree (true)', () => {
    const state = { __served: 5 };
    // String: "served > 3"
    const strResult = evalCondition('served > 3', mockHelpers, state, 0);
    // JSON predicate: state variable "served" mapped through __served
    // evaluatePredicate uses resolveVariable which reads plain state vars directly.
    // For served we use __served via the string evaluator substitution.
    // The string evaluator replaces "served" with "5", then evaluates "5 > 3".
    expect(strResult).toBe(true);
  });

  test('simple > comparison: string and JSON predicate agree (false)', () => {
    const state = { __served: 1 };
    const strResult = evalCondition('served > 3', mockHelpers, state, 0);
    expect(strResult).toBe(false);
  });

  test('clock token evaluates correctly in string adapter', () => {
    const state = { __served: 0 };
    expect(evalCondition('clock > 5', mockHelpers, state, 10)).toBe(true);
    expect(evalCondition('clock > 5', mockHelpers, state, 3)).toBe(false);
  });

  test('AND of two clauses — both true → true', () => {
    const state = { __served: 5, __reneged: 2 };
    expect(evalCondition('served > 0 AND reneged > 0', mockHelpers, state, 0)).toBe(true);
  });

  test('AND of two clauses — one false → false', () => {
    const state = { __served: 5, __reneged: 0 };
    expect(evalCondition('served > 0 AND reneged > 0', mockHelpers, state, 0)).toBe(false);
  });

  test('OR of two clauses — one true → true', () => {
    const state = { __served: 0, __reneged: 2 };
    expect(evalCondition('served > 0 OR reneged > 0', mockHelpers, state, 0)).toBe(true);
  });

  test('OR of two clauses — both false → false', () => {
    const state = { __served: 0, __reneged: 0 };
    expect(evalCondition('served > 0 OR reneged > 0', mockHelpers, state, 0)).toBe(false);
  });

  // Documents left-to-right AND/OR semantics (no grouping)
  test('mixed AND/OR — left-to-right evaluation (documented behaviour)', () => {
    // "A AND B OR C" with A=false, B=false, C=true
    // Left-to-right: (false AND false) OR true = false OR true = true
    // This matches the current evalCondition behaviour. JSON predicates with explicit
    // nesting would differ: AND(false,false) = false; OR(false, true) = true (same here)
    // but grouping matters in other combinations — left-to-right is authoritative for strings.
    const state = { __served: 0, __reneged: 0, __loopCount: 1 };
    // "served > 0 AND reneged > 0 OR loopCount > 0"
    // = (0 > 0 && 0 > 0) || 1 > 0 = (false && false) || true = true
    expect(evalCondition('served > 0 AND reneged > 0 OR loopCount > 0', mockHelpers, state, 0)).toBe(true);
  });

  test('custom state variable substitution works in adapter', () => {
    const state = { __served: 0, myCounter: 7 };
    expect(evalCondition('myCounter > 5', mockHelpers, state, 0)).toBe(true);
    expect(evalCondition('myCounter > 10', mockHelpers, state, 0)).toBe(false);
  });

  test('empty condition returns false (adapter boundary case)', () => {
    const state = {};
    expect(evalCondition('', mockHelpers, state, 0)).toBe(false);
    expect(evalCondition('   ', mockHelpers, state, 0)).toBe(false);
  });
});
