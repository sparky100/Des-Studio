// sweep-runner.js — Orchestrate parametric sweeps across model parameter values
// Pure JS — no React, no DOM. Can run from main thread or worker.
// Sweep points are independent (applySweepValues deep-clones the model);
// concurrent slots use separate replication pools to satisfy the INIT_RUN constraint.

import { runReplications, createReplicationPool } from "./replication-runner.js";
import { summarizeReplicationResults } from "./statistics.js";
import { applySweepValues, applySweepValue, generateSweepValues, generate2DSweepValues } from "./sweep-params.js";

const SWEEP_METRICS = [
  "summary.total", "summary.avgWait", "summary.avgSvc", "summary.avgSojourn",
  "summary.avgTimeInSystem", "summary.served", "summary.servedRatio", "summary.reneged",
  "summary.totalCost", "summary.costPerServed",
];

// Compute how many grid points to run in parallel and how many replication workers
// each slot gets, given the available hardware concurrency.
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

function wrapReplications(options) {
  return new Promise((resolve, reject) => {
    const runner = runReplications({
      ...options,
      onComplete(results) { resolve(results); },
      onError(error) { reject(error); },
      onCancelled() { resolve(null); },
    });
    if (options._cancelRef) {
      options._cancelRef.current = () => runner.cancel();
    }
  });
}

export function runSweep({
  model,
  paramConfig,
  min,
  max,
  step,
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
  const values = generateSweepValues(min, max, step);
  const totalPoints = values.length;
  const results = [];
  let nextPoint = 0;
  let completedCount = 0;
  let cancelled = false;
  let errored = false;
  let activeSlots = 0;
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
      const value = values[pointIndex];

      onProgress?.({
        totalPoints,
        currentPoint: pointIndex,
        values,
        paramLabel: paramConfig?.label || "Parameter",
      });

      try {
        const pointModel = applySweepValue(model, paramConfig, value);
        const pointSeed = baseSeed + pointIndex * 10000;

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
          onProgress(progress) {
            onProgress?.({
              totalPoints,
              currentPoint: pointIndex,
              values,
              paramLabel: paramConfig?.label || "Parameter",
              pointReplications: progress,
            });
          },
          onReplicationComplete(payload, progress) {
            onProgress?.({
              totalPoints,
              currentPoint: pointIndex,
              values,
              paramLabel: paramConfig?.label || "Parameter",
              pointReplications: progress,
            });
          },
        });

        if (!replicationPayloads) {
          if (!cancelled) cancel();
          runNext();
          return;
        }

        const aggregateStats = summarizeReplicationResults(replicationPayloads, SWEEP_METRICS);
        const pointResult = {
          value,
          seed: pointSeed,
          replications: replicationPayloads,
          aggregateStats,
        };

        results.push(pointResult);
        completedCount++;
        onPointComplete?.(pointResult, {
          completedPoints: completedCount,
          totalPoints,
          value,
        });

        runNext();
      } catch (error) {
        if (!errored) {
          errored = true;
          cancel();
          onError?.({
            value,
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

  const grid = generate2DSweepValues(rangeA, rangeB);
  const rows = generateSweepValues(rangeA.min, rangeA.max, rangeA.step).length;
  const cols = generateSweepValues(rangeB.min, rangeB.max, rangeB.step).length;
  const totalPoints = grid.length;
  const results = [];
  let nextPoint = 0;
  let completedCount = 0;
  let cancelled = false;
  let errored = false;
  let activeSlots = 0;
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
      const { valueA, valueB } = grid[pointIndex];

      onProgress?.({
        totalPoints,
        currentPoint: pointIndex,
        gridSize: { rows, cols },
        paramLabels: [paramA?.label || "X", paramB?.label || "Y"],
      });

      try {
        const pointModel = applySweepValues(model, [
          { paramConfig: paramA, value: valueA },
          { paramConfig: paramB, value: valueB },
        ]);
        const pointSeed = baseSeed + pointIndex * 10000;

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
          onProgress(progress) {
            onProgress?.({
              totalPoints,
              currentPoint: pointIndex,
              gridSize: { rows, cols },
              paramLabels: [paramA?.label || "X", paramB?.label || "Y"],
              pointReplications: progress,
            });
          },
          onReplicationComplete(payload, progress) {
            onProgress?.({
              totalPoints,
              currentPoint: pointIndex,
              gridSize: { rows, cols },
              paramLabels: [paramA?.label || "X", paramB?.label || "Y"],
              pointReplications: progress,
            });
          },
        });

        if (!replicationPayloads) {
          if (!cancelled) cancel();
          runNext();
          return;
        }

        const aggregateStats = summarizeReplicationResults(replicationPayloads, SWEEP_METRICS);
        const pointResult = {
          valueA,
          valueB,
          seed: pointSeed,
          replications: replicationPayloads,
          aggregateStats,
        };

        results.push(pointResult);
        completedCount++;
        onPointComplete?.(pointResult, {
          completedPoints: completedCount,
          totalPoints,
          valueA,
          valueB,
        });

        runNext();
      } catch (error) {
        if (!errored) {
          errored = true;
          cancel();
          onError?.({
            valueA,
            valueB,
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

// Runs run2DSweep inside a dedicated Web Worker so the main thread stays free.
// Falls back to run2DSweep() in-thread when Worker is unavailable (node / tests).
export function runSweepOffthread(options = {}) {
  if (typeof Worker === "undefined") return run2DSweep(options);

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

  worker.onerror = (e) => {
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
