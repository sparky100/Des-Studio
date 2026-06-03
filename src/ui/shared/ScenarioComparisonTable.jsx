// Renders the scenario comparison KPI table shared by ModelHistoryTab and ExecutePanel sweep views.
import { METRIC_LABELS, fmt } from "../execute/executeHelpers.js";
import { useTheme } from "./ThemeContext.jsx";

export function ScenarioComparisonTable({ comparison }) {
  const { C } = useTheme();
  if (!comparison) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
        <thead>
          <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
            <th scope="col" style={{ padding: "6px 8px" }}>KPI</th>
            <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>{comparison.labels?.a}</th>
            <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>{comparison.labels?.b}</th>
            <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>Difference</th>
            <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>95% CI</th>
            <th scope="col" style={{ padding: "6px 8px" }}>Significant?</th>
          </tr>
        </thead>
        <tbody>
          {(comparison.comparisons || []).map((c, i) => {
            const meanA = comparison.meansA?.[c.metric];
            const meanB = comparison.meansB?.[c.metric];
            return (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "6px 8px", color: C.accent }}>{METRIC_LABELS[c.metric] || c.metric}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanA != null ? fmt(meanA) : "—"}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanB != null ? fmt(meanB) : "—"}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: c.significant95 ? (c.meanDiff > 0 ? C.green : C.red) : C.muted }}>
                  {c.meanDiff != null ? (c.meanDiff > 0 ? "+" : "") + fmt(c.meanDiff) : "—"}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted, fontSize: 11 }}>
                  {c.lower != null && c.upper != null ? `[${fmt(c.lower)}, ${fmt(c.upper)}]` : "—"}
                </td>
                <td style={{ padding: "6px 8px" }}>
                  {c.significant95 ? (
                    <span style={{ color: c.significant99 ? C.green : C.amber, fontWeight: 700 }}>
                      {c.significant99 ? "Yes (99%)" : "Yes (95%)"}
                    </span>
                  ) : <span style={{ color: C.muted }}>No</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
