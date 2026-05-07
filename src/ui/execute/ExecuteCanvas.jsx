// ui/execute/ExecuteCanvas.jsx — read-only canvas view for the Execute panel
// Derives graph topology from canonical model_json (same helper as Visual Designer).
// Receives live snap state and overlays queue depths, server busy/idle counts on each node.
// Returns null when the model yields no derivable nodes — caller falls back to VisualView.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { C, FONT, TOKEN_COLORS } from "../shared/tokens.js";
import { deriveGraphFromModel } from "../visual-designer/graph.js";
import { ExecuteSourceNode }   from "./ExecuteSourceNode.jsx";
import { ExecuteQueueNode }    from "./ExecuteQueueNode.jsx";
import { ExecuteActivityNode } from "./ExecuteActivityNode.jsx";
import { ExecuteSinkNode }     from "./ExecuteSinkNode.jsx";
import { AnimatedEdge }        from "./AnimatedEdge.jsx";

const NODE_COLOR = {
  source: C.green,
  queue: C.cEvent,
  activity: C.purple,
  sink: C.red,
};

// ── Configurable KPI bar (F9C.7) ─────────────────────────────────────────────

const KPI_METRICS = {
  arrived: { label: "Arrived",       color: "#38bdf8" },
  served:  { label: "Served",        color: "#10b981" },
  reneged: { label: "Reneged",       color: "#ef4444" },
  waiting: { label: "Waiting",       color: "#f59e0b" },
  clock:   { label: "Sim Clock",     color: "#a78bfa" },
  active:  { label: "Active",        color: C.cEvent  },
};

import { DEFAULT_KPI_SLOTS } from "./execute-constants.js";
export { DEFAULT_KPI_SLOTS };

function resolveKpiValue(key, snap, entities) {
  const customers = entities.filter(e => e.role !== "server");
  switch (key) {
    case "arrived": return customers.length;
    case "served":  return snap.served || 0;
    case "reneged": return snap.reneged || 0;
    case "waiting": return customers.filter(e => e.status === "waiting").length;
    case "clock":   return parseFloat(snap.clock).toFixed(1);
    case "active":  return customers.filter(e => e.status !== "done" && e.status !== "reneged").length;
    default:        return "—";
  }
}

