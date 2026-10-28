// @ts-check
// engine/backing-links.js — the provenance substrate (ADR-021).
//
// A Flow model records what its parameters are but never why. This module is
// the machinery that lets a modeller attach an evidence record or an
// assumption record to any model element, and lets the app audit what is
// unbacked, what is assumption-only, what is stale and what is contested.
//
// The shape is a single generic join array:
//
//   evidence:     [{ id, type, description, source, strength, dateCaptured, ... }]
//   assumptions:  [{ id, text, contested, confidence }]
//   backingLinks: [{ id, recordType, recordId, targetType, targetId, targetPath? }]
//
// A link is purely a connector. Content lives once, so one source can back a
// dozen parameters without being duplicated.
//
// ── Why targetPath exists ─────────────────────────────────────────────────────
//
// In system dynamics the parameters ARE the elements, so an element-level
// link is already parameter-level. In DES the parameters are nested INSIDE
// elements: a B-event's schedule row holds `distParams.mean`, an entity
// type's attribute definition holds a distribution, a queue holds `capacity`.
// Grounding only the owning element is too coarse — the question a modeller
// actually asks is "is this arrival rate evidenced?", not "is this B-event
// evidenced?".
//
// So a link may narrow itself to one parameter inside the element:
//
//   - a link WITHOUT targetPath backs the whole element, and by extension
//     every parameter in it;
//   - a link WITH targetPath backs that one parameter specifically.
//
// Paths are positional, so reordering sibling arrays would re-point a link at
// a different parameter. That failure is made VISIBLE (W-BACK-01) rather
// than silent: an unresolvable path is reported, never silently re-pointed.
//
// ── The registers are inert with respect to simulation ───────────────────────
//
// Nothing here is read by the engine. Provenance must never change a model's
// behaviour, so a model runs identically whether or not it has a register.

import { normalizeDistributionName } from "./distributions.js";

/**
 * @typedef {"unbacked"|"evidenced"|"assumed"} BackingStatus
 */

/**
 * @typedef {Object} BackingTargetTypeDef
 * @property {string} type        The targetType value stored on a link.
 * @property {string} label        Plain-English name for one element.
 * @property {string} plural       Plain-English name for the collection.
 */

/** @type {ReadonlyArray<BackingTargetTypeDef>} */
export const BACKING_TARGET_TYPES = Object.freeze([
  { type: "entity_type",     label: "Entity type",   plural: "Entity types" },
  { type: "queue",           label: "Queue",         plural: "Queues" },
  { type: "b_event",         label: "Bound event",   plural: "Bound events" },
  { type: "c_event",         label: "Conditional event", plural: "Conditional events" },
  { type: "state_variable",  label: "State variable", plural: "State variables" },
  { type: "container_type",  label: "Container",     plural: "Containers" },
  { type: "schedule",        label: "Schedule",      plural: "Schedules" },
  { type: "goal",            label: "Goal",          plural: "Goals" },
  { type: "distance",        label: "Distance",      plural: "Distances" },
  { type: "data_source",     label: "Data source",   plural: "Data sources" },
]);

const TARGET_TYPE_BY_VALUE = new Map(BACKING_TARGET_TYPES.map(t => [t.type, t]));

/** @param {string} targetType */
export function backingTargetLabel(targetType) {
  return TARGET_TYPE_BY_VALUE.get(targetType)?.label ?? String(targetType ?? "");
}

/** @param {string} targetType */
export function backingTargetPlural(targetType) {
  return TARGET_TYPE_BY_VALUE.get(targetType)?.plural ?? String(targetType ?? "");
}

/** Every targetType this build understands. @param {string} targetType */
export function isBackingTargetType(targetType) {
  return TARGET_TYPE_BY_VALUE.has(targetType);
}

// ── Path resolution ───────────────────────────────────────────────────────────

/**
 * Split a dotted path with optional [n] indices into walkable segments.
 * "schedules[0].distParams.mean" → [{key:"schedules",index:0},{key:"distParams"},{key:"mean"}]
 * @param {string} path
 */
function parsePath(path) {
  /** @type {Array<{ key: string, index: number|null }>} */
  const out = [];
  const re = /([^.[\]]+)(?:\[(\d+)\])?/g;
  let m;
  while ((m = re.exec(path)) !== null) {
    out.push({ key: m[1], index: m[2] === undefined ? null : Number(m[2]) });
  }
  return out;
}

