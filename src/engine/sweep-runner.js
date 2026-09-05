// @ts-check
// sweep-runner.js — Orchestrate parametric sweeps across model parameter values
// Pure JS — no React, no DOM. Can run from main thread or worker.
// Sweep points are independent (applySweepValues deep-clones the model);
// concurrent slots use separate replication pools to satisfy the INIT_RUN constraint.

import { runReplications, createReplicationPool } from "./replication-runner.js";
import {
  summarizeReplicationResults, confidenceInterval95,
  SUMMARY_METRICS, scopedGoalKey, resolveGoalValueForReplication,
} from "./statistics.js";
import { applySweepValues, applySweepValue, generateSweepValues, generate2DSweepValues, sampleLatinHypercube, checkStudyBudget } from "./sweep-params.js";

// Add each of the model's scoped goals as its own CI-summarized aggregateStats
// entry (keyed via scopedGoalKey), computed per-replication and reduced the
// same way as every other sweep metric. Without this, scoped goals (the only
// kind most real models have — see examples/bike-shop.json) have nothing in
// aggregateStats for src/llm/prompts.js's evaluateSweepPointGoals to read,
// which is what made "N/N meet all goals" always report true.
/**
 * @param {any[]|undefined} goals
 * @param {any[]} replicationPayloads
 * @param {Record<string, any>} aggregateStats
 */
function addScopedGoalStats(goals, replicationPayloads, aggregateStats) {
  for (const g of goals || []) {
    if (!g?.scope || !g.metric || g.target == null) continue;
    const key = scopedGoalKey(g.metric, g.scope);
    if (!key) continue;
    const values = replicationPayloads
      .map(rp => resolveGoalValueForReplication(g, rp))
      .filter(v => v != null && Number.isFinite(v));
    if (values.length) aggregateStats[key] = confidenceInterval95(values);
  }
}

// Compute how many grid points to run in parallel and how many replication workers
// each slot gets, given the available hardware concurrency.
/**
 * @param {number} totalPoints
 * @param {number} replications
 */
function sweepParallelism(totalPoints, replications) {
  const cores = typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)
    ? navigator.hardwareConcurrency : 2;
  const totalWorkers = Math.max(1, cores - 1);
  const concurrentPoints = Math.min(
    totalPoints,
    Math.max(1, Math.floor(totalWorkers / Math.max(1, replications)))
  );
  const workersPerPoint = Math.max(
    1,
    Math.min(replications, Math.floor(totalWorkers / concurrentPoints))
  );
  return { concurrentPoints, workersPerPoint };
}

// options is a runReplications()-shaped bag plus an internal _cancelRef used to
// expose that point's cancel() back to the caller before the promise settles.
/** @param {Record<string, any>} options */
function wrapReplications(options) {
  return new Promise((resolve, reject) => {
    const runner = runReplications({
      ...options,
      onComplete(/** @type {any} */ results) { resolve(results); },
      onError(/** @type {any} */ error) { reject(error); },
      onCancelled() { resolve(null); },
    });
    if (options._cancelRef) {
      options._cancelRef.current = () => runner.cancel();
    }
  });
}

