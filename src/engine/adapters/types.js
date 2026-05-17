// engine/adapters/types.js — JSDoc type contracts for the real-time adapter layer

/**
 * A named external data source declared in model.dataSources[].
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   type: 'rest' | 'websocket' | 'stateSnapshot' | 'mock',
 *   url?: string,
 *   authHeader?: string,
 *   authSecret?: string,
 *   refreshSecs?: number,
 * }} DataSource
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
