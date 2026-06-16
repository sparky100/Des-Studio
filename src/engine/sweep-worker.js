// sweep-worker.js — Web Worker entry point for 2D sweep orchestration.
// Vite detects this file as a worker via the new Worker(new URL(...)) call in runSweepOffthread().
// run2DSweep() internally creates per-slot replication pools (nested workers), which are
// supported in Chrome 80+, Firefox 114+, and Safari 16.4+.

import { run2DSweep } from "./sweep-runner.js";

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  let cancelHandle = null;

  self.onmessage = ({ data }) => {
    const { type, payload } = data ?? {};

    if (type === "SWEEP_CANCEL") {
      cancelHandle?.cancel();
      return;
    }

    if (type !== "SWEEP_START") return;

    cancelHandle = run2DSweep({
      ...payload,
      onProgress(p) {
        self.postMessage({ type: "SWEEP_PROGRESS", payload: p });
      },
      onPointComplete(pointResult, meta) {
        self.postMessage({ type: "SWEEP_POINT_COMPLETE", payload: { pointResult, meta } });
      },
      onComplete(results) {
        self.postMessage({ type: "SWEEP_COMPLETE", payload: { results } });
      },
      onError(e) {
        self.postMessage({ type: "SWEEP_ERROR", payload: e });
      },
      onCancelled(p) {
        self.postMessage({ type: "SWEEP_CANCELLED", payload: p });
      },
    });
  };
}
