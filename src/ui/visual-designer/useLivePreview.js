// useLivePreview — Phase 1 of ADR-020 (Draw/Run live preview). Runs a small,
// capped, non-persisting simulation off the model being authored on the Draw
// canvas, using the exact engine lifecycle Auto Run already uses
// (buildEngine → interval step → snap). See docs/decisions/ADR-020-draw-run-live-preview.md.
//
// Design constraints from that ADR, load-bearing — do not "simplify" away:
//   - buildEngine() has no incremental re-init: every model edit rebuilds the
//     engine from t=0. We debounce rebuilds (REBUILD_DEBOUNCE_MS) so a rebuild
//     reads as "the preview updated", not "the preview broke" on every keystroke.
//   - Never persists: no saveSimulationRun, no run-admission gating beyond the
//     defensive maxSimTime/maxCycles caps below — buildEngine() is pure/local.
//   - Loops: when a run completes, it restarts (new seed) after a short pause,
//     so the preview reads as "always alive" rather than a one-shot demo.
import { useEffect, useRef, useState } from "react";
import { buildEngine } from "../../engine/index.js";

const REBUILD_DEBOUNCE_MS = 800;
const LOOP_RESTART_DELAY_MS = 900;
const STEP_INTERVAL_MS = 150;
export const PREVIEW_MAX_SIM_TIME = 60;
const PREVIEW_MAX_CYCLES = 2000;

export function useLivePreview(model, { enabled }) {
  const [snap, setSnap] = useState(null);
  const [error, setError] = useState(null);
  // True from the moment an edit is queued for a rebuild until the rebuilt
  // engine's first snap lands. Lets the panel show "updating" honestly
  // instead of holding the pre-edit run's last frame at full brightness,
  // which reads as still-live when it is actually frozen and stale.
  const [pending, setPending] = useState(false);
  const engineRef = useRef(null);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const seedRef = useRef(1);

  const clearTimers = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  const stepOnce = () => {
    if (!engineRef.current) return;
    let r;
    try {
      r = engineRef.current.step();
    } catch (e) {
      setError(e?.message || "Preview run failed");
      clearTimers();
      return;
    }
    setSnap(r.snap);
    if (r.done) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      // Loop: pause briefly on the finished state, then restart with a new
      // seed so repeated previews of the same model don't look identical.
      timeoutRef.current = setTimeout(rebuild, LOOP_RESTART_DELAY_MS);
    }
  };

  const rebuild = () => {
    clearTimers();
    setError(null);
    seedRef.current += 1;
    try {
      engineRef.current = buildEngine(
        model,
        seedRef.current,
        0,
        PREVIEW_MAX_SIM_TIME,
        null,
        PREVIEW_MAX_CYCLES,
        PREVIEW_MAX_CYCLES,
        false
      );
    } catch (e) {
      engineRef.current = null;
      setError(e?.message || "Couldn't build a preview for this model yet");
      setPending(false);
      return;
    }
    setSnap(engineRef.current.getSnap());
    setPending(false);
    intervalRef.current = setInterval(stepOnce, STEP_INTERVAL_MS);
  };

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      engineRef.current = null;
      setSnap(null);
      setError(null);
      setPending(false);
      return;
    }
    // Debounce: wait for edits to settle before tearing down and rebuilding —
    // rebuilding resets simulated time to 0, so an eager rebuild reads as
    // rewind/flicker rather than "the preview updated". Mark pending right
    // away, though: the previous run's stepping interval is stopped by
    // clearTimers() below immediately, so without this flag the panel would
    // keep showing that stopped run's last frame as if it were still live
    // for the whole debounce window.
    clearTimers();
    setPending(true);
    timeoutRef.current = setTimeout(rebuild, REBUILD_DEBOUNCE_MS);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild/stepOnce
    // intentionally close over the latest `model` via closure each debounce
    // firing; including them would re-create the debounce timer on every
    // render instead of only on model/enabled changes.
  }, [model, enabled]);

  useEffect(() => clearTimers, []);

  return { snap, error, pending };
}
