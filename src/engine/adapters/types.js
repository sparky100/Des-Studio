// engine/adapters/types.js — JSDoc type contracts for the real-time adapter layer

/**
 * A named external data source declared in model.dataSources[].
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   type: 'rest' | 'websocket' | 'stateSnapshot' | 'scheduleFeed' | 'mock',
 *   url?: string,
 *   authHeader?: string,
 *   authSecret?: string,
 *   refreshSecs?: number,
 *   entityType?: string,
 *   targetBEventId?: string,
 *   timeField?: string,
 *   attrMap?: Record<string, string>,
 * }} DataSource
 */

/**
 * A data source of type "scheduleFeed" that provides a planned-arrival schedule.
 * Fetched once before the run; rows[] injected into the target B-event.
 *
 * entityId is a reserved attribute name — the value becomes the entity's display name.
 *
 * @typedef {{
 *   id: string,
 *   label?: string,
 *   type: 'scheduleFeed',
 *   url: string,
 *   authHeader?: string,
 *   authSecret?: string,
 *   entityType: string,
 *   targetBEventId: string,
 *   timeField?: string,
 *   attrMap?: Record<string, string>,
 * }} ScheduleSource
 */

/**
 * Binds a single distParams field to a value from a DataSource.
 * Placed as a sibling to distParams on a schedule or cSchedule:
 *
 *   {
 *     dist: "Exponential",
 *     distParams: { mean: "1.5" },
 *     paramSource: { sourceId: "ds_arrivals", field: "mean_interarrival_mins", targetParam: "mean", fallback: "1.5" }
 *   }
 *
 * @typedef {{
 *   sourceId: string,
 *   field: string,
 *   targetParam?: string,
 *   fallback?: string,
 * }} ParamSource
 */

/**
 * Full system state snapshot returned by SnapshotAdapter for warm-up injection.
 *
 * @typedef {{
 *   clock: number,
 *   entities: Array<{
 *     type: string,
 *     id: string,
 *     attrs: Record<string, unknown>,
 *     location: 'queue' | 'server',
 *     queueId?: string,
 *   }>,
 *   queues: Record<string, { waiting: number, serving: number }>,
 * }} SystemSnapshot
 */
