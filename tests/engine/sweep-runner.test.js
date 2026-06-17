import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock runReplications
const mockRunReplications = vi.fn();
vi.mock("../../src/engine/replication-runner.js", () => ({
  runReplications: (...args) => mockRunReplications(...args),
  createReplicationPool: () => ({ destroyed: false, get: vi.fn(), destroy: vi.fn() }),
}));

import { runSweep, run2DSweep, runSweepOffthread } from "../../src/engine/sweep-runner.js";

function makeMockReplications(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => ({
    replicationIndex: i,
    seed: (overrides.baseSeed ?? 0) + i,
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
  const { replications, baseSeed, onReplicationComplete, onComplete } = options;
  const results = makeMockReplications(replications, { baseSeed });
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

describe("runSweep", () => {
  test("runs across all sweep values and returns results", async () => {
    const results = await new Promise((resolve, reject) => {
      runSweep({
        model, paramConfig, min: 1, max: 3, step: 1, replications: 2,
        onError: reject, onComplete: resolve,
      });
    });

    expect(results.length).toBe(3);
    expect(results[0].value).toBe(1);
    expect(results[1].value).toBe(2);
    expect(results[2].value).toBe(3);
  });

  test("each sweep point has aggregateStats", async () => {
    const results = await new Promise((resolve, reject) => {
      runSweep({
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
      runSweep({
        model, paramConfig, min: 1, max: 2, step: 1, replications: 1,
        onProgress: progressSpy, onError: reject, onComplete: resolve,
      });
    });

    expect(progressSpy).toHaveBeenCalled();
    const progressCalls = progressSpy.mock.calls;
    expect(progressCalls.some(c => c[0].currentPoint === 0)).toBe(true);
    expect(progressCalls.some(c => c[0].currentPoint === 1)).toBe(true);
  });

  test("calls onPointComplete for each point", async () => {
    const pointSpy = vi.fn();

    await new Promise((resolve, reject) => {
      runSweep({
        model, paramConfig, min: 1, max: 3, step: 1, replications: 1,
        onPointComplete: pointSpy, onError: reject, onComplete: resolve,
      });
    });

    expect(pointSpy).toHaveBeenCalledTimes(3);
  });

  test("cancellation stops after current point", async () => {
    let completed = 0;

    const result = await new Promise((resolve, reject) => {
      const onPointComplete = () => {
        completed++;
        if (completed === 2) runner.cancel();
      };

      const runner = runSweep({
        model, paramConfig, min: 1, max: 5, step: 1, replications: 1,
        onPointComplete, onError: reject,
        onCancelled: resolve,
        onComplete: (all) => resolve(all),
      });
    });

    // onCancelled resolves with { completedPoints, results, totalPoints }
    expect(result.completedPoints).toBeGreaterThanOrEqual(1);
    expect(result.completedPoints).toBeLessThanOrEqual(3);
  });

  test("handles single value sweep (min === max)", async () => {
    const results = await new Promise((resolve, reject) => {
      runSweep({
        model, paramConfig, min: 2, max: 2, step: 1, replications: 2,
        onError: reject, onComplete: resolve,
      });
    });

    expect(results.length).toBe(1);
    expect(results[0].value).toBe(2);
  });

  test("assigns unique seeds per sweep point", async () => {
    const results = await new Promise((resolve, reject) => {
      runSweep({
        model, paramConfig, min: 1, max: 3, step: 1, replications: 2, baseSeed: 42,
        onError: reject, onComplete: resolve,
      });
    });

    expect(results[0].seed).toBe(42);
    expect(results[1].seed).toBe(10042);
    expect(results[2].seed).toBe(20042);
  });

  test("pointResult does not include pointModel", async () => {
    const results = await new Promise((resolve, reject) => {
      runSweep({
        model, paramConfig, min: 1, max: 2, step: 1, replications: 1,
        onError: reject, onComplete: resolve,
      });
    });

    for (const pt of results) {
      expect(pt).not.toHaveProperty("pointModel");
    }
  });
});

describe("run2DSweep", () => {
  const paramConfigB = {
    type: "entityTypeCount",
    targetId: "et_srv",
    label: "Server.count",
  };

  test("runs all grid points and calls onComplete", async () => {
    const results = await new Promise((resolve, reject) => {
      run2DSweep({
        model,
        paramConfigs: [paramConfig, paramConfigB],
        ranges: [
          { min: 1, max: 2, step: 1 },
          { min: 10, max: 20, step: 10 },
        ],
        replications: 1,
        onError: reject,
        onComplete: resolve,
      });
    });

    // 2 values × 2 values = 4 grid points
    expect(results.length).toBe(4);
    for (const pt of results) {
      expect(pt.aggregateStats).toBeDefined();
      expect(pt.valueA).toBeDefined();
      expect(pt.valueB).toBeDefined();
    }
  });

  test("assigns unique seeds per grid point (baseSeed + pointIndex * 10000)", async () => {
    const points = [];
    await new Promise((resolve, reject) => {
      run2DSweep({
        model,
        paramConfigs: [paramConfig, paramConfigB],
        ranges: [
          { min: 1, max: 2, step: 1 },
          { min: 10, max: 20, step: 10 },
        ],
        replications: 1,
        baseSeed: 7,
        onPointComplete: (pt) => points.push(pt),
        onError: reject,
        onComplete: resolve,
      });
    });

    const seeds = points.map(p => p.seed).sort((a, b) => a - b);
    expect(seeds[0]).toBe(7);          // pointIndex 0
    expect(seeds[1]).toBe(10007);      // pointIndex 1
    expect(seeds[2]).toBe(20007);      // pointIndex 2
    expect(seeds[3]).toBe(30007);      // pointIndex 3
  });

  test("calls onPointComplete for each grid point", async () => {
    const completedPoints = [];

    await new Promise((resolve, reject) => {
      run2DSweep({
        model,
        paramConfigs: [paramConfig, paramConfigB],
        ranges: [
          { min: 1, max: 3, step: 1 },
          { min: 1, max: 2, step: 1 },
        ],
        replications: 1,
        onPointComplete: (pt, meta) => completedPoints.push(meta),
        onError: reject,
        onComplete: resolve,
      });
    });

    expect(completedPoints.length).toBe(6); // 3 × 2
    expect(completedPoints[completedPoints.length - 1].totalPoints).toBe(6);
  });

  test("cancellation stops sweep and calls onCancelled with partial results", async () => {
    let completed = 0;

    const result = await new Promise((resolve, reject) => {
      const onPointComplete = () => {
        completed++;
        if (completed === 2) runner.cancel();
      };

      const runner = run2DSweep({
        model,
        paramConfigs: [paramConfig, paramConfigB],
        ranges: [
          { min: 1, max: 5, step: 1 },
          { min: 1, max: 2, step: 1 },
        ],
        replications: 1,
        onPointComplete,
        onError: reject,
        onCancelled: resolve,
        onComplete: (all) => resolve(all),
      });
    });

    expect(result.completedPoints).toBeGreaterThanOrEqual(1);
    expect(result.completedPoints).toBeLessThanOrEqual(3);
    expect(result.totalPoints).toBe(10);
  });

  test("pointResult does not include pointModel", async () => {
    const results = await new Promise((resolve, reject) => {
      run2DSweep({
        model,
        paramConfigs: [paramConfig, paramConfigB],
        ranges: [{ min: 1, max: 2, step: 1 }, { min: 1, max: 2, step: 1 }],
        replications: 1,
        onError: reject,
        onComplete: resolve,
      });
    });

    for (const pt of results) {
      expect(pt).not.toHaveProperty("pointModel");
    }
  });

  test("throws when paramConfigs or ranges are not length 2", () => {
    expect(() => run2DSweep({ model, paramConfigs: [paramConfig], ranges: [{ min: 1, max: 2, step: 1 }] }))
      .toThrow("run2DSweep requires exactly 2 paramConfigs and 2 ranges");
  });
});

describe("runSweepOffthread", () => {
  test("falls back to run2DSweep when Worker is undefined", async () => {
    // In node, Worker is undefined — runSweepOffthread delegates to run2DSweep
    const results = await new Promise((resolve, reject) => {
      runSweepOffthread({
        model,
        paramConfigs: [paramConfig, paramConfig],
        ranges: [{ min: 1, max: 2, step: 1 }, { min: 1, max: 2, step: 1 }],
        replications: 1,
        onError: reject,
        onComplete: resolve,
      });
    });

    expect(results.length).toBe(4);
  });
});
