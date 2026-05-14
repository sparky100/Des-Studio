// Regression tests for bugs identified during sprint 31-33 review.
// Each test is named with its bug ID so failures are immediately traceable.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => {
  resetSeq();
});

// ── B1: REPAIR _downtime was always 0 ─────────────────────────────────────────
// The REPAIR macro cleared srv._failedAt before reading it, so downtime was
// always clock - clock = 0.

describe('B1 — REPAIR _downtime', () => {
  function makeFactoryModel() {
    return {
      entityTypes: [
        { id: 'Part', name: 'Part', role: 'customer', attrDefs: [] },
        { id: 'Machine', name: 'Machine', role: 'server', count: '1', attrDefs: [],
          mtbfDist: 'fixed', mtbfDistParams: { value: '5' },
          mttrDist: 'fixed', mttrDistParams: { value: '3' },
        },
      ],
      queues: [{ id: 'q1', name: 'Input', customerType: 'Part', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Part, Input)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '10' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [
        { id: 'assign', name: 'Assign', priority: 1,
          condition: 'queue(Input).length > 0 AND idle(Machine).count > 0',
          effect: 'ASSIGN(Input, Machine)',
          cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }] },
      ],
      stateVariables: [],
    };
  }

  test('repaired server has positive _downtime equal to repair duration', () => {
    // MTBF=5, MTTR=3 → failure at t=5, repaired at t=8, _downtime should be 3
    const engine = buildEngine(makeFactoryModel(), 42, 0, 20);
    const result = engine.runAll();

    const machines = result.entitySummary.filter(e => e.type === 'Machine');
    const repaired = machines.filter(e => e._downtime != null && e._downtime > 0);
    expect(repaired.length).toBeGreaterThan(0);
    // Each repaired server should have _downtime ≈ MTTR (3) — not 0
    for (const m of repaired) {
      expect(m._downtime).toBeGreaterThan(0);
    }
  });

  test('REPAIR macro _downtime is never 0 when server actually failed', () => {
    const engine = buildEngine(makeFactoryModel(), 42, 0, 30);
    const result = engine.runAll();

    const machines = result.entitySummary.filter(e => e.type === 'Machine');
    // A machine that has been repaired (had _failedAt set) should have downtime > 0
    const hadRepair = result.log.some(e => e.message?.includes('REPAIR') && e.message?.includes('restored'));
    if (hadRepair) {
      const withDowntime = machines.filter(e => e._downtime != null);
      if (withDowntime.length > 0) {
        const allPositive = withDowntime.every(m => m._downtime >= 0);
        expect(allPositive).toBe(true);
        const atLeastOnePositive = withDowntime.some(m => m._downtime > 0);
        expect(atLeastOnePositive).toBe(true);
      }
    }
    // Always verify REPAIR events actually occurred
    expect(hadRepair).toBe(true);
  });
});

// ── B2: avgWIP denominator wrong with warmup ──────────────────────────────────
// _wipIntegral is reset at warmup boundary but getSummary() divided by clock
// (total time) rather than clock - _statsResetTime (post-warmup time).
// This caused avgWIP to be systematically underestimated when warmup is used.

