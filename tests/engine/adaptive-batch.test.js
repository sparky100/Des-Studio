import { describe, expect, test } from 'vitest';
import { runAdaptiveBatch } from '../../src/engine/adaptive-batch.js';

// M/M/1: λ=0.9, μ=1.0, ρ=0.9 — E[W] = 9.0
const LAMBDA = 0.9;
const MU = 1.0;

const mm1Model = {
  entityTypes: [
    { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_srv',  name: 'Server',   role: 'server',   count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b_arrive',
      name: 'Arrival',
      scheduledTime: '0',
      effect: 'ARRIVE(Customer)',
      schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: String(1 / LAMBDA) } }],
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
      cSchedules: [{
        eventId: 'b_complete',
        dist: 'Exponential',
        distParams: { mean: String(1 / MU) },
        useEntityCtx: true,
      }],
    },
  ],
  queues: [],
};

describe('runAdaptiveBatch', () => {
  test('accumulates results across rounds and reports final CI', async () => {
    const result = await runAdaptiveBatch({
      model: mm1Model,
      tier: 'standard',  // max 30 reps
      baseSeed: 42,
      warmupPeriod: 200,
      maxSimTime: 1000,
      targetRelativeCI: 20,  // relaxed threshold for test speed
    });

    expect(result.finalReps).toBeGreaterThanOrEqual(5);
    expect(result.finalReps).toBeLessThanOrEqual(30);
    expect(result.results.length).toBe(result.finalReps);
    expect(result.roundHistory.length).toBeGreaterThanOrEqual(1);
    expect(result.ci?.n).toBe(result.finalReps);
    expect(result.kpiPath).toBe('summary.served');
  }, 120000);

  test('respects tier max replications', async () => {
    const result = await runAdaptiveBatch({
      model: mm1Model,
      tier: 'free',   // max 10 reps
      baseSeed: 100,
      warmupPeriod: 0,
      maxSimTime: 30,  // very short — high variance, unlikely to converge to 1%
      targetRelativeCI: 1,  // impossibly tight for 10 reps
    });

    expect(result.finalReps).toBeLessThanOrEqual(10);
    expect(result.results.length).toBe(result.finalReps);
    // Either converged (lucky) or hit tier limit — both are valid outcomes
    if (!result.converged) {
      expect(result.finalReps).toBe(10);
    }
  }, 60000);

  test('uses non-overlapping seeds across rounds', async () => {
    const seenSeeds = [];
    let callCount = 0;

    function makeStubWorker() {
      const stub = {
        onmessage: null,
        onerror: null,
        postMessage(msg) {
          const { replicationIndex, seed } = msg?.payload || {};
          seenSeeds.push(seed);
          callCount++;
          // Return varying served values so variance > 0 and CI won't converge to 1%
          const served = 5 + (callCount % 7);
          Promise.resolve().then(() => {
            stub.onmessage?.({
              data: {
                type: 'REPLICATION_COMPLETE',
                payload: {
                  replicationIndex,
                  seed,
                  result: {
                    finalTime: 100,
                    summary: { served, reneged: 0, total: 10, avgWait: served, avgSvc: 2 },
                    snap: {},
                    runtimeMetrics: {},
                    warnings: [],
                  },
                },
              },
            });
          });
        },
        terminate() {},
      };
      return stub;
    }

    await runAdaptiveBatch({
      model: mm1Model,
      tier: 'free',  // max 10 → initial 5 + step 5
      baseSeed: 0,
      warmupPeriod: 0,
      maxSimTime: 100,
      targetRelativeCI: 0.001,  // impossible to achieve — forces all rounds to complete
      _createWorker: makeStubWorker,
    });

    // All seeds must be unique (no round re-uses a seed from a prior round)
    const uniqueSeeds = new Set(seenSeeds);
    expect(uniqueSeeds.size).toBe(seenSeeds.length);
    // Tier max is 10 reps, so exactly 10 seeds must have been used
    expect(seenSeeds.length).toBe(10);
  }, 10000);
});
