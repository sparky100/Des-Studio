import { describe, expect, it } from "vitest";
import { makeTimeSeriesAccumulator, makeBatchResult } from "../../../src/ui/execute/executeHelpers.js";

// Regression test: queues/types that are empty at t=0 (and so absent from
// the first sample's byQueue/byType map) must still appear in the batch
// average once they receive entities later in the run or in a later
// replication. Previously the accumulator only tracked keys seen in the
// very first sample of the very first replication, silently dropping any
// queue that wasn't already populated at t=0 — making downstream queues
// look permanently empty in multi-replication batch results.
describe("makeTimeSeriesAccumulator", () => {
  it("tracks queue keys that first appear after t=0", () => {
    const acc = makeTimeSeriesAccumulator();
    acc.addSeries([
      { t: 0, byQueue: { "Finish Line": { waiting: 1, total: 1 } }, byType: {} },
      { t: 1, byQueue: { "Finish Line": { waiting: 0, total: 1 }, "Voucher Queue": { waiting: 2, total: 2 } }, byType: {} },
    ]);

    const result = acc.getResult();
    const t1 = result.find(pt => pt.t === 1);
    expect(t1.byQueue["Voucher Queue"]).toEqual({ waiting: 2, total: 2, avgWait: null, waitN: 0 });
    const t0 = result.find(pt => pt.t === 0);
    expect(t0.byQueue["Voucher Queue"]).toEqual({ waiting: 0, total: 0, avgWait: null, waitN: 0 });
  });

  it("tracks queue keys that only appear in a later replication", () => {
    const acc = makeTimeSeriesAccumulator();
    acc.addSeries([
      { t: 0, byQueue: { "Finish Line": { waiting: 1, total: 1 } }, byType: {} },
      { t: 1, byQueue: { "Finish Line": { waiting: 0, total: 1 } }, byType: {} },
    ]);
    acc.addSeries([
      { t: 0, byQueue: { "Finish Line": { waiting: 0, total: 0 } }, byType: {} },
      { t: 1, byQueue: { "Burger Queue": { waiting: 4, total: 4 } }, byType: {} },
    ]);

    const result = acc.getResult();
    const t1 = result.find(pt => pt.t === 1);
    // Averaged across both replications: rep 1 contributed 0 (absent), rep 2 contributed 4.
    expect(t1.byQueue["Burger Queue"]).toEqual({ waiting: 2, total: 2, avgWait: null, waitN: 0 });
  });

  it("weights avgWait by waitN (entities cleared), not by replication count", () => {
    const acc = makeTimeSeriesAccumulator();
    acc.addSeries([
      { t: 0, byQueue: { "Voucher Queue": { waiting: 0, total: 1, avgWait: 4, waitN: 2 } }, byType: {} },
    ]);
    acc.addSeries([
      { t: 0, byQueue: { "Voucher Queue": { waiting: 0, total: 0, avgWait: null, waitN: 0 } }, byType: {} },
    ]);
    acc.addSeries([
      { t: 0, byQueue: { "Voucher Queue": { waiting: 0, total: 1, avgWait: 10, waitN: 1 } }, byType: {} },
    ]);

    const result = acc.getResult();
    const t0 = result.find(pt => pt.t === 0);
    // (4*2 + 10*1) / (2 + 1) = 6, not a simple mean-of-means across 2 contributing reps.
    expect(t0.byQueue["Voucher Queue"].avgWait).toBeCloseTo(6);
    expect(t0.byQueue["Voucher Queue"].waitN).toBe(3);
  });

  it("tracks entity-type keys that first appear later", () => {
    const acc = makeTimeSeriesAccumulator();
    acc.addSeries([
      { t: 0, byQueue: {}, byType: { Runner: { waiting: 0, busy: 1, idle: 0, total: 1 } } },
      { t: 1, byQueue: {}, byType: { Runner: { waiting: 0, busy: 2, idle: 0, total: 2 }, "Burger Server": { waiting: 0, busy: 1, idle: 1, total: 2 } } },
    ]);

    const result = acc.getResult();
    const t1 = result.find(pt => pt.t === 1);
    expect(t1.byType["Burger Server"]).toEqual({ waiting: 0, busy: 1, idle: 1, total: 2 });
    const t0 = result.find(pt => pt.t === 0);
    expect(t0.byType["Burger Server"]).toEqual({ waiting: 0, busy: 0, idle: 0, total: 0 });
  });

  // Regression: replications complete in non-deterministic worker order, and an
  // individual replication's own clock can stop short of the configured run
  // length (e.g. its event list empties early). The grid must span the known
  // run length regardless of which replication's addSeries() call arrives first.
  it("does not truncate the grid to a short-finishing replication when knownMaxTime is known", () => {
    const acc = makeTimeSeriesAccumulator(5, 10);
    acc.addSeries([
      { t: 0, byQueue: { "Beer Queue": { waiting: 0, total: 0 } }, byType: {} },
      { t: 3, byQueue: { "Beer Queue": { waiting: 5, total: 5 } }, byType: {} },
    ]);

    const result = acc.getResult();
    expect(result).toHaveLength(5);
    expect(result[result.length - 1].t).toBe(10);
    // Carried forward from this replication's last known sample.
    expect(result[result.length - 1].byQueue["Beer Queue"].waiting).toBe(5);
  });

  // Regression: a sample's waitN must contribute to the merged result exactly
  // once, even though it's legitimately carried forward (for state fields like
  // waiting/total) across every grid point until the next real sample.
  it("counts a carried-forward sample's waitN only once across the grid", () => {
    const acc = makeTimeSeriesAccumulator(5, 10);
    acc.addSeries([
      { t: 0, byQueue: { "Voucher Queue": { waiting: 0, total: 1, avgWait: 4, waitN: 2 } }, byType: {} },
    ]);

    const result = acc.getResult();
    const totalWaitN = result.reduce((sum, pt) => sum + (pt.byQueue["Voucher Queue"]?.waitN || 0), 0);
    expect(totalWaitN).toBe(2);
  });

  // Regression: the engine records one raw sample per event, far denser than
  // the merged grid (maxPoints). When a grid point's pointer advance skips over
  // several raw samples at once, every skipped sample's waitN/waitSum must still
  // be folded in — not just the single last sample reached — or a busy queue's
  // completions recorded between grid points are silently lost, leaving its
  // wait-over-time chart with too few points to render (this caused "Beer Queue"
  // to be missing from the "When did waits get longer?" section entirely).
  it("sums waitN/waitSum from every raw sample skipped between two grid points", () => {
    const acc = makeTimeSeriesAccumulator(5, 10); // grid: [0, 2.5, 5, 7.5, 10]
    acc.addSeries([
      { t: 0, byQueue: { "Beer Queue": { waiting: 0, total: 0 } }, byType: {} },
      { t: 1, byQueue: { "Beer Queue": { waiting: 0, total: 1, avgWait: 2, waitN: 1 } }, byType: {} },
      { t: 2, byQueue: { "Beer Queue": { waiting: 0, total: 1, avgWait: 4, waitN: 1 } }, byType: {} },
    ]);

    const result = acc.getResult();
    const t2_5 = result.find(pt => pt.t === 2.5);
    expect(t2_5.byQueue["Beer Queue"].waitN).toBe(2);
    expect(t2_5.byQueue["Beer Queue"].avgWait).toBeCloseTo(3); // (2*1 + 4*1) / 2
  });
});

