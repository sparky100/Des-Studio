// Schema Contract round-trip test (see CLAUDE.md): timeSeries[].byContainer is a
// new persisted field (per-sample container level). Confirm it survives
// buildPersistedResultsJson at "full", "compact" and "minimal" detail levels.

import { describe, it, expect } from "vitest";
import { buildPersistedResultsJson } from "../../src/db/results-persistence.js";

function buildResult() {
  return {
    summary: { served: 4 },
    timeSeries: [
      { t: 0, byQueue: {}, byType: {}, byContainer: { ct_products: 112.4, ct_backlog: 0 }, wip: 0, completed: 0 },
      { t: 1, byQueue: {}, byType: {}, byContainer: { ct_products: 0, ct_backlog: 3 }, wip: 1, completed: 0 },
      { t: 2, byQueue: {}, byType: {}, byContainer: { ct_products: 40, ct_backlog: 1 }, wip: 0, completed: 1 },
    ],
  };
}

describe("timeSeries.byContainer survives persistence round-trip", () => {
  it("is kept untouched at 'full' detail", () => {
    const payload = JSON.parse(JSON.stringify(buildPersistedResultsJson(buildResult(), { resultDetailLevel: "full" })));
    expect(payload.timeSeries.map(pt => pt.byContainer)).toEqual(buildResult().timeSeries.map(pt => pt.byContainer));
  });

  for (const level of ["compact", "minimal"]) {
    it(`is kept on every sampled point at '${level}' detail`, () => {
      const payload = JSON.parse(JSON.stringify(buildPersistedResultsJson(buildResult(), { resultDetailLevel: level })));
      expect(payload.timeSeries.length).toBeGreaterThan(0);
      for (const pt of payload.timeSeries) {
        expect(typeof pt.byContainer.ct_products).toBe("number");
        expect(typeof pt.byContainer.ct_backlog).toBe("number");
      }
    });
  }
});
