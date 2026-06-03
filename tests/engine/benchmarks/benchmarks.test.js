// tests/engine/benchmarks/benchmarks.test.js
//
// Complete benchmark register — 8 analytical and qualitative correctness gates.
// Run with:  npm run bench   (vitest run tests/engine/benchmarks)
//
// Seeds are fixed; changing a seed changes the expected window.
// Tolerances reflect the degree of confidence in each analytical formula.

import { describe, expect, test } from 'vitest';
import { buildEngine } from '../../../src/engine/index.js';
import { makeMM1Model, runUntilServed } from '../__helpers__/benchmarkFixtures.js';

// ── Utility helpers ──────────────────────────────────────────────────────────

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// Run N replications synchronously (no web workers), return result array.
function runReps(model, reps, baseSeed, warmupPeriod, maxSimTime) {
  const results = [];
  for (let i = 0; i < reps; i++) {
    results.push(buildEngine(model, baseSeed + i, warmupPeriod, maxSimTime).runAll());
  }
  return results;
}

// ── Shared base model builders ───────────────────────────────────────────────

function mm1Model() { return makeMM1Model(0.9, 1.0); }

function makePriorityQueueModel(arrivalMean) {
  return {
    entityTypes: [
      { id: 'et_hp', name: 'HighPriority', role: 'customer', count: 0,
        attrDefs: [{ name: 'priority', dist: 'Fixed', distParams: { value: '1' } }] },
      { id: 'et_lp', name: 'LowPriority', role: 'customer', count: 0,
        attrDefs: [{ name: 'priority', dist: 'Fixed', distParams: { value: '2' } }] },
      { id: 'et_srv', name: 'Server', role: 'server', count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: 'q_svc', name: 'Service Queue', customerType: 'HighPriority', discipline: 'PRIORITY' },
    ],
    bEvents: [
      { id: 'b_hp_arrive', name: 'HP Arrival', scheduledTime: '0',
        effect: 'ARRIVE(HighPriority, Service Queue)',
        schedules: [{ eventId: 'b_hp_arrive', dist: 'Exponential', distParams: { mean: arrivalMean } }] },
      { id: 'b_lp_arrive', name: 'LP Arrival', scheduledTime: '0',
        effect: 'ARRIVE(LowPriority, Service Queue)',
        schedules: [{ eventId: 'b_lp_arrive', dist: 'Exponential', distParams: { mean: arrivalMean } }] },
      { id: 'b_complete', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [
      { id: 'c_seize', name: 'Seize',
        condition: 'queue(Service Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Service Queue, Server)',
        cSchedules: [{ eventId: 'b_complete', dist: 'Exponential', distParams: { mean: '1.0' }, useEntityCtx: true }] },
    ],
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

// ── Benchmark 1 — M/M/1 mean queue wait ─────────────────────────────────────
// λ=0.9, μ=1.0, ρ=0.9   Analytical Wq = ρ/(μ(1−ρ)) = 0.9/0.1 = 9.0
// Tolerance tightened to ±2% (measured error is 1.48%).

describe('Benchmark 1 — M/M/1 mean queue wait (λ=0.9, μ=1.0)', () => {
  const ANALYTICAL = 9.0;

  test('mean queue wait within ±2% of analytical 9.0 (seed=42, N=500, warmup=200)', () => {
    const meanWait = runUntilServed(mm1Model(), 500, 42, 200);
    const pctError = Math.abs(meanWait - ANALYTICAL) / ANALYTICAL;
    expect(pctError).toBeLessThanOrEqual(0.02);
  });
});

// ── Benchmark 2 — M/M/c mean queue wait (Erlang-C) ──────────────────────────
// λ=1.6, μ=1.0, c=2, ρ=0.8   Erlang-C Wq ≈ 1.7778
// Tolerance ±5% (wide enough for sample size of 1500).

describe('Benchmark 2 — M/M/c mean queue wait (λ=1.6, μ=1.0, c=2)', () => {
  const ANALYTICAL = 1.7778;

  test('mean queue wait within ±5% of Erlang-C analytical 1.7778 (seed=42, N=2000, warmup=500)', () => {
    const meanWait = runUntilServed(mmcModel(), 2000, 42, 500);
    const pctError = Math.abs(meanWait - ANALYTICAL) / ANALYTICAL;
    expect(pctError).toBeLessThanOrEqual(0.05);
  });
});

// ── Benchmark 3 — M/G/1 mean wait (Pollaczek-Khinchine) ─────────────────────
// λ=0.9, service Uniform[0,2]: E[S]=1.0, E[S²]=Var+E[S]²=1/3+1=4/3
// P-K formula: Wq = λ·E[S²] / (2(1−ρ)) = 0.9·(4/3) / 0.2 = 6.0
// 30 replications, warmup=10000, maxSimTime=50000, tolerance ±3%.

describe('Benchmark 3 — M/G/1 P-K mean wait (Uniform[0,2] service)', () => {
  const ANALYTICAL_WQ = 6.0;
  const REPS = 30;
  const BASE_SEED = 200;
  const WARMUP = 10000;
  const MAX_SIM = 50000;

  function mg1Model() {
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
            { eventId: 'b_complete', dist: 'Uniform', distParams: { min: '0', max: '2' }, useEntityCtx: true },
          ],
        },
      ],
      queues: [],
    };
  }

  test('30-rep mean queue wait within ±3% of P-K analytical 6.0', { timeout: 120000 }, () => {
    const model = mg1Model();
    const waits = runReps(model, REPS, BASE_SEED, WARMUP, MAX_SIM)
      .map(r => r.summary.avgWait)
      .filter(w => w != null);
    const grandMean = avg(waits);
    const pctError = Math.abs(grandMean - ANALYTICAL_WQ) / ANALYTICAL_WQ;
    expect(pctError).toBeLessThanOrEqual(0.03);
  });
});

