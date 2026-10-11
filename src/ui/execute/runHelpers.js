// ui/execute/runHelpers.js — run-support helpers for ExecutePanel, moved out of
// execute/index.jsx (max-lines ratchet, expert review C-11). No React here.

import { AdapterRegistry } from "../../engine/adapters/index.js";

/** Collect {{env.VAR}} secrets from sessionStorage for live-data adapters. */
export function collectEnvSecrets(dataSources) {

  const secrets = {};
  for (const ds of dataSources || []) {
    if (!ds.authSecret) continue;
    const m = String(ds.authSecret).match(/^\{\{env\.(.+?)\}\}$/);
    if (m) {
      const val = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(m[1]) : null;
      if (val) secrets[m[1]] = val;
    }
  }
  return secrets;
}

/**
 * Resolves dataSources/schedule feeds into `baseModel` when liveDataMode is
 * set, so every engine-building path (Step, Auto Run, Reset, Run All, Batch)
 * sees the same live data instead of only the multi-replication path.
 */
export async function resolveLiveDataModel(model, baseModel, setSaveStatus) {
  const liveDataMode = model.experimentDefaults?.liveDataMode;
  if (!liveDataMode) return baseModel;
  setSaveStatus({ state: 'saving', message: '⏳ Fetching live data…' });
  let runModel = baseModel;
  try {
    const envSecrets = collectEnvSecrets(model.dataSources);
    const registry = new AdapterRegistry(model.dataSources || [], envSecrets);
    await registry.prefetchAll();
    runModel = await registry.prefetchScheduleFeeds(runModel);
    runModel = registry.resolveAllParamSources(runModel);
    registry.dispose();
  } catch (err) {
    console.warn('[LiveData] Prefetch failed — running with static model:', err);
  }
  setSaveStatus(null);
  return runModel;
}

export const numberDefault = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** ADR-016: count total rows across all events in a schedule record (local copy). */
export function scheduleRowCount(sched) {
  if (!sched || !Array.isArray(sched.scheduleJson)) return 0;
  return sched.scheduleJson.reduce((sum, e) => sum + (Array.isArray(e.rows) ? e.rows.length : 0), 0);
}
export const intDefault = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
export const nowPerf = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
export const formatDurationMs = value => {
  if (!Number.isFinite(value)) return "0 ms";
  if (value < 1000) return `${Math.max(0, Math.round(value))} ms`;
  return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} s`;
};

// ── Cloud-save timeout thresholds ────────────────────────────────────────────
/** Show "taking longer than usual" after this many ms with no Supabase response. */
export const SAVE_SLOW_WARN_MS     = 5_000;
/** Show "still saving — Supabase may be waking up" after this many ms. */
export const SAVE_CRITICAL_WARN_MS = 15_000;
/**
 * Hard timeout (ms): abandon the save attempt and surface an error.
 * The underlying fetch may still complete in the background but the result
 * will be ignored.
 */
export const SAVE_TIMEOUT_MS       = 45_000;

/**
 * Runs a cloud save function with live elapsed-time feedback, escalating
 * slow-save warnings, a hard timeout, and unified try/catch error surfacing.
 *
 * Thresholds are controlled by the module-level constants above
 * (SAVE_SLOW_WARN_MS, SAVE_CRITICAL_WARN_MS, SAVE_TIMEOUT_MS) and can be
 * overridden per-call via opts.slowWarnMs / opts.criticalWarnMs / opts.timeoutMs.
 *
 * @param {Function} saveFn  - async () => runId
 * @param {object}   opts
 * @param {Function} opts.setSaveStatus    - React state setter for the status banner
 * @param {Function} opts.setLog           - React state setter for the run log
 * @param {number}   opts.prepareDurationMs
 * @param {number}   opts.snapClock        - simulation clock value for the log entry
 * @param {number}  [opts.slowWarnMs]      - override SAVE_SLOW_WARN_MS
 * @param {number}  [opts.criticalWarnMs]  - override SAVE_CRITICAL_WARN_MS
 * @param {number}  [opts.timeoutMs]       - override SAVE_TIMEOUT_MS
 * @returns {Promise<string|null>}  runId on success, null on error / timeout
 */
export async function doCloudSave(saveFn, {
  setSaveStatus,
  setLog,
  prepareDurationMs,
  snapClock,
  slowWarnMs     = SAVE_SLOW_WARN_MS,
  criticalWarnMs = SAVE_CRITICAL_WARN_MS,
  timeoutMs      = SAVE_TIMEOUT_MS,
}) {
  const saveStartedAt = nowPerf();

  const buildTickMessage = () => {
    const elapsed = nowPerf() - saveStartedAt;
    if (elapsed >= criticalWarnMs) return `⏳ Still saving — this is taking longer than usual`;
    return `Saving results…`;
  };

  const intervalId = setInterval(() => {
    setSaveStatus({ state: 'saving', message: buildTickMessage() });
  }, 1_000);

  // Race the actual save against a hard timeout.
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(Object.assign(new Error(`Supabase did not respond within ${formatDurationMs(timeoutMs)}`), { isSaveTimeout: true })),
      timeoutMs,
    )
  );

  try {
    const runId = await Promise.race([saveFn(), timeoutPromise]);
    const saveDurationMs = nowPerf() - saveStartedAt;
    clearInterval(intervalId);
    setSaveStatus({ state: 'success', message: `✓ Results saved` });
    setLog(prev => [...prev, { phase: "SAVE", time: snapClock, message: "✅ Cloud history record completed." }]);
    return runId;
  } catch (err) {
    clearInterval(intervalId);
    const detail  = err.message || "unknown error";
    const bannerMsg = err.isSaveTimeout
      ? `✗ Save timed out — Supabase did not respond. Try running again in a moment.`
      : `✗ Save failed: ${detail}`;
    const logMsg = err.isSaveTimeout
      ? `Save timed out — result not stored`
      : `Save failed: ${detail}`;
    setSaveStatus({ state: 'error', message: bannerMsg });
    setLog(prev => [...prev, { phase: "ERROR", time: snapClock, message: logMsg }]);
    return null;
  }
}
export const formatEstimate = value => Number.isFinite(value) ? Math.round(value).toLocaleString() : "—";
export const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
