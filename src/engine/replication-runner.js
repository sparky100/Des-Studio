// @ts-check
import { makeBatchProgress } from "./progress-contract.js";
import { runReplicationPayload, WORKER_MESSAGE_TYPES } from "./worker.js";

/**
 * @typedef {{
 *   onmessage: ((event: { data: any }) => void) | null,
 *   onerror: ((error: any) => void) | null,
 *   postMessage: (message: any) => void,
 *   terminate?: () => void,
 * }} ReplicationWorker
 */

/** @param {number} replications */
function defaultWorkerCount(replications) {
  const cores = typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)
    ? navigator.hardwareConcurrency
    : 2;
  return Math.min(replications, Math.max(1, cores - 1));
}

/** @returns {ReplicationWorker} */
function createBrowserWorker() {
  if (typeof Worker === "undefined") {
    return createInlineWorker();
  }
  return /** @type {ReplicationWorker} */ (
    new Worker(new URL("./worker.js", import.meta.url), { type: "module" })
  );
}

/** @returns {ReplicationWorker} */
function createInlineWorker() {
  let terminated = false;
  /** @type {Record<string, any>|null} */
  let shared = null;
  /** @type {ReplicationWorker} */
  const worker = {
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
          worker.onmessage?.({ data: { type: WORKER_MESSAGE_TYPES.REPLICATION_COMPLETE, payload } });
        } catch (/** @type {any} */ error) {
          worker.onmessage?.({
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
  return worker;
}

/** @param {Record<string, any>} payload */
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
/**
 * @param {{ createWorker?: () => ReplicationWorker }} [options]
 */
export function createReplicationPool({ createWorker = createBrowserWorker } = {}) {
  /** @type {ReplicationWorker[]} */
  const workers = [];
  let destroyed = false;
  return {
    get destroyed() {
      return destroyed;
    },
    /** @param {number} index */
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

/**
 * @typedef {{
 *   model?: import('../contracts/model').DesModelJson,
 *   replications?: number|string,
 *   baseSeed?: number,
 *   warmupPeriod?: number,
 *   maxSimTime?: number|null,
 *   terminationCondition?: any,
 *   maxCycles?: number,
 *   maxCPasses?: number,
 *   collectTimeSeries?: boolean,
 *   collectTrace?: boolean,
 *   schedulesMap?: Record<string, any>,
 *   workerCount?: number,
 *   pool?: ReturnType<typeof createReplicationPool>,
 *   onProgress?: (progress: Record<string, any>) => void,
 *   onReplicationComplete?: (payload: Record<string, any>, progress: Record<string, any>) => void,
 *   onTimeSeriesSample?: (timeSeries: any) => void,
 *   onError?: (error: any) => void,
 *   onComplete?: (results: any[]) => void,
 *   onCancelled?: (progress: Record<string, any>) => void,
 *   createWorker?: () => ReplicationWorker,
 * }} RunReplicationsOptions
 */

/**
 * @param {RunReplicationsOptions} [options]
 * @returns {{ cancel: () => void }}
 */
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

  const total = Math.max(1, Number.parseInt(String(replications), 10) || 1);
  const poolSize = Math.max(1, Math.min(workerCount || defaultWorkerCount(total), total));
  /** @type {any[]} */
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

  /** @type {ReplicationWorker[]} */
  const workers = [];
  /** @type {ReplicationWorker[]} */
  const idleWorkers = [];
  /** @type {Map<ReplicationWorker, { replicationIndex: number, seed: number }>} */
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

  /** @param {any} error */
  const failRun = (error) => {
    if (cancelled || failed) return;
    failed = true;
    destroyWorkers();
    onError?.(error);
    emitProgress();
  };

  /** @param {ReplicationWorker} worker */
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

  /** @returns {ReplicationWorker} */
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
        } catch (/** @type {any} */ error) {
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
      } catch (/** @type {any} */ error) {
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
