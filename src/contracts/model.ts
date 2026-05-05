export const MODEL_JSON_KEYS = [
  "entityTypes",
  "stateVariables",
  "bEvents",
  "cEvents",
  "queues",
] as const;

export type ModelJsonKey = (typeof MODEL_JSON_KEYS)[number];

export type EntityRole = "customer" | "server";
export type QueueDiscipline = "FIFO" | "LIFO" | "PRIORITY";

export interface AttributeDefinition {
  id?: string;
  name: string;
  valueType?: "number" | "string" | "boolean";
  defaultValue?: unknown;
  distribution?: DistributionSpec;
}

export interface EntityTypeDefinition {
  id: string;
  name: string;
  role: EntityRole;
  count?: number | string;
  attrDefs?: AttributeDefinition[];
  attrs?: string;
  description?: string;
}

export interface StateVariableDefinition {
  id: string;
  name: string;
  valueType?: "number" | "string" | "boolean";
  initialValue?: unknown;
  description?: string;
}

export interface DistributionSpec {
  type?: string;
  dist?: string;
  params?: Record<string, unknown>;
  distParams?: Record<string, unknown>;
}

export interface EventSchedule {
  eventId?: string;
  dist?: string;
  distParams?: Record<string, unknown>;
  distribution?: DistributionSpec;
  useEntityCtx?: boolean;
  isRenege?: boolean;
}

export interface BEventDefinition {
  id: string;
  name: string;
  scheduledTime?: string | number;
  effect?: string;
  schedules?: EventSchedule[];
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
  description?: string;
}

export interface DesModelJson {
  entityTypes: EntityTypeDefinition[];
  stateVariables: StateVariableDefinition[];
  bEvents: BEventDefinition[];
  cEvents: CEventDefinition[];
  queues: QueueDefinition[];
  graph?: ModelGraphMetadata;
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
