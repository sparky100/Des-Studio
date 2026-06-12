import { describe, expect, test } from 'vitest';
import { runAdaptiveBatch } from '../../src/engine/adaptive-batch.js';
import { makeMM1Model } from './__helpers__/benchmarkFixtures.js';

// M/M/1: λ=0.9, μ=1.0, ρ=0.9 — E[W] = 9.0
const LAMBDA = 0.9;
const MU = 1.0;
const mm1Model = makeMM1Model(LAMBDA, MU);


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

    expect(result.finalReps).toBeGreaterThanOrEqual(10);
    expect(result.finalReps).toBeLessThanOrEqual(30);
    expect(result.results.length).toBe(result.finalReps);
    expect(result.roundHistory.length).toBeGreaterThanOrEqual(1);
    expect(result.ci?.n).toBe(result.finalReps);
    expect(result.kpiPath).toBe('summary.avgWait');
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

  test('checkpoint fires at checkpointAt and stops when callback returns false', async () => {
    let checkpointFired = false;
    const result = await runAdaptiveBatch({
      model: mm1Model,
      tier: 'standard',  // max 30 reps
      baseSeed: 1,
      warmupPeriod: 0,
      maxSimTime: 500,
      targetRelativeCI: 0.001,  // impossible — will not converge
      checkpointAt: 20,
      onCheckpoint: async ({ totalReps }) => {
        checkpointFired = true;
        expect(totalReps).toBeGreaterThanOrEqual(20);
        return false;  // stop here
      },
    });
    expect(checkpointFired).toBe(true);
    expect(result.stoppedAtCheckpoint).toBe(true);
    expect(result.converged).toBe(false);
    expect(result.finalReps).toBeGreaterThanOrEqual(20);
  }, 60000);

  test('checkpoint continues running when callback returns true', async () => {
    let checkpointFired = false;
    const result = await runAdaptiveBatch({
      model: mm1Model,
      tier: 'standard',  // max 30 reps
      baseSeed: 2,
      warmupPeriod: 0,
      maxSimTime: 500,
      targetRelativeCI: 0.001,  // impossible — will not converge, hits tier max
      checkpointAt: 20,
      onCheckpoint: async () => {
        checkpointFired = true;
        return true;  // continue
      },
    });
    expect(checkpointFired).toBe(true);
    expect(result.stoppedAtCheckpoint).toBeUndefined();
    expect(result.finalReps).toBe(30);  // ran to tier max
  }, 60000);

  test('checkpoint not fired when CI converges before checkpointAt', async () => {
    let checkpointFired = false;
    const result = await runAdaptiveBatch({
      model: mm1Model,
      tier: 'standard',  // max 30 reps
      baseSeed: 3,
      warmupPeriod: 200,
      maxSimTime: 1000,
      targetRelativeCI: 50,  // very loose — will converge quickly
      checkpointAt: 25,
      onCheckpoint: async () => { checkpointFired = true; return true; },
    });
    // If converged before 25, checkpoint should not fire
    if (result.converged && result.finalReps < 25) {
      expect(checkpointFired).toBe(false);
    }
    expect(result.converged).toBe(true);
  }, 60000);

  test('uses non-overlapping seeds across rounds', async () => {
    const seenSeeds = [];
    let callCount = 0;

    function makeStubWorker() {
      const stub = {
        onmessage: null,
        onerror: null,
        postMessage(msg) {
          if (msg?.type !== 'RUN_REPLICATION') return; // ignore INIT_RUN
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
      tier: 'free',  // max 10 → initial 10 (hits tier cap on first round)
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