// makeBatchResult falls back to averaging replication timeSeries directly
// (the non-streaming path) when no precomputedTimeSeries is supplied.
describe("makeBatchResult timeSeries averaging", () => {
  it("weights avgWait by waitN across replications, not by replication count", () => {
    const replicationPayloads = [
      { result: { summary: {}, timeSeries: [
        { t: 0, byQueue: { "Voucher Queue": { waiting: 0, total: 1, avgWait: 4, waitN: 2 } }, byType: {} },
      ] } },
      { result: { summary: {}, timeSeries: [
        { t: 0, byQueue: { "Voucher Queue": { waiting: 0, total: 1, avgWait: 10, waitN: 1 } }, byType: {} },
      ] } },
    ];

    const batch = makeBatchResult(replicationPayloads, {}, 10, 0);
    const t0 = batch.timeSeries.find(pt => pt.t === 0);
    // (4*2 + 10*1) / (2 + 1) = 6
    expect(t0.byQueue["Voucher Queue"].avgWait).toBeCloseTo(6);
    expect(t0.byQueue["Voucher Queue"].waitN).toBe(3);
  });

  it("pools waitDistByAttr raw values across replications, keyed by attribute/queue/value", () => {
    const replicationPayloads = [
      { result: { summary: {}, waitDistByAttr: {
        tier: { Queue: { gold: { n: 2, mean: 3, p50: 3, p90: 4, p95: 4, p99: 4, values: [2, 4] } } },
      } } },
      { result: { summary: {}, waitDistByAttr: {
        tier: { Queue: { gold: { n: 1, mean: 6, p50: 6, p90: 6, p95: 6, p99: 6, values: [6] } } },
      } } },
    ];

    const batch = makeBatchResult(replicationPayloads, {}, 10, 0);
    const goldDist = batch.waitDistByAttr.tier.Queue.gold;
    expect(goldDist.n).toBe(3);
    expect(goldDist.values).toEqual([2, 4, 6]);
  });
});
