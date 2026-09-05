// @ts-check
// sweep-worker.js — Web Worker entry point for off-thread Study orchestration
// (grid2d via run2DSweep, sampled via runSampledStudy — see planType below).
// Vite detects this file as a worker via the new Worker(new URL(...)) call in runStudyOffthread().
// Both run2DSweep() and runSampledStudy() internally create per-slot replication
// pools (nested workers), which are supported in Chrome 80+, Firefox 114+, and Safari 16.4+.

import { run2DSweep, runSampledStudy } from "./sweep-runner.js";

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  /** @type {{ cancel: () => void }|null} */
  let cancelHandle = null;

  self.onmessage = (/** @type {MessageEvent} */ { data }) => {
    const { type, payload } = data ?? {};

    if (type === "SWEEP_CANCEL") {
      cancelHandle?.cancel();
      return;
    }

    if (type !== "SWEEP_START") return;

    // planType selects the plan; absent/"grid2d" keeps the pre-existing
    // default so every caller that predates the "sampled" plan type (i.e.
    // every caller before Phase 2) is unaffected.
    const runPlan = payload?.planType === "sampled" ? runSampledStudy : run2DSweep;
    cancelHandle = runPlan({
      ...payload,
      onProgress(/** @type {any} */ p) {
        self.postMessage({ type: "SWEEP_PROGRESS", payload: p });
      },
      onPointComplete(/** @type {any} */ pointResult, /** @type {any} */ meta) {
        self.postMessage({ type: "SWEEP_POINT_COMPLETE", payload: { pointResult, meta } });
      },
      onComplete(/** @type {any} */ results) {
        self.postMessage({ type: "SWEEP_COMPLETE", payload: { results } });
      },
      onError(/** @type {any} */ e) {
        self.postMessage({ type: "SWEEP_ERROR", payload: e });
      },
      onCancelled(/** @type {any} */ p) {
        self.postMessage({ type: "SWEEP_CANCELLED", payload: p });
      },
    });
  };
}
