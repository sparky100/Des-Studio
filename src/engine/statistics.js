function finiteValues(values = []) {
  return values.filter(value => Number.isFinite(value));
}

export function buildWaitDistEntry(sorted) {
  const n   = sorted.length;
  const pct = (p) => sorted[Math.min(Math.floor(p * n), n - 1)];
  return {
    n,
    mean:   +(sorted.reduce((s, v) => s + v, 0) / n).toFixed(4),
    p50:    +pct(0.50).toFixed(4),
    p90:    +pct(0.90).toFixed(4),
    p95:    +pct(0.95).toFixed(4),
    p99:    +pct(0.99).toFixed(4),
    values: sorted.map(v => +v.toFixed(4)),
  };
}

export function finalizeWeightedStats(o) {
  o.avgWait    = o._waitN    > 0 ? +(o._waitSum    / o._waitN).toFixed(4)    : null;
  o.avgSojourn = o._sojournN > 0 ? +(o._sojournSum / o._sojournN).toFixed(4) : null;
  delete o._waitSum; delete o._waitN; delete o._sojournSum; delete o._sojournN;
}

export function mean(values = []) {
  const finite = finiteValues(values);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

export function sampleVariance(values = []) {
  const finite = finiteValues(values);
  if (finite.length < 2) return null;
  const avg = mean(finite);
  return finite.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (finite.length - 1);
}

export function sampleStdDev(values = []) {
  const variance = sampleVariance(values);
  return variance == null ? null : Math.sqrt(variance);
}

const T_CRITICAL_95 = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  11: 2.201,
  12: 2.179,
  13: 2.16,
  14: 2.145,
  15: 2.131,
  16: 2.12,
  17: 2.11,
  18: 2.101,
  19: 2.093,
  20: 2.086,
  21: 2.08,
  22: 2.074,
  23: 2.069,
  24: 2.064,
  25: 2.06,
  26: 2.056,
  27: 2.052,
  28: 2.048,
  29: 2.045,
  30: 2.042,
};

export function tCritical95(df) {
  const rounded = Math.floor(df);
  return T_CRITICAL_95[rounded] || 1.96;
}

export function confidenceInterval95(values = []) {
  const finite = finiteValues(values);
  const n = finite.length;
  const avg = mean(finite);

  if (n === 0) {
    return { n: 0, mean: null, lower: null, upper: null, halfWidth: null };
  }
  if (n === 1) {
    return { n, mean: avg, lower: null, upper: null, halfWidth: null };
  }

  const halfWidth = tCritical95(n - 1) * sampleStdDev(finite) / Math.sqrt(n);
  return {
    n,
    mean: avg,
    lower: avg - halfWidth,
    upper: avg + halfWidth,
    halfWidth,
  };
}

function getPathValue(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

export function summarizeReplicationResults(results = [], metricPaths = []) {
  const summaries = {};
  for (const path of metricPaths) {
    summaries[path] = confidenceInterval95(
      results.map(replication => getPathValue(replication?.result || replication, path))
    );
  }
  return summaries;
}

export function pairedTConfidenceInterval(a = [], b = []) {
  const droppedCount = Math.abs(a.length - b.length);
  const truncated = droppedCount > 0;
  const n = Math.min(a.length, b.length);
  if (n < 2) return { n, meanDiff: null, lower: null, upper: null, halfWidth: null, truncated, droppedCount };
  const diffs = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      diffs.push(a[i] - b[i]);
    }
  }
  const m = diffs.length;
  if (m < 2) return { n: m, meanDiff: null, lower: null, upper: null, halfWidth: null, truncated, droppedCount };
  const diffMean = diffs.reduce((s, d) => s + d, 0) / m;
  const variance = diffs.reduce((s, d) => s + (d - diffMean) ** 2, 0) / (m - 1);
  const halfWidth = tCritical95(m - 1) * Math.sqrt(variance) / Math.sqrt(m);
  return {
    n: m,
    meanDiff: diffMean,
    lower: diffMean - halfWidth,
    upper: diffMean + halfWidth,
    halfWidth,
    pValue: null, // could add t-distribution CDF lookup if needed
    truncated, // true when scenarioA/scenarioB had unequal replication counts — droppedCount pairs from the longer array were excluded
    droppedCount,
  };
}

// ---------------------------------------------------------------------------
// Welch's graphical warm-up detection
// ---------------------------------------------------------------------------

function linearInterpolate(series, targetT) {
  // series: [{ t, value }], sorted by t ascending
  if (series.length === 0) return null;
  if (targetT <= series[0].t) return series[0].value;
  if (targetT >= series[series.length - 1].t) return series[series.length - 1].value;

  let lo = 0;
  let hi = series.length - 1;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (series[mid].t <= targetT) lo = mid;
    else hi = mid;
  }
  const a = series[lo];
  const b = series[hi];
  if (b.t === a.t) return a.value;
  const frac = (targetT - a.t) / (b.t - a.t);
  return a.value + frac * (b.value - a.value);
}

function movingAverage(points, windowSize) {
  // points: [{ t, value }]
  const w = Math.max(1, Math.min(windowSize, points.length));
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - Math.floor(w / 2));
    const end = Math.min(points.length, start + w);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += points[j].value;
      count++;
    }
    out.push({ t: points[i].t, value: count > 0 ? sum / count : null });
  }
  return out;
}