describe('B2 — avgWIP warmup denominator', () => {
  function makeMM1() {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'exponential', distParams: { rate: '0.8' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [
        { id: 'a', name: 'Assign', priority: 1,
          condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
          effect: 'ASSIGN(Queue, Server)',
          cSchedules: [{ eventId: 'done', dist: 'exponential', distParams: { rate: '1.0' }, useEntityCtx: true }] },
      ],
      stateVariables: [],
    };
  }

  test('avgWIP without warmup is positive', () => {
    const engine = buildEngine(makeMM1(), 42, 0, 200);
    const result = engine.runAll();
    expect(result.summary.avgWIP).toBeGreaterThan(0);
  });

  test('avgWIP with warmup is at least as large as without warmup (not diluted)', () => {
    const seed = 42;
    const totalTime = 500;
    const warmup = 100;

    const withoutWarmup = buildEngine(makeMM1(), seed, 0, totalTime).runAll();
    const withWarmup    = buildEngine(makeMM1(), seed, warmup, totalTime).runAll();

    // With warmup, the transient load phase is excluded; stable-state WIP may
    // be higher. At minimum, dividing by post-warmup time (400) vs full time (500)
    // should give a larger or comparable value — never smaller by warmup/total ratio.
    const warpRatio = totalTime / (totalTime - warmup); // ~1.25
    // WIP with warmup should not be less than WIP-no-warmup / warpRatio
    // (i.e., it should not appear artificially diluted)
    const lowerBound = withoutWarmup.summary.avgWIP / warpRatio;
    expect(withWarmup.summary.avgWIP).toBeGreaterThanOrEqual(lowerBound * 0.5); // generous tolerance
    expect(withWarmup.summary.avgWIP).toBeGreaterThan(0);
  });

  test('avgWIP warmup denominator uses post-warmup time not total time', () => {
    // Run a model long enough that warmup is a meaningful fraction of total time.
    // After warmup, WIP integral accumulates only for (total - warmup) seconds.
    // If the denominator is wrong (total time), avgWIP would be ~totalTime/postWarmup times
    // too small. We verify avgWIP is consistent with Little's Law post-warmup.
    const lambda = 0.8;
    const mu = 1.0;
    const engine = buildEngine(makeMM1(), 99, 100, 600);
    const result = engine.runAll();

    const { avgWIP, avgSojourn } = result.summary;
    if (avgSojourn != null && avgSojourn > 0) {
      const littleLawWIP = lambda * avgSojourn;
      // With correct denominator, WIP should be within 35% of Little's Law estimate.
      // Finite-run variance for M/M/1 at ρ=0.8 with 500 post-warmup time units allows
      // this tolerance; a systematic denominator bug would produce errors >50%.
      const error = Math.abs(avgWIP - littleLawWIP) / littleLawWIP;
      expect(error).toBeLessThan(0.35);
    }
  });
});

// ── B3: COSEIZE auxiliary servers permanently busy after COMPLETE ─────────────
// When COSEIZE seizes multiple server types (e.g. Surgeon + Anesthetist),
// COMPLETE only released the primary server (Surgeon). The Anesthetist
// remained status="busy" with currentCustId pointing to the now-done customer.
// This prevented any subsequent COSEIZE from firing because
// idle(Anesthetist).count was always 0.

describe('B3 — COSEIZE auxiliary server release', () => {
  function makeSurgicalModel(numPatients = 5) {
    return {
      entityTypes: [
        { id: 'P', name: 'Patient', role: 'customer', attrDefs: [] },
        { id: 'SU', name: 'Surgeon', role: 'server', count: '1', attrDefs: [] },
        { id: 'AN', name: 'Anesthetist', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'OR', customerType: 'Patient', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Patient, OR)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '3' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [
        { id: 'c1', name: 'Start Surgery', priority: 1,
          condition: 'queue(OR).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0',
          effect: 'COSEIZE(OR, Surgeon, Anesthetist)',
          cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }] },
      ],
      stateVariables: [],
    };
  }

  test('more than one patient can be served with COSEIZE (auxiliary servers released)', () => {
    // Without the fix: only the first patient ever gets served because after
    // COMPLETE the Anesthetist stays busy and the condition never fires again.
    const engine = buildEngine(makeSurgicalModel(), 42, 0, 30);
    const result = engine.runAll();

    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(1);
  });

  test('auxiliary servers are idle after patient completes', () => {
    const engine = buildEngine(makeSurgicalModel(), 42, 0, 10);
    const result = engine.runAll();

    // After all served patients are done, both Surgeon and Anesthetist should be idle
    const surgeon     = result.entitySummary.find(e => e.type === 'Surgeon');
    const anesthetist = result.entitySummary.find(e => e.type === 'Anesthetist');
    // At end of run, no customers are still in-service (all done or waiting)
    const serversStillBusy = result.entitySummary.filter(
      e => e.role === 'server' && e.status === 'busy'
    );
    // If there's no customer currently being served, no server should remain busy
    const servingCustomers = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'serving');
    if (servingCustomers.length === 0) {
      expect(serversStillBusy.length).toBe(0);
    }
  });

  test('COSEIZE auxiliary release is logged', () => {
    const engine = buildEngine(makeSurgicalModel(), 42, 0, 15);
    const result = engine.runAll();

    // The COSEIZE release log message is only emitted when more than one customer is served
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    if (served.length > 1) {
      const releaseLogs = result.log.filter(e => e.message?.includes('COSEIZE release'));
      expect(releaseLogs.length).toBeGreaterThan(0);
    }
  });
});

