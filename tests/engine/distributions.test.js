import { describe, test, expect } from 'vitest';
import { mulberry32, sample } from '../../src/engine/distributions.js';
import { buildEngine } from '../../src/engine/index.js';

// Tests for seeded PRNG reproducibility (Sprint 1 Task 4).
// These tests fail on the unmodified codebase (mulberry32 is not yet exported
// and buildEngine does not accept a seed parameter).

describe('mulberry32 — seeded PRNG', () => {
  test('same seed produces an identical sequence of 100 values', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  test('different seeds produce different sequences', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(99);
    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  test('all values are in [0, 1)', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('seed 0 and seed 1 produce distinct sequences', () => {
    const s0 = Array.from({ length: 20 }, mulberry32(0));
    const s1 = Array.from({ length: 20 }, mulberry32(1));
    expect(s0).not.toEqual(s1);
  });

  test('same seed used in Exponential sampler produces identical sample sequence', () => {
    const seq1 = Array.from({ length: 50 }, () =>
      sample('Exponential', { mean: '3' }, mulberry32(777))
    );
    const seq2 = Array.from({ length: 50 }, () =>
      sample('Exponential', { mean: '3' }, mulberry32(777))
    );
    expect(seq1).toEqual(seq2);
  });
});

describe('buildEngine — seeded reproducibility', () => {
  // M/M/1 model: Exponential arrivals (mean=2), Fixed service (3).
  // Deterministic enough to verify that same seed → same outcome.
  const m1Model = {
    entityTypes: [
      { id: 'et1', name: 'Customer', role: 'customer', count: '', attrDefs: [] },
      { id: 'et2', name: 'Server', role: 'server', count: '1',
        attrDefs: [{ id: 'a1', name: 'serviceTime', dist: 'Fixed', distParams: { value: '3' } }] },
    ],
    stateVariables: [],
    bEvents: [
      { id: 'b1', name: 'Arrive', scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b1', dist: 'Exponential', distParams: { mean: '2' }, isRenege: false }] },
      { id: 'b2', name: 'Done', scheduledTime: '999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [
      { id: 'c1', name: 'Serve',
        condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [{ id: 'cs1', eventId: 'b2', dist: 'ServerAttr',
                       distParams: { attr: 'serviceTime' }, useEntityCtx: true }] },
    ],
  };

  test('two runs with the same seed produce identical summary.served', () => {
    const r1 = buildEngine(m1Model, 42, 0, 50).runAll();
    const r2 = buildEngine(m1Model, 42, 0, 50).runAll();
    expect(r1.summary.served).toBe(r2.summary.served);
    expect(r1.summary.served).toBeGreaterThan(0);
  });

  test('two runs with the same seed produce identical finalTime', () => {
    const r1 = buildEngine(m1Model, 1234, 0, 50).runAll();
    const r2 = buildEngine(m1Model, 1234, 0, 50).runAll();
    expect(r1.finalTime).toBe(r2.finalTime);
  });

  test('two runs with different seeds produce different outcomes', () => {
    const r1 = buildEngine(m1Model, 1, 0, 50).runAll();
    const r2 = buildEngine(m1Model, 999999, 0, 50).runAll();
    // Inter-arrival times differ; with a fixed time limit, compare outcomes
    // rather than finalTime, which is expected to equal the limit.
    expect({
      total: r1.summary.total,
      served: r1.summary.served,
      avgWait: r1.summary.avgWait,
    }).not.toEqual({
      total: r2.summary.total,
      served: r2.summary.served,
      avgWait: r2.summary.avgWait,
    });
  });
});
