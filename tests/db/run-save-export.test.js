/**
 * Integration tests: run → save payload → AI export consistency
 *
 * Covers single-run, batch (5 reps), and explore (adaptive batch) modes.
 * For each mode, asserts that:
 *   1. The save payload (buildPersistedResultsJson) contains expected fields
 *   2. The AI export (buildLLMBundle) contains expected content
 *   3. Key values are consistent between the two outputs
 *   4. Goals show PASS/FAIL (not UNKNOWN) when aggregateStats is present
 */

import { describe, it, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { summarizeReplicationResults } from '../../src/engine/statistics.js';
import { buildPersistedResultsJson } from '../../src/db/results-persistence.js';
import { buildLLMBundle } from '../../src/llm/bundleExport.js';
import { makeMM1Model } from '../engine/__helpers__/benchmarkFixtures.js';
import { makeBatchResult, CI_METRICS } from '../../src/ui/execute/executeHelpers.js';

// M/M/1 with a goal so goal assessment is exercised in all three output types.
function makeModel() {
  return {
    ...makeMM1Model(0.9, 1.0),
    name: 'TestMM1',
    goals: [{ id: 'g1', metric: 'summary.avgWait', operator: '<', target: 20, label: 'Wait < 20' }],
  };
}

// Minimal runRecord required by buildPersistedResultsJson to store engine metadata.
function makeRunRecord(seed, replications, maxSimTime) {
  return {
    base_seed: seed,
    engine_version: 'test',
    prng_algorithm: 'mulberry32',
    experiment_config: { replications, maxSimTime, warmupPeriod: 0 },
  };
}

// Run the engine synchronously and return a replication payload.
function runSingleEngine(model, seed, maxSimTime = 200) {
  const engine = buildEngine(model, seed, 0, maxSimTime);
  const result = engine.runAll();
  return result;
}

// Build an array of N replication payloads, one per seed.
function runBatch(model, baseSeed, n, maxSimTime = 200) {
  return Array.from({ length: n }, (_, i) => ({
    replicationIndex: i,
    seed: baseSeed + i,
    result: runSingleEngine(model, baseSeed + i, maxSimTime),
  }));
}

// ── Suite 1: Single run ──────────────────────────────────────────────────────

describe('single run → save → export', () => {
  const model = makeModel();
  const SEED = 42;
  const MAX_SIM_TIME = 200;

  let result, aggregateStats, payload, bundle;

  it('runs engine and produces a valid result', () => {
    result = runSingleEngine(model, SEED, MAX_SIM_TIME);
    expect(result.summary.served).toBeGreaterThan(0);
    expect(Number.isFinite(result.summary.avgWait)).toBe(true);
  });

  it('builds save payload with correct fields', () => {
    // Single-run still gets aggregateStats (point estimate, n=1)
    aggregateStats = summarizeReplicationResults(
      [{ replicationIndex: 0, seed: SEED, result }],
      CI_METRICS
    );
    payload = buildPersistedResultsJson(
      { ...result, aggregateStats },
      {
        replications: 1,
        seed: SEED,
        runLabel: 'Test single run',
        maxTime: MAX_SIM_TIME,
        warmupPeriod: 0,
        runRecord: makeRunRecord(SEED, 1, MAX_SIM_TIME),
        includeModelSnapshot: false,
      }
    );

    expect(payload.summary.served).toBe(result.summary.served);
    expect(payload.summary.avgWait).toBe(result.summary.avgWait);
    expect(payload._base_seed).toBe(SEED);
    // No per-replication array for single run
    expect(payload.replications == null || payload.replications === 1 || (Array.isArray(payload.replications) && payload.replications.length === 0)).toBe(true);
  });

  it('aggregateStats has n=1 for single run', () => {
    expect(aggregateStats['summary.avgWait']).toBeDefined();
    expect(aggregateStats['summary.avgWait'].n).toBe(1);
    expect(Number.isFinite(aggregateStats['summary.avgWait'].mean)).toBe(true);
  });

  it('payload aggregateStats mean matches engine summary', () => {
    expect(payload.aggregateStats['summary.avgWait'].mean).toBeCloseTo(result.summary.avgWait, 10);
  });

  it('builds AI export with headline KPIs', () => {
    bundle = buildLLMBundle(
      model,
      { ...result, aggregateStats, replications: [] },
      { replications: 1, seed: SEED, runLabel: 'Test single run', maxSimTime: MAX_SIM_TIME }
    );

    expect(bundle).toContain('# simmodlr');
    expect(bundle).toContain('Headline KPIs');
    expect(bundle).toContain(String(result.summary.served));
  });

  it('AI export includes CI table with n=1 and dashes for bounds (no actual interval)', () => {
    // Single run: CI table appears with n=1, but halfWidth is null so bounds show as dashes
    expect(bundle).toContain('Confidence Intervals');
    expect(bundle).toContain('| summary.avgWait | 1 |');
    // No finite halfWidth — bounds are dashes
    expect(bundle).toContain('| — | — | — |');
  });

  it('AI export Goals Assessment shows PASS or FAIL, not UNKNOWN', () => {
    expect(bundle).toContain('Goals Assessment');
    expect(bundle).not.toContain('UNKNOWN');
    expect(bundle.includes('✓ PASS') || bundle.includes('✗ FAIL')).toBe(true);
  });

  it('consistency: payload and AI export agree on avgWait', () => {
    const payloadMean = payload.aggregateStats['summary.avgWait'].mean;
    const formattedMean = payloadMean.toFixed(2);
    expect(bundle).toContain(formattedMean);
  });
});

// ── Suite 2: Batch run (5 replications) ──────────────────────────────────────

describe('batch run (5 reps) → save → export', () => {
  const model = makeModel();
  const BASE_SEED = 100;
  const N_REPS = 5;
  const MAX_SIM_TIME = 200;

  let payloads, aggregateStats, batchResult, payload, bundle;

  it('runs 5 replications with non-overlapping seeds', () => {
    payloads = runBatch(model, BASE_SEED, N_REPS, MAX_SIM_TIME);
    expect(payloads.length).toBe(N_REPS);
    expect(payloads[0].seed).toBe(BASE_SEED);
    expect(payloads[4].seed).toBe(BASE_SEED + 4);
    expect(payloads.every(p => p.result.summary.served > 0)).toBe(true);
  });

  it('builds aggregateStats with n=5 across all metrics', () => {
    aggregateStats = summarizeReplicationResults(payloads, CI_METRICS);
    expect(aggregateStats['summary.avgWait'].n).toBe(N_REPS);
    expect(aggregateStats['summary.served'].n).toBe(N_REPS);
    expect(Number.isFinite(aggregateStats['summary.avgWait'].mean)).toBe(true);
    expect(Number.isFinite(aggregateStats['summary.avgWait'].halfWidth)).toBe(true);
  });

  it('builds combined batch result with correct summary', () => {
    batchResult = makeBatchResult(payloads, aggregateStats, MAX_SIM_TIME, 0);
    // Batch summary totals served across all reps
    const totalServed = payloads.reduce((s, p) => s + (p.result.summary.served || 0), 0);
    expect(batchResult.summary.served).toBe(totalServed);
    // avgWait is the mean across replications
    expect(batchResult.summary.avgWait).toBeCloseTo(aggregateStats['summary.avgWait'].mean, 10);
  });

  it('builds save payload with aggregateStats and replication array', () => {
    const replicationResults = payloads.map(p => ({
      replicationIndex: p.replicationIndex,
      seed: p.seed,
      summary: p.result.summary,
      finalTime: p.result.finalTime,
    }));

    payload = buildPersistedResultsJson(batchResult, {
      replications: N_REPS,
      seed: BASE_SEED,
      runLabel: 'Test batch',
      maxTime: MAX_SIM_TIME,
      warmupPeriod: 0,
      aggregateStats,
      replicationResults,
      runRecord: makeRunRecord(BASE_SEED, N_REPS, MAX_SIM_TIME),
      includeModelSnapshot: false,
    });

    expect(payload.aggregateStats['summary.avgWait'].n).toBe(N_REPS);
    expect(Array.isArray(payload.replications)).toBe(true);
    expect(payload.replications.length).toBe(N_REPS);
    expect(payload.replications[0].seed).toBe(BASE_SEED);
    expect(payload.replications[4].seed).toBe(BASE_SEED + 4);
  });

  it('builds AI export with CI table and replication summary', () => {
    bundle = buildLLMBundle(
      model,
      { ...batchResult, aggregateStats: payload.aggregateStats, replications: payload.replications },
      { replications: N_REPS, seed: BASE_SEED, runLabel: 'Test batch', maxSimTime: MAX_SIM_TIME }
    );

    expect(bundle).toContain('Confidence Intervals');
    // CI table has n=5 for avgWait
    const ciSection = bundle.slice(bundle.indexOf('Confidence Intervals'));
    expect(ciSection).toContain('| 5 |');
    expect(bundle).toContain('Replication Summary');
    // Replication summary now includes avgSojourn column (added in recent fix)
    expect(bundle).toContain('Avg sojourn');
  });

  it('replList guard: replications stored as array does not crash', () => {
    // Exercises the Fix A guard — Array.isArray check in bundleExport.js
    expect(() => buildLLMBundle(
      model,
      { ...batchResult, aggregateStats, replications: payload.replications },
      { replications: N_REPS }
    )).not.toThrow();
  });

  it('replList guard: replications stored as number does not crash', () => {
    // Exercises the Fix A guard — should produce no replication table but not crash
    expect(() => buildLLMBundle(
      model,
      { ...batchResult, aggregateStats, replications: N_REPS },
      { replications: N_REPS }
    )).not.toThrow();
  });

  it('AI export Goals Assessment shows PASS or FAIL, not UNKNOWN', () => {
    expect(bundle).toContain('Goals Assessment');
    expect(bundle).not.toContain('UNKNOWN');
    expect(bundle.includes('✓ PASS') || bundle.includes('✗ FAIL')).toBe(true);
  });

  it('consistency: aggregateStats mean matches value in AI export', () => {
    const mean = payload.aggregateStats['summary.avgWait'].mean.toFixed(2);
    // The mean appears in the Goals Assessment actual value column
    expect(bundle).toContain(mean);
  });
});

// ── Suite 3: Explore run (adaptive-style using manual batch) ─────────────────

describe('explore run → save → export', () => {
  const model = makeModel();
  const BASE_SEED = 42;
  const FINAL_REPS = 5; // Simulates a converged explore run of 5 reps
  const MAX_SIM_TIME = 200;

  let payloads, aggregateStats, combinedResult, payload, bundle;

  it('builds explore result from N replications', () => {
    payloads = runBatch(model, BASE_SEED, FINAL_REPS, MAX_SIM_TIME);
    expect(payloads.length).toBe(FINAL_REPS);
  });

  it('computes aggregateStats for explore run', () => {
    aggregateStats = summarizeReplicationResults(payloads, CI_METRICS);
    // Key regression guard: aggregateStats must be populated (was missing for explore runs pre-fix)
    expect(aggregateStats['summary.avgWait']).toBeDefined();
    expect(Number.isFinite(aggregateStats['summary.avgWait'].mean)).toBe(true);
    expect(aggregateStats['summary.avgWait'].n).toBe(FINAL_REPS);
  });

  it('builds combined explore result', () => {
    combinedResult = makeBatchResult(payloads, aggregateStats, MAX_SIM_TIME, 0);
    expect(combinedResult.summary.served).toBeGreaterThan(0);
  });

  it('save payload stores aggregateStats and replicationResults for explore run', () => {
    // This mirrors exactly what AdaptiveBatchPanel now passes to onSave (post-fix).
    const replicationResults = payloads.map(p => ({
      replicationIndex: p.replicationIndex,
      seed: p.seed,
      summary: p.result.summary,
      finalTime: p.result.finalTime,
    }));

    payload = buildPersistedResultsJson(combinedResult, {
      replications: FINAL_REPS,
      seed: BASE_SEED,
      runLabel: `✦ Explore (${FINAL_REPS} reps)`,
      maxTime: MAX_SIM_TIME,
      warmupPeriod: 0,
      aggregateStats,      // REGRESSION GUARD: must be present in explore save config
      replicationResults,  // REGRESSION GUARD: must be present in explore save config
      runRecord: makeRunRecord(BASE_SEED, FINAL_REPS, MAX_SIM_TIME),
      includeModelSnapshot: false,
    });

    // Regression guard: aggregateStats was NOT being saved for explore runs before the fix
    expect(payload.aggregateStats).toBeDefined();
    expect(payload.aggregateStats['summary.avgWait']).toBeDefined();
    expect(Number.isFinite(payload.aggregateStats['summary.avgWait'].mean)).toBe(true);

    // Regression guard: replicationResults was NOT being saved for explore runs before the fix
    expect(Array.isArray(payload.replications)).toBe(true);
    expect(payload.replications.length).toBe(FINAL_REPS);
  });

  it('AI export Goals Assessment shows PASS or FAIL — not UNKNOWN', () => {
    bundle = buildLLMBundle(
      model,
      { ...combinedResult, aggregateStats: payload.aggregateStats, replications: payload.replications },
      { replications: FINAL_REPS, seed: BASE_SEED, runLabel: `✦ Explore (${FINAL_REPS} reps)`, maxSimTime: MAX_SIM_TIME }
    );

    expect(bundle).toContain('Goals Assessment');
    // KEY REGRESSION GUARD: goals must not show UNKNOWN for explore runs
    expect(bundle).not.toContain('UNKNOWN');
    expect(bundle.includes('✓ PASS') || bundle.includes('✗ FAIL')).toBe(true);
  });

  it('AI export includes replication summary with correct row count', () => {
    expect(bundle).toContain('Replication Summary');
    // Each replication row starts with '| 0 |' through '| 4 |'
    for (let i = 0; i < FINAL_REPS; i++) {
      expect(bundle).toContain(`| ${i} |`);
    }
  });

  it('consistency: payload and AI export agree on avgWait mean', () => {
    const mean = payload.aggregateStats['summary.avgWait'].mean.toFixed(2);
    expect(bundle).toContain(mean);
  });

  it('replList guard: explore run with numeric replications does not crash AI export', () => {
    // Simulates a history-loaded explore run where replications is a number not an array
    expect(() => buildLLMBundle(
      model,
      { ...combinedResult, aggregateStats, replications: FINAL_REPS },
      { replications: FINAL_REPS }
    )).not.toThrow();
  });
});
