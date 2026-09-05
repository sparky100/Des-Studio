// src/contracts/study.ts — Study definition contract (parameter-sweep experiments).
//
// A "Study" varies one or more model parameters across a range/sample and
// evaluates goals/an objective across the resulting points (the "Studies"
// panel under Run — src/engine/sweep-*.js, src/ui/execute/SweepViews.jsx).
// This is a distinct concept from an "Experiment" (the `experiments` table /
// SavedExperimentsTab.jsx — a saved *named parameter set*, not a swept
// range). Do not conflate the two in code, table, or UI-copy naming.

import type { DesModelJson } from "./model";

// ── Plan types ───────────────────────────────────────────────────────────

export type StudyPlanType = "grid1d" | "grid2d" | "sampled" | "sequential";

// ── Parameters ───────────────────────────────────────────────────────────

/**
 * The `type` values enumerateSweepableParams() (src/engine/sweep-params.js)
 * currently emits. Kept here so a StudyDefinition can be typed without
 * re-deriving this list; if a new sweepable param type is added there, add
 * it here too.
 */
export type SweepableParamType =
  | "entityTypeCount"
  | "shiftCapacity"
  | "schedulePatternBaseCapacity"
  | "schedulePatternPeriodCapacity"
  | "schedulePatternDefaultCapacity"
  | "queueCapacity"
  | "bEventDistParam"
  | "bEventPiecewisePeriodParam"
  | "cEventDistParam"
  | "cEventPiecewisePeriodParam"
  | "stateVarInit"
  | "containerCapacity"
  | "containerInitialLevel";

export interface StudyParamRange {
  min: number;
  max: number;
  step: number;
}

/**
 * A sweepable parameter descriptor as produced by enumerateSweepableParams(),
 * plus the range/levels a Study varies it across. `path` is a stable,
 * human-readable address (e.g. "entityTypes.<id>.count") but is NOT a
 * generic JSON-pointer — resolving/applying a value against it always goes
 * through applySweepValue(s)/applySweepValues() in sweep-params.js, which
 * re-derives the target from `type` + `targetId`, not by walking `path`.
 */
export interface StudyParameter {
  type: SweepableParamType;
  targetId: string;
  path: string;
  label: string;
  description?: string;
  currentValue?: number;
  subLabel?: string;
  parentLabel?: string;
  paramKey?: string;
  scheduleIndex?: number;
  periodIndex?: number;
  /** Continuous/stepped range — grid1d/grid2d use it directly; sampled/sequential plans sample within it. */
  range?: StudyParamRange;
  /** Discrete candidate values — alternative to `range`. */
  levels?: number[];
}

// ── Goals (moved verbatim — see src/ui/editors/GoalsEditor.jsx) ──────────

export interface StudyGoalScope {
  type: "queue" | "resource" | "container";
  id: string;
  name: string;
}

/**
 * The actual runtime goal shape, verified against GoalsEditor.jsx,
 * src/llm/prompts.js (goalsToPrompt/buildGoalGaps/evaluateSweepPointGoals),
 * and SweepViews.jsx's pointIsFeasible — NOT src/contracts/model.ts's
 * GoalDefinition, which is missing `id`/`description`/`scope` and is stale
 * relative to the real editor. Not fixing model.ts here — goals are moved
 * verbatim into a Study, not redesigned.
 */
export interface StudyGoal {
  id: string;
  /** Dot-notation metric key, e.g. "summary.avgWait" (legacy short keys like "avgWait" are also tolerated by existing readers). */
  metric: string;
  target: number | string;
  operator: "<" | "<=" | ">" | ">=" | "==" | string; // string covers the "p50".."p99" percentile operators
  label?: string;
  description?: string | null;
  scope?: StudyGoalScope | null;
}

// ── Metric references ─────────────────────────────────────────────────────
//
// A MetricRef is a typed pointer into what a single replication's result
// actually contains (src/engine/index.js buildRunResult()/getSummary(),
// verified field-by-field — see the two field lists below for exactly what
// survives to the returned/persisted object, since several are internal
// accumulators deleted before summary is returned, e.g. `busyTimeSum`).
// `metricRefToPath()` turns a MetricRef into the flat dot-path string that
// summarizeReplicationResults()/getPathValue() (src/engine/statistics.js)
// already consume unchanged — no changes needed to that pipeline.

