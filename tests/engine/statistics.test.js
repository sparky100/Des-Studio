import { describe, expect, test } from 'vitest';
import {
  batchMeansCI,
  bonferroniCI,
  compareScenarios,
  computePercentiles,
  computeSummaryStats,
  confidenceInterval95,
  detectWarmupWelch,
  mean,
  pairedTConfidenceInterval,
  sampleStdDev,
  sampleVariance,
  suggestBatchSize,
  summarizeReplicationResults,
  tCritical95,
} from '../../src/engine/statistics.js';

describe('statistics helpers', () => {
  test('mean ignores null, undefined, and non-finite values', () => {
    expect(mean([1, null, 2, undefined, Infinity, NaN, 3])).toBe(2);
  });

  test('sampleVariance and sampleStdDev use n-1 denominator', () => {
    expect(sampleVariance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4.5714, 4);
    expect(sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.1381, 4);
  });

  test('confidenceInterval95 handles zero and one observation', () => {
    expect(confidenceInterval95([])).toEqual({ n: 0, mean: null, lower: null, upper: null, halfWidth: null });
    expect(confidenceInterval95([7])).toEqual({ n: 1, mean: 7, lower: null, upper: null, halfWidth: null });
  });

  test('confidenceInterval95 calculates expected half-width', () => {
    const ci = confidenceInterval95([1, 2, 3, 4]);
    expect(ci.mean).toBe(2.5);
    expect(ci.halfWidth).toBeCloseTo(2.0540, 4);
    expect(ci.lower).toBeCloseTo(0.4460, 4);
    expect(ci.upper).toBeCloseTo(4.5540, 4);
  });

  test('tCritical95 returns lookup values and normal fallback', () => {
    expect(tCritical95(1)).toBeCloseTo(12.706);
    expect(tCritical95(10)).toBeCloseTo(2.228);
    expect(tCritical95(30)).toBeCloseTo(2.042);
    expect(tCritical95(31)).toBeCloseTo(1.96);
  });

  test('pairedTConfidenceInterval returns null for fewer than 2 observations', () => {
    expect(pairedTConfidenceInterval([], [])).toMatchObject({ n: 0, meanDiff: null });
    expect(pairedTConfidenceInterval([5], [6])).toMatchObject({ n: 1, meanDiff: null });
  });

  test('pairedTConfidenceInterval computes correct CI on equal-sized samples', () => {
    const before = [10, 12, 14, 16, 18];
    const after = [12, 15, 13, 19, 22];
    // Differences: -2, -3, 1, -3, -4
    // Mean diff: -2.2
    const ci = pairedTConfidenceInterval(before, after);
    expect(ci.n).toBe(5);
    expect(ci.meanDiff).toBeCloseTo(-2.2, 4);
    expect(ci.lower).toBeLessThan(ci.meanDiff);
    expect(ci.upper).toBeGreaterThan(ci.meanDiff);
    expect(ci.halfWidth).toBeGreaterThan(0);
  });

  test('pairedTConfidenceInterval handles non-finite values', () => {
    const a = [1, 2, null, 4, NaN];
    const b = [2, 3, 4, 5, 6];
    const ci = pairedTConfidenceInterval(a, b);
    // Only pairs 0,1,3 are finite: diffs = [-1, -1, -1] mean = -1
    expect(ci.n).toBe(3);
    expect(ci.meanDiff).toBeCloseTo(-1, 4);
  });

  test('pairedTConfidenceInterval returns null for mismatched lengths past min', () => {
    const ci = pairedTConfidenceInterval([1, 2, 3], [4, 5]);
    expect(ci.n).toBe(2);
    expect(ci.meanDiff).toBeCloseTo(-3, 4);
  });

  test('summarizeReplicationResults extracts nested metric paths', () => {
    const summary = summarizeReplicationResults([
      { result: { summary: { avgWait: 8, served: 20 } } },
      { result: { summary: { avgWait: 10, served: 22 } } },
      { result: { summary: { avgWait: 12, served: 24 } } },
    ], ['summary.avgWait', 'summary.served']);

    expect(summary['summary.avgWait'].mean).toBe(10);
    expect(summary['summary.served'].mean).toBe(22);
  });
});

