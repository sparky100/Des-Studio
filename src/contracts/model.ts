export const MODEL_JSON_KEYS = [
  "entityTypes",
  "stateVariables",
  "bEvents",
  "cEvents",
  "queues",
  "experimentDefaults",
] as const;

export type ModelJsonKey = (typeof MODEL_JSON_KEYS)[number];

export type EntityRole = "customer" | "server";
export type QueueDiscipline = "FIFO" | "LIFO" | "PRIORITY";
export type TimeUnit = "seconds" | "minutes" | "hours" | "days";
export type GoalOperator = "<" | "<=" | ">" | ">=" | "==";

export interface AttributeDefinition {
  id?: string;
  name: string;
  valueType?: "number" | "string" | "boolean";
  defaultValue?: unknown;
  mutable?: boolean;
  allowedValues?: string[];
  // Shorthand distribution spec (alternative to `distribution` object)
  dist?: string;
  distParams?: Record<string, unknown>;
  distribution?: DistributionSpec;
}

export interface EntityTypeDefinition {
  id: string;
  name: string;
  role: EntityRole;
  count?: number | string;
  attrDefs?: AttributeDefinition[];
  attrs?: string;
  shiftSchedule?: ShiftSchedulePeriod[];
  // Server failure model (V5 validated at runtime)
  mtbfDist?: string;
  mtbfDistParams?: Record<string, unknown>;
  mttrDist?: string;
  mttrDistParams?: Record<string, unknown>;
  description?: string;
}

// `time` and `when` are mutually exclusive — enforced by validator rule V48
// (not the type system; this codebase uses plain interfaces, no XOR tricks).
export interface ShiftSchedulePeriod {
  time?: number | string;
  capacity: number | string;
  when?: ShiftWhenPredicate;
}

// Predicate shape for condition-triggered shiftSchedule entries. Only
// "state.*" and "Queue.*" variables are supported for shift `when` clauses
// (enforced by validator rule V48); see src/engine/conditions.js
// resolveVariable/getPredicateDependencies for the shared predicate evaluator.
export interface ShiftWhenPredicate {
  variable: string;
  operator: "==" | "!=" | "<" | ">" | "<=" | ">=";
  value: string | number | boolean;
}

export interface StateVariableDefinition {
  id: string;
  name: string;
  valueType?: "number" | "string" | "boolean";
  initialValue?: unknown;
  /** If true (default), resets to initialValue when the warm-up period ends. */
  resetOnWarmup?: boolean;
  description?: string;
}

export interface DistributionSpec {
  type?: string;
  dist?: string;
  params?: Record<string, unknown>;
  distParams?: Record<string, unknown>;
  periods?: PiecewiseDistributionPeriod[];
}

export interface PiecewiseDistributionPeriod {
  startTime: number | string;
  distribution: DistributionSpec;
}

export interface ParamSource {
  sourceId: string;
  field: string;
  targetParam?: string;
  fallback?: string | number;
}

export interface ScheduleRow {
  time: number;
  attrs?: Record<string, unknown>;
}

export interface EventSchedule {
  eventId?: string;
  dist?: string;
  distParams?: Record<string, unknown>;
  distribution?: DistributionSpec;
  useEntityCtx?: boolean;
  isRenege?: boolean;
  /** First-match predicate for attribute-conditional service time selection (V29). */
  when?: unknown;
  /** Explicit list of pre-planned arrival times (mutually exclusive with dist/distParams). */
  times?: number[];
  /** Pre-planned arrivals with per-entity attributes (mutually exclusive with dist/distParams). */
  rows?: ScheduleRow[];
  /** Live data source binding for a distribution parameter. */
  paramSource?: ParamSource;
}

export interface RoutingBranch {
  condition: unknown;
  queueName: string | null;
}

export interface ProbabilisticRoutingBranch {
  probability: number;
  queueName: string | null;
}

export interface LoopConfig {
  maxLoopCount: number;
  exitQueueName?: string;
}

export interface BEventDefinition {
  id: string;
  name: string;
  scheduledTime?: string | number;
  effect?: string;
  schedules?: EventSchedule[];
  /** Conditional routing table — mutually exclusive with probabilisticRouting and RELEASE queue arg (V17). */
  routing?: RoutingBranch[];
  defaultQueueName?: string;
  /** Probabilistic routing — probabilities must sum to 1.0 ±0.001 (V18). */
  probabilisticRouting?: ProbabilisticRoutingBranch[];
  /** Probability [0–1] that an arriving entity balks (V21). */
  balkProbability?: number | string;
  /** Condition-based balking expression. */
  balkCondition?: string;
  /** Recirculation guard — limits how many times an entity may loop (V24). */
  loopConfig?: LoopConfig;
  description?: string;
}

export interface CEventDefinition {
  id: string;
  name: string;
  condition?: unknown;
  effect?: string;
  priority?: number;
  cSchedules?: EventSchedule[];
  description?: string;
}

export interface QueueDefinition {
  id: string;
  name: string;
  customerType?: string;
  capacity?: number | string;
  discipline?: QueueDiscipline;
  /** Queue to receive overflow entities when this queue is full (V20). */
  overflowDestination?: string;
  description?: string;
}

export interface ContainerDefinition {
  /** Unique identifier; used as the macro argument in FILL/DRAIN. Case-insensitive. */
  id: string;
  /** Maximum level. Must be > 0 when set. Omit for unbounded. */
  capacity?: number;
  /** Starting level. Must be ≥ 0 and ≤ capacity (default 0). */
  initialLevel?: number;
}

export interface GoalDefinition {
  /** Dot-notation metric key, e.g. "summary.avgWait". */
  metric: string;
  operator: GoalOperator;
  target: number;
  label?: string;
}

export interface DataSourceDefinition {
  id: string;
  label: string;
  type: "rest" | "scheduleFeed" | "actualsStream" | "websocket" | "stateSnapshot" | "mock";
  url: string;
  authHeader?: string;
  /** Must use {{env.VAR_NAME}} syntax — never a literal credential. */
  authSecret?: string;
  refreshSecs?: number;
  // scheduleFeed-specific
  entityType?: string;
  targetBEventId?: string;
  timeField?: string;
  attrMap?: Record<string, string>;
}

export interface DesModelJson {
  name?: string;
  description?: string;
  /** Internal/explanatory notes — not shown in the Model Library, available via the Overview tab. */
  notes?: string;
  visibility?: "private" | "public";
  /** Defines what one simulation clock unit represents. Default "minutes". */
  timeUnit?: TimeUnit;
  /** ISO 8601 datetime anchoring simulation time zero to a real-world calendar datetime. */
  epoch?: string;
  entityTypes: EntityTypeDefinition[];
  stateVariables: StateVariableDefinition[];
  bEvents: BEventDefinition[];
  cEvents: CEventDefinition[];
  queues: QueueDefinition[];
  containerTypes?: ContainerDefinition[];
  goals?: GoalDefinition[];
  dataSources?: DataSourceDefinition[];
  experimentDefaults?: ExperimentDefaults;
  graph?: ModelGraphMetadata;
}

export interface ExperimentDefaults {
  warmupPeriod?: number;
  maxSimTime?: number | null;
  replications?: number;
  terminationMode?: "time" | "condition";
  terminationCondition?: unknown;
  liveDataMode?: null | "calibrated_batch" | "rolling" | "lookahead";
}

export interface ModelGraphMetadata {
  nodes?: Array<{
    id: string;
    type?: string;
    x?: number;
    y?: number;
  }>;
  edges?: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}
