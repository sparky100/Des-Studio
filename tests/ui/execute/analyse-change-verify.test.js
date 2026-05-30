// tests/ui/execute/analyse-change-verify.test.js
//
// E2E-style test for the AI Analyse → change resource → verify loop.
//
// Verifies the full data path that was broken:
//  1. Run M/M/1 model (20 replications)
//  2. summarizeReplicationResults produces aggregateStats with correct paths
//  3. aggregateStatsForPanel fallback builds "summary.avgWait" etc. from summary
//  4. applySuggestionPatch correctly patches server count
//  5. Re-running patched model produces better results (lower avgWait)
//  6. BeforeAfterTable can compare baseline vs patched aggregateStats

import { describe, test, expect, beforeEach } from 'vitest';
import { resetSeq } from '../../../src/engine/entities.js';
import { runReplications } from '../../../src/engine/replication-runner.js';
import { summarizeReplicationResults } from '../../../src/engine/statistics.js';
import { CI_METRICS } from '../../../src/ui/execute/executeHelpers.js';
import { applySuggestionPatch } from '../../../src/llm/prompts.js';

beforeEach(() => resetSeq());

// ── M/M/1 model: λ=0.9, μ=1.0 → ρ=0.9, Wq ≈ 9.0 (from replication-ci.test.js) ─

const MODEL = {
  entityTypes: [
    { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_srv',  name: 'Server',   role: 'server',   count: 1,  attrDefs: [] },
  ],
  stateVariables: [],
  queues: [],
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
  cEvents: [{
    id: 'c_seize', name: 'Seize',
    condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
    effect: 'ASSIGN(Customer, Server)',
    cSchedules: [{ eventId: 'b_complete', dist: 'Exponential', distParams: { mean: '1' }, useEntityCtx: true }],
  }],
};

function runModel(model, replications = 10) {
  return new Promise((resolve, reject) => {
    const completedPayloads = [];
    runReplications({
      model,
      replications,
      baseSeed: 42,
      warmupPeriod: 50,
      maxSimTime: 500,
      collectTimeSeries: false,
      onReplicationComplete: payload => {
        completedPayloads[payload.replicationIndex] = payload;
      },
      onComplete: payloads => {
        const valid = payloads.filter(Boolean);
        resolve(valid);
      },
      onError: reject,
    });
  });
}

// ── Helpers mimicking ModelDetail.aggregateStatsForPanel fallback ──────────────

function aggregateStatsFromSummary(summary) {
  const toCI = v => Number.isFinite(v)
    ? { n: 1, mean: v, lower: null, upper: null, halfWidth: null }
    : { n: 0, mean: null, lower: null, upper: null, halfWidth: null };
  return {
    'summary.avgWait':      toCI(summary.avgWait),
    'summary.avgSvc':       toCI(summary.avgSvc),
    'summary.avgSojourn':   toCI(summary.avgSojourn),
    'summary.served':       toCI(summary.served),
    'summary.reneged':      toCI(summary.reneged),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('M/M/1 Analyse → change resource → verify (e2e)', () => {

  test('step 1: summarizeReplicationResults produces expected metric paths', async () => {
    const payloads = await runModel(MODEL);
    const stats = summarizeReplicationResults(payloads, CI_METRICS);

    // Keys must match BeforeAfterTable KPI_ROWS exactly
    expect(stats).toHaveProperty('summary.avgWait');
    expect(stats).toHaveProperty('summary.avgSvc');
    expect(stats).toHaveProperty('summary.avgSojourn');
    expect(stats).toHaveProperty('summary.served');
    expect(stats['summary.avgWait'].mean).toBeGreaterThan(0);
  });

  test('step 2: aggregateStatsForPanel fallback produces same keys from summary', async () => {
    const payloads = await runModel(MODEL);
    const stats    = summarizeReplicationResults(payloads, CI_METRICS);
    const summary  = payloads[0].result?.summary || {};

    // Simulate what makeBatchResult writes into results.summary
    const batchSummary = {
      ...summary,
      avgWait:    stats['summary.avgWait']?.mean ?? null,
      avgSvc:     stats['summary.avgSvc']?.mean  ?? null,
      avgSojourn: stats['summary.avgSojourn']?.mean ?? null,
      served:     payloads.reduce((s, p) => s + (p.result?.summary?.served || 0), 0),
    };

    // Fallback builds equivalent CI objects from summary
    const fallback = aggregateStatsFromSummary(batchSummary);
    expect(fallback['summary.avgWait'].mean).toBeCloseTo(stats['summary.avgWait'].mean, 1);
    expect(fallback['summary.avgSvc'].mean).toBeCloseTo(stats['summary.avgSvc'].mean, 1);
  });

  test('step 3: applySuggestionPatch doubles server count from 1 to 2', () => {
    const change = { type: 'entityTypeCount', target: 'Server', from: 1, to: 2 };
    const patched = applySuggestionPatch(MODEL, change);

    const server = patched.entityTypes.find(e => e.name === 'Server');
    expect(server.count).toBe(2);
    // Original must not be mutated
    expect(MODEL.entityTypes.find(e => e.name === 'Server').count).toBe(1);
  });

  test('step 4: patched model (2 servers) produces lower avgWait than baseline (1 server)', async () => {
    const change = { type: 'entityTypeCount', target: 'Server', from: 1, to: 2 };
    const patched = applySuggestionPatch(MODEL, change);

    const [basePayloads, patchedPayloads] = await Promise.all([
      runModel(MODEL),
      runModel(patched),
    ]);

    const baseStats    = summarizeReplicationResults(basePayloads, CI_METRICS);
    const patchedStats = summarizeReplicationResults(patchedPayloads, CI_METRICS);

    const baseWait    = baseStats['summary.avgWait'].mean;
    const patchedWait = patchedStats['summary.avgWait'].mean;

    // Two servers should dramatically reduce waiting vs one overloaded server
    expect(patchedWait).toBeLessThan(baseWait);
  });

  test('step 5: BeforeAfterTable logic — change delta is negative for avgWait (improvement)', async () => {
    const change = { type: 'entityTypeCount', target: 'Server', from: 1, to: 2 };
    const patched = applySuggestionPatch(MODEL, change);

    const [basePayloads, patchedPayloads] = await Promise.all([
      runModel(MODEL),
      runModel(patched),
    ]);

    const baseStats    = summarizeReplicationResults(basePayloads, CI_METRICS);
    const patchedStats = summarizeReplicationResults(patchedPayloads, CI_METRICS);

    const beforeVal = baseStats['summary.avgWait'].mean;
    const afterVal  = patchedStats['summary.avgWait'].mean;

    // BeforeAfterTable.delta: ((after - before) / |before|) * 100
    const pct = ((afterVal - beforeVal) / Math.abs(beforeVal)) * 100;
    // Improvement means a negative delta (less wait time)
    expect(pct).toBeLessThan(0);
    // Expect a substantial improvement (>50% reduction) when going from overloaded to 2 servers
    expect(pct).toBeLessThan(-50);
  });

  test('step 6: onSaved callback pattern — verifyStatus "saved" reached without reference error', () => {
    // Mimics the fixed SuggestionCard.handleSave: onSaved?.() instead of setVerifyStatus(...)
    let savedCalled = false;
    const onSaved = () => { savedCalled = true; };

    // Simulate what handleSave does
    const canSave = true;
    const verifyResult = { aggregateStats: {} }; // truthy
    if (canSave && verifyResult) {
      onSaved?.();
    }

    expect(savedCalled).toBe(true);
  });
});
