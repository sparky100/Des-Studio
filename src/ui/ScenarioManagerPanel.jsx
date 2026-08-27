// ui/ScenarioManagerPanel.jsx — Named-scenario manager (F-9).
//
// Scenario objects (name, parameter deltas, seed, replication count) that
// front the engine's existing paired-t/ANOVA/Tukey HSD statistics
// (src/engine/statistics.js) — oneWayANOVA/tukeyHSD previously had no UI
// surface anywhere in the app despite being implemented and tested.
//
// A scenario here is deliberately NOT a model fork (that's the separate,
// heavier parent_model_id/forkModel() concept ScenariosSection.jsx already
// renders above this panel) — it's a lightweight, named set of parameter
// deltas applied via sweep-params.js's applySweepValues() on top of the
// current model, run in-memory on demand for comparison (same pattern
// AdaptiveBatchPanel.jsx already uses for its baseline-vs-patched Explore
// comparison) rather than persisted to simulation_runs.
//
// Known limitation: models using ADR-016 named/shared schedules need a
// resolved schedulesMap passed to runReplications() to run correctly; this
// panel doesn't fetch one, so scenarios on those models may not reflect
// shared-schedule timing. Fine for the common case; flagged here rather
// than silently wrong.
import { useEffect, useState } from "react";
import { createScenario, deleteScenario, listScenarios } from "../db/scenarios.js";
import { enumerateSweepableParams, applySweepValues } from "../engine/sweep-params.js";
import { runReplications } from "../engine/replication-runner.js";
import { compareScenarios, oneWayANOVA, tukeyHSD } from "../engine/statistics.js";
import { ScenarioComparisonTable } from "./shared/ScenarioComparisonTable.jsx";
import { AnovaTukeyTable } from "./shared/AnovaTukeyTable.jsx";
import { CI_METRICS, METRIC_LABELS } from "./execute/executeHelpers.js";
import { Btn } from "./shared/components.jsx";
import { ParamBrowserPanel, paramColor } from "./shared/ParamBrowserPanel.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";
const BASE_ID = "__base__";

function runScenarioReplications(model, paramDeltas, seed, replications, experimentDefaults) {
  const patched = paramDeltas.length ? applySweepValues(model, paramDeltas) : model;
  return new Promise((resolve, reject) => {
    runReplications({
      model: patched,
      replications,
      baseSeed: seed,
      warmupPeriod: experimentDefaults.warmupPeriod ?? 0,
      maxSimTime: experimentDefaults.terminationMode === "condition" ? null : (experimentDefaults.maxSimTime ?? 500),
      terminationCondition: experimentDefaults.terminationMode === "condition" ? experimentDefaults.terminationCondition : null,
      collectTimeSeries: false,
      onComplete: resolve,
      onError: reject,
    });
  });
}