function KpiSlot({ metricKey, snap, entities, onEdit }) {
  const [hovered,  setHovered]  = useState(false);
  const [editing,  setEditing]  = useState(false);
  const meta  = KPI_METRICS[metricKey] || { label: metricKey, color: C.muted };
  const value = snap ? resolveKpiValue(metricKey, snap, entities) : "—";

  return (
    <div
      style={{ background: "#1a1a1a", border: `1px solid #333`, borderRadius: 8, padding: 10,
        textAlign: "center", position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setEditing(false); }}
    >
      {hovered && (
        <button
          aria-label={`Change ${meta.label} slot`}
          onClick={() => setEditing(e => !e)}
          style={{ position: "absolute", top: 3, right: 4, background: "none",
            border: "none", color: C.muted, cursor: "pointer", fontSize: 10, padding: 2 }}
        >
          ✎
        </button>
      )}
      {editing && (
        <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 20,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: 4, minWidth: 110, boxShadow: "0 4px 16px #0008" }}>
          {Object.entries(KPI_METRICS).map(([k, m]) => (
            <div key={k}
              onClick={() => { onEdit(k); setEditing(false); }}
              style={{ padding: "5px 10px", cursor: "pointer", fontSize: 11,
                color: k === metricKey ? C.accent : C.text, fontFamily: FONT,
                borderRadius: 4, background: k === metricKey ? `${C.accent}18` : "none" }}>
              {m.label}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 9, color: "#888", fontWeight: 700, marginBottom: 4 }}>
        {meta.label.toUpperCase()}
      </div>
      <div style={{ fontSize: 20, color: meta.color, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// ── Token animation helpers (F9C.6) ──────────────────────────────────────────

let _tokenSeq = 0;
const nextTokenId = () => ++_tokenSeq;

function entityTypeColor(typeName) {
  let hash = 0;
  for (const ch of String(typeName || "")) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return TOKEN_COLORS[Math.abs(hash) % TOKEN_COLORS.length];
}

const MAX_TOKENS_PER_EDGE = 5;
const TOKEN_TTL_MS = 350;

// Compare consecutive snaps to detect entity routing transitions.
function detectRoutingEvents(prevSnap, currSnap, graph) {
  const events = [];
  const prevById = new Map((prevSnap.entities || []).map(e => [e.id, e]));
  const edges = graph.edges || [];
  const nodes = graph.nodes || [];

  const findEdge = (predicate) => edges.find(predicate);
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  for (const curr of currSnap.entities || []) {
    if (curr.role === "server") continue;
    const prev = prevById.get(curr.id);

    if (!prev) {
      // New entity arrived → Source → Queue edge
      if (curr.queue) {
        const edge = findEdge(e =>
          e.source === "arrival" && nodeById.get(e.to)?.label === curr.queue);
        if (edge) events.push({ edgeId: edge.id, entityType: curr.type });
      }
    } else if (prev.status === "waiting" && curr.status !== "waiting"
               && curr.status !== "done" && curr.status !== "reneged") {
      // Entity seized from queue → Queue → Activity edge
      const edge = findEdge(e =>
        e.source === "condition" && nodeById.get(e.from)?.label === prev.queue);
      if (edge) events.push({ edgeId: edge.id, entityType: curr.type });
    } else if (prev.status !== "done" && prev.status !== "reneged"
               && (curr.status === "done" || curr.status === "reneged")) {
      // Entity completed → Activity → Sink edge
      const edge = findEdge(e => e.source === "terminal");
      if (edge) events.push({ edgeId: edge.id, entityType: curr.type });
    }
  }
  return events;
}

// ── Return a short human-readable label for the inter-arrival distribution of a b-event.
// Walks the schedules array to find the first row that declares a distribution.
function getInterArrivalLabel(bEvent) {
  if (!bEvent) return null;
  const schedules = Array.isArray(bEvent.schedules) ? bEvent.schedules
    : Array.isArray(bEvent.schedule) ? bEvent.schedule
    : [];
  for (const row of schedules) {
    const distType = row.dist || row.distType || row.distribution?.type || "";
    if (!distType) continue;
    const params = row.distParams || row.params || row.distribution || {};
    switch (String(distType).toLowerCase()) {
      case "exponential": return params.rate   != null ? `Exp(λ=${params.rate})`                        : "Exp";
      case "uniform":     return params.min    != null ? `U(${params.min}, ${params.max})`              : "Uniform";
      case "normal":      return params.mean   != null ? `N(μ=${params.mean}, σ=${params.stdDev})`      : "Normal";
      case "fixed":       return params.value  != null ? `Fixed(${params.value})`                       : "Fixed";
      case "triangular":  return                         `Tri(${params.min}, ${params.mode}, ${params.max})`;
      case "lognormal":   return params.logMean!= null ? `LogN(μ=${params.logMean})`                    : "LogNormal";
      case "empirical":   return params.values != null ? `Empirical(n=${params.values.length})`         : "Empirical";
      default:            return String(distType).charAt(0).toUpperCase() + String(distType).slice(1);
    }
  }
  return null;
}

// Parse customer type from a b-event's ARRIVE(CustomerType, ...) effect.
function parseArriveCustomerType(bEvent) {
  if (!bEvent) return null;
  const effect = bEvent.effect || bEvent.effects || bEvent.schedule || bEvent.action || "";
  let text = "";
  if (typeof effect === "string") {
    text = effect;
  } else if (Array.isArray(effect)) {
    text = effect.map(e => {
      if (typeof e === "string") return e;
      if (e && typeof e === "object") {
        const macro = String(e.macro || e.type || "").toUpperCase();
        const args = Array.isArray(e.args) ? e.args.join(",") : "";
        return `${macro}(${args})`;
      }
      return "";
    }).join(";");
  } else if (typeof effect === "object") {
    const macro = String(effect.macro || effect.type || "").toUpperCase();
    const args = Array.isArray(effect.args) ? effect.args.join(",") : "";
    text = `${macro}(${args})`;
  }
  const match = text.match(/ARRIVE\s*\(\s*([^,)]+)/i);
  return match ? match[1].trim() : null;
}

// Parse the server type (second ASSIGN arg) from a c-event's effect field.
// Handles string, array-of-strings, array-of-objects, and plain-object formats.
function extractServerType(effect) {
  if (!effect) return null;
  let text = "";
  if (typeof effect === "string") {
    text = effect;
  } else if (Array.isArray(effect)) {
    text = effect.map(e => {
      if (typeof e === "string") return e;
      if (e && typeof e === "object") {
        const macro = String(e.macro || e.type || "").toUpperCase();
        const args = Array.isArray(e.args) ? e.args.join(",") : "";
        return `${macro}(${args})`;
      }
      return "";
    }).join(";");
  } else if (typeof effect === "object") {
    const macro = String(effect.macro || effect.type || "").toUpperCase();
    const args = Array.isArray(effect.args) ? effect.args.join(",") : "";
    text = `${macro}(${args})`;
  }
  const match = text.match(/ASSIGN\s*\(\s*[^,)]+,\s*([^),]+)\)/i);
  return match ? match[1].trim() : null;
}

function LiveBadge({ value, label, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{
        background: `${color}22`,
        border: `1px solid ${color}66`,
        borderRadius: 4,
        padding: "2px 6px",
        fontSize: 13,
        fontWeight: 700,
        fontFamily: FONT,
        color,
        minWidth: 20,
        textAlign: "center",
      }}>
        {value}
      </div>
      <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>{label}</span>
    </div>
  );
}

function LiveNodeMetric({ type, live }) {
  if (!live) return null;

  if (type === "queue") {
    const depth = live.depth ?? 0;
    return (
      <LiveBadge
        value={depth}
        label="waiting"
        color={depth > 0 ? C.amber : C.muted}
      />
    );
  }

  if (type === "activity") {
    return (
      <div style={{ display: "flex", gap: 5 }}>
        <LiveBadge
          value={live.busy ?? 0}
          label="busy"
          color={(live.busy ?? 0) > 0 ? C.amber : C.muted}
        />
        <LiveBadge
          value={live.idle ?? 0}
          label="idle"
          color={(live.idle ?? 0) > 0 ? C.green : C.muted}
        />
      </div>
    );
  }

  if (type === "sink") {
    return (
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <LiveBadge value={live.served ?? 0} label="served" color={C.green} />
        {(live.reneged ?? 0) > 0 && (
          <LiveBadge value={live.reneged} label="reneged" color={C.red} />
        )}
      </div>
    );
  }

  if (type === "source" && live.clock != null) {
    return (
      <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>
        t = {typeof live.clock === "number" ? live.clock.toFixed(1) : "—"}
      </div>
    );
  }

  return null;
}

function LiveNode({ data }) {
  const color = NODE_COLOR[data.type] || C.accent;
  const hasTarget = data.type !== "source";
  const hasSource = data.type !== "sink";

  return (
    <div style={{
      width: 160,
      minHeight: 78,
      background: C.surface,
      border: `1.5px solid ${color}44`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 6,
      color: C.text,
      display: "flex",
      flexDirection: "column",
      gap: 5,
      padding: "9px 10px",
      fontFamily: FONT,
      fontSize: 11,
      position: "relative",
    }}>
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 8, height: 8, background: color, borderColor: C.bg, pointerEvents: "none" }}
        />
      )}
      <div style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
        {data.type}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: C.text }}>
        {data.label}
      </div>
      {data.sublabel && !data.liveData && (
        <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.4 }}>{data.sublabel}</div>
      )}
      {data.liveData && (
        <div style={{ marginTop: 2 }}>
          <LiveNodeMetric type={data.type} live={data.liveData} />
        </div>
      )}
      {hasSource && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ width: 8, height: 8, background: color, borderColor: C.bg, pointerEvents: "none" }}
        />
      )}
    </div>
  );
}

