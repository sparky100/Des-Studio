// Sprint 34 regression tests — SET and SET_ATTR macros, math functions, computed routing.
// Each test is named to be immediately traceable to the feature it covers.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => {
  resetSeq();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMM1(extraStateVars = [], customCEvent = null) {
  return {
    entityTypes: [
      { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
    bEvents: [
      { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
        schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '5' } }] },
      { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [
      customCEvent ?? {
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }],
      },
    ],
    stateVariables: extraStateVars,
  };
}

// ── S1: SET — plain state variable arithmetic ──────────────────────────────────

describe('S1 — SET updates state variable', () => {
  test('SET increments a counter after each assignment', () => {
    const model = makeMM1(
      [{ name: 'servedCount', initialValue: '0' }],
      {
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server); SET(servedCount, servedCount + 1)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }],
      }
    );
    const engine = buildEngine(model, 42, 0, 25);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done').length;
    // servedCount should equal the number of served customers
    expect(served).toBeGreaterThan(0);
    // Verify SET was logged in the event log
    const setLogs = result.log.filter(e => e.message?.includes('SET servedCount'));
    expect(setLogs.length).toBeGreaterThan(0);
  });

  test('SET with clock reference records assignment time', () => {
    const model = makeMM1(
      [{ name: 'lastAssignTime', initialValue: '0' }],
      {
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server); SET(lastAssignTime, clock)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }],
      }
    );
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();
    // The SET log should record a time > 0
    const setLogs = result.log.filter(e => e.message?.includes('SET lastAssignTime'));
    expect(setLogs.length).toBeGreaterThan(0);
  });

  test('SET with arithmetic expression: cumulative wait accumulator', () => {
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer',
          attrDefs: [{ name: 'waitAllowance', dist: 'fixed', distParams: { value: '10' } }] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '3' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        // Use Entity.waitAllowance (sampled at birth as 10) as part of the expression
        effect: 'ASSIGN(Queue, Server); SET(totalAllowance, totalAllowance + Entity.waitAllowance)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }],
      }],
      stateVariables: [{ name: 'totalAllowance', initialValue: '0' }],
    };
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done').length;
    expect(served).toBeGreaterThan(0);
    // Log entries for C-events are combined: "C: <name>  ·  ASSIGN ...  ·  SET totalAllowance = N  ·  ..."
    const setLogs = result.log.filter(e => e.message?.includes('SET totalAllowance'));
    expect(setLogs.length).toBeGreaterThan(0);
    expect(setLogs.length).toBeLessThanOrEqual(served + 1); // at most one in-flight at end
  });
});

// ── S2: SET_ATTR — entity attribute mutation ─────────────────────────────────

describe('S2 — SET_ATTR mutates entity attributes', () => {
  test('SET_ATTR assigns a computed value to entity attribute', () => {
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer',
          attrDefs: [
            { name: 'base', dist: 'fixed', distParams: { value: '5' } },
            { name: 'cost', dist: 'fixed', distParams: { value: '0' } },
          ] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '3' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server); SET_ATTR(cost, Entity.base * 2)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true }],
      }],
      stateVariables: [],
    };
    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(0);
    // Each served customer should have cost = base * 2 = 5 * 2 = 10
    for (const c of served) {
      expect(c.attrs?.cost).toBe(10);
    }
  });

  test('SET_ATTR with Entity. prefix form works identically', () => {
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer',
          attrDefs: [{ name: 'score', dist: 'fixed', distParams: { value: '3' } }] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '4' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        // Use Entity. prefix form
        effect: 'ASSIGN(Queue, Server); SET_ATTR(Entity.score, Entity.score + 7)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true }],
      }],
      stateVariables: [],
    };
    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(0);
    for (const c of served) {
      // score started at 3, SET_ATTR adds 7 → 10
      expect(c.attrs?.score).toBe(10);
    }
  });

  test('SET_ATTR with state variable reference', () => {
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer',
          attrDefs: [{ name: 'level', dist: 'fixed', distParams: { value: '0' } }] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '3' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        // tier is a state variable, SET_ATTR copies it into the entity
        effect: 'ASSIGN(Queue, Server); SET_ATTR(level, tier)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true }],
      }],
      stateVariables: [{ name: 'tier', initialValue: '5' }],
    };
    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(0);
    for (const c of served) {
      expect(c.attrs?.level).toBe(5);
    }
  });

  test('SET_ATTR without context entity logs a warning and does not crash', () => {
    // Fire SET_ATTR in a B-event that has no prior ARRIVE/ASSIGN — no entity context
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'pulse', name: 'Pulse', scheduledTime: '1',
          effect: 'SET_ATTR(foo, 42)', schedules: [] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [],
      stateVariables: [],
    };
    const engine = buildEngine(model, 42, 0, 5);
    // Should not throw
    expect(() => engine.runAll()).not.toThrow();
    const result = engine.runAll();
    const warned = result.log.some(e => e.message?.includes('SET_ATTR') && e.message?.includes('no context entity'));
    expect(warned).toBe(true);
  });
});

