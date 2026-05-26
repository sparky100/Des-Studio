import { describe, expect, test, vi } from "vitest";
import { buildEngine } from "../../src/engine/index.js";

function makeProgressModel() {
  return {
    entityTypes: [
      { id: "et-c", name: "Customer", role: "customer", attrDefs: [] },
      { id: "et-s", name: "Clerk", role: "server", count: "1", attrDefs: [] },
    ],
    queues: [{ id: "q1", name: "Waiting Queue", discipline: "FIFO" }],
    bEvents: [
      {
        id: "be-arrive",
        name: "Customer Arrives",
        scheduledTime: "0",
        effect: "ARRIVE(Customer, Waiting Queue)",
        schedules: [{ eventId: "be-arrive", dist: "Fixed", distParams: { value: "1" }, isRenege: false }],
      },
      {
        id: "be-complete",
        name: "Service Complete",
        scheduledTime: "9999",
        effect: "COMPLETE()",
        schedules: [],
      },
    ],
    cEvents: [{
      id: "ce-serve",
      name: "Start Service",
      priority: 1,
      condition: "queue(Customer).length > 0 AND idle(Clerk).count > 0",
      effect: "ASSIGN(Waiting Queue, Clerk)",
      cSchedules: [{ eventId: "be-complete", dist: "Fixed", distParams: { value: "0.8" }, useEntityCtx: true }],
    }],
    stateVariables: [],
  };
}

describe("single-run progress and cancellation", () => {
  test("progress callback emits the shared single-run shape", () => {
    const onProgress = vi.fn();

    buildEngine(makeProgressModel(), 42, 0, 5, null, 5000, 500, false, undefined, { onProgress }).runAll();

    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls[0][0]).toEqual(expect.objectContaining({
      mode: "single",
      total: 5000,
      workerCount: 1,
      cancelled: false,
      clock: 0,
      felSize: expect.any(Number),
      eventsProcessed: 0,
      terminationMode: "time",
    }));
    expect(onProgress.mock.calls.at(-1)[0]).toEqual(expect.objectContaining({
      mode: "single",
      running: 0,
      cancelled: false,
      clock: expect.any(Number),
    }));
  });

  test("completed result is unchanged when no observer is provided", () => {
    const baseline = buildEngine(makeProgressModel(), 99, 0, 5).runAll();
    const withEmptyOptions = buildEngine(makeProgressModel(), 99, 0, 5, null, 5000, 500, false, undefined, {}).runAll();

    expect(withEmptyOptions).toEqual(baseline);
  });

  test("cancelled runs stop at a safe checkpoint and return a partial result", () => {
    const result = buildEngine(
      makeProgressModel(),
      7,
      0,
      50,
      null,
      5000,
      500,
      false,
      undefined,
      { shouldCancel: progress => progress.completed >= 3 }
    ).runAll();

    expect(result.cancelled).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.completionStatus).toBe("cancelled");
    expect(result.finalTime).toBeLessThan(50);
    expect(result.log.at(-1)).toEqual(expect.objectContaining({
      phase: "CANCEL",
      message: "Run cancelled at a safe checkpoint. Partial results shown.",
    }));
  });
});
