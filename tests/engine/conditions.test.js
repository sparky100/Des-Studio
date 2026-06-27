import { describe, test, expect, vi } from 'vitest';
import { evaluatePredicate, compilePredicate, getPredicateDependencies } from '../../src/engine/conditions.js';
import { buildEngine } from '../../src/engine/index.js';

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

  // ── container() token resolution ──────────────────────────────────────────────

  test('resolves container(Id).level from state.__container_<id>', () => {
    expect(evaluatePredicate(
      { variable: 'container(Tank).level', operator: '>=', value: 10 },
      { __container_Tank: 15 }
    )).toBe(true);
  });

  test('resolves container(Id).capacity, defaulting to Infinity when unset', () => {
    expect(evaluatePredicate(
      { variable: 'container(Tank).capacity', operator: '>', value: 999999 },
      { __container_Tank: 15 }
    )).toBe(true);
  });

  test('resolves container(Id).capacity from state.__containerCap_<id> when set', () => {
    expect(evaluatePredicate(
      { variable: 'container(Tank).capacity', operator: '==', value: 1000 },
      { __containerCap_Tank: 1000 }
    )).toBe(true);
  });

  test('resolves container(Id).min and container(Id).max', () => {
    const state = { __containerMin_Tank: 5, __containerMax_Tank: 95 };
    expect(evaluatePredicate({ variable: 'container(Tank).min', operator: '==', value: 5 }, state)).toBe(true);
    expect(evaluatePredicate({ variable: 'container(Tank).max', operator: '==', value: 95 }, state)).toBe(true);
  });

  test('undeclared container resolves to undefined, not a thrown error', () => {
    expect(evaluatePredicate(
      { variable: 'container(Ghost).level', operator: '==', value: 0 },
      {}
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

  test('captures container dependencies and not as unknown', () => {
    const deps = getPredicateDependencies('container(Tank).level >= 10');
    expect(Array.from(deps.containers)).toEqual(['tank']);
    expect(deps.unknown).toBe(false);
  });

  test('container dependency bucket merges across AND/OR clauses', () => {
    const deps = getPredicateDependencies({
      operator: 'AND',
      clauses: [
        { variable: 'container(Tank).level', operator: '>=', value: 10 },
        { variable: 'container(Buffer).capacity', operator: '>', value: 0 },
      ],
    });
    expect(Array.from(deps.containers).sort()).toEqual(['buffer', 'tank']);
  });
});

describe('container(Id).level — end-to-end blocking C-event', () => {
  test('DRAIN only fires once a condition referencing container(Tank).level is satisfied', () => {
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      containerTypes: [{ id: 'Tank', capacity: '1000', initialLevel: '0' }],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '1', effect: 'ARRIVE(Customer, Queue)', schedules: [] },
        { id: 'fill', name: 'Fill',     scheduledTime: '3', effect: 'FILL(Tank, 20)', schedules: [] },
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [
        {
          // Condition only holds at exactly 20 (the post-FILL level) — after one
          // DRAIN(10) the level (10) no longer satisfies ">= 20", so the guard
          // naturally prevents repeat firing within this same test, without needing
          // to special-case engine pass-counting.
          id: 'drain', name: 'Drain', priority: 1,
          condition: 'container(Tank).level >= 20',
          effect: 'DRAIN(Tank, 10)',
          cSchedules: [],
        },
      ],
      maxSimTime: 10,
    };
    const engine = buildEngine(model, 42, 0, 10);
    let sawNonZeroBeforeFill = false;
    let snap;
    while (true) {
      const step = engine.step();
      snap = step.snap;
      if (snap.clock < 3 && (snap.containers?.Tank?.level ?? 0) !== 0) sawNonZeroBeforeFill = true;
      if (step.done) break;
    }
    // DRAIN cannot have fired before the FILL at t=3 raised the level to 20.
    expect(sawNonZeroBeforeFill).toBe(false);
    // After FILL(20) then a single DRAIN(10): level settles at 10.
    expect(snap.containers?.Tank?.level).toBe(10);
  });
});

// ── M5 — legacy string conditions evaluate identically to their predicate-object form ──
// migrateLegacyCondition() converts string syntax into the canonical predicate object before
// evaluation; these tests confirm evaluatePredicate produces the same result for both shapes.

describe('M5 — string vs. predicate-object parity via evaluatePredicate', () => {
  test('simple > comparison: string and JSON predicate agree (true)', () => {
    const state = { served: 5 };
    expect(evaluatePredicate('served > 3', state)).toBe(true);
    expect(evaluatePredicate({ variable: 'served', operator: '>', value: 3 }, state)).toBe(true);
  });

  test('simple > comparison: string and JSON predicate agree (false)', () => {
    const state = { served: 1 };
    expect(evaluatePredicate('served > 3', state)).toBe(false);
    expect(evaluatePredicate({ variable: 'served', operator: '>', value: 3 }, state)).toBe(false);
  });

  test('clock token evaluates identically for string and object form', () => {
    expect(evaluatePredicate('clock > 5', { clock: 10 })).toBe(true);
    expect(evaluatePredicate({ variable: 'clock', operator: '>', value: 5 }, { clock: 3 })).toBe(false);
  });

  test('AND of two clauses — both true → true (string and object agree)', () => {
    const state = { served: 5, reneged: 2 };
    expect(evaluatePredicate('served > 0 AND reneged > 0', state)).toBe(true);
    expect(evaluatePredicate({
      operator: 'AND',
      clauses: [
        { variable: 'served', operator: '>', value: 0 },
        { variable: 'reneged', operator: '>', value: 0 },
      ],
    }, state)).toBe(true);
  });

  test('AND of two clauses — one false → false', () => {
    const state = { served: 5, reneged: 0 };
    expect(evaluatePredicate('served > 0 AND reneged > 0', state)).toBe(false);
  });

  test('OR of two clauses — one true → true', () => {
    const state = { served: 0, reneged: 2 };
    expect(evaluatePredicate('served > 0 OR reneged > 0', state)).toBe(true);
  });

  test('OR of two clauses — both false → false', () => {
    const state = { served: 0, reneged: 0 };
    expect(evaluatePredicate('served > 0 OR reneged > 0', state)).toBe(false);
  });

  test('custom state variable substitution works for string form', () => {
    const state = { myCounter: 7 };
    expect(evaluatePredicate('myCounter > 5', state)).toBe(true);
    expect(evaluatePredicate('myCounter > 10', state)).toBe(false);
  });

  test('empty condition string evaluates to false', () => {
    expect(evaluatePredicate('', {})).toBe(false);
    expect(evaluatePredicate('   ', {})).toBe(false);
  });
});