/**
 * Generic, plan-type-agnostic points runner. grid1d (runSweep), grid2d
 * (run2DSweep), and sampled (runSampledStudy) all funnel through this —
 * they differ only in how `points` is produced and how a point maps onto a
 * model patch / seed / result shape, via the four callbacks below. This is
 * "the runner takes a list of points" from the Studies plan: adding a new
 * plan type (e.g. Phase 3's sequential) means generating a new points[]
 * array and passing new callbacks, not touching this loop.
 *
 * @param {{
 *   model?: any,
 *   points: any[],
 *   applyPointToModel: (model: any, point: any) => any,
 *   seedForPoint: (baseSeed: number, pointIndex: number) => number,
 *   buildProgressExtra: (pointIndex: number) => Record<string, any>,
 *   buildPointResult: (point: any, pointIndex: number, seed: number, replicationPayloads: any[], aggregateStats: Record<string, any>) => any,
 *   replications?: number,
 *   baseSeed?: number,
 *   warmupPeriod?: number,
 *   maxSimTime?: number|null,
 *   terminationCondition?: any,
 *   collectTimeSeries?: boolean,
 *   schedulesMap?: Record<string, any>,
 *   onProgress?: (progress: Record<string, any>) => void,
 *   onPointComplete?: (pointResult: Record<string, any>, meta: Record<string, any>) => void,
 *   onError?: (error: Record<string, any>) => void,
 *   onComplete?: (results: any[]) => void,
 *   onCancelled?: (info: Record<string, any>) => void,
 * }} options
 * @returns {{ cancel: () => void }}
 */
function runPointsPlan({
  model,
  points,
  applyPointToModel,
  seedForPoint,
  buildProgressExtra,
  buildPointResult,
  replications = 1,
  baseSeed = 0,
  warmupPeriod = 0,
  maxSimTime = null,
  terminationCondition = null,
  collectTimeSeries = false,
  schedulesMap,
  onProgress,
  onPointComplete,
  onError,
  onComplete,
  onCancelled,
}) {
  const totalPoints = points.length;
  /** @type {any[]} */
  const results = [];
  let nextPoint = 0;
  let completedCount = 0;
  let cancelled = false;
  let errored = false;
  let activeSlots = 0;
  /** @type {Set<() => void>} */
  const activeCancelFns = new Set();

  const { concurrentPoints, workersPerPoint } = sweepParallelism(totalPoints, replications);

  const cancel = () => {
    cancelled = true;
    for (const fn of activeCancelFns) fn();
  };

  const finalize = () => {
    if (errored) return;
    if (cancelled) {
      onCancelled?.({ results, completedPoints: completedCount, totalPoints });
    } else {
      onComplete?.(results);
    }
  };

  const makeSlot = () => {
    const pool = createReplicationPool();
    /** @type {{ current: (() => void) | null }} */
    const pointCancelRef = { current: null };
    const slotCancel = () => pointCancelRef.current?.();
    activeCancelFns.add(slotCancel);

    const runNext = async () => {
      if (cancelled || nextPoint >= totalPoints) {
        activeCancelFns.delete(slotCancel);
        pool.destroy();
        activeSlots--;
        if (activeSlots === 0) finalize();
        return;
      }

      const pointIndex = nextPoint++;
      const point = points[pointIndex];

      onProgress?.({ totalPoints, currentPoint: pointIndex, ...buildProgressExtra(pointIndex) });

      try {
        const pointModel = applyPointToModel(model, point);
        const pointSeed = seedForPoint(baseSeed, pointIndex);

        const replicationPayloads = await wrapReplications({
          model: pointModel,
          replications,
          baseSeed: pointSeed,
          warmupPeriod,
          maxSimTime,
          terminationCondition,
          collectTimeSeries,
          schedulesMap,
          pool,
          workerCount: workersPerPoint,
          _cancelRef: pointCancelRef,
          onProgress(/** @type {any} */ progress) {
            onProgress?.({ totalPoints, currentPoint: pointIndex, ...buildProgressExtra(pointIndex), pointReplications: progress });
          },
          onReplicationComplete(/** @type {any} */ _payload, /** @type {any} */ progress) {
            onProgress?.({ totalPoints, currentPoint: pointIndex, ...buildProgressExtra(pointIndex), pointReplications: progress });
          },
        });

        if (!replicationPayloads) {
          if (!cancelled) cancel();
          runNext();
          return;
        }

        const aggregateStats = summarizeReplicationResults(replicationPayloads, SUMMARY_METRICS);
        addScopedGoalStats(model?.goals, replicationPayloads, aggregateStats);
        const pointResult = buildPointResult(point, pointIndex, pointSeed, replicationPayloads, aggregateStats);

        results.push(pointResult);
        completedCount++;
        onPointComplete?.(pointResult, { completedPoints: completedCount, totalPoints, point });

        runNext();
      } catch (/** @type {any} */ error) {
        if (!errored) {
          errored = true;
          cancel();
          onError?.({
            pointIndex,
            message: error?.message || String(error),
            stack: error?.stack,
            results,
            completedPoints: completedCount,
            totalPoints,
          });
        }
        activeCancelFns.delete(slotCancel);
        pool.destroy();
        activeSlots--;
      }
    };

    return runNext;
  };

  for (let i = 0; i < concurrentPoints; i++) {
    activeSlots++;
    makeSlot()();
  }

  return { cancel };
}

