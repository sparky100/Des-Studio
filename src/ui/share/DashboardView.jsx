import { useEffect, useState } from "react";
import { getShareLink } from "../../db/models.js";
import { C, FONT, GOOGLE_FONT_URL } from "../shared/tokens.js";

const CHART_W = 360, CHART_H = 80;
const HIST_W = 360, HIST_H = 60, HIST_BINS = 12;

const fmt = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d) : "—";
const fmtInt = (v) => Number.isFinite(v) ? v.toFixed(0) : "—";

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

const NODE_COLORS = { source: C.green, queue: C.cEvent, activity: C.purple, sink: C.red };
const NODE_LABELS = { source: "Source", queue: "Queue", activity: "Activity", sink: "Sink" };
const NODE_W = 130, NODE_H = 36;

function ModelTopology({ model }) {
  const graph = model.graph || {};
  const storedNodes = graph.nodes || [];
  const storedEdges = graph.edges || [];
  const types = model.entityTypes || [];
  const queues = model.queues || [];

  // If we have stored graph layout, use it
  if (storedNodes.length > 0) {
    const xs = storedNodes.map(n => n.position?.x ?? 0);
    const ys = storedNodes.map(n => n.position?.y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 50;
    const totalW = maxX - minX + NODE_W + pad * 2;
    const totalH = maxY - minY + NODE_H + pad * 2;

    return (
      <svg width={totalW} height={totalH} style={{ display: "block", width: "100%", maxWidth: "100%" }}
        viewBox={`0 0 ${totalW} ${totalH}`} aria-label="Model topology">
        <style>{`.tn{font-family:monospace;font-size:9px;font-weight:700;}.tl{font-family:monospace;font-size:8px;fill:${C.muted};}.te{stroke:${C.border};stroke-width:1.5;fill:none;marker-end:url(#arrow);}`}</style>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 Z" fill={C.border} />
          </marker>
        </defs>
        {storedEdges.map(edge => {
          const from = storedNodes.find(n => n.id === edge.from);
          const to = storedNodes.find(n => n.id === edge.to);
          if (!from || !to) return null;
          const x1 = (from.position?.x ?? 0) - minX + pad + NODE_W / 2;
          const y1 = (from.position?.y ?? 0) - minY + pad + NODE_H / 2;
          const x2 = (to.position?.x ?? 0) - minX + pad + NODE_W / 2;
          const y2 = (to.position?.y ?? 0) - minY + pad + NODE_H / 2;
          return <line key={edge.id} x1={x1} y1={y1} x2={x2} y2={y2} className="te" />;
        })}
        {storedNodes.map(node => {
          const x = (node.position?.x ?? 0) - minX + pad;
          const y = (node.position?.y ?? 0) - minY + pad;
          const col = NODE_COLORS[node.type] || C.muted;
          return (
            <g key={node.id}>
              <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={6}
                fill={col + "22"} stroke={col} strokeWidth={1.5} />
              <text x={x + NODE_W / 2} y={y + NODE_H / 2 + 3} textAnchor="middle" className="tn" fill={col}>{node.label || node.type}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  // Fallback: derive a simple layout from model data
  const customers = types.filter(t => t.role !== "server");
  const servers = types.filter(t => t.role === "server");
  const gapX = 160, gapY = 40;
  const w = 120, h = 36;
  const cX = 50, cY = 50;
  const qX = cX + gapX, qY = 50;
  const sX = qX + gapX, sY = cY + Math.max(customers.length, 1) * gapY;
  const totalW = sX + w + 40;
  const totalH = Math.max(qY + Math.max(queues.length, 1) * gapY + h, sY + Math.max(servers.length, 1) * gapY + h) + 40;

  return (
    <svg width={totalW} height={totalH} style={{ display: "block", width: "100%", maxWidth: 600 }}
      viewBox={`0 0 ${totalW} ${totalH}`} aria-label="Model topology">
      <style>{`.tn{font-family:monospace;font-size:9px;font-weight:700;}.tl{font-family:monospace;font-size:8px;fill:${C.muted};}.te{stroke:${C.border};stroke-width:1;fill:none;}`}</style>
      {customers.length > 0 && (
        <>
          <text x={cX + w / 2} y={42} textAnchor="middle" className="tl">Entity Types</text>
          {customers.map((t, i) => (
            <g key={t.id || t.name}>
              <rect x={cX} y={cY + i * gapY} width={w} height={h} rx={6} fill={C.green + "22"} stroke={C.green} strokeWidth={1.5} />
              <text x={cX + w / 2} y={cY + i * gapY + h / 2 + 3} textAnchor="middle" className="tn" fill={C.green}>{t.name}</text>
            </g>
          ))}
        </>
      )}
      {queues.length > 0 && (
        <>
          <text x={qX + w / 2} y={42} textAnchor="middle" className="tl">Queues</text>
          {queues.map((q, i) => {
            const match = customers.find(c => c.name === q.customerType);
            const srcIdx = match ? customers.indexOf(match) : 0;
            return (
              <g key={q.id || q.name}>
                <line x1={cX + w} y1={cY + srcIdx * gapY + h / 2} x2={qX} y2={qY + i * gapY + h / 2} className="te" />
                <rect x={qX} y={qY + i * gapY} width={w} height={h} rx={6} fill={C.cEvent + "22"} stroke={C.cEvent} strokeWidth={1.5} />
                <text x={qX + w / 2} y={qY + i * gapY + h / 2 + 3} textAnchor="middle" className="tn" fill={C.cEvent}>{q.name}</text>
              </g>
            );
          })}
        </>
      )}
      {servers.length > 0 && (
        <>
          <text x={sX + w / 2} y={42} textAnchor="middle" className="tl">Servers</text>
          {servers.map((s, i) => {
            const fromQ = i < queues.length ? queues[i] : null;
            const fromY = fromQ ? qY + queues.indexOf(fromQ) * gapY + h / 2 : (sY - gapY);
            return (
              <g key={s.id || s.name}>
                <line x1={qX + w} y1={fromY} x2={sX} y2={sY + i * gapY + h / 2} className="te" />
                <rect x={sX} y={sY + i * gapY} width={w} height={h} rx={6} fill={C.server + "22"} stroke={C.server} strokeWidth={1.5} />
                <text x={sX + w / 2} y={sY + i * gapY + h / 2 + 3} textAnchor="middle" className="tn" fill={C.server}>{s.name} ({s.count || 1})</text>
              </g>
            );
          })}
        </>
      )}
    </svg>
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
  const serverTypes = (model.entityTypes || []).filter(et => et.role === "server");
  const queueDefs = model.queues || [];
  const aiInsights = run.aiInsights && run.aiInsights.summary ? run.aiInsights : null;
  const totalServed = summary.served || run.totalServed || 0;
  const totalServedPerQ = queueDefs.length ? Math.round(totalServed / Math.max(queueDefs.length, 1)) : totalServed;
  const throughput = run.maxSimulationTime ? (totalServed / run.maxSimulationTime).toFixed(2) : null;
  const renegeRate = (summary.reneged && totalServed) ? ((summary.reneged / (summary.reneged + totalServed)) * 100).toFixed(1) : null;

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

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Model info */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>{model.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Ran {new Date(run.ranAt).toLocaleString()} · {run.replications} replication{run.replications > 1 ? "s" : ""} · Seed {run.seed}
              {run.maxSimulationTime ? ` · ${run.maxSimulationTime} time units` : ""}
            </div>
          </div>
          {throughput && <KpiCard label="THROUGHPUT" value={`${throughput}/tu`} color={C.accent} />}
        </div>

        {/* Model Topology */}
        {hasWidget("summary") && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>MODEL STRUCTURE</div>
            <ModelTopology model={model} />
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: C.green, fontFamily: FONT }}>● {(model.entityTypes || []).filter(e => e.role !== "server").length} entity types</span>
              <span style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT }}>● {queueDefs.length} queues</span>
              <span style={{ fontSize: 10, color: C.server, fontFamily: FONT }}>● {serverTypes.length} server types</span>
            </div>
          </div>
        )}

        {/* KPI Cards — overall simulation results */}
        {hasWidget("summary") && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <KpiCard label="ARRIVED" value={fmtInt(summary.total || run.totalArrived || 0)} color={C.kpiArr} sub="total entities" />
            <KpiCard label="SERVED" value={fmtInt(totalServed)} color={C.kpiSvc} sub={`${queueDefs.length} queue${queueDefs.length !== 1 ? "s" : ""}`} />
            <KpiCard label="RENEGED" value={fmtInt(summary.reneged || run.totalReneged || 0)} color={C.danger} sub={renegeRate ? `${renegeRate}% of arrivals` : undefined} />
            <KpiCard label="MEAN WAIT" value={fmt(summary.avgWait ?? run.avgWaitTime)} color={C.bEvent} sub="time units" />
            <KpiCard label="MEAN SERVICE" value={fmt(summary.avgSvc ?? run.avgServiceTime)} color={C.purple} sub="time units per entity" />
            <KpiCard label="JOURNEY TIME" value={fmt(summary.avgSojourn)} color={C.amber} sub="wait + service" />
          </div>
        )}

        {/* AI Insights — saved analysis from the modeller */}
        {hasWidget("summary") && aiInsights && (
          <div style={{ background: C.panel, border: `1px solid ${C.purple}44`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.purple, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>AI INSIGHTS</div>
            <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiInsights.summary}</div>
            {aiInsights.recommendation && (
              <div style={{ marginTop: 8, fontSize: 11, color: C.accent, fontFamily: FONT, fontWeight: 700 }}>
                Recommendation: {aiInsights.recommendation}
              </div>
            )}
            {aiInsights.savedAt && (
              <div style={{ marginTop: 6, fontSize: 9, color: C.muted, fontFamily: FONT }}>
                Saved {new Date(aiInsights.savedAt).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Queue performance — overall cumulative stats */}
        {hasWidget("queues") && queueDefs.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>QUEUE PERFORMANCE</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Queue", "Served", "Mean wait", "p50", "p90", "p99"].map(h => (
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
                      <td style={{ padding: "4px 8px", color: C.text, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{fmtInt(qWait?.n)}</td>
                      <td style={{ padding: "4px 8px", color: C.bEvent, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{fmt(qWait?.mean)}</td>
                      <td style={{ padding: "4px 8px", color: C.green, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{fmt(qWait?.p50)}</td>
                      <td style={{ padding: "4px 8px", color: C.amber, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{fmt(qWait?.p90)}</td>
                      <td style={{ padding: "4px 8px", color: C.danger, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{fmt(qWait?.p99)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Server performance */}
        {hasWidget("resources") && serverTypes.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>SERVER PERFORMANCE</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Type", "Count", "Mean svc time", "Completions"].map(h => (
                    <th key={h} style={{ padding: "4px 8px", textAlign: h === "Type" ? "left" : "right", fontWeight: 600, color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {serverTypes.map(st => {
                  const perRes = summary.perResource?.[st.name] || {};
                  const completions = perRes.completions ?? (summary.served ? Math.round(summary.served / serverTypes.length) : null);
                  const svcTime = perRes.avgServiceTime ?? summary.avgSvc;
                  return (
                    <tr key={st.id} style={{ borderBottom: `1px solid ${C.border}18` }}>
                      <td style={{ padding: "4px 8px", color: C.text, fontFamily: FONT, fontSize: 11, textAlign: "left" }}>{st.name}</td>
                      <td style={{ padding: "4px 8px", color: C.text, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{st.count || 1}</td>
                      <td style={{ padding: "4px 8px", color: C.purple, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{fmt(svcTime)}</td>
                      <td style={{ padding: "4px 8px", color: C.accent, fontFamily: FONT, fontSize: 11, textAlign: "right" }}>{fmtInt(completions)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Time-series charts */}
        {hasWidget("charts") && ts && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>QUEUE DEPTH OVER TIME</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {queueDefs.map((q, idx) => {
                const points = ts.map(entry => ({
                  t: entry.t,
                  value: entry.byType?.[q.customerType || q.name]?.waiting ?? 0,
                }));
                const colors = [C.accent, C.bEvent, C.purple, C.green, C.danger, C.server];
                return <MiniLineChart key={q.id} title={q.name} points={points} color={colors[idx % colors.length]} yLabel="waiting" />;
              })}
            </div>
          </div>
        )}

        {/* Wait distribution */}
        {hasWidget("charts") && wd && Object.keys(wd).length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>WAIT TIME DISTRIBUTION</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {Object.entries(wd).map(([queueName, dist], idx) => {
                const colors = [C.bEvent, C.purple, C.accent, C.green, C.danger];
                return (
                  <div key={queueName}>
                    <div style={{ fontSize: 11, color: C.text, fontFamily: FONT, fontWeight: 600, marginBottom: 4 }}>{queueName}</div>
                    <div style={{ display: "flex", gap: 12, fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 6, flexWrap: "wrap" }}>
                      <span>n={dist.n} · mean={fmt(dist.mean)}</span>
                      <span>median={fmt(dist.p50)} · p90={fmt(dist.p90)} · p99={fmt(dist.p99)}</span>
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