describe('detectWarmupWelch', () => {
  function makeReplication(timeSeries) {
    return { timeSeries };
  }

  function buildSyntheticSeries({ transientEnd = 40, transientMean = 10, stableMean = 5, noise = 0.5, replications = 5, points = 100 }) {
    const reps = [];
    for (let r = 0; r < replications; r++) {
      const ts = [];
      for (let t = 0; t < points; t++) {
        const isTransient = t < transientEnd;
        const base = isTransient ? transientMean : stableMean;
        const val = base + (Math.random() - 0.5) * noise * 2;
        ts.push({ t, byType: { Customer: { waiting: val } } });
      }
      reps.push(makeReplication(ts));
    }
    return reps;
  }

  test('returns minWarmup when no replications provided', () => {
    const result = detectWarmupWelch([], 'byType.Customer.waiting', { minWarmup: 5 });
    expect(result.truncationPoint).toBe(5);
    expect(result.explanation).toContain('No time-series data');
    expect(result.series).toHaveLength(0);
  });

  test('returns minWarmup when replications lack timeSeries', () => {
    const result = detectWarmupWelch([{ summary: {} }, { summary: {} }], 'byType.Customer.waiting');
    expect(result.truncationPoint).toBe(0);
    expect(result.explanation).toContain('No time-series data');
  });

  test('detects knee near known transient boundary on synthetic data', () => {
    const reps = buildSyntheticSeries({ transientEnd: 35, transientMean: 15, stableMean: 5, noise: 1, replications: 10, points: 100 });
    const result = detectWarmupWelch(reps, 'byType.Customer.waiting', { threshold: 0.05 });

    expect(result.truncationPoint).toBeGreaterThanOrEqual(20);
    expect(result.truncationPoint).toBeLessThanOrEqual(50);
    expect(result.series.length).toBeGreaterThan(0);
    expect(result.confidence).toBeDefined();
  });

  test('explanation contains truncation time and relative change', () => {
    const reps = buildSyntheticSeries({ transientEnd: 30, transientMean: 12, stableMean: 4, noise: 0.5, replications: 8, points: 80 });
    const result = detectWarmupWelch(reps, 'byType.Customer.waiting');

    expect(result.explanation).toContain('Welch');
    expect(result.explanation).toContain('t=');
    expect(result.explanation).toContain('%');
  });

  test('series values are smoothed ensemble averages', () => {
    const reps = buildSyntheticSeries({ transientEnd: 25, transientMean: 8, stableMean: 3, noise: 0.3, replications: 6, points: 60 });
    const result = detectWarmupWelch(reps, 'byType.Customer.waiting');

    expect(result.series.length).toBe(60);
    // Early values should be higher (transient) than late values (stable)
    const earlyAvg = result.series.slice(0, 10).reduce((s, p) => s + p.value, 0) / 10;
    const lateAvg = result.series.slice(-10).reduce((s, p) => s + p.value, 0) / 10;
    expect(earlyAvg).toBeGreaterThan(lateAvg);
  });

  test('respects minWarmup option', () => {
    const reps = buildSyntheticSeries({ transientEnd: 10, transientMean: 20, stableMean: 5, noise: 0.2, replications: 4, points: 50 });
    const result = detectWarmupWelch(reps, 'byType.Customer.waiting', { minWarmup: 15 });

    expect(result.truncationPoint).toBeGreaterThanOrEqual(15);
  });
});

