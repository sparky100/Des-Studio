// ui/execute/BottomPanel.jsx — collapsible tabbed detail area below the Execute canvas
// Tabs: Step Log | Entities | Stage KPIs | Charts | Analysis (Sprint 17)
// F9C.8 + F9C.9 + F9C.11 node-filtered log
import { useState, useMemo } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Tag, PhaseTag, Btn } from "../shared/components.jsx";
import { batchMeansCI, computePercentiles, computeSummaryStats } from "../../engine/statistics.js";

const fmt = (v, d = 0) => Number.isFinite(v) ? v.toFixed(d) : "—";

const TABS = [
  { id: "log",       label: "Step Log" },
  { id: "entities",  label: "Entities" },
  { id: "stagekpis", label: "Stage KPIs" },
  { id: "charts",    label: "Charts" },
  { id: "analysis",  label: "Analysis" },
];

// ── Stage KPIs ────────────────────────────────────────────────────────────────

function EventCountsTable({ snap, model }) {
  const counts = snap?.eventCounts ?? {};
  const bEvents = (model.bEvents || []).filter(b => parseFloat(b.scheduledTime) < 900 || Object.prototype.hasOwnProperty.call(counts, b.id));
  const cEvents = model.cEvents || [];
  if (bEvents.length === 0 && cEvents.length === 0) return null;

  const thStyle = { padding: "4px 8px", textAlign: "left", fontWeight: 600, color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 0.8 };
  const tdStyle = (color) => ({ padding: "4px 8px", fontFamily: FONT, fontSize: 11, color: color || C.text });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {bEvents.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.bEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            B-EVENTS (BOUND) — TIMES FIRED
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={thStyle}>Event</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Count</th>
            </tr></thead>
            <tbody>
              {bEvents.map(b => (
                <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={tdStyle(C.bEvent)}>{b.name || b.id}</td>
                  <td style={{ ...tdStyle(counts[b.id] ? C.text : C.muted), textAlign: "right", fontWeight: counts[b.id] ? 700 : 400 }}>
                    {counts[b.id] || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cEvents.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            C-EVENTS (CONDITIONAL) — TIMES FIRED
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={thStyle}>Event</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Count</th>
            </tr></thead>
            <tbody>
              {cEvents.map(c => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={tdStyle(C.cEvent)}>{c.name || c.id}</td>
                  <td style={{ ...tdStyle(counts[c.id] ? C.text : C.muted), textAlign: "right", fontWeight: counts[c.id] ? 700 : 400 }}>
                    {counts[c.id] || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StageKpisTable({ snap, model }) {
  if (!snap) {
    return (
      <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, padding: 8 }}>
        Run the simulation to see stage KPIs.
      </div>
    );
  }

  const entities    = snap.entities || [];
  const queues      = model.queues || [];
  const serverTypes = (model.entityTypes || []).filter(et => et.role === "server");

  const th = (label, right = false) => (
    <th style={{ padding: "4px 8px", textAlign: right ? "right" : "left", fontWeight: 600,
      color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 0.8 }}>
      {label}
    </th>
  );
  const td = (val, color, right = false) => (
    <td style={{ padding: "4px 8px", textAlign: right ? "right" : "left",
      color: color || C.text, fontFamily: FONT, fontSize: 11 }}>
      {val}
    </td>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Queue rows */}
      {queues.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            QUEUES
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {th("Queue")} {th("Depth", true)} {th("Mean wait", true)}
                {th("Max wait", true)} {th("Arrivals", true)} {th("Reneged", true)}
              </tr>
            </thead>
            <tbody>
              {queues.map(q => {
                const inQueue  = entities.filter(e => e.role !== "server" && e.queue === q.name);
                const waiting  = inQueue.filter(e => e.status === "waiting");
                const waits    = inQueue
                  .filter(e => e.serviceStart != null)
                  .map(e => e.serviceStart - e.arrivalTime)
                  .filter(Number.isFinite);
                const meanWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
                const maxWait  = waits.length ? Math.max(...waits) : null;
                return (
                  <tr key={q.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {td(q.name, C.cEvent)}
                    {td(waiting.length, waiting.length > 0 ? C.amber : C.text, true)}
                    {td(fmt(meanWait), null, true)}
                    {td(fmt(maxWait),  null, true)}
                    {td(inQueue.length, null, true)}
                    {td(snap.reneged || 0, C.reneged, true)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Server rows */}
      {serverTypes.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.purple, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            SERVERS
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {th("Server type")} {th("Capacity", true)} {th("Busy", true)}
                {th("Utilisation", true)} {th("Mean svc", true)} {th("Completions", true)}
              </tr>
            </thead>
            <tbody>
              {serverTypes.map(et => {
                const capacity = parseInt(et.count || "1", 10) || 1;
                const servers  = entities.filter(e => e.role === "server" && e.type === et.name);
                const busy     = servers.filter(e => e.status === "busy").length;
                const util     = ((busy / capacity) * 100).toFixed(0);
                const done     = entities.filter(e => e.role !== "server" &&
                  e.completionTime != null && e.serviceStart != null);
                const svcTimes = done.map(e => e.completionTime - e.serviceStart).filter(Number.isFinite);
                const meanSvc  = svcTimes.length
                  ? svcTimes.reduce((a, b) => a + b, 0) / svcTimes.length : null;
                return (
                  <tr key={et.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {td(et.name, C.purple)}
                    {td(capacity, null, true)}
                    {td(busy, busy > 0 ? C.amber : C.text, true)}
                    {td(`${util}%`, null, true)}
                    {td(fmt(meanSvc), null, true)}
                    {td(snap.served || 0, C.served, true)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Log tab ───────────────────────────────────────────────────────────────────

function LogTab({ log, selectedNodeLabel, onClearFilter }) {
  const filtered = useMemo(
    () => selectedNodeLabel
      ? log.filter(e => e.message?.includes(selectedNodeLabel))
      : log,
    [log, selectedNodeLabel]
  );

  return (
    <div>
      {selectedNodeLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: C.accent, fontFamily: FONT }}>
            Filter: {selectedNodeLabel}
          </span>
          <button
            onClick={onClearFilter}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4,
              color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 10, padding: "2px 8px" }}
          >
            Show all
          </button>
        </div>
      )}
      {filtered.length === 0
        ? <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12 }}>
            {selectedNodeLabel ? "No events match this node." : "Log empty. Run simulation to see events."}
          </div>
        : [...filtered].reverse().map((r, i) => (
          <div key={i}>
            {r.phase === "WARMUP" && (
              <div style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}`,
                textAlign: "center", color: C.amber, fontSize: 11, fontWeight: 700,
                letterSpacing: 1.5, background: `${C.warmup}22` }}>
                ──── WARM-UP ENDED AT T={r.time?.toFixed(0)} ────
              </div>
            )}
            <div style={{ fontSize: 11, fontFamily: "monospace", color: C.kpiSvc,
              borderBottom: `1px solid ${C.bg}`, padding: "3px 0" }}>
              <span style={{ color: C.muted }}>[t={r.time?.toFixed(0)}]</span>{" "}
              <PhaseTag phase={r.phase} /> {r.message}
            </div>
          </div>
        ))
      }
    </div>
  );
}

// ── Entities tab ──────────────────────────────────────────────────────────────

function EntitiesTab({ snap }) {
  if (!snap) {
    return <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12 }}>No snapshot yet.</div>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 11 }}>
      <thead>
        <tr style={{ color: C.muted, borderBottom: `2px solid ${C.border}` }}>
          <th style={{ padding: "4px 8px", textAlign: "left" }}>Entity</th>
          <th style={{ padding: "4px 8px", textAlign: "left" }}>Type</th>
          <th style={{ padding: "4px 8px", textAlign: "left" }}>Status</th>
          <th style={{ padding: "4px 8px", textAlign: "left" }}>Queue</th>
        </tr>
      </thead>
      <tbody>
        {snap.entities.map(e => (
          <tr key={e.id} style={{ borderBottom: `1px solid ${C.bg}` }}>
            <td style={{ padding: "4px 8px", color: C.kpiArr }}>#{e.id}</td>
            <td style={{ padding: "4px 8px", fontFamily: FONT }}>{e.type}</td>
            <td style={{ padding: "4px 8px" }}>
              <Tag label={e.status} color={e.status === "waiting" ? C.amber : C.green} />
            </td>
            <td style={{ padding: "4px 8px", color: C.muted, fontFamily: FONT }}>{e.queue || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── BottomPanel ───────────────────────────────────────────────────────────────

// ── Wait-time histogram (F10.6) ───────────────────────────────────────────────
// Renders a bar chart of wait-time distribution from pre-sorted d.values[].
// Percentile marker lines (p50 green, p90/p95 amber, p99 red) overlaid.

const HIST_W = 360;
const HIST_H = 90;
const HIST_BINS = 16;

function WaitHistogram({ dist, color }) {
  if (!dist || dist.n < 2) return null;
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
  const PAD = { top: 14, right: 6, bottom: 16, left: 36 };
  const w = HIST_W - PAD.left - PAD.right;
  const h = HIST_H - PAD.top - PAD.bottom;
  const toX = (v) => PAD.left + ((v - minV) / (maxV - minV)) * w;
  const barToX = (i) => PAD.left + (i / HIST_BINS) * w;

  const MARKERS = [
    { label: "p50", value: dist.p50, color: C.green  },
    { label: "p90", value: dist.p90, color: C.amber  },
    { label: "p99", value: dist.p99, color: C.red    },
  ];

  const yTicks = [0, Math.round(maxCount / 2) || 1, maxCount];

  return (
    <div>
      <svg width={HIST_W} height={HIST_H} aria-label="Wait time histogram"
        viewBox={`0 0 ${HIST_W} ${HIST_H}`} style={{ display: "block", width: "100%", overflow: "visible" }}>
        {/* Gridlines */}
        {yTicks.map(t => {
          const y = PAD.top + h - (t / maxCount) * h;
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + w} y2={y}
                stroke={C.border} strokeWidth={0.5} strokeDasharray="3,3" />
              <text x={PAD.left - 4} y={y + 3} textAnchor="end" fontSize={7}
                fill={C.muted} fontFamily="monospace">{t}</text>
            </g>
          );
        })}
        {/* Bars */}
        {counts.map((cnt, i) => {
          const barH = (cnt / maxCount) * h;
          return (
            <rect key={i}
              x={barToX(i) + 1} y={PAD.top + h - barH}
              width={Math.max(barW - 2, 1)} height={barH}
              fill={color} fillOpacity={0.4} rx={1}
            />
          );
        })}
        {/* Percentile marker lines */}
        {MARKERS.map(m => {
          const x = toX(m.value);
          if (x < PAD.left || x > PAD.left + w) return null;
          return (
            <g key={m.label}>
              <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + h}
                stroke={m.color} strokeWidth={1.5} strokeDasharray="3,2" />
              <text x={x + 2} y={PAD.top - 2} fontSize={7} fill={m.color} fontFamily="monospace">{m.label}</text>
            </g>
          );
        })}
        {/* X axis labels */}
        <text x={PAD.left} y={HIST_H - 2} fontSize={7} fill={C.muted} fontFamily="monospace">{Math.round(minV)}</text>
        <text x={PAD.left + w - 28} y={HIST_H - 2} fontSize={7} fill={C.muted} fontFamily="monospace">{Math.round(maxV)}</text>
      </svg>
      {/* Percentile stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6, marginTop: 8 }}>
        {[
          { label: "n",   value: dist.n,   color: C.muted, desc: "samples" },
          { label: "avg", value: dist.mean, color: C.accent, desc: "mean wait" },
          { label: "p50", value: dist.p50,  color: C.green, desc: "median" },
          { label: "p90", value: dist.p90,  color: C.amber, desc: "90th %ile" },
          { label: "p95", value: dist.p95,  color: C.amber, desc: "95th %ile" },
          { label: "p99", value: dist.p99,  color: C.red, desc: "99th %ile" },
        ].map(s => (
          <div key={s.label} style={{ background: C.bg, border: `1px solid ${s.color}44`, borderRadius: 5, padding: "6px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: s.color, fontFamily: FONT, letterSpacing: 1, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT }}>{typeof s.value === "number" ? Math.round(s.value) : s.value}</div>
            <div style={{ fontSize: 8, color: C.muted, fontFamily: FONT }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Charts tab (F10.5) ────────────────────────────────────────────────────────

const CHART_W = 400;
const CHART_H = 120;
const CHART_COLORS = [C.accent, C.bEvent, C.purple, C.green, C.red, C.server];

function MiniLineChart({ title, points, color, yLabel }) {
  if (!points || points.length < 2) return null;
  const maxY = Math.max(...points.map(p => p.value), 1);
  const maxT = points[points.length - 1].t || 1;
  const PAD = { top: 6, right: 6, bottom: 16, left: 36 };
  const w = CHART_W - PAD.left - PAD.right;
  const h = CHART_H - PAD.top - PAD.bottom;
  const toX = t  => PAD.left + (t  / maxT)  * w;
  const toY = v  => PAD.top + h - (v / maxY) * h;
  const linePts = points.map(p => `${toX(p.t).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ");
  const fillPts = [
    ...points.map(p => `${toX(p.t).toFixed(1)},${toY(p.value).toFixed(1)}`),
    `${toX(maxT)},${PAD.top + h}`, `${PAD.left},${PAD.top + h}`,
  ].join(" ");
  const yTicks = [0, Math.round(maxY / 2) || 1, maxY];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color, fontFamily: FONT, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>{yLabel} · max {Math.round(maxY)}</span>
      </div>
      <svg width={CHART_W} height={CHART_H} style={{ display: "block", width: "100%", minHeight: 100 }}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {/* Gridlines */}
        {yTicks.map(t => {
          const y = toY(t);
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + w} y2={y}
                stroke={C.border} strokeWidth={0.5} strokeDasharray="3,3" />
              <text x={PAD.left - 4} y={y + 3} textAnchor="end" fontSize={8}
                fill={C.muted} fontFamily="monospace">{Math.round(t)}</text>
            </g>
          );
        })}
        {/* Area fill */}
        <polygon points={fillPts} fill={color} fillOpacity={0.1} />
        {/* Line */}
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {/* X axis label */}
        <text x={PAD.left + w / 2} y={CHART_H - 2} textAnchor="middle" fontSize={8}
          fill={C.muted} fontFamily="monospace">simulation time</text>
      </svg>
    </div>
  );
}

function ChartsTab({ results, model }) {
  const ts = results?.timeSeries;
  const wd = results?.waitDist;

  if (!ts && !wd) {
    return (
      <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, padding: 8 }}>
        Enable <strong style={{ color: C.accent }}>Detailed output</strong> in the controls bar and run the simulation to see charts.
      </div>
    );
  }

  const queues      = model.queues || [];
  const serverTypes = (model.entityTypes || []).filter(et => et.role === "server");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Queue depth charts */}
      {ts && queues.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
            QUEUE DEPTH OVER TIME
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
            {queues.map((q, idx) => {
              const depthPoints = ts.map(entry => ({
                t: entry.t,
                value: Object.entries(entry.byType)
                  .filter(([k]) => (model.entityTypes || []).find(et => et.name === k && et.role !== "server"))
                  .reduce((s, [, bt]) => s + bt.waiting, 0),
              }));
              return (
                <MiniLineChart
                  key={q.id || q.name}
                  title={q.name}
                  points={depthPoints}
                  color={CHART_COLORS[idx % CHART_COLORS.length]}
                  yLabel="depth"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Server utilisation charts */}
      {ts && serverTypes.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.purple, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
            SERVER UTILISATION OVER TIME
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
            {serverTypes.map((et, idx) => {
              const capacity = parseInt(et.count || "1", 10) || 1;
              const points = ts.map(entry => ({
                t: entry.t,
                value: parseFloat(((entry.byType[et.name]?.busy || 0) / capacity).toFixed(3)),
              }));
              return (
                <MiniLineChart
                  key={et.id || et.name}
                  title={et.name}
                  points={points}
                  color={CHART_COLORS[(idx + 3) % CHART_COLORS.length]}
                  yLabel="utilisation"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Wait time distribution — histogram + percentile stats (F10.6) */}
      {wd && Object.keys(wd).length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.amber, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
            WAIT TIME DISTRIBUTION
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(wd).map(([q, d]) => (
              <div key={q}>
                <div style={{ fontSize: 11, color: C.cEvent, fontFamily: FONT, fontWeight: 700, marginBottom: 6 }}>{q}</div>
                <WaitHistogram dist={d} color={C.amber} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analysis tab (Sprint 17) ───────────────────────────────────────────────────

const ANALYSIS_METRICS = [
  { path: "summary.avgWait", label: "Avg wait" },
  { path: "summary.avgSvc", label: "Avg service" },
  { path: "summary.avgSojourn", label: "Avg sojourn" },
  { path: "summary.served", label: "Served" },
];

function AnalysisTab({ results, replicationResults, warmupDetection }) {
  const [batchMetric, setBatchMetric] = useState("summary.avgWait");
  const [batchResult, setBatchResult] = useState(null);

  // Extract values for a metric from replication results
  const extractValues = (path) => {
    if (!replicationResults || replicationResults.length === 0) return [];
    return replicationResults
      .map(r => {
        const parts = path.split(".");
        let v = r?.result || r;
        for (const p of parts) v = v?.[p];
        return v;
      })
      .filter(Number.isFinite);
  };

  const runBatchMeans = () => {
    const values = extractValues(batchMetric);
    if (values.length < 2) return;
    const ci = batchMeansCI(values);
    setBatchResult(ci);
  };

  const summaryStats = useMemo(() => {
    if (!replicationResults || replicationResults.length === 0) return null;
    const values = extractValues("summary.avgWait");
    if (values.length < 3) return null;
    return {
      avgWait: computeSummaryStats(values),
      percentiles: computePercentiles(values),
    };
  }, [replicationResults]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Warm-up detection section */}
      <div>
        <div style={{ fontSize: 10, color: C.amber, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
          WARM-UP DETECTION
        </div>
        {warmupDetection && warmupDetection.series.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, color: C.text, fontFamily: FONT, lineHeight: 1.6 }}>
              {warmupDetection.explanation}
            </div>
            {warmupDetection.series.length > 1 && (
              <div style={{ background: C.bg, borderRadius: 4, border: `1px solid ${C.border}`, padding: 8 }}>
                <MiniLineChart
                  title="Ensemble average trajectory"
                  points={warmupDetection.series}
                  color={C.accent}
                  yLabel="metric"
                />
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
            Run a replication batch and press <strong style={{ color: C.accent }}>Detect</strong> in the warm-up input to see Welch's method results here.
          </div>
        )}
      </div>

      {/* Batch-means CI section */}
      <div>
        <div style={{ fontSize: 10, color: C.green, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
          BATCH-MEANS CONFIDENCE INTERVAL
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT }}>Metric</span>
            <select aria-label="Batch-means metric" value={batchMetric}
              onChange={e => { setBatchMetric(e.target.value); setBatchResult(null); }}
              style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
              {ANALYSIS_METRICS.map(m => (
                <option key={m.path} value={m.path}>{m.label}</option>
              ))}
            </select>
          </div>
          <Btn small variant="primary" onClick={runBatchMeans} disabled={!replicationResults || replicationResults.length < 2}>
            Compute
          </Btn>
        </div>
        {batchResult && (
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.8, marginBottom: 6 }}>
              Batch-means accounts for autocorrelation by grouping observations into <strong>{batchResult.batchCount}</strong> batches of size <strong>{batchResult.batchSize}</strong>.
              The batch means are approximately independent, so a standard t-confidence interval on them is valid.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {[
                { label: "n",    value: batchResult.n,          color: C.muted  },
                { label: "mean", value: batchResult.mean,       color: C.accent },
                { label: "CI low", value: batchResult.lower,    color: C.muted  },
                { label: "CI high",value: batchResult.upper,    color: C.muted  },
                { label: "lag-1 rho", value: batchResult.lag1Rho, color: C.amber },
              ].map(s => (
                <div key={s.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: C.muted, fontFamily: FONT, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: s.color, fontFamily: FONT }}>{fmt(s.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {!batchResult && replicationResults && replicationResults.length >= 2 && (
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
            Select a metric and press <strong style={{ color: C.accent }}>Compute</strong> to calculate a batch-means confidence interval.
          </div>
        )}
      </div>

      {/* Distribution diagnostics section */}
      {summaryStats && (
        <div>
          <div style={{ fontSize: 10, color: C.purple, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
            DISTRIBUTION DIAGNOSTICS (Avg Wait)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "n",        value: summaryStats.avgWait.n,              color: C.muted  },
              { label: "mean",     value: summaryStats.avgWait.mean,          color: C.accent },
              { label: "stdDev",   value: summaryStats.avgWait.stdDev,        color: C.muted  },
              { label: "skewness", value: summaryStats.avgWait.skewness,      color: C.amber  },
              { label: "kurtosis", value: summaryStats.avgWait.kurtosis,      color: C.amber  },
              { label: "p50",      value: summaryStats.percentiles.p50,       color: C.green  },
              { label: "p90",      value: summaryStats.percentiles.p90,       color: C.amber  },
              { label: "p95",      value: summaryStats.percentiles.p95,       color: C.red    },
            ].map(s => (
              <div key={s.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: C.muted, fontFamily: FONT, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: s.color, fontFamily: FONT }}>{fmt(s.value)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.8 }}>
            {summaryStats.avgWait.isApproxNormal
              ? "The distribution of replication means is approximately normal (skewness and kurtosis within expected ranges)."
              : "The distribution of replication means deviates from normality. Consider using batch-means or a larger number of replications."}
          </div>
        </div>
      )}
    </div>
  );
}

export function BottomPanel({ log, snap, model, results, selectedNodeLabel, onClearFilter, replicationResults, warmupDetection }) {
  const [activeTab,  setActiveTab]  = useState("log");
  const [collapsed,  setCollapsed]  = useState(false);

  const tabBtnStyle = (id) => ({
    background: activeTab === id ? C.border : "transparent",
    border: "none",
    borderRadius: 4,
    color: activeTab === id ? C.text : C.muted,
    cursor: "pointer",
    fontFamily: FONT,
    fontSize: 11,
    padding: "5px 10px",
  });

  const chevronStyle = {
    background: "none",
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.muted,
    cursor: "pointer",
    fontFamily: FONT,
    fontSize: 11,
    padding: "3px 8px",
  };

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      {/* Header: tabs + collapse toggle */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "6px 10px",
        borderBottom: collapsed ? "none" : `1px solid ${C.border}`,
      }}>
        <div role="tablist" aria-label="Bottom panel tabs"
          style={{ display: "flex", background: C.bg, borderRadius: 5, padding: 2, gap: 1 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-disabled={tab.disabled}
              disabled={tab.disabled}
              onClick={() => { if (!tab.disabled) { setActiveTab(tab.id); setCollapsed(false); } }}
              style={{ ...tabBtnStyle(tab.id), opacity: tab.disabled ? 0.4 : 1, cursor: tab.disabled ? "not-allowed" : "pointer" }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          onClick={() => setCollapsed(c => !c)}
          style={chevronStyle}
        >
          {collapsed ? "▲" : "▼"}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: 14, maxHeight: 300, overflowY: "auto" }}>
          {activeTab === "log"       && <LogTab log={log} selectedNodeLabel={selectedNodeLabel} onClearFilter={onClearFilter} />}
          {activeTab === "entities"  && <EntitiesTab snap={snap} />}
          {activeTab === "stagekpis" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <EventCountsTable snap={snap} model={model} />
              <StageKpisTable snap={snap} model={model} />
            </div>
          )}
          {activeTab === "charts"    && <ChartsTab results={results} model={model} />}
          {activeTab === "analysis" && <AnalysisTab results={results} model={model} replicationResults={replicationResults} warmupDetection={warmupDetection} />}
        </div>
      )}
    </div>
  );
}
