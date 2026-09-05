import { describe, test, expect } from "vitest";
import { computeSensitivityRanking, SENSITIVITY_METHOD_DESCRIPTION } from "../../src/engine/sweep-sensitivity.js";

const paramA = { path: "entityTypes.et1.count", label: "Server count" };
const paramB = { path: "bEvents.b1.schedules.distParams.mean", label: "Arrival mean" };

function point(a, b, objectiveMean) {
  return {
    params: [{ path: paramA.path, value: a }, { path: paramB.path, value: b }],
    aggregateStats: { "summary.avgWait": { mean: objectiveMean } },
  };
}

describe("computeSensitivityRanking", () => {
  test("always returns the method description, even with no data", () => {
    const { method } = computeSensitivityRanking([], [paramA], "summary.avgWait");
    expect(method).toBe(SENSITIVITY_METHOD_DESCRIPTION);
  });

  test("returns an empty ranking when there are fewer than 2 points", () => {
    const { ranking } = computeSensitivityRanking([point(1, 1, 5)], [paramA], "summary.avgWait");
    expect(ranking).toEqual([]);
  });

  test("returns an empty ranking when no objective metric path is given", () => {
    const points = [point(1, 1, 5), point(2, 2, 10)];
    const { ranking } = computeSensitivityRanking(points, [paramA], null);
    expect(ranking).toEqual([]);
  });

  test("ranks a strongly-correlated parameter above an uncorrelated one", () => {
    // paramA (server count) drives the objective almost perfectly (more
    // servers -> lower wait); paramB (arrival mean) is held constant, so it
    // has zero variance and therefore no linear signal.
    const points = [
      point(1, 2, 20),
      point(2, 2, 15),
      point(3, 2, 10),
      point(4, 2, 5),
      point(5, 2, 1),
    ];
    const { ranking } = computeSensitivityRanking(points, [paramA, paramB], "summary.avgWait");
    expect(ranking).toHaveLength(2);
    expect(ranking[0].path).toBe(paramA.path);
    expect(ranking[0].correlation).toBeLessThan(-0.9); // more servers -> lower wait
    expect(ranking[1].path).toBe(paramB.path);
    expect(ranking[1].correlation).toBeNull(); // constant across all points — no signal
  });

  test("reports a positive correlation when the parameter and objective move together", () => {
    const points = [
      point(1, 1, 1),
      point(2, 1, 2),
      point(3, 1, 3),
      point(4, 1, 4),
    ];
    const { ranking } = computeSensitivityRanking(points, [paramA], "summary.avgWait");
    expect(ranking[0].correlation).toBeGreaterThan(0.99);
  });

  test("ignores points missing a finite value for the parameter or the objective", () => {
    const points = [
      point(1, 1, 10),
      { params: [{ path: paramA.path, value: null }], aggregateStats: { "summary.avgWait": { mean: 20 } } },
      point(2, 1, 5),
      point(3, 1, 1),
    ];
    const { ranking } = computeSensitivityRanking(points, [paramA], "summary.avgWait");
    expect(ranking[0].sampleSize).toBe(3);
  });

  test("reads metrics from either `metrics` (StudyPoint shape) or `aggregateStats` (in-memory sweep-runner shape)", () => {
    const points = [
      { params: [{ path: paramA.path, value: 1 }], metrics: { "summary.avgWait": { mean: 10 } } },
      { params: [{ path: paramA.path, value: 2 }], metrics: { "summary.avgWait": { mean: 5 } } },
      { params: [{ path: paramA.path, value: 3 }], metrics: { "summary.avgWait": { mean: 1 } } },
    ];
    const { ranking } = computeSensitivityRanking(points, [paramA], "summary.avgWait");
    expect(ranking[0].correlation).toBeLessThan(0);
  });
});
