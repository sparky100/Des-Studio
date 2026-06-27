// tests/engine/renege-auto.test.js — F86.4: queue-level renegeDist auto-renege
//
// `attemptQueueJoin()` schedules an auto-renege timer (RENEGE(ctx)) for any
// entity that joins a queue with `renegeDist` set (src/engine/entities.js,
// scheduleAutoRenege, called at the centralized join chokepoint). This is the
// queue-level mechanism — distinct from, and simpler than, the manual
// `isRenege` B-event pattern. It has had zero behavioral coverage: only a
// schema round-trip test existed (tests/db/models.test.js). These tests verify
// it actually fires identically regardless of which macro delivered the entity
// to the queue (ARRIVE, RELEASE-routing, BATCH, SPLIT), and that the RENEGE
// macro's own status guard makes a stale timer harmless once an entity has
// already been served.
import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

describe('renegeDist — auto-renege fires via ARRIVE', () => {
  const model = {
    entityTypes: [
      { id: 'et1', name: 'Customer', role: 'customer', attrDefs: [] },
    ],
    queues: [
      { id: 'q1', name: 'WaitQueue', customerType: 'Customer', discipline: 'FIFO',
        renegeDist: 'Fixed', renegeDistParams: { value: '5' } },
    ],
    bEvents: [
      { id: 'b1', name: 'Arrival', scheduledTime: '0', effect: 'ARRIVE(Customer, WaitQueue)', schedules: [] },
    ],
    cEvents: [],
    stateVariables: [],
  };

  test('an entity with no server ever available reneges after the configured delay', () => {
    const r = buildEngine(model, 1, 0, 20).runAll();
    const cust = r.snap.entities.find(e => e.role === 'customer');
    expect(cust.status).toBe('reneged');
    expect(cust.renegeTime).toBeCloseTo(5, 5);
    expect(r.summary.reneged).toBe(1);
  });
});

