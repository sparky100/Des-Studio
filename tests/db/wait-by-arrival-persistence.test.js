// Schema contract round-trip test (see CLAUDE.md): waitByArrival flows into
// results_json via buildPersistedResultsJson, so its persistence shape — and
// its compaction (raw points → binned buckets) at non-"full" detail levels —
// needs explicit coverage.

import { describe, it, expect } from 'vitest';
import { buildPersistedResultsJson } from '../../src/db/results-persistence.js';

function makeResult(detailLevelFields = {}) {
  return {
    summary: { avgWait: 3, served: 10 },
    waitByArrival: [[0, 2], [5, 6], [10, 4]],
    ...detailLevelFields,
  };
}

describe('waitByArrival persistence round-trip', () => {
  it('persists raw [arrivalTime, wait] points at "full" detail level', () => {
    const payload = buildPersistedResultsJson(makeResult(), { resultDetailLevel: 'full' });
    expect(payload.waitByArrival).toEqual([[0, 2], [5, 6], [10, 4]]);
  });

  it('compacts points into arrival-time buckets at "minimal" detail level', () => {
    const payload = buildPersistedResultsJson(makeResult(), { resultDetailLevel: 'minimal' });
    expect(payload.waitByArrival.points).toBeUndefined();
    expect(Array.isArray(payload.waitByArrival.buckets)).toBe(true);
    expect(payload.waitByArrival.buckets.length).toBeGreaterThan(0);
    const totalN = payload.waitByArrival.buckets.reduce((sum, b) => sum + b.n, 0);
    expect(totalN).toBe(3);
    expect(payload._trimmed_fields).toContain('waitByArrival.points→buckets');
  });

  it('compacts points into arrival-time buckets at "compact" detail level', () => {
    const payload = buildPersistedResultsJson(makeResult(), { resultDetailLevel: 'compact' });
    expect(Array.isArray(payload.waitByArrival.buckets)).toBe(true);
    const totalN = payload.waitByArrival.buckets.reduce((sum, b) => sum + b.n, 0);
    expect(totalN).toBe(3);
    expect(payload._trimmed_fields).toContain('waitByArrival.points→buckets');
  });
});
