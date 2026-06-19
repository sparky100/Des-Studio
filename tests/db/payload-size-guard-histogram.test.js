// Regression test for a double-compaction bug: the payload-size guard in
// buildPersistedResultsJson re-ran compactifyWaitDist/compactifyArrivalSeries
// unconditionally, even though the "compact" detail-level branch above it had
// already converted .values/.points into histogram/buckets. Calling those
// helpers a second time finds no raw values left and silently nulls the
// histogram, which hides the "How much time is spent queueing?" and
// "Did wait get worse for later arrivals?" Results sections entirely. The
// guard must only re-compact when detailLevel === "full" (its first pass).

import { describe, it, expect } from 'vitest';
import { buildPersistedResultsJson } from '../../src/db/results-persistence.js';

function buildOversizedConfig() {
  // The "compact" branch already trims entitySummary/timeSeries/waitDist/
  // waitByArrival, but does NOT trim `replications` (that only happens in the
  // "minimal" branch and in the size-guard block itself). A large
  // replications array survives compact-level trimming and pushes the
  // payload over PAYLOAD_SAFE_BYTES, forcing the guard block to run after
  // waitDist/waitByArrival have already been compacted once.
  const replicationResults = Array.from({ length: 4000 }, (_, i) => ({
    replicationIndex: i,
    seed: i,
    summary: { avgWait: 3, served: 10, note: 'x'.repeat(120) },
    finalTime: 100,
  }));
  return {
    resultDetailLevel: 'compact',
    replicationResults,
  };
}

function buildResult() {
  return {
    summary: { avgWait: 3, served: 10 },
    waitDist: { Main: { n: 4, mean: 3, p50: 3, p90: 4, p95: 4, p99: 4, values: [1, 2, 3, 4] } },
    waitByArrival: [[0, 2], [5, 6], [10, 4], [15, 3]],
  };
}

describe('payload-size guard does not double-compact already-compacted fields', () => {
  it('keeps waitDist.histogram non-null after a "compact" save is auto-trimmed', () => {
    const payload = buildPersistedResultsJson(buildResult(), buildOversizedConfig());

    expect(payload._auto_trim_reason).toBe('payload_size_guard');
    expect(payload.waitDist.Main.values).toBeUndefined();
    expect(payload.waitDist.Main.histogram).not.toBeNull();
    expect(Array.isArray(payload.waitDist.Main.histogram.bins)).toBe(true);
  });

  it('keeps waitByArrival.buckets populated after a "compact" save is auto-trimmed', () => {
    const payload = buildPersistedResultsJson(buildResult(), buildOversizedConfig());

    expect(Array.isArray(payload.waitByArrival.buckets)).toBe(true);
    const totalN = payload.waitByArrival.buckets.reduce((sum, b) => sum + b.n, 0);
    expect(totalN).toBe(4);
  });
});