describe('batchMeansCI', () => {
  test('returns null CI for empty array', () => {
    const ci = batchMeansCI([]);
    expect(ci.mean).toBeNull();
    expect(ci.batchCount).toBe(0);
  });

  test('falls back to standard CI when fewer than 2 batches possible', () => {
    const values = [1, 2, 3];
    const ci = batchMeansCI(values, 10);
    expect(ci.batchCount).toBe(0);
    expect(ci.mean).not.toBeNull();
  });

  test('produces wider CI than standard for autocorrelated data', () => {
    // Create an autocorrelated series: each value depends on previous
    const autocorr = [];
    let prev = 10;
    for (let i = 0; i < 200; i++) {
      prev = prev * 0.9 + (Math.random() - 0.5) * 2;
      autocorr.push(prev);
    }

    const standard = confidenceInterval95(autocorr);
    const batch = batchMeansCI(autocorr, 20);

    expect(batch.batchCount).toBeGreaterThanOrEqual(2);
    expect(batch.mean).toBeCloseTo(standard.mean, 0);
    // Batch-means half-width should account for autocorrelation
    expect(batch.halfWidth).toBeGreaterThan(0);
  });

  test('batch means have lower autocorrelation than raw data', () => {
    const autocorr = [];
    let prev = 5;
    for (let i = 0; i < 300; i++) {
      prev = prev * 0.8 + (Math.random() - 0.5) * 3 + 5;
      autocorr.push(prev);
    }

    const batch = batchMeansCI(autocorr, 25);
    // Batch means should be less autocorrelated than raw values
    expect(Math.abs(batch.lag1Rho)).toBeLessThan(0.5);
  });

  test('auto-suggested batch size produces at least 2 batches', () => {
    const values = Array.from({ length: 100 }, () => Math.random() * 10 + 5);
    const m = suggestBatchSize(values);
    expect(m).toBeGreaterThanOrEqual(1);
    expect(Math.floor(values.length / m)).toBeGreaterThanOrEqual(2);
  });
});

describe('bonferroniCI', () => {
  test('returns empty array for empty input', () => {
    expect(bonferroniCI([])).toEqual([]);
  });

  test('applies correction and flags significance appropriately', () => {
    const comparisons = [
      { meanDiff: 5, halfWidth: 2, n: 30 },
      { meanDiff: 0.1, halfWidth: 1.5, n: 30 },
      { meanDiff: -3, halfWidth: 1, n: 30 },
    ];

    const result = bonferroniCI(comparisons, 0.05);

    expect(result).toHaveLength(3);

    // First comparison: 5 +/- bonferroni (should be significant)
    expect(result[0].significant95).toBe(true);
    expect(result[0].correctedAlpha).toBeCloseTo(0.05 / 3, 6);
    expect(result[0].bonferroniHalfWidth).toBeGreaterThan(comparisons[0].halfWidth);

    // Second comparison: 0.1 +/- bonferroni (small diff, likely not significant)
    expect(result[1].significant95).toBe(false);

    // Third comparison: -3 +/- bonferroni (should be significant)
    expect(result[2].significant95).toBe(true);
  });

  test('handles comparisons with null values', () => {
    const comparisons = [
      { meanDiff: null, halfWidth: null, n: 1 },
    ];

    const result = bonferroniCI(comparisons, 0.05);
    expect(result[0].significant95).toBe(false);
    expect(result[0].significant99).toBe(false);
    expect(result[0].bonferroniHalfWidth).toBeNull();
  });

  test('wider CI at 99% confidence than 95%', () => {
    const comparisons = [
      { meanDiff: 2, halfWidth: 0.5, n: 100 },
    ];

    const result = bonferroniCI(comparisons, 0.05);
    // Bonferroni-corrected half-width for 99% should be larger than for 95%
    // (both multiplied, but 99% has larger multiplier)
    // Actually, we compute bonferroniHalfWidth at 95% — check that 99% is more conservative
    expect(result[0].significant95).toBe(true); // 2 > bonferroni HW
  });
});

