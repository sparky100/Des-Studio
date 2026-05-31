// ui/ModelHealthPanel.jsx — Model health summary: status badge, issue chips, action hints
import { alpha } from "./shared/tokens.js";
import { Btn } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

export function ModelHealthPanel({ model, validation, isStarterBlank, tab, setTab, latestResults, onGoToHistory }) {
  const { C, FONT } = useTheme();
  const blockers = validation.errors || [];
  const warnings = validation.warnings || [];
  const issues = [...blockers, ...warnings].slice(0, 5);
  const hasBlockers = blockers.length > 0;
  const hasWarnings = warnings.length > 0;
  const isGettingStarted = isStarterBlank;
  const isExecuteTab = tab === "execute";
  const completedRuns = Number.isFinite(model.stats?.runs) ? model.stats.runs : 0;
  const actionHint = isGettingStarted
    ? "Choose a build path below to start defining your model."
    : hasBlockers
    ? "Resolve the listed issues first."
    : isExecuteTab
      ? "Use the controls below to run this scenario or review recent runs."
    : latestResults
      ? "Review the latest run or run another scenario."
      : completedRuns > 0
        ? "Pick a saved run or start a fresh execution."
        : "Run this model to generate results.";

  const MODEL_HEALTH_TAB_LABELS = {
    overview: "Overview", visual: "Design", ai: "AI Designer",
    entities: "Entity Types", queues: "Queues", bevents: "B-Events",
    cevents: "C-Events", state: "Model Data", execute: "Run",
    results: "Results", history: "Run History", validate: "Model Health",
  };

  return (
    <section
      aria-label="Model health"
      style={{
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 12, marginBottom: 14, display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0, flex: "1 1 280px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.4, fontWeight: 700, marginBottom: 4 }}>MODEL HEALTH</div>
          <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>
            {hasBlockers
              ? "This model needs a few fixes before it can run."
              : isGettingStarted
                ? "Start with a template, the visual designer, AI designer, or forms to build the first runnable version."
              : hasWarnings
                ? "This model can run, but a few things are worth checking before you rely on the results."
                : "No major issues were found."}
          </div>
        </div>
      </div>
      {(hasBlockers || hasWarnings) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {hasBlockers && (
            <button type="button" onClick={() => setTab("validate")}
              style={{ background: alpha(C.red, 0.1), border: `1px solid ${alpha(C.red, 0.35)}`, borderRadius: 6, color: C.red, cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 700, padding: "6px 10px", whiteSpace: "nowrap" }}>
              {blockers.length} error{blockers.length !== 1 ? "s" : ""}
            </button>
          )}
          {hasWarnings && (
            <button type="button" onClick={() => setTab("validate")}
              style={{ background: alpha(C.amber, 0.1), border: `1px solid ${alpha(C.amber, 0.35)}`, borderRadius: 6, color: C.amber, cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 700, padding: "6px 10px", whiteSpace: "nowrap" }}>
              {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
            </button>
          )}
          <button type="button" onClick={() => setTab("validate")}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 10, padding: "6px 2px", textDecoration: "underline" }}>
            Model Health →
          </button>
        </div>
      )}
      <div style={{
        borderTop: `1px solid ${C.border}`, paddingTop: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, flex: "1 1 100%", flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
          {actionHint}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!isGettingStarted && !hasBlockers && !isExecuteTab && <Btn small variant="primary" onClick={() => setTab("execute")}>Open Run</Btn>}
          {!isGettingStarted && !hasBlockers && latestResults && <Btn small variant="ghost" onClick={() => setTab("results")}>Open Results</Btn>}
          {!isGettingStarted && !hasBlockers && completedRuns > 0 && <Btn small variant="ghost" onClick={() => onGoToHistory ? onGoToHistory() : setTab("results")}>Run History</Btn>}
        </div>
      </div>
    </section>
  );
}
