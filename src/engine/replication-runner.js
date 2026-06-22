import { makeBatchProgress } from "./progress-contract.js";
import { runReplicationPayload, WORKER_MESSAGE_TYPES } from "./worker.js";

function defaultWorkerCount(replications) {
  const cores = typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)
    ? navigator.hardwareConcurrency
    : 2;
  return Math.min(replications, Math.max(1, cores - 1));
}

function createBrowserWorker() {
  if (typeof Worker === "undefined") {
    return createInlineWorker();
  }
  return new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
}

function createInlineWorker() {
  let terminated = false;
  let shared = null;
  return {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      if (message?.type === WORKER_MESSAGE_TYPES.INIT_RUN) {
        shared = message.payload || null;
        return;
      }
      Promise.resolve().then(() => {
        if (terminated) return;
        try {
          const payload = runReplicationPayload(message.payload, shared);
          this.onmessage?.({ data: { type: WORKER_MESSAGE_TYPES.REPLICATION_COMPLETE, payload } });
        } catch (error) {
          this.onmessage?.({
            data: {
              type: WORKER_MESSAGE_TYPES.REPLICATION_ERROR,
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
      runtimeMetrics: result.runtimeMetrics,
      phaseCTruncated: result.phaseCTruncated || result.summary?.phaseCTruncated || false,
      cycleLimitReached: result.cycleLimitReached || result.summary?.cycleLimitReached || false,
      warnings: result.warnings || result.summary?.warnings || [],
      entitySummary: result.entitySummary,
      entitySummaryCompact: result.entitySummaryCompact,
      log: [],
      timeSeries: result.timeSeries,
      waitDist: result.waitDist,
      waitByArrival: result.waitByArrival,
      perQueue: result.perQueue,
    },
  };
}

// A reusable pool of replication workers. Pass it to successive runReplications
// calls (e.g. adaptive-batch rounds, sweep points) so workers are spawned once
// instead of once per round. The pool is destroyed automatically if a run is
// cancelled or fails; otherwise the owner must call destroy() when finished.
export function createReplicationPool({ createWorker = createBrowserWorker } = {}) {
  const workers = [];
  let destroyed = false;
  return {
    get destroyed() {
      return destroyed;
    },
    get(index) {
      if (destroyed) throw new Error("Replication pool has been destroyed.");
      while (workers.length <= index) {
        workers.push(createWorker());
      }
      return workers[index];
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const worker of workers) {
        worker.terminate?.();
      }
      workers.length = 0;
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
    maxCPasses = 5000,
    collectTimeSeries,
    schedulesMap,    // ADR-016: resolved schedule rows keyed by scheduleRef UUID
    workerCount,
    pool,            // optional createReplicationPool() instance shared across runs
    onProgress,
    onReplicationComplete,
    onTimeSeriesSample,
    onError,
    onComplete,
    onCancelled,
    createWorker = createBrowserWorker,
  } = options;

  const total = Math.max(1, Number.parseInt(replications, 10) || 1);
  const poolSize = Math.max(1, Math.min(workerCount || defaultWorkerCount(total), total));
  const results = new Array(total);

  // Sent once per worker via INIT_RUN; RUN_REPLICATION messages then only carry
  // {replicationIndex, seed}, avoiding a structured clone of the model per job.
  const sharedConfig = {
    model,
    warmupPeriod,
    maxSimTime,
    terminationCondition,
    maxCycles,
    maxCPasses,
    collectTimeSeries,
    // Batch replications never surface the structured trace (compaction strips
    // log, persistence strips trace), so skip building it inside the engine.
    collectTrace: options.collectTrace === true,
    schedulesMap,
  };

  const workers = [];
  const idleWorkers = [];
  const activeJobs = new Map();
  let nextIndex = 0;
  let completed = 0;
  let cancelled = false;
  let failed = false;

  const progress = () => makeBatchProgress({
    completed,
    total,
    running: activeJobs.size,
    pending: Math.max(0, total - completed - activeJobs.size),
    cancelled,
    workerCount: poolSize,
  });

  const emitProgress = () => onProgress?.(progress());

  // Run finished cleanly: pooled workers stay alive for the next run.
  const releaseWorkers = () => {
    if (!pool) {
      for (const worker of workers) {
        worker.terminate?.();
      }
    }
    workers.length = 0;
    idleWorkers.length = 0;
    activeJobs.clear();
  };

  // Cancel/failure: in-flight jobs cannot be reclaimed, so terminate everything.
  const destroyWorkers = () => {
    if (pool) {
      pool.destroy();
    } else {
      for (const worker of workers) {
        worker.terminate?.();
      }
    }
    workers.length = 0;
    idleWorkers.length = 0;
    activeJobs.clear();
  };

  const failRun = (error) => {
    if (cancelled || failed) return;
    failed = true;
    destroyWorkers();
    onError?.(error);
    emitProgress();
  };

  const attachWorker = (worker) => {
    worker.onmessage = (event) => {
      if (cancelled || failed) return;
      const message = event.data;
      const job = activeJobs.get(worker);
      activeJobs.delete(worker);

      if (message?.type === WORKER_MESSAGE_TYPES.REPLICATION_COMPLETE) {
        const payload = compactReplicationPayload(message.payload);
        if (onTimeSeriesSample && payload.result?.timeSeries) {
          onTimeSeriesSample(payload.result.timeSeries);
          payload.result.timeSeries = undefined;
        }
        results[payload.replicationIndex] = payload;
        completed++;
        idleWorkers.push(worker);
        onReplicationComplete?.(payload, progress());
        emitProgress();

        if (completed === total) {
          releaseWorkers();
          onComplete?.(results.slice());
        } else {
          schedule();
        }
        return;
      }

      failRun(message?.payload || {
        replicationIndex: job?.replicationIndex,
        seed: job?.seed,
        message: "Replication worker failed.",
      });
    };

    worker.onerror = (error) => {
      const job = activeJobs.get(worker);
      failRun({
        replicationIndex: job?.replicationIndex,
        seed: job?.seed,
        message: error?.message || "Replication worker failed.",
        stack: error?.error?.stack || "",
      });
    };
  };

  const spawnWorker = () => {
    const worker = pool ? pool.get(workers.length) : createWorker();
    workers.push(worker);
    attachWorker(worker);
    worker.postMessage({ type: WORKER_MESSAGE_TYPES.INIT_RUN, payload: sharedConfig });
    return worker;
  };

  const schedule = () => {
    if (cancelled || failed) return;

    while (nextIndex < total && (idleWorkers.length > 0 || workers.length < poolSize)) {
      const replicationIndex = nextIndex++;
      const seed = baseSeed + replicationIndex;
      let worker = idleWorkers.pop();
      if (!worker) {
        try {
          worker = spawnWorker();
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
      activeJobs.set(worker, { replicationIndex, seed });

      try {
        worker.postMessage({
          type: WORKER_MESSAGE_TYPES.RUN_REPLICATION,
          payload: { replicationIndex, seed, entityDetail: replicationIndex === 0 },
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
      if (cancelled || failed || completed === total) return;
      cancelled = true;
      destroyWorkers();
      emitProgress();
      onCancelled?.(progress());
    },
  };
}
