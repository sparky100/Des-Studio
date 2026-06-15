// ui/ModelHealthPanel.jsx — Model health summary: status badge, issue chips, action hints
import { alpha } from "./shared/tokens.js";
import { Btn } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

export function ModelHealthPanel({ model, validation, isStarterBlank, tab, setTab, latestResults, onGoToHistory }) {
  const { C, FONT } = useTheme();
  const blockers = validation.errors || [];
  const warnings = validation.warnings || [];
  const hasBlockers = blockers.length > 0;
  const hasWarnings = warnings.length > 0;
  const isGettingStarted = isStarterBlank;
  const isExecuteTab = tab === "execute";
  const completedRuns = Number.isFinite(model.stats?.runs) ? model.stats.runs : 0;

  const healthMsg = hasBlockers
    ? "This model needs a few fixes before it can run."
    : isGettingStarted
      ? "Start with a template, the visual designer, AI designer, or forms to build the first runnable version."
      : hasWarnings
        ? "This model can run, but a few things are worth checking before you rely on the results."
        : "No major issues found — ready to run.";

  const showActions = !isGettingStarted && !hasBlockers && !isExecuteTab
    && (true || latestResults || completedRuns > 0);

  return (
    <section
      aria-label="Model health"
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Health status row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.4, fontWeight: 700, whiteSpace: "nowrap" }}>
          MODEL HEALTH
        </div>
        <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.5, flex: "1 1 180px" }}>
          {healthMsg}
        </div>
        {hasBlockers && (
          <button type="button" onClick={() => setTab("validate")}
            style={{ background: alpha(C.red, 0.1), border: `1px solid ${alpha(C.red, 0.35)}`, borderRadius: 6, color: C.red, cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 700, padding: "4px 9px", whiteSpace: "nowrap" }}>
            {blockers.length} error{blockers.length !== 1 ? "s" : ""}
          </button>
        )}
        {hasWarnings && (
          <button type="button" onClick={() => setTab("validate")}
            style={{ background: alpha(C.amber, 0.1), border: `1px solid ${alpha(C.amber, 0.35)}`, borderRadius: 6, color: C.amber, cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 700, padding: "4px 9px", whiteSpace: "nowrap" }}>
            {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
          </button>
        )}
        {(hasBlockers || hasWarnings) && (
          <button type="button" onClick={() => setTab("validate")}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 10, padding: "4px 2px", textDecoration: "underline", whiteSpace: "nowrap" }}>
            Model Health →
          </button>
        )}
      </div>

      {/* Quick-action row — only shown when there's something to navigate to */}
      {showActions && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Btn small variant="primary" onClick={() => setTab("execute")}>Open Run</Btn>
          {latestResults && <Btn small variant="ghost" onClick={() => setTab("results")}>Open Results</Btn>}
          {completedRuns > 0 && <Btn small variant="ghost" onClick={() => onGoToHistory ? onGoToHistory() : setTab("results")}>Run History</Btn>}
        </div>
      )}
    </section>
  );
}
