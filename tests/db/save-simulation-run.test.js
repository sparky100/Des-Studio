import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveSimulationRun } from "../../src/db/models.js";
import { supabase } from "../../src/db/supabase.js";

describe("saveSimulationRun payload metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.from("simulation_runs").insert.mockReturnThis();
    supabase.from("simulation_runs").select.mockReturnThis();
    supabase.from("simulation_runs").single.mockResolvedValue({
      data: { id: "run-1" },
      error: null,
    });
  });

  it("stores approximate payload size metadata for persisted runs", async () => {
    await saveSimulationRun("model-1", "user-1", {
      summary: { total: 3, served: 2, reneged: 1, avgWait: 4, avgSvc: 2 },
      snap: { clock: 25 },
      log: [{ phase: "END", time: 25, message: "Run finished" }],
    }, {
      seed: 123,
      runLabel: "Saved run",
      durationMs: 42,
    });

    const insertPayload = supabase.from("simulation_runs").insert.mock.calls.at(-1)[0];
    expect(insertPayload.results_json._results_payload_size_bytes).toEqual(expect.any(Number));

    const {
      _results_payload_size_bytes: storedSize,
      ...resultsJsonWithoutSize
    } = insertPayload.results_json;
    expect(storedSize).toBe(JSON.stringify(resultsJsonWithoutSize).length);
  });

  it("still saves older result shapes when adding payload size metadata", async () => {
    await saveSimulationRun("model-1", "user-1", {
      summary: { served: 1 },
    });

    const insertPayload = supabase.from("simulation_runs").insert.mock.calls.at(-1)[0];
    expect(insertPayload.results_json.summary).toEqual({ served: 1 });
    expect(insertPayload.results_json._results_payload_size_bytes).toEqual(expect.any(Number));
  });

  it("stores requested and effective chart-data settings in saved results metadata", async () => {
    await saveSimulationRun("model-1", "user-1", {
      summary: { served: 1 },
    }, {
      requestedCollectTimeSeries: true,
      effectiveCollectTimeSeries: false,
    });

    const insertPayload = supabase.from("simulation_runs").insert.mock.calls.at(-1)[0];
    expect(insertPayload.results_json).toEqual(expect.objectContaining({
      _requested_collect_time_series: true,
      _effective_collect_time_series: false,
    }));
  });
});
