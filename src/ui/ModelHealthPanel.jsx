// ui/ModelHealthPanel.jsx — Model health summary: status badge, issue chips, action hints
import { C, FONT, alpha } from "./shared/tokens.js";
import { Btn } from "./shared/components.jsx";

export function ModelHealthPanel({ model, validation, isStarterBlank, tab, setTab, latestResults }) {
  const blockers = validation.errors || [];
  const warnings = validation.warnings || [];
  const issues = [...blockers, ...warnings].slice(0, 5);
  const hasBlockers = blockers.length > 0;
  const hasWarnings = warnings.length > 0;
  const isGettingStarted = isStarterBlank;
  const isExecuteTab = tab === "execute";
  const statusColor = isGettingStarted ? C.accent : hasBlockers ? C.red : hasWarnings ? C.amber : C.green;
  const statusBg = isGettingStarted ? alpha(C.accent, 0.08) : hasBlockers ? C.errorBg : hasWarnings ? C.warmup : alpha(C.green, 0.08);
  const statusBorder = isGettingStarted ? C.accent : hasBlockers ? C.danger : hasWarnings ? C.amber : C.green;
  const statusTitle = isGettingStarted
    ? "Getting started"
    : hasBlockers
    ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}`
    : hasWarnings
      ? `Ready with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
      : "Ready to run";
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
    cevents: "C-Events", state: "Model Data", execute: "Execute",
    results: "Analysis", history: "History", validate: "Model Health",
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
        <div style={{
          background: statusBg, border: `1px solid ${statusBorder}66`, borderRadius: 6,
          padding: "6px 9px", color: statusColor, fontFamily: FONT, fontSize: 11,
          fontWeight: 700, whiteSpace: "nowrap",
        }}>
          {statusTitle}
        </div>
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.4, fontWeight: 700, marginBottom: 4 }}>MODEL HEALTH</div>
          <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>
            {hasBlockers
              ? "Fix blocking validation issues before running this model."
              : isGettingStarted
                ? "Start with a template, the visual designer, AI designer, or forms to build the first runnable version."
              : hasWarnings
                ? "The model can run, but review the warnings before trusting outputs."
                : "No blocking validation issues found."}
          </div>
        </div>
      </div>
      {issues.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 320px", minWidth: 0 }}>
          {issues.map((issue, index) => {
            const targetTab = issue.tab || "overview";
            const tabLabel = MODEL_HEALTH_TAB_LABELS[targetTab] || "Overview";
            const isError = blockers.includes(issue);
            return (
              <button
                key={`${issue.code}-${index}-${targetTab}`}
                type="button"
                onClick={() => setTab(targetTab)}
                title={issue.message}
                style={{
                  background: isError ? C.errorBg : C.warmup,
                  border: `1px solid ${isError ? C.danger : C.amber}66`,
                  borderRadius: 6, color: isError ? C.error : C.warnBg,
                  cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 700,
                  padding: "7px 9px", maxWidth: "100%", flex: "1 1 240px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                [{issue.code}] {tabLabel}: {issue.message}
              </button>
            );
          })}
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
          {!isGettingStarted && !hasBlockers && !isExecuteTab && <Btn small variant="primary" onClick={() => setTab("execute")}>Open Execute</Btn>}
          {!isGettingStarted && !hasBlockers && latestResults && <Btn small variant="ghost" onClick={() => setTab("results")}>Open Analysis</Btn>}
          {!isGettingStarted && !hasBlockers && completedRuns > 0 && <Btn small variant="ghost" onClick={() => setTab("history")}>Run History</Btn>}
        </div>
      </div>
    </section>
  );
}
