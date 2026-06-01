// ui/execute/ExecuteActivityNode.jsx — live Activity node for the Execute canvas
// Registered as nodeType "activityNode" in ExecuteCanvas.
// data.liveData shape: { serverTypeName, capacity, busyCount, idleCount,
//                        utilisation, completionSignal }
// completionSignal is snap.served — strictly increases on each COMPLETE event,
// used to trigger the flash without needing direct FEL access.
import { useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { C, FONT } from "../shared/tokens.js";

const ACTIVITY_COLOR = C.purple;    // "#8b5cf6" — matches authoring-mode Activity node
const BUSY_DOT_COLOR = C.cEvent;    // "#06b6d4" teal — matches spec  ■ (busy, teal)
const FAILED_DOT_COLOR = C.red;     // "#f85149" red — failed servers
const MAX_DOTS       = 12;
const FLASH_MS       = 400;

// One square dot: ■ busy (teal), ■ failed (red), or □ idle (muted outline)
function Dot({ busy, failed }) {
  return (
    <div style={{
      width: 10,
      height: 10,
      borderRadius: 2,
      background:  failed ? FAILED_DOT_COLOR : busy ? BUSY_DOT_COLOR : "transparent",
      border:      `1.5px solid ${failed ? FAILED_DOT_COLOR : busy ? BUSY_DOT_COLOR : `${C.muted}66`}`,
      flexShrink: 0,
      transition: "background 0.12s, border-color 0.12s",
    }} />
  );
}

// Dot grid for capacity ≤ MAX_DOTS
function DotGrid({ capacity, busyCount, failedCount }) {
  const effectiveFailed = Math.min(failedCount, capacity);
  const effectiveBusy = Math.max(0, Math.min(busyCount, capacity - effectiveFailed));
  const dots = Array.from({ length: capacity }, (_, i) => {
    if (i < effectiveFailed) return { busy: false, failed: true };
    if (i < effectiveFailed + effectiveBusy) return { busy: true, failed: false };
    return { busy: false, failed: false };
  });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
      {dots.map((state, i) => <Dot key={i} busy={state.busy} failed={state.failed} />)}
    </div>
  );
}

// Text fallback when capacity exceeds dot limit
function PoolText({ busyCount, failedCount, capacity }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{
        fontFamily: FONT,
        fontSize: 12,
        fontWeight: 700,
        color: busyCount > 0 ? C.amber : C.muted,
      }}>
        {busyCount}/{capacity} busy
      </span>
      {failedCount > 0 && (
        <span style={{
          fontFamily: FONT,
          fontSize: 11,
          fontWeight: 600,
          color: FAILED_DOT_COLOR,
        }}>
          {failedCount} failed
        </span>
      )}
    </div>
  );
}

export function ExecuteActivityNode({ data }) {
  const live = data.liveData;
  const [flashing, setFlashing] = useState(false);
  const prevSignalRef = useRef(null);
  const timerRef      = useRef(null);

  // Flash briefly each time snap.served increments (a COMPLETE event fired).
  useEffect(() => {
    const signal = live?.completionSignal ?? 0;
    if (prevSignalRef.current !== null && signal > prevSignalRef.current) {
      setFlashing(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlashing(false), FLASH_MS);
    }
    prevSignalRef.current = signal;
  }, [live?.completionSignal]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const capacity    = live?.capacity    ?? 1;
  const busyCount   = live?.busyCount   ?? 0;
  const failedCount = live?.failedCount ?? 0;
  const utilisation = live?.utilisation ?? 0;
  const serverName  = live?.serverTypeName ?? null;
  const useText     = capacity > MAX_DOTS;
  const hasFailures = failedCount > 0;

  return (
    <div style={{
      width: 160,
      background: C.surface,
      border: `1.5px solid ${flashing ? ACTIVITY_COLOR : `${ACTIVITY_COLOR}44`}`,
      borderLeft: `4px solid ${ACTIVITY_COLOR}`,
      borderRadius: 6,
      color: C.text,
      display: "flex",
      flexDirection: "column",
      gap: 5,
      padding: "9px 10px",
      fontFamily: FONT,
      fontSize: 11,
      position: "relative",
      transition: `border-color ${FLASH_MS}ms ease-out, box-shadow ${FLASH_MS}ms ease-out`,
      boxShadow: flashing ? `0 0 12px ${ACTIVITY_COLOR}44` : "none",
    }}>
      {/* Completion flash overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: 6,
        background: `${ACTIVITY_COLOR}${flashing ? "14" : "00"}`,
        transition: `background ${FLASH_MS}ms ease-out`,
        pointerEvents: "none",
      }} />

      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 8, height: 8, background: ACTIVITY_COLOR, borderColor: C.bg, pointerEvents: "none" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 8, height: 8, background: ACTIVITY_COLOR, borderColor: C.bg, pointerEvents: "none" }}
      />

      {/* Type label */}
      <div style={{
        color: ACTIVITY_COLOR,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}>
        activity
      </div>

      {/* Activity (c-event) name */}
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: C.text }}>
        {data.label}
      </div>

      {/* Server type sublabel */}
      {serverName && (
        <div style={{ fontSize: 9, color: C.muted }}>
          {serverName}
        </div>
      )}

      {live ? (
        <>
          {/* Dot grid or text pool */}
          {useText
            ? <PoolText busyCount={busyCount} failedCount={failedCount} capacity={capacity} />
            : <DotGrid  capacity={capacity}   busyCount={busyCount} failedCount={failedCount} />
          }

          {/* Utilisation % and failure indicator */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 1,
          }}>
            <span style={{
              fontSize: 9,
              color: utilisation >= 90 ? C.red : utilisation >= 60 ? C.amber : C.muted,
              fontFamily: FONT,
            }}>
              {utilisation.toFixed(0)}% utilisation
            </span>
            {hasFailures && (
              <span style={{
                fontSize: 9,
                color: FAILED_DOT_COLOR,
                fontFamily: FONT,
                fontWeight: 600,
              }}>
                ⚠ {failedCount} failed
              </span>
            )}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 9, color: C.muted }}>—</div>
      )}
    </div>
  );
}