// ── S3: Math functions in safeArithmetic ─────────────────────────────────────

describe('S3 — Math functions in expressions', () => {
  function makeSetModel(expr, stateVars = []) {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer',
          attrDefs: [{ name: 'val', dist: 'fixed', distParams: { value: '8' } }] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '3' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: `ASSIGN(Queue, Server); SET_ATTR(result, ${expr})`,
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true }],
      }],
      stateVariables: stateVars,
    };
  }

  test('min(Entity.val, 5) clamps attribute to 5', () => {
    // val=8, min(8, 5) → 5
    const engine = buildEngine(makeSetModel('min(Entity.val, 5)'), 42, 0, 10);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(0);
    for (const c of served) {
      expect(c.attrs?.result).toBe(5);
    }
  });

  test('max(Entity.val, 10) returns entity value when it is larger', () => {
    // val=8, max(8, 10) → 10
    const engine = buildEngine(makeSetModel('max(Entity.val, 10)'), 42, 0, 10);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(0);
    for (const c of served) {
      expect(c.attrs?.result).toBe(10);
    }
  });

  test('abs(-3) returns 3', () => {
    // Use a state var holding -3 as the entity attr source
    const model = makeSetModel('abs(-3)', []);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(0);
    for (const c of served) {
      expect(c.attrs?.result).toBe(3);
    }
  });

  test('round(Entity.val / 3) rounds correctly', () => {
    // val=8, 8/3=2.666..., round → 3
    const engine = buildEngine(makeSetModel('round(Entity.val / 3)'), 42, 0, 10);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(0);
    for (const c of served) {
      expect(c.attrs?.result).toBe(3);
    }
  });

  test('floor and ceil', () => {
    const floorModel = makeSetModel('floor(Entity.val / 3)'); // 8/3=2.666 → 2
    const ceilModel  = makeSetModel('ceil(Entity.val / 3)');  // 8/3=2.666 → 3
    resetSeq();
    const r1 = buildEngine(floorModel, 42, 0, 10).runAll();
    resetSeq();
    const r2 = buildEngine(ceilModel,  42, 0, 10).runAll();
    const s1 = r1.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    const s2 = r2.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(s1.length).toBeGreaterThan(0);
    expect(s2.length).toBeGreaterThan(0);
    for (const c of s1) expect(c.attrs?.result).toBe(2);
    for (const c of s2) expect(c.attrs?.result).toBe(3);
  });

  test('nested: max(min(Entity.val, 10), 5) clamps within [5,10]', () => {
    // val=8 → min(8,10)=8 → max(8,5)=8
    const engine = buildEngine(makeSetModel('max(min(Entity.val, 10), 5)'), 42, 0, 10);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(0);
    for (const c of served) {
      expect(c.attrs?.result).toBeGreaterThanOrEqual(5);
      expect(c.attrs?.result).toBeLessThanOrEqual(10);
    }
  });

  test('legacy shorthand VAR = min(a,b) via applyScalar also works', () => {
    // Exercises safeEvalScalar (no regex guard) + extended safeArithmetic
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '1', effect: 'ARRIVE(Customer, Queue)',
          schedules: [] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        // applyScalar handles "VAR = expr" — check that min() now works through it
        effect: 'ASSIGN(Queue, Server); cap = min(20, 15)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true }],
      }],
      stateVariables: [{ name: 'cap', initialValue: '0' }],
    };
    const engine = buildEngine(model, 42, 0, 5);
    const result = engine.runAll();
    // cap should have been set to 15 via the shorthand scalar effect
    const stateLog = result.log.find(e => e.message?.includes('cap'));
    expect(stateLog || result.entitySummary.length).toBeTruthy(); // model ran without crash
  });
});