// A plan-level error (e.g. the budget guard, or an invalid range) happens
// synchronously, before any point has run. Report it through onError on a
// microtask — same async contract every other error path in this runner
// already uses — rather than throwing out of the run*() call itself, so
// callers never need a try/catch around a run*() invocation to stay safe.
/**
 * @param {((error: any) => void) | undefined} onError
 * @param {string} message
 */
function reportPlanError(onError, message) {
  Promise.resolve().then(() => onError?.({ message, results: [], completedPoints: 0, totalPoints: 0 }));
  return { cancel() {} };
}

/**
 * @param {{
 *   model?: import('../contracts/model').DesModelJson,
 *   paramConfig?: Record<string, any>,
 *   min?: number,
 *   max?: number,
 *   step?: number,
 *   replications?: number,
 *   baseSeed?: number,
 *   warmupPeriod?: number,
 *   maxSimTime?: number|null,
 *   terminationCondition?: any,
 *   collectTimeSeries?: boolean,
 *   schedulesMap?: Record<string, any>,
 *   onProgress?: (progress: Record<string, any>) => void,
 *   onPointComplete?: (pointResult: Record<string, any>, meta: Record<string, any>) => void,
 *   onError?: (error: Record<string, any>) => void,
 *   onComplete?: (results: any[]) => void,
 *   onCancelled?: (info: Record<string, any>) => void,
 * }} [options]
 * @returns {{ cancel: () => void }}
 */
export function runSweep({
  model,
  paramConfig,
  min = 0,
  max = 0,
  step = 1,
  replications = 1,
  baseSeed = 0,
  warmupPeriod = 0,
  maxSimTime = null,
  terminationCondition = null,
  collectTimeSeries = false,
  schedulesMap,    // ADR-016: resolved schedule rows keyed by scheduleRef UUID
  onProgress,
  onPointComplete,
  onError,
  onComplete,
  onCancelled,
} = {}) {
  /** @type {number[]} */
  let values;
  try {
    values = generateSweepValues(min, max, step, replications);
  } catch (/** @type {any} */ error) {
    return reportPlanError(onError, error?.message || String(error));
  }

  return runPointsPlan({
    model, points: values, replications, baseSeed, warmupPeriod, maxSimTime, terminationCondition,
    collectTimeSeries, schedulesMap, onProgress, onPointComplete, onError, onComplete, onCancelled,
    applyPointToModel: (m, value) => applySweepValue(/** @type {any} */ (m), /** @type {any} */ (paramConfig), value),
    seedForPoint: (base, i) => base + i * 10000,
    buildProgressExtra: () => ({ values, paramLabel: paramConfig?.label || "Parameter" }),
    buildPointResult: (value, _pointIndex, seed, replicationPayloads, aggregateStats) => ({
      value, seed, replications: replicationPayloads, aggregateStats,
    }),
  });
}