function findKnee(points) {
  // points: [{ t, value }] smoothed ensemble average, sorted by t
  // Welch's method automation: midpoint-crossing heuristic.
  // Finds the first sustained window where values have crossed from the
  // transient head-mean toward the stable tail-mean.
  // Returns { point, relativeChange, confidence }

  if (points.length < 10) {
    return { point: 0, relativeChange: 0, confidence: 'low' };
  }

  const n = points.length;
  const headSize = Math.max(3, Math.floor(n * 0.15));
  const tailSize = Math.max(3, Math.floor(n * 0.15));

  const headMean = points.slice(0, headSize).reduce((s, p) => s + p.value, 0) / headSize;
  const tailMean = points.slice(n - tailSize).reduce((s, p) => s + p.value, 0) / tailSize;

  const midpoint = (headMean + tailMean) / 2;
  const goingDown = headMean > tailMean;

  // Find the first index where a window of consecutive points are all
  // on the stable side of the midpoint.
  const windowSize = Math.max(3, Math.floor(n / 20));
  let kneeIdx = 0;

  for (let i = 0; i < n - windowSize; i++) {
    const segment = points.slice(i, i + windowSize);
    const allStable = segment.every(p =>
      goingDown ? p.value < midpoint : p.value > midpoint
    );
    if (allStable) {
      kneeIdx = i;
      break;
    }
  }

  const relativeChange = Math.abs(headMean - tailMean) / (Math.abs(headMean) + 1e-9);

  const confidence = relativeChange > 0.3 ? 'high'
    : relativeChange > 0.1 ? 'medium'
    : 'low';

  return {
    point: points[kneeIdx]?.t ?? 0,
    relativeChange,
    confidence,
  };
}

/**
 * Welch's graphical method for warm-up detection.
 *
 * @param {Array} replications - array of result objects, each with a `timeSeries` array
 * @param {string} metricPath - dot-path to extract the metric (e.g. "byType.Customer.waiting")
 * @param {Object} options
 * @param {number} [options.windowSize] - moving-average window; defaults to sqrt(nTimePoints)
 * @param {number} [options.threshold=0.05] - stabilisation threshold as fraction of mean (0.05 = 5%)
 * @param {number} [options.minWarmup=0] - minimum truncation point to return
 * @returns {Object} { truncationPoint, explanation, series: [{ t, value }] }
 */
export function detectWarmupWelch(replications, metricPath, options = {}) {
  const {
    windowSize = null,
    threshold = 0.05,
    minWarmup = 0,
  } = options;

  // 1. Extract metric from each replication's time series
  const seriesPerRep = replications
    .map(rep => {
      const ts = rep?.timeSeries || rep?.result?.timeSeries || [];
      return ts
        .map(pt => ({
          t: pt.t,
          value: getPathValue(pt, metricPath),
        }))
        .filter(pt => Number.isFinite(pt.value));
    })
    .filter(s => s.length > 0);

  if (seriesPerRep.length === 0) {
    return {
      truncationPoint: minWarmup,
      explanation: 'No time-series data available for warm-up detection.',
      series: [],
    };
  }

  // 2. Build common time grid from all unique time points
  const allTimes = new Set();
  for (const series of seriesPerRep) {
    for (const pt of series) allTimes.add(pt.t);
  }
  const timeGrid = Array.from(allTimes).sort((a, b) => a - b);

  // 3. Compute ensemble average at each time point
  const ensembleAvg = timeGrid
    .map(t => {
      let sum = 0;
      let count = 0;
      for (const series of seriesPerRep) {
        const val = linearInterpolate(series, t);
        if (Number.isFinite(val)) {
          sum += val;
          count++;
        }
      }
      return { t, value: count > 0 ? sum / count : null };
    })
    .filter(pt => pt.value !== null);

  if (ensembleAvg.length === 0) {
    return {
      truncationPoint: minWarmup,
      explanation: 'No valid metric data found at any time point.',
      series: [],
    };
  }

  // 4. Apply moving average smoothing
  const w = windowSize || Math.max(1, Math.floor(Math.sqrt(ensembleAvg.length)));
  const smoothed = movingAverage(ensembleAvg, w);

  // 5. Find knee where smoothed series stabilises
  const knee = findKnee(smoothed);
  const truncationPoint = Math.max(minWarmup, knee.point);

  const explanation = knee.confidence === 'high'
    ? `Welch's method detected a warm-up truncation at t=${truncationPoint.toFixed(2)}. ` +
      `The smoothed ensemble average stabilised strongly after this point ` +
      `(relative change ${(knee.relativeChange * 100).toFixed(1)}%).`
    : knee.confidence === 'medium'
    ? `Welch's method suggests a warm-up truncation at t=${truncationPoint.toFixed(2)}. ` +
      `The smoothed ensemble average shows moderate stabilisation after this point ` +
      `(relative change ${(knee.relativeChange * 100).toFixed(1)}%).`
    : `Welch's method recommends a conservative warm-up truncation at t=${truncationPoint.toFixed(2)}. ` +
      `The series did not show a clear knee; this is a best-effort estimate ` +
      `(relative change ${(knee.relativeChange * 100).toFixed(1)}%).`;

  return {
    truncationPoint,
    explanation,
    series: smoothed,
    confidence: knee.confidence,
  };
}

// ---------------------------------------------------------------------------
// Bonferroni-corrected multiple comparisons
// ---------------------------------------------------------------------------

/**
 * Apply Bonferroni correction to a set of pairwise comparisons.
 *
 * Adjusts the per-comparison significance level from alpha to alpha/m
 * where m is the number of comparisons, then recomputes critical values.
 *
 * @param {Array} comparisons - array of { meanDiff, halfWidth, n, ... }
 * @param {number} [alpha=0.05] - family-wise error rate (default 0.05 for 95% CI)
 * @returns {Array} comparisons augmented with { correctedAlpha, significant95, significant99, bonferroniHalfWidth }
 */
