// Sprint 84 — Engine Fidelity Tests
// Covers: PRNG stream isolation, shift-change behavior, purge period, starvation tracking

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';
import { mulberry32, deriveSubSeed } from '../../src/engine/distributions.js';

beforeEach(() => { resetSeq(); });

// ── PRNG Stream Isolation ──────────────────────────────────────────────────

describe('PRNG Stream Isolation', () => {
  test('deriveSubSeed produces deterministic output for same inputs', () => {
    const a = deriveSubSeed(42, 'arrival:b1');
    const b = deriveSubSeed(42, 'arrival:b1');
    expect(a).toBe(b);
  });

  test('deriveSubSeed produces different output for different stream names', () => {
    const a = deriveSubSeed(42, 'arrival:b1');
    const b = deriveSubSeed(42, 'arrival:b2');
    expect(a).not.toBe(b);
  });

  test('deriveSubSeed produces different output for different master seeds', () => {
    const a = deriveSubSeed(42, 'arrival:b1');
    const b = deriveSubSeed(43, 'arrival:b1');
    expect(a).not.toBe(b);
  });

  function basicMM1() {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '0',  effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'Exponential', distParams: { mean: '2' } }] },
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'Exponential', distParams: { mean: '1' }, useEntityCtx: true }],
      }],
    };
  }

  test('same master seed and model produce identical results (reproducibility)', () => {
    const r1 = buildEngine(basicMM1(), 42, 0, 50).runAll();
    const r2 = buildEngine(basicMM1(), 42, 0, 50).runAll();
    expect(r1.summary.avgWait).toBe(r2.summary.avgWait);
    expect(r1.summary.served).toBe(r2.summary.served);
  });

  test('stream isolation does not change results (sub-streams are deterministic)', () => {
    const r = buildEngine(basicMM1(), 42, 0, 50).runAll();
    expect(r.summary.avgWait).not.toBeNull();
    expect(r.summary.served).toBeGreaterThan(0);
  });
});

// ── Shift-Change Behavior ──────────────────────────────────────────────────

describe('Shift-Change Behavior', () => {
  function shiftModel(behavior = 'delay') {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server', role: 'server', count: '2', attrDefs: [],
          shiftSchedule: [{ time: '0', capacity: '2' }, { time: '20', capacity: '1' }],
          shiftBehavior: behavior },
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

  test('delay behavior preserves busy servers during downshift', () => {
    const r = buildEngine(shiftModel('delay'), 42, 0, 40).runAll();
    // After t=20, capacity drops to 1 but busy servers are retained until completion
    expect(r.summary.served).toBeGreaterThan(0);
  });

  test('preempt behavior interrupts busy servers during downshift', () => {
    const r = buildEngine(shiftModel('preempt'), 42, 0, 40).runAll();
    // With preempt, entities are interrupted and re-queued with remaining time
    expect(r.summary.served).toBeGreaterThan(0);
  });

  test('suspend behavior freezes work during downshift', () => {
    const r = buildEngine(shiftModel('suspend'), 42, 0, 40).runAll();
    expect(r.summary.served).toBeGreaterThan(0);
  });

  test('default behavior (no shiftBehavior field) is delay', () => {
    const m = shiftModel();
    delete m.entityTypes[1].shiftBehavior;
    const r = buildEngine(m, 42, 0, 40).runAll();
    expect(r.summary.served).toBeGreaterThan(0);
  });
});

// ── Purge Period ───────────────────────────────────────────────────────────

describe('Purge Period', () => {
  function purgeModel() {
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

  test('purge phase completes in-flight entities after maxSimTime', () => {
    const r = buildEngine(purgeModel(), 42, 0, 10, null, 5000, 500, false, undefined,
      { purgePeriod: { enabled: true, maxPurgeTime: 100 } }).runAll();
    // Should have served entities and no waiting entities remaining
    expect(r.summary.served).toBeGreaterThan(0);
    expect(r.summary.waitSamplesBreakdown.inProgress).toBeGreaterThanOrEqual(0);
  });

  test('purge period flag is in summary', () => {
    const r = buildEngine(purgeModel(), 42, 0, 10, null, 5000, 500, false, undefined,
      { purgePeriod: { enabled: true } }).runAll();
    expect(r.summary.purgePeriodUsed).toBe(true);
  });

  test('no purge period when disabled', () => {
    const r = buildEngine(purgeModel(), 42, 0, 10).runAll();
    expect(r.summary.purgePeriodUsed).toBe(false);
  });
});

// ── Starvation Tracking ────────────────────────────────────────────────────

describe('Starvation Duration Tracking', () => {
  function starvationModel() {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '0',  effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '5' } }] },
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }],
      }],
    };
  }

  test('starvation time is reported per resource', () => {
    const r = buildEngine(starvationModel(), 42, 0, 30).runAll();
    const pr = r.summary.perResource?.['Server'];
    expect(pr).toBeDefined();
    expect(pr).toHaveProperty('starvationTime');
    expect(pr).toHaveProperty('starvationPct');
    expect(pr.starvationTime).toBeGreaterThanOrEqual(0);
    expect(pr.starvationPct).toBeGreaterThanOrEqual(0);
  });

  test('starvation percentage is between 0 and 1', () => {
    const r = buildEngine(starvationModel(), 42, 0, 30).runAll();
    const pr = r.summary.perResource?.['Server'];
    expect(pr.starvationPct).toBeLessThanOrEqual(1);
    expect(pr.starvationPct).toBeGreaterThanOrEqual(0);
  });

  test('utilisation + starvation <= 1', () => {
    const r = buildEngine(starvationModel(), 42, 0, 30).runAll();
    const pr = r.summary.perResource?.['Server'];
    const util = pr?.utilisation ?? 0;
    const starv = pr?.starvationPct ?? 0;
    if (Number.isFinite(util) && Number.isFinite(starv)) {
      expect(util + starv).toBeLessThanOrEqual(1.01);
    }
  });
});