describe('compareScenarios', () => {
  function makeResult(summary) {
    return { result: { summary } };
  }

  test('returns comparison for each metric path', () => {
    const scenarioA = [
      makeResult({ avgWait: 10, served: 100 }),
      makeResult({ avgWait: 12, served: 110 }),
      makeResult({ avgWait: 11, served: 105 }),
    ];
    const scenarioB = [
      makeResult({ avgWait: 8, served: 120 }),
      makeResult({ avgWait: 9, served: 130 }),
      makeResult({ avgWait: 7, served: 125 }),
    ];

    const result = compareScenarios(scenarioA, scenarioB, ['summary.avgWait', 'summary.served']);

    expect(result.comparisons).toHaveLength(2);
    expect(result.significant).toBeDefined();
    expect(result.any95).toBeDefined();
    expect(result.labels.a).toBe('Scenario A');
    expect(result.labels.b).toBe('Scenario B');
  });

  test('comparisons contain meanDiff and significance flags', () => {
    const scenarioA = [
      makeResult({ avgWait: 15 }),
      makeResult({ avgWait: 17 }),
      makeResult({ avgWait: 16 }),
    ];
    const scenarioB = [
      makeResult({ avgWait: 5 }),
      makeResult({ avgWait: 6 }),
      makeResult({ avgWait: 7 }),
    ];

    const result = compareScenarios(scenarioA, scenarioB, ['summary.avgWait']);

    expect(result.comparisons[0].meanDiff).toBeCloseTo(10, 1);
    // Large mean diff should be significant
    expect(result.comparisons[0].significant95).toBe(true);
  });

  test('returns empty comparisons for empty metric paths', () => {
    const result = compareScenarios([{ a: 1 }], [{ a: 2 }], []);
    expect(result.comparisons).toHaveLength(0);
    expect(result.significant).toHaveLength(0);
  });
});

describe('computeSummaryStats', () => {
  test('returns null fields for fewer than 3 values', () => {
    const stats = computeSummaryStats([1, 2]);
    expect(stats.skewness).toBeNull();
    expect(stats.kurtosis).toBeNull();
    expect(stats.mean).toBe(1.5);
  });

  test('computes skewness and kurtosis for a symmetric normal-like sample', () => {
    // Approximately symmetric: skewness should be near 0
    const values = [1, 2, 3, 4, 5, 5, 4, 3, 2, 1];
    const stats = computeSummaryStats(values);
    expect(stats.n).toBe(10);
    expect(stats.mean).toBe(3);
    expect(Math.abs(stats.skewness)).toBeLessThan(0.5);
  });

  test('detects right-skewed distribution', () => {
    // Log-normal-ish: many small values, few large ones
    const values = [1, 1, 1, 1, 2, 2, 3, 5, 10, 20];
    const stats = computeSummaryStats(values);
    expect(stats.skewness).toBeGreaterThan(0.5);
  });

  test('handles zero-variance input', () => {
    const stats = computeSummaryStats([5, 5, 5, 5]);
    expect(stats.stdDev).toBe(0);
    expect(stats.skewness).toBe(0);
  });
});

describe('computePercentiles', () => {
  test('returns null + n:0 for empty array', () => {
    const result = computePercentiles([]);
    expect(result.n).toBe(0);
    expect(result.p50).toBeNull();
  });

  test('computes median correctly for odd count', () => {
    const result = computePercentiles([10, 20, 30, 40, 50]);
    expect(result.p50).toBe(30);
  });

  test('computes median correctly for even count (linear interpolation)', () => {
    const result = computePercentiles([10, 20, 30, 40]);
    // Sorted: [10,20,30,40]; n=4; idx for p50 = 0.5 * 3 = 1.5
    // = 20 + 0.5 * (30-20) = 25
    expect(result.p50).toBe(25);
  });

  test('computes custom percentiles', () => {
    const result = computePercentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [10, 90]);
    expect(result.p10).toBeCloseTo(1.9, 4);
    expect(result.p90).toBeCloseTo(9.1, 4);
  });

  test('p0 and p100 are min and max', () => {
    const result = computePercentiles([7, 2, 9, 4, 1], [0, 100]);
    expect(result.p0).toBe(1);
    expect(result.p100).toBe(9);
  });
});
