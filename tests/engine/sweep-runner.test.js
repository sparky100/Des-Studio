import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock runReplications
const mockRunReplications = vi.fn();
vi.mock("../../src/engine/replication-runner.js", () => ({
  runReplications: (...args) => mockRunReplications(...args),
}));

import { runSweep } from "../../src/engine/sweep-runner.js";

function makeMockReplications(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => ({
    replicationIndex: i,
    seed: overrides.baseSeed + i,
    result: {
      summary: {
        served: 100 + i,
        reneged: 5 + i,
        total: 105 + i,
        avgWait: 2.5 + i * 0.1,
        avgSvc: 1.0,
        avgSojourn: 3.5 + i * 0.1,
      },
    },
  }));
}

function wrapReplications(options) {
  const { model, replications, baseSeed, onProgress, onReplicationComplete, onComplete, onError, onCancelled } = options;
  const results = makeMockReplications(replications, { baseSeed });
  // Simulate async completion
  setTimeout(() => {
    results.forEach((r, i) => {
      onReplicationComplete?.(r, { completed: i + 1, total: replications });
    });
    onComplete?.(results);
  }, 0);
  return { cancel: vi.fn() };
}

beforeEach(() => {
  mockRunReplications.mockImplementation(wrapReplications);
});

describe("runSweep", () => {
  const model = {
    entityTypes: [{ id: "et_srv", name: "Server", count: "1" }],
    queues: [],
    bEvents: [],
    cEvents: [],
    stateVariables: [],
  };

  const paramConfig = {
    type: "entityTypeCount",
    targetId: "et_srv",
    label: "Server.count",
  };

  test("runs across all sweep values and returns results", async () => {
    const results = await new Promise((resolve, reject) => {
      const runner = runSweep({
        model,
        paramConfig,
        min: 1,
        max: 3,
        step: 1,
        replications: 2,
        onError: reject,
        onComplete: resolve,
      });
    });

    expect(results.length).toBe(3);
    expect(results[0].value).toBe(1);
    expect(results[1].value).toBe(2);
    expect(results[2].value).toBe(3);
  });

  test("each sweep point has aggregateStats", async () => {
    const results = await new Promise((resolve, reject) => {
      const runner = runSweep({
        model, paramConfig, min: 1, max: 2, step: 1, replications: 2,
        onError: reject, onComplete: resolve,
      });
    });

    expect(results.length).toBe(2);
    for (const pt of results) {
      expect(pt.aggregateStats).toBeDefined();
      expect(pt.aggregateStats["summary.served"]).toBeDefined();
      expect(pt.aggregateStats["summary.served"].mean).toBeDefined();
    }
  });

  test("calls onProgress during sweep", async () => {
    const progressSpy = vi.fn();

    await new Promise((resolve, reject) => {
      const runner = runSweep({
        model, paramConfig, min: 1, max: 2, step: 1, replications: 1,
        onProgress: progressSpy,
        onError: reject,
        onComplete: resolve,
      });
    });

    expect(progressSpy).toHaveBeenCalled();
    const progressCalls = progressSpy.mock.calls;
    // Should have progress for starting point 1 and point 2
    expect(progressCalls.some(c => c[0].currentPoint === 0)).toBe(true);
    expect(progressCalls.some(c => c[0].currentPoint === 1)).toBe(true);
  });

  test("calls onPointComplete for each point", async () => {
    const pointSpy = vi.fn();

    await new Promise((resolve, reject) => {
      const runner = runSweep({
        model, paramConfig, min: 1, max: 3, step: 1, replications: 1,
        onPointComplete: pointSpy,
        onError: reject,
        onComplete: resolve,
      });
    });

    expect(pointSpy).toHaveBeenCalledTimes(3);
  });

  test("cancellation stops after current point", async () => {
    let completed = 0;

    const results = await new Promise((resolve, reject) => {
      const onPointComplete = () => {
        completed++;
        if (completed === 2) {
          runner.cancel();
        }
      };

      const runner = runSweep({
        model, paramConfig, min: 1, max: 5, step: 1, replications: 1,
        onPointComplete,
        onError: reject,
        onCancelled: resolve,
        onComplete: (all) => resolve(all),
      });
    });

    // Should stop after point 2 (some points may have completed before cancel takes effect)
    expect(results.completedPoints).toBeGreaterThanOrEqual(1);
    expect(results.completedPoints).toBeLessThanOrEqual(3);
  });

  test("handles single value sweep (min === max)", async () => {
    const results = await new Promise((resolve, reject) => {
      const runner = runSweep({
        model, paramConfig, min: 2, max: 2, step: 1, replications: 2,
        onError: reject,
        onComplete: resolve,
      });
    });

    expect(results.length).toBe(1);
    expect(results[0].value).toBe(2);
  });

  test("assigns unique seeds per sweep point", async () => {
    const results = await new Promise((resolve, reject) => {
      const runner = runSweep({
        model, paramConfig, min: 1, max: 3, step: 1, replications: 2, baseSeed: 42,
        onError: reject,
        onComplete: resolve,
      });
    });

    expect(results[0].seed).toBe(42);
    expect(results[1].seed).toBe(10042);
    expect(results[2].seed).toBe(20042);
  });
});