export type SummaryMetricField =
  | "total"
  | "served"
  | "reneged"
  | "balked"
  | "avgWait"
  | "avgWaitByLittle"
  | "avgSvc"
  | "avgSojourn"
  | "maxSojourn"
  | "avgTimeInSystem"
  | "servedRatio"
  | "avgWIP"
  | "totalCost"
  | "costPerServed"
  | "avgPlanDeviation";

/**
 * Verified against the post-processing loop in engine/index.js's runAll()
 * summary builder: `busyTimeSum`, `starvationTimeSum`, `maxContStarvDur`,
 * `downtimeSum`, and `skillBusyTimeSum` are internal accumulators that are
 * `delete`d before the summary is returned — they must NOT appear here.
 */
export type PerResourceMetricField =
  | "total"
  | "utilisation"
  | "calendarUtilisation"
  | "starvationTime"
  | "starvationPct"
  | "maxStarvationDuration"
  | "totalDowntime"
  | "availability"
  | "meanDowntimePerFailure"
  | "failureCount"
  | "scheduleAdherence"
  | "maxSustainedHighUtil"
  | "maxSustainedZeroUtil";

/**
 * Verified against every `_perQueue[qName][...]` write site in
 * engine/index.js — `blockingCount`/`balkCount` are the only two fields
 * ever set on it (there is a separate, unrelated per-sample time-series
 * `byQueue.avgWait`/`waitN` structure — not this one).
 */
export type PerQueueMetricField = "blockingCount" | "balkCount";

export type RuntimeMetricsField =
  | "events_processed"
  | "c_event_scans"
  | "c_events_fired"
  | "entities_created"
  | "entities_completed"
  | "max_future_event_list_size";

export type MetricRef =
  | { kind: "summary"; field: SummaryMetricField }
  | { kind: "perResource"; resourceTypeId: string; field: PerResourceMetricField }
  | { kind: "perQueue"; queueId: string; field: PerQueueMetricField }
  | { kind: "runtimeMetrics"; field: RuntimeMetricsField };

export const SUMMARY_METRIC_FIELDS: SummaryMetricField[] = [
  "total", "served", "reneged", "balked", "avgWait", "avgWaitByLittle",
  "avgSvc", "avgSojourn", "maxSojourn", "avgTimeInSystem", "servedRatio",
  "avgWIP", "totalCost", "costPerServed", "avgPlanDeviation",
];

export const PER_RESOURCE_METRIC_FIELDS: PerResourceMetricField[] = [
  "total", "utilisation", "calendarUtilisation", "starvationTime",
  "starvationPct", "maxStarvationDuration", "totalDowntime", "availability",
  "meanDowntimePerFailure", "failureCount", "scheduleAdherence",
  "maxSustainedHighUtil", "maxSustainedZeroUtil",
];

export const PER_QUEUE_METRIC_FIELDS: PerQueueMetricField[] = ["blockingCount", "balkCount"];

export const RUNTIME_METRICS_FIELDS: RuntimeMetricsField[] = [
  "events_processed", "c_event_scans", "c_events_fired",
  "entities_created", "entities_completed", "max_future_event_list_size",
];

/** Validates a MetricRef's `kind`/`field` combination against the allowed-refs lists above (used by Phase 3's AI-proposal validation). Does not check that a `resourceTypeId`/`queueId` actually resolves against a model — use metricRefToPath() for that. */
export function isAllowedMetricRef(ref: unknown): ref is MetricRef {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  switch (r.kind) {
    case "summary":
      return SUMMARY_METRIC_FIELDS.includes(r.field as SummaryMetricField);
    case "perResource":
      return typeof r.resourceTypeId === "string" && r.resourceTypeId.length > 0
        && PER_RESOURCE_METRIC_FIELDS.includes(r.field as PerResourceMetricField);
    case "perQueue":
      return typeof r.queueId === "string" && r.queueId.length > 0
        && PER_QUEUE_METRIC_FIELDS.includes(r.field as PerQueueMetricField);
    case "runtimeMetrics":
      return RUNTIME_METRICS_FIELDS.includes(r.field as RuntimeMetricsField);
    default:
      return false;
  }
}

