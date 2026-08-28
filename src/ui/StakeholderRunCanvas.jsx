// ui/StakeholderRunCanvas.jsx — lets a signed-in viewer collaborator watch a
// single illustrative pass of the model actually run: entities moving on the
// same animated canvas the owner sees on the Execute screen's Auto Run.
//
// This is deliberately NOT the statistical answer — one seeded run isn't
// representative of the model the way StakeholderView's N-replication "Run"
// button is, so it's framed as illustrative throughout and never replaces
// that button. It reuses the same zero-persistence guarantee as the rest of
// StakeholderView: nothing here ever calls saveSimulationRun/saveLocalRun/
// fetchUserSettings/saveUserSettings. See ExecutePanel's Auto Run machinery
// (src/ui/execute/index.jsx) for the pattern this mirrors — buildEngine +
// setInterval(doStep, speed) — minus that file's save-on-completion branch.
//
// `admission` is the SAME object StakeholderView already computed for its own
// Run button gate, on the unpatched model — not recomputed here against the
// patched one. applySweepValues() (src/engine/sweep-params.js) stringifies
// numeric overrides (e.g. entity count "4", matching how the rest of the app
// stores these fields), which validateModel legitimately rejects as
// non-integer (V19) when re-validated from scratch; the real Run button never
// hits this because it never re-validates its patched model either, so this
// mirrors that behavior instead of introducing a stricter, new false-blocker.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { buildEngine } from "../engine/index.js";
import { estimateMaxCycles } from "../engine/complexity-estimator.js";
import { prefersReducedMotion } from "./shared/hooks.js";
import { Btn } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

const ExecuteCanvas = lazy(() => import("./execute/ExecuteCanvas.jsx").then(m => ({ default: m.ExecuteCanvas })));

const SANS = "Inter,'Segoe UI',Arial,sans-serif";
const AUTO_SPEED_MS = 350;

export function StakeholderRunCanvas({
  model, schedulesMap, warmupPeriod, maxSimTime, terminationMode, terminationCondition,
  seed = 0, admission, onClose,
}) {
  const { C } = useTheme();
  const blocked = admission.hardErrors.length > 0;

  const [mode, setMode] = useState(blocked ? "blocked" : "idle"); // idle | running | paused | done | blocked
  const [currentSnap, setCurrentSnap] = useState(null);
  const [animationEnabled] = useState(() => !prefersReducedMotion());
  const engineRef = useRef(null);
  const autoRef = useRef(null);

  const stopAuto = useCallback(() => {
    if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; }
  }, []);

  const initEngine = useCallback(() => {
    stopAuto();
    engineRef.current = buildEngine(
      model, seed, warmupPeriod,
      terminationMode === "time" ? maxSimTime : null,
      terminationMode === "condition" ? terminationCondition : null,
      estimateMaxCycles(admission.complexityEstimate), 5000,
      false, undefined,
      { schedulesMap, collectTrace: false }
    );
    setCurrentSnap(engineRef.current.getSnap());
    setMode("running");
  }, [stopAuto, model, seed, warmupPeriod, maxSimTime, terminationMode, terminationCondition, admission, schedulesMap]);

  const doStep = useCallback(() => {
    if (!engineRef.current) return;
    const r = engineRef.current.step();
    setCurrentSnap(r.snap);
    if (r.done) {
      stopAuto();
      setMode("done");
    }
    // No save call of any kind — this is an illustrative, non-persisted preview.
  }, [stopAuto]);

  // Auto-plays as soon as it can — the whole point is to watch it run.
  useEffect(() => {
    if (blocked) return;
    initEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "running") return;
    autoRef.current = setInterval(doStep, AUTO_SPEED_MS);
    return () => { if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; } };
  }, [mode, doStep]);

  useEffect(() => stopAuto, [stopAuto]);

  const panelStyle = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 };

  if (blocked) {
    return (
      <div style={{ ...panelStyle, borderColor: `${C.amber}66` }}>
        <div style={{ fontSize: 13, color: C.amber, fontFamily: SANS, lineHeight: 1.6, marginBottom: 12 }}>
          This model can't be run right now — it has a problem only its owner can fix. Let them know, and try again once it's updated.
        </div>
        <Btn small variant="ghost" onClick={onClose}>← Back to settings</Btn>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Btn small variant="ghost" onClick={onClose}>← Back to settings</Btn>
        {mode === "running" && <Btn small variant="ghost" onClick={() => { stopAuto(); setMode("paused"); }}>Pause</Btn>}
        {mode === "paused" && <Btn small variant="ghost" onClick={() => setMode("running")}>Resume</Btn>}
        {(mode === "paused" || mode === "done") && <Btn small variant="ghost" onClick={initEngine}>Reset</Btn>}
        <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS }}>
          Watching one illustrative run — not the statistical result.
        </div>
      </div>

      <div style={{ height: 480, position: "relative" }}>
        <Suspense fallback={<div style={{ fontSize: 12, color: C.muted, fontFamily: SANS, padding: 16 }}>Preparing the run…</div>}>
          <ExecuteCanvas model={model} snap={currentSnap} animationEnabled={animationEnabled} />
        </Suspense>
      </div>

      {mode === "done" && (
        <div style={{ ...panelStyle, fontSize: 12, color: C.text, fontFamily: SANS, lineHeight: 1.6 }}>
          This is one illustrative run. Click Run above for the full statistical result.
        </div>
      )}
    </div>
  );
}
