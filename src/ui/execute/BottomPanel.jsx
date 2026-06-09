// ui/execute/BottomPanel.jsx — collapsible tabbed detail area below the Execute canvas
// Tabs: Step Log | Entity Details | Charts | Live Metrics
// F9C.8 + F9C.9 + F9C.11 node-filtered log
import { useEffect, useMemo, useRef, useState } from "react";
;
import { Tag, PhaseTag } from "../shared/components.jsx";
import { QueueDepthTimePlot, QueueHistogram } from "./SweepViews.jsx";
import { formatSimWallTime } from "../../engine/clockUtils.js";
import { useTheme } from "../shared/ThemeContext.jsx";

const fmt = (v, d = 0) => Number.isFinite(v) ? v.toFixed(d) : "—";

function formatStatus(status) {

  if (status === "serving") return "In Service";
  return status;
}

const TABS = [
  { id: "log",       label: "Step Log" },
  { id: "entities",  label: "Entity Details" },
  { id: "charts",    label: "Charts" },
  { id: "stagekpis", label: "Live Metrics" },
  { id: "fel",       label: "Future Events" },
];

const BOTTOM_PANEL_BODY_HEIGHT = 320;
const STAGE_KPI_BODY_MIN_HEIGHT = 220;
const PANEL_MIN_HEIGHT = 220;
const PANEL_MAX_HEIGHT = 640;
const PANEL_MAXIMIZED_HEIGHT = "65vh";

