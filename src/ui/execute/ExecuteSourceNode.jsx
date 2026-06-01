// ui/execute/ExecuteSourceNode.jsx — live Source node for the Execute canvas
// Registered as nodeType "sourceNode" in ExecuteCanvas.
// data.liveData shape: { nextArrivalTime, interArrivalLabel, arrivalKey, clock }
// arrivalKey is the max entity-id of this source's customer type — strictly
// increases on each arrival, used to trigger the pulse without needing FEL access.
import { useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { C, FONT } from "../shared/tokens.js";

const PULSE_DURATION_MS = 500;

export function ExecuteSourceNode({ data }) {
  const live = data.liveData;
  const [pulsing, setPulsing] = useState(false);
  const prevKeyRef = useRef(null);
  const timerRef   = useRef(null);

  // Detect arrivals by watching arrivalKey (max entity id for this type).
  // Skip on initial mount so the node doesn't glow when the sim is loaded mid-run.
  useEffect(() => {
    const key = live?.arrivalKey ?? 0;
    if (prevKeyRef.current !== null && key > prevKeyRef.current) {
      setPulsing(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setPulsing(false), PULSE_DURATION_MS);
    }
    prevKeyRef.current = key;
  }, [live?.arrivalKey]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const countdown =
    live?.nextArrivalTime != null && live?.clock != null
      ? Math.max(0, live.nextArrivalTime - live.clock)
      : null;

  return (
    <div style={{
      width: 160,
      minHeight: 78,
      background: C.surface,
      border: `1.5px solid ${pulsing ? C.green : `${C.green}44`}`,
      borderLeft: `4px solid ${C.green}`,
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
      boxShadow: pulsing ? `0 0 14px ${C.green}55` : "none",
    }}>
      {/* Arrival flash overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: 6,
        background: `${C.green}${pulsing ? "1a" : "00"}`,
        transition: `background ${PULSE_DURATION_MS}ms ease-out`,
        pointerEvents: "none",
      }} />

      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 8, height: 8, background: C.green, borderColor: C.bg, pointerEvents: "none" }}
      />

      <div style={{ color: C.green, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
        source
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: C.text }}>
        {data.label}
      </div>

      {live?.interArrivalLabel && (
        <div style={{ fontSize: 9, color: C.muted }}>
          {live.interArrivalLabel}
        </div>
      )}

      {countdown != null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
          <div style={{
            background: `${C.green}18`,
            border: `1px solid ${C.green}44`,
            borderRadius: 4,
            padding: "2px 7px",
            fontSize: 11,
            fontWeight: 700,
            color: C.green,
            fontFamily: FONT,
            minWidth: 36,
            textAlign: "right",
          }}>
            {countdown.toFixed(1)}
          </div>
          <span style={{ fontSize: 9, color: C.muted }}>until next</span>
        </div>
      ) : (
        live && (
          <div style={{ fontSize: 9, color: C.muted }}>
            {live.clock != null ? "awaiting schedule" : "—"}
          </div>
        )
      )}
    </div>
  );
}
