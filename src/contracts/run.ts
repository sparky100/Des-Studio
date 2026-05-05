export interface SimulationSummary {
  total?: number;
  served?: number;
  reneged?: number;
  avgWait?: number | null;
  avgSvc?: number | null;
  avgSojourn?: number | null;
  phaseCTruncated?: boolean;
}

export interface SimulationSnapshot {
  clock?: number;
  served?: number;
  reneged?: number;
  entities?: unknown[];
}

export interface SimulationResult {
  snap?: SimulationSnapshot;
  finalTime?: number;
  summary?: SimulationSummary;
  log?: unknown[];
}

export interface ReplicationResultPayload {
  replicationIndex: number;
  seed: number;
  result?: SimulationResult;
  summary?: SimulationSummary;
  finalTime?: number;
  label?: string;
  run_label?: string;
}

export interface ConfidenceIntervalStat {
  n: number;
  mean: number;
  lower?: number;
  upper?: number;
  halfWidth?: number;
}

export type AggregateStats = Record<string, ConfidenceIntervalStat>;

export interface RunExportConfig {
  modelId?: string | null;
  runLabel?: string | null;
  seed?: number | null;
  replications?: number;
  warmupPeriod?: number;
  maxSimTime?: number | null;
  terminationMode?: "time" | "condition";
  terminationCondition?: unknown;
}
