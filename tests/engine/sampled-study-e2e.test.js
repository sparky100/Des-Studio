// End-to-end sampled study: runs the REAL engine (no mocked
// replication-runner/buildEngine) through runSampledStudy(), enumerating
// real sweepable parameters off a real template model, then feeds the
// results into computeSensitivityRanking() — the whole Phase 2 pipeline,
// top to bottom. Kept small (3 points x 2 replications = 6 replications
// of a tiny M/M/1 model) to stay in the fast unit tier.

import { describe, test, expect } from "vitest";
import { TEMPLATES } from "../../src/engine/templates.js";
import { enumerateSweepableParams } from "../../src/engine/sweep-params.js";
import { runSampledStudy } from "../../src/engine/sweep-runner.js";
import { computeSensitivityRanking } from "../../src/engine/sweep-sensitivity.js";

describe("sampled study — end to end (real engine)", () => {
  const mm1 = TEMPLATES.find(t => t.name === "M/M/1 Queue");
  const allParams = enumerateSweepableParams(mm1);
  const serverCountParam = allParams.find(p => p.type === "entityTypeCount");
  const arrivalMeanParam = allParams.find(p => p.type === "bEventDistParam" && p.label.startsWith("Arrival"));

  const parameters = [
    { ...serverCountParam, range: { min: 1, max: 3 } },
    { ...arrivalMeanParam, range: { min: 1, max: 4 } },
  ];

  test("runs to completion against the real engine and produces per-point aggregate stats", async () => {
    const results = await new Promise((resolve, reject) => {
      runSampledStudy({
        model: mm1,
        parameters,
        points: 3,
        replications: 2,
        baseSeed: 123,
        maxSimTime: 200,
        onError: reject,
        onComplete: resolve,
      });
    });

    expect(results).toHaveLength(3);
    for (const pt of results) {
      expect(pt.params).toHaveLength(2);
      // Sampled server count lands on the integer lattice within [1,3];
      // arrival mean stays continuous within [1,4].
      expect(Number.isInteger(pt.params[0].value)).toBe(true);
      expect(pt.params[0].value).toBeGreaterThanOrEqual(1);
      expect(pt.params[0].value).toBeLessThanOrEqual(3);
      expect(pt.params[1].value).toBeGreaterThanOrEqual(1);
      expect(pt.params[1].value).toBeLessThanOrEqual(4);

      expect(pt.replications).toHaveLength(2);
      expect(pt.aggregateStats["summary.served"].mean).toBeGreaterThan(0);
      expect(pt.aggregateStats["summary.avgWait"].mean).not.toBeNull();
    }
  }, 30000);

  test("feeds real results into computeSensitivityRanking without error", async () => {
    const results = await new Promise((resolve, reject) => {
      runSampledStudy({
        model: mm1,
        parameters,
        points: 5,
        replications: 2,
        baseSeed: 456,
        maxSimTime: 200,
        onError: reject,
        onComplete: resolve,
      });
    });

    const { method, ranking } = computeSensitivityRanking(results, parameters, "summary.avgWait");
    expect(method).toMatch(/Pearson correlation/);
    expect(ranking).toHaveLength(2);
    for (const entry of ranking) {
      expect(entry.correlation === null || Number.isFinite(entry.correlation)).toBe(true);
      expect(entry.sampleSize).toBeGreaterThanOrEqual(0);
    }
  }, 30000);
});
