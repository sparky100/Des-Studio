// ui/execute/ExecuteResourceNode.jsx — live Resource (server-role entity type)
// node for the Execute canvas. Registered as nodeType "resourceNode" in
// ExecuteCanvas. Mirrors ExecuteContainerNode.jsx's pattern for another kind
// of non-flow state: a resource type isn't part of the entity flow either, it
// can just be seized/released by any number of activities.
//
// This is the one canonical place overall per-resource-type utilisation is
// shown — previously every ACTIVITY node referencing a resource repeated the
// same pool-wide utilisation %, identically, on every card that used it.
// data.liveData shape: { capacity, busyCount, idleCount, failedCount, utilisation }
import { useTheme } from "../shared/ThemeContext.jsx";
import { EXEC_CARD_HEIGHT } from "./executeLayout.js";

function utilColor(utilisation, C) {
  if (utilisation >= 90) return C.red;
  if (utilisation >= 60) return C.amber;
  return C.green;
}

function CapacityBadge({ busyCount, capacity, color }) {
  const { C, FONT } = useTheme();
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
        {busyCount}/{capacity}
      </div>
      <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>
        busy
      </span>
    </div>
  );
}

export function ExecuteResourceNode({ data }) {
  const { C, FONT } = useTheme();
  const RESOURCE_COLOR = C.server;
  const live = data.liveData;

  const capacity     = live?.capacity ?? 0;
  const busyCount     = live?.busyCount ?? 0;
  const idleCount     = live?.idleCount ?? 0;
  const failedCount   = live?.failedCount ?? 0;
  const utilisation   = live?.utilisation ?? 0;
  const color         = utilColor(utilisation, C);
  const hasFailures   = failedCount > 0;

  return (
    <div style={{
      width: 160,
      height: EXEC_CARD_HEIGHT,
      overflow: "hidden",
      background: C.surface,
      border: `1.5px solid ${RESOURCE_COLOR}44`,
      borderLeft: `4px solid ${RESOURCE_COLOR}`,
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
      {/* Resources are non-spatial state with no upstream/downstream flow
          edges, same as containers (see ExecuteContainerNode.jsx) — no
          handles, matching the design-time canvas's DesNode treatment. */}
      <div style={{
        color: RESOURCE_COLOR,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}>
        resource
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: C.text }}>
        {data.label}
      </div>

      {live ? (
        <>
          <CapacityBadge busyCount={busyCount} capacity={capacity} color={color} />
          <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>
            {idleCount} idle
          </div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 1,
          }}>
            <span style={{ fontSize: 9, fontFamily: FONT, color }}>
              {utilisation.toFixed(0)}% utilisation
            </span>
            {hasFailures && (
              <span style={{ fontSize: 9, color: C.red, fontFamily: FONT, fontWeight: 600 }}>
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
