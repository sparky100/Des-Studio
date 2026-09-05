// @ts-check
// sweep-sensitivity.js — Simple main-effect sensitivity ranking for a Study.
//
// Estimates each swept parameter's influence on the objective metric using
// the Pearson correlation coefficient between the parameter's value and the
// objective's per-point mean, across all evaluated points. This is a
// screening heuristic, not a formal variance-based sensitivity analysis
// (e.g. Sobol indices) — it assumes a roughly monotonic relationship between
// a parameter and the objective, so it will under-report a parameter whose
// effect is strongly non-monotonic (e.g. a U-shaped response curve). The
// exported `method` string says this explicitly so it can be shown next to
// the ranking, not just asserted here.
//
// No React, no DOM — pure JS, can run in a worker alongside sweep-runner.js.

export const SENSITIVITY_METHOD_DESCRIPTION =
  "Pearson correlation between each parameter's sampled value and the objective's mean at that point, across all evaluated points. " +
  "A screening heuristic, not a formal sensitivity analysis — it assumes a roughly monotonic effect and can under-report a parameter whose influence is strongly non-monotonic (e.g. U-shaped).";

/** @param {number[]} xs @param {number[]} ys */
function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  // A parameter that never varied across the evaluated points (varX === 0)
  // or an objective that never varied (varY === 0, e.g. every point was
  // infeasible in the same way) carries no linear signal — report null
  // rather than a misleading 0/0 correlation.
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

/**
 * @typedef {{ path: string, value: number|null|undefined }} SensitivityParamValue
 * @typedef {{ params: SensitivityParamValue[], metrics?: Record<string, {mean: number|null}>, aggregateStats?: Record<string, {mean: number|null}> }} SensitivityPoint
 * @typedef {{ path: string, label?: string }} SensitivityParamDescriptor
 */

/**
 * @param {SensitivityPoint[]} points
 * @param {SensitivityParamDescriptor[]} parameters
 * @param {string|null|undefined} objectiveMetricPath  e.g. "summary.avgWait" — the dot-path metricRefToPath() produces
 * @returns {{ method: string, ranking: Array<{ path: string, label: string, correlation: number|null, sampleSize: number }> }}
 */
export function computeSensitivityRanking(points = [], parameters = [], objectiveMetricPath) {
  if (!objectiveMetricPath || !Array.isArray(points) || points.length < 2 || !Array.isArray(parameters) || parameters.length === 0) {
    return { method: SENSITIVITY_METHOD_DESCRIPTION, ranking: [] };
  }

  const objectiveValues = points.map(pt => {
    const stat = (pt.metrics || pt.aggregateStats || {})[objectiveMetricPath];
    return stat?.mean;
  });

  const ranking = parameters.map(param => {
    const paramValues = points.map(pt => pt.params?.find(p => p.path === param.path)?.value);
    const pairs = paramValues
      .map((v, i) => [v, objectiveValues[i]])
      .filter(([v, o]) => Number.isFinite(v) && Number.isFinite(o));
    // Filtered above to only finite numbers — cast past the map/filter's
    // wider inferred element type (number|null|undefined) to reflect that.
    const correlation = pairs.length >= 2
      ? pearsonCorrelation(
          pairs.map(p => /** @type {number} */ (p[0])),
          pairs.map(p => /** @type {number} */ (p[1])),
        )
      : null;
    return {
      path: param.path,
      label: param.label || param.path,
      correlation,
      sampleSize: pairs.length,
    };
  });

  ranking.sort((a, b) => {
    const aAbs = a.correlation == null ? -1 : Math.abs(a.correlation);
    const bAbs = b.correlation == null ? -1 : Math.abs(b.correlation);
    return bAbs - aAbs;
  });

  return { method: SENSITIVITY_METHOD_DESCRIPTION, ranking };
}
