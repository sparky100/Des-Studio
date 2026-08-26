// ui/shared/AnovaTukeyTable.jsx — N-way (3+) scenario comparison.
//
// The first UI surface for oneWayANOVA/tukeyHSD (src/engine/statistics.js) —
// both already existed and were tested at the engine layer (F-9), but no
// screen ever called them; every existing comparison flow
// (ScenarioComparisonTable) is a 2-group paired-t view. Styled to match
// ScenarioComparisonTable's table conventions.
import { fmtMetric, METRIC_LABELS } from "../execute/executeHelpers.js";
import { useTheme } from "./ThemeContext.jsx";

export function AnovaTukeyTable({ metric, anova, tukey }) {
  const metricLabel = METRIC_LABELS[metric] || metric || "value";
  const { C } = useTheme();
  if (!anova) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        background: anova.significant ? `${C.green}18` : C.surface,
        border: `1px solid ${anova.significant ? C.green : C.border}`,
        borderRadius: 6, padding: "8px 12px", fontSize: 12, color: C.text,
      }}>
        {anova.fStatistic != null ? (
          <>
            <b style={{ color: anova.significant ? C.green : C.text }}>
              {anova.significant ? "Significant difference detected" : "No significant difference detected"}
            </b>
            {" — "}F({anova.dfBetween}, {anova.dfWithin}) = {anova.fStatistic.toFixed(3)}, p = {anova.pValue?.toFixed(4)}
          </>
        ) : (
          <span style={{ color: C.muted }}>{anova.explanation}</span>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
          <thead>
            <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
              <th scope="col" style={{ padding: "6px 8px" }}>Scenario</th>
              <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>n</th>
              <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>Mean {metricLabel}</th>
              <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>Std dev</th>
            </tr>
          </thead>
          <tbody>
            {(anova.groupStats || []).map((g, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "6px 8px", color: C.accent }}>{g.label}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{g.n}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{metric ? fmtMetric(metric, g.mean) : g.mean.toFixed(2)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted }}>{g.stdDev.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tukey && (tukey.comparisons || []).length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
            PAIRWISE COMPARISONS (TUKEY HSD)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <th scope="col" style={{ padding: "6px 8px" }}>Pair</th>
                  <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>Mean diff</th>
                  <th scope="col" style={{ padding: "6px 8px" }}>Significant?</th>
                </tr>
              </thead>
              <tbody>
                {tukey.comparisons.map((c, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px 8px" }}>{c.groupA} vs {c.groupB}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: c.significant ? (c.meanA > c.meanB ? C.green : C.red) : C.muted }}>
                      {(c.meanA - c.meanB > 0 ? "+" : "") + (metric ? fmtMetric(metric, c.meanA - c.meanB) : (c.meanA - c.meanB).toFixed(2))}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {c.significant
                        ? <span style={{ color: C.green, fontWeight: 700 }}>Yes</span>
                        : <span style={{ color: C.muted }}>No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