export function ScenarioManagerPanel({ model, userId }) {
  const { C } = useTheme();
  const [scenarios, setScenarios] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSeed, setFormSeed] = useState("");
  const [formReplications, setFormReplications] = useState("10");
  const [formDeltas, setFormDeltas] = useState([]); // [{paramConfig, value}]
  const [paramPick, setParamPick] = useState("");
  const [paramPickerOpen, setParamPickerOpen] = useState(false);
  const [paramValue, setParamValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [compareMetric, setCompareMetric] = useState("summary.avgWait");
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState(null);
  const [compareResult, setCompareResult] = useState(null);

  useEffect(() => {
    if (!userId) return; // named scenarios need an owner; anonymous/local mode isn't supported
    let cancelled = false;
    listScenarios(model.id)
      .then(rows => { if (!cancelled) setScenarios(rows); })
      .catch(e => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [model.id, userId]);

  if (!userId) return null;

  const sweepableParams = enumerateSweepableParams(model);

  const toggleSelected = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const addDelta = () => {
    const paramConfig = sweepableParams.find(p => p.path === paramPick);
    const value = Number(paramValue);
    if (!paramConfig || !Number.isFinite(value)) return;
    setFormDeltas(prev => [...prev.filter(d => d.paramConfig.path !== paramConfig.path), { paramConfig, value }]);
    setParamPick("");
    setParamValue("");
  };

  const removeDelta = (path) => setFormDeltas(prev => prev.filter(d => d.paramConfig.path !== path));

  const resetForm = () => {
    setFormName(""); setFormSeed(""); setFormReplications("10");
    setFormDeltas([]); setParamPick(""); setParamPickerOpen(false); setParamValue(""); setFormError(null);
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!formName.trim()) { setFormError("Name the scenario before saving."); return; }
    if (formDeltas.length === 0) { setFormError("Add at least one parameter change."); return; }
    setSaving(true);
    setFormError(null);
    try {
      await createScenario(model.id, userId, {
        name: formName,
        paramDeltas: formDeltas,
        baseSeed: formSeed.trim() ? Number(formSeed) : null,
        replications: formReplications,
      });
      const rows = await listScenarios(model.id);
      setScenarios(rows);
      resetForm();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteScenario(id);
      setScenarios(prev => prev.filter(s => s.id !== id));
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    } catch (e) {
      setLoadError(e.message);
    }
  };

  const handleCompare = async () => {
    const groupIds = [...selectedIds];
    if (groupIds.length < 2) { setCompareError("Select at least 2 (a saved scenario or the base model) to compare."); return; }
    setComparing(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const experimentDefaults = model.experimentDefaults || {};
      const groups = await Promise.all(groupIds.map(async id => {
        if (id === BASE_ID) {
          const reps = await runScenarioReplications(model, [], null, 10, experimentDefaults);
          return { label: "Base model", reps };
        }
        const scenario = scenarios.find(s => s.id === id);
        const reps = await runScenarioReplications(model, scenario.param_deltas, scenario.base_seed, scenario.replications, experimentDefaults);
        return { label: scenario.name, reps };
      }));

      if (groups.length === 2) {
        const result = compareScenarios(groups[0].reps, groups[1].reps, CI_METRICS, {
          labelA: groups[0].label, labelB: groups[1].label,
        });
        setCompareResult({ type: "pairedT", result });
      } else {
        const valueGroups = groups.map(g => g.reps
          .map(r => (r?.result || r)?.summary?.[compareMetric.replace("summary.", "")])
          .filter(Number.isFinite));
        const labels = groups.map(g => g.label);
        const anova = oneWayANOVA(valueGroups, { labels });
        const tukey = tukeyHSD(valueGroups, { labels });
        setCompareResult({ type: "anova", metric: compareMetric, anova, tukey });
      }
    } catch (e) {
      setCompareError(e.message);
    } finally {
      setComparing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700 }}>
          NAMED SCENARIOS ({scenarios.length})
        </span>
        <Btn small variant="ghost" onClick={() => setShowForm(s => !s)}>
          {showForm ? "Cancel" : "+ New Scenario"}
        </Btn>
      </div>

      {loadError && <div style={{ fontSize: 12, color: C.red, fontFamily: SANS }}>{loadError}</div>}

      {showForm && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder={'Scenario name (e.g. "Double clerk staffing")'}
            style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: SANS, fontSize: 12, padding: "6px 8px" }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {formDeltas.map(d => (
              <span key={d.paramConfig.path} style={{ display: "inline-flex", alignItems: "center", gap: 4,
                background: `${C.cEvent}18`, border: `1px solid ${C.cEvent}44`, borderRadius: 5,
                padding: "3px 8px", fontFamily: SANS, fontSize: 11, color: C.cEvent }}>
                {d.paramConfig.label} = {d.value}
                <button onClick={() => removeDelta(d.paramConfig.path)} aria-label={`Remove change to ${d.paramConfig.label}`}
                  style={{ background: "none", border: "none", color: C.cEvent, cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {(() => {
              const picked = sweepableParams.find(p => p.path === paramPick);
              if (!picked) {
                return (
                  <Btn small variant="ghost" ariaLabel="Choose a parameter to change" onClick={() => setParamPickerOpen(o => !o)}>
                    + Choose parameter
                  </Btn>
                );
              }
              const color = paramColor(picked.type, C);
              return (
                <button onClick={() => setParamPickerOpen(o => !o)} aria-label="Change the chosen parameter"
                  style={{ flex: 1, minWidth: 160, textAlign: "left", background: `${color}18`, border: `1px solid ${color}44`,
                    borderRadius: 5, padding: "5px 8px", fontFamily: SANS, fontSize: 12, color, cursor: "pointer" }}>
                  {picked.label}{picked.subLabel ? ` (${picked.subLabel})` : ""} ▾
                </button>
              );
            })()}
            <input type="number" value={paramValue} onChange={e => setParamValue(e.target.value)}
              placeholder="new value" aria-label="New value for the chosen parameter"
              style={{ width: 100, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: SANS, fontSize: 12, padding: "6px 8px" }} />
            <Btn small variant="ghost" onClick={addDelta} disabled={!paramPick || paramValue === ""}>Add</Btn>
          </div>
          {paramPickerOpen && (
            <ParamBrowserPanel
              params={sweepableParams}
              singleSelect
              selectedPath={paramPick || null}
              alreadyAdded={new Set(formDeltas.map(d => d.paramConfig.path))}
              onSelect={path => {
                setParamPick(path);
                const picked = sweepableParams.find(p => p.path === path);
                if (picked && Number.isFinite(picked.currentValue)) setParamValue(String(picked.currentValue));
              }}
              onClose={() => setParamPickerOpen(false)}
            />
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <label style={{ fontSize: 10, color: C.muted, fontFamily: SANS }}>Seed</label>
            <input type="number" value={formSeed} onChange={e => setFormSeed(e.target.value)} placeholder="random"
              style={{ width: 90, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: SANS, fontSize: 12, padding: "6px 8px" }} />
            <label style={{ fontSize: 10, color: C.muted, fontFamily: SANS }}>Replications</label>
            <input type="number" min={1} value={formReplications} onChange={e => setFormReplications(e.target.value)}
              style={{ width: 70, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: SANS, fontSize: 12, padding: "6px 8px" }} />
          </div>
          {formError && <div style={{ fontSize: 12, color: C.red, fontFamily: SANS }}>{formError}</div>}
          <div>
            <Btn small onClick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Save scenario"}</Btn>
          </div>
        </div>
      )}

      {scenarios.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text, fontFamily: SANS }}>
            <input type="checkbox" checked={selectedIds.has(BASE_ID)} onChange={() => toggleSelected(BASE_ID)} />
            Base model (current parameters)
          </label>
          {scenarios.map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text, fontFamily: SANS, flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelected(s.id)} />
                <span>{s.name}</span>
                <span style={{ color: C.muted, fontSize: 11 }}>
                  ({s.param_deltas.length} change{s.param_deltas.length === 1 ? "" : "s"}, {s.replications} rep{s.replications === 1 ? "" : "s"})
                </span>
              </label>
              <Btn small variant="danger" ariaLabel={`Delete scenario ${s.name}`} onClick={() => handleDelete(s.id)}>✕</Btn>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            {selectedIds.size >= 3 && (
              <select value={compareMetric} onChange={e => setCompareMetric(e.target.value)}
                style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: SANS, fontSize: 12, padding: "6px 8px" }}>
                {CI_METRICS.map(m => <option key={m} value={m}>{METRIC_LABELS[m] || m}</option>)}
              </select>
            )}
            <Btn small onClick={handleCompare} disabled={comparing || selectedIds.size < 2}>
              {comparing ? "Running…" : `Compare selected (${selectedIds.size})`}
            </Btn>
          </div>
        </div>
      )}

      {compareError && <div style={{ fontSize: 12, color: C.red, fontFamily: SANS }}>{compareError}</div>}

      {compareResult?.type === "pairedT" && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <ScenarioComparisonTable comparison={compareResult.result} />
        </div>
      )}
      {compareResult?.type === "anova" && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <AnovaTukeyTable metric={compareResult.metric} anova={compareResult.anova} tukey={compareResult.tukey} />
        </div>
      )}
    </div>
  );
}
