// src/engine/adaptive-batch.js — Adaptive batch runner
// Steps up replications until 95% CI relative half-width drops below the target
// percentage of the mean, or the tier replication limit is reached.
import { runReplications } from './replication-runner.js';
import { confidenceInterval95 } from './statistics.js';
import { RUN_ADMISSION_TIERS } from './run-admission.js';

const GOAL_METRIC_TO_PATH = {
  avgWait:    'summary.avgWait',
  avgSvc:     'summary.avgSvc',
  avgSojourn: 'summary.avgSojourn',
  served:     'summary.served',
  reneged:    'summary.reneged',
  totalCost:  'summary.totalCost',
};

function selectKpiPath(model) {
  const firstGoal = (model.goals || [])[0];
  if (firstGoal?.metric && GOAL_METRIC_TO_PATH[firstGoal.metric]) {
    return GOAL_METRIC_TO_PATH[firstGoal.metric];
  }
  return 'summary.served';
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
      collectTimeSeries: false,
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
 * @param {AbortSignal} [options.signal]
 * @param {function}[options._createWorker]     - injectable worker factory for tests
 * @returns {Promise<{finalReps, converged, relativeHalfWidth, ci, kpiPath, results, roundHistory}>}
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
    onRoundComplete,
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

  while (totalReps < tierMax) {
    round++;
    const batchSize = totalReps === 0
      ? initialBatch
      : Math.min(stepSize, tierMax - totalReps);

    const runOpts = {
      model,
      replications: batchSize,
      baseSeed: baseSeed + totalReps,
      warmupPeriod,
      maxSimTime,
      schedulesMap,
      ...(typeof _createWorker === 'function' ? { createWorker: _createWorker } : {}),
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
}
