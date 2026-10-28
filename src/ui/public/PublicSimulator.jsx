// ui/public/PublicSimulator.jsx — run a published model in the visitor's browser.
//
// The model JSON is the payload, and the engine is client-side, so the
// visitor's machine does the work: there is no server-side run, no per-viewer
// cost, and no way for a visitor's parameter changes to touch the owner's
// model (ADR-022).
//
// This is NOT a read-only copy of the app. It shows the model, the settings
// the owner chose to expose, and the results — nothing else.
//
// The named schedules (ADR-016) matter here more than anywhere else in the
// product: a B-event's `scheduleRef` points at a row in `model_schedules`, and
// the engine resolves that reference through a schedules map. If the map is
// missing, the engine pushes the event to t=1e9 and the published model
// silently runs with NO scheduled arrivals. So the map is built from the
// payload's own schedule snapshot, using the same rule the app uses for a
// model it owns (the default schedule if there is one, otherwise all of
// them).
import { useEffect, useMemo, useRef, useState } from "react";
import { buildPublishedSchedulesMap } from "../../db/published.js";
import { resolveExposedParams, clampExposedValue } from "../../engine/exposed-params.js";
import { applySweepValues } from "../../engine/sweep-params.js";
import { runReplications } from "../../engine/replication-runner.js";
import { summarizeReplicationResults } from "../../engine/statistics.js";
import { estimateMaxCycles } from "../../engine/complexity-estimator.js";
import { checkPublishedRun } from "../../engine/published-run-check.js";
import { buildGoalGapsFromResults } from "../../llm/prompts.js";
import {
  CI_METRICS, TIME_SERIES_GRID_POINTS, buildGoalOutcomes, buildRunModelSnapshot,
  makeBatchResult, makeBatchRuntimeMetrics, makeTimeSeriesAccumulator,
} from "../execute/executeHelpers.js";
import { ResultsWorkspace } from "../results/ResultsWorkspace.jsx";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { downloadTextFile } from "../shared/utils.js";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