describe('renegeDist — auto-renege is a harmless no-op once the entity is served', () => {
  const model = {
    entityTypes: [
      { id: 'et1', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'et2', name: 'Server', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [
      { id: 'q1', name: 'WaitQueue', customerType: 'Customer', discipline: 'FIFO',
        renegeDist: 'Fixed', renegeDistParams: { value: '5' } },
    ],
    bEvents: [
      { id: 'b1', name: 'Arrival', scheduledTime: '0', effect: 'ARRIVE(Customer, WaitQueue)', schedules: [] },
      { id: 'b2', name: 'Done', scheduledTime: '999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [
      { id: 'c1', name: 'Serve', condition: 'queue(WaitQueue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [{ id: 'cs1', eventId: 'b2', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }] },
    ],
  };

  test('entity is served before the renege timer fires — final status is completed, not reneged', () => {
    const r = buildEngine(model, 1, 0, 20).runAll();
    const cust = r.snap.entities.find(e => e.role === 'customer');
    expect(cust.status).toBe('done');
    expect(r.summary.reneged).toBe(0);
    // The stale auto-renege FEL entry (scheduled at join time, t=0+5=5) still
    // fires at t=5, but fireBEvent()'s `_isRenege` reneging guard (phases.js)
    // short-circuits before the RENEGE macro even runs, since the entity is
    // already 'done' by then (served at t=0, completes t=1).
    const skipMsg = r.log.some(e => typeof e.message === 'string' && e.message.includes('already done'));
    expect(skipMsg).toBe(true);
  });
});

describe('renegeDist — auto-renege fires for an entity re-queued via RELEASE routing', () => {
  // Stage 1: Customer is served briefly by Server1, then RELEASE(Server1, WaitQueue2)
  // routes it into a *second* queue that has renegeDist set. No second-stage server
  // exists, so it must renege from WaitQueue2 — proving the timer fires for entities
  // that arrive at a renegeDist queue via re-queue, not just a fresh ARRIVE.
  const model = {
    entityTypes: [
      { id: 'et1', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'et2', name: 'Server1', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [
      { id: 'q1', name: 'WaitQueue1', customerType: 'Customer', discipline: 'FIFO' },
      { id: 'q2', name: 'WaitQueue2', customerType: 'Customer', discipline: 'FIFO',
        renegeDist: 'Fixed', renegeDistParams: { value: '4' } },
    ],
    bEvents: [
      { id: 'b1', name: 'Arrival', scheduledTime: '0', effect: 'ARRIVE(Customer, WaitQueue1)', schedules: [] },
      { id: 'b2', name: 'Stage1Done', scheduledTime: '999', effect: 'RELEASE(Server1, WaitQueue2)', schedules: [] },
    ],
    cEvents: [
      { id: 'c1', name: 'Serve', condition: 'queue(WaitQueue1).length > 0 AND idle(Server1).count > 0',
        effect: 'ASSIGN(Customer, Server1)',
        cSchedules: [{ id: 'cs1', eventId: 'b2', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }] },
    ],
  };

  test('entity reneges from the second-stage queue after the RELEASE re-queue', () => {
    const r = buildEngine(model, 1, 0, 20).runAll();
    const cust = r.snap.entities.find(e => e.role === 'customer');
    expect(cust.status).toBe('reneged');
    // Served t=0→1 (Stage1Done at t=1), re-queued into WaitQueue2 at t=1, renege delay 4 → t=5.
    expect(cust.renegeTime).toBeCloseTo(5, 5);
  });
});

describe('renegeDist — auto-renege fires for the synthetic BATCH parent', () => {
  // BATCH() re-joins its synthetic parent into the *same* named queue it batched
  // from (src/engine/macros.js BATCH apply: attemptQueueJoin(parent, queueName, ...)).
  // If that queue has renegeDist set, the parent — not the (now-removed) original
  // children — is the entity the timer must act on.
  const model = {
    entityTypes: [
      { id: 'et1', name: 'Customer', role: 'customer', attrDefs: [] },
    ],
    queues: [
      { id: 'q1', name: 'BatchQueue', customerType: 'Customer', discipline: 'FIFO',
        renegeDist: 'Fixed', renegeDistParams: { value: '3' } },
    ],
    bEvents: [
      { id: 'b1', name: 'Arrival1', scheduledTime: '0',   effect: 'ARRIVE(Customer, BatchQueue)', schedules: [] },
      { id: 'b2', name: 'Arrival2', scheduledTime: '0.1', effect: 'ARRIVE(Customer, BatchQueue)', schedules: [] },
    ],
    cEvents: [
      { id: 'c1', name: 'Batch', condition: 'queue(BatchQueue).length >= 2',
        effect: 'BATCH(BatchQueue, 2)', cSchedules: [] },
    ],
  };

  test('the batch parent reneges from BatchQueue, not either original child', () => {
    const r = buildEngine(model, 1, 0, 20).runAll();
    const parent = r.snap.entities.find(e => e.role === 'batch');
    expect(parent).toBeDefined();
    expect(parent.status).toBe('reneged');
    // Batched at t=0.1, renege delay 3 → t=3.1.
    expect(parent.renegeTime).toBeCloseTo(3.1, 5);
    // Original children were spliced out of `entities` entirely by BATCH —
    // their own (now-orphaned) auto-renege timers fire as harmless no-ops
    // since findEntityById can no longer find them.
    expect(r.snap.entities.some(e => e.role === 'customer')).toBe(false);
  });
});

describe('renegeDist — auto-renege fires for SPLIT clones', () => {
  // Each SPLIT clone independently goes through attemptQueueJoin into the target
  // queue (src/engine/macros.js SPLIT apply). If that queue has renegeDist set,
  // each surviving clone gets its own independent timer.
  //
  // SPLIT does not change the context entity's own status/queue, so it must be
  // triggered once (from a "serving" context via a cSchedule-fired B-event, not
  // a C-event re-evaluated every pass) — otherwise a queue-length condition would
  // stay true forever and SPLIT would refire unboundedly.
  const model = {
    entityTypes: [
      { id: 'et1', name: 'Order', role: 'customer', attrDefs: [] },
      { id: 'et2', name: 'ProcServer', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [
      { id: 'q1', name: 'SourceQueue', customerType: 'Order', discipline: 'FIFO' },
      { id: 'q2', name: 'SplitQueue', customerType: 'Order', discipline: 'FIFO',
        renegeDist: 'Fixed', renegeDistParams: { value: '2' } },
    ],
    bEvents: [
      { id: 'b1', name: 'Arrival', scheduledTime: '0', effect: 'ARRIVE(Order, SourceQueue)', schedules: [] },
      { id: 'b2', name: 'SplitEvent', scheduledTime: '999', effect: 'SPLIT(Order, 3, SplitQueue)', schedules: [] },
    ],
    cEvents: [
      { id: 'c1', name: 'Assign', condition: 'queue(SourceQueue).length > 0 AND idle(ProcServer).count > 0',
        effect: 'ASSIGN(Order, ProcServer)',
        cSchedules: [{ id: 'cs1', eventId: 'b2', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }] },
    ],
  };

  test('all SPLIT clones in the renegeDist queue renege after the configured delay', () => {
    const r = buildEngine(model, 1, 0, 20).runAll();
    const clones = r.snap.entities.filter(e => e.role === 'customer' && e._splitFrom != null);
    expect(clones.length).toBe(2);
    for (const clone of clones) {
      expect(clone.status).toBe('reneged');
      // Assigned at t=0, SPLIT fires at t=0+1=1, renege delay 2 → t=3.
      expect(clone.renegeTime).toBeCloseTo(3, 5);
    }
  });
});
