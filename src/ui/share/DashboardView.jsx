import { useEffect, useState } from "react";
import { getShareLink } from "../../db/models.js";
import { GOOGLE_FONT_URL } from "../shared/tokens.js";
import { generateReport } from '../../reports/index.js';
import { useTheme } from "../shared/ThemeContext.jsx";

const CHART_W = 360, CHART_H = 80;
const HIST_W = 360, HIST_H = 60, HIST_BINS = 12;

const fmt = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d) : "—";

// Minimal markdown → JSX renderer (handles headings, bold, italic, bullets, paragraphs)
function renderMarkdown(text) {
  if (!text) return null;
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((para, pi) => {
    const lines = para.split("\n");
    // Bullet list block
    if (lines.every(l => /^[-*]\s/.test(l.trim()) || l.trim() === "")) {
      return (
        <ul key={pi} style={{ paddingLeft: 18, margin: "0 0 8px 0" }}>
          {lines.filter(l => /^[-*]\s/.test(l.trim())).map((l, li) => (
            <li key={li} style={{ marginBottom: 2 }}>{inlineMarkdown(l.replace(/^[-*]\s/, ""))}</li>
          ))}
        </ul>
      );
    }
    // Single-line heading
    if (lines.length === 1 && /^#{1,3}\s/.test(lines[0])) {
      const level = lines[0].match(/^(#{1,3})\s/)[1].length;
      const content = lines[0].replace(/^#{1,3}\s/, "");
      const sizes = { 1: 15, 2: 13, 3: 12 };
      return <div key={pi} style={{ fontWeight: 700, fontSize: sizes[level] || 12, marginBottom: 6, marginTop: pi > 0 ? 8 : 0 }}>{inlineMarkdown(content)}</div>;
    }
    // Normal paragraph
    return (
      <p key={pi} style={{ margin: "0 0 8px 0", lineHeight: 1.7 }}>
        {lines.map((line, li) => (<span key={li}>{inlineMarkdown(line)}{li < lines.length - 1 ? " " : ""}</span>))}
      </p>
    );
  });
}

function inlineMarkdown(text) {
  // Split on **bold**, *italic*, keeping delimiters
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part))     return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}
const fmtInt = (v) => Number.isFinite(v) ? v.toFixed(0) : "—";

function MiniLineChart({ title, points, color, yLabel }) {
  const { C, FONT } = useTheme();
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
  const { C, FONT } = useTheme();
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
  const { C, FONT } = useTheme();
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px", minWidth: 140, flex: 1 }}>
      <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 300, color: color || C.text, fontFamily: FONT, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}


export default function DashboardView({ token, onBack }) {
  const { C, FONT } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportGenerating, setReportGenerating] = useState(false);

  useEffect(() => {
    if (!token) { setError("No share token provided."); setLoading(false); return; }
    setLoading(true);
    setError(null);
    getShareLink(token)
      .then(result => { setData(result); setLoading(false); })
      .catch(err => { setError(err.message || "Failed to load shared results."); setLoading(false); });
  }, [token]);

  const handleExportReport = async () => {
    if (!data || reportGenerating) return;
    setReportGenerating(true);
    try {
      const { share, run, model } = data;
      const resultsJson = run.resultsJson || {};
      const meta = {
        runId: run.id || 'unknown',
        runLabel: share.title || model.name || 'Shared Run',
        engineVersion: '1.0',
        seed: run.seed ?? 'unknown',
        prnAlgorithm: 'mulberry32',
        runTimestamp: run.ranAt || new Date().toISOString(),
        narrativeText: run.aiInsights?.summary ?? null,
        modelDescriptionText: model.description ?? null,
      };
      const html = await generateReport(model, resultsJson, {
        maxSimTime: run.maxSimulationTime,
        warmupPeriod: run.warmupPeriod || 0,
        replications: run.replications || 1,
      }, meta, null);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(model.name || 'Model').replace(/[/\\:*?"<>|]/g, '-')} — Report.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently ignore — report generation is optional
    } finally {
      setReportGenerating(false);
    }
  };

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
        <div style={{ fontWeight: 700, fontSize: 14, color: C.accent, letterSpacing: 2 }}>simmodlr</div>
        <div style={{ fontSize: 11, color: C.muted, borderLeft: `1px solid ${C.border}`, paddingLeft: 16 }}>Shared Results Dashboard</div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={handleExportReport} disabled={reportGenerating}
          style={{ background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontFamily: FONT, fontSize: 11, padding: "5px 12px", cursor: reportGenerating ? "wait" : "pointer", fontWeight: 600 }}>
          {reportGenerating ? 'Generating...' : '📄 Export Report'}
        </button>
        {onBack && (
          <button type="button" onClick={onBack}
            style={{ background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontFamily: FONT, fontSize: 11, padding: "5px 12px", cursor: "pointer", fontWeight: 600 }}>
            ← Back
          </button>
        )}
      </div>

      {/* Provenance Strip */}
      <div style={{ background: C.warnBg, borderBottom: `1px solid ${C.border}`, padding: "8px 24px", fontSize: 10, fontFamily: FONT, color: C.amber }}>
        Run ID: {run.id} · Seed: {run.seed} · PRNG: mulberry32 · {new Date(run.ranAt).toLocaleString()}
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Model info */}
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>{model.name}</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            Ran {new Date(run.ranAt).toLocaleString()} · {run.replications} replication{run.replications > 1 ? "s" : ""} · Seed {run.seed}
            {run.maxSimulationTime ? ` · ${run.maxSimulationTime} time units` : ""}
          </div>
        </div>

        {/* Model Structure — text summary, no SVG */}
        {hasWidget("summary") && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 12 }}>MODEL STRUCTURE</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              {/* Entity types (arrivals) */}
              <div>
                <div style={{ fontSize: 9, color: C.green, fontFamily: FONT, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>Arrivals</div>
                {(model.entityTypes || []).filter(e => e.role !== "server").length === 0
                  ? <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>—</span>
                  : (model.entityTypes || []).filter(e => e.role !== "server").map(e => (
                    <div key={e.id || e.name} style={{ display: "inline-block", background: C.green + "18", border: `1px solid ${C.green}44`, borderRadius: 4, padding: "3px 8px", fontSize: 11, color: C.green, fontFamily: FONT, marginRight: 4, marginBottom: 4 }}>
                      {e.name}
                    </div>
                  ))
                }
              </div>
              {/* Queues */}
              <div>
                <div style={{ fontSize: 9, color: C.cEvent, fontFamily: FONT, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>Queues</div>
                {queueDefs.length === 0
                  ? <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>—</span>
                  : queueDefs.map(q => (
                    <div key={q.id || q.name} style={{ display: "inline-block", background: C.cEvent + "18", border: `1px solid ${C.cEvent}44`, borderRadius: 4, padding: "3px 8px", fontSize: 11, color: C.cEvent, fontFamily: FONT, marginRight: 4, marginBottom: 4 }}>
                      {q.name}
                    </div>
                  ))
                }
              </div>
              {/* Servers */}
              {serverTypes.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: C.server, fontFamily: FONT, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>Servers</div>
                  {serverTypes.map(s => (
                    <div key={s.id || s.name} style={{ display: "inline-block", background: C.server + "18", border: `1px solid ${C.server}44`, borderRadius: 4, padding: "3px 8px", fontSize: 11, color: C.server, fontFamily: FONT, marginRight: 4, marginBottom: 4 }}>
                      {s.name}{s.count && s.count > 1 ? ` ×${s.count}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Narrative — pre-stored, no LLM call */}
        {hasWidget("summary") && run.narrativeText && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>WHAT THIS ANALYSIS SHOWS</div>
            <div style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>{renderMarkdown(run.narrativeText)}</div>
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
            <div style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>{renderMarkdown(aiInsights.summary)}</div>
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
                    <th key={h} scope="col" style={{ padding: "4px 8px", textAlign: h === "Queue" ? "left" : "right", fontWeight: 600, color: C.muted, fontFamily: FONT, fontSize: 11, letterSpacing: 0.8 }}>
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
                    <th key={h} scope="col" style={{ padding: "4px 8px", textAlign: h === "Type" ? "left" : "right", fontWeight: 600, color: C.muted, fontFamily: FONT, fontSize: 11, letterSpacing: 0.8 }}>{h}</th>
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
          Generated with simmodlr · {new Date(share.createdAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
