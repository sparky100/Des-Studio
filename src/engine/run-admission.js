import { estimateRunComplexity } from "./complexity-estimator.js";
import { validateModel } from "./validation.js";
import { checkModel } from "../simulation/modelChecker.js";

export const RUN_ADMISSION_TIERS = Object.freeze({
  free: Object.freeze({
    id: "free",
    label: "Free",
    maxReplications: 10,
    maxScans: 50000,
    maxPlannedRows: 2000,
    maxSimTime: 10000,
    disableTimeSeriesAt: "large",
  }),
  standard: Object.freeze({
    id: "standard",
    label: "Standard",
    maxReplications: 30,
    maxScans: 250000,
    maxPlannedRows: 10000,
    maxSimTime: 50000,
    disableTimeSeriesAt: "large",
  }),
  pro: Object.freeze({
    id: "pro",
    label: "Pro",
    maxReplications: 100,
    maxScans: 1000000,
    maxPlannedRows: 50000,
    maxSimTime: 200000,
    disableTimeSeriesAt: "too_large",
  }),
});

const RISK_ORDER = {
  small: 0,
  medium: 1,
  large: 2,
  too_large: 3,
};

function makeDecisionIssue(code, message, source = "admission") {
  return { code, message, source };
}

function shouldDisableTimeSeries(tier, riskLevel) {
  const threshold = RUN_ADMISSION_TIERS[tier]?.disableTimeSeriesAt || "large";
  return (RISK_ORDER[riskLevel] ?? 0) >= (RISK_ORDER[threshold] ?? 2);
}

function normalizeValidationInput(model, options) {
  const terminationMode = options.terminationMode === "condition" ? "condition" : "time";
  return {
    ...model,
    warmupPeriod: options.warmupPeriod ?? 0,
    replications: options.replications ?? 1,
    terminationMode,
    maxSimTime: terminationMode === "time" ? (options.maxSimTime ?? 0) : 0,
    terminationCondition: terminationMode === "condition" ? (options.terminationCondition ?? null) : null,
  };
}

function normalizeCheckerIssue(issue) {
  return makeDecisionIssue(issue.code, issue.message, "model-check");
}

export function resolveRunAdmissionTier(plan, options = {}) {
  if (options.isAdmin) return "pro";
  const key = String(plan || "").trim().toLowerCase();
  if (options.planTierMap) {
    const mapped = options.planTierMap[key];
    if (mapped && RUN_ADMISSION_TIERS[mapped]) return mapped;
  }
  switch (key) {
    case "pro":       return "standard";
    case "standard":  return "standard";
    case "enterprise":
    case "pro_plus":
    case "pro-plus":  return "pro";
    case "free":
    default:          return "free";
  }
}

