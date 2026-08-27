// Event-scheduling and server-lifecycle correctness regressions.
// Merged from Sprint 24 and Sprint 36's correctness suites, which had
// substantially overlapping coverage (both hardened the same defects
// independently) — see each test for its origin. Covers: FEL events past
// t=900, Phase C truncation, reneging-timer context binding, stale COMPLETE
// on a waiting entity, serviceStart=0 remaining-service calculation, and
// shift-capacity busy-server retirement.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { fireBEvent } from '../../src/engine/phases.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => { resetSeq(); });

// ── H5 / Sprint 24: no FEL cap at t=900 ──────────────────────────────────────

describe('No FEL cap at t=900', () => {
  test('does not discard initially scheduled B-events after t=900', () => {
    const model = {
      entityTypes: [],
      stateVariables: [{ id: 'count', name: 'count', initialValue: '0' }],
      queues: [],
      bEvents: [
        { id: 'late', name: 'Late Event', scheduledTime: '1000', effect: 'count++', schedules: [] },
      ],
      cEvents: [],
    };

    const result = buildEngine(model, 1, 0, 1200).runAll();
    expect(result.finalTime).toBe(1000);
    expect(result.snap.scalars.count).toBe(1);
  });
});

// ── Sprint 24: Phase C truncation surfaces on the run result ────────────────

describe('Phase C truncation reporting', () => {
  test('surfaces Phase C truncation on the run result and summary', () => {
    const model = {
      entityTypes: [],
      stateVariables: [{ id: 'x', name: 'x', initialValue: '0' }],
      queues: [],
      bEvents: [
        { id: 'init', name: 'Init', scheduledTime: '0', effect: '', schedules: [] },
      ],
      cEvents: [
        { id: 'loop', name: 'Always True', priority: 1, condition: 'x >= 0', effect: 'x++', cSchedules: [] },
      ],
    };

    const result = buildEngine(model, 1, 0, null, null, 10, 3).runAll();
    expect(result.phaseCTruncated).toBe(true);
    expect(result.summary.phaseCTruncated).toBe(true);
    expect(result.summary.maxCPasses).toBe(3);
    expect(result.warnings.some(message => message.includes('Phase C truncated after 3 passes'))).toBe(true);
  });
});

// ── Sprint 24: reneging timer binds to the arrival context (unit-level) ─────

describe('Reneging timer context binding', () => {
  test('binds reneging timers to the current arrival context, not global queue order', () => {
    const entities = [
      { id: 99, type: 'Customer', role: 'customer', status: 'waiting', queue: 'Main', arrivalTime: 999, attrs: {}, stages: [] },
    ];
    const ctx = {
      entities,
      state: { __served: 0, __reneged: 0 },
      model: {
        entityTypes: [{ id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] }],
        queues: [{ id: 'main', name: 'Main', discipline: 'FIFO' }],
        bEvents: [
          { id: 'arrival', name: 'Arrival', effect: 'ARRIVE(Customer, Main)' },
          { id: 'renege', name: 'Abandon', effect: 'RENEGE(ctx)' },
        ],
      },
      clock: 0,
      nextId: (() => {
        let id = 0;
        return () => ++id;
      })(),
      rng: () => 0.5,
      helpers: { waitingOf: () => [], idleOf: () => [], busyOf: () => [] },
      warnings: [],
      incEventCount: () => {},
    };
    const ev = {
      id: 'arrival',
      name: 'Arrival',
      effect: 'ARRIVE(Customer, Main)',
      schedules: [{ eventId: 'renege', isRenege: true, dist: 'Fixed', distParams: { value: '5' } }],
    };

    const { felEntries } = fireBEvent(ev, ctx);
    expect(felEntries[0]._contextCustId).toBe(1);
    expect(felEntries[0]._contextCustId).not.toBe(99);
  });
});

// ── H2 / Sprint 36: Reneging timer binds to context customer (integration) ──

