// ui/execute/ExecuteQueueNode.jsx — live Queue node for the Execute canvas
// Registered as nodeType "queueNode" in ExecuteCanvas.
// data.liveData shape: { depth, entities, discipline, clock, renegeBalkPulse }
// renegeBalkPulse ({ status, key } | null) is set for one detectRoutingEvents
// diff tick when an entity reneges/balks straight out of this queue (never
// entering an activity, so there's no edge to animate a token along instead).
import { useEffect, useRef, useState } from "react";
import { Handle, Position } from "../shared/xyflow.js";
import { TOKEN_COLORS } from "../shared/tokens.js";
import { useTheme } from "../shared/ThemeContext.jsx";
import { Sparkline } from "./Sparkline.jsx";
import { EXEC_CARD_HEIGHT } from "./executeLayout.js";

const MAX_DOT_SHOWN = 8;
const HISTORY_LEN   = 20;
const PULSE_DURATION_MS = 500;

function depthColor(depth, C) {
  if (depth === 0) return C.green;
  if (depth <= 3)  return C.amber;
  return C.red;
}

function typeColor(typeName) {
  let hash = 0;
  for (const ch of String(typeName || "")) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return TOKEN_COLORS[Math.abs(hash) % TOKEN_COLORS.length];
}

function DisciplineBadge({ discipline }) {
  const { C, FONT } = useTheme();
  const QUEUE_COLOR = C.cEvent;
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

function DepthBadge({ depth, capacity }) {
  const { C, FONT } = useTheme();
  const color = capacity ? (depth >= capacity ? C.red : depthColor(depth, C)) : depthColor(depth, C);
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
        {capacity ? `${depth}/${capacity}` : depth}
      </div>
      <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>
        {capacity ? "capacity" : "waiting"}
      </span>
    </div>
  );
}

// Names the entity type(s) currently waiting — dot color alone (typeColor())
// plus a hover-only title were the only way to tell types apart before this;
// a queue is conventionally single-type (Queue.customerType) but that's a UI
// convention, not an engine-enforced constraint, so this renders one pill per
// distinct type actually present rather than assuming just one.
function EntityTypeLabels({ entities }) {
  const { FONT } = useTheme();
  const types = [...new Set(entities.map(e => e.type))];
  if (types.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
      {types.map(type => {
        const color = typeColor(type);
        return (
          <div key={type} style={{
            background: `${color}18`,
            border: `1px solid ${color}44`,
            borderRadius: 3,
            color,
            fontFamily: FONT,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 0.8,
            padding: "1px 5px",
            flexShrink: 0,
          }}>
            {type}
          </div>
        );
      })}
    </div>
  );
}

function EntityDots({ entities }) {
  const { C, FONT } = useTheme();
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

export function ExecuteQueueNode({ data }) {
  const { C, FONT } = useTheme();
  const QUEUE_COLOR = C.cEvent;
  const live = data.liveData;
  const [history, setHistory] = useState([]);
  const lastClockRef = useRef(null);

  // Renege/balk pulse — mirrors ExecuteSourceNode's arrival-pulse detection
  // exactly (strictly-increasing key watched via useEffect, brief colored
  // glow). Skips on initial mount so the node doesn't flash when the sim is
  // loaded mid-run.
  const [pulse, setPulse] = useState(null); // { status } | null while flashing
  const prevPulseKeyRef = useRef(null);
  const pulseTimerRef = useRef(null);

  useEffect(() => {
    const p = live?.renegeBalkPulse;
    const key = p?.key ?? null;
    if (key !== null && prevPulseKeyRef.current !== null && key > prevPulseKeyRef.current) {
      setPulse({ status: p.status });
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setPulse(null), PULSE_DURATION_MS);
    }
    if (key !== null) prevPulseKeyRef.current = key;
  }, [live?.renegeBalkPulse?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
  }, []);

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
  const capacity   = live?.capacity ?? null;
  const color      = capacity ? (depth >= capacity ? C.red : depthColor(depth, C)) : depthColor(depth, C);
  const entities   = live?.entities ?? [];
  const discipline = live?.discipline ?? null;
  const pulseColor = pulse?.status === "reneged" ? C.reneged : pulse?.status === "balked" ? C.balked : null;

  return (
    <div style={{
      width: 160,
      height: EXEC_CARD_HEIGHT,
      overflow: "hidden",
      background: C.surface,
      border: `1.5px solid ${pulseColor ?? `${QUEUE_COLOR}44`}`,
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
      transition: `border-color ${PULSE_DURATION_MS}ms ease-out, box-shadow ${PULSE_DURATION_MS}ms ease-out`,
      boxShadow: pulseColor ? `0 0 14px ${pulseColor}55` : "none",
    }}>
      {/* Renege/balk flash overlay — mirrors ExecuteSourceNode's arrival flash */}
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: 6,
        background: `${pulseColor ?? "transparent"}${pulseColor ? "1a" : ""}`,
        transition: `background ${PULSE_DURATION_MS}ms ease-out`,
        pointerEvents: "none",
      }} />

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

      {pulse && (
        // Positioned inside the card's bounds (not floating above the top
        // edge like the arrival badge elsewhere) — the card now clips to a
        // fixed height (overflow: hidden), so anything placed outside its
        // box would be invisible.
        <div style={{
          position: "absolute", top: 4, right: 8,
          background: pulseColor, color: C.bg,
          borderRadius: 4, padding: "1px 6px",
          fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
          fontFamily: FONT,
        }}>
          {pulse.status}
        </div>
      )}

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

      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: C.text }}>
        {data.label}
      </div>

      {live ? (
        <DepthBadge depth={depth} capacity={capacity} />
      ) : (
        <div style={{ fontSize: 9, color: C.muted }}>—</div>
      )}

      {entities.length > 0 && <EntityTypeLabels entities={entities} />}
      {entities.length > 0 && <EntityDots entities={entities} />}

      {history.length >= 2 && (
        <div style={{ marginTop: 3 }}>
          <Sparkline history={history} color={QUEUE_COLOR} />
        </div>
      )}
    </div>
  );
}
