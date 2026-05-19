// tests/benchmarks/golden.test.js
//
// Locked numerical regression fixtures. These tests pin the engine output
// (same seed, same model) to a tight window around the analytical value.
// A failure here means the engine's numerical output has shifted — investigate
// before merging.
//
// Tolerance: M/M/1 ±2%, M/M/c ±5% of analytical value.
// Seed: 42 (fixed — changing the seed changes the expected window).

import { describe, expect, test } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

// ── Shared model builders ────────────────────────────────────────────────────

function mm1Model() {
  return {
    entityTypes: [
      { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_srv',  name: 'Server',   role: 'server',   count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    bEvents: [
      {
        id: 'b_arrive', name: 'Arrival', scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: String(1 / 0.9) } }],
      },
      {
        id: 'b_complete', name: 'Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'c_seize', name: 'Seize',
        condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [
          { eventId: 'b_complete', dist: 'Exponential', distParams: { mean: '1.0' }, useEntityCtx: true },
        ],
      },
    ],
    queues: [],
  };
}

function mmcModel() {
  return {
    entityTypes: [
      { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_srv',  name: 'Server',   role: 'server',   count: 2, attrDefs: [] },
    ],
    stateVariables: [],
    bEvents: [
      {
        id: 'b_arrive', name: 'Arrival', scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: String(1 / 1.6) } }],
      },
      {
        id: 'b_complete', name: 'Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'c_seize', name: 'Seize',
        condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [
          { eventId: 'b_complete', dist: 'Exponential', distParams: { mean: '1.0' }, useEntityCtx: true },
        ],
      },
    ],
    queues: [],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function runUntilServed(model, targetServed, seed, warmup) {
  const engine = buildEngine(model, seed, 999999);
  let steps = 0;
  while (steps < 500000) {
    const { done } = engine.step();
    steps++;
    if (done) break;
    if (steps % 50 === 0 && engine.getSnap().served >= targetServed) break;
  }
  const snap = engine.getSnap();
  const allDone = snap.entities
    .filter(e => e.role !== 'server' && e.status === 'done')
    .sort((a, b) => a.arrivalTime - b.arrivalTime);
  const steadyDone = allDone.slice(warmup);
  const waits = steadyDone.map(e => (e.serviceStart || 0) - e.arrivalTime);
  return waits.reduce((a, b) => a + b, 0) / waits.length;
}

// ── M/M/1 golden fixture ─────────────────────────────────────────────────────
// λ=0.9, μ=1.0, ρ=0.9  Analytical Wq = 9.0
// Seed 42, N_SERVED=500, N_WARMUP=200
// Locked window: 8.0 ≤ mean wait ≤ 10.0  (±~11% of analytical — wide enough for
//   the sample size of 300 but narrow enough to catch engine regressions)

describe('M/M/1 golden fixture (seed=42, λ=0.9, μ=1.0)', () => {
  const ANALYTICAL = 9.0;
  const SEED = 42;
  const N_SERVED = 500;
  const N_WARMUP = 200;

  test('mean queue wait is within 2% of analytical value (9.0)', () => {
    const meanWait = runUntilServed(mm1Model(), N_SERVED, SEED, N_WARMUP);
    const pctError = Math.abs(meanWait - ANALYTICAL) / ANALYTICAL;
    expect(pctError).toBeLessThanOrEqual(0.02);
  });

  test('mean queue wait is pinned to window 8.0–10.0 (regression lock)', () => {
    const meanWait = runUntilServed(mm1Model(), N_SERVED, SEED, N_WARMUP);
    expect(meanWait).toBeGreaterThanOrEqual(8.0);
    expect(meanWait).toBeLessThanOrEqual(10.0);
  });
});

// ── M/M/c golden fixture ─────────────────────────────────────────────────────
// λ=1.6, μ=1.0, c=2, ρ=0.8  Erlang-C Wq ≈ 1.7778
// Seed 42, N_SERVED=2000, N_WARMUP=500
// Locked window: 1.5 ≤ mean wait ≤ 2.1  (±~18% of analytical — appropriate for
//   a shorter Erlang-C queue; tighter than 5% tolerance on small samples)

describe('M/M/c golden fixture (seed=42, λ=1.6, μ=1.0, c=2)', () => {
  const ANALYTICAL = 1.7778;
  const SEED = 42;
  const N_SERVED = 2000;
  const N_WARMUP = 500;

  test('mean queue wait is within 5% of Erlang-C analytical value (1.7778)', () => {
    const meanWait = runUntilServed(mmcModel(), N_SERVED, SEED, N_WARMUP);
    const pctError = Math.abs(meanWait - ANALYTICAL) / ANALYTICAL;
    expect(pctError).toBeLessThanOrEqual(0.05);
  });

  test('mean queue wait is pinned to window 1.5–2.1 (regression lock)', () => {
    const meanWait = runUntilServed(mmcModel(), N_SERVED, SEED, N_WARMUP);
    expect(meanWait).toBeGreaterThanOrEqual(1.5);
    expect(meanWait).toBeLessThanOrEqual(2.1);
  });
});