export function bonferroniCI(comparisons = [], alpha = 0.05) {
  const m = comparisons.length;
  if (m === 0) return [];

  const correctedAlpha = alpha / m;

  // Use the corrected alpha to find the t-critical value.
  // We approximate using tCritical95 adjusted by the inverse of the Bonferroni multiplier.
  // For simplicity, compute a Bonferroni-corrected half-width = halfWidth * t_crit(correctedAlpha) / t_crit(alpha)
  // Since we have tCritical95 (for alpha=0.05), we approximate:
  // Bonferroni-corrected critical value roughly = tCritical95(df) * (alpha / correctedAlpha) factor
  // A better approximation: use tCritical95 with an adjusted lookup.
  // For the corrected alpha, the multiplier is roughly:
  //   t_crit(alpha/m) / t_crit(alpha)
  // We use the approximation multiplier for small m (up to ~10) and fall back to
  // a conservative bound for larger m.

  return comparisons.map(c => {
    if (c.meanDiff == null || c.halfWidth == null || c.n < 2) {
      return { ...c, correctedAlpha, significant95: false, significant99: false, bonferroniHalfWidth: null };
    }

    // Bonferroni multiplier: approximate the ratio of t-critical values.
    // For alpha=0.05 -> alpha/m, use a simple lookup-based adjustment.
    const df = c.n - 1;
    const baseT = tCritical95(df);
    const correctedT = tCriticalBonferroni(df, m);

    // Compute the corrected half-width
    const bonferroniHalfWidth = c.halfWidth * (correctedT / baseT);

    // 95% family-wise significance: null diff within Bonferroni CI?
    const lower95 = c.meanDiff - bonferroniHalfWidth;
    const upper95 = c.meanDiff + bonferroniHalfWidth;
    const significant95 = lower95 > 0 || upper95 < 0;

    // 99% family-wise: use alpha = 0.01 / m
    const alpha99 = 0.01 / m;
    const correctedT99 = tCriticalBonferroni(df, m, 0.01);
    const halfWidth99 = c.halfWidth * (correctedT99 / baseT);
    const lower99 = c.meanDiff - halfWidth99;
    const upper99 = c.meanDiff + halfWidth99;
    const significant99 = lower99 > 0 || upper99 < 0;

    return {
      ...c,
      correctedAlpha,
      bonferroniHalfWidth,
      significant95,
      significant99,
      correctedLower: lower95,
      correctedUpper: upper95,
    };
  });
}

/**
 * Approximate t-critical value with Bonferroni correction.
 *
 * For m comparisons, the corrected alpha = alpha/m.
 * We scale the base t-critical value using a conservative multiplier:
 *   multiplier = 1 + 0.5 * log2(m)
 * This approximates the inflation of the critical value for small-to-moderate m
 * and avoids requiring a full inverse-t distribution.
 *
 * @param {number} df - degrees of freedom
 * @param {number} m - number of comparisons
 * @param {number} [alpha=0.05] - uncorrected alpha
 * @returns {number} Bonferroni-corrected t-critical value
 */
function tCriticalBonferroni(df, m, alpha = 0.05) {
  const baseT = tCritical95(df); // base for alpha=0.05
  if (m <= 1) return baseT;

  // Scale factor: approximately sqrt( -log2(alpha/m) / -log2(alpha) )
  // For alpha=0.05, this gives a multiplier of ~sqrt(log2(20*m)/log2(20))
  const targetAlpha = alpha / m;
  const ratio = Math.log(targetAlpha) / Math.log(alpha);
  const multiplier = Math.sqrt(ratio);

  return baseT * Math.max(1, multiplier);
}

/**
 * Compare two scenarios (sets of replication results) using paired-t CIs
 * with Bonferroni correction for multiple metrics.
 *
 * Each scenario is an array of replication result objects.
 * The i-th element of scenarioA and scenarioB must correspond to the same
 * replication (paired by design).
 *
 * @param {Array} scenarioA - replication results for baseline
 * @param {Array} scenarioB - replication results for variant
 * @param {Array<string>} metricPaths - dot-paths to metrics (e.g. ["summary.avgWait"])
 * @param {Object} [options]
 * @param {string} [options.labelA="Scenario A"] - display label
 * @param {string} [options.labelB="Scenario B"] - display label
 * @returns {Object} { comparisons, significant, labels }
 */
export function compareScenarios(scenarioA = [], scenarioB = [], metricPaths = [], options = {}) {
  const { labelA = 'Scenario A', labelB = 'Scenario B' } = options;

  const comparisons = metricPaths.map(path => {
    const a = scenarioA.map(r => getPathValue(r?.result || r, path));
    const b = scenarioB.map(r => getPathValue(r?.result || r, path));
    const ci = pairedTConfidenceInterval(a, b);
    return {
      metric: path,
      ...ci,
      labelA,
      labelB,
    };
  });

  const corrected = bonferroniCI(comparisons, 0.05);

  const significant = corrected.filter(c => c.significant95).map(c => c.metric);

  return {
    comparisons: corrected,
    significant,
    any95: corrected.some(c => c.significant95),
    any99: corrected.some(c => c.significant99),
    labels: { a: labelA, b: labelB },
  };
}

// ---------------------------------------------------------------------------
// Summary diagnostics — skewness, kurtosis, percentiles
// ---------------------------------------------------------------------------

