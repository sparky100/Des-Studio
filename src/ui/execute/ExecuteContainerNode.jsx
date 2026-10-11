// ui/execute/ExecuteContainerNode.jsx — live Container (tank/buffer) node for the Execute canvas
// Registered as nodeType "containerNode" in ExecuteCanvas.
// data.liveData shape: { level, capacity, clock, trendWindow, timeUnit }
//
// Shows: the level badge (75/250), a fill gauge (level ÷ capacity), and a trend
// of the level over a fixed span of sim time (the last 10% of the run), drawn
// on a 0–capacity scale with its min and max written underneath. The trend used
// to be a generic sparkline of the last 20 screen updates scaled to its own
// recent maximum, so a steady level always drew as a "full" line at the top,
// whatever the actual level, over an arbitrary, unlabelled stretch of time.
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../shared/ThemeContext.jsx";
import { EXEC_CARD_HEIGHT } from "./executeLayout.js";

const TREND_W = 138;
const TREND_H = 22;
// Without a known run length, keep this many most recent samples instead.
const FALLBACK_SAMPLES = 40;
// Hard cap on stored samples, whatever the window.
const MAX_SAMPLES = 400;

// ≥100% red, ≥85% amber, else accent (distinct from the 90/70 scheme used for
// resource utilisation elsewhere on this canvas).
function levelColor(level, capacity, C) {
  if (!Number.isFinite(capacity) || capacity <= 0) return C.accent;
  if (level >= capacity) return C.red;
  if (level >= capacity * 0.85) return C.amber;
  return C.accent;
}

const fmtLevel = v => (Math.abs(v) >= 10 || Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1));

function fmtSpan(span, unit) {
  const n = span >= 10 ? Math.round(span) : Math.round(span * 10) / 10;
  const u = String(unit || "").replace(/s$/, "");
  return `${n} ${u}${n === 1 ? "" : "s"}`;
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

/** Fill gauge: how full the container is now. */
function FillGauge({ level, capacity, color }) {
  const { C, FONT } = useTheme();
  const pct = Math.max(0, Math.min(1, level / capacity));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        role="meter"
        aria-label="Fill level"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={level}
        data-testid="container-fill-gauge"
        style={{ flex: 1, height: 8, borderRadius: 4, background: `${C.border}88`, overflow: "hidden" }}
      >
        <div style={{ width: `${(pct * 100).toFixed(1)}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: FONT, minWidth: 30, textAlign: "right" }}>
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

/**
 * Level over the trend window, on a fixed scale: 0–capacity, or 0–(highest
 * level seen) for a container without a capacity.
 */
function LevelTrend({ samples, scaleMax, color, caption }) {
  const { C, FONT } = useTheme();
  const t0 = samples[0].clock;
  const span = Math.max(samples[samples.length - 1].clock - t0, 1e-9);
  const y = v => TREND_H - 1 - (Math.max(0, Math.min(scaleMax, v)) / scaleMax) * (TREND_H - 2);
  const pts = samples.map(s => [((s.clock - t0) / span) * TREND_W, y(s.level)]);
  const line = pts.map(([x, py]) => `${x.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const fill = `${line} ${TREND_W},${TREND_H} 0,${TREND_H}`;
  return (
    <div data-testid="container-level-trend">
      <svg width={TREND_W} height={TREND_H} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
        {/* Top edge = capacity (or the highest level seen). */}
        <line x1={0} x2={TREND_W} y1={0.5} y2={0.5} stroke={C.border} strokeDasharray="2 3" />
        <polygon points={fill} fill={color} fillOpacity={0.12} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {caption}
      </div>
    </div>
  );
}

export function ExecuteContainerNode({ data }) {
  const { C, FONT } = useTheme();
  const CONTAINER_COLOR = C.amber;
  const live = data.liveData;
  const [history, setHistory] = useState(/** @type {{ clock: number, level: number }[]} */ ([]));
  const lastClockRef = useRef(null);

  useEffect(() => {
    if (live == null) {
      setHistory([]);
      lastClockRef.current = null;
      return;
    }
    const sample = { clock: live.clock ?? 0, level: live.level ?? 0 };
    if (lastClockRef.current !== null && sample.clock < lastClockRef.current) {
      // Clock went backward — a new run started.
      setHistory([sample]);
    } else {
      setHistory(prev => {
        const span = live.trendWindow;
        let next = [...prev, sample];
        next = Number.isFinite(span) && span > 0
          ? next.filter(s => s.clock >= sample.clock - span)
          : next.slice(-FALLBACK_SAMPLES);
        return next.length > MAX_SAMPLES ? next.slice(-MAX_SAMPLES) : next;
      });
    }
    lastClockRef.current = sample.clock;
  }, [live?.clock]); // eslint-disable-line react-hooks/exhaustive-deps

  const level    = live?.level ?? 0;
  const capacity = live?.capacity ?? null;
  const hasCapacity = Number.isFinite(capacity) && capacity > 0;
  const color    = levelColor(level, capacity, C);

  const levels = history.map(s => s.level);
  const lo = levels.length ? Math.min(...levels) : 0;
  const hi = levels.length ? Math.max(...levels) : 0;
  const scaleMax = hasCapacity ? capacity : Math.max(hi, 1);
  const shownSpan = history.length >= 2 ? history[history.length - 1].clock - history[0].clock : 0;
  const caption = `last ${fmtSpan(shownSpan, live?.timeUnit)} · ${lo === hi ? fmtLevel(lo) : `${fmtLevel(lo)}–${fmtLevel(hi)}`}`;

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

      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: C.text, overflowWrap: "anywhere" }}>
        {data.label}
      </div>

      {live ? (
        <LevelBadge level={level} capacity={capacity} color={color} />
      ) : (
        <div style={{ fontSize: 9, color: C.muted }}>—</div>
      )}

      {live && hasCapacity && <FillGauge level={level} capacity={capacity} color={color} />}

      {history.length >= 2 && (
        <LevelTrend samples={history} scaleMax={scaleMax} color={color} caption={caption} />
      )}
    </div>
  );
}