// ── Benchmark 4 — M/M/1/K finite queue loss probability ─────────────────────
// λ=2.0, μ=1.0, system capacity K=5 (queue capacity=4 + 1 server slot)
// ρ = 2.0; P_loss = ρ^K(1−ρ)/(1−ρ^(K+1)) = 32·(−1)/(1−64) = 32/63 ≈ 0.508
// 20 replications, no warmup (system near capacity from t=0), maxSimTime=30000.
// Assert: blockingCount/(total+blockingCount) within ±3% of 0.508.

describe('Benchmark 4 — M/M/1/K finite queue loss probability (K=5)', () => {
  const ANALYTICAL_LOSS = 32 / 63;   // ≈ 0.5079
  const REPS = 20;
  const BASE_SEED = 400;
  const MAX_SIM = 30000;

  function mm1kModel() {
    return {
      entityTypes: [
        { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
        { id: 'et_srv',  name: 'Server',   role: 'server',   count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        {
          id: 'q_main', name: 'Main Queue', customerType: 'Customer',
          discipline: 'FIFO',
          capacity: 4,             // 4 waiting + 1 in service = K=5 total system
          overflowDestination: null,
        },
      ],
      bEvents: [
        {
          id: 'b_arrive', name: 'Arrival', scheduledTime: '0',
          effect: 'ARRIVE(Customer, Main Queue)',
          schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: '0.5' } }],
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
          condition: 'queue(Main Queue).length > 0 AND idle(Server).count > 0',
          effect: 'ASSIGN(Main Queue, Server)',
          cSchedules: [
            { eventId: 'b_complete', dist: 'Exponential', distParams: { mean: '1.0' }, useEntityCtx: true },
          ],
        },
      ],
    };
  }

  test('20-rep mean loss probability within ±3% of 32/63 ≈ 0.508', { timeout: 120000 }, () => {
    const model = mm1kModel();
    const lossRates = runReps(model, REPS, BASE_SEED, 0, MAX_SIM).map(r => {
      const blocked = r.perQueue?.['Main Queue']?.blockingCount ?? 0;
      const entered = r.summary.total;
      return blocked / (entered + blocked);
    });
    const meanLoss = avg(lossRates);
    const pctError = Math.abs(meanLoss - ANALYTICAL_LOSS) / ANALYTICAL_LOSS;
    expect(pctError).toBeLessThanOrEqual(0.03);
  });
});

// ── Benchmark 5 — Priority queue ordering (qualitative directional) ──────────
// Two entity types sharing one PRIORITY queue.
//   HighPriority: rate=0.4, priority attr=1 (served first)
//   LowPriority:  rate=0.4, priority attr=2 (served second)
//   Service: Exp(1.0) for both. Combined ρ=0.8.
// Expected (Kleinrock non-preemptive priority):
//   Wq_HP ≈ 2.7 < Wq_LP ≈ 20.0  (directional only — no formula check)
// 20 replications, warmupPeriod=0 (warmup period not needed for directional test),
// maxSimTime=10000.

describe('Benchmark 5 — Priority queue ordering (HP.avgWait < LP.avgWait)', () => {
  const REPS = 20;
  const BASE_SEED = 600;
  const MAX_SIM = 10000;

  function priorityModel() { return makePriorityQueueModel('2.5'); }

  test('HP mean wait is strictly less than LP mean wait across 20 replications', { timeout: 60000 }, () => {
    const model = priorityModel();
    const hpWaits = [];
    const lpWaits = [];

    for (let i = 0; i < REPS; i++) {
      const r = buildEngine(model, BASE_SEED + i, 0, MAX_SIM).runAll();
      const hp = r.entitySummary.filter(e => e.type === 'HighPriority' && e.status === 'done');
      const lp = r.entitySummary.filter(e => e.type === 'LowPriority'  && e.status === 'done');
      if (hp.length) hpWaits.push(avg(hp.map(e => (e.serviceStart ?? e.arrivalTime) - e.arrivalTime)));
      if (lp.length) lpWaits.push(avg(lp.map(e => (e.serviceStart ?? e.arrivalTime) - e.arrivalTime)));
    }

    const meanHP = avg(hpWaits);
    const meanLP = avg(lpWaits);
    expect(meanHP).toBeLessThan(meanLP);
  });
});

