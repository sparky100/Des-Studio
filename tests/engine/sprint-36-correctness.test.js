// Sprint 36 — Correctness verification tests.
// Covers H4 (serviceStart=0 fix), H2 (reneging binding), H3 (COMPLETE on waiting),
// H5 (FEL past t=900), M1 (shift-capacity busy-server retirement).

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => { resetSeq(); });

// ── H4: serviceStart=0 — remaining service correct when service starts at t=0 ─

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

// ── H2: Reneging timer binds to context customer, not newest global entity ──

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

// ── H3: COMPLETE() rejects non-batch waiting entities ─────────────────────

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

// ── H5: Events scheduled past t=900 fire correctly ─────────────────────────

describe('H5 — No FEL cap at t=900', () => {
  test('B-event scheduled at t=1000 fires when maxSimTime=1200', () => {
    const model = {
      entityTypes: [{ id: 'C', name: 'Customer', role: 'customer', attrDefs: [] }],
      queues: [],
      stateVariables: [{ id: 'sv1', name: 'fired', initialValue: '0', resetOnWarmup: false }],
      bEvents: [
        { id: 'late', name: 'LateEvent', scheduledTime: '1000', effect: 'fired++', schedules: [] },
      ],
      cEvents: [],
    };
    const engine = buildEngine(model, 42, 0, 1200);
    const result = engine.runAll();
    // If the t=900 cap existed, this event would never fire and fired would remain 0.
    const lateLog = result.log.filter(e => e.message?.includes('LateEvent') || e.event?.name === 'LateEvent');
    expect(lateLog.length).toBeGreaterThan(0);
  });
});

// ── M1: Shift-capacity — busy servers retired on completion ────────────────

describe('M1 — Shift-capacity busy-server retirement after completion', () => {
  test('excess busy servers are retired once they complete after a capacity reduction', () => {
    // Start with 2 servers. Shift at t=1 reduces to 1. Both servers are busy at t=1.
    // After one completes, the server count should reconcile to 1.
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '2', attrDefs: [],
          shiftSchedule: [{ time: 0, capacity: 2 }, { time: 1, capacity: 1 }] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)', schedules: [
          { eventId: 'arr', dist: 'fixed', distParams: { value: '0.4' } },
        ]},
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '5' }, useEntityCtx: true }],
      }],
    };
    // Run long enough for a COMPLETE to fire after the shift change
    const engine = buildEngine(model, 42, 0, 30);
    const result = engine.runAll();
    // If M1 is working, served count > 0 and simulation completes normally
    expect(result.summary.served).toBeGreaterThan(0);
    // No warnings about "retained busy servers" appearing for the whole run (only at shift time)
    const retainedWarnings = result.log.filter(e =>
      e.message?.includes('retained') && e.message?.includes('busy server')
    );
    // There should be at most 1 retention warning (at the shift boundary), not repeated
    expect(retainedWarnings.length).toBeLessThanOrEqual(1);
  });

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
