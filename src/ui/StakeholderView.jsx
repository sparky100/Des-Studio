// ui/StakeholderView.jsx — the simplified surface a viewer-role user gets
// instead of the full modelling environment (ModelDetail).
//
// A business stakeholder opens a model shared with them and sees: the model
// name/description, the settings its owner chose to expose (exposedParams,
// curated in the Access tab's "Business view" section), a Run button, and
// business-friendly KPI results. Never the design surface.
//
// Runs are N replications executed in-browser via runReplications (the same
// headless pattern as ScenarioManagerPanel/AdaptiveBatchPanel) and are NOT
// persisted — results live in memory for this visit only. Every string here
// follows the plain-English presentation rule (AGENTS.md §7.11): no
// modelling jargon, no raw validation codes.
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveExposedParams, clampExposedValue } from "../engine/exposed-params.js";
import { applySweepValues } from "../engine/sweep-params.js";
import { runReplications } from "../engine/replication-runner.js";
import { summarizeReplicationResults } from "../engine/statistics.js";
import { estimateMaxCycles } from "../engine/complexity-estimator.js";
import { getRunAdmission } from "../engine/run-admission.js";
import { CI_METRICS, makeBatchResult } from "./execute/executeHelpers.js";
import { SummaryCardGrid } from "./results/ResultsWorkspace.jsx";
import { fetchModelSchedules, buildSchedulesMap } from "../db/models.js";
import { Btn } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

