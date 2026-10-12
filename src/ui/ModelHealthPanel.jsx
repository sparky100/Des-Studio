// ui/ModelHealthPanel.jsx — Model health summary: status badge, issue chips, action hints
import { alpha } from "./shared/tokens.js";
import { useTheme } from "./shared/ThemeContext.jsx";

export function ModelHealthPanel({ validation, isStarterBlank, setTab }) {
  const { C, FONT } = useTheme();
  const blockers = validation.errors || [];
  const warnings = validation.warnings || [];
  const hasBlockers = blockers.length > 0;
  const hasWarnings = warnings.length > 0;
  const isGettingStarted = isStarterBlank;

  const healthMsg = hasBlockers
    ? "This model needs a few fixes before it can run."
    : isGettingStarted
      ? "Start with a template, the visual designer, AI designer, or forms to build the first runnable version."
      : hasWarnings
        ? "This model can run, but a few things are worth checking before you rely on the results."
        : "No major issues found — ready to run.";

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
    </section>
  );
}