/**
 * Resolve a targetPath against the element it belongs to.
 *
 * @param {any} element   The element object (a B-event, a queue, …).
 * @param {string} [path] The path, e.g. "schedules[0].distParams.mean".
 * @returns {{ ok: boolean, value?: any, reason?: string }}
 */
export function resolveTargetPath(element, path) {
  if (path === undefined || path === null || path === "") {
    return { ok: true, value: element };
  }
  const segments = parsePath(String(path));
  if (!segments.length) return { ok: false, reason: "the path is empty" };

  let current = element;
  for (const { key, index } of segments) {
    if (current === undefined || current === null) {
      return { ok: false, reason: `the path no longer resolves (no '${key}')` };
    }
    if (Array.isArray(current)) {
      if (index === null) return { ok: false, reason: `the path no longer resolves ('${key}' needs an index)` };
      current = current[index];
      continue;
    }
    if (typeof current !== "object") {
      return { ok: false, reason: `the path no longer resolves ('${key}' is not on a value)` };
    }
    current = current[key];
    if (index !== null) {
      if (!Array.isArray(current)) {
        return { ok: false, reason: `the path no longer resolves ('${key}' is not a list)` };
      }
      current = current[index];
    }
  }
  if (current === undefined) return { ok: false, reason: "the path no longer resolves" };
  return { ok: true, value: current };
}

// ── Element lookup ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BackingElement
 * @property {string} targetType
 * @property {string} targetId
 * @property {string} label
 * @property {any}    element      The underlying model object.
 */

/**
 * Every backable element in a model, keyed by targetType.
 *
 * Goals are addressed by index because GoalDefinition carries no id of its
 * own (ADR-021). Schedules live in the `model_schedules` table (ADR-016),
 * not in model_json, so they are supplied by the caller.
 *
 * @param {Record<string, any>} model
 * @param {{ schedules?: any[] }} [options]
 * @returns {Map<string, Map<string, BackingElement>>}
 */
export function buildTargetIndex(model, options = {}) {
  /** @type {Map<string, Map<string, BackingElement>>} */
  const index = new Map();
  const add = (/** @type {string} */ targetType, /** @type {string} */ id, /** @type {string} */ label, /** @type {any} */ element) => {
    if (id === undefined || id === null || id === "") return;
    if (!index.has(targetType)) index.set(targetType, new Map());
    const bucket = index.get(targetType);
    if (bucket) bucket.set(String(id), { targetType, targetId: String(id), label, element });
  };

  for (const et of model?.entityTypes || []) add("entity_type", et.id, et.name || et.id, et);
  for (const q  of model?.queues || [])      add("queue", q.id, q.name || q.id, q);
  for (const b  of model?.bEvents || [])     add("b_event", b.id, b.name || b.id, b);
  for (const c  of model?.cEvents || [])     add("c_event", c.id, c.name || c.id, c);
  for (const sv of model?.stateVariables || []) add("state_variable", sv.id, sv.name || sv.id, sv);
  for (const ct of model?.containerTypes || []) add("container_type", ct.id, ct.id, ct);
  for (const d  of model?.distances || [])   add("distance", d.id, `${d.fromQueue} → ${d.toQueue}`, d);
  for (const ds of model?.dataSources || []) add("data_source", ds.id, ds.label || ds.id, ds);
  // Goals have no id — they are an ordered array, so the index is the address.
  (model?.goals || []).forEach((/** @type {any} */ g, /** @type {number} */ i) => {
    add("goal", String(i), g.label || g.metric || `Goal ${i + 1}`, g);
  });
  for (const s of options.schedules || []) add("schedule", s.id, s.name || s.id, s);

  return index;
}

// ── Backable units ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BackingUnit
 * @property {string} targetType
 * @property {string} targetId
 * @property {string|undefined} targetPath  Present on parameter units only.
 * @property {string} label                The element's label.
 * @property {string} paramLabel           The parameter's label (parameter units).
 * @property {"element"|"parameter"} kind
 * @property {"arrival"|"service"|"routing"|"goal"|"reliability"|"capacity"|"standard"} impact
 * @property {any}    element
 */

/**
 * The distribution-parameter keys a distribution object carries.
 * Handles the two shapes the model uses: `distParams` (flat) and
 * `distribution.params` (nested), plus a `dist`/`type` name.
 * @param {any} holder
 * @returns {Array<{ key: string, value: any, distName: string }>}
 */
