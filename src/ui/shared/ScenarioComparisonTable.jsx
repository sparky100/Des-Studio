// Renders the scenario comparison KPI table shared by ModelHistoryTab and ExecutePanel sweep views.
import { METRIC_LABELS, fmtMetric, COUNT_METRICS } from "../execute/executeHelpers.js";
import { useTheme } from "./ThemeContext.jsx";

const fmtDiff = (metric, v) => {
  if (metric === "summary.servedRatio") return `${Math.round(v * 100)}%`;
  if (COUNT_METRICS.has(metric)) return String(Math.round(v));
  return v.toFixed(1);
};

export function ScenarioComparisonTable({ comparison }) {
  const { C } = useTheme();
  if (!comparison) return null;
  const labelA = comparison.labels?.a;
  const labelB = comparison.labels?.b;
  const anyTruncated = (comparison.comparisons || []).some(c => c.truncated);
  return (
    <div>
      {(labelA || labelB) && (
        <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
          {labelA && <span><b style={{ color: C.text }}>Cell A:</b> {labelA}</span>}
          {labelB && <span><b style={{ color: C.text }}>Cell B:</b> {labelB}</span>}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
          <thead>
            <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
              <th scope="col" style={{ padding: "6px 8px" }}>KPI</th>
              <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>Cell A</th>
              <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>Cell B</th>
              <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>Diff</th>
              <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>95% CI</th>
              <th scope="col" style={{ padding: "6px 8px" }}>Sig?</th>
            </tr>
          </thead>
          <tbody>
            {(comparison.comparisons || []).map((c, i) => {
              const meanA = comparison.meansA?.[c.metric];
              const meanB = comparison.meansB?.[c.metric];
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "6px 8px", color: C.accent }}>
                    {METRIC_LABELS[c.metric] || c.metric}
                    {c.truncated && (
                      <span title={`Cell A and Cell B had different replication counts — ${c.droppedCount} unpaired run(s) were dropped from this comparison.`}
                        style={{ marginLeft: 4, color: C.amber, fontWeight: 700, fontSize: 11, cursor: "help" }}>*</span>
                    )}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanA != null ? fmtMetric(c.metric, meanA) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanB != null ? fmtMetric(c.metric, meanB) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: c.significant95 ? (c.meanDiff > 0 ? C.green : C.red) : C.muted }}>
                    {c.meanDiff != null ? (c.meanDiff > 0 ? "+" : "") + fmtDiff(c.metric, c.meanDiff) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted, fontSize: 11 }}>
                    {c.lower != null && c.upper != null ? `[${fmtDiff(c.metric, c.lower)}, ${fmtDiff(c.metric, c.upper)}]` : "—"}
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
      {anyTruncated && (
        <div style={{ fontSize: 11, color: C.amber, marginTop: 6 }}>
          * Cell A and Cell B had different replication counts for this metric — unpaired runs were dropped to compute the paired comparison.
        </div>
      )}
    </div>
  );
}
