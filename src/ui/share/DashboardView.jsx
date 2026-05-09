import { useEffect, useState } from "react";
import { getShareLink } from "../../db/models.js";
import { C, FONT, GOOGLE_FONT_URL } from "../shared/tokens.js";

const CHART_W = 360, CHART_H = 80;
const HIST_W = 360, HIST_H = 60, HIST_BINS = 12;

const fmt = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : "—";

function MiniLineChart({ title, points, color, yLabel }) {
  if (!points || points.length < 2) return null;
  const maxY = Math.max(...points.map(p => p.value), 1);
  const maxT = points[points.length - 1].t || 1;
  const toX = t  => (t  / maxT)  * CHART_W;
  const toY = v  => CHART_H - 4 - (v / maxY) * (CHART_H - 8);
  const linePts = points.map(p => `${toX(p.t).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ");
  const fillPts = [
    ...points.map(p => `${toX(p.t).toFixed(1)},${toY(p.value).toFixed(1)}`),
    `${CHART_W},${CHART_H}`, `0,${CHART_H}`,
  ].join(" ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color, fontFamily: FONT, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>{yLabel} · max {maxY.toFixed(0)}</span>
      </div>
      <svg width={CHART_W} height={CHART_H} style={{ display: "block", width: "100%" }}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
        <polygon points={fillPts} fill={color} fillOpacity={0.1} />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function WaitHistogram({ dist, color }) {
  if (!dist || dist.n < 2 || !dist.values || dist.values.length < 2) return null;
  const vals = dist.values;
  const minV = vals[0];
  const maxV = vals[vals.length - 1];
  if (maxV === minV) return null;
  const binWidth = (maxV - minV) / HIST_BINS;
  const counts = Array(HIST_BINS).fill(0);
  for (const v of vals) {
    const i = Math.min(Math.floor((v - minV) / binWidth), HIST_BINS - 1);
    counts[i]++;
  }
  const maxCount = Math.max(...counts, 1);
  const barW = HIST_W / HIST_BINS;
  const toX = (v) => ((v - minV) / (maxV - minV)) * HIST_W;
  const MARKERS = [
    { label: "p50", value: dist.p50, color: C.green },
    { label: "p90", value: dist.p90, color: C.amber },
    { label: "p99", value: dist.p99, color: C.red },
  ];
  return (
    <svg width={HIST_W} height={HIST_H} aria-label="Wait time histogram"
      viewBox={`0 0 ${HIST_W} ${HIST_H}`} style={{ display: "block", width: "100%", overflow: "visible" }}>
      {counts.map((cnt, i) => {
        const barH = (cnt / maxCount) * (HIST_H - 8);
        return <rect key={i} x={i * barW + 1} y={HIST_H - barH - 2}
          width={Math.max(barW - 2, 1)} height={barH} fill={color} fillOpacity={0.45} rx={1} />;
      })}
      {MARKERS.map(m => {
        const x = toX(m.value);
        if (x < 0 || x > HIST_W) return null;
        return (
          <g key={m.label}>
            <line x1={x} y1={0} x2={x} y2={HIST_H - 2} stroke={m.color} strokeWidth={1.5} strokeDasharray="3,2" />
            <text x={x + 2} y={10} fontSize={7} fill={m.color} fontFamily="monospace">{m.label}</text>
          </g>
        );
      })}
      <text x={2} y={HIST_H} fontSize={7} fill={C.muted} fontFamily="monospace">{minV.toFixed(1)}</text>
      <text x={HIST_W - 28} y={HIST_H} fontSize={7} fill={C.muted} fontFamily="monospace">{maxV.toFixed(1)}</text>
    </svg>
  );
}

function KpiCard({ label, value, color, sub }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px", minWidth: 140, flex: 1 }}>
      <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 300, color: color || C.text, fontFamily: FONT, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function DashboardView({ token, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError("No share token provided."); setLoading(false); return; }
    setLoading(true);
    setError(null);
    getShareLink(token)
      .then(result => { setData(result); setLoading(false); })
      .catch(err => { setError(err.message || "Failed to load shared results."); setLoading(false); });
  }, [token]);

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: FONT, fontSize: 13 }}>
        <style>{`@import url('${GOOGLE_FONT_URL}');`}</style>
        Loading shared results...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.text, fontFamily: FONT, fontSize: 13, padding: 24 }}>
        <style>{`@import url('${GOOGLE_FONT_URL}');`}</style>
        <div style={{ fontSize: 42, marginBottom: 12, opacity: 0.3, userSelect: "none" }}>🔗</div>
        <div style={{ color: C.red, fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Dashboard unavailable</div>
        <div style={{ color: C.muted, textAlign: "center", maxWidth: 400, lineHeight: 1.6 }}>{error}</div>
      </div>
    );
  }

  const { share, run, model } = data;
  const resultsJson = run.resultsJson || {};
  const summary = resultsJson.summary || {};
  const ts = resultsJson.timeSeries || null;
  const wd = resultsJson.waitDist || {};
  const pinned = share.config?.pinnedWidgets || [];

  const hasWidget = (key) => pinned.length === 0 || pinned.includes(key);
  const util = summary.avgSvc && summary.avgWait
    ? (summary.avgSvc / (summary.avgSvc + summary.avgWait) * 100)
    : null;

  const serverTypes = (model.entityTypes || []).filter(et => et.role === "server");
  const queueDefs = model.queues || [];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: FONT }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
        @import url('${GOOGLE_FONT_URL}');
      `}</style>

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", gap: 16, height: 52 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.accent, letterSpacing: 2 }}>DES STUDIO</div>
        <div style={{ fontSize: 11, color: C.muted, borderLeft: `1px solid ${C.border}`, paddingLeft: 16 }}>Shared Results Dashboard</div>
        <div style={{ flex: 1 }} />
        {onBack && (
          <button type="button" onClick={onBack}
            style={{ background: "#ffffff08", border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontFamily: FONT, fontSize: 11, padding: "5px 12px", cursor: "pointer", fontWeight: 600 }}>
            ← Back
          </button>
        )}
      </div>

      {/* Model info */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>{model.name}</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            Ran {new Date(run.ranAt).toLocaleString()} · {run.replications} replication{run.replications > 1 ? "s" : ""} · Seed {run.seed}
          </div>
        </div>

        {/* KPI Cards */}
        {hasWidget("summary") && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <KpiCard label="ARRIVED" value={summary.total || run.totalArrived || 0} color="#38bdf8" />
            <KpiCard label="SERVED" value={summary.served || run.totalServed || 0} color="#10b981" />
            <KpiCard label="RENEGED" value={summary.reneged || run.totalReneged || 0} color="#ef4444" />
            <KpiCard label="MEAN WAIT" value={fmt(summary.avgWait ?? run.avgWaitTime)} color="#f59e0b" sub="time units" />
            <KpiCard label="MEAN SERVICE" value={fmt(summary.avgSvc ?? run.avgServiceTime)} color="#8b5cf6" sub="time units" />
            {util !== null && <KpiCard label="UTILISATION" value={`${util.toFixed(1)}%`} color="#06b6d4" />}
          </div>
        )}

        {/* Queue table */}
        {hasWidget("queues") && queueDefs.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>QUEUES</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Queue", "Depth", "Mean wait", "Arrivals", "Reneged"].map(h => (
                    <th key={h} style={{ padding: "4px 8px", textAlign: h === "Queue" ? "left" : "right", fontWeight: 600, color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 0.8 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queueDefs.map(q => {
                  const qWait = wd[q.name] || wd[q.customerType];
                  return (
                    <tr key={q.id} style={{ borderBottom: `1px solid ${C.border}18` }}>
                      <td style={{ padding: "4px 8px", color: C.text, fontFamily: FONT, fontSize: 11, textAlign: "left" }}>{q.name}</td>
                      <td style={{ padding: "4px 8px", color: C.text, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{qWait?.n ? Math.round(qWait.n / (run.replications || 1)) : "—"}</td>
                      <td style={{ padding: "4px 8px", color: "#f59e0b", fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{fmt(qWait?.mean)}</td>
                      <td style={{ padding: "4px 8px", color: C.text, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{qWait?.n || "—"}</td>
                      <td style={{ padding: "4px 8px", color: "#ef4444", fontFamily: FONT, fontSize: 11, textAlign: "right" }}>—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Resource table */}
        {hasWidget("resources") && serverTypes.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>SERVERS</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Type", "Count", "Utilisation", "Mean svc time"].map(h => (
                    <th key={h} style={{ padding: "4px 8px", textAlign: h === "Type" ? "left" : "right", fontWeight: 600, color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {serverTypes.map(st => (
                  <tr key={st.id} style={{ borderBottom: `1px solid ${C.border}18` }}>
                    <td style={{ padding: "4px 8px", color: C.text, fontFamily: FONT, fontSize: 11, textAlign: "left" }}>{st.name}</td>
                    <td style={{ padding: "4px 8px", color: C.text, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{st.count || 1}</td>
                    <td style={{ padding: "4px 8px", color: "#06b6d4", fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{util !== null ? `${util.toFixed(1)}%` : "—"}</td>
                    <td style={{ padding: "4px 8px", color: "#8b5cf6", fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{fmt(summary.avgSvc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Time-series charts */}
        {hasWidget("charts") && ts && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>QUEUE DEPTH OVER TIME</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {queueDefs.map((q, idx) => {
                const points = ts.map(entry => ({
                  t: entry.t,
                  value: entry.byType?.[q.customerType || q.name]?.waiting ?? 0,
                }));
                const colors = ["#06b6d4", "#f59e0b", "#8b5cf6", "#3fb950", "#f87171", "#a78bfa"];
                return <MiniLineChart key={q.id} title={q.name} points={points} color={colors[idx % colors.length]} yLabel="waiting" />;
              })}
            </div>
          </div>
        )}

        {/* Wait distribution histogram */}
        {hasWidget("charts") && wd && Object.keys(wd).length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>WAIT TIME DISTRIBUTION</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {Object.entries(wd).map(([queueName, dist], idx) => {
                const colors = ["#f59e0b", "#8b5cf6", "#06b6d4", "#3fb950", "#f87171"];
                return (
                  <div key={queueName}>
                    <div style={{ fontSize: 11, color: C.text, fontFamily: FONT, fontWeight: 600, marginBottom: 4 }}>{queueName}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 6 }}>
                      <span>n={dist.n} · mean={fmt(dist.mean)}</span>
                      <span style={{ textAlign: "right" }}>p50={fmt(dist.p50)} · p90={fmt(dist.p90)} · p99={fmt(dist.p99)}</span>
                    </div>
                    <WaitHistogram dist={dist} color={colors[idx % colors.length]} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", fontSize: 10, color: C.muted, fontFamily: FONT, padding: "12px 0" }}>
          Generated with DES Studio · {new Date(share.createdAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
