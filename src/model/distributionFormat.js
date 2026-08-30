// model/distributionFormat.js — short human-readable label for a distribution
// declared on an EventSchedule row (b-event inter-arrival, c-event service
// time). Walks the schedules array to find the first row that declares a
// distribution. Shared by the Execute canvas (inter-arrival countdown label)
// and the Visual Designer (Draw-canvas node detail line) — same EventSchedule
// shape either way, so one formatter serves both.

export function formatDistributionLabel(schedules) {
  const rows = Array.isArray(schedules) ? schedules : [];
  for (const row of rows) {
    const distType = row.dist || row.distType || row.distribution?.type || "";
    if (!distType) continue;
    const params = row.distParams || row.params || row.distribution || {};
    switch (String(distType).toLowerCase()) {
      case "exponential": return params.rate   != null ? `Exp(λ=${params.rate})`                        : "Exp";
      case "uniform":     return params.min    != null ? `U(${params.min}, ${params.max})`              : "Uniform";
      case "normal":      return params.mean   != null ? `N(μ=${params.mean}, σ=${params.stdDev})`      : "Normal";
      case "fixed":       return params.value  != null ? `Fixed(${params.value})`                       : "Fixed";
      case "triangular":  return                         `Tri(${params.min}, ${params.mode}, ${params.max})`;
      case "lognormal":   return params.logMean!= null ? `LogN(μ=${params.logMean})`                    : "LogNormal";
      case "empirical":   return params.values != null ? `Empirical(n=${params.values.length})`         : "Empirical";
      default:            return String(distType).charAt(0).toUpperCase() + String(distType).slice(1);
    }
  }
  return null;
}
