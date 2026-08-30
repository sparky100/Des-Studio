// ui/execute/ExecuteContainerNode.jsx — live Container (tank/buffer) node for the Execute canvas
// Registered as nodeType "containerNode" in ExecuteCanvas. Mirrors ExecuteQueueNode.jsx's
// badge + sparkline pattern so containers get the same inline live display queues already
// have, instead of the previous bare single-badge fallback (LiveNode/LiveNodeMetric) plus a
// separate, duplicate ContainerGaugeStrip panel above the canvas.
// data.liveData shape: { level, capacity, clock }
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../shared/ThemeContext.jsx";
import { Sparkline } from "./Sparkline.jsx";
import { EXEC_CARD_HEIGHT } from "./executeLayout.js";

const HISTORY_LEN = 20;

// Same fill-ratio thresholds ContainerGaugeStrip.jsx used — ≥100% red, ≥85% amber,
// else accent (distinct from the 90/70 red/amber/green scheme used for resource
// utilisation elsewhere on this canvas).
function levelColor(level, capacity, C) {
  if (!Number.isFinite(capacity) || capacity <= 0) return C.accent;
  if (level >= capacity) return C.red;
  if (level >= capacity * 0.85) return C.amber;
  return C.accent;
}

function LevelBadge({ level, capacity, color }) {
  const { C, FONT } = useTheme();
  const hasCapacity = Number.isFinite(capacity) && capacity > 0;
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
        {hasCapacity ? `${level.toFixed(0)}/${capacity.toFixed(0)}` : level.toFixed(0)}
      </div>
      <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>
        {hasCapacity ? "capacity" : "level"}
      </span>
    </div>
  );
}

export function ExecuteContainerNode({ data }) {
  const { C, FONT } = useTheme();
  const CONTAINER_COLOR = C.amber;
  const live = data.liveData;
  const [history, setHistory] = useState([]);
  const lastClockRef = useRef(null);

  useEffect(() => {
    if (live == null) {
      setHistory([]);
      lastClockRef.current = null;
      return;
    }
    const level = live.level ?? 0;
    const clock = live.clock ?? 0;
    if (lastClockRef.current !== null && clock < lastClockRef.current) {
      // Clock went backward — a new run started; restart history instead of
      // appending, same as ExecuteQueueNode.
      setHistory([level]);
    } else {
      setHistory(prev => {
        const next = [...prev, level];
        return next.length > HISTORY_LEN ? next.slice(-HISTORY_LEN) : next;
      });
    }
    lastClockRef.current = clock;
  }, [live?.clock]); // eslint-disable-line react-hooks/exhaustive-deps

  const level    = live?.level ?? 0;
  const capacity = live?.capacity ?? null;
  const color    = levelColor(level, capacity, C);

  return (
    <div style={{
      width: 160,
      height: EXEC_CARD_HEIGHT,
      overflow: "hidden",
      background: C.surface,
      border: `1.5px solid ${CONTAINER_COLOR}44`,
      borderLeft: `4px solid ${CONTAINER_COLOR}`,
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
      {/* Containers are non-spatial state with no upstream/downstream flow edges
          (see graph.js's container node building) — no handles, matching the
          design-time canvas's DesNode, which special-cases container the same way. */}
      <div style={{
        color: CONTAINER_COLOR,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}>
        container
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: C.text }}>
        {data.label}
      </div>

      {live ? (
        <LevelBadge level={level} capacity={capacity} color={color} />
      ) : (
        <div style={{ fontSize: 9, color: C.muted }}>—</div>
      )}

      {history.length >= 2 && (
        <div style={{ marginTop: 3 }}>
          <Sparkline history={history} color={color} />
        </div>
      )}
    </div>
  );
}