/**
 * Compute skewness and kurtosis of a sample.
 * Uses the adjusted Fisher-Pearson standardized moment coefficient for skewness
 * and excess kurtosis (normal distribution has kurtosis = 0).
 *
 * @param {number[]} values
 * @returns {Object} { n, mean, stdDev, skewness, kurtosis, isApproxNormal }
 */
export function computeSummaryStats(values = []) {
  const finite = finiteValues(values);
  const n = finite.length;
  if (n < 3) {
    return {
      n, mean: mean(finite), stdDev: null,
      skewness: null, kurtosis: null, isApproxNormal: false,
    };
  }

  const avg = mean(finite);
  const std = sampleStdDev(finite);

  if (std === 0) {
    return {
      n, mean: avg, stdDev: 0,
      skewness: 0, kurtosis: -3 / 2, isApproxNormal: false,
    };
  }

  // Central moments
  let m2 = 0; // variance * n
  let m3 = 0;
  let m4 = 0;
  for (const v of finite) {
    const d = v - avg;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }

  // Skewness: adjusted Fisher-Pearson
  // g1 = (n / ((n-1)*(n-2))) * sum((x-mean)^3) / std^3
  const skewness = (n / ((n - 1) * (n - 2))) * (m3 / (std ** 3));

  // Excess kurtosis: adjusted for sample
  // g2 = (n*(n+1)/((n-1)*(n-2)*(n-3))) * m4/(std^4) - 3*(n-1)^2/((n-2)*(n-3))
  const numKurt = n * (n + 1) * m4;
  const denKurt = (n - 1) * (n - 2) * (n - 3) * (std ** 4);
  const adjustKurt = 3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3));
  const kurtosis = denKurt > 0 ? (numKurt / denKurt) - adjustKurt : 0;

  // Approximate normality check: skewness near 0, kurtosis near 0
  // |skewness| < 2 * sqrt(6/n)  and |kurtosis| < 2 * sqrt(24/n)
  const seSkew = Math.sqrt(6 / n);
  const seKurt = Math.sqrt(24 / n);
  const isApproxNormal = Math.abs(skewness) < 2 * seSkew && Math.abs(kurtosis) < 2 * seKurt;

  return {
    n,
    mean: avg,
    stdDev: std,
    skewness,
    kurtosis,
    isApproxNormal,
  };
}

/**
 * Compute percentiles with linear interpolation.
 *
 * Uses the R-7 method (default in NumPy, Excel PERCENTILE.INC):
 * - Index i = p * (n - 1)
 * - Fraction f = i - floor(i)
 * - Result = sorted[floor(i)] + f * (sorted[ceil(i)] - sorted[floor(i)])
 *
 * @param {number[]} values
 * @param {number[]} [percentiles=[5, 25, 50, 75, 95]] - list of percentile ranks (0-100)
 * @returns {Object} mapping from percentile key (e.g. "p5") to value
 */
