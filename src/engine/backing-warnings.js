// engine/backing-warnings.js — Model Health warnings for the evidence and
// assumptions registers (V-BACK-01 to V-BACK-05). Warnings only: a model with
// unbacked parameters or broken links still runs. The checks use the helpers
// in backing-links.js, so they agree with the Evidence tab's coverage view.

import {
  backingStatus, buildBackableUnits, findBrokenLinks, findOrphanedRecords, findStaleEvidence, recordDisplayName,
} from "./backing-links.js";

/** Impacts a modeller most needs evidence for: arrivals and capacity. */
const KEY_IMPACTS = new Set(["arrival", "capacity"]);
const LIST_LIMIT = 3;

/** @param {string[]} names */
function listNames(names) {
  const shown = names.slice(0, LIST_LIMIT).join(", ");
  return names.length > LIST_LIMIT ? `${shown} and ${names.length - LIST_LIMIT} more` : shown;
}

/**
 * @param {Record<string, any>} model
 * @param {Date} [now]
 * @returns {Array<{ code: string, message: string, tab: string, affectedIds: Record<string, any> }>}
 */
export function backingRegisterWarnings(model, now = new Date()) {
  const out = [];
  const records = (model.evidence || []).length + (model.assumptions || []).length;
  if (records === 0 && (model.backingLinks || []).length === 0) return out;

  const opts = { schedules: model.schedules || [] };
  const links = model.backingLinks || [];

  for (const b of findBrokenLinks(model, opts)) {
    out.push({
      code: "V-BACK-01",
      message: `Backing link is broken: ${b.reason}.`,
      tab: "evidence",
      affectedIds: { backingLinkIds: [b.link.id] },
    });
  }

  for (const o of findOrphanedRecords(model)) {
    const kind = o.recordType === "evidence" ? "Evidence" : "Assumption";
    out.push({
      code: "V-BACK-02",
      message: `${kind} '${recordDisplayName(o.record)}' is not attached to anything.`,
      tab: "evidence",
      affectedIds: { recordIds: [o.record.id] },
    });
  }

  for (const s of findStaleEvidence(model, now)) {
    out.push({
      code: "V-BACK-03",
      message: `Evidence '${recordDisplayName(s.record)}' was last verified ${s.monthsOld} months ago. Check that it still holds.`,
      tab: "evidence",
      affectedIds: { recordIds: [s.record.id] },
    });
  }

  const units = buildBackableUnits(model, opts);
  const keyParams = units.filter(u => u.kind === "parameter" && KEY_IMPACTS.has(u.impact));

  for (const a of model.assumptions || []) {
    if (!a.contested) continue;
    const affected = new Set();
    for (const l of links) {
      if (l.recordType !== "assumption" || String(l.recordId) !== String(a.id)) continue;
      for (const u of keyParams) {
        if (u.targetType !== l.targetType || String(u.targetId) !== String(l.targetId)) continue;
        if (l.targetPath && u.targetPath !== l.targetPath) continue;
        affected.add(`${u.label} · ${u.paramLabel}`);
      }
    }
    if (affected.size) {
      out.push({
        code: "V-BACK-04",
        message: `Assumption '${recordDisplayName(a)}' is contested and sets ${affected.size} arrival or capacity parameter${affected.size === 1 ? "" : "s"}: ${listNames([...affected])}.`,
        tab: "evidence",
        affectedIds: { recordIds: [a.id] },
      });
    }
  }

  if (records > 0) {
    const unbacked = keyParams.filter(u => backingStatus(links, u.targetType, u.targetId, u.targetPath) === "unbacked");
    if (unbacked.length) {
      const names = unbacked.map(u => `${u.label} · ${u.paramLabel}`);
      out.push({
        code: "V-BACK-05",
        message: `Evidence coverage: ${unbacked.length} arrival or capacity parameter${unbacked.length === 1 ? " has" : "s have"} no evidence or assumption behind ${unbacked.length === 1 ? "it" : "them"}: ${listNames(names)}.`,
        tab: "evidence",
        affectedIds: {},
      });
    }
  }

  return out;
}
