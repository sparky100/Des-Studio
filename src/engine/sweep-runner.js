// sweep-runner.js — Orchestrate parametric sweeps across model parameter values
// Pure JS — no React, no DOM. Can run from main thread or worker.
// Sweep points run sequentially (each modifies the model); replications within a point run in parallel.

import { runReplications } from "./replication-runner.js";
import { summarizeReplicationResults } from "./statistics.js";
import { applySweepValues, applySweepValue, generateSweepValues, generate2DSweepValues } from "./sweep-params.js";

const SWEEP_METRICS = [
  "summary.avgWait", "summary.avgSvc", "summary.avgSojourn", "summary.avgTimeInSystem",
  "summary.served", "summary.servedRatio", "summary.reneged",
];

function wrapReplications(options) {
  return new Promise((resolve, reject) => {
    const runner = runReplications({
      ...options,
      onProgress: options.onProgress,
      onReplicationComplete: options.onReplicationComplete,
      onComplete(results) {
        resolve(results);
      },
      onError(error) {
        reject(error);
      },
      onCancelled() {
        resolve(null); // cancelled
      },
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
  let cancelled = false;
  let currentPoint = 0;
  const pointCancelRef = { current: null };

  const emitProgress = () => {
    onProgress?.({
      totalPoints,
      currentPoint,
      values,
      paramLabel: paramConfig?.label || "Parameter",
    });
  };

  const cancel = () => {
    cancelled = true;
    pointCancelRef.current?.();
  };

  const runNextPoint = async () => {
    if (cancelled || currentPoint >= totalPoints) {
      if (cancelled) {
        onCancelled?.({ results, completedPoints: results.length, totalPoints });
      } else {
        onComplete?.(results);
      }
      return;
    }

    const value = values[currentPoint];
    const pointIndex = currentPoint;
    currentPoint++;

    emitProgress();

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
        // cancelled mid-point
        cancel();
        runNextPoint();
        return;
      }

      const aggregateStats = summarizeReplicationResults(replicationPayloads, SWEEP_METRICS);
      const pointResult = {
        value,
        seed: pointSeed,
        replications: replicationPayloads,
        aggregateStats,
        pointModel,
      };

      results.push(pointResult);
      onPointComplete?.(pointResult, {
        completedPoints: results.length,
        totalPoints,
        value,
      });

      runNextPoint();
    } catch (error) {
      onError?.({
        value,
        pointIndex,
        message: error?.message || String(error),
        stack: error?.stack,
        results,
        completedPoints: results.length,
        totalPoints,
      });
    }
  };

  runNextPoint();

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
  let cancelled = false;
  let currentPoint = 0;
  const pointCancelRef = { current: null };

  const emitProgress = () => {
    onProgress?.({
      totalPoints,
      currentPoint,
      gridSize: { rows, cols },
      paramLabels: [paramA?.label || "X", paramB?.label || "Y"],
    });
  };

  const cancel = () => {
    cancelled = true;
    pointCancelRef.current?.();
  };

  const runNextPoint = async () => {
    if (cancelled || currentPoint >= totalPoints) {
      if (cancelled) {
        onCancelled?.({ results, completedPoints: results.length, totalPoints });
      } else {
        onComplete?.(results);
      }
      return;
    }

    const { valueA, valueB } = grid[currentPoint];
    const pointIndex = currentPoint;
    currentPoint++;

    emitProgress();

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
        cancel();
        runNextPoint();
        return;
      }

      const aggregateStats = summarizeReplicationResults(replicationPayloads, SWEEP_METRICS);
      const pointResult = {
        valueA,
        valueB,
        seed: pointSeed,
        replications: replicationPayloads,
        aggregateStats,
        pointModel,
      };

      results.push(pointResult);
      onPointComplete?.(pointResult, {
        completedPoints: results.length,
        totalPoints,
        valueA,
        valueB,
      });

      runNextPoint();
    } catch (error) {
      onError?.({
        valueA,
        valueB,
        pointIndex,
        message: error?.message || String(error),
        stack: error?.stack,
        results,
        completedPoints: results.length,
        totalPoints,
      });
    }
  };

  runNextPoint();

  return { cancel };
}
