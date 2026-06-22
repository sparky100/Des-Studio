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
    maxReplications: 500,
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
  const requestedCollectTrace = options.collectTrace !== false;
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
    const pct = bottleneck.utilisationEstimate != null
      ? `~${Math.round(bottleneck.utilisationEstimate * 100)}%`
      : null;
    const resource = Array.isArray(bottleneck.resourceNames) && bottleneck.resourceNames.length > 0
      ? bottleneck.resourceNames[0]
      : null;
    const action = resource
      ? `consider adding ${resource} capacity or reducing arrivals`
      : `consider increasing capacity`;
    const msg = pct
      ? `${bottleneck.queueName} may queue heavily (${pct} estimated utilisation) — ${action}.`
      : `${bottleneck.queueName} may fill up — ${action}.`;
    warnings.push(makeDecisionIssue("RA12", msg));
  }

  // Gate time series on the actual cost of snapLite (O(entities) per B-event cycle),
  // not on overall risk level which is dominated by C-event scan count. A model with
  // many C-events but few in-flight entities is cheap to snapshot; a high-volume
  // low-complexity model can be expensive. Threshold: ~100M iterations per rep.
  const estimatedBEventFirings = complexityEstimate.estimatedCEventScans / Math.max(1, complexityEstimate.cEventCount);
  const estimatedSnapLiteCost = complexityEstimate.expectedEntities * estimatedBEventFirings;
  const effectiveCollectTimeSeries = requestedCollectTimeSeries && estimatedSnapLiteCost <= 100_000_000;
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

  // Gate the per-cycle event trace on estimated C-event scans — each scan can push a
  // trace entry, so this is the same metric already used for RA7/RA8 above. Observed
  // cost on a real ~180k-cycle run: ~500k trace entries, ~480MB and 20+ minutes just to
  // build the array. Batch Run already defaults collectTrace to false (replication-runner.js);
  // this gate covers Auto Run / single-run, which otherwise inherit the engine's collectTrace
  // default of true regardless of model size.
  const TRACE_SCAN_THRESHOLD = 150_000;
  const effectiveCollectTrace = requestedCollectTrace && estimatedCEventScans <= TRACE_SCAN_THRESHOLD;
  if (requestedCollectTrace && !effectiveCollectTrace) {
    warnings.push(makeDecisionIssue(
      "RA15",
      "Live event trace will be turned off automatically for this run to avoid excessive memory use and slowdown."
    ));
    confirmations.push(makeDecisionIssue(
      "RA16",
      "Event trace will be turned off automatically because this run looks large. You can force it on for debugging."
    ));
  }

  return {
    hardErrors,
    warnings,
    confirmations,
    effectiveSettings: {
      allowRun: hardErrors.length === 0,
      collectTimeSeries: effectiveCollectTimeSeries,
      collectTrace: effectiveCollectTrace,
    },
    tier,
    tierPolicy,
    validation,
    modelCheckIssues,
    complexityEstimate,
  };
}