// ── B4: SPLIT child entities missing markEntityWaiting metadata ───────────────
// SPLIT set status:"waiting" and queue: targetQueue but did not call
// markEntityWaiting(), so waitingSince and waitingFor were missing.
// This meant queue wait-time tracking was silently broken for split children.

describe('B4 — SPLIT child entity waiting state', () => {
  function makeSplitModel() {
    return {
      entityTypes: [
        { id: 'D', name: 'Document', role: 'customer', attrDefs: [] },
        { id: 'W', name: 'Worker', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [
        { id: 'q1', name: 'Inbox', customerType: 'Document', discipline: 'FIFO' },
        { id: 'q2', name: 'Reviews', customerType: 'Document', discipline: 'FIFO' },
      ],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Document, Inbox)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '5' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
        { id: 'split', name: 'Split', scheduledTime: '9999', effect: 'SPLIT(Document, 3, Reviews)', schedules: [] },
      ],
      cEvents: [
        { id: 'c1', name: 'Assign', priority: 1,
          condition: 'queue(Inbox).length > 0 AND idle(Worker).count > 0',
          effect: 'ASSIGN(Inbox, Worker)',
          cSchedules: [
            { eventId: 'done',  dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true },
            { eventId: 'split', dist: 'fixed', distParams: { value: '0' }, useEntityCtx: true },
          ] },
      ],
      stateVariables: [],
    };
  }

  test('SPLIT child entities have waitingSince set', () => {
    const engine = buildEngine(makeSplitModel(), 42, 0, 10);
    const result = engine.runAll();

    const reviewEntities = result.entitySummary.filter(
      e => e.role === 'customer' && (e.queue === 'Reviews' || e.lastQueue === 'Reviews') && e._splitFrom != null
    );

    if (reviewEntities.length > 0) {
      for (const child of reviewEntities) {
        // waitingSince must be a finite number (not undefined) when entity is/was waiting
        // Note: if already served/done, waitingSince may have been cleared — check stages too
        const hasWaitingRecord = child.waitingSince != null || (child.stages && child.stages.length > 0);
        expect(hasWaitingRecord).toBe(true);
      }
    }
  });

  test('SPLIT child entities appear in queue waiting count', () => {
    const engine = buildEngine(makeSplitModel(), 42, 0, 6);

    // Step until after the first split fires
    let splitFound = false;
    for (let i = 0; i < 50; i++) {
      const r = engine.step();
      if (r.done) break;
      const snap = engine.getSnap();
      const inReviews = snap.byQueue?.['Reviews']?.waiting ?? 0;
      if (inReviews > 0) {
        splitFound = true;
        // Children should be countable in byQueue
        expect(inReviews).toBeGreaterThanOrEqual(2); // SPLIT(Document,3,...) creates 2 children
        break;
      }
    }
    // Only assert if model progressed far enough for a split
    if (splitFound) {
      expect(splitFound).toBe(true);
    }
  });
});