/**
 * @param {{
 *   model?: import('../contracts/model').DesModelJson,
 *   paramConfigs?: Record<string, any>[],
 *   ranges?: Array<{ min: number, max: number, step: number }>,
 *   replications?: number,
 *   baseSeed?: number,
 *   warmupPeriod?: number,
 *   maxSimTime?: number|null,
 *   terminationCondition?: any,
 *   collectTimeSeries?: boolean,
 *   schedulesMap?: Record<string, any>,
 *   onProgress?: (progress: Record<string, any>) => void,
 *   onPointComplete?: (pointResult: Record<string, any>, meta: Record<string, any>) => void,
 *   onError?: (error: Record<string, any>) => void,
 *   onComplete?: (results: any[]) => void,
 *   onCancelled?: (info: Record<string, any>) => void,
 * }} [options]
 * @returns {{ cancel: () => void }}
 */
export function run2DSweep({
  model,
  paramConfigs = [],
  ranges = [],
  replications = 1,
  baseSeed = 0,
  warmupPeriod = 0,
  maxSimTime = null,
  terminationCondition = null,
  collectTimeSeries = false,
  schedulesMap,    // ADR-016: resolved schedule rows keyed by scheduleRef UUID
  onProgress,
  onPointComplete,
  onError,
  onComplete,
  onCancelled,
} = {}) {
  if (paramConfigs.length !== 2 || ranges.length !== 2) {
    throw new Error("run2DSweep requires exactly 2 paramConfigs and 2 ranges");
  }

  const [paramA, paramB] = paramConfigs;
  const [rangeA, rangeB] = ranges;

  /** @type {Array<{ valueA: number, valueB: number }>} */
  let grid;
  try {
    grid = generate2DSweepValues(rangeA, rangeB, replications);
  } catch (/** @type {any} */ error) {
    return reportPlanError(onError, error?.message || String(error));
  }
  const rows = new Set(grid.map(p => p.valueA)).size;
  const cols = new Set(grid.map(p => p.valueB)).size;
  const paramLabels = [paramA?.label || "X", paramB?.label || "Y"];

  return runPointsPlan({
    model, points: grid, replications, baseSeed, warmupPeriod, maxSimTime, terminationCondition,
    collectTimeSeries, schedulesMap, onProgress, onPointComplete, onError, onComplete, onCancelled,
    applyPointToModel: (m, point) => applySweepValues(/** @type {any} */ (m), [
      { paramConfig: paramA, value: point.valueA },
      { paramConfig: paramB, value: point.valueB },
    ]),
    seedForPoint: (base, i) => base + i * 10000,
    buildProgressExtra: () => ({ gridSize: { rows, cols }, paramLabels }),
    buildPointResult: (point, _pointIndex, seed, replicationPayloads, aggregateStats) => ({
      valueA: point.valueA, valueB: point.valueB, seed, replications: replicationPayloads, aggregateStats,
    }),
  });
}

/**
 * Sampled study — Latin hypercube sample over N sweepable parameters (a
 * Study's "sampled" plan type). Unlike grid1d/grid2d, the number of points
 * is chosen directly (`points`) rather than derived from a step size, and
 * the replication budget guard (points x replications) is the primary way
 * a modeller controls total run cost.
 *
 * @param {{
 *   model?: import('../contracts/model').DesModelJson,
 *   parameters?: Array<{ path: string, label?: string, type?: string, range?: { min: number, max: number } }>,
 *   points?: number,
 *   replications?: number,
 *   baseSeed?: number,
 *   warmupPeriod?: number,
 *   maxSimTime?: number|null,
 *   terminationCondition?: any,
 *   collectTimeSeries?: boolean,
 *   schedulesMap?: Record<string, any>,
 *   onProgress?: (progress: Record<string, any>) => void,
 *   onPointComplete?: (pointResult: Record<string, any>, meta: Record<string, any>) => void,
 *   onError?: (error: Record<string, any>) => void,
 *   onComplete?: (results: any[]) => void,
 *   onCancelled?: (info: Record<string, any>) => void,
 * }} [options]
 * @returns {{ cancel: () => void }}
 */
