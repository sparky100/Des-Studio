// @ts-check
// sweep-worker.js — Web Worker entry point for 2D sweep orchestration.
// Vite detects this file as a worker via the new Worker(new URL(...)) call in runSweepOffthread().
// run2DSweep() internally creates per-slot replication pools (nested workers), which are
// supported in Chrome 80+, Firefox 114+, and Safari 16.4+.

import { run2DSweep } from "./sweep-runner.js";

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

    cancelHandle = run2DSweep({
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
