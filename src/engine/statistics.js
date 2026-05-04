function finiteValues(values = []) {
  return values.filter(value => Number.isFinite(value));
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
