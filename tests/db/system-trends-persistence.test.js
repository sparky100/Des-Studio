// Schema Contract round-trip test (see CLAUDE.md): timeSeries[].wip/.completed
// and sojournDist are new persisted fields added for the "System-Level Trends"
// Results section. This confirms they survive buildPersistedResultsJson at
// both "compact" (sampled/histogram) and "full" (untouched) detail levels,
// the same way waitDist already does.

import { describe, it, expect } from "vitest";
import { buildPersistedResultsJson } from "../../src/db/results-persistence.js";

function buildResult() {
  return {
    summary: { avgWait: 3, served: 4 },
    timeSeries: [
      { t: 0, byQueue: {}, byType: { Machine: { total: 2, failed: 0 } }, wip: 1, completed: 0 },
      { t: 1, byQueue: {}, byType: { Machine: { total: 2, failed: 1 } }, wip: 2, completed: 1 },
      { t: 2, byQueue: {}, byType: { Machine: { total: 2, failed: 1 } }, wip: 1, completed: 2 },
      { t: 3, byQueue: {}, byType: { Machine: { total: 2, failed: 0 } }, wip: 0, completed: 1 },
    ],
    sojournDist: { n: 4, mean: 5, p50: 5, p90: 6, p95: 6, p99: 6, values: [4, 5, 5, 6] },
  };
}

describe("system-level trend fields survive persistence round-trip", () => {
  it("keeps timeSeries.wip/.completed and sojournDist.values untouched at 'full' detail", () => {
    const payload = buildPersistedResultsJson(buildResult(), { resultDetailLevel: "full" });

    expect(payload.timeSeries.map(pt => pt.wip)).toEqual([1, 2, 1, 0]);
    expect(payload.timeSeries.map(pt => pt.completed)).toEqual([0, 1, 2, 1]);
    expect(payload.timeSeries.map(pt => pt.byType.Machine.failed)).toEqual([0, 1, 1, 0]);
    expect(payload.sojournDist.values).toEqual([4, 5, 5, 6]);
    expect(payload.sojournDist.n).toBe(4);
  });

  it("preserves wip/completed on sampled points and compacts sojournDist to a histogram at 'compact' detail", () => {
    const payload = buildPersistedResultsJson(buildResult(), { resultDetailLevel: "compact" });

    expect(Array.isArray(payload.timeSeries)).toBe(true);
    expect(payload.timeSeries.length).toBeGreaterThan(0);
    for (const pt of payload.timeSeries) {
      expect(typeof pt.wip).toBe("number");
      expect(typeof pt.completed).toBe("number");
    }

    expect(payload.sojournDist.values).toBeUndefined();
    expect(payload.sojournDist.n).toBe(4);
    expect(payload.sojournDist.mean).toBe(5);
    expect(payload.sojournDist.histogram).not.toBeNull();
    expect(Array.isArray(payload.sojournDist.histogram.bins)).toBe(true);
  });
});
