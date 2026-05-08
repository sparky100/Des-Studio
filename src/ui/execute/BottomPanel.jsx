// ui/execute/BottomPanel.jsx — collapsible tabbed detail area below the Execute canvas
// Tabs: Step Log | Entities | Stage KPIs | Charts (disabled placeholder)
// F9C.8 + F9C.9 + F9C.11 node-filtered log
import { useState, useMemo } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Tag, PhaseTag } from "../shared/components.jsx";

const fmt = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : "—";

const TABS = [
  { id: "log",       label: "Step Log" },
  { id: "entities",  label: "Entities" },
  { id: "stagekpis", label: "Stage KPIs" },
  { id: "charts",    label: "Charts" },
];

// ── Stage KPIs ────────────────────────────────────────────────────────────────

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
                letterSpacing: 1.5, background: "#78350f22" }}>
                ──── WARM-UP ENDED AT T={r.time?.toFixed(0)} ────
              </div>
            )}
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#10b981",
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
            <td style={{ padding: "4px 8px", color: "#38bdf8" }}>#{e.id}</td>
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

// ── Charts tab (F10.5) ────────────────────────────────────────────────────────

const CHART_W = 360;
const CHART_H = 80;
const CHART_COLORS = ["#06b6d4", "#f59e0b", "#8b5cf6", "#3fb950", "#f87171", "#a78bfa"];

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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {queues.map((q, idx) => {
              const points = ts.map(entry => ({
                t: entry.t,
                value: entry.byType[q.customerType || q.name]?.waiting ??
                       Object.values(entry.byType).reduce((s, bt) => s + bt.waiting, 0),
              }));
              // Use the exact customer type for this queue
              const custType = (model.entityTypes || []).find(
                et => et.role !== "server" && (et.name === q.customerType || idx === 0)
              );
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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

      {/* Wait time percentiles */}
      {wd && Object.keys(wd).length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.amber, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
            WAIT TIME DISTRIBUTION
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, color: C.text }}>
            <thead>
              <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                {["Queue", "n", "Mean", "p50", "p90", "p95", "p99"].map(h => (
                  <th key={h} style={{ padding: "3px 8px", textAlign: "left", fontFamily: FONT, fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(wd).map(([q, d]) => (
                <tr key={q} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "3px 8px", color: C.cEvent, fontFamily: FONT }}>{q}</td>
                  <td style={{ padding: "3px 8px" }}>{d.n}</td>
                  <td style={{ padding: "3px 8px", color: C.accent }}>{d.mean}</td>
                  <td style={{ padding: "3px 8px" }}>{d.p50}</td>
                  <td style={{ padding: "3px 8px" }}>{d.p90}</td>
                  <td style={{ padding: "3px 8px" }}>{d.p95}</td>
                  <td style={{ padding: "3px 8px", color: C.amber }}>{d.p99}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function BottomPanel({ log, snap, model, results, selectedNodeLabel, onClearFilter }) {
  const [activeTab,  setActiveTab]  = useState("log");
  const [collapsed,  setCollapsed]  = useState(false);

  const tabBtnStyle = (id) => ({
    background: activeTab === id ? "#333" : "transparent",
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
          {activeTab === "stagekpis" && <StageKpisTable snap={snap} model={model} />}
          {activeTab === "charts"    && <ChartsTab results={results} model={model} />}
        </div>
      )}
    </div>
  );
}
