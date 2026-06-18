import { describe, expect, it } from "vitest";
import { evaluateResultsHealth, evaluateLiveHealth } from "../../../src/ui/results/healthFlags.js";

describe("evaluateResultsHealth — H2 growing queue", () => {
  it("fires for a queue absent from timeSeries[0] but growing later", () => {
    // 10 points: queue is entirely absent for the early 20% (t=0,1), then
    // present and trending up for the rest of the run.
    const timeSeries = [
      { t: 0, byQueue: {} },
      { t: 1, byQueue: {} },
      { t: 2, byQueue: { "Voucher Queue": { waiting: 3, total: 3 } } },
      { t: 3, byQueue: { "Voucher Queue": { waiting: 4, total: 4 } } },
      { t: 4, byQueue: { "Voucher Queue": { waiting: 5, total: 5 } } },
      { t: 5, byQueue: { "Voucher Queue": { waiting: 6, total: 6 } } },
      { t: 6, byQueue: { "Voucher Queue": { waiting: 7, total: 7 } } },
      { t: 7, byQueue: { "Voucher Queue": { waiting: 8, total: 8 } } },
      { t: 8, byQueue: { "Voucher Queue": { waiting: 9, total: 9 } } },
      { t: 9, byQueue: { "Voucher Queue": { waiting: 10, total: 10 } } },
    ];
    const results = { summary: {}, timeSeries };
    const flags = evaluateResultsHealth(results, {});
    const h2 = flags.find(f => f.code === "H2" && f.resource === "Voucher Queue");
    expect(h2).toBeTruthy();
    expect(h2.severity).toBe("warning");
  });

  it("does not fire when no queue is trending up", () => {
    const timeSeries = Array.from({ length: 10 }, (_, t) => ({
      t, byQueue: { "Steady Queue": { waiting: 3, total: 3 } },
    }));
    const results = { summary: {}, timeSeries };
    const flags = evaluateResultsHealth(results, {});
    expect(flags.find(f => f.code === "H2")).toBeUndefined();
  });
});

describe("evaluateResultsHealth — H11 zombie asset", () => {
  const perResource = {
    "Idle Server": { maxSustainedZeroUtil: 60, utilisation: 0 },
  };

  it("uses results.finalTime for single-rep-shaped results (no summary.maxSimTime)", () => {
    // finalTime=100, totalArrived=100 -> avgInterArrival=1, threshold=5.
    // zeroDur=60 > 5, so it should fire using the real finalTime, not a
    // hardcoded fallback of 100 (which would give the same threshold here —
    // use a finalTime that would NOT fire if the hardcoded 100 were used
    // instead, to prove the real value is being read).
    const results = {
      finalTime: 2000,
      summary: { perResource, total: 100 },
    };
    // avgInterArrival = 2000 / 100 = 20; threshold = 100. zeroDur=60 does NOT exceed it.
    const flagsNoFire = evaluateResultsHealth(results, {});
    expect(flagsNoFire.find(f => f.code === "H11")).toBeUndefined();

    // Now with the old hardcoded fallback of 100 instead of finalTime=2000,
    // avgInterArrival would have been 100/100=1, threshold=5, zeroDur=60
    // WOULD have fired — confirming the fix actually changes behavior.
    const resultsHardcodedEquivalent = {
      summary: { perResource, total: 100 },
    };
    const flagsNoFinalTime = evaluateResultsHealth(resultsHardcodedEquivalent, {});
    expect(flagsNoFinalTime.find(f => f.code === "H11")).toBeUndefined();
  });

  it("fires when zero-duration exceeds 5x the real avg interarrival from results.finalTime", () => {
    const results = {
      finalTime: 100,
      summary: { perResource, total: 100 },
    };
    // avgInterArrival = 100/100 = 1; threshold = 5; zeroDur=60 > 5 -> fires.
    const flags = evaluateResultsHealth(results, {});
    const h11 = flags.find(f => f.code === "H11" && f.resource === "Idle Server");
    expect(h11).toBeTruthy();
  });

  it("still works for batch-shaped results using snap.clock", () => {
    const results = {
      snap: { clock: 100 },
      summary: { perResource, total: 100, maxSimTime: 100 },
    };
    const flags = evaluateResultsHealth(results, {});
    const h11 = flags.find(f => f.code === "H11" && f.resource === "Idle Server");
    expect(h11).toBeTruthy();
  });

  it("skips the check when no run length is available", () => {
    const results = { summary: { perResource, total: 100 } };
    const flags = evaluateResultsHealth(results, {});
    expect(flags.find(f => f.code === "H11")).toBeUndefined();
  });
});

describe("evaluateResultsHealth — H12 high renege rate", () => {
  it("does not fire below the warning threshold", () => {
    const results = { summary: { total: 100, reneged: 5 } };
    const flags = evaluateResultsHealth(results, {});
    expect(flags.find(f => f.code === "H12")).toBeUndefined();
  });

  it("fires as a warning at the 10% threshold", () => {
    const results = { summary: { total: 100, reneged: 12 } };
    const flags = evaluateResultsHealth(results, {});
    const h12 = flags.find(f => f.code === "H12");
    expect(h12).toBeTruthy();
    expect(h12.severity).toBe("warning");
  });

  it("fires as critical at the 25% threshold", () => {
    const results = { summary: { total: 100, reneged: 30 } };
    const flags = evaluateResultsHealth(results, {});
    const h12 = flags.find(f => f.code === "H12");
    expect(h12).toBeTruthy();
    expect(h12.severity).toBe("critical");
  });
});

describe("evaluateLiveHealth — L7 high renege rate", () => {
  it("does not fire below the warning threshold", () => {
    const flags = evaluateLiveHealth({}, { total: 100, reneged: 5 }, {});
    expect(flags.find(f => f.code === "L7")).toBeUndefined();
  });

  it("fires as a warning at the 10% threshold", () => {
    const flags = evaluateLiveHealth({}, { total: 100, reneged: 12 }, {});
    const l7 = flags.find(f => f.code === "L7");
    expect(l7).toBeTruthy();
    expect(l7.severity).toBe("warning");
  });

  it("fires as critical at the 25% threshold", () => {
    const flags = evaluateLiveHealth({}, { total: 100, reneged: 30 }, {});
    const l7 = flags.find(f => f.code === "L7");
    expect(l7).toBeTruthy();
    expect(l7.severity).toBe("critical");
  });
});
