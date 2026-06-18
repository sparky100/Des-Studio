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

  it("persists ordinary saved runs in minimal form by default", async () => {
    await saveSimulationRun("model-1", "user-1", {
      summary: { total: 3, served: 2, reneged: 1, avgWait: 4, avgSvc: 2 },
      snap: { clock: 25 },
      log: [{ phase: "END", time: 25, message: "Run finished" }],
      entitySummary: [{ type: "Customer", status: "done", count: 2 }],
      timeSeries: [{ t: 25, byQueue: { Main: { waiting: 2, total: 3 } }, byType: {} }],
      waitDist: { Main: { n: 2, mean: 3, p50: 3, p90: 4, p95: 4, p99: 4, values: [2, 4] } },
    });

    const insertPayload = supabase.from("simulation_runs").insert.mock.calls.at(-1)[0];
    expect(insertPayload.results_json).toEqual(expect.objectContaining({
      _result_detail_level: "minimal",
      // timeSeries is now kept as a 50-pt skeleton; waitDist has histogram bins
      _trimmed_fields: expect.arrayContaining(["log", "entitySummary", "waitDist.values→histogram"]),
      logSummary: expect.objectContaining({ entries: 1, finalMessage: "Run finished" }),
      entitySummaryCompact: expect.objectContaining({ totalEntities: 1 }),
      waitDist: expect.objectContaining({ Main: expect.objectContaining({ n: 2, mean: 3, p99: 4 }) }),
    }));
    expect(insertPayload.results_json.log).toBeUndefined();
    expect(insertPayload.results_json.entitySummary).toBeUndefined();
    // timeSeries is now retained as a 50-pt sample (not deleted in minimal)
    expect(insertPayload.results_json.timeSeries).toBeDefined();
    // raw values array is replaced by pre-computed histogram bins in minimal saves
    expect(insertPayload.results_json.waitDist.Main.values).toBeUndefined();
    expect(insertPayload.results_json.waitDist.Main.histogram).toBeDefined();
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

  it("stores lightweight provenance by default without embedding a full model snapshot", async () => {
    await saveSimulationRun("model-1", "user-1", {
      summary: { served: 1 },
    }, {
      runRecord: {
        model_snapshot: null,
        engine_version: "test-engine",
        prng_algorithm: "mulberry32",
        base_seed: 321,
        experiment_config: {
          maxSimTime: 500,
          warmupPeriod: 25,
          replications: 1,
          seed: 321,
          terminationMode: "time",
          terminationCondition: null,
        },
      },
    });

    const insertPayload = supabase.from("simulation_runs").insert.mock.calls.at(-1)[0];
    expect(insertPayload.results_json).toEqual(expect.objectContaining({
      _engine_version: "test-engine",
      _prng_algorithm: "mulberry32",
      _base_seed: 321,
      _experiment_config: expect.objectContaining({
        maxSimTime: 500,
        warmupPeriod: 25,
        replications: 1,
        seed: 321,
      }),
    }));
    expect(insertPayload.results_json._model_snapshot).toBeUndefined();
  });

  it("ADR-016: embeds model_snapshot in minimal/compact saves when includeModelSnapshot=true", async () => {
    // ADR-016: after extracting timetable rows to model_schedules, the model_json
    // for Glasgow Central shrinks from ~290 KB to ~14 KB.  The "full"-only guard
    // introduced in the glasgow-supabase-save-perf branch is no longer needed —
    // we now embed the snapshot for all detail levels when includeModelSnapshot is set.
    const smallSnapshot = { id: "model-1", name: "Glasgow Central" };

    for (const detailLevel of ["minimal", "compact"]) {
      vi.clearAllMocks();
      supabase.from("simulation_runs").insert.mockReturnThis();
      supabase.from("simulation_runs").select.mockReturnThis();
      supabase.from("simulation_runs").single.mockResolvedValue({ data: { id: "run-x" }, error: null });

      await saveSimulationRun("model-1", "user-1", {
        summary: { served: 1 },
        log: [{ phase: "END", time: 10, message: "done" }],
      }, {
        resultDetailLevel: detailLevel,
        includeModelSnapshot: true,  // ADR-016: always embed now that model is small
        runRecord: {
          model_snapshot: smallSnapshot,
          engine_version: "test",
          prng_algorithm: "mulberry32",
          base_seed: 1,
          experiment_config: { maxSimTime: 500, warmupPeriod: 0, replications: 1, seed: 1, terminationMode: "time", terminationCondition: null },
        },
      });

      const insertPayload = supabase.from("simulation_runs").insert.mock.calls.at(-1)[0];
      expect(insertPayload.results_json._model_snapshot, `detailLevel=${detailLevel} should embed snapshot`).toEqual(smallSnapshot);
      expect(insertPayload.results_json._result_detail_level).toBe(detailLevel);
    }
  });

  it("does not embed model_snapshot when includeModelSnapshot is not set (or false)", async () => {
    // When includeModelSnapshot is omitted, the snapshot is not embedded even
    // if a runRecord.model_snapshot is present.
    const snapshot = { id: "model-1", name: "Test Model" };

    for (const includeFlag of [false, undefined]) {
      vi.clearAllMocks();
      supabase.from("simulation_runs").insert.mockReturnThis();
      supabase.from("simulation_runs").select.mockReturnThis();
      supabase.from("simulation_runs").single.mockResolvedValue({ data: { id: "run-x" }, error: null });

      await saveSimulationRun("model-1", "user-1", {
        summary: { served: 1 },
        log: [{ phase: "END", time: 10, message: "done" }],
      }, {
        resultDetailLevel: "minimal",
        includeModelSnapshot: includeFlag,
        runRecord: {
          model_snapshot: snapshot,
          engine_version: "test",
          prng_algorithm: "mulberry32",
          base_seed: 1,
          experiment_config: { maxSimTime: 500 },
        },
      });

      const insertPayload = supabase.from("simulation_runs").insert.mock.calls.at(-1)[0];
      expect(
        insertPayload.results_json._model_snapshot,
        `includeModelSnapshot=${includeFlag} should not embed snapshot`
      ).toBeUndefined();
    }
  });

  it("stores a full model snapshot for archival or reproducibility saves when requested", async () => {
    await saveSimulationRun("model-1", "user-1", {
      summary: { served: 1 },
      log: [{ phase: "END", time: 25, message: "Run finished" }],
      entitySummary: [{ type: "Customer", status: "done", count: 1 }],
      timeSeries: [{ t: 25, byQueue: { Main: { waiting: 2, total: 3 } }, byType: {} }],
      waitDist: { Main: { n: 2, mean: 3, p50: 3, p90: 4, p95: 4, p99: 4, values: [2, 4] } },
    }, {
      resultDetailLevel: "full",
      includeModelSnapshot: true,  // ADR-016: explicit flag required
      runRecord: {
        model_snapshot: { id: "model-1", name: "Snapshot Model" },
        engine_version: "test-engine",
        prng_algorithm: "mulberry32",
        base_seed: 654,
        experiment_config: {
          maxSimTime: 750,
          warmupPeriod: 0,
          replications: 2,
          seed: 654,
          terminationMode: "time",
          terminationCondition: null,
        },
      },
    });

    const insertPayload = supabase.from("simulation_runs").insert.mock.calls.at(-1)[0];
    expect(insertPayload.results_json._model_snapshot).toEqual({ id: "model-1", name: "Snapshot Model" });
    expect(insertPayload.results_json._experiment_config).toEqual(expect.objectContaining({ replications: 2, seed: 654 }));
    expect(insertPayload.results_json._result_detail_level).toBe("full");
    expect(insertPayload.results_json.logSummary).toEqual({ entries: 1, finalPhase: "END", finalTime: 25, finalMessage: "Run finished" });
    expect(insertPayload.results_json.entitySummary).toEqual([{ type: "Customer", status: "done", count: 1 }]);
    expect(insertPayload.results_json.timeSeries).toHaveLength(1);
    expect(insertPayload.results_json.waitDist.Main.values).toEqual([2, 4]);
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
