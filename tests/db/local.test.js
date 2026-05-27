import { beforeEach, describe, expect, it } from "vitest";
import { fetchLocalRunHistory, saveLocalRun } from "../../src/db/local.js";

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
      entitySummaryCompact: expect.objectContaining({ totalEntities: 300 }),
    }));
    expect(run.results_json.log).toBeUndefined();
    expect(run.results_json.entitySummary).toBeUndefined();
    expect(run.results_json.trace).toBeUndefined();
    expect(run.results_json.timeSeries).toHaveLength(200);
  });
});
