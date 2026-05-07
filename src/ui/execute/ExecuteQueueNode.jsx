// ui/execute/ExecuteQueueNode.jsx — live Queue node for the Execute canvas
// Registered as nodeType "queueNode" in ExecuteCanvas.
// data.liveData shape: { depth, entities, discipline, clock }
import { useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { C, FONT, TOKEN_COLORS } from "../shared/tokens.js";

const QUEUE_COLOR   = C.cEvent;   // "#06b6d4" — matches authoring-mode Queue node
const MAX_DOT_SHOWN = 8;
const HISTORY_LEN   = 20;
const SPARKLINE_W   = 138;
const SPARKLINE_H   = 22;

function depthColor(depth) {
  if (depth === 0) return C.green;
  if (depth <= 3)  return C.amber;
  return C.red;
}

// Stable entity-type colour: hash the type name to a palette slot so the
// same entity type always gets the same colour regardless of entity ID.
function typeColor(typeName) {
  let hash = 0;
  for (const ch of String(typeName || "")) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return TOKEN_COLORS[Math.abs(hash) % TOKEN_COLORS.length];
}

function DisciplineBadge({ discipline }) {
  if (!discipline) return null;
  return (
    <div style={{
      background: `${QUEUE_COLOR}18`,
      border: `1px solid ${QUEUE_COLOR}44`,
      borderRadius: 3,
      color: QUEUE_COLOR,
      fontFamily: FONT,
      fontSize: 8,
      fontWeight: 700,
      letterSpacing: 0.8,
      padding: "1px 5px",
      textTransform: "uppercase",
      flexShrink: 0,
    }}>
      {discipline}
    </div>
  );
}

function DepthBadge({ depth }) {
  const color = depthColor(depth);
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <div style={{
        background: `${color}18`,
        border: `1px solid ${color}55`,
        borderRadius: 5,
        color,
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: 700,
        lineHeight: 1,
        minWidth: 28,
        padding: "3px 7px",
        textAlign: "center",
      }}>
        {depth}
      </div>
      <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>waiting</span>
    </div>
  );
}

function EntityDots({ entities }) {
  const visible = entities.slice(0, MAX_DOT_SHOWN);
  const overflow = entities.length - visible.length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
      {visible.map(e => (
        <div
          key={e.id}
          title={`#${e.id} ${e.type}`}
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: typeColor(e.type),
            flexShrink: 0,
          }}
        />
      ))}
      {overflow > 0 && (
        <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>
          +{overflow}
        </span>
      )}
    </div>
  );
}

function Sparkline({ history }) {
  if (history.length < 2) {
    return (
      <div style={{
        width: SPARKLINE_W,
        height: SPARKLINE_H,
        borderTop: `1px dashed ${QUEUE_COLOR}33`,
      }} />
    );
  }
  const max = Math.max(...history, 1);
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * SPARKLINE_W;
    const y = SPARKLINE_H - 2 - (v / max) * (SPARKLINE_H - 4);
    return [x, y];
  });
  const linePts = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fillPts = [
    ...pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`),
    `${SPARKLINE_W},${SPARKLINE_H}`,
    `0,${SPARKLINE_H}`,
  ].join(" ");

  return (
    <svg
      width={SPARKLINE_W}
      height={SPARKLINE_H}
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      <polygon points={fillPts} fill={QUEUE_COLOR} fillOpacity={0.1} />
      <polyline
        points={linePts}
        fill="none"
        stroke={QUEUE_COLOR}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ExecuteQueueNode({ data }) {
  const live = data.liveData;
  const [history, setHistory] = useState([]);
  const lastClockRef = useRef(null);

  // Record depth at every clock tick; reset history when clock rewinds (sim reset).
  useEffect(() => {
    if (live == null) {
      setHistory([]);
      lastClockRef.current = null;
      return;
    }
    const depth = live.depth ?? 0;
    const clock = live.clock ?? 0;
    if (lastClockRef.current !== null && clock < lastClockRef.current) {
      setHistory([depth]);
    } else {
      setHistory(prev => {
        const next = [...prev, depth];
        return next.length > HISTORY_LEN ? next.slice(-HISTORY_LEN) : next;
      });
    }
    lastClockRef.current = clock;
  }, [live?.clock]); // eslint-disable-line react-hooks/exhaustive-deps

  const depth      = live?.depth ?? 0;
  const color      = depthColor(depth);
  const entities   = live?.entities ?? [];
  const discipline = live?.discipline ?? null;

  return (
    <div style={{
      width: 160,
      background: C.surface,
      border: `1.5px solid ${QUEUE_COLOR}44`,
      borderLeft: `4px solid ${QUEUE_COLOR}`,
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
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 8, height: 8, background: QUEUE_COLOR, borderColor: C.bg, pointerEvents: "none" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 8, height: 8, background: QUEUE_COLOR, borderColor: C.bg, pointerEvents: "none" }}
      />

      {/* Header: type label + discipline badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        <div style={{
          color: QUEUE_COLOR,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}>
          queue
        </div>
        <DisciplineBadge discipline={discipline} />
      </div>

      {/* Queue name */}
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: C.text }}>
        {data.label}
      </div>

      {/* Depth badge */}
      {live ? (
        <DepthBadge depth={depth} />
      ) : (
        <div style={{ fontSize: 9, color: C.muted }}>—</div>
      )}

      {/* Entity token dots */}
      {entities.length > 0 && <EntityDots entities={entities} />}

      {/* Sparkline — shown once we have at least 2 data points */}
      {history.length >= 2 && (
        <div style={{ marginTop: 3 }}>
          <Sparkline history={history} />
        </div>
      )}
    </div>
  );
}