const liveNodeTypes = {
  liveNode:      LiveNode,
  sourceNode:    ExecuteSourceNode,
  queueNode:     ExecuteQueueNode,
  activityNode:  ExecuteActivityNode,
  sinkNode:      ExecuteSinkNode,
};

const edgeTypes = { animatedEdge: AnimatedEdge };

const FLOW_NODE_TYPE = { source: "sourceNode", queue: "queueNode", activity: "activityNode", sink: "sinkNode" };

function toFlowNode(node) {
  return {
    id: node.id,
    type: FLOW_NODE_TYPE[node.type] || "liveNode",
    position: { x: node.x || 0, y: node.y || 0 },
    data: node,
    selectable: false,
    draggable: false,
  };
}

function toFlowEdge(edge) {
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
    style: { stroke: C.muted, strokeWidth: 1.5 },
  };
}

export function ExecuteCanvas({
  model, snap, summary,
  animationEnabled = true,
  kpiSlots = DEFAULT_KPI_SLOTS,
  onKpiSlotChange,
  onNodeSelect,
}) {
  const baseGraph = useMemo(() => deriveGraphFromModel(model), [model]);

  // Build c-event id → { serverType, capacity } for activity node enrichment.
  // capacity comes from model.entityTypes[role=server].count (defaults to 1).
  const serverTypeIndex = useMemo(() => {
    const index = new Map();
    for (const ce of model.cEvents || []) {
      const serverType = extractServerType(ce.effect);
      if (!serverType) continue;
      const et = (model.entityTypes || []).find(
        e => e.role === "server" && e.name?.trim().toLowerCase() === serverType.trim().toLowerCase()
      );
      const capacity = parseInt(et?.count ?? "1", 10) || 1;
      index.set(ce.id, { serverType, capacity });
    }
    return index;
  }, [model.cEvents, model.entityTypes]);

  // Build source node id → { bEvent, customerType, interArrivalLabel } for source enrichment
  const sourceIndex = useMemo(() => {
    const index = new Map();
    for (const node of baseGraph.nodes) {
      if (node.type !== "source") continue;
      const bEvent = (model.bEvents || []).find(e => e.id === node.refId);
      if (!bEvent) continue;
      index.set(node.id, {
        bEventId: bEvent.id,
        customerType: parseArriveCustomerType(bEvent),
        interArrivalLabel: getInterArrivalLabel(bEvent),
      });
    }
    return index;
  }, [baseGraph.nodes, model.bEvents]);

  // ── Token animation (F9C.6) ─────────────────────────────────────────────
  const [edgeTokens, setEdgeTokens] = useState({});
  const prevSnapRef = useRef(null);

  useEffect(() => {
    if (!animationEnabled || !snap) {
      prevSnapRef.current = snap;
      return;
    }
    const prev = prevSnapRef.current;
    if (prev) {
      const events = detectRoutingEvents(prev, snap, baseGraph);
      if (events.length > 0) {
        const spawned = events.map(ev => ({ id: nextTokenId(), edgeId: ev.edgeId, color: entityTypeColor(ev.entityType) }));
        setEdgeTokens(prev => {
          const next = { ...prev };
          for (const t of spawned) {
            const existing = next[t.edgeId] || [];
            next[t.edgeId] = [...existing, t].slice(-MAX_TOKENS_PER_EDGE);
          }
          return next;
        });
        const ids = new Set(spawned.map(t => t.id));
        setTimeout(() => {
          setEdgeTokens(prev => {
            const next = { ...prev };
            for (const eid of Object.keys(next)) {
              next[eid] = next[eid].filter(t => !ids.has(t.id));
            }
            return next;
          });
        }, TOKEN_TTL_MS);
      }
    }
    prevSnapRef.current = snap;
  }, [snap, animationEnabled, baseGraph]); // eslint-disable-line react-hooks/exhaustive-deps

  const flowNodes = useMemo(() => {
    const entities = snap?.entities || [];
    const waiting = entities.filter(e => e.status === "waiting");
    const servers = entities.filter(e => e.role === "server");

    return baseGraph.nodes.map(node => {
      let liveData = null;
      if (snap) {
        if (node.type === "queue") {
          const queueEntities = waiting.filter(e => e.queue === node.label);
          const qDef = (model.queues || []).find(q => q.name === node.label);
          liveData = {
            depth: queueEntities.length,
            entities: queueEntities,
            discipline: qDef?.discipline ?? null,
            clock: snap.clock,
          };
        } else if (node.type === "activity") {
          const meta = serverTypeIndex.get(node.refId);
          const serverType = meta?.serverType;
          const capacity   = meta?.capacity ?? 1;
          const relevant   = serverType
            ? servers.filter(e => e.type === serverType)
            : servers;
          const busyCount = relevant.filter(e => e.status === "busy").length;
          const idleCount = relevant.filter(e => e.status === "idle").length;
          liveData = {
            serverTypeName:    serverType ?? null,
            capacity,
            busyCount,
            idleCount,
            utilisation:       capacity > 0 ? (busyCount / capacity) * 100 : 0,
            completionSignal:  snap.served,
          };
        } else if (node.type === "sink") {
          const customers = entities.filter(e => e.role !== "server");
          const withSojourn = customers.filter(e => e.sojournTime != null);
          const meanSojourn = withSojourn.length
            ? withSojourn.reduce((s, e) => s + e.sojournTime, 0) / withSojourn.length
            : null;
          const throughputPerHour = snap.clock > 0
            ? (snap.served / snap.clock) * 60
            : null;
          liveData = {
            served: snap.served ?? 0,
            reneged: snap.reneged ?? 0,
            throughputPerHour,
            meanSojourn,
          };
        } else if (node.type === "source") {
          const src = sourceIndex.get(node.id);
          // arrivalKey: max entity id among this source's customer type.
          // Strictly increases on each arrival, used by ExecuteSourceNode for pulse detection.
          const typeEntities = src?.customerType
            ? entities.filter(e => e.type === src.customerType && e.role !== "server")
            : [];
          const arrivalKey = typeEntities.length
            ? Math.max(...typeEntities.map(e => e.id))
            : 0;
          liveData = {
            clock: snap.clock,
            nextArrivalTime: src?.bEventId != null ? (snap.nextArrivals?.[src.bEventId] ?? null) : null,
            interArrivalLabel: src?.interArrivalLabel ?? null,
            arrivalKey,
          };
        }
      }
      return { ...toFlowNode(node), data: { ...node, liveData } };
    });
  }, [snap, baseGraph.nodes, serverTypeIndex, sourceIndex]);

  const flowEdges = useMemo(() => baseGraph.edges.map(edge => ({
    ...toFlowEdge(edge),
    type: animationEnabled ? "animatedEdge" : undefined,
    data: animationEnabled ? { tokens: edgeTokens[edge.id] || [] } : undefined,
  })), [baseGraph.edges, animationEnabled, edgeTokens]);

  // No derivable nodes — caller renders VisualView fallback
  if (!baseGraph.nodes.length) return null;

  const allEntities = snap?.entities || [];
  const customers = allEntities.filter(e => e.role !== "server");
  const waiting = customers.filter(e => e.status === "waiting");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {summary?.warmupPeriod > 0 && (
        <div style={{
          background: "#78350f22", border: `1px solid ${C.amber}44`, borderRadius: 8,
          padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>WARM-UP DURATION</span>
              <span style={{ fontSize: 14, color: C.amber, fontWeight: 700 }}>{summary.warmupPeriod}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>OBS. EXCLUDED</span>
              <span style={{ fontSize: 14, color: C.reneged, fontWeight: 700 }}>{summary.excludedCount || 0}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>OBS. INCLUDED</span>
              <span style={{ fontSize: 14, color: C.served, fontWeight: 700 }}>{summary.total || 0}</span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, fontFamily: FONT, letterSpacing: 1 }}>
            WARM-UP AUDIT TRAIL
          </div>
        </div>
      )}

      {snap && (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
          <div style={{ background: "#111", border: `2px solid #a855f744`, borderRadius: 12, padding: "20px 28px", textAlign: "center", minWidth: 140 }}>
            <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 2, marginBottom: 6 }}>SIM CLOCK</div>
            <div style={{ fontSize: 42, fontWeight: 300, color: "#fff", fontFamily: FONT, lineHeight: 1 }}>
              {parseFloat(snap.clock).toFixed(0)}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {kpiSlots.slice(0, 4).map((key, i) => (
              <KpiSlot
                key={i}
                metricKey={key}
                snap={snap}
                entities={allEntities}
                onEdit={newKey => onKpiSlotChange?.(i, newKey)}
              />
            ))}
          </div>
        </div>
      )}

      <div
        aria-label="Execute canvas"
        style={{
          height: 480,
          width: "100%",
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={liveNodeTypes}
          edgeTypes={edgeTypes}
          defaultViewport={baseGraph.viewport || { x: 0, y: 0, zoom: 1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnScroll
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => onNodeSelect?.(node.data?.label ?? null)}
          onPaneClick={() => onNodeSelect?.(null)}
        >
          <Background color={C.border} gap={24} size={1} />
          <Controls showInteractive={false} />
          {!snap && (
            <Panel position="bottom-center">
              <div style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 5,
                color: C.muted,
                fontFamily: FONT,
                fontSize: 11,
                padding: "5px 14px",
                pointerEvents: "none",
              }}>
                ▶ Run or step the simulation to see live state
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}