export function StakeholderView({ model, plan = "free", isAdmin = false, tierPolicies, onBack }) {
  const { C, FONT } = useTheme();
  const [schedulesState, setSchedulesState] = useState({ status: "loading", map: undefined, retryKey: 0 });
  const [values, setValues] = useState({}); // knob overrides keyed by param path
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [runError, setRunError] = useState(null);
  const [outcome, setOutcome] = useState(null); // { batch, reps }
  const cancelRef = useRef(null);

  const { resolved } = resolveExposedParams(model);

  const experimentDefaults = model.experimentDefaults || {};
  const terminationMode = experimentDefaults.terminationMode === "condition" ? "condition" : "time";
  const warmupPeriod = experimentDefaults.warmupPeriod ?? 0;
  const maxSimTime = terminationMode === "condition" ? null : (experimentDefaults.maxSimTime ?? 500);
  const terminationCondition = terminationMode === "condition" ? experimentDefaults.terminationCondition : null;
  const desiredReplications = Math.max(1, Number.parseInt(String(experimentDefaults.replications ?? 10), 10) || 10);

  // Admission: gate on the model being runnable and within this user's tier.
  // Replications are clamped to the tier limit rather than erroring — the
  // viewer never chose the count, the owner's defaults did.
  const admission = useMemo(() => {
    const base = { warmupPeriod, maxSimTime, terminationMode, terminationCondition, plan, isAdmin, tierPolicies };
    const first = getRunAdmission(model, { ...base, replications: desiredReplications });
    const cap = first.tierPolicy?.maxReplications;
    const replications = cap ? Math.min(desiredReplications, cap) : desiredReplications;
    const final = replications === desiredReplications ? first : getRunAdmission(model, { ...base, replications });
    return { ...final, replications };
  }, [model, warmupPeriod, maxSimTime, terminationMode, terminationCondition, plan, isAdmin, tierPolicies, desiredReplications]);

  const blocked = admission.hardErrors.length > 0;

  // ADR-016: resolve named schedules before any run. Prefer the default
  // schedule; if none is marked default, pass every row rather than an empty
  // map (an empty map silently zeroes scheduled arrivals).
  useEffect(() => {
    let cancelled = false;
    setSchedulesState(s => ({ ...s, status: "loading", map: undefined }));
    fetchModelSchedules(model.id)
      .then(rows => {
        if (cancelled) return;
        const defaultRow = (rows || []).find(r => r.isDefault);
        setSchedulesState(s => ({ ...s, status: "ready", map: buildSchedulesMap(defaultRow ? [defaultRow] : (rows || [])) }));
      })
      .catch(() => { if (!cancelled) setSchedulesState(s => ({ ...s, status: "error", map: undefined })); });
    return () => { cancelled = true; };
  }, [model.id, schedulesState.retryKey]);

  // Cancel any in-flight run on unmount.
  useEffect(() => () => { cancelRef.current?.cancel?.(); }, []);

  const usesNamedSchedules = (model.bEvents || []).some(b => (b.schedules || []).some(s => s.scheduleRef));
  const schedulesMissing = usesNamedSchedules && schedulesState.status === "ready"
    && Object.keys(schedulesState.map || {}).length === 0;

  const effectiveValue = (p) => {
    const v = values[p.path];
    return v === undefined || v === "" ? p.currentValue : Number(v);
  };

  const handleRun = () => {
    if (running || blocked || schedulesState.status !== "ready") return;
    setRunError(null);
    setOutcome(null);
    setProgress(null);
    setRunning(true);

    const deltas = resolved
      .map(p => ({ paramConfig: p, value: clampExposedValue(p, effectiveValue(p)) }))
      .filter(d => Number.isFinite(d.value) && d.value !== d.paramConfig.currentValue);
    const patched = deltas.length ? applySweepValues(model, deltas) : model;

    const handle = runReplications({
      model: patched,
      replications: admission.replications,
      baseSeed: experimentDefaults.seed ?? 0,
      warmupPeriod,
      maxSimTime,
      terminationCondition,
      maxCycles: estimateMaxCycles(admission.complexityEstimate),
      collectTimeSeries: false,
      schedulesMap: schedulesState.map,
      onProgress: p => setProgress(p),
      onComplete: reps => {
        const stats = summarizeReplicationResults(reps, CI_METRICS);
        const batch = makeBatchResult(reps, stats, maxSimTime, warmupPeriod);
        setOutcome({ batch, reps });
        setRunning(false);
        cancelRef.current = null;
      },
      onError: () => {
        setRunError("Something went wrong while running the model. Try again, or contact the model's owner.");
        setRunning(false);
        cancelRef.current = null;
      },
      onCancelled: () => {
        setRunning(false);
        cancelRef.current = null;
      },
    });
    cancelRef.current = handle;
  };

  const panelStyle = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Btn small variant="ghost" onClick={onBack}>← Back to my models</Btn>
      </div>

      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, fontFamily: SANS, margin: 0 }}>{model.name}</h1>
        {model.description && (
          <p style={{ fontSize: 14, color: C.muted, fontFamily: SANS, lineHeight: 1.6, margin: "6px 0 0" }}>{model.description}</p>
        )}
        <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS, marginTop: 6 }}>
          Shared with you — explore what happens when you change the settings below and run the simulation.
        </div>
      </div>

      {blocked ? (
        <div style={{ ...panelStyle, borderColor: `${C.amber}66` }}>
          <div style={{ fontSize: 13, color: C.amber, fontFamily: SANS, lineHeight: 1.6 }}>
            This model can't be run right now — it has a problem only its owner can fix. Let them know, and try again once it's updated.
          </div>
        </div>
      ) : (
        <>
          <div style={panelStyle}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>
              SETTINGS YOU CAN ADJUST
            </div>
            {resolved.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS, lineHeight: 1.6 }}>
                The owner hasn't made any settings adjustable — you can still run the model exactly as it is.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {resolved.map(p => {
                  const changed = values[p.path] !== undefined && values[p.path] !== "" && Number(values[p.path]) !== p.currentValue;
                  return (
                    <div key={p.path} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 13, color: C.text, fontFamily: SANS, fontWeight: 600 }}>{p.displayLabel}</div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS }}>
                          Standard: {p.currentValue === Infinity ? "unlimited" : p.currentValue}
                          {p.min != null && p.max != null ? ` · between ${p.min} and ${p.max}` : p.min != null ? ` · at least ${p.min}` : p.max != null ? ` · up to ${p.max}` : ""}
                        </div>
                      </div>
                      <input
                        type="number"
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
                        style={{ width: 110, background: C.bg, border: `1px solid ${changed ? C.accent : C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT, fontSize: 13, padding: "8px 10px" }}
                      />
                      {changed && (
                        <Btn small variant="ghost" onClick={() => setValues(v => { const n = { ...v }; delete n[p.path]; return n; })}>Reset</Btn>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={panelStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Btn variant="primary" disabled={running || schedulesState.status !== "ready"} onClick={handleRun}>
                {running ? "Running…" : outcome ? "Run again" : "Run the simulation"}
              </Btn>
              {running && <Btn small variant="ghost" onClick={() => cancelRef.current?.cancel?.()}>Cancel</Btn>}
              <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS, lineHeight: 1.5 }}>
                Runs the simulation {admission.replications} time{admission.replications === 1 ? "" : "s"} with different random variations and averages the results.
              </div>
            </div>
            {schedulesState.status === "loading" && (
              <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS, marginTop: 8 }}>Preparing the model…</div>
            )}
            {schedulesState.status === "error" && (
              <div style={{ fontSize: 12, color: C.red, fontFamily: SANS, marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                <span>Couldn't load part of the model.</span>
                <Btn small variant="ghost" onClick={() => setSchedulesState(s => ({ ...s, retryKey: s.retryKey + 1 }))}>Try again</Btn>
              </div>
            )}
            {schedulesMissing && (
              <div style={{ fontSize: 11, color: C.amber, fontFamily: SANS, marginTop: 8 }}>
                This model expects a timetable that couldn't be found — results may show fewer arrivals than expected.
              </div>
            )}
            {running && progress && (
              <div style={{ marginTop: 10 }}>
                <div aria-label="Run progress" style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round(((progress.completed || 0) / Math.max(1, progress.total || admission.replications)) * 100)}%`, background: C.accent, transition: "width 200ms ease" }} />
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS, marginTop: 4 }}>
                  Finished {progress.completed || 0} of {progress.total || admission.replications} runs
                </div>
              </div>
            )}
            {runError && (
              <div style={{ fontSize: 12, color: C.red, fontFamily: SANS, marginTop: 8 }}>{runError}</div>
            )}
          </div>

          {outcome && (
            <div style={panelStyle}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>
                RESULTS
              </div>
              <SummaryCardGrid results={outcome.batch} replicationResults={outcome.reps} model={model} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
