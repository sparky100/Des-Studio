import { describe, expect, test } from 'vitest';
import { runReplications } from '../../src/engine/replication-runner.js';
import { summarizeReplicationResults } from '../../src/engine/statistics.js';
import { makeMM1Model } from './__helpers__/benchmarkFixtures.js';

const LAMBDA = 0.9;
const MU = 1.0;
const ANALYTICAL_MEAN_WAIT = 9.0;

// M/M/c: λ=1.6, μ=1.0, c=2, ρ=0.8
// Erlang-C: Wq = C(c,ρ) / (c·μ − λ) = (6.4/9) / 0.4 ≈ 1.7778
const MMC_LAMBDA = 1.6;
const MMC_MU = 1.0;
const MMC_C = 2;
const MMC_ANALYTICAL_WQ = (() => {
  const a = MMC_LAMBDA / MMC_MU;
  const rho = MMC_LAMBDA / (MMC_C * MMC_MU);
  let sumK = 0, factorial = 1;
  for (let k = 0; k < MMC_C; k++) {
    if (k > 0) factorial *= k;
    sumK += Math.pow(a, k) / factorial;
  }
  factorial *= MMC_C;
  const lastTerm = Math.pow(a, MMC_C) / (factorial * (1 - rho));
  const P0 = 1 / (sumK + lastTerm);
  return (lastTerm * P0) / (MMC_C * MMC_MU - MMC_LAMBDA);
})();

const mm1Model = makeMM1Model(LAMBDA, MU);

const mmcModel = {
  entityTypes: [
    { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_srv', name: 'Server', role: 'server', count: MMC_C, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b_arrive',
      name: 'Arrival',
      scheduledTime: '0',
      effect: 'ARRIVE(Customer)',
      schedules: [
        {
          eventId: 'b_arrive',
          dist: 'Exponential',
          distParams: { mean: String(1 / MMC_LAMBDA) },
        },
      ],
    },
    {
      id: 'b_complete',
      name: 'Complete',
      scheduledTime: '9999',
      effect: 'COMPLETE()',
      schedules: [],
    },
  ],
  cEvents: [
    {
      id: 'c_seize',
      name: 'Seize',
      condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Customer, Server)',
      cSchedules: [
        {
          eventId: 'b_complete',
          dist: 'Exponential',
          distParams: { mean: String(1 / MMC_MU) },
          useEntityCtx: true,
        },
      ],
    },
  ],
  queues: [],
};

describe('replication CI gate', () => {
  test('30 M/M/1 replications produce a 95% CI containing analytical mean wait', async () => {
    const results = await new Promise((resolve, reject) => {
      runReplications({
        model: mm1Model,
        replications: 30,
        baseSeed: 300,
        workerCount: 1,
        warmupPeriod: 200,
        maxSimTime: 600,
        maxCycles: 50000,
        onComplete: resolve,
        onError: reject,
      });
    });

    const ci = summarizeReplicationResults(results, ['summary.avgWait'])['summary.avgWait'];

    expect(ci.n).toBe(30);
    expect(ci.lower).toBeLessThanOrEqual(ANALYTICAL_MEAN_WAIT);
    expect(ci.upper).toBeGreaterThanOrEqual(ANALYTICAL_MEAN_WAIT);
  }, 60000);

  test('20 M/M/c (c=2) replications produce a 95% CI containing Erlang-C analytical mean wait', async () => {
    const results = await new Promise((resolve, reject) => {
      runReplications({
        model: mmcModel,
        replications: 20,
        baseSeed: 500,
        workerCount: 1,
        warmupPeriod: 200,
        maxSimTime: 1000,
        maxCycles: 100000,
        onComplete: resolve,
        onError: reject,
      });
    });

    const ci = summarizeReplicationResults(results, ['summary.avgWait'])['summary.avgWait'];

    expect(ci.n).toBe(20);
    expect(ci.lower).toBeLessThanOrEqual(MMC_ANALYTICAL_WQ);
    expect(ci.upper).toBeGreaterThanOrEqual(MMC_ANALYTICAL_WQ);
  }, 60000);
});
