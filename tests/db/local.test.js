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
});
