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
