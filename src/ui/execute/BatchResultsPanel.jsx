// Moved verbatim out of execute/index.jsx (max-lines ratchet, expert review C-11).
import { Btn, Tag } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { detectOutliers, relativePrecision, sampleSizeGuidance } from "../../engine/statistics.js";
import { CI_METRICS, COUNT_METRICS, METRIC_LABELS, fmt, fmtMetric } from "./executeHelpers.js";

/** Replication batch panel: progress, aggregate results with goal ticks,
 * per-replication detail with outlier flags, CI table and saved runs. */
export function BatchResultsPanel({ batchStatus, batchProgress, replications, replicationResults, aggregateStats, model, replicationDetailOpen, setReplicationDetailOpen, runHistoryStatus, runHistoryError, recentSavedRuns, canOpenResultsView, onGoToResults }) {
  const { C, FONT } = useTheme();
  return (
    <>
    {(batchStatus !== "idle" || replicationResults.length > 0) && (
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>REPLICATION BATCH</div>
          <Tag label={batchStatus} color={batchStatus === "complete" ? C.green : batchStatus === "error" || batchStatus === "cancelled" ? C.red : C.amber} />
          <div role="status" style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
            {batchStatus === "complete"
              ? `${replicationResults.length} replications complete`
              : `Running ${batchProgress?.completed || replicationResults.length}/${batchProgress?.total || replications}`}
          </div>
          {batchStatus !== "complete" && (
            <div aria-live="off" style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>
              Pool: {batchProgress?.workerCount || "—"} · Running: {batchProgress?.running || 0} · Pending: {batchProgress?.pending || 0}
            </div>
          )}
        </div>

        {batchStatus === "complete" && Object.values(aggregateStats).some(stat => stat.n >= 2) && (
          <div style={{
            background: `${C.green}0d`,
            border: `1px solid ${C.green}44`,
            borderRadius: 6,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}>
            <div style={{ fontSize: 10, color: C.green, fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>
              AGGREGATE RESULTS — {replicationResults.length} REPLICATIONS
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
            }}>
              {(() => {
                const goals = model.goals || [];
                const GOAL_KEY = {
                  avgWait: "summary.avgWait", avgSvc: "summary.avgSvc", avgSojourn: "summary.avgSojourn",
                  avgTimeInSystem: "summary.avgTimeInSystem",
                  avgWIP: "summary.avgWIP", maxWIP: "summary.maxWIP",
                  served: "summary.served", servedRatio: "summary.servedRatio", reneged: "summary.reneged",
                  total: "summary.total", totalCost: "summary.totalCost", costPerServed: "summary.costPerServed",
                };
                const MATCH_KEYS = {
                  "summary.avgWait": "summary.avgWait", "summary.avgSvc": "summary.avgSvc",
                  "summary.avgSojourn": "summary.avgSojourn", "summary.avgTimeInSystem": "summary.avgTimeInSystem",
                  "summary.avgWIP": "summary.avgWIP",
                  "summary.maxWIP": "summary.maxWIP", "summary.served": "summary.served",
                  "summary.servedRatio": "summary.servedRatio", "summary.reneged": "summary.reneged",
                  "summary.total": "summary.total",
                  "summary.totalCost": "summary.totalCost",
                  "summary.costPerServed": "summary.costPerServed",
                };
                return CI_METRICS.map(metric => {
                  const stat = aggregateStats[metric];
                  if (!stat || stat.n < 2) return null;
                  const matchingGoals = goals.filter(g => {
                    if (!g.metric || !g.target || g.scope) return false;
                    const mapped = GOAL_KEY[g.metric] || MATCH_KEYS[g.metric];
                    return mapped === metric && !(typeof g.operator === "string" && g.operator.startsWith("p"));
                  });
                  let goalMet = null;
                  if (matchingGoals.length > 0) {
                    goalMet = matchingGoals.every(g => {
                      const t = parseFloat(g.target);
                      if (!Number.isFinite(t)) return true;
                      return g.operator === ">=" ? stat.mean >= t : g.operator === ">" ? stat.mean > t : g.operator === "<=" ? stat.mean <= t : stat.mean < t;
                    });
                  }
                  return (
                    <div key={metric} style={{
                      background: C.surface,
                      border: `1px solid ${goalMet === true ? C.green : goalMet === false ? C.red : C.border}`,
                      borderRadius: 5,
                      padding: "10px 12px",
                    }}>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 4 }}>
                        {METRIC_LABELS[metric]}
                        {goalMet === true && <span style={{ marginLeft: 5, color: C.green }}>✓</span>}
                        {goalMet === false && <span style={{ marginLeft: 5, color: C.red }}>✗</span>}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontFamily: FONT }}>
                        {fmtMetric(metric, stat.mean)}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginTop: 2 }}>
                        ±{fmt(stat.halfWidth, 1)} (95% CI)
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {replicationResults.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={() => setReplicationDetailOpen(v => !v)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: C.muted, fontFamily: FONT, fontSize: 12,
                display: "flex", alignItems: "center", gap: 6, padding: 0,
              }}
            >
              <span style={{
                display: "inline-block", transition: "transform 160ms ease",
                transform: replicationDetailOpen ? "rotate(90deg)" : "rotate(0deg)",
                fontSize: 10,
              }}>▶</span>
              Replication detail ({replicationResults.length})
            </button>
            {replicationDetailOpen && (() => {
              const repCount = replicationResults.length;
              const waitVals = replicationResults.map(p => p.result?.summary?.avgWait).filter(Number.isFinite);
              const svcVals = replicationResults.map(p => p.result?.summary?.avgSvc).filter(Number.isFinite);
              const servedVals = replicationResults.map(p => p.result?.summary?.served).filter(Number.isFinite);
              const outlierWait = detectOutliers(waitVals);
              const outlierSvc = detectOutliers(svcVals);
              const outlierServed = detectOutliers(servedVals);
              const minMaxRow = repCount >= 2 ? {
                minWait: waitVals.length ? Math.min(...waitVals) : null,
                maxWait: waitVals.length ? Math.max(...waitVals) : null,
                minSvc: svcVals.length ? Math.min(...svcVals) : null,
                maxSvc: svcVals.length ? Math.max(...svcVals) : null,
                minServed: servedVals.length ? Math.min(...servedVals) : null,
                maxServed: servedVals.length ? Math.max(...servedVals) : null,
              } : null;
              let waitFiniteIdx = 0, svcFiniteIdx = 0, servedFiniteIdx = 0;
              return (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left", tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                        <th scope="col" style={{ padding: 8 }}>Rep #</th>
                        <th scope="col" style={{ padding: 8 }}>Seed</th>
                        <th scope="col" style={{ padding: 8 }}>Served</th>
                        <th scope="col" style={{ padding: 8 }}>Reneged</th>
                        <th scope="col" style={{ padding: 8 }}>Avg wait</th>
                        <th scope="col" style={{ padding: 8 }}>Avg service</th>
                        <th scope="col" style={{ padding: 8 }}>Avg sojourn</th>
                        <th scope="col" style={{ padding: 8 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {replicationResults.map(payload => {
                        const summary = payload.result?.summary;
                        const rowWait = summary?.avgWait;
                        const rowSvc = summary?.avgSvc;
                        const rowServed = summary?.served;
                        const wi = Number.isFinite(rowWait) ? waitFiniteIdx++ : -1;
                        const si = Number.isFinite(rowSvc) ? svcFiniteIdx++ : -1;
                        const sei = Number.isFinite(rowServed) ? servedFiniteIdx++ : -1;
                        const isWaitOutlier = wi >= 0 && outlierWait.outlierIndices.includes(wi);
                        const isSvcOutlier = si >= 0 && outlierSvc.outlierIndices.includes(si);
                        const isServedOutlier = sei >= 0 && outlierServed.outlierIndices.includes(sei);
                        const isOutlier = isWaitOutlier || isSvcOutlier || isServedOutlier;
                        const outlierMsg = [
                          isWaitOutlier && `Avg wait outside fence [${fmt(outlierWait.lowerFence, 1)}, ${fmt(outlierWait.upperFence, 1)}]`,
                          isSvcOutlier && `Avg service outside fence [${fmt(outlierSvc.lowerFence, 1)}, ${fmt(outlierSvc.upperFence, 1)}]`,
                          isServedOutlier && `Served outside fence [${fmt(outlierServed.lowerFence)}, ${fmt(outlierServed.upperFence)}]`,
                        ].filter(Boolean).join("; ");
                        return (
                          <tr key={payload.replicationIndex} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: 8 }}>{payload.replicationIndex + 1}</td>
                            <td style={{ padding: 8, color: C.amber }}>{payload.seed}</td>
                            <td style={{ padding: 8 }}>{summary?.served ?? "—"}</td>
                            <td style={{ padding: 8 }}>{summary?.reneged ?? "—"}</td>
                            <td style={{ padding: 8 }}>{fmt(rowWait, 1)}</td>
                            <td style={{ padding: 8 }}>{fmt(rowSvc, 1)}</td>
                            <td style={{ padding: 8 }}>{fmt(summary?.avgSojourn, 1)}</td>
                            <td style={{ padding: 8 }}>
                              <Tag label="complete" color={C.green} />
                              {isOutlier && (
                                <span title={outlierMsg} style={{ marginLeft: 6, color: C.amber, cursor: "help" }}>⚠</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!replicationResults.length && (
                        <tr>
                          <td colSpan={8} style={{ padding: 8, color: C.muted }}>Waiting for first replication result...</td>
                        </tr>
                      )}
                      {minMaxRow && (
                        <tr style={{ borderTop: `2px solid ${C.border}`, color: C.muted, fontStyle: "italic" }}>
                          <td style={{ padding: 8 }} colSpan={2}>Min / Max</td>
                          <td style={{ padding: 8 }}>{minMaxRow.minServed ?? "—"} / {minMaxRow.maxServed ?? "—"}</td>
                          <td style={{ padding: 8 }}>—</td>
                          <td style={{ padding: 8 }}>{minMaxRow.minWait != null ? fmt(minMaxRow.minWait, 1) : "—"} / {minMaxRow.maxWait != null ? fmt(minMaxRow.maxWait, 1) : "—"}</td>
                          <td style={{ padding: 8 }}>{minMaxRow.minSvc != null ? fmt(minMaxRow.minSvc, 1) : "—"} / {minMaxRow.maxSvc != null ? fmt(minMaxRow.maxSvc, 1) : "—"}</td>
                          <td style={{ padding: 8 }}>—</td>
                          <td style={{ padding: 8 }}>—</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {Object.values(aggregateStats).some(stat => stat.n >= 2) && (() => {
          const ciRows = CI_METRICS.map(metric => {
            const stat = aggregateStats[metric];
            if (!stat || stat.n < 2) return null;
            const relPrec = relativePrecision(stat);
            const precColor = relPrec == null ? C.muted : relPrec < 5 ? C.green : relPrec < 15 ? C.amber : C.red;
            const guidance = sampleSizeGuidance(stat);
            return { metric, stat, relPrec, precColor, guidance };
          }).filter(Boolean);
          const guidanceRows = ciRows.filter(r => r.guidance != null);
          return (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left", tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                      <th scope="col" style={{ padding: 8 }}>Metric</th>
                      <th scope="col" style={{ padding: 8 }}>Mean</th>
                      <th scope="col" style={{ padding: 8 }}>Lower 95%</th>
                      <th scope="col" style={{ padding: 8 }}>Upper 95%</th>
                      <th scope="col" style={{ padding: 8 }}>Half-width</th>
                      <th scope="col" style={{ padding: 8 }}>Rel. precision %</th>
                      <th scope="col" style={{ padding: 8 }}>n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ciRows.map(({ metric, stat, relPrec, precColor }) => (
                      <tr key={metric} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: 8 }}>{METRIC_LABELS[metric]}</td>
                        <td style={{ padding: 8, color: C.accent }}>{fmtMetric(metric, stat.mean)}</td>
                        <td style={{ padding: 8 }}>{COUNT_METRICS.has(metric) ? fmt(stat.lower, 0) : fmt(stat.lower, 1)}</td>
                        <td style={{ padding: 8 }}>{COUNT_METRICS.has(metric) ? fmt(stat.upper, 0) : fmt(stat.upper, 1)}</td>
                        <td style={{ padding: 8, color: C.amber }}>{fmt(stat.halfWidth, 1)}</td>
                        <td style={{ padding: 8 }}>
                          {relPrec != null ? (
                            <span style={{ color: precColor, fontWeight: 700 }}>{relPrec.toFixed(1)}%</span>
                          ) : "—"}
                        </td>
                        <td style={{ padding: 8 }}>{stat.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {guidanceRows.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                  {guidanceRows.map(({ metric, guidance }) => (
                    <span key={metric} style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                      ~{guidance} more replication{guidance > 1 ? "s" : ""} needed to reach 5% precision on {METRIC_LABELS[metric]}
                    </span>
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {batchStatus === "complete" && (
          <div style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
                  SAVED RUNS
                </div>
                <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, marginTop: 2 }}>
                  {runHistoryStatus === "loading"
                    ? "Refreshing saved run history..."
                    : recentSavedRuns.length
                      ? "Latest saved runs for this model"
                      : "The batch finished, but no saved runs are visible yet."}
                </div>
              </div>
              {canOpenResultsView && (
                <Btn small variant="ghost" onClick={() => onGoToResults?.()}>
                  View Results →
                </Btn>
              )}
            </div>

            {runHistoryStatus === "error" && (
              <div style={{ fontSize: 11, color: C.red, fontFamily: FONT }}>
                Could not refresh run history: {runHistoryError}
              </div>
            )}

            {recentSavedRuns.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentSavedRuns.map(run => (
                  <div
                    key={run.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: `1px solid ${C.border}`,
                      background: C.cardBg,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, fontWeight: 600 }}>
                        {run.label}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                        {run.timestamp ? new Date(run.timestamp).toLocaleString() : "Saved just now"}
                      </div>
                    </div>
                    <Tag
                      label={`${run.replications} run${run.replications === 1 ? "" : "s"}`}
                      color={C.accent}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )}
    </>
  );
}