function EventCountGroup({ title, color, events, counts }) {
  const { C, FONT } = useTheme();
  if (events.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, color, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {events.map((event) => {
          const count = counts[event.id] || 0;
          return (
            <div
              key={event.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: "8px 10px",
              }}
            >
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color, fontFamily: FONT, fontSize: 11, fontWeight: 700, lineHeight: 1.3 }}>
                  {event.name || event.id}
                </span>
              </div>
              <div style={{
                minWidth: 34,
                textAlign: "center",
                color: count ? C.text : C.muted,
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 700,
              }}>
                {count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stage KPIs ────────────────────────────────────────────────────────────────

function EventCountsTable({ snap, model }) {
  const { C, FONT } = useTheme();
  const counts = snap?.eventCounts ?? {};
  const bEvents = (model.bEvents || []).filter(b => parseFloat(b.scheduledTime) < 900 || Object.prototype.hasOwnProperty.call(counts, b.id));
  const cEvents = model.cEvents || [];
  if (bEvents.length === 0 && cEvents.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <EventCountGroup
        title="B-EVENTS (BOUND) — TIMES FIRED"
        color={C.bEvent}
        events={bEvents}
        counts={counts}
      />
      <EventCountGroup
        title="C-EVENTS (CONDITIONAL) — TIMES FIRED"
        color={C.cEvent}
        events={cEvents}
        counts={counts}
      />
    </div>
  );
}

function StageKpisTable({ snap, model }) {
  const { C, FONT } = useTheme();
  if (!snap) {
    return (
      <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, padding: 8 }}>
        Run the simulation to see live metrics.
      </div>
    );
  }

  const entities    = snap.entities || [];
  const queues      = model.queues || [];
  const serverTypes = (model.entityTypes || []).filter(et => et.role === "server");

  // Build outcomes — mirror ensureOutcome() from getSummary() so generic "done" entities
  // are not silently dropped (previously only entities with explicit outcome.routeId appeared)
  const outcomes = {};
  for (const entity of entities) {
    if (entity.role === "server") continue;
    if (entity.status !== "done" && entity.status !== "reneged") continue;
    const raw = entity.outcome;
    const outcome = raw?.routeId ? raw : {
      routeId:    entity.status === "reneged" ? "status:reneged" : "status:done",
      routeLabel: entity.status === "reneged" ? "Reneged" : "Completed",
      status:     entity.status === "reneged" ? "reneged" : "completed",
      endedBy:    "status",
    };
    if (!outcomes[outcome.routeId]) {
      outcomes[outcome.routeId] = {
        routeId:    outcome.routeId,
        routeLabel: outcome.routeLabel || outcome.routeId,
        status:     outcome.status || (entity.status === "reneged" ? "reneged" : "completed"),
        endedBy:    outcome.endedBy || "unknown",
        count: 0,
        _waitSum: 0, _waitN: 0,
        _sojournSum: 0, _sojournN: 0,
      };
    }
    outcomes[outcome.routeId].count++;
    const wait = entity.serviceStart != null && entity.arrivalTime != null
      ? entity.serviceStart - entity.arrivalTime : null;
    if (Number.isFinite(wait) && wait >= 0) {
      outcomes[outcome.routeId]._waitSum += wait;
      outcomes[outcome.routeId]._waitN++;
    }
    const endT = entity.completionTime ?? entity.renegeTime ?? null;
    const sojourn = endT != null && entity.arrivalTime != null ? endT - entity.arrivalTime : null;
    if (Number.isFinite(sojourn) && sojourn >= 0) {
      outcomes[outcome.routeId]._sojournSum += sojourn;
      outcomes[outcome.routeId]._sojournN++;
    }
  }
  for (const o of Object.values(outcomes)) {
    o.avgWait    = o._waitN    > 0 ? o._waitSum    / o._waitN    : null;
    o.avgSojourn = o._sojournN > 0 ? o._sojournSum / o._sojournN : null;
  }
  const outcomeRows = Object.values(outcomes)
    .sort((a, b) => b.count - a.count || a.routeLabel.localeCompare(b.routeLabel));

  // Queue journey paths — top-10 paths by frequency.
  // Named outcomes and reneged get a labelled sink; in-flight show "active…";
  // generic completions (no named outcome) have no sink — path ends at last queue.
  const queueNames = new Set((model.queues || []).map(q => q.name));
  const queueJourneys = {};
  for (const entity of entities) {
    if (entity.role === "server" || !entity.stages?.length) continue;
    const parts = entity.stages.map(s => s.queueName).filter(Boolean);
    if (!parts.length) continue;
    const isDone = entity.status === "done" || entity.status === "reneged";
    let sink;
    if (!isDone)                          sink = "active…";
    else if (entity.outcome?.routeLabel)  sink = entity.outcome.routeLabel;
    else if (entity.status === "reneged") sink = "Reneged";
    else                                  sink = null;
    const path = sink != null ? [...parts, sink].join("→") : parts.join("→");
    queueJourneys[path] = (queueJourneys[path] || 0) + 1;
  }
  const totalJourneys = Object.values(queueJourneys).reduce((a, b) => a + b, 0);
  const topPaths = Object.entries(queueJourneys)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Section metrics — computed from entity.stages[] + model.sections definitions
  const modelSections = model.sections || [];
  const sectionStats = {};
  if (modelSections.length > 0) {
    const queueIdByName = {};
    for (const q of model.queues || []) {
      if (q.id && q.name) queueIdByName[q.name.trim().toLowerCase()] = q.id;
    }
    const sectionMemberSet = {};
    const sectionEntrySet  = {};
    const sectionExitSet   = {};
    for (const sec of modelSections) {
      sectionMemberSet[sec.id] = new Set(sec.memberIds  || []);
      sectionEntrySet[sec.id]  = new Set(sec.entryQueues || []);
      sectionExitSet[sec.id]   = new Set(sec.exitQueues  || []);
      sectionStats[sec.id]     = { count: 0, _sojournSum: 0, entitiesIn: 0, entitiesOut: 0 };
    }
    for (const entity of entities) {
      if (entity.role === "server" || !entity.stages?.length) continue;
      if (entity.status !== "done" && entity.status !== "reneged") continue;
      for (const sec of modelSections) {
        let sojourn = 0, didVisit = false, didEnter = false, didExit = false;
        for (const stage of entity.stages) {
          const qid = queueIdByName[stage.queueName?.trim().toLowerCase()];
          if (!qid || !sectionMemberSet[sec.id].has(qid)) continue;
          didVisit = true;
          if (Number.isFinite(stage.stageWait))    sojourn += stage.stageWait;
          if (Number.isFinite(stage.stageService))  sojourn += stage.stageService;
          if (sectionEntrySet[sec.id].has(qid)) didEnter = true;
          if (sectionExitSet[sec.id].has(qid))  didExit  = true;
        }
        if (didVisit) {
          sectionStats[sec.id].count++;
          sectionStats[sec.id]._sojournSum += sojourn;
          if (didEnter) sectionStats[sec.id].entitiesIn++;
          if (didExit)  sectionStats[sec.id].entitiesOut++;
        }
      }
    }
    for (const sec of modelSections) {
      const s = sectionStats[sec.id];
      s.avgSojourn = s.count > 0 ? +(s._sojournSum / s.count).toFixed(2) : null;
    }
  }
  const hasSections = modelSections.length > 0 && Object.values(sectionStats).some(s => s.count > 0);

  const panelStyle = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const metricGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: 8,
  };

  const metricCard = (label, value, color = C.text) => (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", minWidth: 0 }}>
      <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 14, color, fontFamily: FONT, fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
      {/* Queue rows */}
      {queues.length > 0 && (
        <div style={panelStyle}>
          <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            QUEUES
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {queues.map(q => {
              const inQueue  = entities.filter(e => e.role !== "server" && (e.queue === q.name || e.lastQueue === q.name));
              const waiting  = entities.filter(e => e.role !== "server" && e.queue === q.name && e.status === "waiting");
              const now = snap.clock || 0;
              const currentWaits = waiting.map(e => now - (e.arrivalTime || 0)).filter(Number.isFinite);
              const meanWait = currentWaits.length ? currentWaits.reduce((a, b) => a + b, 0) / currentWaits.length : null;
              const maxWait  = currentWaits.length ? Math.max(...currentWaits) : null;
              return (
                <div key={q.name} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ color: C.cEvent, fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
                    {q.name}
                  </div>
                  <div style={metricGridStyle}>
                    {metricCard("Waiting", waiting.length, waiting.length > 0 ? C.amber : C.text)}
                    {metricCard("Mean wait", fmt(meanWait, 1))}
                    {metricCard("Max wait", fmt(maxWait, 1))}
                    {metricCard("Arrivals", inQueue.length)}
                    {metricCard("Reneged", snap.reneged || 0, C.reneged)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Server rows */}
      {serverTypes.length > 0 && (
        <div style={panelStyle}>
          <div style={{ fontSize: 10, color: C.purple, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            SERVERS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {serverTypes.map(et => {
              const declaredCapacity = parseInt(et.count || "1", 10) || 1;
              const servers  = entities.filter(e => e.role === "server" && e.type === et.name);
              const actualCapacity = servers.length;
              const busy     = servers.filter(e => e.status === "busy").length;
              const util     = ((busy / actualCapacity) * 100).toFixed(0);
              const done     = entities.filter(e => e.role !== "server" &&
                e.completionTime != null && e.serviceStart != null);
              const svcTimes = done.map(e => e.completionTime - e.serviceStart).filter(Number.isFinite);
              const meanSvc  = svcTimes.length
                ? svcTimes.reduce((a, b) => a + b, 0) / svcTimes.length : null;
              return (
                <div key={et.name} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ color: C.purple, fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
                    {et.name}
                  </div>
                  <div style={metricGridStyle}>
                    {metricCard("Capacity", actualCapacity)}
                    {metricCard("Busy", busy, busy > 0 ? C.amber : C.text)}
                    {metricCard("Use", `${util}%`)}
                    {metricCard("Mean svc", fmt(meanSvc, 1))}
                    {metricCard("Completions", snap.served || 0, C.served)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {outcomeRows.length > 0 && (
        <div style={panelStyle}>
          <div style={{ fontSize: 10, color: C.served, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            JOURNEY OUTCOMES
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {outcomeRows.map(outcome => {
              const outcomeColor = outcome.status === "reneged" ? C.reneged : C.served;
              const hasWait    = Number.isFinite(outcome.avgWait)    && outcome.avgWait    > 0;
              const hasSojourn = Number.isFinite(outcome.avgSojourn) && outcome.avgSojourn > 0;
              return (
                <div key={outcome.routeId} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ color: outcomeColor, fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
                    {outcome.routeLabel}
                  </div>
                  <div style={metricGridStyle}>
                    {metricCard("Count", outcome.count, outcomeColor)}
                    {hasWait    && metricCard("Avg wait",    fmt(outcome.avgWait,    1))}
                    {hasSojourn && metricCard("Avg time",    fmt(outcome.avgSojourn, 1))}
                    {metricCard("Source", outcome.endedBy || "—")}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
                    {outcome.status === "reneged" ? "Left before completion." : "Completed on this route."}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Journey path traces — top-10 paths from entity.stages[] */}
      {topPaths.length > 0 && (
        <div style={panelStyle}>
          <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            JOURNEY PATHS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topPaths.map(([path, count]) => {
              const pct = totalJourneys > 0 ? ((count / totalJourneys) * 100).toFixed(0) : 0;
              const segs = path.split("→");
              const lastSeg = segs[segs.length - 1];
              const hasSink = !queueNames.has(lastSeg);
              const nodes = hasSink ? segs.slice(0, -1) : segs;
              const sinkColor = lastSeg === "active…" ? C.amber : C.accent;
              return (
                <div key={path} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginBottom: 6 }}>
                    {nodes.map((node, i) => (
                      <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 10, fontFamily: FONT, color: C.cEvent, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 6px" }}>
                          {node}
                        </span>
                        <span style={{ color: C.muted, fontSize: 10 }}>→</span>
                      </span>
                    ))}
                    {hasSink && (
                      <span style={{
                        fontSize: 10, fontFamily: FONT, borderRadius: 4, padding: "2px 6px",
                        color: sinkColor, background: C.bg, border: `1px dashed ${sinkColor}`,
                      }}>
                        {lastSeg}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: C.cEvent, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, color: C.text, fontFamily: FONT, fontWeight: 700, minWidth: 24 }}>{count}</span>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section metrics — only shown when model.sections is defined */}
      {hasSections && (
        <div style={panelStyle}>
          <div style={{ fontSize: 10, color: C.purple, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            SECTIONS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {modelSections.map(sec => {
              const s = sectionStats[sec.id];
              if (!s || s.count === 0) return null;
              return (
                <div key={sec.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {sec.color && (
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: sec.color, flexShrink: 0 }} />
                    )}
                    <span style={{ color: C.purple, fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>{sec.name || sec.id}</span>
                  </div>
                  <div style={metricGridStyle}>
                    {metricCard("Entities", s.count)}
                    {s.avgSojourn != null && metricCard("Avg time", fmt(s.avgSojourn, 1))}
                    {s.entitiesIn  > 0 && metricCard("In",  s.entitiesIn,  C.served)}
                    {s.entitiesOut > 0 && metricCard("Out", s.entitiesOut, C.reneged)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Log tab ───────────────────────────────────────────────────────────────────

function LogTab({ log, selectedNodeLabel, onClearFilter, onEntitySelect, onNodeSelect, model }) {
  const { C, FONT } = useTheme();
  const [expandedSeq, setExpandedSeq] = useState(null);
  const [searchText, setSearchText]   = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const wallTimeFor = (simTime) => (
    model?.epoch && simTime != null
      ? formatSimWallTime(simTime, model.epoch, model.timeUnit || "minutes")
      : null
  );
  const filtered = useMemo(() => {
    let result = selectedNodeLabel
      ? log.filter(e => e.message?.includes(selectedNodeLabel))
      : log;
    if (phaseFilter !== "all") result = result.filter(e => e.phase === phaseFilter);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(e => e.message?.toLowerCase().includes(q));
    }
    return result;
  }, [log, selectedNodeLabel, phaseFilter, searchText]);

  const nodeNames = useMemo(() => {
    const names = new Set();
    (model.queues || []).forEach(q => names.add(q.name));
    (model.entityTypes || []).filter(et => et.role === "server").forEach(et => names.add(et.name));
    (model.bEvents || []).forEach(b => names.add(b.name));
    (model.cEvents || []).forEach(c => names.add(c.name));
    return [...names].sort((a, b) => b.length - a.length);
  }, [model]);

  function renderLogMessageWithNodeLinks(message) {
    if (!message || !onNodeSelect) return message;
    const parts = [];
    let remaining = message;
    let keyIdx = 0;

    for (const nodeName of nodeNames) {
      if (!remaining.includes(nodeName)) continue;
      const newParts = [];
      const segments = remaining.split(nodeName);
      segments.forEach((seg, i) => {
        if (i > 0) {
          newParts.push(
            <span
              key={`node-${keyIdx++}`}
              onClick={(e) => { e.stopPropagation(); onNodeSelect(nodeName); }}
              style={{ color: C.accent, cursor: "pointer", textDecoration: "underline", fontWeight: 700 }}
              title={`Filter log for: ${nodeName}`}
            >
              {nodeName}
            </span>
          );
        }
        if (seg) newParts.push(<span key={`text-${keyIdx++}`}>{seg}</span>);
      });
      remaining = null;
      parts.push(...newParts);
      break;
    }

    return parts.length > 0 ? parts : message;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <input
          placeholder="Search messages…"
          value={searchText}
          onChange={ev => setSearchText(ev.target.value)}
          style={{ flex: 1, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4,
            color: C.text, fontFamily: FONT, fontSize: 11, padding: "5px 8px", outline: "none" }}
        />
        <select
          value={phaseFilter}
          onChange={ev => setPhaseFilter(ev.target.value)}
          style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4,
            color: C.text, fontFamily: FONT, fontSize: 11, padding: "5px 6px", outline: "none" }}
        >
          <option value="all">All phases</option>
          <option value="B">B-Events</option>
          <option value="C">C-Events</option>
          <option value="A">A-phase</option>
          <option value="WARMUP">Warmup</option>
          <option value="ERROR">Errors</option>
        </select>
      </div>
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
        : [...filtered].reverse().map((r, i) => {
          const hasDetail = r.cEval || r.event || r.arbitration;
          return (
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
                {wallTimeFor(r.time) && (
                  <span style={{ color: C.accent, fontFamily: FONT, fontSize: 10, marginRight: 6 }}>
                    {wallTimeFor(r.time)}
                  </span>
                )}
                <PhaseTag phase={r.phase} /> {renderLogMessageWithNodeLinks(r.message)}
                {hasDetail && (
                  <button
                    onClick={() => setExpandedSeq(prev => prev === r.seq ? null : r.seq)}
                    style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 9, padding: "0 4px", marginLeft: 4 }}
                    title="Toggle debug detail"
                  >
                    {expandedSeq === r.seq ? "▲" : "▶"}
                  </button>
                )}
              </div>
              {expandedSeq === r.seq && hasDetail && (
                <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "6px 12px", fontSize: 10, fontFamily: FONT, display: "flex", flexDirection: "column", gap: 4 }}>
                  {r.cEval && (
                    <div>
                      <span style={{ color: C.muted }}>C-Eval  </span>
                      <span style={{ color: C.cEvent }}>"{r.cEval.eventName}"</span>
                      <span style={{ color: r.cEval.conditionTrue ? C.green : C.red, marginLeft: 8 }}>
                        {r.cEval.conditionTrue ? "FIRED" : "false"}
                      </span>
                      {r.cEval.failureReason && (
                        <span style={{ color: C.muted, marginLeft: 8 }}>({r.cEval.failureReason})</span>
                      )}
                      {r.cEval.skippedBecause && (
                        <span style={{ color: C.purple, marginLeft: 8 }}>skipped: {r.cEval.skippedBecause}</span>
                      )}
                      {!r.cEval.conditionTrue && (
                        <span style={{ color: C.muted, marginLeft: 8 }}>pass {r.cEval.pass} · priority {r.cEval.priority}</span>
                      )}
                      {r.cEval.conditionTrue && (
                        <span style={{ color: C.muted, marginLeft: 8 }}>pass {r.cEval.pass} · priority {r.cEval.priority}</span>
                      )}
                    </div>
                  )}
                  {r.event && (
                    <div>
                      <span style={{ color: C.muted }}>Event  </span>
                      <span style={{ color: C.text }}>
                        {r.event.fired ? `fired` : `skipped`}
                        {r.event.entityIds?.length > 0 && (
                          <span style={{ marginLeft: 6 }}>
                            → entities
                            {r.event.entityIds.map(id => (
                              <span
                                key={id}
                                onClick={() => onEntitySelect?.(id)}
                                style={{ color: C.kpiArr, cursor: "pointer", marginLeft: 4, textDecoration: "underline" }}
                              >
                                #{id}
                              </span>
                            ))}
                          </span>
                        )}
                        {r.event.newEvents?.length > 0 && (
                          <span style={{ color: C.muted, marginLeft: 8 }}>
                            scheduled: {r.event.newEvents.map(ne => `${ne.name}@${ne.at?.toFixed(1)}t`).join(", ")}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {r.arbitration && (
                    <div>
                      <span style={{ color: C.muted }}>Arb  </span>
                      <span style={{ color: C.label }}>
                        {r.arbitration.type}
                        {r.arbitration.serverType && ` (${r.arbitration.serverType})`}
                        {r.arbitration.queueName && ` queue=${r.arbitration.queueName}`}
                        {r.arbitration.discipline && ` [${r.arbitration.discipline}]`}
                      </span>
                      {r.arbitration.noMatch ? (
                        <span style={{ color: C.amber, marginLeft: 8 }}>
                          no match — {r.arbitration.candidateCount ?? 0} waiting, {r.arbitration.idleServerCount ?? 0} idle servers
                        </span>
                      ) : (
                        <>
                          <span style={{ color: C.green, marginLeft: 8 }}>
                            winner: #{r.arbitration.winner?.entityId} → server #{r.arbitration.winner?.serverId}
                          </span>
                          {r.arbitration.losers?.length > 0 && (
                            <span style={{ color: C.muted, marginLeft: 8 }}>
                              skipped: {r.arbitration.losers.map(l => `#${l.entityId}`).join(", ")}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      }
    </div>
  );
}

// ── Entity Inspector ─────────────────────────────────────────────────────────

function EntityInspector({ entity, snap, onClose }) {
  const { C, FONT } = useTheme();
  if (!entity) return null;
  const clock = snap?.clock ?? 0;
  const waitingAge = entity.waitingSince != null ? clock - entity.waitingSince : null;
  const stages = entity.stages || [];
  const formatAttrValue = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value.toFixed(1).replace(/\.0$/, "");
    }
    return String(value);
  };

  const rowStyle = {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    borderBottom: `1px solid ${C.bg}`,
    padding: "5px 0",
    fontSize: 11,
    fontFamily: FONT,
  };
  const labelStyle = {
    color: C.muted,
    minWidth: 100,
    fontSize: 10,
    paddingTop: 2,
  };
  const valueStyle = {
    color: C.text,
    flex: 1,
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>ENTITY TRACKING</span>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 10, padding: "2px 8px" }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: C.kpiArr, fontFamily: FONT, fontSize: 13, fontWeight: 700 }}>
          #{entity.id}
        </span>
        <span style={{ color: C.text, fontFamily: FONT, fontSize: 12 }}>{entity.type}</span>
        <Tag label={formatStatus(entity.status)} color={entity.status === "waiting" ? C.amber : entity.status === "serving" ? C.accent : entity.status === "batch" ? C.purple : C.green} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
        <div style={rowStyle}>
          <span style={labelStyle}>Arrival</span>
          <span style={valueStyle}>{entity.arrivalTime != null ? `t=${entity.arrivalTime.toFixed(1)}` : "—"}</span>
        </div>
        {entity.serverId != null && (
          <div style={rowStyle}>
            <span style={labelStyle}>Server</span>
            <span style={valueStyle}>#{entity.serverId}</span>
          </div>
        )}
        {entity.queue != null && (
          <div style={rowStyle}>
            <span style={labelStyle}>Queue</span>
            <span style={{ ...valueStyle, color: C.cEvent }}>{entity.queue}</span>
          </div>
        )}
        {waitingAge != null && (
          <div style={rowStyle}>
            <span style={labelStyle}>Waiting</span>
            <span style={{ ...valueStyle, color: C.amber }}>{waitingAge.toFixed(1)}t</span>
          </div>
        )}
        {entity.waitingFor?.queueName && (
          <div style={rowStyle}>
            <span style={labelStyle}>Waiting for</span>
            <span style={{ ...valueStyle, color: C.amber }}>{entity.waitingFor.queueName}</span>
          </div>
        )}
        {entity.loopCount > 0 && (
          <div style={rowStyle}>
            <span style={labelStyle}>Loops</span>
            <span style={{ ...valueStyle, color: C.purple }}>{entity.loopCount}x</span>
          </div>
        )}
        {entity.completionTime != null && (
          <div style={rowStyle}>
            <span style={labelStyle}>Completed</span>
            <span style={{ ...valueStyle, color: C.green }}>t={entity.completionTime.toFixed(1)}</span>
          </div>
        )}
        {entity.renegeTime != null && (
          <div style={rowStyle}>
            <span style={labelStyle}>Reneged</span>
            <span style={{ ...valueStyle, color: C.red }}>t={entity.renegeTime.toFixed(1)}</span>
          </div>
        )}
        {entity.sojournTime != null && (
          <div style={rowStyle}>
            <span style={labelStyle}>Sojourn</span>
            <span style={{ ...valueStyle, color: C.kpiSvc }}>{entity.sojournTime.toFixed(1)}t</span>
          </div>
        )}
      </div>

      {entity.attrs && Object.keys(entity.attrs).length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
          <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, marginBottom: 4, textTransform: "uppercase" }}>Attributes</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
            {Object.entries(entity.attrs).map(([k, v]) => (
              <div key={k} style={rowStyle}>
                <span style={labelStyle}>{k}</span>
                <span style={valueStyle}>{formatAttrValue(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stages.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
          <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, marginBottom: 6, textTransform: "uppercase" }}>
            Service Stages ({stages.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {stages.map((s, i) => (
              <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: C.cEvent, fontFamily: FONT, fontSize: 10, fontWeight: 700 }}>
                    Stage {i + 1}: {s.queueName || "—"}
                  </span>
                  <span style={{ color: C.muted, fontFamily: FONT, fontSize: 9 }}>
                    {s.serverType}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
                  <div style={{ fontSize: 10, color: C.muted }}>Waited</div>
                  <div style={{ fontSize: 10, color: C.amber, fontWeight: 700 }}>{s.stageWait != null ? `${Number(s.stageWait).toFixed(1)}t` : "—"}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>Service</div>
                  <div style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>{s.stageService != null ? `${Number(s.stageService).toFixed(1)}t` : "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Entities tab (split view) ───────────────────────────────────────────────

function EntitiesTab({ snap, selectedEntityId, onEntitySelect }) {
  const { C, FONT } = useTheme();
  const [filterText,   setFilterText]   = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  if (!snap) {
    return <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12 }}>No snapshot yet.</div>;
  }
  const entities = (snap.entities || [])
    .filter(e => e.role !== "server" && e.status !== "done" && e.status !== "reneged");

  const displayed = entities.filter(e => {
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      const loc = e.status === "waiting"
        ? (e.queue || "")
        : (e.ceventName || e.lastQueue || e.queue || "");
      return String(e.id).includes(q) ||
        (e.type || "").toLowerCase().includes(q) ||
        loc.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      {/* Left: Entity List */}
      <div style={{ flex: "0 0 45%", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            placeholder="Filter by ID, type or location…"
            value={filterText}
            onChange={ev => setFilterText(ev.target.value)}
            style={{ flex: 1, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4,
              color: C.text, fontFamily: FONT, fontSize: 11, padding: "5px 8px", outline: "none" }}
          />
          <select
            value={filterStatus}
            onChange={ev => setFilterStatus(ev.target.value)}
            style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4,
              color: C.text, fontFamily: FONT, fontSize: 11, padding: "5px 6px", outline: "none" }}
          >
            <option value="all">All</option>
            <option value="waiting">Waiting</option>
            <option value="serving">Serving</option>
          </select>
        </div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
          {displayed.length}{displayed.length !== entities.length ? ` of ${entities.length}` : ""} active {entities.length === 1 ? "entity" : "entities"}
        </div>
        {displayed.length === 0 ? (
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
            {entities.length === 0 ? "No active customer entities." : "No entities match the filter."}
          </div>
        ) : (
          <div style={{ overflowY: "auto", flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 11 }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: `2px solid ${C.border}` }}>
                  <th scope="col" style={{ padding: "4px 8px", textAlign: "left" }}>ID</th>
                  <th scope="col" style={{ padding: "4px 8px", textAlign: "left" }}>Type</th>
                  <th scope="col" style={{ padding: "4px 8px", textAlign: "left" }}>Status</th>
                  <th scope="col" style={{ padding: "4px 8px", textAlign: "left" }}>Location</th>
                  <th scope="col" style={{ padding: "4px 8px", textAlign: "right" }}>Age</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(e => {
                  const journey = snap.clock != null ? snap.clock - (e.arrivalTime || 0) : null;
                  const location = e.status === "waiting"
                    ? (e.queue || "—")
                    : e.status === "serving"
                      ? (e.ceventName || e.lastQueue || "—")
                      : (e.queue || e.lastQueue || "—");
                  const isSelected = selectedEntityId === e.id;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => onEntitySelect?.(isSelected ? null : e.id)}
                      style={{
                        borderBottom: `1px solid ${C.bg}`,
                        cursor: "pointer",
                        background: isSelected ? `${C.accent}18` : "transparent",
                      }}
                    >
                      <td style={{ padding: "4px 8px", color: C.kpiArr, fontFamily: FONT, fontWeight: 700 }}>#{e.id}</td>
                      <td style={{ padding: "4px 8px", fontFamily: FONT }}>{e.type}</td>
                      <td style={{ padding: "4px 8px" }}>
                        <Tag label={formatStatus(e.status)} color={e.status === "waiting" ? C.amber : e.status === "serving" ? C.accent : C.green} />
                      </td>
                      <td style={{ padding: "4px 8px", color: C.cEvent, fontFamily: FONT }}>{location}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: C.amber, fontFamily: FONT, fontWeight: 700 }}>
                        {journey != null ? `${journey.toFixed(1)}t` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right: Inspector */}
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        <EntityInspector
          entity={selectedEntityId != null ? entities.find(e => e.id === selectedEntityId) : null}
          snap={snap}
          onClose={onEntitySelect ? () => onEntitySelect(null) : undefined}
        />
      </div>
    </div>
  );
}

// ── FEL tab ──────────────────────────────────────────────────────────────────

function FelTab({ snap, model }) {
  const { C, FONT } = useTheme();
  const fel = snap?.felPreview;
  if (!snap) {
    return <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12 }}>Run the simulation to see the Future Events List.</div>;
  }
  if (!fel || fel.length === 0) {
    return <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12 }}>FEL is empty — simulation complete.</div>;
  }
  const clock = snap.clock || 0;
  const currentWallTime = model?.epoch ? formatSimWallTime(clock, model.epoch, model.timeUnit || "minutes") : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
        {fel.length} event{fel.length !== 1 ? "s" : ""} scheduled · clock t={fmt(clock, 1)}
        {currentWallTime && <span style={{ color: C.accent, marginLeft: 8 }}>{currentWallTime}</span>}
        {fel.length === 100 && <span style={{ color: C.amber }}> (showing first 100)</span>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{ padding: "4px 10px", textAlign: "left", color: C.muted, fontSize: 10 }}>Scheduled t</th>
              <th style={{ padding: "4px 10px", textAlign: "left", color: C.muted, fontSize: 10 }}>Δ from now</th>
              <th style={{ padding: "4px 10px", textAlign: "left", color: C.muted, fontSize: 10 }}>Event</th>
              <th style={{ padding: "4px 10px", textAlign: "left", color: C.muted, fontSize: 10 }}>Entity</th>
              <th style={{ padding: "4px 10px", textAlign: "left", color: C.muted, fontSize: 10 }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {fel.map((e, i) => {
              const delta = e.scheduledTime - clock;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.bg}`, background: i % 2 === 0 ? "transparent" : `${C.bg}55` }}>
                  <td style={{ padding: "4px 10px", color: C.bEvent, fontFamily: "monospace", fontWeight: 700 }}>
                    {fmt(e.scheduledTime, 2)}
                  </td>
                  <td style={{ padding: "4px 10px", color: delta < 0.01 ? C.amber : C.muted, fontFamily: "monospace" }}>
                    +{fmt(delta, 2)}
                  </td>
                  <td style={{ padding: "4px 10px", color: C.text }}>{e.name}</td>
                  <td style={{ padding: "4px 10px", color: e.contextEntityId != null ? C.kpiArr : C.muted }}>
                    {e.contextEntityId != null ? `#${e.contextEntityId}` : "—"}
                  </td>
                  <td style={{ padding: "4px 10px" }}>
                    {e.isRenege
                      ? <span style={{ color: C.reneged, fontSize: 10, fontWeight: 700 }}>RENEGE</span>
                      : <span style={{ color: C.bEvent, fontSize: 10 }}>B-event</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── BottomPanel ───────────────────────────────────────────────────────────────

export function BottomPanel({ log, snap, model, hasResults = false, onOpenResults, selectedNodeLabel, onClearFilter, selectedEntityId, onEntitySelect, onNodeSelect, timeSeries, waitDist }) {
  const { C, FONT } = useTheme();
  const [activeTab, setActiveTab] = useState(() => {
    try { const t = localStorage.getItem("des.bottomPanel.tab"); return TABS.some(tab => tab.id === t) ? t : "log"; } catch { return "log"; }
  });
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("des.bottomPanel.collapsed") === "1"; } catch { return false; }
  });
  const [bodyHeight, setBodyHeight] = useState(() => {
    try { const s = parseInt(localStorage.getItem("des.bottomPanel.height"), 10); return Number.isFinite(s) ? Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, s)) : BOTTOM_PANEL_BODY_HEIGHT; } catch { return BOTTOM_PANEL_BODY_HEIGHT; }
  });
  const [maximized, setMaximized] = useState(false);
  const dragStateRef = useRef(null);
  const bodyHeightRef = useRef(bodyHeight);
  useEffect(() => { bodyHeightRef.current = bodyHeight; }, [bodyHeight]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!dragStateRef.current) return;
      const nextHeight = dragStateRef.current.startHeight + (dragStateRef.current.startY - event.clientY);
      setBodyHeight(Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, nextHeight)));
    };
    const handlePointerUp = () => {
      if (dragStateRef.current) {
        try { localStorage.setItem("des.bottomPanel.height", String(bodyHeightRef.current)); } catch {}
      }
      dragStateRef.current = null;
    };
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, []);

  const startResize = (event) => {
    event.preventDefault();
    setMaximized(false);
    dragStateRef.current = { startY: event.clientY, startHeight: bodyHeight };
  };

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

  const toolBtnStyle = {
    background: "none",
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.muted,
    cursor: "pointer",
    fontFamily: FONT,
    fontSize: 10,
    padding: "3px 8px",
  };

  const resolvedBodyHeight = maximized
    ? PANEL_MAXIMIZED_HEIGHT
    : `${Math.max(bodyHeight, activeTab === "stagekpis" ? STAGE_KPI_BODY_MIN_HEIGHT : bodyHeight)}px`;

  const resolvedMinHeight = maximized
    ? PANEL_MAXIMIZED_HEIGHT
    : `${Math.max(bodyHeight, activeTab === "stagekpis" ? STAGE_KPI_BODY_MIN_HEIGHT : bodyHeight)}px`;

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
              onClick={() => { if (!tab.disabled) { setActiveTab(tab.id); setCollapsed(false); try { localStorage.setItem("des.bottomPanel.tab", tab.id); localStorage.setItem("des.bottomPanel.collapsed", "0"); } catch {} } }}
              style={{ ...tabBtnStyle(tab.id), opacity: tab.disabled ? 0.4 : 1, cursor: tab.disabled ? "not-allowed" : "pointer" }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {!collapsed && (
          <div style={{ display: "flex", gap: 3, alignItems: "center", marginRight: 4 }}>
            {[["S", 220], ["M", 320], ["L", 520]].map(([label, h]) => {
              const active = Math.abs(bodyHeight - h) <= 4 && !maximized;
              return (
                <button
                  key={label}
                  type="button"
                  title={`${label === "S" ? "Small" : label === "M" ? "Medium" : "Large"} — ${h}px`}
                  aria-label={`Set panel height to ${label} (${h}px)`}
                  onClick={() => {
                    setBodyHeight(h);
                    setMaximized(false);
                    try { localStorage.setItem("des.bottomPanel.height", String(h)); } catch {}
                  }}
                  style={{
                    background: active ? `${C.accent}20` : "none",
                    border: `1px solid ${active ? C.accent : C.border}`,
                    borderRadius: 4,
                    color: active ? C.accent : C.muted,
                    cursor: "pointer",
                    fontFamily: FONT,
                    fontSize: 9,
                    fontWeight: 700,
                    lineHeight: 1,
                    padding: "3px 6px",
                    transition: "border-color 120ms ease, color 120ms ease, background 120ms ease",
                  }}
                >{label}</button>
              );
            })}
          </div>
        )}
        {hasResults && (
          <button
            type="button"
            onClick={onOpenResults}
            style={toolBtnStyle}
          >
            Open Results
          </button>
        )}
        <button
          type="button"
          aria-label={maximized ? "Restore panel size" : "Expand panel"}
          onClick={() => setMaximized(value => !value)}
          style={toolBtnStyle}
        >
          {maximized ? "Restore" : "Expand"}
        </button>
        <button
          aria-label={collapsed ? "Expand details panel" : "Collapse details panel"}
          onClick={() => setCollapsed(c => { const next = !c; try { localStorage.setItem("des.bottomPanel.collapsed", next ? "1" : "0"); } catch {} return next; })}
          style={chevronStyle}
        >
          {collapsed ? "▲" : "▼"}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div
          aria-label="Bottom panel content"
          style={{
            padding: 14,
            height: resolvedBodyHeight,
            minHeight: resolvedMinHeight,
            maxHeight: maximized ? PANEL_MAXIMIZED_HEIGHT : `${PANEL_MAX_HEIGHT}px`,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {activeTab === "log"       && <LogTab log={log} selectedNodeLabel={selectedNodeLabel} onClearFilter={onClearFilter} onEntitySelect={onEntitySelect} onNodeSelect={onNodeSelect} model={model} />}
          {activeTab === "entities"  && <EntitiesTab snap={snap} selectedEntityId={selectedEntityId} onEntitySelect={onEntitySelect} />}
          {activeTab === "fel"       && <FelTab snap={snap} model={model} />}
          {activeTab === "charts"    && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {waitDist && Object.keys(waitDist).length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {!hasResults && (
                    <div style={{ fontSize: 10, color: C.green, fontFamily: FONT, fontWeight: 700, letterSpacing: 1.2 }}>
                      ● LIVE — wait time distributions updating as simulation runs
                    </div>
                  )}
                  <QueueHistogram waitDist={waitDist} />
                </div>
              ) : (
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
                  Wait time histograms will appear here once entities complete service.
                </div>
              )}
              {timeSeries ? (
                <QueueDepthTimePlot timeSeries={timeSeries} queues={model.queues} timeUnit={model.timeUnit} />
              ) : (
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
                  Queue depth over time: run with "Collect time-series" enabled.
                </div>
              )}
            </div>
          )}
          {activeTab === "stagekpis" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <EventCountsTable snap={snap} model={model} />
              <StageKpisTable snap={snap} model={model} />
            </div>
          )}
        </div>
      )}
      {!collapsed && !maximized && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize bottom panel"
          onMouseDown={startResize}
          style={{
            height: 10,
            cursor: "ns-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <div style={{ width: 44, height: 3, borderRadius: 999, background: C.border }} />
        </div>
      )}
    </div>
  );
}
