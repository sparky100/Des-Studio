// src/engine/adaptive-batch.js — Adaptive batch runner
// Steps up replications until 95% CI relative half-width drops below the target
// percentage of the mean, or the tier replication limit is reached.
import { runReplications, createReplicationPool } from './replication-runner.js';
import { confidenceInterval95 } from './statistics.js';
import { RUN_ADMISSION_TIERS } from './run-admission.js';

const GOAL_METRIC_TO_PATH = {
  avgWait:    'summary.avgWait',
  avgSvc:     'summary.avgSvc',
  avgSojourn: 'summary.avgSojourn',
  avgTimeInSystem: 'summary.avgTimeInSystem',
  served:     'summary.served',
  servedRatio: 'summary.servedRatio',
  reneged:    'summary.reneged',
  totalCost:  'summary.totalCost',
};

function selectKpiPath(model) {
  const firstGoal = (model.goals || [])[0];
  if (firstGoal?.metric && GOAL_METRIC_TO_PATH[firstGoal.metric]) {
    return GOAL_METRIC_TO_PATH[firstGoal.metric];
  }
  return 'summary.avgWait';
}

function getPathValue(obj, path) {
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
}

function runReplicationsPromise(opts, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const handle = runReplications({
      ...opts,
      onComplete: resolve,
      onError: reject,
      onCancelled: () => reject(new DOMException('Aborted', 'AbortError')),
    });
    signal?.addEventListener('abort', () => handle.cancel(), { once: true });
  });
}

/**
 * Runs a model in progressively larger batches until the 95% CI relative
 * half-width (halfWidth / |mean| * 100) drops below `targetRelativeCI`
 * percent, or the tier replication limit is reached.
 *
 * Seeds across rounds are non-overlapping: round N starts at
 * baseSeed + (replications completed before this round).
 *
 * @param {Object}  options
 * @param {Object}  options.model
 * @param {string}  options.tier               - 'free' | 'standard' | 'pro'
 * @param {number} [options.baseSeed=0]
 * @param {number} [options.warmupPeriod=0]
 * @param {number} [options.maxSimTime=500]
 * @param {Object} [options.schedulesMap={}]
 * @param {number} [options.targetRelativeCI=5] - convergence threshold as % of mean
 * @param {function}[options.onRoundComplete]   - ({round, totalReps, ci, relativeHalfWidth}) => void
 * @param {number|null} [options.checkpointAt=100] - pause for user confirmation after this many reps (null disables)
 * @param {function}[options.onCheckpoint]      - async ({totalReps, relativeHalfWidth, ci}) => Promise<boolean> — resolve true to continue, false to stop
 * @param {AbortSignal} [options.signal]
 * @param {function}[options._createWorker]     - injectable worker factory for tests
 * @returns {Promise<{finalReps, converged, relativeHalfWidth, ci, kpiPath, results, roundHistory, stoppedAtCheckpoint?}>}
 */
export async function runAdaptiveBatch(options = {}) {
  const {
    model,
    tier = 'free',
    baseSeed = 0,
    warmupPeriod = 0,
    maxSimTime = 500,
    schedulesMap = {},
    targetRelativeCI = 5,
    // Convergence only needs one scalar KPI per replication; time-series
    // collection roughly doubles per-rep cost, so it is opt-in for batches.
    collectTimeSeries = false,
    onRoundComplete,
    onProgress,
    checkpointAt = 100,
    onCheckpoint,
    signal,
    _createWorker,
  } = options;

  const tierPolicy = RUN_ADMISSION_TIERS[tier] || RUN_ADMISSION_TIERS.free;
  const tierMax = tierPolicy.maxReplications;
  const initialBatch = Math.min(10, tierMax);
  const stepSize = Math.max(5, Math.floor(tierMax / 5));
  const kpiPath = selectKpiPath(model);

  const allResults = [];
  let totalReps = 0;
  let round = 0;
  const roundHistory = [];
  let checkpointFired = false;

  // One pool for the whole batch: workers persist across rounds instead of
  // being respawned per round (each spawn reloads the full engine module graph).
  const pool = createReplicationPool(
    typeof _createWorker === 'function' ? { createWorker: _createWorker } : {}
  );

  try {
  while (totalReps < tierMax) {
    round++;
    // Size batch to land exactly on checkpointAt before normal stepping resumes
    let batchSize;
    if (totalReps === 0) {
      batchSize = initialBatch;
    } else if (checkpointAt != null && !checkpointFired && totalReps < checkpointAt) {
      batchSize = Math.min(checkpointAt - totalReps, tierMax - totalReps);
    } else {
      batchSize = Math.min(stepSize, tierMax - totalReps);
    }

    const repsBefore = totalReps;
    const runOpts = {
      model,
      replications: batchSize,
      baseSeed: baseSeed + totalReps,
      warmupPeriod,
      maxSimTime,
      schedulesMap,
      collectTimeSeries,
      pool,
      onProgress: onProgress
        ? prog => onProgress({ ...prog, completed: repsBefore + prog.completed, total: tierMax })
        : undefined,
    };

    const roundResults = await runReplicationsPromise(runOpts, signal);
    allResults.push(...(Array.isArray(roundResults) ? roundResults.filter(Boolean) : []));
    totalReps += batchSize;

    const kpiValues = allResults
      .map(r => getPathValue(r?.result, kpiPath))
      .filter(v => typeof v === 'number' && Number.isFinite(v));
    const ci = confidenceInterval95(kpiValues);

    let relativeHalfWidth = null;
    if (ci.halfWidth != null && ci.mean != null && Math.abs(ci.mean) > 0) {
      relativeHalfWidth = (ci.halfWidth / Math.abs(ci.mean)) * 100;
    }

    const roundInfo = { round, totalReps, ci, relativeHalfWidth };
    roundHistory.push(roundInfo);
    onRoundComplete?.(roundInfo);

    if (relativeHalfWidth != null && relativeHalfWidth < targetRelativeCI) {
      return { finalReps: totalReps, converged: true, relativeHalfWidth, ci, kpiPath, results: allResults, roundHistory };
    }

    // Checkpoint fires after convergence check — converged models skip it
    if (checkpointAt != null && !checkpointFired && totalReps >= checkpointAt && onCheckpoint) {
      checkpointFired = true;
      const shouldContinue = await onCheckpoint({ totalReps, relativeHalfWidth, ci });
      if (!shouldContinue) {
        return { finalReps: totalReps, converged: false, relativeHalfWidth, ci,
                 kpiPath, results: allResults, roundHistory, stoppedAtCheckpoint: true };
      }
    }
  }

  // Tier max reached — report final state
  const kpiValues = allResults
    .map(r => getPathValue(r?.result, kpiPath))
    .filter(v => typeof v === 'number' && Number.isFinite(v));
  const ci = confidenceInterval95(kpiValues);
  let relativeHalfWidth = null;
  if (ci.halfWidth != null && ci.mean != null && Math.abs(ci.mean) > 0) {
    relativeHalfWidth = (ci.halfWidth / Math.abs(ci.mean)) * 100;
  }

  return { finalReps: totalReps, converged: false, relativeHalfWidth, ci, kpiPath, results: allResults, roundHistory };
  } finally {
    pool.destroy();
  }
}