export function computePercentiles(values = [], percentiles = [5, 25, 50, 75, 95]) {
  const finite = finiteValues(values);
  const n = finite.length;
  if (n === 0) {
    const result = {};
    for (const p of percentiles) result[`p${p}`] = null;
    return { ...result, n: 0 };
  }

  const sorted = [...finite].sort((a, b) => a - b);
  const result = { n };

  for (const p of percentiles) {
    if (p < 0 || p > 100) {
      result[`p${p}`] = null;
      continue;
    }
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;

    if (lo === hi || frac === 0) {
      result[`p${p}`] = sorted[lo];
    } else {
      result[`p${p}`] = sorted[lo] + frac * (sorted[hi] - sorted[lo]);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Batch-means confidence intervals (corrects for autocorrelated output)
// ---------------------------------------------------------------------------

/**
 * Compute lag-1 autocorrelation of a series.
 * Returns a value between -1 and 1. Values near 0 imply near-independence.
 */
function lag1Autocorrelation(values) {
  const n = values.length;
  if (n < 3) return 0;
  const meanVal = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const diff = values[i] - meanVal;
    den += diff * diff;
    if (i < n - 1) {
      num += diff * (values[i + 1] - meanVal);
    }
  }
  if (den === 0) return 0;
  return num / den;
}

/**
 * Suggest a batch size for batch-means CI.
 * Heuristic: start with sqrt(n), then increase until lag-1 autocorrelation
 * of batch means drops below a threshold (default 0.1).
 *
 * @param {number[]} values — observations (e.g. entity completion times)
 * @param {Object} options
 * @param {number} [options.maxRho=0.1] — target lag-1 autocorrelation for batch means
 * @returns {number} recommended batch size
 */
function computeBatchMeans(finite, k, m) {
  const batchMeans = [];
  for (let i = 0; i < k; i++) {
    const batch = finite.slice(i * m, (i + 1) * m);
    batchMeans.push(batch.reduce((s, v) => s + v, 0) / batch.length);
  }
  return batchMeans;
}

export function suggestBatchSize(values = [], options = {}) {
  const { maxRho = 0.1 } = options;
  const finite = finiteValues(values);
  const n = finite.length;
  if (n < 10) return Math.max(1, n);

  let m = Math.max(2, Math.floor(Math.sqrt(n)));
  // Try increasing batch size until batch-means autocorrelation is acceptable
  for (let attempt = 0; attempt < 10; attempt++) {
    const k = Math.floor(n / m);
    if (k < 3) break; // too few batches
    const batchMeans = computeBatchMeans(finite, k, m);
    const rho = lag1Autocorrelation(batchMeans);
    if (Math.abs(rho) <= maxRho) return m;
    m = Math.ceil(m * 1.5);
  }
  return Math.min(m, Math.floor(n / 3));
}

/**
 * Batch-means confidence interval.
 *
 * Divides observations into k non-overlapping batches of size m,
 * computes the mean of each batch, then applies the standard t-based
 * CI to the batch means. This corrects for autocorrelation because
 * batch means are approximately independent when m is large enough.
 *
 * @param {number[]} values — observations
 * @param {number} [batchSize] — batch size m; if omitted, uses suggestBatchSize()
 * @returns {Object} { n, batchSize, batchCount, mean, lower, upper, halfWidth, lag1Rho }
 */
export function batchMeansCI(values = [], batchSize = null) {
  const finite = finiteValues(values);
  const n = finite.length;
  if (n === 0) {
    return { n: 0, batchSize: 0, batchCount: 0, mean: null, lower: null, upper: null, halfWidth: null, lag1Rho: null };
  }

  const m = batchSize || suggestBatchSize(finite);
  const k = Math.floor(n / m);

  if (k < 2) {
    // Fall back to standard CI if we can't form at least 2 batches
    const ci = confidenceInterval95(finite);
    return { ...ci, batchSize: m, batchCount: k, lag1Rho: null, nUsed: n, discarded: 0 };
  }

  // Compute batch means
  const batchMeans = computeBatchMeans(finite, k, m);

  // Apply standard CI to batch means (treat them as approximately independent)
  const avg = mean(batchMeans);
  const halfWidth = tCritical95(k - 1) * sampleStdDev(batchMeans) / Math.sqrt(k);
  const lag1Rho = lag1Autocorrelation(batchMeans);
  const nUsed = k * m; // observations beyond k*m don't fill a complete batch and are excluded below
  const discarded = n - nUsed;

  return {
    n,
    batchSize: m,
    batchCount: k,
    mean: avg,
    lower: avg - halfWidth,
    upper: avg + halfWidth,
    halfWidth,
    lag1Rho,
    nUsed, // actual observation count used to form the k batches (n - discarded)
    discarded, // observations dropped because they didn't fill a complete batch
  };
}

// --- F28.3: CI precision helpers ---

export function relativePrecision(ci) {
  if (!ci || ci.halfWidth == null || ci.mean == null) return null;
  if (!Number.isFinite(ci.halfWidth) || !Number.isFinite(ci.mean)) return null;
  if (ci.mean === 0) return null;
  return (ci.halfWidth / Math.abs(ci.mean)) * 100;
}

export function sampleSizeGuidance(ci, targetPrecision = 5) {
  if (!ci || ci.n == null || ci.mean == null || ci.halfWidth == null) return null;
  if (!Number.isFinite(ci.mean) || ci.mean === 0) return null;
  if (!Number.isFinite(ci.halfWidth) || ci.halfWidth <= 0) return null;
  if (ci.n < 2) return null;
  const relPrec = relativePrecision(ci);
  if (relPrec != null && relPrec <= targetPrecision) return null;
  // Estimate sample std dev from half-width and t critical
  const df = ci.n - 1;
  const t = tCritical95(df);
  const stdDev = (ci.halfWidth * Math.sqrt(ci.n)) / t;
  const targetAbsolute = Math.abs(ci.mean) * (targetPrecision / 100);
  const nRequired = Math.ceil((t * stdDev / targetAbsolute) ** 2);
  return Math.max(nRequired - ci.n, 1);
}

// --- F28.4: Transient analysis helpers ---

export function cumulativeMean(values = []) {
  const finite = [];
  for (const v of values) {
    if (Number.isFinite(v)) finite.push(v);
  }
  if (finite.length === 0) return [];
  const result = [];
  let sum = 0;
  for (let i = 0; i < finite.length; i++) {
    sum += finite[i];
    result.push({ index: i, mean: sum / (i + 1) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Entity summary compaction — used by the engine (batch mode) and persistence
// ---------------------------------------------------------------------------

const ENTITY_SUMMARY_TYPE_LIMIT = 12;

export function summarizeEntitySummary(entitySummary = []) {
  const byStatus = {};
  const byType = {};
  const byOutcome = {};

  for (const entity of entitySummary) {
    const status = entity?.status || "unknown";
    const type = entity?.type || entity?.role || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
    if (entity?.outcome?.routeId) {
      const routeId = entity.outcome.routeId;
      if (!byOutcome[routeId]) {
        byOutcome[routeId] = {
          routeId,
          routeLabel: entity.outcome.routeLabel || routeId,
          status: entity.outcome.status || status,
          endedBy: entity.outcome.endedBy || "unknown",
          count: 0,
        };
      }
      byOutcome[routeId].count++;
    }
  }

  return {
    totalEntities: entitySummary.length,
    byStatus,
    ...(Object.keys(byOutcome).length ? { byOutcome } : {}),
    byType: Object.fromEntries(
      Object.entries(byType)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, ENTITY_SUMMARY_TYPE_LIMIT)
    ),
  };
}

// --- F28.5: Replication diagnostics ---

export function detectOutliers(values = []) {
  const empty = { q1: null, q3: null, iqr: null, lowerFence: null, upperFence: null, outlierIndices: [] };
  if (!Array.isArray(values) || values.length < 4) return empty;
  const finite = values.filter(Number.isFinite);
  if (finite.length < 4) return empty;
  const pcts = computePercentiles(finite, [25, 75]);
  const q1 = pcts.p25;
  const q3 = pcts.p75;
  if (q1 == null || q3 == null) return empty;
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const outlierIndices = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v) && (v < lowerFence || v > upperFence)) {
      outlierIndices.push(i);
    }
  }
  return { q1, q3, iqr, lowerFence, upperFence, outlierIndices };
}

// ---------------------------------------------------------------------------
// G12: Histogram collector
// ---------------------------------------------------------------------------

/**
 * Build a histogram from a set of values using equal-width bins.
 *
 * @param {number[]} values — observations
 * @param {Object} options
 * @param {number} [options.numBins=10] — number of bins
 * @param {number} [options.min] — lower bound (auto-detected if omitted)
 * @param {number} [options.max] — upper bound (auto-detected if omitted)
 * @returns {Object} { bins: [{ low, high, count, density }], numBins, min, max, total }
 */
export function buildHistogram(values = [], options = {}) {
  const { numBins = 10, min: userMin, max: userMax } = options;
  const finite = finiteValues(values);
  const n = finite.length;
  if (n === 0) {
    return { bins: [], numBins: 0, min: null, max: null, total: 0 };
  }

  const lo = userMin != null ? userMin : finite.reduce((m, v) => v < m ? v : m, Infinity);
  const hi = userMax != null ? userMax : finite.reduce((m, v) => v > m ? v : m, -Infinity);

  if (lo === hi) {
    // All values identical — single bin
    return {
      bins: [{ low: lo, high: hi, count: n, density: 1.0 }],
      numBins: 1,
      min: lo,
      max: hi,
      total: n,
    };
  }

  const binWidth = (hi - lo) / numBins;
  const bins = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({
      low: +(lo + i * binWidth).toFixed(6),
      high: +(lo + (i + 1) * binWidth).toFixed(6),
      count: 0,
      density: 0,
    });
  }

  for (const v of finite) {
    let idx = Math.floor((v - lo) / binWidth);
    if (idx >= numBins) idx = numBins - 1; // handle max value edge case
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }

  // Compute density (count / (total * binWidth)) so area sums to 1
  for (const bin of bins) {
    bin.density = n > 0 && binWidth > 0 ? +(bin.count / (n * binWidth)).toFixed(6) : 0;
  }

  return { bins, numBins, min: lo, max: hi, total: n };
}

/**
 * Build a histogram with automatic bin selection using the Freedman-Diaconis rule.
 *
 * Bin width = 2 * IQR(x) / n^(1/3)
 * This adapts to the data spread and is robust to outliers.
 *
 * @param {number[]} values — observations
 * @param {Object} options
 * @param {number} [options.min] — lower bound (auto-detected if omitted)
 * @param {number} [options.max] — upper bound (auto-detected if omitted)
 * @param {number} [options.maxBins=50] — cap on number of bins
 * @returns {Object} { bins, numBins, min, max, total, method: 'freedman-diaconis' }
 */
export function buildHistogramFD(values = [], options = {}) {
  const { min: userMin, max: userMax, maxBins = 50 } = options;
  const finite = finiteValues(values);
  const n = finite.length;
  if (n === 0) {
    return { bins: [], numBins: 0, min: null, max: null, total: 0, method: 'freedman-diaconis' };
  }

  const pcts = computePercentiles(finite, [25, 75]);
  const iqr = (pcts.p75 ?? 0) - (pcts.p25 ?? 0);

  const lo = userMin != null ? userMin : finite.reduce((m, v) => v < m ? v : m, Infinity);
  const hi = userMax != null ? userMax : finite.reduce((m, v) => v > m ? v : m, -Infinity);
  const binWidth = iqr > 0 ? 2 * iqr / Math.cbrt(n) : (hi - lo) / 10;
  const numBins = Math.min(maxBins, Math.max(2, Math.ceil((hi - lo) / binWidth)));

  const result = buildHistogram(finite, { numBins, min: lo, max: hi });
  return { ...result, method: 'freedman-diaconis' };
}

// ---------------------------------------------------------------------------
// G13: One-way ANOVA (Analysis of Variance)
// ---------------------------------------------------------------------------

/**
 * Perform one-way ANOVA to test whether the means of k groups differ significantly.
 *
 * Null hypothesis: all group means are equal.
 * Alternative: at least one group mean differs.
 *
 * Uses the F-statistic: F = MS_between / MS_within
 *
 * @param {number[][]} groups — array of k arrays, each containing observations for one group
 * @param {Object} options
 * @param {string[]} [options.labels] — display labels for each group
 * @returns {Object} {
 *   k: number of groups,
 *   n: total observations,
 *   grandMean: overall mean,
 *   ssBetween: sum of squares between groups,
 *   ssWithin: sum of squares within groups,
 *   ssTotal: total sum of squares,
 *   dfBetween: degrees of freedom between,
 *   dfWithin: degrees of freedom within,
 *   msBetween: mean square between,
 *   msWithin: mean square within,
 *   fStatistic: F value,
 *   pValue: approximate p-value (using F-distribution approximation),
 *   significant: whether p < 0.05,
 *   groupStats: [{ label, n, mean, stdDev }],
 *   explanation: human-readable summary
 * }
 */
export function oneWayANOVA(groups = [], options = {}) {
  const { labels = null } = options;
  const k = groups.length;
  if (k < 2) {
    return {
      k, n: 0, grandMean: null,
      ssBetween: 0, ssWithin: 0, ssTotal: 0,
      dfBetween: 0, dfWithin: 0, msBetween: 0, msWithin: 0,
      fStatistic: null, pValue: null, significant: false,
      groupStats: [],
      explanation: 'At least 2 groups are required for ANOVA.',
    };
  }

  const finiteGroups = groups.map(g => finiteValues(g));
  const groupSizes = finiteGroups.map(g => g.length);
  const n = groupSizes.reduce((s, size) => s + size, 0);

  if (n < k + 1) {
    return {
      k, n, grandMean: null,
      ssBetween: 0, ssWithin: 0, ssTotal: 0,
      dfBetween: 0, dfWithin: 0, msBetween: 0, msWithin: 0,
      fStatistic: null, pValue: null, significant: false,
      groupStats: [],
      explanation: 'Insufficient data: need at least k+1 total observations.',
    };
  }

  // Group means
  const groupMeans = finiteGroups.map(g => g.reduce((s, v) => s + v, 0) / g.length);
  const grandMean = finiteGroups.flat().reduce((s, v) => s + v, 0) / n;

  // Sum of squares between groups
  let ssBetween = 0;
  for (let i = 0; i < k; i++) {
    ssBetween += groupSizes[i] * (groupMeans[i] - grandMean) ** 2;
  }

  // Sum of squares within groups
  let ssWithin = 0;
  for (let i = 0; i < k; i++) {
    for (const v of finiteGroups[i]) {
      ssWithin += (v - groupMeans[i]) ** 2;
    }
  }

  const ssTotal = ssBetween + ssWithin;
  const dfBetween = k - 1;
  const dfWithin = n - k;
  const msBetween = dfBetween > 0 ? ssBetween / dfBetween : 0;
  const msWithin = dfWithin > 0 ? ssWithin / dfWithin : 0;

  const fStatistic = msWithin > 0 ? msBetween / msWithin : null;

  // Approximate p-value using the F-distribution
  // For large df, F approaches chi-squared / df; use a simple approximation
  const pValue = fStatistic != null ? approximateFPValue(fStatistic, dfBetween, dfWithin) : null;
  const significant = pValue != null && pValue < 0.05;

  // Group statistics
  const groupStats = finiteGroups.map((g, i) => ({
    label: labels?.[i] ?? `Group ${i + 1}`,
    n: g.length,
    mean: groupMeans[i],
    stdDev: sampleStdDev(g),
  }));

  // Explanation
  let explanation;
  if (significant) {
    explanation = `ANOVA indicates a statistically significant difference between group means (F(${dfBetween}, ${dfWithin}) = ${fStatistic.toFixed(3)}, p = ${pValue.toFixed(4)}). At least one group mean differs from the others.`;
  } else if (fStatistic != null) {
    explanation = `ANOVA does not detect a significant difference between group means (F(${dfBetween}, ${dfWithin}) = ${fStatistic.toFixed(3)}, p = ${pValue.toFixed(4)}). The observed differences could be due to random variation.`;
  } else {
    explanation = 'ANOVA could not be computed (insufficient variance within groups).';
  }

  return {
    k, n, grandMean,
    ssBetween, ssWithin, ssTotal,
    dfBetween, dfWithin, msBetween, msWithin,
    fStatistic, pValue, significant,
    groupStats,
    explanation,
  };
}

/**
 * Approximate the p-value for an F-statistic with given degrees of freedom.
 * Uses the regularized incomplete beta function approximation.
 *
 * For practical purposes, uses a lookup-based approximation for common df ranges.
 *
 * @param {number} f — F-statistic value
 * @param {number} df1 — numerator degrees of freedom
 * @param {number} df2 — denominator degrees of freedom
 * @returns {number} approximate p-value (0 to 1)
 */
function approximateFPValue(f, df1, df2) {
  if (f == null || f <= 0) return 1.0;
  if (!Number.isFinite(f)) return 0.0;

  // Use the approximation: p ≈ 1 - I_x(df1/2, df2/2)
  // where x = (df1 * f) / (df1 * f + df2)
  // and I_x is the regularized incomplete beta function.
  //
  // For simplicity, use a series expansion for small df1 and asymptotic for large df.

  const x = (df1 * f) / (df1 * f + df2);

  // Regularized incomplete beta function approximation
  // Using continued fraction expansion (Lentz's method)
  return 1.0 - incompleteBeta(x, df1 / 2, df2 / 2);
}

/**
 * Approximate the regularized incomplete beta function I_x(a, b).
 * Uses the continued fraction expansion (Lentz's method).
 *
 * @param {number} x — value in [0, 1]
 * @param {number} a — first shape parameter
 * @param {number} b — second shape parameter
 * @returns {number} I_x(a, b) approximation
 */
function cfIterate(d, c, num) {
  d = 1.0 + num * d;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1.0 / d;
  c = 1.0 + num / c;
  if (Math.abs(c) < 1e-30) c = 1e-30;
  return { d, c, factor: d * c };
}

function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use the symmetry relation when x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1.0 - incompleteBeta(1 - x, b, a);
  }

  // Compute the front factor: x^a * (1-x)^b / (a * B(a,b))
  const lnFront = a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b) - Math.log(a);
  const front = Math.exp(lnFront);

  // Continued fraction expansion (Lentz's method)
  const maxIter = 200;
  const eps = 1e-10;
  let f = 1.0;
  let c = 1.0;
  let d = 1.0 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1.0 / d;
  f = d;

  for (let m = 1; m <= maxIter; m++) {
    // Even step
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    let step = cfIterate(d, c, num);
    d = step.d; c = step.c; f *= step.factor;

    // Odd step
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    step = cfIterate(d, c, num);
    d = step.d; c = step.c;
    const delta = step.factor;
    f *= delta;

    if (Math.abs(delta - 1.0) < eps) break;
  }

  return front * f;
}

