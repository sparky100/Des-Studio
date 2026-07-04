// ui/ScenariosSection.jsx — Scenario relationships on model Overview tab
import { useState } from "react";
import { fetchRunHistory, getRunResultsJson } from "../db/models.js";
import { compareScenarios } from "../engine/statistics.js";
import { ScenarioComparisonTable } from "./shared/ScenarioComparisonTable.jsx";
import { ModelDiffPreview } from "./editors/ModelDiffPreview.jsx";
import { Btn } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

const COMPARE_METRICS = [
  "summary.avgWait",
  "summary.avgSvc",
  "summary.avgSojourn",
  "summary.served",
  "summary.servedRatio",
];

function getReps(run) {
  const reps = run?.results_json?.replications;
  if (Array.isArray(reps) && reps.length) return reps;
  const summary = run?.results_json?.summary;
  if (summary && Object.keys(summary).length) return [{ summary }];
  return [];
}

function meanOf(reps, metricPath) {
  const parts = metricPath.split(".");
  const vals = reps
    .map(r => { let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; })
    .filter(Number.isFinite);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

export function ScenariosSection({ model, parentModel, childScenarios = [], onOpenScenario, onOpenParent }) {
  const { C } = useTheme();
  const [diffScenario, setDiffScenario] = useState(null);
  const [compareState, setCompareState] = useState({}); // keyed by scenario.id

  const isChild = !!model.parentModelId;
  const hasChildren = childScenarios.length > 0;

  if (!isChild && !hasChildren) return null;

  const handleCompareRuns = async (scenario) => {
    setCompareState(prev => ({ ...prev, [scenario.id]: { loading: true } }));
    try {
      const [runsA, runsB] = await Promise.all([
        fetchRunHistory(model.id, { limit: 1 }),
        fetchRunHistory(scenario.id, { limit: 1 }),
      ]);
      const runA = runsA?.[0];
      const runB = runsB?.[0];
      if (!runA || !runB) {
        const msg = !runA ? "This model has no run history yet." : "Scenario has no run history yet.";
        setCompareState(prev => ({ ...prev, [scenario.id]: { error: msg } }));
        return;
      }
      const [jsonA, jsonB] = await Promise.all([getRunResultsJson(runA.id), getRunResultsJson(runB.id)]);
      const repsA = getReps({ results_json: jsonA });
      const repsB = getReps({ results_json: jsonB });
      if (!repsA.length || !repsB.length) {
        setCompareState(prev => ({ ...prev, [scenario.id]: { error: "No replication data found in run history." } }));
        return;
      }
      const result = compareScenarios(repsA, repsB, COMPARE_METRICS, {
        labelA: model.name || "Base",
        labelB: scenario.name || "Scenario",
      });
      const meansA = {}, meansB = {};
      for (const m of COMPARE_METRICS) {
        meansA[m] = meanOf(repsA, m);
        meansB[m] = meanOf(repsB, m);
      }
      const active = COMPARE_METRICS.filter(m => meansA[m] != null || meansB[m] != null);
      setCompareState(prev => ({
        ...prev,
        [scenario.id]: {
          result: {
            ...result,
            comparisons: result.comparisons.filter(c => active.includes(c.metric)),
            meansA: Object.fromEntries(active.map(m => [m, meansA[m]])),
            meansB: Object.fromEntries(active.map(m => [m, meansB[m]])),
          },
        },
      }));
    } catch (e) {
      setCompareState(prev => ({ ...prev, [scenario.id]: { error: `Failed: ${e.message}` } }));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700 }}>
        {isChild ? "BASED ON" : `SCENARIOS (${childScenarios.length})`}
      </div>

      {/* Child view: parent link */}
      {isChild && (
        <div style={{
          background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}`,
          borderRadius: 8, padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <span style={{ fontSize: 13, color: C.text, fontFamily: SANS }}>
            {parentModel?.name || "Parent model"}
          </span>
          {onOpenParent && parentModel && (
            <Btn small variant="ghost" onClick={onOpenParent}>Open</Btn>
          )}
        </div>
      )}

      {/* Parent view: list of child scenarios */}
      {!isChild && childScenarios.map(scenario => {
        const cs = compareState[scenario.id];
        return (
          <div key={scenario.id} style={{
            background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: SANS }}>{scenario.name}</div>
                {scenario.description && (
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS, marginTop: 2, lineHeight: 1.5 }}>
                    {scenario.description.length > 100 ? scenario.description.slice(0, 100) + "…" : scenario.description}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                {onOpenScenario && (
                  <Btn small variant="ghost" onClick={() => onOpenScenario(scenario)}>Open</Btn>
                )}
                <Btn small variant="ghost" onClick={() => setDiffScenario(scenario)}>Compare definitions</Btn>
                <Btn small variant="ghost"
                  disabled={cs?.loading}
                  onClick={() => {
                    if (cs?.result || cs?.error) {
                      setCompareState(prev => { const n = { ...prev }; delete n[scenario.id]; return n; });
                    } else {
                      handleCompareRuns(scenario);
                    }
                  }}>
                  {cs?.loading ? "Loading…" : cs?.result || cs?.error ? "Hide runs" : "Compare runs"}
                </Btn>
              </div>
            </div>

            {cs && !cs.loading && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                {cs.error && <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS }}>{cs.error}</div>}
                {cs.result && <ScenarioComparisonTable comparison={cs.result} />}
              </div>
            )}
          </div>
        );
      })}

      {/* Compare definitions modal */}
      {diffScenario && (
        <div style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, width: "min(680px, 100%)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: SANS }}>
                {model.name} vs. {diffScenario.name}
              </span>
              <button onClick={() => setDiffScenario(null)} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <ModelDiffPreview
              currentModel={model}
              proposedModel={diffScenario}
              onDiscard={() => setDiffScenario(null)}
              readOnly
            />
          </div>
        </div>
      )}
    </div>
  );
}
