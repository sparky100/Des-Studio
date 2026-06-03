import { describe, expect, it } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { twoStageClinicModel } from "../__helpers__/twoStageModel.js";

describe("queue names with spaces", () => {
  it("runs ARRIVE, ASSIGN, and queue conditions that reference a spaced queue name", () => {
    const model = {
      entityTypes: [
        { id: "cust", name: "Customer", role: "customer", attrDefs: [] },
        { id: "clerk", name: "Clerk", role: "server", count: 1, attrDefs: [] },
      ],
      queues: [{ id: "main", name: "Main Queue", discipline: "FIFO" }],
      stateVariables: [],
      bEvents: [
        {
          id: "arrive",
          name: "Customer Arrival",
          scheduledTime: "0",
          effect: "ARRIVE(Customer, Main Queue)",
          schedules: [],
        },
        {
          id: "complete",
          name: "Service Complete",
          scheduledTime: "9999",
          effect: "COMPLETE()",
          schedules: [],
        },
      ],
      cEvents: [{
        id: "start",
        name: "Start Service",
        priority: 1,
        condition: "queue(Main Queue).length > 0 AND idle(Clerk).count > 0",
        effect: "ASSIGN(Main Queue, Clerk)",
        cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
      }],
    };

    const result = buildEngine(model, 123, 0, 2).runAll();

    expect(result.summary.served).toBe(1);
    expect(result.log.some(entry => String(entry.message).includes("Service Complete"))).toBe(true);
  });

  it("runs a two-stage model that releases a patient into a second spaced queue", () => {
    const result = buildEngine(twoStageClinicModel, 123, 0, 5).runAll();

    expect(result.summary.served).toBe(1);
    expect(result.log.some(entry => String(entry.message).includes("Triage Complete"))).toBe(true);
    expect(result.log.some(entry => String(entry.message).includes("Consultation Complete"))).toBe(true);
  });
});