/**
 * Compute the log of the beta function B(a, b) using the log-gamma function.
 * B(a, b) = Gamma(a) * Gamma(b) / Gamma(a + b)
 *
 * @param {number} a
 * @param {number} b
 * @returns {number} log(B(a, b))
 */
function logBeta(a, b) {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Approximate the log-gamma function using Lanczos approximation.
 *
 * @param {number} z — argument (must be > 0)
 * @returns {number} log(Gamma(z))
 */
function logGamma(z) {
  if (z <= 0) return NaN;

  // Lanczos coefficients (g=7, n=9)
  const g = 7;
  const coef = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    // Reflection formula: Gamma(z) = pi / (sin(pi*z) * Gamma(1-z))
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Perform Tukey's HSD (Honestly Significant Difference) post-hoc test
 * after a significant ANOVA to identify which specific group pairs differ.
 *
 * @param {number[][]} groups — array of k arrays of observations
 * @param {Object} options
 * @param {string[]} [options.labels] — display labels for each group
 * @param {number} [options.alpha=0.05] — significance level
 * @returns {Object} {
 *   comparisons: [{ groupA, groupB, meanDiff, criticalValue, significant, pValue }],
 *   anySignificant: boolean,
 *   explanation: string
 * }
 */
export function tukeyHSD(groups = [], options = {}) {
  const { labels = null, alpha = 0.05 } = options;
  const k = groups.length;
  if (k < 2) {
    return { comparisons: [], anySignificant: false, explanation: 'At least 2 groups required.' };
  }

  const finiteGroups = groups.map(g => finiteValues(g));
  const groupSizes = finiteGroups.map(g => g.length);
  const n = groupSizes.reduce((s, size) => s + size, 0);
  const groupMeans = finiteGroups.map(g => g.reduce((s, v) => s + v, 0) / g.length);

  // Mean square within (from ANOVA)
  let ssWithin = 0;
  for (let i = 0; i < k; i++) {
    for (const v of finiteGroups[i]) {
      ssWithin += (v - groupMeans[i]) ** 2;
    }
  }
  const dfWithin = n - k;
  const msWithin = dfWithin > 0 ? ssWithin / dfWithin : 0;

  if (msWithin === 0) {
    return { comparisons: [], anySignificant: false, explanation: 'No within-group variance — all values identical within groups.' };
  }

  // Studentized range critical value approximation
  // q(alpha, k, df) — use approximation for common values
  const qCritical = studentizedRangeCritical(alpha, k, dfWithin);

  const comparisons = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const meanDiff = Math.abs(groupMeans[i] - groupMeans[j]);
      const se = Math.sqrt(msWithin * (1 / groupSizes[i] + 1 / groupSizes[j]) / 2);
      const criticalValue = qCritical * se;
      const significant = meanDiff > criticalValue;

      comparisons.push({
        groupA: labels?.[i] ?? `Group ${i + 1}`,
        groupB: labels?.[j] ?? `Group ${j + 1}`,
        meanA: groupMeans[i],
        meanB: groupMeans[j],
        meanDiff,
        se,
        criticalValue,
        significant,
      });
    }
  }

  const anySignificant = comparisons.some(c => c.significant);
  const explanation = anySignificant
    ? `Tukey's HSD identified ${comparisons.filter(c => c.significant).length} significantly different group pair(s) at alpha=${alpha}.`
    : `Tukey's HSD found no significantly different group pairs at alpha=${alpha}.`;

  return { comparisons, anySignificant, explanation };
}

