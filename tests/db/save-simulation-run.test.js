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

  it("persists large runs in compact form by default when requested", async () => {
    await saveSimulationRun("model-1", "user-1", {
      summary: { total: 3000, served: 2500, reneged: 500, avgWait: 12, avgSvc: 4 },
      snap: { clock: 5000 },
      runtimeMetrics: { wall_clock_ms: 1200, replications: 1, events_processed: 9000, c_event_scans: 7000, c_events_fired: 2500, entities_created: 3000, entities_completed: 2500 },
      log: Array.from({ length: 50 }, (_, index) => ({ phase: "STEP", time: index, message: `message ${index}` })),
      entitySummary: Array.from({ length: 500 }, (_, index) => ({ type: index % 2 === 0 ? "Customer" : "Server", status: index % 3 === 0 ? "done" : "waiting" })),
      timeSeries: Array.from({ length: 500 }, (_, index) => ({ t: index, byQueue: { Main: { waiting: index % 7, total: index % 11 } }, byType: {} })),
      trace: Array.from({ length: 100 }, (_, index) => ({ seq: index, phase: "A" })),
      waitDist: { Main: { n: 10, mean: 3, p50: 3, p90: 5, p95: 6, p99: 7, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } },
    }, {
      resultDetailLevel: "compact",
      riskLevel: "large",
    });

    const insertPayload = supabase.from("simulation_runs").insert.mock.calls.at(-1)[0];

    expect(insertPayload.results_json).toEqual(expect.objectContaining({
      _result_detail_level: "compact",
      _result_risk_level: "large",
      _trimmed_fields: expect.arrayContaining(["log", "entitySummary", "timeSeries", "trace"]),
      summary: expect.objectContaining({ served: 2500, avgSvc: 4 }),
      runtimeMetrics: expect.objectContaining({ events_processed: 9000 }),
      logSummary: expect.objectContaining({ entries: 50, finalMessage: "message 49" }),
      entitySummaryCompact: expect.objectContaining({ totalEntities: 500 }),
      _time_series_sampling: expect.objectContaining({ originalPoints: 500 }),
      waitDist: expect.objectContaining({ Main: expect.objectContaining({ n: 10 }) }),
    }));
    expect(insertPayload.results_json.log).toBeUndefined();
    expect(insertPayload.results_json.entitySummary).toBeUndefined();
    expect(insertPayload.results_json.trace).toBeUndefined();
    expect(insertPayload.results_json.timeSeries).toHaveLength(200);
  });
});
