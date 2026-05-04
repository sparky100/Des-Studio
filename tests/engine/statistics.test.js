import { describe, expect, test } from 'vitest';
import {
  confidenceInterval95,
  mean,
  sampleStdDev,
  sampleVariance,
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