describe('H2 — Reneging timer binding to correct entity', () => {
  test('renege timer fires only for the entity that arrived, not a later entity', () => {
    // Two arrivals: first at t=0 (renege patience=3), second at t=1.
    // The renege timer for entity 1 should not accidentally target entity 2.
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '0', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        {
          id: 'arr1', name: 'Arrive1', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [
            { eventId: 'arr2', dist: 'fixed', distParams: { value: '1' } },
            { eventId: 'renege', dist: 'fixed', distParams: { value: '3' }, isRenege: true },
          ],
        },
        { id: 'arr2',   name: 'Arrive2', scheduledTime: '9999', effect: 'ARRIVE(Customer, Queue)', schedules: [] },
        { id: 'renege', name: 'Renege',  scheduledTime: '9999', effect: 'RENEGE(ctx)', schedules: [] },
      ],
      cEvents: [],
    };
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();
    const reneged  = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'reneged');
    const waiting  = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'waiting');
    // Entity 1 (arrived at t=0) should renege at t=3. Entity 2 (arrived t=1) should still be waiting.
    expect(reneged).toHaveLength(1);
    expect(waiting).toHaveLength(1);
  });

  test('two independent renege timers each fire for their own entity', () => {
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '0', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        {
          id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [
            { eventId: 'arr',    dist: 'fixed', distParams: { value: '2' } },
            { eventId: 'renege', dist: 'fixed', distParams: { value: '5' }, isRenege: true },
          ],
        },
        { id: 'renege', name: 'Renege', scheduledTime: '9999', effect: 'RENEGE(ctx)', schedules: [] },
      ],
      cEvents: [],
    };
    // 3 arrivals (t=0, t=2, t=4), each with renege timer (t=5, t=7, t=9). Sim ends at t=10.
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();
    const reneged = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'reneged');
    // All 3 should renege — each to their own timer, not all to the last entity
    expect(reneged).toHaveLength(3);
    expect(result.summary.reneged).toBe(3);
  });
});

// ── H3 / Sprint 36: COMPLETE() rejects a non-batch waiting entity ───────────
// Sprint 24 had a near-identical single-test check for this (buildEngine
// seed=1, badComplete at t=1, maxSimTime=5); this pair is the stronger,
// better-documented version — same behaviour, so the Sprint 24 copy was
// dropped rather than kept alongside it.

describe('H3 — COMPLETE does not process waiting entities', () => {
  test('COMPLETE fired against a waiting customer is skipped and logged', () => {
    // Fire COMPLETE at t=5 when entity is waiting (no server ever assigned).
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)', schedules: [] },
        { id: 'done', name: 'Complete', scheduledTime: '5', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [],
    };
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();
    const waiting = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'waiting');
    // Entity must still be waiting — COMPLETE should have been skipped
    expect(waiting).toHaveLength(1);
    expect(result.summary.served).toBe(0);
    const skipLog = result.log.filter(e => e.message?.includes('COMPLETE skipped'));
    expect(skipLog.length).toBeGreaterThan(0);
  });

  test('served count is not incremented when COMPLETE is skipped for a waiting entity', () => {
    const model = {
      entityTypes: [{ id: 'C', name: 'Customer', role: 'customer', attrDefs: [] }],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)', schedules: [] },
        { id: 'done', name: 'Complete', scheduledTime: '3', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [],
    };
    const engine = buildEngine(model, 42, 0, 10);
    const { summary } = engine.runAll();
    expect(summary.served).toBe(0);
    expect(summary.reneged).toBe(0);
  });
});

// ── Sprint 24: serviceStart=0 — base-case duration computation ──────────────

describe('serviceStart=0 duration computation (base case)', () => {
  test('computes service duration correctly when serviceStart is zero', () => {
    const model = {
      entityTypes: [
        { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'srv', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: 'main', name: 'Main', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arrive', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Main)', schedules: [] },
        { id: 'complete', name: 'Complete', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'assign',
        name: 'Assign',
        priority: 1,
        condition: 'queue(Main).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Main, Server)',
        cSchedules: [{ eventId: 'complete', dist: 'Fixed', distParams: { value: '3' }, useEntityCtx: true }],
      }],
    };

    const result = buildEngine(model, 1, 0, 10).runAll();
    expect(result.summary.avgSvc).toBe(3);
    expect(result.entitySummary.find(entity => entity.type === 'Customer')?.stages[0].stageService).toBe(3);
  });
});

// ── H4 / Sprint 36: serviceStart=0 remaining-service calculation under PREEMPT/FAIL ─
// Distinct from the base case above: these cover the remaining-service
// recalculation when a customer's service (which itself started at t=0) is
// interrupted and later resumed, not the simple assign-then-complete path.

