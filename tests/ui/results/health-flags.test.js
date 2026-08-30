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

describe("evaluateResultsHealth — H4 (capacity blocking) with a batch of replications", () => {
  test("displayed count is the per-run average, not the batch-wide total", () => {
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    // blockingCount is stored summed across all replications (batch convention) —
    // 50 rejections across 10 reps is 5/run, matching the rest of the results view.
    const results = { summary: { total: 1000 }, perQueue: { "Main Queue": { blockingCount: 50 } } };
    const flags = evaluateResultsHealth(results, model, 10);
    const h4 = flags.find(f => f.code === "H4");
    expect(h4).toBeDefined();
    expect(h4.message).toContain("rejected 5 arrival(s)");
    expect(h4.message).not.toContain("50");
  });

  test("with no repCount given (single run), the raw total is shown unchanged", () => {
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    const results = { summary: { total: 100 }, perQueue: { "Main Queue": { blockingCount: 15 } } };
    const flags = evaluateResultsHealth(results, model);
    const h4 = flags.find(f => f.code === "H4");
    expect(h4.message).toContain("rejected 15 arrival(s)");
  });

  test("severity is still driven by the batch-wide percentage, not the averaged count", () => {
    const model = makeModel([{ name: "Main Queue", capacity: 5 }]);
    // 150/1000 = 15% of all arrivals, well over the 10% critical threshold,
    // even though the per-run average (15) looks small in isolation.
    const results = { summary: { total: 1000 }, perQueue: { "Main Queue": { blockingCount: 150 } } };
    const flags = evaluateResultsHealth(results, model, 10);
    const h4 = flags.find(f => f.code === "H4");
    expect(h4.severity).toBe("critical");
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

describe("evaluateResultsHealth — H6 (balking) with a batch of replications", () => {
  test("displayed count is the per-run average, not the batch-wide total", () => {
    const model = makeModel([{ name: "Main Queue", balkProbability: 0.5 }]);
    // balkCount is stored summed across all replications — 40 across 5 reps is 8/run.
    const results = { summary: { total: 500 }, perQueue: { "Main Queue": { balkCount: 40 } } };
    const flags = evaluateResultsHealth(results, model, 5);
    const h6 = flags.find(f => f.code === "H6");
    expect(h6).toBeDefined();
    expect(h6.message).toContain("8 entities balked");
    expect(h6.message).not.toContain("40 entities");
  });
});

describe("evaluateResultsHealth — H11 (zombie asset) with a batch of replications", () => {
  test("per-run arrival count (not the batch total) sets the inter-arrival baseline", () => {
    const model = makeModel([]);
    const baseResults = (total) => ({
      summary: {
        total,
        avgSojourn: 10,
        maxSimTime: 100,
        perResource: { Server1: { maxSustainedZeroUtil: 40 } },
      },
    });
    // Single run: 20 arrivals over 100 time units → avg inter-arrival 5 → idle-for-40 is > 5x → flags.
    const singleRun = evaluateResultsHealth(baseResults(20), model, 1);
    expect(singleRun.some(f => f.code === "H11")).toBe(true);

    // Same per-run arrival rate, but stored as a 5-replication batch total (100 = 20/run).
    // Using the raw batch total instead of the per-run average would inflate the
    // apparent arrival rate 5x and suppress this flag — it must still fire.
    const batch = evaluateResultsHealth(baseResults(100), model, 5);
    expect(batch.some(f => f.code === "H11")).toBe(true);
  });
});

describe("evaluateResultsHealth — H12 (chart data auto-disabled)", () => {
  test("flag present when collection was requested but skipped", () => {
    const model = makeModel([]);
    const results = { summary: { total: 100 }, _requested_collect_time_series: true, _effective_collect_time_series: false };
    const flags = evaluateResultsHealth(results, model);
    const h12 = flags.find(f => f.code === "H12");
    expect(h12).toBeDefined();
    expect(h12.severity).toBe("warning");
  });

  test("no flag when collection was requested and succeeded", () => {
    const model = makeModel([]);
    const results = { summary: { total: 100 }, _requested_collect_time_series: true, _effective_collect_time_series: true };
    const flags = evaluateResultsHealth(results, model);
    expect(flags.some(f => f.code === "H12")).toBe(false);
  });

  test("no flag when fields are absent (normal runs untouched)", () => {
    const model = makeModel([]);
    const results = { summary: { total: 100 } };
    const flags = evaluateResultsHealth(results, model);
    expect(flags.some(f => f.code === "H12")).toBe(false);
  });
});

describe("evaluateResultsHealth — H13 (cycle limit reached)", () => {
  test("flag present and critical when the run hit its cycle limit", () => {
    const model = makeModel([]);
    const results = { summary: { total: 100 }, cycleLimitReached: true };
    const flags = evaluateResultsHealth(results, model);
    const h13 = flags.find(f => f.code === "H13");
    expect(h13).toBeDefined();
    expect(h13.severity).toBe("critical");
  });

  test("no flag when the run completed within its cycle cap", () => {
    const model = makeModel([]);
    const results = { summary: { total: 100 }, cycleLimitReached: false };
    const flags = evaluateResultsHealth(results, model);
    expect(flags.some(f => f.code === "H13")).toBe(false);
  });

  test("no flag when the field is absent (normal runs untouched)", () => {
    const model = makeModel([]);
    const results = { summary: { total: 100 } };
    const flags = evaluateResultsHealth(results, model);
    expect(flags.some(f => f.code === "H13")).toBe(false);
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