function distParamsOf(holder) {
  if (!holder || typeof holder !== "object") return [];
  const params = holder.distParams && typeof holder.distParams === "object"
    ? holder.distParams
    : holder.distribution && typeof holder.distribution === "object" && holder.distribution.params && typeof holder.distribution.params === "object"
      ? holder.distribution.params
      : null;
  if (!params) return [];
  const rawName = holder.dist || holder.distribution?.type || holder.distribution?.dist || "";
  const distName = normalizeDistributionName(rawName) || String(rawName);
  return Object.entries(params).map(([key, value]) => ({ key, value, distName }));
}

/**
 * Does this bound event produce arrivals? Its schedule distribution is an
 * arrival rate, which is the highest-impact parameter in the model.
 * @param {any} bEvent
 */
function isArrivalEvent(bEvent) {
  const effect = bEvent?.effect;
  const text = Array.isArray(effect) ? effect.join(";") : String(effect || "");
  return /\bARRIVE\s*\(/i.test(text);
}

/**
 * Build every backable unit in a model: one per element, plus one per
 * evidence-critical parameter inside each element.
 *
 * The parameter units are the DES-specific part. A B-event's arrival rate, a
 * queue's capacity, an entity type's server count, a routing probability and
 * a goal's target are the numbers a modeller is asked to defend — so each is
 * individually attachable.
 *
 * Cached per model object: the Model tab asks for this list on every render,
 * and on a large model (hundreds of elements, thousands of links) building it
 * each time is expensive. Models are replaced, never mutated, on every edit,
 * so a new object means new items.
 *
 * @param {Record<string, any>} model
 * @param {{ schedules?: any[] }} [options]
 * @returns {BackingUnit[]}
 */
export function buildBackableUnits(model, options = {}) {
  if (!model || typeof model !== "object") return [];
  const cacheKey = options.schedules ? `${options.schedules.length}:${options.schedules.map(s => s.id).join(",")}` : "";
  const cached = unitCache.get(model);
  if (cached && cached.key === cacheKey) return cached.units;

  /** @type {BackingUnit[]} */
  const units = [];

  const push = (
    /** @type {string} */ targetType,
    /** @type {string} */ targetId,
    /** @type {string} */ label,
    /** @type {any} */ element,
    /** @type {BackingUnit["impact"]} */ impact,
    /** @type {Array<{ path: string, label: string, impact: BackingUnit["impact"] }>} */ params,
  ) => {
    units.push({ targetType, targetId, targetPath: undefined, label, paramLabel: "", kind: "element", impact, element });
    for (const p of params) {
      units.push({ targetType, targetId, targetPath: p.path, label, paramLabel: p.label, kind: "parameter", impact: p.impact, element });
    }
  };

  for (const et of model.entityTypes || []) {
    /** @type {Array<{ path: string, label: string, impact: BackingUnit["impact"] }>} */
    const params = [];
    // The server count is the parameter people defend. A customer type's
    // `count` is not an input (it is 0, or absent) — only servers have a
    // capacity worth backing.
    if (et.role === "server" && et.count !== undefined && et.count !== null && et.count !== "") {
      params.push({ path: "count", label: "Server count", impact: "capacity" });
    }
    const attrDefs = Array.isArray(et.attrDefs) ? et.attrDefs : [];
    attrDefs.forEach((/** @type {any} */ def, /** @type {number} */ i) => {
      for (const p of distParamsOf(def)) {
        params.push({ path: `attrDefs[${i}].distParams.${p.key}`, label: `${def.name || `Attribute ${i + 1}`} — ${p.key}`, impact: "service" });
      }
    });
    for (const [field, label] of [["mtbfDistParams", "MTBF"], ["mttrDistParams", "MTTR"], ["turnaroundDistParams", "Turnaround"]]) {
      const holder = et[field];
      if (!holder || typeof holder !== "object") continue;
      for (const p of distParamsOf({ distParams: holder })) {
        params.push({ path: `${field}.${p.key}`, label: `${label} — ${p.key}`, impact: "reliability" });
      }
    }
    const shift = Array.isArray(et.shiftSchedule) ? et.shiftSchedule : [];
    shift.forEach((/** @type {any} */ period, /** @type {number} */ i) => {
      if (period?.capacity !== undefined) {
        params.push({ path: `shiftSchedule[${i}].capacity`, label: `Shift period ${i + 1} — capacity`, impact: "capacity" });
      }
    });
    push("entity_type", String(et.id), et.name || et.id, et, "standard", params);
  }

  for (const q of model.queues || []) {
    /** @type {Array<{ path: string, label: string, impact: BackingUnit["impact"] }>} */
    const params = [];
    if (q.capacity !== undefined && q.capacity !== null && q.capacity !== "") {
      params.push({ path: "capacity", label: "Queue capacity", impact: "capacity" });
    }
    if (q.balkProbability !== undefined && q.balkProbability !== null && q.balkProbability !== "") {
      params.push({ path: "balkProbability", label: "Balk probability", impact: "routing" });
    }
    for (const p of distParamsOf({ distParams: q.renegeDistParams })) {
      params.push({ path: `renegeDistParams.${p.key}`, label: `Patience (renege) — ${p.key}`, impact: "standard" });
    }
    push("queue", String(q.id), q.name || q.id, q, "standard", params);
  }

  for (const b of model.bEvents || []) {
    /** @type {Array<{ path: string, label: string, impact: BackingUnit["impact"] }>} */
    const params = [];
    const arrival = isArrivalEvent(b);
    const schedules = Array.isArray(b.schedules) ? b.schedules : [];
    schedules.forEach((/** @type {any} */ row, /** @type {number} */ i) => {
      for (const p of distParamsOf(row)) {
        params.push({
          path: `schedules[${i}].distParams.${p.key}`,
          label: `Schedule row ${i + 1} — ${p.key}${p.distName ? ` (${p.distName})` : ""}`,
          impact: arrival ? "arrival" : "service",
        });
      }
    });
    if (b.balkProbability !== undefined && b.balkProbability !== null && b.balkProbability !== "") {
      params.push({ path: "balkProbability", label: "Balk probability", impact: "routing" });
    }
    const prob = Array.isArray(b.probabilisticRouting) ? b.probabilisticRouting : [];
    prob.forEach((/** @type {any} */ branch, /** @type {number} */ i) => {
      if (branch?.probability !== undefined) {
        params.push({ path: `probabilisticRouting[${i}].probability`, label: `Branch ${i + 1} — probability`, impact: "routing" });
      }
    });
    push("b_event", String(b.id), b.name || b.id, b, arrival ? "arrival" : "standard", params);
  }

  for (const c of model.cEvents || []) {
    /** @type {Array<{ path: string, label: string, impact: BackingUnit["impact"] }>} */
    const params = [];
    const cSchedules = Array.isArray(c.cSchedules) ? c.cSchedules : [];
    cSchedules.forEach((/** @type {any} */ row, /** @type {number} */ i) => {
      for (const p of distParamsOf(row)) {
        params.push({ path: `cSchedules[${i}].distParams.${p.key}`, label: `Schedule row ${i + 1} — ${p.key}`, impact: "service" });
      }
    });
    push("c_event", String(c.id), c.name || c.id, c, "standard", params);
  }

  for (const sv of model.stateVariables || []) {
    /** @type {Array<{ path: string, label: string, impact: BackingUnit["impact"] }>} */
    const params = [];
    if (sv.initialValue !== undefined && sv.initialValue !== null && sv.initialValue !== "") {
      params.push({ path: "initialValue", label: "Initial value", impact: "standard" });
    }
    push("state_variable", String(sv.id), sv.name || sv.id, sv, "standard", params);
  }

  for (const ct of model.containerTypes || []) {
    /** @type {Array<{ path: string, label: string, impact: BackingUnit["impact"] }>} */
    const params = [];
    if (ct.capacity !== undefined && ct.capacity !== null && ct.capacity !== "") {
      params.push({ path: "capacity", label: "Capacity", impact: "capacity" });
    }
    if (ct.initialLevel !== undefined && ct.initialLevel !== null && ct.initialLevel !== "") {
      params.push({ path: "initialLevel", label: "Starting level", impact: "standard" });
    }
    push("container_type", String(ct.id), ct.id, ct, "standard", params);
  }

  for (const d of model.distances || []) {
    /** @type {Array<{ path: string, label: string, impact: BackingUnit["impact"] }>} */
    const params = [];
    if (d.distance !== undefined && d.distance !== null && d.distance !== "") {
      params.push({ path: "distance", label: "Distance", impact: "standard" });
    }
    push("distance", String(d.id), `${d.fromQueue} → ${d.toQueue}`, d, "standard", params);
  }

  for (const ds of model.dataSources || []) {
    push("data_source", String(ds.id), ds.label || ds.id, ds, "standard", []);
  }

  (model.goals || []).forEach((/** @type {any} */ g, /** @type {number} */ i) => {
    /** @type {Array<{ path: string, label: string, impact: BackingUnit["impact"] }>} */
    const params = [];
    if (g.target !== undefined && g.target !== null && g.target !== "") {
      params.push({ path: "target", label: "Target", impact: "goal" });
    }
    push("goal", String(i), g.label || g.metric || `Goal ${i + 1}`, g, "goal", params);
  });

  for (const s of options.schedules || []) {
    push("schedule", String(s.id), s.name || s.id, s, "standard", []);
  }

  const linked = units;
  unitCache.set(model, { key: cacheKey, units: linked });
  return linked;
}
/** @type {WeakMap<object, { key: string, units: BackingUnit[] }>} */
const unitCache = new WeakMap();

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * A record's content lives once; a link is purely a connector. This is the
 * backing status of an element or one of its parameters.
 *
 * - Element-level (no targetPath): only links that back the whole element
 *   count. A link that names a specific parameter backs that parameter, not
 *   the element as a whole — so the element row can honestly read "Unbacked"
 *   while one of its parameters reads "Evidenced".
 * - Parameter-level: an element-wide link covers every parameter in the
 *   element, and a link naming exactly this path covers this parameter.
 *
 * @param {any[]} backingLinks
 * @param {string} targetType
 * @param {string|number} targetId
 * @param {string} [targetPath]
 * @returns {BackingStatus}
 */
export function backingStatus(backingLinks, targetType, targetId, targetPath) {
  const links = (Array.isArray(backingLinks) ? backingLinks : [])
    .filter(l => l && l.targetType === targetType && String(l.targetId) === String(targetId));
  if (!links.length) return "unbacked";
  const elementWide = links.filter(l => !l.targetPath);
  const scoped = targetPath === undefined || targetPath === null
    ? elementWide
    : [...elementWide, ...links.filter(l => l.targetPath === targetPath)];
  if (!scoped.length) return "unbacked";
  return scoped.some(l => l.recordType === "evidence") ? "evidenced" : "assumed";
}

/**
 * A summary of an element's backing, for the audit.
 *
 * The element's own status reflects element-wide links only — a link that
 * names one parameter backs that parameter, not the element as a whole. The
 * parameter counts let the audit say "2 of 5 parameters backed", which is the
 * honest picture when an element row and its parameter rows disagree.
 *
 * @param {any[]} backingLinks
 * @param {BackingUnit[]} units  The full unit list, to find the element's parameters.
 * @param {BackingUnit} unit     The element unit to summarise.
 * @returns {{ status: BackingStatus, backedParameters: number, totalParameters: number }}
 */
export function elementBackingSummary(backingLinks, units, unit) {
  const status = backingStatus(backingLinks, unit.targetType, unit.targetId);
  const parameters = units.filter(u =>
    u.kind === "parameter" && u.targetType === unit.targetType && String(u.targetId) === String(unit.targetId)
  );
  let backedParameters = 0;
  for (const p of parameters) {
    if (backingStatus(backingLinks, unit.targetType, unit.targetId, p.targetPath) !== "unbacked") backedParameters++;
  }
  return { status, backedParameters, totalParameters: parameters.length };
}

// ── Broken links ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BrokenLink
 * @property {any}    link
 * @property {string} reason  Plain-English explanation.
 * @property {"record"|"target"|"path"} kind
 */

/**
 * Every backing link that no longer resolves: a record that was deleted, a
 * target element that was renamed away or deleted, or a targetPath that no
 * longer points at anything.
 *
 * These are reported (W-BACK-01) rather than silently dropped, and a broken
 * path is never re-pointed at a different parameter.
 *
 * @param {Record<string, any>} model
 * @param {{ schedules?: any[] }} [options]
 * @returns {BrokenLink[]}
 */
export function findBrokenLinks(model, options = {}) {
  const links = Array.isArray(model?.backingLinks) ? model.backingLinks : [];
  if (!links.length) return [];

  const evidenceIds = new Set((model?.evidence || []).map((/** @type {any} */ e) => String(e?.id)));
  const assumptionIds = new Set((model?.assumptions || []).map((/** @type {any} */ a) => String(a?.id)));
  const targetIndex = buildTargetIndex(model || {}, options);

  /** @type {BrokenLink[]} */
  const broken = [];
  for (const link of links) {
    if (!link || typeof link !== "object") continue;
    const recordSet = link.recordType === "evidence" ? evidenceIds : assumptionIds;
    if (!recordSet.has(String(link.recordId))) {
      broken.push({ link, kind: "record", reason: `the ${link.recordType === "evidence" ? "evidence" : "assumption"} record it points at no longer exists` });
      continue;
    }
    const byId = targetIndex.get(link.targetType);
    const target = byId ? byId.get(String(link.targetId)) : undefined;
    if (!target) {
      broken.push({ link, kind: "target", reason: `the ${backingTargetLabel(link.targetType).toLowerCase()} it points at no longer exists` });
      continue;
    }
    if (link.targetPath) {
      const resolved = resolveTargetPath(target.element, link.targetPath);
      if (!resolved.ok) {
        broken.push({ link, kind: "path", reason: `the parameter it points at no longer exists (${resolved.reason})` });
      }
    }
  }
  return broken;
}

/**
 * Evidence records that back nothing — an orphaned record. Detaching the
 * last link leaves the record in place; W-BACK-02 reports it so it stays
 * visible rather than silently accumulating.
 *
 * @param {Record<string, any>} model
 * @returns {Array<{ record: any, recordType: "evidence"|"assumption" }>}
 */
export function findOrphanedRecords(model) {
  const linkedIds = new Set((model?.backingLinks || []).map((/** @type {any} */ l) => String(l?.recordId)));
  /** @type {Array<{ record: any, recordType: "evidence"|"assumption" }>} */
  const orphans = [];
  for (const e of model?.evidence || []) {
    if (!linkedIds.has(String(e?.id))) orphans.push({ record: e, recordType: "evidence" });
  }
  for (const a of model?.assumptions || []) {
    if (!linkedIds.has(String(a?.id))) orphans.push({ record: a, recordType: "assumption" });
  }
  return orphans;
}

/**
 * Evidence that has not been re-verified within the configured window.
 * Assumptions are exempt — "not re-verified lately" is meaningful for a data
 * source and meaningless for a stated belief.
 *
 * @param {Record<string, any>} model
 * @param {Date} [now]
 * @returns {Array<{ record: any, monthsOld: number }>}
 */
export function findStaleEvidence(model, now = new Date()) {
  const months = Number(model?.backingLinkSettings?.staleEvidenceMonths ?? 12);
  const limit = Number.isFinite(months) && months > 0 ? months : 12;
  const cutoff = new Date(now.getTime());
  cutoff.setMonth(cutoff.getMonth() - limit);

  /** @type {Array<{ record: any, monthsOld: number }>} */
  const stale = [];
  for (const e of model?.evidence || []) {
    const stamp = e?.lastVerified || e?.dateCaptured;
    if (!stamp) continue;
    const when = new Date(stamp);
    if (Number.isNaN(when.getTime())) continue;
    if (when >= cutoff) continue;
    const monthsOld = Math.floor((now.getTime() - when.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    stale.push({ record: e, monthsOld });
  }
  return stale;
}

/**
 * How much of a model is evidenced. This is the headline number a published
 * model leads with, and the one the Grounding audit reports.
 *
 * @param {Record<string, any>} model
 * @param {{ schedules?: any[] }} [options]
 * @returns {{ total: number, evidenced: number, assumed: number, unbacked: number, percentEvidenced: number }}
 */
export function coverageSummary(model, options = {}) {
  const units = buildBackableUnits(model, options);
  const links = Array.isArray(model?.backingLinks) ? model.backingLinks : [];
  let evidenced = 0, assumed = 0, unbacked = 0;
  for (const u of units) {
    const status = backingStatus(links, u.targetType, u.targetId, u.targetPath);
    if (status === "evidenced") evidenced++;
    else if (status === "assumed") assumed++;
    else unbacked++;
  }
  const total = units.length;
  return {
    total,
    evidenced,
    assumed,
    unbacked,
    percentEvidenced: total ? Math.round((evidenced / total) * 100) : 0,
  };
}