describe('H4 — serviceStart=0 remaining-service calculation', () => {
  function makePreemptModel(preemptAt) {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '0',  effect: 'ARRIVE(Customer, Queue)', schedules: [] },
        { id: 'pre',  name: 'Preempt',  scheduledTime: String(preemptAt), effect: 'PREEMPT(Server)', schedules: [] },
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '10' }, useEntityCtx: true }],
      }],
    };
  }

  test('customer starting service at t=0 preempted at t=3 has 7 remaining service', () => {
    // ASSIGN fires at t=0, COMPLETE scheduled at t=10. PREEMPT at t=3.
    // Correct remaining = 10 - (3 - 0) = 7. Bug: 10 - (3 - 3) = 10.
    const engine = buildEngine(makePreemptModel(3), 42, 0, 20);
    const result = engine.runAll();
    // After preempt the customer re-queues and, once re-assigned, completes with residual service.
    // The key assertion: no entity should show a sojourn time > 15 (which would happen if
    // remaining service was wrongly set to 10 instead of 7).
    const preempted = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    // At least one entity should have completed
    expect(preempted.length).toBeGreaterThanOrEqual(1);
    // Sojourn should be ≥ 10 (full service) but not inflated by wrong remaining
    const sojournTimes = preempted.map(e => e.sojournTime);
    // With correct remaining=7: reassigned at t=3, completes at t=10 → sojourn=10
    // With bug remaining=10: reassigned at t=3, completes at t=13 → sojourn=13
    expect(Math.max(...sojournTimes)).toBeLessThan(12);
  });

  test('FAIL at t=0 on a server whose customer started at t=0 yields correct remaining service', () => {
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',  scheduledTime: '0',    effect: 'ARRIVE(Customer, Queue)', schedules: [] },
        { id: 'fail', name: 'Fail',    scheduledTime: '2',    effect: 'FAIL(Server)', schedules: [] },
        { id: 'rep',  name: 'Repair',  scheduledTime: '4',    effect: 'REPAIR(Server)', schedules: [] },
        { id: 'done', name: 'Done',    scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '10' }, useEntityCtx: true }],
      }],
    };
    // Assign at t=0, service=10 → COMPLETE at t=10. FAIL at t=2 (2 elapsed of 10 → 8 remaining).
    // Repair at t=4 → re-assign at t=4 → COMPLETE at t=12.
    // Sojourn = 12. With bug (remaining=10 instead of 8): COMPLETE at t=14, sojourn=14.
    const engine = buildEngine(model, 42, 0, 30);
    const result = engine.runAll();
    const done = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(done.length).toBeGreaterThanOrEqual(1);
    // Correct sojourn ≤ 13; buggy sojourn would be 15
    expect(Math.max(...done.map(e => e.sojournTime))).toBeLessThan(14);
  });
});

// ── Sprint 24: shift-downshift busy-server retirement (2→1, precise assertions) ─
// Sprint 36's M1 had a near-identical first test for this exact 2→1 scenario
// with weaker assertions (only checked the warning-log count); this version
// additionally pins the final server total and the reconciliation log
// message, so it was kept and the Sprint 36 copy dropped. Sprint 36's second
// M1 test (3→1, a different scale) is distinct and kept below.

describe('Shift-capacity busy-server retirement after completion', () => {
  test('busy servers retained by a downshift are retired after completion', () => {
    const model = {
      entityTypes: [
        { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
        {
          id: 'srv',
          name: 'Server',
          role: 'server',
          count: '1',
          attrDefs: [],
          shiftSchedule: [
            { time: '0', capacity: '2' },
            { time: '1', capacity: '1' },
          ],
        },
      ],
      stateVariables: [],
      queues: [{ id: 'main', name: 'Main', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arrive1', name: 'Arrive 1', scheduledTime: '0', effect: 'ARRIVE(Customer, Main)', schedules: [] },
        { id: 'arrive2', name: 'Arrive 2', scheduledTime: '0', effect: 'ARRIVE(Customer, Main)', schedules: [] },
        { id: 'complete', name: 'Complete', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'assign',
        name: 'Assign',
        priority: 1,
        condition: 'queue(Main).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Main, Server)',
        cSchedules: [{ eventId: 'complete', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }],
      }],
    };

    const result = buildEngine(model, 1, 0, 10).runAll();
    expect(result.snap.byType.Server.total).toBe(1);
    expect(result.summary.served).toBe(2);
    expect(result.log.some(entry => entry.message.includes('retained 1 busy server'))).toBe(true);
    expect(result.log.some(entry => entry.message.includes('Server capacity reconciliation'))).toBe(true);
  });
});

// ── M1 / Sprint 36: shift-downshift retirement at a different scale (3→1) ───

describe('M1 — Shift-capacity busy-server retirement after completion', () => {
  test('server count reaches target after capacity reduction and completions', () => {
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '3', attrDefs: [],
          shiftSchedule: [{ time: 0, capacity: 3 }, { time: 2, capacity: 1 }] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '0.5' } }] },
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '4' }, useEntityCtx: true }],
      }],
    };
    const engine = buildEngine(model, 42, 0, 40);
    const result = engine.runAll();
    // Simulation should complete normally with served customers > 0
    expect(result.summary.served).toBeGreaterThan(0);
    // Server entities in final state should not wildly exceed target of 1
    const activeServers = result.entitySummary.filter(
      e => e.role === 'server' && (e.status === 'idle' || e.status === 'busy' || e.status === 'serving')
    );
    expect(activeServers.length).toBeLessThanOrEqual(2); // at most 1 excess retained busy server
  });
});