/**
 * Approximate the critical value of the studentized range distribution q(alpha, k, df).
 * Uses a simple approximation based on the t-distribution.
 *
 * @param {number} alpha — significance level
 * @param {number} k — number of groups
 * @param {number} df — degrees of freedom (within)
 * @returns {number} critical value
 */
function studentizedRangeCritical(alpha, k, df) {
  // Approximation: q ≈ sqrt(2) * t(alpha/(k*(k-1)), df)
  // This is conservative (slightly overestimates the critical value)
  const adjustedAlpha = alpha / (k * (k - 1));
  const tCrit = tCriticalForAlpha(df, adjustedAlpha);
  return Math.sqrt(2) * tCrit;
}

/**
 * Get t-critical value for a given alpha (two-tailed).
 * Extends the existing tCritical95 to support arbitrary alpha.
 *
 * @param {number} df — degrees of freedom
 * @param {number} alpha — significance level (e.g., 0.05 for 95% CI)
 * @returns {number} t-critical value
 */
function tCriticalForAlpha(df, alpha) {
  // For alpha=0.05, use the existing table
  if (Math.abs(alpha - 0.05) < 0.001) {
    return tCritical95(df);
  }

  // For other alpha values, use approximation
  // t ≈ z + (z^3 + z) / (4*df) + (5*z^5 + 16*z^3 + 3*z) / (96*df^2)
  // where z is the standard normal critical value
  const z = normalCriticalForAlpha(alpha);
  const rounded = Math.floor(df);

  if (rounded >= 1000) return z; // Large df → normal approximation

  const term1 = (z ** 3 + z) / (4 * df);
  const term2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2);
  return z + term1 + term2;
}

/**
 * Get the standard normal critical value for a two-tailed test.
 * Uses a rational approximation.
 *
 * @param {number} alpha — significance level
 * @returns {number} z-critical value
 */
function normalCriticalForAlpha(alpha) {
  // Approximation of the inverse normal CDF
  // For alpha=0.05, z=1.96; for alpha=0.01, z=2.576
  const p = 1 - alpha / 2;
  // Rational approximation (Abramowitz and Stegun)
  const t = Math.sqrt(-2 * Math.log(1 - p));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;
  return t - (c0 + c1 * t + c2 * t ** 2) / (1 + d1 * t + d2 * t ** 2 + d3 * t ** 3);
}