/**
 * Resolves a MetricRef to the flat dot-path string
 * summarizeReplicationResults()/getPathValue() (src/engine/statistics.js)
 * expect, relative to a replication's `result` object. `perResource`/
 * `perQueue` refs need `model` to translate the stable `resourceTypeId`/
 * `queueId` into the *name* the runtime object is actually keyed by
 * (confirmed in engine/index.js: `perResource[et.name]`, `_perQueue[qName]`)
 * — returns null if the id can't be resolved.
 *
 * Known limitation (pre-existing, not introduced here): getPathValue()
 * naively `.split(".")`s the path, so a resource/queue *name* containing a
 * literal "." would break resolution.
 */
export function metricRefToPath(
  ref: MetricRef,
  model?: Pick<DesModelJson, "entityTypes" | "queues">,
): string | null {
  switch (ref.kind) {
    case "summary":
      return `summary.${ref.field}`;
    case "runtimeMetrics":
      return `runtimeMetrics.${ref.field}`;
    case "perResource": {
      const name = model?.entityTypes?.find(et => et.id === ref.resourceTypeId)?.name;
      return name ? `summary.perResource.${name}.${ref.field}` : null;
    }
    case "perQueue": {
      const name = model?.queues?.find(q => q.id === ref.queueId)?.name;
      return name ? `summary.perQueue.${name}.${ref.field}` : null;
    }
    default:
      return null;
  }
}

/** Convenience for the common case: turn a "summary.X" path (the shape every existing KPI dropdown already uses, e.g. src/ui/execute/executeHelpers.js's CI_METRICS) into a MetricRef. Returns null for anything else — perResource/perQueue/runtimeMetrics refs must be constructed directly. */
export function summaryPathToMetricRef(path: string): MetricRef | null {
  const field = path.startsWith("summary.") ? path.slice("summary.".length) : null;
  if (!field || !SUMMARY_METRIC_FIELDS.includes(field as SummaryMetricField)) return null;
  return { kind: "summary", field: field as SummaryMetricField };
}

// ── Objective / budget / origin ────────────────────────────────────────────

export interface StudyObjective {
  metricRef: MetricRef;
  direction: "min" | "max";
}

export interface StudyRunBudget {
  points: number;
  replicationsPerPoint: number;
}

export type StudyOriginKind = "user" | "experiment" | "ai" | "study";

export interface StudyOrigin {
  kind: StudyOriginKind;
  /** id of the source Experiment/Study/diagnosis this Study was seeded/proposed from, when kind !== "user". */
  refId?: string;
}

// ── Study definition ────────────────────────────────────────────────────────

export interface StudyDefinition {
  name: string;
  planType: StudyPlanType;
  parameters: StudyParameter[];
  goals: StudyGoal[];
  objective: StudyObjective | null;
  runBudget: StudyRunBudget;
  baseSeed: number;
  origin: StudyOrigin;
}

/** Current shape version written to `studies.schema_version` by saveStudy(). Bump when StudyDefinition's persisted shape changes incompatibly. */
export const STUDY_SCHEMA_VERSION = 2;

export type StudyStatus = "draft" | "running" | "complete" | "cancelled" | "error";

export const STUDY_STATUSES: StudyStatus[] = ["draft", "running", "complete", "cancelled", "error"];

// ── Study points ───────────────────────────────────────────────────────────

export interface StudyPointMetric {
  mean: number | null;
  ci95Low: number | null;
  ci95High: number | null;
  min: number | null;
  max: number | null;
}

/** One row of `study_points` — the aggregated result of one Study point (never per-replication detail; see results-persistence.js's 800KB payload guard). */
export interface StudyPoint {
  id?: string;
  pointIndex: number;
  /** Resolved parameter values for this point, e.g. [{ path, value }, ...] — one entry per StudyDefinition.parameters entry, in the same order. */
  params: Array<{ path: string; value: number }>;
  replications: number;
  /** Keyed by the same dot-path metricRefToPath() produces, e.g. "summary.avgWait". */
  metrics: Record<string, StudyPointMetric>;
  feasible: boolean | null;
  seed: number | null;
  createdAt?: string;
}
