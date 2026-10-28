// @ts-check
// What a visitor's run of a published model looks like: the settings it runs
// with, and whether those settings are admitted. Shared by the public page
// (which runs the model) and the owner's publish panel (which warns, before
// publishing, that a visitor would not be able to).
import { estimateRunComplexity } from "./complexity-estimator.js";
import { getRunAdmission } from "./run-admission.js";

/**
 * The run settings a visitor gets: the model's own experiment defaults.
 * @param {Record<string, any>} model
 */
export function publishedRunSettings(model) {
  const defaults = model?.experimentDefaults || {};
  const terminationMode = defaults.terminationMode === "condition" ? "condition" : "time";
  return {
    terminationMode,
    warmupPeriod: defaults.warmupPeriod ?? 0,
    maxSimTime: terminationMode === "condition" ? null : (defaults.maxSimTime ?? 500),
    terminationCondition: terminationMode === "condition" ? defaults.terminationCondition : null,
    replications: Math.max(1, Number.parseInt(String(defaults.replications ?? 10), 10) || 10),
    seed: defaults.seed ?? 0,
  };
}

/**
 * Estimate and admit a visitor's run of `model` under the published tier.
 * @param {Record<string, any>} model
 * @param {Record<string, any>} [schedulesMap]
 */
export function checkPublishedRun(model, schedulesMap = {}) {
  const settings = publishedRunSettings(model);
  // Estimated WITH the schedules map: without it a schedule-driven model's
  // arrivals are under-counted and the run would be capped short.
  const complexityEstimate = estimateRunComplexity(model, {
    terminationMode: settings.terminationMode,
    maxSimTime: settings.maxSimTime,
    replications: settings.replications,
    schedulesMap,
  });
  const admission = getRunAdmission(model, { ...settings, tier: "published", complexityEstimate });
  return { settings, complexityEstimate, admission };
}