export function getRunAdmission(model, options = {}) {
  // Merge DB overrides over hardcoded defaults (field-level, per tier)
  const activePolicies = options.tierPolicies
    ? Object.fromEntries(
        Object.entries(RUN_ADMISSION_TIERS).map(([k, v]) => [k, { ...v, ...(options.tierPolicies[k] || {}) }])
      )
    : RUN_ADMISSION_TIERS;
  const planTierMap = options.tierPolicies?.plan_tier_map || null;
  const tier = activePolicies[options.tier] ? options.tier : resolveRunAdmissionTier(options.plan, { isAdmin: options.isAdmin, planTierMap });
  const tierPolicy = activePolicies[tier] || RUN_ADMISSION_TIERS.pro;
  const validationInput = normalizeValidationInput(model || {}, options);
  const validation = options.validation || validateModel(validationInput);
  const modelCheckIssues = options.modelCheckIssues || checkModel(model || {});
  const complexityEstimate = options.complexityEstimate || estimateRunComplexity(model || {}, {
    terminationMode: options.terminationMode,
    maxSimTime: options.maxSimTime,
    replications: options.replications,
  });

  const hardErrors = [
    ...validation.errors.map(issue => makeDecisionIssue(issue.code, issue.message, "validation")),
    ...modelCheckIssues.filter(issue => issue.severity === "error").map(normalizeCheckerIssue),
  ];
  const warnings = [
    ...validation.warnings.map(issue => makeDecisionIssue(issue.code, issue.message, "validation")),
    ...modelCheckIssues
      .filter(issue => issue.severity !== "error")
      .map(normalizeCheckerIssue),
  ];
  const confirmations = [];

  const replications = Math.max(1, parseInt(options.replications ?? 1, 10) || 1);
  const maxSimTime = Number(options.maxSimTime);
  const terminationMode = options.terminationMode === "condition" ? "condition" : "time";
  const requestedCollectTimeSeries = options.collectTimeSeries !== false;
  const plannedScheduleRows = Number.isFinite(complexityEstimate.plannedScheduleRows)
    ? complexityEstimate.plannedScheduleRows
    : 0;
  const estimatedCEventScans = Number.isFinite(complexityEstimate.estimatedCEventScans)
    ? complexityEstimate.estimatedCEventScans
    : 0;
  const nearScanThreshold = tierPolicy.maxScans * 0.8;
  const nearPlannedRowsThreshold = tierPolicy.maxPlannedRows * 0.8;

  if (terminationMode === "time" && (!Number.isFinite(maxSimTime) || maxSimTime <= 0)) {
    hardErrors.push(makeDecisionIssue("RA1", "Run duration must be greater than 0 for time-based runs."));
  }
  if (terminationMode === "time" && Number.isFinite(maxSimTime) && maxSimTime > tierPolicy.maxSimTime) {
    hardErrors.push(makeDecisionIssue(
      "RA2",
      `Run duration exceeds the ${tierPolicy.label.toLowerCase()} tier limit of ${tierPolicy.maxSimTime.toLocaleString()}.`
    ));
  }
  if (replications > tierPolicy.maxReplications) {
    hardErrors.push(makeDecisionIssue(
      "RA3",
      `Number of runs exceeds the ${tierPolicy.label.toLowerCase()} tier limit of ${tierPolicy.maxReplications.toLocaleString()}.`
    ));
  }
  if (plannedScheduleRows > tierPolicy.maxPlannedRows) {
    hardErrors.push(makeDecisionIssue(
      "RA4",
      `Planned schedule rows exceed the ${tierPolicy.label.toLowerCase()} tier limit of ${tierPolicy.maxPlannedRows.toLocaleString()}.`
    ));
  } else if (plannedScheduleRows >= nearPlannedRowsThreshold && plannedScheduleRows > 0) {
    warnings.push(makeDecisionIssue(
      "RA5",
      `Planned schedule rows are close to the ${tierPolicy.label.toLowerCase()} tier limit (${plannedScheduleRows.toLocaleString()} of ${tierPolicy.maxPlannedRows.toLocaleString()}).`
    ));
    confirmations.push(makeDecisionIssue(
      "RA6",
      "This run uses a large planned schedule and may take longer than usual to prepare."
    ));
  }
  if (estimatedCEventScans > tierPolicy.maxScans) {
    hardErrors.push(makeDecisionIssue(
      "RA7",
      `Estimated C-event scans per run (${Math.round(estimatedCEventScans).toLocaleString()}) exceed the ${tierPolicy.label.toLowerCase()} tier limit of ${tierPolicy.maxScans.toLocaleString()}.`
    ));
  } else if (estimatedCEventScans >= nearScanThreshold && estimatedCEventScans > 0) {
    warnings.push(makeDecisionIssue(
      "RA8",
      `Estimated C-event scans are close to the ${tierPolicy.label.toLowerCase()} tier limit (${Math.round(estimatedCEventScans).toLocaleString()} of ${tierPolicy.maxScans.toLocaleString()}).`
    ));
    confirmations.push(makeDecisionIssue(
      "RA9",
      "This run is likely to be heavy and may take longer or save fewer visuals."
    ));
  }
  if (terminationMode === "condition") {
    warnings.push(makeDecisionIssue(
      "RA10",
      "Stop-on-condition runs are harder to size accurately before execution."
    ));
    confirmations.push(makeDecisionIssue(
      "RA11",
      "This run stops when a rule becomes true, so run time and saved result size are less predictable."
    ));
  }
  for (const bottleneck of complexityEstimate.bottlenecks || []) {
    warnings.push(makeDecisionIssue(
      "RA12",
      `${bottleneck.queueName}: ${bottleneck.reason}`
    ));
  }

  const effectiveCollectTimeSeries = requestedCollectTimeSeries && (
    (RISK_ORDER[complexityEstimate.riskLevel] ?? 0) >= (RISK_ORDER[tierPolicy.disableTimeSeriesAt || "large"] ?? 2)
  )
    ? false
    : requestedCollectTimeSeries;
  if (requestedCollectTimeSeries && !effectiveCollectTimeSeries) {
    warnings.push(makeDecisionIssue(
      "RA13",
      "Chart data will be turned off automatically for this run to reduce browser and storage cost."
    ));
    confirmations.push(makeDecisionIssue(
      "RA14",
      "Chart data will be turned off automatically because this run looks large."
    ));
  }

  return {
    hardErrors,
    warnings,
    confirmations,
    effectiveSettings: {
      allowRun: hardErrors.length === 0,
      collectTimeSeries: effectiveCollectTimeSeries,
    },
    tier,
    tierPolicy,
    validation,
    modelCheckIssues,
    complexityEstimate,
  };
}
