// ui/execute/ExecuteActivityNode.jsx — live Activity node for the Execute canvas
// Registered as nodeType "activityNode" in ExecuteCanvas.
// data.liveData shape: { serverTypeName, capacity, busyCount, activityBusyCount,
//                        idleCount, utilisation, completionSignal, startSignal, isDelay }
// activityBusyCount = servers currently serving THIS activity only.
// busyCount = ALL servers of this type currently busy (pool-level).
// isDelay = true for a DELAY-macro activity (no server ever claimed) — there
// is no resource pool to show, so activityBusyCount instead counts entities
// currently held in delay by THIS c-event specifically (see activityLiveData.js).
// completionSignal is this activity's OWN scheduled-follow-on-event fire count
// (see activityLiveData.js's completionSignalFor) — strictly increases only
// when THIS c-event's own work finishes, not the model-wide snap.served total
// (which used to make every activity node flash simultaneously whenever any
// activity anywhere completed a job).
// startSignal is this c-event's OWN fire count (snap.eventCounts[refId],
// already live/monotonic per engine/phases.js) — strictly increases only when
// THIS activity itself starts serving someone, complementing completionSignal.
import { useEffect, useRef, useState } from "react";
import { Handle, Position } from "../shared/xyflow.js";
import { useTheme } from "../shared/ThemeContext.jsx";
import { EXEC_CARD_HEIGHT } from "./executeLayout.js";

const MAX_DOTS = 12;
const FLASH_MS = 400;
// A COSEIZE spanning many server types would otherwise grow this node's
// height without bound (one ResourceRow per type) — capped the same way
// ExecuteQueueNode already caps entity dots (MAX_DOT_SHOWN, "+N" overflow)
// so every activity node fits the one fixed card height every node type
// now renders at (see EXEC_CARD_HEIGHT).
const MAX_ROWS_SHOWN = 3;

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

// Plain numeric count shown under the dot grid (small pools) so a viewer
// doesn't have to count squares — DotGrid's boxes stay, this just makes the
// count explicit, mirroring the wording PoolText already uses for large pools.
function ActiveCount({ activityBusyCount }) {
  const { C, FONT } = useTheme();
  return (
    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: activityBusyCount > 0 ? C.cEvent : C.muted }}>
      {activityBusyCount} active
    </span>
  );
}

// Entities that started at this activity, got preempted/failed off it, and
// are now waiting in its feeder queue to resume — a supplementary, exceptional
// stat (like the failedCount warning above), so it's hidden at zero rather
// than always shown the way ActiveCount is.
function InterruptedNote({ count }) {
  const { C, FONT } = useTheme();
  if (!count) return null;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 1 }}>
      <span style={{ fontSize: 9, color: C.amber, fontFamily: FONT, fontWeight: 600 }}>
        ⏸ {count} interrupted
      </span>
    </div>
  );
}

// Persistent running total for a PREEMPT activity — this card's own fire
// count (startSignal) is its primary metric, so shown continuously rather
// than only via the transient start-flash pulse, which is easy to miss for
// an event that fires occasionally.
function PreemptCount({ count }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, fontFamily: FONT, marginTop: 2 }}>
      {count} preempted
    </div>
  );
}

function SkillBadges({ skillBreakdown }) {
  const { C, FONT } = useTheme();
  if (!skillBreakdown) return null;
  const skills = Object.entries(skillBreakdown);
  if (!skills.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
      {skills.map(([skill, data]) => (
        <span key={skill} style={{
          fontSize: 8,
          fontFamily: FONT,
          color: data.utilisation >= 90 ? C.red : data.utilisation >= 60 ? C.amber : C.muted,
          background: `${C.border}30`,
          borderRadius: 3,
          padding: "1px 5px",
        }}>
          {skill} {data.utilisation.toFixed(0)}%
        </span>
      ))}
    </div>
  );
}

function ResourceRow({ serverName, capacity, busyCount, activityBusyCount, failedCount, skillBreakdown }) {
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
      {useText ? (
        <PoolText activityBusyCount={activityBusyCount} busyCount={busyCount} failedCount={failedCount} capacity={capacity} />
      ) : (
        <>
          <DotGrid capacity={capacity} activityBusyCount={activityBusyCount} totalBusyCount={busyCount} failedCount={failedCount} />
          <ActiveCount activityBusyCount={activityBusyCount} />
        </>
      )}
      {hasFailures && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 1 }}>
          <span style={{ fontSize: 9, color: C.red, fontFamily: FONT, fontWeight: 600 }}>
            ⚠ {failedCount} failed
          </span>
        </div>
      )}
      <SkillBadges skillBreakdown={skillBreakdown} />
    </>
  );
}

