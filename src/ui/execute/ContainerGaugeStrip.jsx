// ui/execute/ContainerGaugeStrip.jsx — live container (tank/buffer) level gauges for the Execute panel
// Rendered above the canvas, mirroring the KPI/Sim-Clock row. Containers are non-spatial
// state (no position/edges), so they don't get nodes on the ReactFlow canvas.
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../shared/ThemeContext.jsx";
import { Sparkline } from "./Sparkline.jsx";

const HISTORY_LEN = 20;

function levelColor(level, capacity, C) {
  if (!Number.isFinite(capacity)) return C.accent;
  if (level >= capacity) return C.red;
  if (level >= capacity * 0.85) return C.amber;
  return C.accent;
}

function ContainerGaugeCard({ id, level, capacity }) {
  const { C, FONT } = useTheme();
  const [history, setHistory] = useState([]);
  const lastLevelRef = useRef(level);
  const hasCapacity = Number.isFinite(capacity);
  const color = levelColor(level, capacity, C);

  useEffect(() => {
    setHistory(prev => {
      const next = [...prev, level];
      return next.length > HISTORY_LEN ? next.slice(-HISTORY_LEN) : next;
    });
    lastLevelRef.current = level;
  }, [level]);

  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderTop: `3px solid ${color}`,
      borderRadius: 8,
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.8px", fontFamily: FONT }}>
        {id.toUpperCase()}
      </div>
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
      {history.length >= 2 && (
        <Sparkline history={history} color={color} />
      )}
    </div>
  );
}

export function ContainerGaugeStrip({ containers, model }) {
  const containerTypes = model?.containerTypes || [];
  if (!containerTypes.length) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
      {containerTypes.map(ct => {
        const live = containers?.[ct.id];
        const level = live?.level ?? (ct.initialLevel != null ? Number(ct.initialLevel) : 0);
        const capacity = live?.capacity ?? (ct.capacity != null ? Number(ct.capacity) : Infinity);
        return (
          <ContainerGaugeCard
            key={ct.id}
            id={ct.id}
            level={level}
            capacity={capacity}
          />
        );
      })}
    </div>
  );
}