export function runSampledStudy({
  model,
  parameters = [],
  points: pointCount = 1,
  replications = 1,
  baseSeed = 0,
  warmupPeriod = 0,
  maxSimTime = null,
  terminationCondition = null,
  collectTimeSeries = false,
  schedulesMap,
  onProgress,
  onPointComplete,
  onError,
  onComplete,
  onCancelled,
} = {}) {
  if (!parameters.length) {
    return reportPlanError(onError, "runSampledStudy requires at least one parameter.");
  }

  /** @type {Array<{ params: Array<{ path: string, value: number }> }>} */
  let sampledPoints;
  try {
    checkStudyBudget(pointCount, replications);
    sampledPoints = sampleLatinHypercube(parameters, { points: pointCount, baseSeed });
  } catch (/** @type {any} */ error) {
    return reportPlanError(onError, error?.message || String(error));
  }

  const paramLabels = parameters.map(p => p.label || p.path);

  return runPointsPlan({
    model, points: sampledPoints, replications, baseSeed, warmupPeriod, maxSimTime, terminationCondition,
    collectTimeSeries, schedulesMap, onProgress, onPointComplete, onError, onComplete, onCancelled,
    applyPointToModel: (m, point) => applySweepValues(/** @type {any} */ (m), point.params.map(
      (/** @type {any} */ p, /** @type {number} */ i) => ({ paramConfig: parameters[i], value: p.value })
    )),
    seedForPoint: (base, i) => base + i * 10000,
    buildProgressExtra: () => ({ paramLabels }),
    buildPointResult: (point, _pointIndex, seed, replicationPayloads, aggregateStats) => ({
      params: point.params, seed, replications: replicationPayloads, aggregateStats,
    }),
  });
}

// Runs run2DSweep or runSampledStudy inside a dedicated Web Worker so the main
// thread stays free. `options.planType` selects which ("sampled" or, by
// default, the grid2d path — kept as the default for backward compatibility
// with every existing caller of runSweepOffthread(), which predates the
// sampled plan type and never passes planType). Falls back to running
// in-thread when Worker is unavailable (node / tests).
/** @param {Record<string, any>} [options] */
export function runStudyOffthread(options = {}) {
  const runInThread = options.planType === "sampled" ? runSampledStudy : run2DSweep;
  if (typeof Worker === "undefined") return runInThread(options);

  const { onProgress, onPointComplete, onComplete, onError, onCancelled, ...payload } = options;
  const worker = new Worker(new URL("./sweep-worker.js", import.meta.url), { type: "module" });
  let terminated = false;

  const terminate = () => {
    if (!terminated) { terminated = true; worker.terminate(); }
  };

  worker.onmessage = ({ data }) => {
    if (terminated) return;
    const { type: t, payload: p } = data ?? {};
    if (t === "SWEEP_PROGRESS")       { onProgress?.(p); return; }
    if (t === "SWEEP_POINT_COMPLETE") { onPointComplete?.(p.pointResult, p.meta); return; }
    if (t === "SWEEP_COMPLETE")       { terminate(); onComplete?.(p.results); return; }
    if (t === "SWEEP_ERROR")          { terminate(); onError?.(p); return; }
    if (t === "SWEEP_CANCELLED")      { terminate(); onCancelled?.(p); return; }
  };

  worker.onerror = (/** @type {any} */ e) => {
    terminate();
    onError?.({ message: e?.message || "Sweep worker failed." });
  };

  worker.postMessage({ type: "SWEEP_START", payload });

  return {
    cancel() {
      if (!terminated) worker.postMessage({ type: "SWEEP_CANCEL" });
    },
  };
}

// Pre-Phase-2 name, kept as an alias — every existing caller (execute/index.jsx,
// tests) imports runSweepOffthread and never passed planType, so this is a
// drop-in rename with identical (grid2d) default behaviour.
export const runSweepOffthread = runStudyOffthread;
