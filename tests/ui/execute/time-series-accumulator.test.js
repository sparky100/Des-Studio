import { describe, expect, it } from "vitest";
import { makeTimeSeriesAccumulator } from "../../../src/ui/execute/executeHelpers.js";

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
    expect(t1.byQueue["Voucher Queue"]).toEqual({ waiting: 2, total: 2 });
    const t0 = result.find(pt => pt.t === 0);
    expect(t0.byQueue["Voucher Queue"]).toEqual({ waiting: 0, total: 0 });
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
    expect(t1.byQueue["Burger Queue"]).toEqual({ waiting: 2, total: 2 });
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
