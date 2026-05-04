import { describe, it, expect } from "vitest";
import { buildEngine } from "../index.js";
import { makeCtx } from "./macros.test.js"; // for helpers

describe("Warm-up period", () => {
  it("resets statistics and state variables after warm-up period", () => {
    const model = {
      entityTypes: [
        { id: "e1", name: "Customer", role: "customer" },
        { id: "e2", name: "Server", role: "server", count: 1 },
      ],
      stateVariables: [
        { id: "sv1", name: "testVar", initialValue: "100", resetOnWarmup: true },
        { id: "sv2", name: "noResetVar", initialValue: "100", resetOnWarmup: false },
      ],
      bEvents: [
        { id: "b1", name: "WarmupArrival", scheduledTime: "1", effect: ["ARRIVE(Customer)"] },
        { id: "b2", name: "RealArrival", scheduledTime: "20", effect: ["ARRIVE(Customer)"] },
        { id: "b3", name: "ServiceComplete", scheduledTime: "999", effect: ["COMPLETE()"] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "StartService",
          condition: "queue(Customer).length > 0 AND idle(Server).count > 0",
          effect: ["ASSIGN(Customer, Server)", "testVar++", "noResetVar++"],
          priority: 1,
          cSchedules: [
            { eventId: "b3", dist: "Fixed", distParams: { value: 5 }, useEntityCtx: true },
          ],
        },
      ],
    };

    // Run with a warm-up period of 15.
    // Warmup cust arrives at t=1, starts service, completes at t=6.
    // Real cust arrives at t=20, starts service, completes at t=25.
    const engine = buildEngine(model, 123, 15);
    const result = engine.runAll();

    const finalState = result.snap.scalars;

    // Assertions
    // 1. Only post-warmup customers should be counted.
    expect(result.summary.served, "Only post-warmup customers counted as served").toBe(1);

    // 2. State variables with `resetOnWarmup` should be reset.
    expect(finalState.testVar, "State variable with reset flag is reset").toBe(101); // 100 (reset) + 1 (post-warmup)
    
    // 3. State variables without the flag should persist their value.
    expect(finalState.noResetVar, "State variable without reset flag persists").toBe(102); // 100 (initial) + 1 (warmup) + 1 (post-warmup)

    // 4. Log should contain a WARMUP event
    const warmupLog = result.log.find(l => l.phase === 'WARMUP');
    expect(warmupLog, "Log should contain a WARMUP event").toBeDefined();
    expect(warmupLog.time, "WARMUP event time should match warmup period").toBe(15);
  });
});
