// @ts-check
// engine/exposed-params.js — Owner-curated "exposed parameters" for the
// stakeholder (viewer-role) run surface.
//
// A model's `exposedParams` array (persisted inside model_json) stores which
// sweepable parameters a business-user viewer may vary, plus per-knob
// curation: an optional business-friendly label and optional min/max bounds.
// Entries store ONLY identity + curation fields:
//
//   { path: "entityTypes.et-1.count", businessLabel: "Number of tellers", min: 1, max: 10 }
//
// Never store `currentValue` (queueCapacity's can be Infinity — not
// JSON-safe) or any type-specific fields — everything else is re-derived at
// render time by matching `path` against a fresh enumerateSweepableParams()
// call. That render-time reconciliation is mandatory, not defensive:
// applySweepValues() silently no-ops when a target no longer exists, so a
// stale stored entry would otherwise produce a run that looks successful
// while ignoring the viewer's input. Reconciling first means stale entries
// surface as orphans instead.
import { enumerateSweepableParams } from "./sweep-params.js";

/**
 * @typedef {{ path: string, businessLabel?: string, min?: number, max?: number }} ExposedParamEntry
 */

/**
 * Match a model's stored exposedParams against a fresh enumeration of its
 * sweepable parameters.
 *
 * @param {Record<string, any>} model
 * @returns {{ resolved: any[], orphans: ExposedParamEntry[] }}
 *   `resolved` entries are the full live paramConfig (type, targetId, label,
 *   currentValue, path, ...) merged with the stored curation fields, plus
 *   `displayLabel` (businessLabel falling back to the technical label), in
 *   stored order. `orphans` are stored entries whose path no longer matches
 *   any sweepable parameter (deleted/renamed/reordered targets).
 */
export function resolveExposedParams(model) {
  const stored = Array.isArray(model?.exposedParams) ? model.exposedParams : [];
  if (!stored.length) return { resolved: [], orphans: [] };

  const byPath = new Map(enumerateSweepableParams(model).map(p => [p.path, p]));
  /** @type {any[]} */
  const resolved = [];
  /** @type {ExposedParamEntry[]} */
  const orphans = [];

  for (const entry of stored) {
    const paramConfig = entry?.path ? byPath.get(entry.path) : undefined;
    if (!paramConfig) {
      orphans.push(entry);
      continue;
    }
    resolved.push({
      ...paramConfig,
      businessLabel: entry.businessLabel,
      min: entry.min,
      max: entry.max,
      displayLabel: entry.businessLabel || paramConfig.label,
    });
  }

  return { resolved, orphans };
}

/**
 * Clamp a viewer-entered value to the entry's curated bounds. Queue-capacity
 * and container-capacity knobs additionally get an implicit floor of 1 when
 * the owner set no explicit min: applySweepValues() maps values <= 0 to
 * "unlimited capacity", which a business user should not stumble into from a
 * number input.
 *
 * @param {{ type?: string, min?: number, max?: number }} entry
 * @param {number} value
 * @returns {number}
 */
export function clampExposedValue(entry, value) {
  let v = Number(value);
  if (!Number.isFinite(v)) return v;
  let min = entry?.min;
  if (min == null && (entry?.type === "queueCapacity" || entry?.type === "containerCapacity")) min = 1;
  if (min != null && v < min) v = min;
  if (entry?.max != null && v > entry.max) v = entry.max;
  return v;
}
