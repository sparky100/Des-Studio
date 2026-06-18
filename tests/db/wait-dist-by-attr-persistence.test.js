// Schema contract round-trip test (see CLAUDE.md): waitDistByAttr flows into
// results_json via buildPersistedResultsJson, so its persistence shape — and
// its compaction at non-"full" detail levels, mirroring waitDist — needs
// explicit coverage.

import { describe, it, expect } from 'vitest';
import { buildPersistedResultsJson } from '../../src/db/results-persistence.js';

function makeResult(detailLevelFields = {}) {
  return {
    summary: { avgWait: 3, served: 10 },
    waitDistByAttr: {
      tier: {
        Queue: {
          gold:   { n: 2, mean: 3, p50: 3, p90: 4, p95: 4, p99: 4, values: [2, 4] },
          silver: { n: 1, mean: 6, p50: 6, p90: 6, p95: 6, p99: 6, values: [6] },
        },
      },
    },
    ...detailLevelFields,
  };
}

describe('waitDistByAttr persistence round-trip', () => {
  it('persists raw values at "full" detail level', () => {
    const payload = buildPersistedResultsJson(makeResult(), { resultDetailLevel: 'full' });
    expect(payload.waitDistByAttr.tier.Queue.gold.values).toEqual([2, 4]);
    expect(payload.waitDistByAttr.tier.Queue.silver.values).toEqual([6]);
  });

  it('compacts values into histograms at "minimal" detail level', () => {
    const payload = buildPersistedResultsJson(makeResult(), { resultDetailLevel: 'minimal' });
    const gold = payload.waitDistByAttr.tier.Queue.gold;
    expect(gold.values).toBeUndefined();
    expect(gold.n).toBe(2);
    expect(gold.mean).toBe(3);
    expect(gold.histogram).toBeDefined();
    expect(payload._trimmed_fields).toContain('waitDistByAttr.values→histogram');
  });

  it('compacts values into histograms at "compact" detail level', () => {
    const payload = buildPersistedResultsJson(makeResult(), { resultDetailLevel: 'compact' });
    const silver = payload.waitDistByAttr.tier.Queue.silver;
    expect(silver.values).toBeUndefined();
    expect(silver.n).toBe(1);
    expect(payload._trimmed_fields).toContain('waitDistByAttr.values→histogram');
  });
});
