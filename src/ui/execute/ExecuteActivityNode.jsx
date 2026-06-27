// ui/execute/ExecuteActivityNode.jsx — live Activity node for the Execute canvas
// Registered as nodeType "activityNode" in ExecuteCanvas.
// data.liveData shape: { serverTypeName, capacity, busyCount, activityBusyCount,
//                        idleCount, utilisation, completionSignal }
// activityBusyCount = servers currently serving THIS activity only.
// busyCount = ALL servers of this type currently busy (pool-level).
// completionSignal is snap.served — strictly increases on each COMPLETE event,
// used to trigger the flash without needing direct FEL access.
import { useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { useTheme } from "../shared/ThemeContext.jsx";

const MAX_DOTS = 12;
const FLASH_MS = 400;

function Dot({ busyHere, busyElsewhere, failed }) {
  const { C } = useTheme();
  return (
    <div style={{
      width: 10,
      height: 10,
      borderRadius: 2,
      background: failed ? C.red : busyHere ? C.cEvent : busyElsewhere ? `${C.amber}33` : "transparent",
      border:     `1.5px solid ${failed ? C.red : busyHere ? C.cEvent : busyElsewhere ? C.amber : `${C.muted}66`}`,
      flexShrink: 0,
      transition: "background 0.12s, border-color 0.12s",
    }} />
  );
}

function DotGrid({ capacity, activityBusyCount, totalBusyCount, failedCount }) {
  const effectiveFailed        = Math.min(failedCount, capacity);
  const effectiveActivityBusy  = Math.max(0, Math.min(activityBusyCount, capacity - effectiveFailed));
  const effectiveTotalBusy     = Math.max(0, Math.min(totalBusyCount, capacity - effectiveFailed));
  const dots = Array.from({ length: capacity }, (_, i) => {
    if (i < effectiveFailed) return { busyHere: false, busyElsewhere: false, failed: true };
    const j = i - effectiveFailed;
    if (j < effectiveActivityBusy) return { busyHere: true,  busyElsewhere: false, failed: false };
    if (j < effectiveTotalBusy)    return { busyHere: false, busyElsewhere: true,  failed: false };
    return { busyHere: false, busyElsewhere: false, failed: false };
  });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
      {dots.map((state, i) => <Dot key={i} {...state} />)}
    </div>
  );
}

function PoolText({ activityBusyCount, busyCount, failedCount, capacity }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: activityBusyCount > 0 ? C.cEvent : C.muted }}>
        {activityBusyCount} active
      </span>
      <span style={{ fontFamily: FONT, fontSize: 11, color: busyCount > 0 ? C.amber : C.muted }}>
        {busyCount}/{capacity} pool
      </span>
      {failedCount > 0 && (
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.red }}>
          {failedCount} failed
        </span>
      )}
    </div>
  );
}

function ResourceRow({ serverName, capacity, busyCount, activityBusyCount, failedCount, utilisation }) {
  const { C, FONT } = useTheme();
  const useText     = capacity > MAX_DOTS;
  const hasFailures = failedCount > 0;
  return (
    <>
      {serverName && (
        <div style={{ fontSize: 9, color: C.muted }}>
          {serverName}
        </div>
      )}
      {useText
        ? <PoolText activityBusyCount={activityBusyCount} busyCount={busyCount} failedCount={failedCount} capacity={capacity} />
        : <DotGrid  capacity={capacity} activityBusyCount={activityBusyCount} totalBusyCount={busyCount} failedCount={failedCount} />
      }
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 1,
      }}>
        <span style={{
          fontSize: 9,
          fontFamily: FONT,
          color: utilisation >= 90 ? C.red : utilisation >= 60 ? C.amber : C.muted,
        }}>
          {utilisation.toFixed(0)}%
        </span>
        {hasFailures && (
          <span style={{ fontSize: 9, color: C.red, fontFamily: FONT, fontWeight: 600 }}>
            ⚠ {failedCount} failed
          </span>
        )}
      </div>
    </>
  );
}

export function ExecuteActivityNode({ data }) {
  const { C, FONT } = useTheme();
  const ACTIVITY_COLOR = C.purple;
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

  const capacity           = live?.capacity           ?? 1;
  const busyCount          = live?.busyCount          ?? 0;
  const activityBusyCount  = live?.activityBusyCount  ?? 0;
  const failedCount        = live?.failedCount        ?? 0;
  const utilisation        = live?.utilisation        ?? 0;
  const serverName         = live?.serverTypeName     ?? null;
  const rows               = live?.perType?.length > 1 ? live.perType : null;

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

      {live ? (
        rows ? (
          rows.map((row, i) => (
            <div key={row.serverTypeName ?? i} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <ResourceRow
                serverName={row.serverTypeName}
                capacity={row.capacity}
                busyCount={row.busyCount}
                activityBusyCount={row.activityBusyCount}
                failedCount={row.failedCount}
                utilisation={row.utilisation}
              />
            </div>
          ))
        ) : (
          <>
            {/* Server type sublabel */}
            {serverName && (
              <div style={{ fontSize: 9, color: C.muted }}>
                {serverName}
              </div>
            )}
            <ResourceRow
              serverName={null}
              capacity={capacity}
              busyCount={busyCount}
              activityBusyCount={activityBusyCount}
              failedCount={failedCount}
              utilisation={utilisation}
            />
          </>
        )
      ) : (
        <div style={{ fontSize: 9, color: C.muted }}>—</div>
      )}
    </div>
  );
}
