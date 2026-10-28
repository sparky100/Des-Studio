// Moved out of execute/index.jsx (max-lines ratchet, expert review C-11).
import { useCallback, useRef, useState } from "react";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { ResponsivePanel } from "../shared/ResponsivePanel.jsx";
import { scheduleRowCount } from "./runHelpers.js";

/** Animation speed slider shared by the idle and running toolbars. */
export function SpeedControl({ speedMultiplier, setSpeedMultiplier }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>
        {speedMultiplier >= 10 ? "Turbo" : `${speedMultiplier.toFixed(1)}×`}
      </span>
      <input
        aria-label="Animation speed multiplier"
        type="range"
        min={0.5} max={10} step={0.5}
        value={speedMultiplier}
        onChange={e => setSpeedMultiplier(parseFloat(e.target.value))}
        style={{ width: 72, accentColor: C.accent, cursor: "pointer" }}
      />
    </div>
  );
}

/** "3 reps · 480 time units · seed 42 · warm-up 60" */
export function runSettingsText({ replications, terminationMode, maxSimTime, seed, warmupPeriod }) {
  return `${replications} rep${replications !== 1 ? "s" : ""} · ${terminationMode === "time" ? `${maxSimTime} time units` : "condition stop"} · seed ${seed}${warmupPeriod > 0 ? ` · warm-up ${warmupPeriod}` : ""}`;
}

/** ⚠ n chip that opens the live health warnings. */
function LiveFlagsButton({ liveFlags }) {
  const { C, FONT } = useTheme();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const critical = liveFlags.some(f => f.severity === "critical");
  return (
    <div ref={anchorRef} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{
        background: critical ? C.red + "22" : C.amber + "22",
        border: `1px solid ${critical ? C.red + "44" : C.amber + "44"}`,
        borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700,
        color: critical ? C.red : C.amber,
        fontFamily: FONT, cursor: "pointer", whiteSpace: "nowrap", lineHeight: 1.5,
      }}>{"⚠"} {liveFlags.length}</button>
      <ResponsivePanel open={open} onClose={close} anchorRef={anchorRef}
        title="Live warnings" width={360} testId="live-flags-panel">
        {liveFlags.map((f, i) => {
          const isCritical = f.severity === "critical";
          return (
            <div key={i} style={{
              borderLeft: `2px solid ${isCritical ? C.red : C.amber}`,
              paddingLeft: 8, fontSize: 10, fontFamily: FONT,
              color: isCritical ? C.red : C.amber, lineHeight: 1.4, overflowWrap: "anywhere",
            }}>
              {f.resource && <span style={{ color: C.muted }}>{f.resource}: </span>}
              {f.message}
            </div>
          );
        })}
      </ResponsivePanel>
    </div>
  );
}

/** Toolbar shown while a run is in progress: step, auto run, speed, live warnings, cancel. */
export function RunningToolbar({ doStep, mode, runBusy, autoRunning, toggleAuto, hasValidationErrors, speedMultiplier, setSpeedMultiplier, liveFlags, onCancel, batchActive, cancelBatch, batchStatus, singleRunActive, cancelSingleRun, singleRunStatus, settings, pauseControl = null }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Btn variant="success" onClick={doStep} disabled={mode === "done" || runBusy}> Step</Btn>
      <Btn variant={autoRunning ? "danger" : "amber"} onClick={toggleAuto} disabled={hasValidationErrors || runBusy}>{autoRunning ? "⏹ Stop Auto" : "Auto Run"}</Btn>
      <SpeedControl speedMultiplier={speedMultiplier} setSpeedMultiplier={setSpeedMultiplier} />
      {pauseControl}
      {liveFlags.length > 0 ? <LiveFlagsButton liveFlags={liveFlags} /> : null}
      <Btn variant="danger" onClick={onCancel}>✕ Cancel</Btn>
      {batchActive && <Btn variant="danger" onClick={cancelBatch} disabled={batchStatus === "cancelling"}>Cancel Batch</Btn>}
      {singleRunActive && <Btn variant="danger" onClick={cancelSingleRun} disabled={singleRunStatus === "cancelling"}>Cancel Run</Btn>}
      <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap", marginLeft: "auto" }}>
        {runSettingsText(settings)}
      </span>
    </div>
  );
}

/** ADR-016: timetable picker, shown when the model has more than one schedule. */
export function ScheduleSelector({ modelSchedules, selectedScheduleId, setSelectedScheduleId, schedulesLoading }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>Timetable:</span>
      <select
        value={selectedScheduleId ?? ""}
        onChange={e => setSelectedScheduleId(e.target.value || null)}
        style={{ padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, background: C.surface, color: C.text, cursor: "pointer" }}
      >
        {modelSchedules.map(s => (
          <option key={s.id} value={s.id}>
            {s.isDefault ? "★ " : ""}{s.name} ({scheduleRowCount(s).toLocaleString()} rows)
          </option>
        ))}
      </select>
      {schedulesLoading && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Loading…</span>}
    </div>
  );
}