export function ExecuteActivityNode({ data }) {
  const { C, FONT } = useTheme();
  const ACTIVITY_COLOR = C.purple;
  const live = data.liveData;

  // Two independent one-shot pulses, mirroring ExecuteQueueNode's renege/balk
  // pulse pattern exactly (strictly-increasing signal watched via useEffect,
  // skip-on-mount, self-expiring). "finish" (existing) fires when this
  // activity's own scheduled follow-on event fires; "start" (new) fires when
  // this c-event itself fires (service begins). Distinct colors so the two
  // are visually distinguishable; finish takes priority on the rare tick both
  // land together.
  const [finishFlashing, setFinishFlashing] = useState(false);
  const [startFlashing, setStartFlashing] = useState(false);
  const prevSignalRef = useRef(null);
  const prevStartSignalRef = useRef(null);
  const timerRef      = useRef(null);
  const startTimerRef = useRef(null);

  // Flash briefly each time this activity's own completionSignal increments.
  useEffect(() => {
    const signal = live?.completionSignal ?? 0;
    if (prevSignalRef.current !== null && signal > prevSignalRef.current) {
      setFinishFlashing(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFinishFlashing(false), FLASH_MS);
    }
    prevSignalRef.current = signal;
  }, [live?.completionSignal]);

  // Flash briefly each time this activity's own startSignal increments (this
  // c-event itself just fired, starting service for an entity).
  useEffect(() => {
    const signal = live?.startSignal ?? 0;
    if (prevStartSignalRef.current !== null && signal > prevStartSignalRef.current) {
      setStartFlashing(true);
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      startTimerRef.current = setTimeout(() => setStartFlashing(false), FLASH_MS);
    }
    prevStartSignalRef.current = signal;
  }, [live?.startSignal]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
  }, []);

  const capacity           = live?.capacity           ?? 1;
  const busyCount          = live?.busyCount          ?? 0;
  const activityBusyCount  = live?.activityBusyCount  ?? 0;
  const failedCount        = live?.failedCount        ?? 0;
  const serverName         = live?.serverTypeName     ?? null;
  const rows               = live?.perType?.length > 1 ? live.perType : null;
  const skillBreakdown     = live?.skillBreakdown     ?? null;
  const interruptedCount   = live?.interruptedCount   ?? 0;

  // Persistent busy/idle/failed state color (independent of the transient
  // pulses above) — the convention most DES tools use on a resource/activity
  // icon: idle=green, busy=amber, blocked/failed=red, shown continuously, not
  // just as a one-off event flash. Aggregated worst-first across every
  // resource type for a multi-row COSEIZE activity, not just the first row.
  const statRows  = rows ?? [{ activityBusyCount, failedCount }];
  const isFailed  = statRows.some(r => (r.failedCount ?? 0) > 0);
  const isBusy    = statRows.some(r => (r.activityBusyCount ?? 0) > 0);
  const stateColor = isFailed ? C.red : isBusy ? C.amber : C.green;

  const pulseColor = finishFlashing ? ACTIVITY_COLOR : startFlashing ? C.cEvent : null;
  const pulseLabel = finishFlashing ? "done" : startFlashing ? "started" : null;

  return (
    <div style={{
      width: 160,
      height: EXEC_CARD_HEIGHT,
      overflow: "hidden",
      background: C.surface,
      // Longhand on every edge (not the `border` shorthand) — mixing a
      // shorthand with the borderLeft longhand on the same element makes
      // React warn on every rerender that changes either ("conflicting
      // property"), since it can't tell which one wins.
      borderTop: `1.5px solid ${pulseColor ?? `${stateColor}44`}`,
      borderRight: `1.5px solid ${pulseColor ?? `${stateColor}44`}`,
      borderBottom: `1.5px solid ${pulseColor ?? `${stateColor}44`}`,
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
      boxShadow: pulseColor ? `0 0 12px ${pulseColor}44` : "none",
    }}>
      {/* Start/finish flash overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: 6,
        background: `${pulseColor ?? "transparent"}${pulseColor ? "14" : ""}`,
        transition: `background ${FLASH_MS}ms ease-out`,
        pointerEvents: "none",
      }} />

      {pulseLabel && (
        // Mirrors ExecuteQueueNode's renege/balk pulse badge exactly.
        <div style={{
          position: "absolute", top: 4, right: 8,
          background: pulseColor, color: C.bg,
          borderRadius: 4, padding: "1px 6px",
          fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
          fontFamily: FONT,
        }}>
          {pulseLabel}
        </div>
      )}

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
        <>
        {live.isDelay ? (
          // No resource pool exists for a DELAY activity — show only the
          // count of entities this activity currently has held in delay,
          // never a server-square grid (there's no server to draw one for).
          <ActiveCount activityBusyCount={activityBusyCount} />
        ) : rows ? (
          <>
            {rows.slice(0, MAX_ROWS_SHOWN).map((row, i) => (
              <div key={row.serverTypeName ?? i} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <ResourceRow
                  serverName={row.serverTypeName}
                  capacity={row.capacity}
                  busyCount={row.busyCount}
                  activityBusyCount={row.activityBusyCount}
                  failedCount={row.failedCount}
                  skillBreakdown={row.skillBreakdown}
                />
              </div>
            ))}
            {rows.length > MAX_ROWS_SHOWN && (
              <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>
                +{rows.length - MAX_ROWS_SHOWN} more
              </div>
            )}
          </>
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
              skillBreakdown={skillBreakdown}
            />
          </>
        )}
        {/* Whole-activity stats, independent of the rows/single-resource
            shape above — an interrupted-and-waiting-to-resume count applies
            to any ASSIGN/COSEIZE activity, and the persistent preempt total
            applies only to a PREEMPT activity. */}
        <InterruptedNote count={interruptedCount} />
        {live.isPreempt && <PreemptCount count={live.startSignal ?? 0} />}
        </>
      ) : (
        <div style={{ fontSize: 9, color: C.muted }}>—</div>
      )}
    </div>
  );
}
