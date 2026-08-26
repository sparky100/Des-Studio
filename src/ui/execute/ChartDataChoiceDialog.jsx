// ui/execute/ChartDataChoiceDialog.jsx — Lets the user choose how to proceed
// when a run is estimated large enough that chart/time-series collection is
// risky, instead of silently turning charts off behind a single OK button.
import { SPACE, RADIUS, alpha } from "../shared/tokens.js";
import { useTheme } from "../shared/ThemeContext.jsx";
import { ModalShell } from "../shared/ModalShell.jsx";

/**
 * @param {{
 *   isOpen: boolean,
 *   messages: Array<{ code: string, message: string }>,
 *   onCancel: () => void,
 *   onProceedWithoutCharts: () => void,
 *   onProceedWithCharts: () => void,
 * }} props
 */
export function ChartDataChoiceDialog({ isOpen, messages, onCancel, onProceedWithoutCharts, onProceedWithCharts }) {
  const { C, FONT } = useTheme();

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
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      title="Large run — chart data collection"
      width="min(480px, 100%)"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            style={{ ...buttonBase, background: "transparent", border: `1px solid ${C.border}`, color: C.muted }}
          >
            Cancel run
          </button>
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
      }
    >
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

      <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
        Collecting charts may slow this run down or use significant browser memory. Numeric summaries
        (waits, utilisation, cost) are unaffected either way — this only affects the time-series charts.
      </div>
    </ModalShell>
  );
}
