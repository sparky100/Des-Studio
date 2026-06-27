import { beforeEach, describe, expect, it } from "vitest";
import { fetchLocalModels, fetchLocalRunHistory, saveLocalModel, saveLocalRun } from "../../src/db/local.js";

function createLocalStorageMock() {
  let store = {};
  return {
    clear() {
      store = {};
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
  };
}

describe("local DB run history", () => {
  beforeEach(() => {
    globalThis.localStorage = createLocalStorageMock();
    globalThis.localStorage.clear();
  });

  it("stores results payload size metadata for local runs", () => {
    saveLocalRun("model-1", {
      summary: { total: 3, served: 2, reneged: 1, avgWait: 4, avgSvc: 2 },
      snap: { clock: 25 },
      log: [{ phase: "END", time: 25, message: "Run finished" }],
    }, {
      seed: 123,
      runLabel: "Local run",
      durationMs: 42,
    });

    const [run] = fetchLocalRunHistory("model-1");
    expect(run.results_json._results_payload_size_bytes).toEqual(expect.any(Number));

    const { _results_payload_size_bytes: storedSize, ...resultsJsonWithoutSize } = run.results_json;
    expect(storedSize).toBe(JSON.stringify(resultsJsonWithoutSize).length);
  });

  it("still saves older result shapes locally", () => {
    saveLocalRun("model-1", {
      summary: { served: 1 },
    }, {
      seed: 1,
    });

    const [run] = fetchLocalRunHistory("model-1");
    expect(run.results_json.summary).toEqual({ served: 1 });
    expect(run.results_json._results_payload_size_bytes).toEqual(expect.any(Number));
  });

  it("stores large local runs in compact form when requested", () => {
    saveLocalRun("model-1", {
      summary: { total: 4000, served: 3900, reneged: 100, avgWait: 5, avgSvc: 2 },
      snap: { clock: 2500 },
      log: Array.from({ length: 25 }, (_, index) => ({ phase: "STEP", time: index, message: `local ${index}` })),
      entitySummary: Array.from({ length: 300 }, (_, index) => ({ type: "Customer", status: index % 2 === 0 ? "done" : "waiting" })),
      timeSeries: Array.from({ length: 260 }, (_, index) => ({ t: index, byQueue: { Main: { waiting: index % 5, total: index % 9 } }, byType: {} })),
      trace: Array.from({ length: 20 }, (_, index) => ({ seq: index, phase: "B" })),
      runtimeMetrics: { wall_clock_ms: 200, replications: 1, events_processed: 7000, c_event_scans: 6000, c_events_fired: 2000, entities_created: 4000, entities_completed: 3900 },
    }, {
      resultDetailLevel: "compact",
      riskLevel: "large",
    });

    const [run] = fetchLocalRunHistory("model-1");
    expect(run.results_json).toEqual(expect.objectContaining({
      _result_detail_level: "compact",
      _result_risk_level: "large",
      _trimmed_fields: expect.arrayContaining(["log", "entitySummary", "timeSeries", "trace"]),
      logSummary: expect.objectContaining({ entries: 25 }),
    }));
    expect(run.results_json.log).toBeUndefined();
    expect(run.results_json.entitySummary).toBeUndefined();
    expect(run.results_json.entitySummaryCompact).toBeUndefined();
    expect(run.results_json.trace).toBeUndefined();
    expect(run.results_json.timeSeries).toHaveLength(200);
  });
});

describe("local DB model conditions — unified storage format (Part B)", () => {
  beforeEach(() => {
    globalThis.localStorage = createLocalStorageMock();
    globalThis.localStorage.clear();
  });

  function makeStringConditionModel() {
    return {
      queues: [{ id: "q1", name: "Main Queue", balkCondition: "queue(Main Queue).length > 5" }],
      bEvents: [{ id: "b1", name: "Arrival", routing: [{ queueName: "Main Queue", condition: "idle(Clerk).count > 0" }] }],
      cEvents: [{
        id: "c1", name: "Serve",
        condition: "queue(Main Queue).length > 0",
        cSchedules: [{ eventId: "b1", when: "clock > 5" }],
      }],
    };
  }

  it("saveLocalModel normalizes all four string-shaped condition fields to predicate objects", () => {
    const saved = saveLocalModel(makeStringConditionModel());

    expect(saved.queues[0].balkCondition).toEqual({
      variable: "queue(Main Queue).length", operator: ">", value: 5,
    });
    expect(saved.bEvents[0].routing[0].condition).toEqual({
      variable: "idle(Clerk).count", operator: ">", value: 0,
    });
    expect(saved.cEvents[0].condition).toEqual({
      variable: "queue(Main Queue).length", operator: ">", value: 0,
    });
    expect(saved.cEvents[0].cSchedules[0].when).toEqual({
      variable: "clock", operator: ">", value: 5,
    });
  });

  it("fetchLocalModels normalizes string-shaped conditions for models already in storage", () => {
    globalThis.localStorage.setItem("simmodlr_models", JSON.stringify([
      { id: "local_1", ...makeStringConditionModel() },
    ]));

    const [model] = fetchLocalModels();

    expect(model.queues[0].balkCondition).toEqual({
      variable: "queue(Main Queue).length", operator: ">", value: 5,
    });
    expect(model.bEvents[0].routing[0].condition).toEqual({
      variable: "idle(Clerk).count", operator: ">", value: 0,
    });
    expect(model.cEvents[0].condition).toEqual({
      variable: "queue(Main Queue).length", operator: ">", value: 0,
    });
    expect(model.cEvents[0].cSchedules[0].when).toEqual({
      variable: "clock", operator: ">", value: 5,
    });
  });
});
