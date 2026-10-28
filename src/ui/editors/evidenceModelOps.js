// ui/editors/evidenceModelOps.js — pure edits to a model's evidence,
// assumptions and backing links. Every function returns a new model and never
// mutates its input, so the Evidence tab can hand the result to setWholeModel
// (one undo step) and later the MCP server can reuse the same logic.
//
// Deleting a record removes its links. Deleting a model element does not
// touch links here: a link whose target has gone is reported by
// findBrokenLinks and removed with removeBrokenLinks.

import { findBrokenLinks } from "../../engine/backing-links.js";

/** Strength and confidence are stored as 0 to 1 and shown as three levels. */
export const LEVEL_VALUES = Object.freeze({ low: 0.3, medium: 0.6, high: 0.9 });
export const LEVEL_LABELS = Object.freeze({ low: "Low", medium: "Medium", high: "High" });

/**
 * @param {unknown} value
 * @returns {"low"|"medium"|"high"}
 */
export function levelOf(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "medium";
  if (value < 0.45) return "low";
  if (value < 0.75) return "medium";
  return "high";
}

/** @param {string} text */
function slug(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

/**
 * A new id with the given prefix that no existing id in `ids` uses.
 * @param {Set<string>} ids
 * @param {string} prefix
 * @param {string} base
 */
export function uniqueId(ids, prefix, base) {
  const stem = `${prefix}${slug(base) || "item"}`;
  let id = stem;
  for (let n = 2; ids.has(id); n++) id = `${stem}_${n}`;
  return id;
}

/** @param {Record<string, any>} model */
function allIds(model) {
  const ids = new Set();
  for (const r of model.evidence || []) ids.add(String(r.id));
  for (const r of model.assumptions || []) ids.add(String(r.id));
  for (const l of model.backingLinks || []) ids.add(String(l.id));
  return ids;
}

/**
 * @param {Record<string, any>} model
 * @param {Record<string, any>} values  name, type, description, source, strength, dateCaptured, lastVerified
 * @returns {{ model: Record<string, any>, record: Record<string, any> }}
 */
export function addEvidence(model, values) {
  const ids = allIds(model);
  const record = {
    id: uniqueId(ids, "ev_", values.name || values.description || "evidence"),
    name: String(values.name ?? "").trim(),
    type: values.type || "literature",
    description: String(values.description ?? "").trim(),
    source: String(values.source ?? "").trim(),
    strength: typeof values.strength === "number" ? values.strength : LEVEL_VALUES.medium,
    dateCaptured: String(values.dateCaptured ?? "").trim(),
    ...(values.lastVerified ? { lastVerified: String(values.lastVerified).trim() } : {}),
  };
  return { model: { ...model, evidence: [...(model.evidence || []), record] }, record };
}

/**
 * @param {Record<string, any>} model
 * @param {Record<string, any>} values  name, text, contested, confidence
 * @returns {{ model: Record<string, any>, record: Record<string, any> }}
 */
export function addAssumption(model, values) {
  const ids = allIds(model);
  const record = {
    id: uniqueId(ids, "as_", values.name || values.text || "assumption"),
    name: String(values.name ?? "").trim(),
    text: String(values.text ?? "").trim(),
    contested: !!values.contested,
    confidence: typeof values.confidence === "number" ? values.confidence : LEVEL_VALUES.medium,
  };
  return { model: { ...model, assumptions: [...(model.assumptions || []), record] }, record };
}

/**
 * Update fields of an evidence or assumption record.
 * @param {Record<string, any>} model
 * @param {"evidence"|"assumption"} recordType
 * @param {string} id
 * @param {Record<string, any>} patch
 */
export function updateRecord(model, recordType, id, patch) {
  const key = recordType === "evidence" ? "evidence" : "assumptions";
  return {
    ...model,
    [key]: (model[key] || []).map(r => (String(r.id) === String(id) ? { ...r, ...patch } : r)),
  };
}

/**
 * Delete a record and every link that points at it.
 * @param {Record<string, any>} model
 * @param {"evidence"|"assumption"} recordType
 * @param {string} id
 */
export function deleteRecord(model, recordType, id) {
  const key = recordType === "evidence" ? "evidence" : "assumptions";
  return {
    ...model,
    [key]: (model[key] || []).filter(r => String(r.id) !== String(id)),
    backingLinks: (model.backingLinks || []).filter(
      l => !(l.recordType === recordType && String(l.recordId) === String(id)),
    ),
  };
}

/**
 * Attach a record to a target. Attaching the same record to the same target
 * (and parameter) twice does nothing.
 * @param {Record<string, any>} model
 * @param {{ recordType: "evidence"|"assumption", recordId: string, targetType: string, targetId: string, targetPath?: string }} link
 */
export function attach(model, link) {
  const same = l => l.recordType === link.recordType
    && String(l.recordId) === String(link.recordId)
    && l.targetType === link.targetType
    && String(l.targetId) === String(link.targetId)
    && (l.targetPath || "") === (link.targetPath || "");
  if ((model.backingLinks || []).some(same)) return model;
  const ids = allIds(model);
  const id = uniqueId(ids, "bl_", `${link.recordId}_${link.targetId}${link.targetPath ? `_${link.targetPath}` : ""}`);
  const row = {
    id,
    recordType: link.recordType,
    recordId: String(link.recordId),
    targetType: link.targetType,
    targetId: String(link.targetId),
    ...(link.targetPath ? { targetPath: link.targetPath } : {}),
  };
  return { ...model, backingLinks: [...(model.backingLinks || []), row] };
}

/**
 * @param {Record<string, any>} model
 * @param {string} linkId
 */
export function detach(model, linkId) {
  return { ...model, backingLinks: (model.backingLinks || []).filter(l => String(l.id) !== String(linkId)) };
}

/**
 * Remove every link that findBrokenLinks reports.
 * @param {Record<string, any>} model
 * @param {{ schedules?: any[] }} [options]
 */
export function removeBrokenLinks(model, options = {}) {
  const broken = new Set(findBrokenLinks(model, options).map(b => String(b.link?.id ?? b.id)));
  if (!broken.size) return model;
  return { ...model, backingLinks: (model.backingLinks || []).filter(l => !broken.has(String(l.id))) };
}
