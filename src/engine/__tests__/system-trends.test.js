import { describe, it, expect } from "vitest";
import { buildEngine } from "../index.js";

// Covers the system-level trend fields added for the "System-Level Trends"
// Results section: per-snapshot wip/completed on timeSeries entries, and the
// whole-system sojournDist (paralleling per-queue waitDist).
describe("System-level trend fields", () => {
  it("tracks wip and completed (excluding reneges) on timeSeries snapshots, and computes sojournDist", () => {
    const model = {
      entityTypes: [
        { id: "e1", name: "Customer", role: "customer" },
        { id: "e2", name: "Server", role: "server", count: 1 },
      ],
      bEvents: [
        { id: "b1", name: "Arrival1", scheduledTime: "2", effect: ["ARRIVE(Customer)"] },
        { id: "b2", name: "Arrival2", scheduledTime: "10", effect: ["ARRIVE(Customer)"] },
        { id: "b3", name: "ServiceComplete", scheduledTime: "999", effect: ["COMPLETE()"] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "StartService",
          condition: "queue(Customer).length > 0 AND idle(Server).count > 0",
          effect: ["ASSIGN(Customer, Server)"],
          priority: 1,
          cSchedules: [
            { eventId: "b3", dist: "Fixed", distParams: { value: 5 }, useEntityCtx: true },
          ],
        },
      ],
    };

    // collectTimeSeries=true (8th positional arg) so _timeSeries is populated.
    const engine = buildEngine(model, 123, 0, null, null, 5000, 500, true);
    const result = engine.runAll();

    expect(result.summary.served).toBe(2);
    expect(Array.isArray(result.timeSeries)).toBe(true);
    expect(result.timeSeries.length).toBeGreaterThan(0);

    for (const entry of result.timeSeries) {
      expect(typeof entry.wip).toBe("number");
      expect(typeof entry.completed).toBe("number");
      expect(entry.wip).toBeGreaterThanOrEqual(0);
      expect(entry.completed).toBeGreaterThanOrEqual(0);
    }

    // Sum of per-snapshot completions equals total served — no reneges occur
    // in this model, so completed-since-sample is exactly the served count.
    const totalCompleted = result.timeSeries.reduce((sum, e) => sum + e.completed, 0);
    expect(totalCompleted).toBe(2);

    // Each customer is served immediately (server idle on arrival) and takes
    // 5 time units, so sojournTime === service time === 5 for both.
    expect(result.sojournDist).not.toBeNull();
    expect(result.sojournDist.n).toBe(2);
    expect(result.sojournDist.mean).toBe(5);
    expect(result.sojournDist.values).toEqual([5, 5]);
  });

  it("excludes reneged entities from completed and sojournDist", () => {
    // No server at all, so the single arrival can never be assigned and must
    // renege at its patience timeout (t=3).
    const model = {
      entityTypes: [
        { id: "e1", name: "Customer", role: "customer" },
      ],
      queues: [{ id: "q1", name: "Queue", customerType: "Customer", discipline: "FIFO" }],
      bEvents: [
        { id: "arr", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Customer, Queue)",
          schedules: [{ eventId: "reneg", dist: "fixed", distParams: { value: "3" }, isRenege: true }] },
        { id: "reneg", name: "Reneges", scheduledTime: "9999", effect: "RENEGE(ctx)", schedules: [] },
      ],
      cEvents: [],
    };

    const engine = buildEngine(model, 123, 0, 20, null, 5000, 500, true);
    const result = engine.runAll();

    expect(result.summary.served).toBe(0);
    expect(result.summary.reneged).toBeGreaterThan(0);
    const totalCompleted = result.timeSeries.reduce((sum, e) => sum + e.completed, 0);
    expect(totalCompleted).toBe(0);
    expect(result.sojournDist).toBeNull();
  });
});
