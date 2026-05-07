// ui/execute/ExecuteSinkNode.jsx — live Sink node for the Execute canvas
// Registered as nodeType "sinkNode" in ExecuteCanvas.
// data.liveData shape: { served, reneged, throughputPerHour, meanSojourn }
// throughputPerHour assumes simulation time unit is minutes: rate = served / clock * 60
import { Handle, Position } from "@xyflow/react";
import { C, FONT } from "../shared/tokens.js";

const SINK_COLOR = C.red;   // "#f85149" — matches authoring-mode Sink node

const fmt = (value, digits = 2) =>
  Number.isFinite(value) && value !== null ? value.toFixed(digits) : "—";

function StatRow({ icon, label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ fontSize: 9, color: color || C.muted, fontFamily: FONT }}>{icon}</span>
      <span style={{
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: 700,
        color: color || C.text,
      }}>
        {value}
      </span>
      <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>{label}</span>
    </div>
  );
}

export function ExecuteSinkNode({ data }) {
  const live = data.liveData;

  const served    = live?.served   ?? 0;
  const reneged   = live?.reneged  ?? 0;
  const tph       = live?.throughputPerHour ?? null;
  const sojourn   = live?.meanSojourn       ?? null;

  return (
    <div style={{
      width: 160,
      background: C.surface,
      border: `1.5px solid ${SINK_COLOR}44`,
      borderLeft: `4px solid ${SINK_COLOR}`,
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
        style={{ width: 8, height: 8, background: SINK_COLOR, borderColor: C.bg, pointerEvents: "none" }}
      />

      {/* Type label */}
      <div style={{
        color: SINK_COLOR,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}>
        sink
      </div>

      {/* Sink name */}
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: C.text }}>
        {data.label}
      </div>

      {live ? (
        <>
          {/* Total served — large, prominent */}
          <div style={{
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            marginTop: 2,
          }}>
            <div style={{
              fontFamily: FONT,
              fontSize: 28,
              fontWeight: 300,
              color: C.served,
              lineHeight: 1,
            }}>
              {served}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>completed</span>
              {reneged > 0 && (
                <span style={{ fontSize: 9, color: C.reneged, fontFamily: FONT, fontWeight: 700 }}>
                  {reneged} reneged
                </span>
              )}
            </div>
          </div>

          {/* Separator */}
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 2 }} />

          {/* Throughput and sojourn stats */}
          <StatRow
            icon="⟶"
            value={tph !== null ? fmt(tph, 1) : "—"}
            label="/ hr"
            color={tph !== null ? C.accent : C.muted}
          />
          <StatRow
            icon="◷"
            value={fmt(sojourn)}
            label="mean sojourn"
            color={sojourn !== null ? C.text : C.muted}
          />
        </>
      ) : (
        <div style={{ fontSize: 9, color: C.muted }}>—</div>
      )}
    </div>
  );
}
