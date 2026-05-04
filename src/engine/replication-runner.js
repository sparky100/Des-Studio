import { runReplicationPayload } from "./worker.js";

function defaultWorkerCount(replications) {
  const cores = typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)
    ? navigator.hardwareConcurrency
    : 2;
  return Math.min(replications, Math.max(1, cores - 1), 4);
}

function createBrowserWorker() {
  if (typeof Worker === "undefined") {
    return createInlineWorker();
  }
  return new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
}

function createInlineWorker() {
  let terminated = false;
  return {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      Promise.resolve().then(() => {
        if (terminated) return;
        try {
          const payload = runReplicationPayload(message.payload);
          this.onmessage?.({ data: { type: "REPLICATION_COMPLETE", payload } });
        } catch (error) {
          this.onmessage?.({
            data: {
              type: "REPLICATION_ERROR",
              payload: {
                replicationIndex: message.payload?.replicationIndex,
                seed: message.payload?.seed,
                message: error?.message || String(error),
                stack: error?.stack || "",
              },
            },
          });
        }
      });
    },
    terminate() {
      terminated = true;
    },
  };
}

export function compactReplicationPayload(payload) {
  if (!payload?.result) return payload;
  const { result } = payload;
  return {
    ...payload,
    result: {
      finalTime: result.finalTime,
      snap: result.snap,
      summary: result.summary,
      entitySummary: result.entitySummary,
      log: [],
    },
  };
}

export function runReplications(options = {}) {
  const {
    model,
    replications = 1,
    baseSeed = 0,
    warmupPeriod = 0,
    maxSimTime = null,
    terminationCondition = null,
    maxCycles = 5000,
    maxCPasses = 500,
    workerCount,
    onProgress,
    onReplicationComplete,
    onError,
    onComplete,
    onCancelled,
    createWorker = createBrowserWorker,
  } = options;

  const total = Math.max(1, Number.parseInt(replications, 10) || 1);
  const poolSize = Math.max(1, Math.min(workerCount || defaultWorkerCount(total), total));
  const results = new Array(total);
  const activeWorkers = new Map();
  let nextIndex = 0;
  let completed = 0;
  let cancelled = false;
  let failed = false;

  const progress = () => ({
    completed,
    total,
    running: activeWorkers.size,
    pending: Math.max(0, total - completed - activeWorkers.size),
    cancelled,
    workerCount: poolSize,
  });

  const emitProgress = () => onProgress?.(progress());

  const cleanupWorker = (replicationIndex) => {
    const worker = activeWorkers.get(replicationIndex);
    if (worker) {
      worker.terminate?.();
      activeWorkers.delete(replicationIndex);
    }
  };

  const terminateActiveWorkers = () => {
    for (const worker of activeWorkers.values()) {
      worker.terminate?.();
    }
    activeWorkers.clear();
  };

  const failRun = (error) => {
    if (cancelled || failed) return;
    failed = true;
    terminateActiveWorkers();
    onError?.(error);
    emitProgress();
  };

  const schedule = () => {
    if (cancelled || failed) return;

    while (activeWorkers.size < poolSize && nextIndex < total) {
      const replicationIndex = nextIndex++;
      const seed = baseSeed + replicationIndex;
      let worker;
      try {
        worker = createWorker();
      } catch (error) {
        failRun({
          replicationIndex,
          seed,
          message: error?.message || "Replication worker failed to start.",
          stack: error?.stack || "",
        });
        return;
      }
      activeWorkers.set(replicationIndex, worker);

      worker.onmessage = (event) => {
        if (cancelled || failed) return;
        const message = event.data;
        cleanupWorker(replicationIndex);

        if (message?.type === "REPLICATION_COMPLETE") {
          const payload = compactReplicationPayload(message.payload);
          results[payload.replicationIndex] = payload;
          completed++;
          onReplicationComplete?.(payload, progress());
          emitProgress();

          if (completed === total) {
            onComplete?.(results.slice());
          } else {
            schedule();
          }
          return;
        }

        failRun(message?.payload || {
          replicationIndex,
          seed,
          message: "Replication worker failed.",
        });
      };

      worker.onerror = (error) => {
        failRun({
          replicationIndex,
          seed,
          message: error?.message || "Replication worker failed.",
          stack: error?.error?.stack || "",
        });
      };

      try {
        worker.postMessage({
          type: "RUN_REPLICATION",
          payload: {
            replicationIndex,
            model,
            seed,
            warmupPeriod,
            maxSimTime,
            terminationCondition,
            maxCycles,
            maxCPasses,
          },
        });
      } catch (error) {
        failRun({
          replicationIndex,
          seed,
          message: error?.message || "Replication worker failed to start.",
          stack: error?.stack || "",
        });
        return;
      }
    }

    emitProgress();
  };

  schedule();

  return {
    cancel() {
      if (cancelled || completed === total) return;
      cancelled = true;
      terminateActiveWorkers();
      emitProgress();
      onCancelled?.(progress());
    },
  };
}
