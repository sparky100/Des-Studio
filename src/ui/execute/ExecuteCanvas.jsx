// ui/execute/ExecuteCanvas.jsx — read-only canvas view for the Execute panel
// Derives graph topology from canonical model_json (same helper as Visual Designer).
// Receives live snap state and overlays queue depths, server busy/idle counts on each node.
// Returns null when the model yields no derivable nodes — caller falls back to VisualView.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
} from "../shared/xyflow.js";
import "@xyflow/react/dist/style.css";
import { TOKEN_COLORS } from "../shared/tokens.js";
import { useFitNodeRef } from "../shared/useFitNodeRef.js";
import { deriveGraphFromModel, searchGraphNodes } from "../visual-designer/graph.js";
import { ExecuteSourceNode }   from "./ExecuteSourceNode.jsx";
import { ExecuteQueueNode }    from "./ExecuteQueueNode.jsx";
import { ExecuteActivityNode } from "./ExecuteActivityNode.jsx";
import { ExecuteSinkNode }     from "./ExecuteSinkNode.jsx";
import { AnimatedEdge }        from "./AnimatedEdge.jsx";
import { formatSimWallTime }   from "../../engine/clockUtils.js";
import { DEFAULT_KPI_SLOTS } from "./execute-constants.js";
import { computeExecuteLayout, EXEC_NODE_WIDTH, EXEC_NODE_HEIGHT } from "./executeLayout.js";
import { SectionPanelNode } from "../visual-designer/SectionPanelNode.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { NodeDetailSidebar } from "./NodeDetailSidebar.jsx";
import { ContainerGaugeStrip } from "./ContainerGaugeStrip.jsx";
import { buildServerTypeIndex, deriveActivityLiveData } from "./activityLiveData.js";
export { DEFAULT_KPI_SLOTS };

// ── Canvas height (maximise-by-default, F9C.9) ───────────────────────────────
const CANVAS_DRAG_MIN = 250;
const CANVAS_DRAG_MAX = 900;
const CANVAS_FILL_FLOOR = 280;
// Space reserved below the canvas for the collapsed BottomPanel bar + layout gap.
const CANVAS_RESERVED_BOTTOM = 64;

/**
 * How tall the canvas should be to fill the remaining viewport below it.
 * Pure so it's directly testable without mounting ReactFlow.
 */
export function computeCanvasFillHeight(topOffset, viewportHeight, reservedBottom = CANVAS_RESERVED_BOTTOM) {
  if (!Number.isFinite(topOffset) || !Number.isFinite(viewportHeight)) return null;
  return Math.max(CANVAS_FILL_FLOOR, viewportHeight - topOffset - reservedBottom);
}

// ── Configurable KPI bar (F9C.7) ─────────────────────────────────────────────

function preferMetricValue(primary, fallback) {
  if (fallback == null) return primary ?? null;
  if (primary == null) return fallback;
  if (primary === 0 && fallback !== 0) return fallback;
  return primary;
}

function resolveKpiValue(key, snap, entities, summary, totals) {
  const customers = entities.filter(e => e.role !== "server");
  const doneCount = customers.filter(e => e.status === "done").length;
  const renegedCount = customers.filter(e => e.status === "reneged").length;
  switch (key) {
    case "arrived": return preferMetricValue(summary?.total, totals?.arrived) ?? customers.length;
    case "served":  return preferMetricValue(summary?.served, totals?.served) ?? doneCount ?? snap.served ?? 0;
    case "reneged": return preferMetricValue(summary?.reneged, totals?.reneged) ?? renegedCount ?? snap.reneged ?? 0;
    case "waiting": return customers.filter(e => e.status === "waiting").length;
    case "clock":   return parseFloat(snap.clock).toFixed(1);
    case "active":  return customers.filter(e => e.status !== "done" && e.status !== "reneged").length;
    case "avgWait": return summary?.avgWait != null ? +summary.avgWait.toFixed(1) : "—";
    default:        return "—";
  }
}

