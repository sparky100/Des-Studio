// sweep-runner.js — Orchestrate parametric sweeps across model parameter values
// Pure JS — no React, no DOM. Can run from main thread or worker.
// Sweep points run sequentially (each modifies the model); replications within a point run in parallel.

import { runReplications } from "./replication-runner.js";
import { summarizeReplicationResults } from "./statistics.js";
import { applySweepValue, generateSweepValues } from "./sweep-params.js";

const SWEEP_METRICS = [
  "summary.avgWait", "summary.avgSvc", "summary.avgSojourn",
  "summary.served", "summary.reneged",
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
