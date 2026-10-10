// Activity throughput must count entities, not firings: one DELAY firing
// starts every waiting entity at once, so counting the firing once
// under-reported DELAY activities by the batch size (World Oil "Return to
// Hormuz": 195 recorded vs ~4,228 lots that took the path).
import { describe, test, expect, beforeEach } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { resetSeq } from "../../src/engine/entities.js";

beforeEach(() => { resetSeq(); });

function gatedDelayModel() {
  return {
    entityTypes: [{ id: "lot", name: "Lot", role: "customer", attrDefs: [] }],
    queues: [{ id: "q", name: "Holding", customerType: "Lot", discipline: "FIFO" }],
    stateVariables: [{ name: "gate", initialValue: "0" }],
    bEvents: [
      { id: "arr", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Lot, Holding)",
        schedules: [{ eventId: "arr", dist: "Fixed", distParams: { value: "1" } }] },
      // Gate opens at t=5.5 for good — lots that arrived at t=0..5 are all waiting.
      { id: "open", name: "Open Gate", scheduledTime: "5.5", effect: "gate = 1", schedules: [] },
      { id: "done", name: "Released", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    ],
    cEvents: [{
      id: "release", name: "Release", priority: 1,
      condition: { operator: "AND", clauses: [
        { variable: "queue(Holding).length", operator: ">", value: 0 },
        { variable: "gate", operator: "==", value: 1 },
      ] },
      effect: "DELAY(Holding)",
      cSchedules: [{ eventId: "done", dist: "Fixed", distParams: { value: "0.1" }, useEntityCtx: true }],
    }],
  };
}

describe("activityCounts for DELAY", () => {
  test("counts every entity a batched DELAY firing starts, and reports firings separately", () => {
    const engine = buildEngine(gatedDelayModel(), 1, 0, 10);
    const result = engine.runAll();
    const act = result.summary.activityCounts.release;
    // Lots arriving at t=0..5 wait for the gate and are released by ONE firing
    // at t=5.5; later lots go one per firing. Every lot that started the
    // activity must be counted, matching the completion B-event's count.
    expect(act.count).toBe(result.summary.total);
    expect(act.firings).toBe(act.count - 5); // the first firing carried 6 lots
    expect(act.firings).toBeLessThan(act.count);
  });
});