function KpiSlot({ metricKey, snap, entities, summary, totals, onEdit }) {
  const { C, FONT } = useTheme();
  const KPI_METRICS = {
    arrived: { label: "Arrived total", color: C.kpiArr },
    served:  { label: "Served total",  color: C.kpiSvc },
    reneged: { label: "Reneged total", color: C.danger },
    waiting: { label: "Waiting now",   color: C.bEvent },
    clock:   { label: "Sim Clock",     color: C.server },
    active:  { label: "Active now",    color: C.cEvent  },
    avgWait: { label: "Avg wait time", color: C.amber   },
  };
  const [hovered,  setHovered]  = useState(false);
  const [editing,  setEditing]  = useState(false);
  const meta  = KPI_METRICS[metricKey] || { label: metricKey, color: C.muted };
  const value = snap ? resolveKpiValue(metricKey, snap, entities, summary, totals) : "—";

  return (
    <div
      style={{
        background: C.panel, border: `1px solid ${C.border}`,
        borderTop: `3px solid ${meta.color}`,
        borderRadius: 8, padding: "10px 12px",
        textAlign: "center", position: "relative",
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setEditing(false); }}
    >
      {hovered && (
        <button
          aria-label={`Change ${meta.label} slot`}
          onClick={() => setEditing(e => !e)}
          style={{ position: "absolute", top: 4, right: 6, background: "none",
            border: "none", color: C.muted, cursor: "pointer", fontSize: 11, padding: 2, lineHeight: 1 }}
        >
          ✎
        </button>
      )}
      {editing && (
        <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 20,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: 4, minWidth: 120, boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }}>
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
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.8px", marginBottom: 6, fontFamily: FONT }}>
        {meta.label.toUpperCase()}
      </div>
      <div style={{ fontSize: 24, color: meta.color, fontWeight: 700, lineHeight: 1, fontFamily: FONT }}>{value}</div>
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
export function detectRoutingEvents(prevSnap, currSnap, graph) {
  const events = [];
  const prevById = new Map((prevSnap.entities || []).map(e => [e.id, e]));
  const edges = graph.edges || [];
  const nodes = graph.nodes || [];

  const findEdge = (predicate) => edges.find(predicate);
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // Which activity node(s) an entity could just have left, given the queue it
  // joined before starting service (claimServerForEntity sets entity.lastQueue
  // to that queue and never touches it again until the entity's next queue
  // join — see src/engine/entities.js — so it survives unchanged through the
  // whole service/delay duration up to the exact routing/completion moment
  // this function inspects). A queue usually feeds one activity; when several
  // share it this is best-effort (first match) — the same class of
  // imprecision routing branches sharing a destination queue already have.
  const activityIdsFedByQueue = (queueName) => {
    if (!queueName) return [];
    return edges
      .filter(e => e.source === "condition" && nodeById.get(e.from)?.label === queueName)
      .map(e => e.to);
  };

  const pushArrivalEdge = (queueName, entityType) => {
    const edge = findEdge(e =>
      e.source === "arrival" && nodeById.get(e.to)?.label === queueName);
    if (edge) events.push({ edgeId: edge.id, entityType });
  };
  const pushSeizeEdge = (queueName, entityType) => {
    const edge = findEdge(e =>
      e.source === "condition" && nodeById.get(e.from)?.label === queueName);
    if (edge) events.push({ edgeId: edge.id, entityType });
  };

  for (const curr of currSnap.entities || []) {
    if (curr.role === "server") continue;
    const prev = prevById.get(curr.id);
    const wasActive = prev && prev.status !== "waiting" && prev.status !== "done" && prev.status !== "reneged";
    const currActive = curr.status !== "waiting" && curr.status !== "done" && curr.status !== "reneged";

    if (!prev) {
      // New entity arrived → Source → Queue edge. When the entity was seized
      // in its very arrival cycle (Phase B arrives, Phase C claims — the
      // common case on a non-saturated model), `queue` is already deleted and
      // `lastQueue` holds the arrival queue: animate the arrival hop AND the
      // seize hop, since both happened between these two snapshots.
      if (curr.queue) {
        pushArrivalEdge(curr.queue, curr.type);
      } else if (currActive && curr.lastQueue) {
        pushArrivalEdge(curr.lastQueue, curr.type);
        pushSeizeEdge(curr.lastQueue, curr.type);
      }
    } else if (prev.status === "waiting" && curr.status !== "waiting"
               && curr.status !== "done" && curr.status !== "reneged") {
      // Entity seized from queue → Queue → Activity edge
      pushSeizeEdge(prev.queue, curr.type);
    } else if (wasActive && currActive
               && (prev.lastQueue !== curr.lastQueue || prev.serviceStart !== curr.serviceStart)) {
      // Routed AND re-seized within one engine cycle: the snapshot is taken
      // after Phase C, so the intermediate "waiting" state is never observable
      // — the entity goes serving(lastQueue=Q1) → serving(lastQueue=Q2)
      // directly. This is the dominant case on any non-saturated model.
      // A changed serviceStart with an unchanged lastQueue is a loop-back to
      // the same queue (re-claim resets serviceStart — engine/entities.js).
      const activityIds = activityIdsFedByQueue(prev.lastQueue ?? prev.queue);
      const destQueue = curr.lastQueue;
      const routingEdge = findEdge(e => e.source === "routing" && activityIds.includes(e.from)
                              && nodeById.get(e.to)?.label === destQueue)
        || findEdge(e => e.source === "routing" && nodeById.get(e.to)?.label === destQueue);
      if (routingEdge) events.push({ edgeId: routingEdge.id, entityType: curr.type });
      pushSeizeEdge(destQueue, curr.type);
    } else if (wasActive && curr.status === "waiting" && curr.queue) {
      // Entity routed onward to another queue (plain RELEASE, conditional
      // routing[], or probabilisticRouting[]) → Activity → Queue "routing" edge
      const activityIds = activityIdsFedByQueue(prev.lastQueue ?? prev.queue);
      const edge = findEdge(e => e.source === "routing" && activityIds.includes(e.from)
                              && nodeById.get(e.to)?.label === curr.queue)
        // Best-effort fallback only if activity-scoping resolves nothing — this
        // closes a previously-zero-events case, so any correct-destination
        // match is an improvement over no token at all.
        || findEdge(e => e.source === "routing" && nodeById.get(e.to)?.label === curr.queue);
      if (edge) events.push({ edgeId: edge.id, entityType: curr.type });
    } else if (wasActive && (curr.status === "done" || curr.status === "reneged")) {
      // Entity completed after being served/delayed → Activity → Sink edge,
      // scoped to the activity it actually left. No unscoped fallback here —
      // an entity reneging directly out of a queue (never entering an
      // activity) has no edge to animate and correctly produces no token.
      const activityIds = activityIdsFedByQueue(prev.lastQueue ?? prev.queue);
      const edge = findEdge(e => e.source === "terminal" && activityIds.includes(e.from));
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

function LiveBadge({ value, label, color }) {
  const { C, FONT } = useTheme();
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
  const { C, FONT } = useTheme();
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

  if (type === "container" && live.level != null) {
    // Same fill-ratio thresholds as ContainerGaugeStrip.jsx's levelColor —
    // ≥100% red, ≥85% amber, else accent (distinct from the 90/70 red/amber/
    // green scheme used for resource utilisation elsewhere on this canvas).
    const hasCapacity = Number.isFinite(live.capacity) && live.capacity > 0;
    const fillRatio = hasCapacity ? live.level / live.capacity : null;
    const color = fillRatio == null ? C.accent : fillRatio >= 1 ? C.red : fillRatio >= 0.85 ? C.amber : C.accent;
    return (
      <LiveBadge
        value={hasCapacity ? `${live.level.toFixed(0)}/${live.capacity.toFixed(0)}` : live.level.toFixed(0)}
        label="level"
        color={color}
      />
    );
  }

  return null;
}

function LiveNode({ data }) {
  const { C, FONT } = useTheme();
  const NODE_COLOR = { source: C.green, queue: C.cEvent, activity: C.purple, sink: C.red };
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
  sectionPanel:  SectionPanelNode,
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

function toFlowEdge(edge, C) {
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
    style: { stroke: C.muted, strokeWidth: 1.5 },
  };
}

// Rendered inside <ReactFlow> so it can wire `fitNodeRef` via useReactFlow(),
// and hosts the node-search box + (optional) Sections toggle in one top-left panel.
function ExecuteCanvasToolbar({
  fitNodeRef,
  nodeSearchQuery,
  onSearchChange,
  onSearchKeyDown,
  searchMatches,
  onSelectResult,
  hasSections,
  showSections,
  onToggleSections,
}) {
  const { C, FONT } = useTheme();
  useFitNodeRef({ fitNodeRef, defaultWidth: EXEC_NODE_WIDTH, defaultHeight: 120 });

  return (
    <Panel position="top-left" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative" }}>
        <input
          type="search"
          aria-label="Search canvas nodes"
          placeholder="Find a node…"
          value={nodeSearchQuery}
          onChange={onSearchChange}
          onKeyDown={onSearchKeyDown}
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            color: C.text,
            fontFamily: FONT,
            fontSize: 11,
            padding: "5px 8px",
            width: 160,
          }}
        />
        {nodeSearchQuery.trim() && (
          <div
            role="listbox"
            aria-label="Node search results"
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              left: 0,
              maxHeight: 220,
              overflowY: "auto",
              position: "absolute",
              top: "calc(100% + 4px)",
              width: 220,
              zIndex: 20,
            }}
          >
            {searchMatches.length === 0 ? (
              <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11, padding: "8px 10px" }}>
                No matching nodes.
              </div>
            ) : (
              <>
                {searchMatches.slice(0, 8).map(node => (
                  <div
                    key={node.id}
                    role="option"
                    onClick={() => onSelectResult(node)}
                    style={{ color: C.text, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "6px 10px" }}
                  >
                    <span>{node.label}</span>
                    <span style={{ color: C.muted, marginLeft: 6, fontSize: 10 }}>{node.type}</span>
                  </div>
                ))}
                {searchMatches.length > 8 && (
                  <div style={{ color: C.muted, fontFamily: FONT, fontSize: 10, padding: "4px 10px" }}>
                    +{searchMatches.length - 8} more
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {hasSections && (
        <button
          type="button"
          aria-pressed={showSections}
          onClick={onToggleSections}
          title={showSections ? "Hide section overlays" : "Show section overlays"}
          style={{
            background: showSections ? `${C.accent}22` : C.surface,
            border: `1px solid ${showSections ? C.accent : C.border}`,
            borderRadius: 4,
            color: showSections ? C.accent : C.muted,
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 10,
            fontWeight: 700,
            padding: "5px 9px",
          }}
        >
          Sections
        </button>
      )}
    </Panel>
  );
}

export function ExecuteCanvas({
  model, snap, summary,
  animationEnabled = true,
  kpiSlots = DEFAULT_KPI_SLOTS,
  onKpiSlotChange,
  onNodeSelect,
  selectedNodeDetail,
  onNodeDetailSelect,
  onEntitySelect,
  batchActive = false,
}) {
  const { C, FONT } = useTheme();
  const baseGraph = useMemo(() => deriveGraphFromModel(model), [model]);
  // Ref set by ExecuteCanvasToolbar (inside ReactFlow) to expose fitView for specific nodes
  const fitNodeRef = useRef(null);
  const [nodeSearchQuery, setNodeSearchQuery] = useState("");
  const searchMatches = useMemo(() => searchGraphNodes(baseGraph.nodes, nodeSearchQuery), [baseGraph.nodes, nodeSearchQuery]);
  const matchedNodeIds = useMemo(() => new Set(searchMatches.map(n => n.id)), [searchMatches]);
  const cumulativeGraphTotals = useMemo(() => {
    if (!snap) return { arrived: 0, served: 0, reneged: 0 };
    const eventCounts = snap.eventCounts || {};
    const sourceRefs = new Set(
      (baseGraph.nodes || [])
        .filter(node => node.type === "source" && node.refId)
        .map(node => node.refId)
    );
    const sinkRefs = new Set(
      (baseGraph.nodes || [])
        .filter(node => node.type === "sink" && node.refId)
        .map(node => node.refId)
    );
    const arrived = [...sourceRefs].reduce((sum, refId) => sum + (eventCounts[refId] || 0), 0);
    const served = [...sinkRefs].reduce((sum, refId) => sum + (eventCounts[refId] || 0), 0);
    return { arrived, served, reneged: snap.reneged ?? 0 };
  }, [baseGraph.nodes, snap]);
  // Height: auto-fill the viewport by default; a manual drag overrides and is
  // remembered (des.canvas.height), matching how BottomPanel persists its height.
  const canvasWrapRef = useRef(null);
  const [autoFillHeight, setAutoFillHeight] = useState(null);
  const [userCanvasHeight, setUserCanvasHeight] = useState(() => {
    try {
      const stored = parseInt(localStorage.getItem("des.canvas.height") || "", 10);
      return Number.isFinite(stored) ? Math.max(CANVAS_DRAG_MIN, Math.min(CANVAS_DRAG_MAX, stored)) : null;
    } catch { return null; }
  });
  const canvasHeight = userCanvasHeight ?? autoFillHeight ?? 480;
  const [showSections, setShowSections] = useState(() => {
    try { return localStorage.getItem("des.sections.show") !== "0"; } catch { return true; }
  });
  const [focusedSectionId, setFocusedSectionId] = useState(null);
  const dragStateRef = useRef(null);

  useEffect(() => { if (!showSections) setFocusedSectionId(null); }, [showSections]);

  // Restore the viewport the user last had on the Draw canvas, so switching
  // Design → Run shows the model at the same place and scale. Both canvases
  // share coordinates (computeExecuteLayout preserves saved Draw positions).
  // The key is per-browser, so a first visit or another device falls back to
  // fit-all. Run never writes this key — Draw owns it.
  const drawViewport = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(`des.vp.${model?.id}`) || "null"); } catch { return null; }
  }, [model?.id]);

  const hasSnap = Boolean(snap);
  useLayoutEffect(() => {
    const measure = () => {
      const el = canvasWrapRef.current;
      if (!el) return;
      setAutoFillHeight(computeCanvasFillHeight(el.getBoundingClientRect().top, window.innerHeight));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [hasSnap]);

  useEffect(() => {
    const pointerY = (event) => (event.touches ? event.touches[0]?.clientY : event.clientY);
    const handlePointerMove = (event) => {
      if (!dragStateRef.current) return;
      const y = pointerY(event);
      if (y == null) return;
      const nextHeight = Math.max(CANVAS_DRAG_MIN, Math.min(CANVAS_DRAG_MAX, dragStateRef.current.startHeight + (y - dragStateRef.current.startY)));
      dragStateRef.current.lastHeight = nextHeight;
      setUserCanvasHeight(nextHeight);
    };
    const handlePointerUp = () => {
      if (dragStateRef.current?.lastHeight != null) {
        try { localStorage.setItem("des.canvas.height", String(dragStateRef.current.lastHeight)); } catch { /* storage unavailable (private mode) — non-critical */ }
      }
      dragStateRef.current = null;
    };
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchmove", handlePointerMove);
    window.addEventListener("touchend", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, []);

  const startResize = (event) => {
    event.preventDefault();
    const startY = event.touches ? event.touches[0]?.clientY : event.clientY;
    if (startY == null) return;
    dragStateRef.current = { startY, startHeight: canvasHeight };
  };

  // Jump to a node picked from the search results dropdown: pan/select it,
  // expand its section overlay if collapsed, and sync the same selection
  // state a direct node click would (drives BottomPanel's log filter + sidebar).
  const selectSearchResult = (node) => {
    fitNodeRef.current?.(node.id);
    setFocusedSectionId(node.sectionId ?? null);
    onNodeSelect?.(node.label ?? null);
    if (node.type === "queue" || node.type === "activity") {
      onNodeDetailSelect?.({
        nodeType: node.type === "queue" ? "queueNode" : "activityNode",
        label: node.label ?? null,
        refId: node.refId ?? null,
      });
    }
    setNodeSearchQuery("");
  };

  // Build c-event id → { serverTypes, capacities, ceventName } for activity node enrichment.
  const serverTypeIndex = useMemo(
    () => buildServerTypeIndex(model.cEvents, model.entityTypes),
    [model.cEvents, model.entityTypes]
  );

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

  const layoutedNodes = useMemo(
    () => computeExecuteLayout(baseGraph.nodes, baseGraph.edges),
    [baseGraph.nodes, baseGraph.edges]
  );

  // Lookup used for edge dimming — keyed by graph node id
  const nodeById = useMemo(() => new Map(layoutedNodes.map(n => [n.id, n])), [layoutedNodes]);

  // Bounding-box panels for each section, computed from execute-layout positions.
  // Cannot reuse graph.sectionPanels — those use design-canvas (smaller, uniform) dimensions.
  const sectionPanels = useMemo(() => {
    if (!showSections || !(model.sections?.length)) return [];
    const SECTION_PAD = 24;
    const SECTION_LABEL_H = 22;
    return model.sections.map(sec => {
      const members = layoutedNodes.filter(n => n.sectionId === sec.id);
      if (!members.length) return null;
      const minX = Math.min(...members.map(n => n.x));
      const minY = Math.min(...members.map(n => n.y));
      const maxX = Math.max(...members.map(n => n.x + EXEC_NODE_WIDTH));
      const maxY = Math.max(...members.map(n => n.y + (EXEC_NODE_HEIGHT[n.type] ?? 120)));
      return {
        id: `section-panel:${sec.id}`,
        sectionId: sec.id,
        name: sec.name || sec.id,
        color: sec.color || "#888",
        x: minX - SECTION_PAD,
        y: minY - SECTION_PAD - SECTION_LABEL_H,
        width: (maxX - minX) + SECTION_PAD * 2,
        height: (maxY - minY) + SECTION_PAD * 2 + SECTION_LABEL_H,
      };
    }).filter(Boolean);
  }, [showSections, model.sections, layoutedNodes]);

  const flowNodes = useMemo(() => {
    const entities = snap?.entities || [];
    const waiting = entities.filter(e => e.status === "waiting");

    const mapped = layoutedNodes.map(node => {
      let liveData = null;
      if (snap) {
        if (node.type === "queue") {
          const queueEntities = waiting.filter(e => e.queue === node.label);
          const qDef = (model.queues || []).find(q => q.name === node.label);
          const cap = qDef?.capacity ? parseInt(qDef.capacity, 10) : null;
          liveData = {
            depth: queueEntities.length,
            capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
            entities: queueEntities,
            discipline: qDef?.discipline ?? null,
            clock: snap.clock,
          };
        } else if (node.type === "activity") {
          liveData = deriveActivityLiveData(snap, node.refId, serverTypeIndex, model);
        } else if (node.type === "sink") {
          const customers = entities.filter(e => e.role !== "server");
          const withSojourn = customers.filter(e => e.sojournTime != null);
          const meanSojourn = withSojourn.length
            ? withSojourn.reduce((s, e) => s + e.sojournTime, 0) / withSojourn.length
            : null;
          const throughputPerHour = snap.clock > 0
            ? (snap.served / snap.clock) * 60
            : null;
          // Per-sink count from eventCounts (B-Event fire count for COMPLETE/RENEGE)
          const sinkFireCount = node.refId ? (snap.eventCounts?.[node.refId] ?? 0) : 0;
          liveData = {
            served: sinkFireCount,
            reneged: 0,
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
        } else if (node.type === "container") {
          // Mirrors ContainerGaugeStrip.jsx's own data resolution: live level/
          // capacity from snap.containers when available, falling back to the
          // container type's static initialLevel/capacity before the first
          // FILL/DRAIN.
          const live = snap.containers?.[node.refId];
          const ct = (model.containerTypes || []).find(c => c.id === node.refId);
          const level = live?.level ?? (ct?.initialLevel != null ? Number(ct.initialLevel) : 0);
          const capacity = live?.capacity ?? (ct?.capacity != null ? Number(ct.capacity) : null);
          liveData = { level, capacity: Number.isFinite(capacity) ? capacity : null };
        }
      }
      const dimmed = (showSections && focusedSectionId != null && node.sectionId !== focusedSectionId) ||
        (matchedNodeIds.size > 0 && !matchedNodeIds.has(node.id));
      return {
        ...toFlowNode(node),
        data: { ...node, liveData },
        style: { opacity: dimmed ? 0.15 : 1, transition: "opacity 200ms" },
      };
    });

    if (showSections && sectionPanels.length) {
      const panelFlowNodes = sectionPanels.map(panel => ({
        id: panel.id,
        type: "sectionPanel",
        position: { x: panel.x, y: panel.y },
        width: panel.width,
        height: panel.height,
        data: {
          ...panel,
          isFocused: focusedSectionId === panel.sectionId,
          onToggleFocus: () => setFocusedSectionId(id => id === panel.sectionId ? null : panel.sectionId),
        },
        selectable: false,
        draggable: false,
        focusable: false,
        style: { width: panel.width, height: panel.height },
      }));
      return [...panelFlowNodes, ...mapped];
    }

    return mapped;
  }, [snap, layoutedNodes, serverTypeIndex, sourceIndex, showSections, focusedSectionId, sectionPanels, matchedNodeIds]);

  const flowEdges = useMemo(() => baseGraph.edges.map(edge => {
    const base = {
      ...toFlowEdge(edge, C),
      type: animationEnabled ? "animatedEdge" : undefined,
      data: animationEnabled ? { tokens: edgeTokens[edge.id] || [] } : undefined,
    };
    if (showSections && focusedSectionId != null) {
      const fromNode = nodeById.get(edge.from);
      const toNode = nodeById.get(edge.to);
      if (fromNode?.sectionId !== focusedSectionId && toNode?.sectionId !== focusedSectionId) {
        return { ...base, style: { ...base.style, opacity: 0.08, transition: "opacity 200ms" } };
      }
    }
    return base;
  }), [baseGraph.edges, animationEnabled, edgeTokens, C, showSections, focusedSectionId, nodeById]);

  // No derivable nodes — caller renders VisualView fallback
  if (!baseGraph.nodes.length) return null;

  const allEntities = snap?.entities || [];
  const customers = allEntities.filter(e => e.role !== "server");
  const waiting = customers.filter(e => e.status === "waiting");
  const wallClock = model?.epoch && snap?.clock != null
    ? formatSimWallTime(snap.clock, model.epoch, model.timeUnit || "minutes")
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {snap && (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "stretch" }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.purple}`, borderRadius: 8, padding: "10px 14px", textAlign: "center", minWidth: 110, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: "0.8px", fontWeight: 600, marginBottom: 6 }}>SIM CLOCK</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.purple, fontFamily: FONT, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
              {parseFloat(snap.clock).toFixed(0)}
            </div>
            {wallClock && (
              <div style={{ marginTop: 5, fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.4 }}>
                {wallClock}
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10 }}>
            {kpiSlots.slice(0, 5).map((key, i) => (
              <KpiSlot
                key={i}
                metricKey={key}
                snap={snap}
                entities={allEntities}
                summary={summary}
                totals={cumulativeGraphTotals}
                onEdit={newKey => onKpiSlotChange?.(i, newKey)}
              />
            ))}
          </div>
        </div>
      )}

      {snap?.containers && Object.keys(snap.containers).length > 0 && (
        <ContainerGaugeStrip containers={snap.containers} model={model} />
      )}

      <div
        ref={canvasWrapRef}
        aria-label="Execute canvas"
        style={{
          height: canvasHeight,
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
          {...(drawViewport
            ? { defaultViewport: drawViewport }
            : { fitView: true, fitViewOptions: { padding: 0.18, duration: 0 } })}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnScroll
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            if (node.type === "sectionPanel") return;
            onNodeSelect?.(node.data?.label ?? null);
            if (node.type === "queueNode" || node.type === "activityNode" || node.type === "queue" || node.type === "activity") {
              onNodeDetailSelect?.({
                nodeType: node.type === "queue" ? "queueNode" : node.type === "activity" ? "activityNode" : node.type,
                label: node.data?.label ?? node.label ?? null,
                refId: node.refId ?? node.data?.refId ?? null,
              });
            }
          }}
          onPaneClick={() => { setFocusedSectionId(null); onNodeSelect?.(null); onNodeDetailSelect?.(null); }}
        >
          <Background color={C.border} gap={24} size={1} />
          <Controls showInteractive={false} />
          <ExecuteCanvasToolbar
            fitNodeRef={fitNodeRef}
            nodeSearchQuery={nodeSearchQuery}
            onSearchChange={ev => setNodeSearchQuery(ev.target.value)}
            onSearchKeyDown={ev => {
              if (ev.key === "Enter" && searchMatches.length === 1) {
                selectSearchResult(searchMatches[0]);
              } else if (ev.key === "Escape") {
                setNodeSearchQuery("");
              }
            }}
            searchMatches={searchMatches}
            onSelectResult={selectSearchResult}
            hasSections={(model.sections?.length ?? 0) > 0}
            showSections={showSections}
            onToggleSections={() => setShowSections(prev => {
              const next = !prev;
              try { localStorage.setItem("des.sections.show", next ? "1" : "0"); } catch { /* storage unavailable (private mode) — non-critical */ }
              return next;
            })}
          />
        </ReactFlow>
        <NodeDetailSidebar
          selectedNode={selectedNodeDetail}
          onClose={() => onNodeDetailSelect?.(null)}
          onEntitySelect={onEntitySelect}
          snap={snap}
          serverTypeIndex={serverTypeIndex}
          model={model}
        />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize canvas"
        onMouseDown={startResize}
        onTouchStart={startResize}
        style={{
          height: 10,
          cursor: "ns-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 4,
        }}
      >
        <div style={{ width: 44, height: 3, borderRadius: 999, background: C.border }} />
      </div>
    </div>
  );
}
