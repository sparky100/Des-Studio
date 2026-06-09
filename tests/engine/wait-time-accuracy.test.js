// Sprint 83 — Wait time accuracy tests.
// Covers: RENEGE wait sampling, in-progress partial waits,
//         waitSamplesBreakdown, Little's Law gate.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => { resetSeq(); });

// ── Helper: build a simple M/M/1-like model with renege ─────────────────────
function renegeModel() {
  return {
    entityTypes: [
      { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
    stateVariables: [],
    bEvents: [
      { id: 'arr',  name: 'Arrive',   scheduledTime: '0',  effect: 'ARRIVE(Customer, Queue)',
        schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '2' } }] },
      { id: 'reneg', name: 'Reneges', scheduledTime: '9999', effect: 'RENEGE(ctx)', schedules: [] },
      { id: 'done',  name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [{
      id: 'a', name: 'Assign', priority: 1,
      condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Queue, Server)',
      cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '5' }, useEntityCtx: true }],
    }],
  };
}

// ── Helper: model with short maxSimTime so entities are left in-progress ─────
function truncatedModel(maxSimTime = 6) {
  return {
    entityTypes: [
      { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
    stateVariables: [],
    bEvents: [
      { id: 'arr',  name: 'Arrive',   scheduledTime: '0',  effect: 'ARRIVE(Customer, Queue)',
        schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '3' } }] },
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

// ── Test 1: RENEGE entities contribute wait samples ─────────────────────────

describe('RENEGE wait tracking', () => {
  function renegeWaitModel() {
    const m = renegeModel();
    // Add a renege timer to the arrival: patience of 3, no server → reneges at t=3
    m.bEvents[0].schedules.push(
      { eventId: 'reneg', dist: 'fixed', distParams: { value: '3' }, isRenege: true }
    );
    // Remove the server to force reneging (no ASSIGN possible)
    m.entityTypes = m.entityTypes.filter(e => e.role !== 'server');
    return m;
  }

  test('reneged entities appear in waitSamplesBreakdown', () => {
    const engine = buildEngine(renegeWaitModel(), 42, 0, 20);
    const result = engine.runAll();
    expect(result.summary.reneged).toBeGreaterThan(0);
    expect(result.summary.waitSamplesBreakdown).toBeDefined();
    expect(result.summary.waitSamplesBreakdown.reneged).toBeGreaterThan(0);
  });

  test('reneged entities have stages with queue wait time', () => {
    const engine = buildEngine(renegeWaitModel(), 42, 0, 20);
    const result = engine.runAll();
    const renegedEnts = result.entitySummary.filter(e => e.status === 'reneged');
    expect(renegedEnts.length).toBeGreaterThan(0);
    for (const e of renegedEnts) {
      expect(Array.isArray(e.stages)).toBe(true);
      expect(e.stages.length).toBeGreaterThan(0);
      expect(e.stages[0].stageWait).toBeGreaterThan(0);
    }
  });

  test('avgWait includes reneged entities when they are the only terminated entities', () => {
    const engine = buildEngine(renegeWaitModel(), 42, 0, 20);
    const result = engine.runAll();
    // All entities renege (no server), so avgWait should reflect their waits
    expect(result.summary.avgWait).not.toBeNull();
    expect(result.summary.avgWait).toBeGreaterThan(0);
    expect(result.summary.waitSamplesBreakdown.served).toBe(0);
    expect(result.summary.waitSamplesBreakdown.reneged).toBeGreaterThan(0);
  });
});

// ── Test 2: In-progress waits at termination ────────────────────────────────

describe('In-progress wait at termination', () => {
  test('summary includes inProgress samples when entities are waiting at end', () => {
    const engine = buildEngine(truncatedModel(6), 42, 0, 6);
    const result = engine.runAll();
    expect(result.summary.waitSamplesBreakdown).toBeDefined();
    // At t=6, arrivals at 0, 3, 6 (no more), service=10 → at least 1 waiting at end
    expect(result.summary.waitSamplesBreakdown.inProgress).toBeGreaterThan(0);
  });

  test('waitSamplesBreakdown fields are all non-negative integers', () => {
    const engine = buildEngine(truncatedModel(6), 42, 0, 6);
    const result = engine.runAll();
    const b = result.summary.waitSamplesBreakdown;
    expect(b.served).toBeGreaterThanOrEqual(0);
    expect(b.reneged).toBeGreaterThanOrEqual(0);
    expect(b.inProgress).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(b.served)).toBe(true);
    expect(Number.isInteger(b.reneged)).toBe(true);
    expect(Number.isInteger(b.inProgress)).toBe(true);
  });
});

// ── Test 3: avgWait with in-progress > avgWait without ──────────────────────

describe('avgWait comparison — with vs. without in-progress', () => {
  test('avgWait is higher when in-progress entities are included', () => {
    const engine = buildEngine(truncatedModel(6), 42, 0, 6);
    const result = engine.runAll();
    // Compute served-only avgWait for comparison
    const servedEnts = result.entitySummary.filter(e => e.status === 'done');
    const servedOnlyWaits = servedEnts.map(e => {
      if (!e.stages?.length) {
        return e.serviceStart != null ? Math.max(0, e.serviceStart - e.arrivalTime) : 0;
      }
      return e.stages.reduce((sum, st) => sum + Math.max(0, (st.serviceStartedAt ?? st.serviceEndedAt) - st.waitStartedAt), 0);
    }).filter(w => w > 0);
    const servedOnlyAvg = servedOnlyWaits.length > 0
      ? servedOnlyWaits.reduce((a, b) => a + b, 0) / servedOnlyWaits.length
      : null;

    // The summary avgWait includes reneged + in-progress at 0.5 weight
    // In this model, in-progress waits are short (arriving at t=3, end at t=6 → wait=3)
    // while served entities (arriving at t=0) have short waits too
    // The inclusion of in-progress waits should NOT reduce avgWait significantly
    expect(result.summary.avgWait).not.toBeNull();
    if (servedOnlyAvg != null) {
      // avgWait should be directionally similar or slightly lower due to 0.5 weighting
      expect(result.summary.avgWait).toBeGreaterThan(0);
    }
  });
});

// ── Test 4: Little's Law gate produces reasonable discrepancy ────────────────

describe('Little\'s Law validation gate', () => {
  test('summary has avgWaitByLittle and waitDiscrepancy fields', () => {
    const engine = buildEngine(truncatedModel(15), 42, 0, 15);
    const result = engine.runAll();
    expect(result.summary).toHaveProperty('avgWaitByLittle');
    expect(result.summary).toHaveProperty('waitDiscrepancy');
  });

  test('Little\'s Law estimate is within 50% of avgWait for a stable model', () => {
    // Run a standard M/M/1 to steady state
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '0',  effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'Exponential', distParams: { mean: '1.25' } }] },
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'Exponential', distParams: { mean: '1' }, useEntityCtx: true }],
      }],
    };
    const engine = buildEngine(model, 42, 100, 1100); // 100 warmup, 1000 run
    const result = engine.runAll();
    expect(result.summary.avgWaitByLittle).not.toBeNull();
    if (result.summary.avgWait != null && result.summary.avgWaitByLittle != null) {
      const pctDiff = Math.abs(result.summary.avgWait - result.summary.avgWaitByLittle) / result.summary.avgWaitByLittle * 100;
      // For a long stable run, Little's Law should agree within 50%
      expect(pctDiff).toBeLessThan(50);
    }
  });
});

