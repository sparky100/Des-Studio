// tests/ui/results/health-flags.test.js — H4/H6/L3/L7 capacity & balking flags
import { describe, test, expect } from "vitest";
import { evaluateResultsHealth, evaluateLiveHealth } from "../../../src/ui/results/healthFlags.js";

function makeModel(queues) {
  return { queues };
}

describe("evaluateResultsHealth — H4 (capacity blocking)", () => {
  test("no flag when capacity is set but blockingCount is 0", () => {
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    const results = { summary: { total: 100 }, perQueue: { "Main Queue": { blockingCount: 0, balkCount: 0 } } };
    const flags = evaluateResultsHealth(results, model);
    expect(flags.some(f => f.code === "H4")).toBe(false);
  });

  test("warning when blockingCount > 0 but below 10% of arrivals", () => {
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    const results = { summary: { total: 100 }, perQueue: { "Main Queue": { blockingCount: 3 } } };
    const flags = evaluateResultsHealth(results, model);
    const h4 = flags.find(f => f.code === "H4");
    expect(h4).toBeDefined();
    expect(h4.severity).toBe("warning");
    expect(h4.resource).toBe("Main Queue");
  });

  test("critical when blockingCount >= 10% of arrivals", () => {
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    const results = { summary: { total: 100 }, perQueue: { "Main Queue": { blockingCount: 15 } } };
    const flags = evaluateResultsHealth(results, model);
    const h4 = flags.find(f => f.code === "H4");
    expect(h4).toBeDefined();
    expect(h4.severity).toBe("critical");
  });

  test("queue-length-only scenario (no actual blocking) does not fire H4", () => {
    // Regression guard: peak queue length alone (the old, now-impossible-in-practice
    // signal) must not trigger H4 for a capacity-bound queue with no rejections.
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    const results = {
      summary: { total: 100 },
      runtimeMetrics: { max_queue_length_by_queue: { "Main Queue": 5 } },
      perQueue: { "Main Queue": { blockingCount: 0, balkCount: 0 } },
    };
    const flags = evaluateResultsHealth(results, model);
    expect(flags.some(f => f.code === "H4")).toBe(false);
  });

  test("unbounded queue branch unaffected — fires on peak > 50 regardless of perQueue", () => {
    const model = makeModel([{ name: "Unbounded Queue" }]);
    const results = {
      summary: { total: 100 },
      runtimeMetrics: { max_queue_length_by_queue: { "Unbounded Queue": 60 } },
    };
    const flags = evaluateResultsHealth(results, model);
    const h4 = flags.find(f => f.code === "H4");
    expect(h4).toBeDefined();
    expect(h4.severity).toBe("warning");
  });

  test("unbounded queue with peak <= 50 does not fire H4", () => {
    const model = makeModel([{ name: "Unbounded Queue" }]);
    const results = {
      summary: { total: 100 },
      runtimeMetrics: { max_queue_length_by_queue: { "Unbounded Queue": 50 } },
    };
    const flags = evaluateResultsHealth(results, model);
    expect(flags.some(f => f.code === "H4")).toBe(false);
  });
});

describe("evaluateResultsHealth — H6 (balking)", () => {
  test("no flag when balkCount is 0", () => {
    const model = makeModel([{ name: "Main Queue", balkProbability: 0.5 }]);
    const results = { summary: { total: 100 }, perQueue: { "Main Queue": { balkCount: 0 } } };
    const flags = evaluateResultsHealth(results, model);
    expect(flags.some(f => f.code === "H6")).toBe(false);
  });

  test("warning when balkCount > 0 but below 10% of arrivals", () => {
    const model = makeModel([{ name: "Main Queue", balkProbability: 0.5 }]);
    const results = { summary: { total: 100 }, perQueue: { "Main Queue": { balkCount: 5 } } };
    const flags = evaluateResultsHealth(results, model);
    const h6 = flags.find(f => f.code === "H6");
    expect(h6).toBeDefined();
    expect(h6.severity).toBe("warning");
  });

  test("critical when balkCount >= 10% of arrivals", () => {
    const model = makeModel([{ name: "Main Queue", balkProbability: 0.5 }]);
    const results = { summary: { total: 100 }, perQueue: { "Main Queue": { balkCount: 20 } } };
    const flags = evaluateResultsHealth(results, model);
    const h6 = flags.find(f => f.code === "H6");
    expect(h6).toBeDefined();
    expect(h6.severity).toBe("critical");
  });

  test("queue-length-only scenario (no actual balking) does not fire H6", () => {
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    const results = {
      summary: { total: 100 },
      runtimeMetrics: { max_queue_length_by_queue: { "Main Queue": 7 } },
      perQueue: { "Main Queue": { blockingCount: 0, balkCount: 0 } },
    };
    const flags = evaluateResultsHealth(results, model);
    expect(flags.some(f => f.code === "H6")).toBe(false);
  });
});

describe("evaluateLiveHealth — L3 (capacity blocking)", () => {
  test("no flag when blockingCount is 0", () => {
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    const summary = { perQueue: { "Main Queue": { blockingCount: 0 } } };
    const flags = evaluateLiveHealth({}, summary, model);
    expect(flags.some(f => f.code === "L3")).toBe(false);
  });

  test("warning when blockingCount > 0", () => {
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    const summary = { perQueue: { "Main Queue": { blockingCount: 2 } } };
    const flags = evaluateLiveHealth({}, summary, model);
    const l3 = flags.find(f => f.code === "L3");
    expect(l3).toBeDefined();
    expect(l3.severity).toBe("warning");
  });

  test("queue depth alone (waiting > capacity in snap) does not fire L3", () => {
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    const snap = { byQueue: { "Main Queue": { waiting: 9 } } };
    const summary = { perQueue: { "Main Queue": { blockingCount: 0 } } };
    const flags = evaluateLiveHealth(snap, summary, model);
    expect(flags.some(f => f.code === "L3")).toBe(false);
  });
});

describe("evaluateLiveHealth — L7 (balking)", () => {
  test("no flag when balkCount is 0", () => {
    const model = makeModel([{ name: "Main Queue", balkProbability: 0.5 }]);
    const summary = { perQueue: { "Main Queue": { balkCount: 0 } } };
    const flags = evaluateLiveHealth({}, summary, model);
    expect(flags.some(f => f.code === "L7")).toBe(false);
  });

  test("warning when balkCount > 0", () => {
    const model = makeModel([{ name: "Main Queue", balkProbability: 0.5 }]);
    const summary = { perQueue: { "Main Queue": { balkCount: 4 } } };
    const flags = evaluateLiveHealth({}, summary, model);
    const l7 = flags.find(f => f.code === "L7");
    expect(l7).toBeDefined();
    expect(l7.severity).toBe("warning");
  });
});