export function PublicSimulator({ payload, onClose }) {
  const { C, FONT } = useTheme();
  const [values, setValues] = useState({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [runError, setRunError] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const cancelRef = useRef(null);
  const runIdRef = useRef(0);
  const [reporting, setReporting] = useState(false);
  useEffect(() => () => {
    runIdRef.current += 1;
    cancelRef.current?.cancel?.();
  }, []);

  // The published payload's model, with the owner's exposed-parameter paths
  // folded in so the same resolution the Business view uses applies.
  const model = useMemo(() => ({
    ...(payload?.model || {}),
    exposedParams: payload?.exposed_params || [],
  }), [payload]);

  // The schedules map. Built the same way the app builds it for a model it
  // owns — see the note at the top of this file.
  const schedulesMap = useMemo(
    () => buildPublishedSchedulesMap(payload?.schedules),
    [payload]
  );

  const { resolved } = useMemo(() => resolveExposedParams(model), [model]);
  const patched = useMemo(() => {
    const deltas = resolved.map(param => ({
      paramConfig: param,
      value: clampExposedValue(param, values[param.path] === undefined || values[param.path] === ""
        ? param.currentValue : Number(values[param.path])),
    })).filter(delta => Number.isFinite(delta.value) && delta.value !== delta.paramConfig.currentValue);
    return deltas.length ? applySweepValues(model, deltas) : model;
  }, [model, resolved, values]);

  const { settings, complexityEstimate, admission } = useMemo(
    () => checkPublishedRun(patched, schedulesMap),
    [patched, schedulesMap]
  );
  const { warmupPeriod, maxSimTime, terminationCondition, seed, replications: desiredReplications } = settings;

  const blocked = admission.hardErrors.length > 0;

  // A model whose timetable is missing from the payload would run with no
  // scheduled arrivals. Say so rather than quietly showing a visitor fewer
  // arrivals than the owner intended.
  const schedulesMissing = (model.bEvents || []).some(event => (event.schedules || []).some(
    schedule => schedule.scheduleRef && !schedulesMap[schedule.scheduleRef] && !schedulesMap[`${schedule.scheduleRef}:${event.id}`]
  ));

  const handleRun = () => {
    if (running || blocked || schedulesMissing) return;
    setRunError(null);
    setOutcome(null);
    setProgress(null);
    setRunning(true);

    const runId = ++runIdRef.current;
    // The charts in the results need the time series, which the tier drops for
    // a model too large to chart cheaply.
    const collectTimeSeries = admission.effectiveSettings?.collectTimeSeries !== false;
    const tsAccumulator = collectTimeSeries ? makeTimeSeriesAccumulator(TIME_SERIES_GRID_POINTS, maxSimTime) : null;
    const startedAt = Date.now();
    try {
      const handle = runReplications({
        model: patched,
        replications: desiredReplications,
        baseSeed: seed,
        warmupPeriod,
        maxSimTime,
        terminationCondition,
        maxCycles: estimateMaxCycles(complexityEstimate),
        maxCEventScans: admission.effectiveSettings?.maxCEventScans,
        collectTimeSeries,
        schedulesMap,
        onTimeSeriesSample: tsAccumulator ? ts => tsAccumulator.addSeries(ts) : undefined,
        timeSeriesGridPoints: tsAccumulator && Number.isFinite(maxSimTime) && maxSimTime > 0 ? TIME_SERIES_GRID_POINTS : null,
        onProgress: p => { if (runId === runIdRef.current) setProgress(p); },
        onComplete: reps => {
          if (runId !== runIdRef.current) return;
          const stats = summarizeReplicationResults(reps, CI_METRICS);
          const batch = {
            ...makeBatchResult(reps, stats, maxSimTime, warmupPeriod, tsAccumulator?.getResult()),
            runtimeMetrics: makeBatchRuntimeMetrics(reps, reps.length, Date.now() - startedAt),
            aggregateStats: stats,
          };
          // Same extras the Run page stores, so the results view reads them the same way.
          batch._experiment_config = {
            maxSimTime, warmupPeriod, replications: reps.length, terminationMode: settings.terminationMode,
            terminationCondition, seed,
          };
          batch._model_snapshot = buildRunModelSnapshot(patched, batch._experiment_config);
          batch.goalOutcomes = buildGoalOutcomes(buildGoalGapsFromResults(patched, batch));
          setOutcome({ batch, reps, model: patched });
          setRunning(false);
          cancelRef.current = null;
        },
        onError: () => {
          if (runId !== runIdRef.current) return;
          setRunError("Something went wrong while running the model.");
          setRunning(false);
          cancelRef.current = null;
        },
        onCancelled: () => {
          if (runId !== runIdRef.current) return;
          setRunning(false);
          cancelRef.current = null;
        },
      });
      cancelRef.current = handle;
    } catch {
      setRunError("Something went wrong while starting the model.");
      setRunning(false);
    }
  };

  const downloadReport = async () => {
    setReporting(true);
    try {
      const { generateReport } = await import("../../reports/index.js");
      const report = await generateReport(
        { ...outcome.model, name: payload.title, description: payload.description },
        outcome.batch,
        { maxSimTime, warmupPeriod, replications: outcome.reps.length, seed },
        { modelDescriptionText: payload.description || payload.summary || "", version: payload.released_version },
        { format: "html", includeAi: false, aggregateStats: outcome.batch.aggregateStats }
      );
      downloadTextFile(report, "simulation-report.html", "text/html");
    } catch {
      setRunError("Could not create the report. Please try again.");
    } finally {
      setReporting(false);
    }
  };

  const panel = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {resolved.length > 0 && (
        <div style={panel}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>
            SETTINGS YOU CAN CHANGE
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {resolved.map(p => {
              const changed = values[p.path] !== undefined && values[p.path] !== "" && Number(values[p.path]) !== p.currentValue;
              return (
                <div key={p.path} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13, color: C.text, fontFamily: SANS, fontWeight: 600 }}>{p.displayLabel}</div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS }}>
                      Standard: {p.currentValue === Infinity ? "unlimited" : p.currentValue}
                    </div>
                  </div>
                  <input
                    type="number"
                    disabled={running}
                    aria-label={p.displayLabel}
                    value={values[p.path] ?? (p.currentValue === Infinity ? "" : p.currentValue)}
                    min={p.min}
                    max={p.max}
                    onChange={e => setValues(v => ({ ...v, [p.path]: e.target.value }))}
                    onBlur={e => {
                      if (e.target.value === "") return;
                      const clamped = clampExposedValue(p, Number(e.target.value));
                      if (Number.isFinite(clamped) && clamped !== Number(e.target.value)) {
                        setValues(v => ({ ...v, [p.path]: String(clamped) }));
                      }
                    }}
                    style={{
                      width: 110, background: C.bg, border: `1px solid ${changed ? C.accent : C.border}`,
                      borderRadius: 6, color: C.text, fontFamily: FONT, fontSize: 13, padding: "8px 10px",
                    }}
                  />
                  {changed && (
                    <Btn small variant="ghost" onClick={() => setValues(v => { const n = { ...v }; delete n[p.path]; return n; })}>
                      Reset
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {schedulesMissing && (
        <div style={{ ...panel, borderColor: `${C.amber}55`, fontSize: 12, color: C.amber, fontFamily: SANS, lineHeight: 1.6 }}>
          This published copy is missing a timetable. Its author needs to publish it again before it can run.
        </div>
      )}

      {blocked && (
        <div style={{ ...panel, borderColor: `${C.amber}55`, fontSize: 13, color: C.amber, fontFamily: SANS, lineHeight: 1.6 }}>
          These settings cannot be run{admission.hardErrors[0] ? `: ${admission.hardErrors[0].message}` : "."} Reset your changes or ask the author to review the published model.
        </div>
      )}

      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Btn variant="primary" onClick={handleRun} disabled={running || blocked || schedulesMissing}>
            {running ? "Running…" : outcome ? "Run again" : "Run the simulation"}
          </Btn>
          {running && <Btn small variant="ghost" onClick={() => cancelRef.current?.cancel?.()}>Cancel</Btn>}
          {onClose && <Btn small variant="ghost" onClick={onClose}>Close</Btn>}
          <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS, lineHeight: 1.5 }}>
            Runs the simulation {desiredReplications} time{desiredReplications === 1 ? "" : "s"} with
            different random variations and averages the results.
          </div>
        </div>
        {running && progress && (
          <div style={{ marginTop: 10 }}>
            <div aria-label="Run progress" style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.round(((progress.completed || 0) / Math.max(1, progress.total || desiredReplications)) * 100)}%`,
                background: C.accent, transition: "width 200ms ease",
              }} />
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS, marginTop: 4 }}>
              Finished {progress.completed || 0} of {progress.total || desiredReplications} runs
            </div>
          </div>
        )}
        {runError && (
          <div style={{ fontSize: 12, color: C.red, fontFamily: SANS, marginTop: 8 }}>{runError}</div>
        )}
      </div>

      {outcome && (
        <div style={panel}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>
            RESULTS
          </div>
          {(outcome.batch.cycleLimitReached || outcome.batch.scanLimitReached || outcome.batch.phaseCTruncated) && (
            <div role="alert" style={{ color: C.amber, fontFamily: SANS }}>
              Some runs reached a safety limit or could not finish all events. Treat these results as incomplete.
            </div>
          )}
          <ResultsWorkspace results={outcome.batch} replicationResults={outcome.reps} model={outcome.model} />
          <Btn variant="ghost" onClick={downloadReport} disabled={reporting}>
            {reporting ? "Preparing report…" : "Download report"}
          </Btn>
        </div>
      )}
    </div>
  );
}