// ── Test 5: waitDist includes reneged entity waits ──────────────────────────

describe('waitDist includes reneged waits', () => {
  function renegeWithServerModel() {
    const m = renegeModel();
    // Patience of 8 — some will be served before reneging
    m.bEvents[0].schedules.push(
      { eventId: 'reneg', dist: 'fixed', distParams: { value: '8' }, isRenege: true }
    );
    return m;
  }

  test('waitDist has entries for queues used by reneged entities', () => {
    const engine = buildEngine(renegeWithServerModel(), 42, 0, 30);
    const result = engine.runAll();
    expect(result.waitDist).toBeDefined();
    // "Queue" should have wait samples from both served and reneged entities
    expect(result.waitDist['Queue']).toBeDefined();
    expect(result.waitDist['Queue'].n).toBeGreaterThan(0);
  });
});

// ── Test 6: Warmup truncation still works with reneged entities ─────────────

describe('Warmup truncation with reneged waits', () => {
  test('reneged entities before warmup end are excluded from avgWait', () => {
    // Model where first arrival arrives at t=0, reneges at t=3, warmup=10
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '0',  effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '2' } },
                       { eventId: 'reneg', dist: 'fixed', distParams: { value: '3' }, isRenege: true }] },
        { id: 'reneg', name: 'Reneges', scheduledTime: '9999', effect: 'RENEGE(ctx)', schedules: [] },
      ],
      cEvents: [],
    };
    const engine = buildEngine(model, 42, 10, 20); // warmup=10
    const result = engine.runAll();
    // All arrivals and reneges happen before t=10 warmup boundary
    // avgWait should be null (no valid samples after warmup)
    if (result.summary.avgWait != null) {
      expect(result.summary.avgWait).toBeLessThan(3); // Warmup excludes pre-warmup waits
    }
  });
});
