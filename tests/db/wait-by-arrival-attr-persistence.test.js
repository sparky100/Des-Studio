// Schema contract round-trip test (see CLAUDE.md): waitByArrivalAttr flows into
// results_json via buildPersistedResultsJson, so its persistence shape — and
// its compaction (raw points → binned buckets) at non-"full" detail levels,
// mirroring waitDistByAttr — needs explicit coverage.

import { describe, it, expect } from 'vitest';
import { buildPersistedResultsJson } from '../../src/db/results-persistence.js';

function makeResult(detailLevelFields = {}) {
  return {
    summary: { avgWait: 3, served: 10 },
    waitByArrivalAttr: {
      tier: {
        gold:   [[0, 2], [10, 4]],
        silver: [[5, 6]],
      },
    },
    ...detailLevelFields,
  };
}

describe('waitByArrivalAttr persistence round-trip', () => {
  it('persists raw [arrivalTime, wait] points at "full" detail level', () => {
    const payload = buildPersistedResultsJson(makeResult(), { resultDetailLevel: 'full' });
    expect(payload.waitByArrivalAttr.tier.gold).toEqual([[0, 2], [10, 4]]);
    expect(payload.waitByArrivalAttr.tier.silver).toEqual([[5, 6]]);
  });

  it('compacts points into arrival-time buckets at "minimal" detail level', () => {
    const payload = buildPersistedResultsJson(makeResult(), { resultDetailLevel: 'minimal' });
    const gold = payload.waitByArrivalAttr.tier.gold;
    expect(gold.points).toBeUndefined();
    expect(Array.isArray(gold.buckets)).toBe(true);
    expect(gold.buckets.length).toBeGreaterThan(0);
    const totalN = gold.buckets.reduce((sum, b) => sum + b.n, 0);
    expect(totalN).toBe(2);
    expect(payload._trimmed_fields).toContain('waitByArrivalAttr.points→buckets');
  });

  it('compacts points into arrival-time buckets at "compact" detail level', () => {
    const payload = buildPersistedResultsJson(makeResult(), { resultDetailLevel: 'compact' });
    const silver = payload.waitByArrivalAttr.tier.silver;
    expect(Array.isArray(silver.buckets)).toBe(true);
    expect(silver.buckets[0].n).toBe(1);
    expect(silver.buckets[0].mean).toBe(6);
    expect(payload._trimmed_fields).toContain('waitByArrivalAttr.points→buckets');
  });
});
