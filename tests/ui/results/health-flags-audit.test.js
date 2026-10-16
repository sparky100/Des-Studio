// Regression tests from the 2026-10 health-flag audit.
import { describe, expect, test } from 'vitest';
import { buildEngine } from '../../../src/engine/index.js';
import { TEMPLATES } from '../../../src/engine/templates.js';
import { evaluateResultsHealth, evaluateLiveHealth } from '../../../src/ui/results/healthFlags.js';

const codes = (flags) => flags.map(f => f.code);

describe('H8 — Little\'s Law compares time in system, not queue wait', () => {
  test('a long steady M/M/1 run passes the check', () => {
    const mm1 = TEMPLATES.find(t => t.id === 'mm1');
    const r = buildEngine(mm1, 1, 500, 20000, null, 1e7, 1e7).runAll();
    expect(r.summary.waitDiscrepancy).toBeLessThanOrEqual(5);
    expect(r.summary.avgTimeInSystemByLittle).toBeGreaterThan(r.summary.avgWait);
  });
});

describe('H11 — idle-stretch threshold uses the real run length', () => {
  const results = (zeroDur, extra = {}) => ({
    finalTime: 10080,
    summary: { total: 300, avgSvc: 10, avgSojourn: 20, warmupPeriod: 0, perResource: { Xray: { utilisation: 0.5, maxSustainedZeroUtil: zeroDur } }, ...extra },
  });
  // 10080 / 300 arrivals = 33.6 between arrivals → threshold 168.
  test('a 100-unit idle stretch is not flagged', () => {
    expect(codes(evaluateResultsHealth(results(100)))).not.toContain('H11');
  });
  test('a 200-unit idle stretch is flagged', () => {
    expect(codes(evaluateResultsHealth(results(200)))).toContain('H11');
  });
  test('warm-up is excluded from the run length', () => {
    // 10080 − 5040 warm-up = 5040 / 300 = 16.8 → threshold 84.
    expect(codes(evaluateResultsHealth(results(100, { warmupPeriod: 5040 })))).toContain('H11');
  });
});

describe('H10 / L5 — sustained stretch must outlast several services', () => {
  const summary = (highDur, avgSvc) => ({ avgSvc, perResource: { Doc: { utilisation: 0.7, maxSustainedHighUtil: highDur } } });
  test('a single 40-unit job on a 1-server resource is not "sustained"', () => {
    expect(codes(evaluateResultsHealth({ summary: summary(40, 30) }))).not.toContain('H10');
    expect(codes(evaluateLiveHealth({}, summary(40, 30)))).not.toContain('L5');
  });
  test('a stretch of 10+ mean services is', () => {
    expect(codes(evaluateResultsHealth({ summary: summary(300, 30) }))).toContain('H10');
    expect(codes(evaluateLiveHealth({}, summary(300, 30)))).toContain('L5');
  });
  test('the 15-unit floor still applies to very short services', () => {
    expect(codes(evaluateResultsHealth({ summary: summary(12, 0.5) }))).not.toContain('H10');
    expect(codes(evaluateResultsHealth({ summary: summary(16, 0.5) }))).toContain('H10');
  });
});

describe('H2 — growing queue is judged after warm-up', () => {
  // Queue fills during a 100-unit warm-up, then holds steady at 5.
  const timeSeries = Array.from({ length: 60 }, (_, i) => ({ t: i * 5, byQueue: { Q: { waiting: i * 5 < 100 ? i / 4 : 5 } } }));
  test('the warm-up fill alone does not count as growth', () => {
    expect(codes(evaluateResultsHealth({ timeSeries, summary: { warmupPeriod: 100 } }))).not.toContain('H2');
  });
  test('without warm-up the same series still reads as growth', () => {
    expect(codes(evaluateResultsHealth({ timeSeries, summary: { warmupPeriod: 0 } }))).toContain('H2');
  });
});