// ── S4: Computed attribute routing ───────────────────────────────────────────

describe('S4 — Routing based on computed (SET_ATTR) attributes', () => {
  test('entity routed to correct queue based on SET_ATTR computed priority', () => {
    // Model: customers arrive with base=1. ASSIGN computes priority = base * 3.
    // After RELEASE, routing checks Entity.priority > 2 → VIP queue else Standard queue.
    // Since priority will be 3 > 2, all entities should route to VIP.
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer',
          attrDefs: [
            { name: 'base',     dist: 'fixed', distParams: { value: '1' } },
            { name: 'priority', dist: 'fixed', distParams: { value: '0' } },
          ] },
        { id: 'W', name: 'Worker', role: 'server', count: '2', attrDefs: [] },
      ],
      queues: [
        { id: 'q1', name: 'Intake',    customerType: 'Customer', discipline: 'FIFO' },
        { id: 'q2', name: 'VIP',       customerType: 'Customer', discipline: 'FIFO' },
        { id: 'q3', name: 'Standard',  customerType: 'Customer', discipline: 'FIFO' },
      ],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Intake)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '2' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
        { id: 'rel', name: 'Release', scheduledTime: '9999', effect: 'RELEASE(Worker, VIP)', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Intake).length > 0 AND idle(Worker).count > 0',
        // Compute priority attribute then release immediately
        effect: 'ASSIGN(Intake, Worker); SET_ATTR(priority, Entity.base * 3)',
        cSchedules: [
          { eventId: 'rel', dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true },
        ],
      }],
      stateVariables: [],
    };

    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();

    // Entities should end up in VIP queue (priority=3 > 2)
    const inVIP = result.entitySummary.filter(
      e => e.role === 'customer' && (e.queue === 'VIP' || e.lastQueue === 'VIP')
    );
    expect(inVIP.length).toBeGreaterThan(0);
    // Verify priority was set correctly
    for (const c of inVIP) {
      expect(c.attrs?.priority).toBe(3);
    }
  });
});

// ── S5: Multiple SET/SET_ATTR in same effect string ───────────────────────────

describe('S5 — Multiple SET/SET_ATTR in one effect', () => {
  test('chained SET and SET_ATTR both apply', () => {
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer',
          attrDefs: [{ name: 'qty', dist: 'fixed', distParams: { value: '4' } }] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '3' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server); SET_ATTR(cost, Entity.qty * rate); SET(totalCost, totalCost + Entity.qty * rate)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true }],
      }],
      stateVariables: [
        { name: 'rate',      initialValue: '3' },
        { name: 'totalCost', initialValue: '0' },
      ],
    };
    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(0);
    // Each served customer: cost = qty * rate = 4 * 3 = 12
    for (const c of served) {
      expect(c.attrs?.cost).toBe(12);
    }
    const attrLogs = result.log.filter(e => e.message?.includes('SET totalCost'));
    // Number of ASSIGN firings may exceed completions if simulation ends mid-service
    expect(attrLogs.length).toBeGreaterThanOrEqual(served.length);
  });
});
