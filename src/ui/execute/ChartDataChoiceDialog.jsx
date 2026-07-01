// ui/execute/ChartDataChoiceDialog.jsx — Lets the user choose how to proceed
// when a run is estimated large enough that chart/time-series collection is
// risky, instead of silently turning charts off behind a single OK button.
import { useEffect, useRef } from "react";
import { SPACE, RADIUS, TYPO, Z, alpha } from "../shared/tokens.js";
import { useTheme } from "../shared/ThemeContext.jsx";

/**
 * @param {{
 *   isOpen: boolean,
 *   messages: Array<{ code: string, message: string }>,
 *   onCancel: () => void,
 *   onProceedWithoutCharts: () => void,
 *   onProceedWithCharts: () => void,
 *   offersChartToggle: boolean,
 * }} props
 */
export function ChartDataChoiceDialog({ isOpen, messages, onCancel, onProceedWithoutCharts, onProceedWithCharts, offersChartToggle = true }) {
  const { C, FONT } = useTheme();
  const dialogRef = useRef(null);
  const headingId = "chart-data-choice-heading";

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    const raf = requestAnimationFrame(() => {
      dialogRef.current?.querySelector("button")?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const buttonBase = {
    border: "none",
    borderRadius: RADIUS.md,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: 700,
    padding: "8px 16px",
    cursor: "pointer",
  };

  return (
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: C.overlay,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: Z.modal, padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: RADIUS.lg,
          width: "min(480px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: SPACE.md,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          padding: SPACE.lg,
        }}
      >
        <div id={headingId} style={{ fontFamily: FONT, ...TYPO.heading, color: C.text }}>
          {offersChartToggle ? "Large run — chart data collection" : "Before you run"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
          {(messages || []).map((item, i) => (
            <div key={item.code || i} style={{
              background: alpha(C.amber, 0.1),
              border: `1px solid ${alpha(C.amber, 0.3)}`,
              borderRadius: RADIUS.md,
              padding: SPACE.sm,
              color: C.text,
              fontFamily: FONT,
              fontSize: 12,
              lineHeight: 1.5,
            }}>
              {item.message}
            </div>
          ))}
        </div>

        {offersChartToggle && (
          <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Collecting charts may slow this run down or use significant browser memory. Numeric summaries
            (waits, utilisation, cost) are unaffected either way — this only affects the time-series charts.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: SPACE.sm, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ ...buttonBase, background: "transparent", border: `1px solid ${C.border}`, color: C.muted }}
          >
            Cancel run
          </button>
          {offersChartToggle ? (
            <>
              <button
                type="button"
                onClick={onProceedWithoutCharts}
                style={{ ...buttonBase, background: alpha(C.accent, 0.15), color: C.accent }}
              >
                Run without chart data
              </button>
              <button
                type="button"
                onClick={onProceedWithCharts}
                style={{ ...buttonBase, background: C.amber, color: C.bg }}
              >
                Run with chart data anyway
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onProceedWithoutCharts}
              style={{ ...buttonBase, background: alpha(C.accent, 0.15), color: C.accent }}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