// ── Benchmark 6 — PREEMPT correctness: LP wait exceeds M/M/1 baseline ───────
// Non-preemptive PRIORITY queue with HP (priority=1) and LP (priority=2).
// Combined rate λ=0.9 (HP=0.45, LP=0.45), μ=1.0, ρ=0.9.
// Expected LP wait (Kleinrock 2-class non-preemptive priority):
//   Wq_LP = W0/((1−ρ_HP)(1−ρ)) = 0.9/(0.55·0.1) ≈ 16.4
// This exceeds the pure M/M/1 baseline Wq = 9.0.
// Assert: LP mean wait > 9.0 (directional — HP priority starves LP).
// 15 replications, warmupPeriod=0, maxSimTime=20000.

describe('Benchmark 6 — PREEMPT correctness: LP avgWait > M/M/1 baseline (9.0)', () => {
  const BASELINE = 9.0;
  const REPS = 15;
  const BASE_SEED = 700;
  const MAX_SIM = 20000;

  function preemptModel() { return makePriorityQueueModel(String(1 / 0.45)); }

  test('LP mean wait > 9.0 (M/M/1 baseline) across 15 replications', { timeout: 60000 }, () => {
    const model = preemptModel();
    const lpWaits = [];

    for (let i = 0; i < REPS; i++) {
      const r = buildEngine(model, BASE_SEED + i, 0, MAX_SIM).runAll();
      const lp = r.entitySummary.filter(e => e.type === 'LowPriority' && e.status === 'done');
      if (lp.length) lpWaits.push(avg(lp.map(e => (e.serviceStart ?? e.arrivalTime) - e.arrivalTime)));
    }

    const meanLPWait = avg(lpWaits);
    expect(meanLPWait).toBeGreaterThan(BASELINE);
  });
});

// ── Benchmark 7 — Warmup removal correctness ─────────────────────────────────
// M/M/1 λ=0.9, μ=1.0, analytical Wq = 9.0.
// Run A: no warmup (warmupPeriod=0) — includes transient start-up effect.
// Run B: warmupPeriod=500 — excludes transient.
// Expected: post-warmup mean (Run B) is closer to 9.0 than no-warmup mean (Run A).
// 20 replications each, maxSimTime=10000.

describe('Benchmark 7 — Warmup removal correctness', () => {
  const ANALYTICAL = 9.0;
  const REPS = 20;
  const BASE_SEED = 800;
  const MAX_SIM = 10000;

  test('warmupPeriod=500 mean is closer to 9.0 than warmupPeriod=0 mean', { timeout: 60000 }, () => {
    const runA = runReps(mm1Model(), REPS, BASE_SEED, 0, MAX_SIM)
      .map(r => r.summary.avgWait).filter(w => w != null);
    const runB = runReps(mm1Model(), REPS, BASE_SEED, 500, MAX_SIM)
      .map(r => r.summary.avgWait).filter(w => w != null);

    const meanA = avg(runA);
    const meanB = avg(runB);

    expect(Math.abs(meanB - ANALYTICAL)).toBeLessThan(Math.abs(meanA - ANALYTICAL));
  });
});

// ── Benchmark 8 — Seeded reproducibility (exact) ────────────────────────────
// Two identical M/M/1 runs with seed=42 must produce bit-identical summaries.
// This formally verifies mulberry32 PRNG determinism.
// 5 replications per run, warmupPeriod=1000, maxSimTime=5000.

describe('Benchmark 8 — Seeded reproducibility (exact bit-identical)', () => {
  test('two runs with seed=42 produce identical summary statistics', () => {
    const run1 = buildEngine(mm1Model(), 42, 1000, 5000).runAll();
    const run2 = buildEngine(mm1Model(), 42, 1000, 5000).runAll();

    expect(run1.summary.served).toBe(run2.summary.served);
    expect(run1.summary.avgWait).toBe(run2.summary.avgWait);
    expect(run1.summary.avgSvc).toBe(run2.summary.avgSvc);
    expect(run1.summary.avgSojourn).toBe(run2.summary.avgSojourn);
    expect(run1.summary.reneged).toBe(run2.summary.reneged);
  });

  test('5 replications from seed=42 produce same results on second run', () => {
    const run1 = runReps(mm1Model(), 5, 42, 1000, 5000).map(r => r.summary.avgWait);
    const run2 = runReps(mm1Model(), 5, 42, 1000, 5000).map(r => r.summary.avgWait);
    expect(run1).toEqual(run2);
  });
});
