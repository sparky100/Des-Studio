// Pure helpers for ModelDetail, moved verbatim out of ModelDetail.jsx (expert
// review C-11 tranche). No React in this module. ModelDetail re-exports
// buildModelExportPayload / slugifyModelName / modelJsonFromModel for the
// existing test imports, so both import paths stay valid.
import pkg from '../../package.json';
import { getRunResultsJson } from "./../db/models.js";
import { MODEL_JSON_ARRAY_FIELDS, MODEL_JSON_OBJECT_FIELDS, pickModelJsonFields } from "../model/modelJsonFields.js";

// Optional arrays an export leaves out when empty (older files never had them).
const OMIT_WHEN_EMPTY = new Set(["dataSources", "sections", "exposedParams"]);

export function slugifyModelName(name = "") {
  return (name || "untitled")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

// Every model_json field (model/modelJsonFields.js) is exported; graph and
// experimentDefaults only when they are objects, a few optional arrays only
// when non-empty, scalars only when set.
export function modelJsonFromModel(model = {}) {
  const picked = pickModelJsonFields(model);
  /** @type {Record<string, any>} */
  const json = { schemaVersion: model.schemaVersion ?? 1 };
  for (const key of MODEL_JSON_ARRAY_FIELDS) {
    if (!OMIT_WHEN_EMPTY.has(key) || picked[key].length) json[key] = picked[key];
  }
  for (const key of MODEL_JSON_OBJECT_FIELDS) {
    if (model[key] && typeof model[key] === "object" && !Array.isArray(model[key])) json[key] = model[key];
  }
  for (const [key, value] of Object.entries(picked)) {
    if (!(key in json) && !MODEL_JSON_ARRAY_FIELDS.includes(key) && !MODEL_JSON_OBJECT_FIELDS.includes(key)) json[key] = value;
  }
  return json;
}

/**
 * The model after restoring a saved version: every model_json field comes from
 * the version (it used to restore only 8, leaving today's containers, skills,
 * distances, sections, notes … next to the old events). Identity, sharing and
 * a scalar the version doesn't carry stay as they are.
 * @param {Record<string, any>} current
 * @param {Record<string, any>} versionModelJson
 */
export function restoreModelFromVersion(current, versionModelJson = {}) {
  return { ...current, ...pickModelJsonFields(versionModelJson) };
}

/**
 * The model to save when a user starts from a template: every model_json field
 * the template carries, as a private copy.
 * @param {Record<string, any>} template
 */
export function modelPayloadFromTemplate(template) {
  return {
    name: template.name,
    description: template.description,
    visibility: "private",
    access: {},
    ...pickModelJsonFields(template),
  };
}

// buildModelExportPayload — creates a self-contained JSON export of the model.
// Per ADR-016: if the model has bEvents with scheduleRef + empty rows[], we
// re-inline the schedule rows so the exported file is portable and does not
// require access to the model_schedules table.
// schedules: array of model_schedules rows (from fetchModelSchedules)
export function buildModelExportPayload(model, exportedAt = new Date().toISOString(), schedules = []) {
  // Re-inline schedule rows into bEvents for portability
  const inlinedModel = inlineSchedulesForExport(model, schedules);
  const payload = {
    name: inlinedModel.name || "Untitled model",
    model_json: modelJsonFromModel(inlinedModel),
    exportedAt,
    appVersion: pkg.version,
  };
  if (inlinedModel.description) payload.description = inlinedModel.description;
  // Lets the file come back as an update to this model (the Flow MCP's
  // "open in Flow" passes it on as the import link's target).
  if (model.id) payload.sourceModelId = model.id;
  return payload;
}

// inlineSchedulesForExport — merges model_schedules rows back into bEvent.schedules[].rows[]
// so the exported JSON is self-contained (no scheduleRef dependency).
// This is the inverse of extractInlineSchedule() (ADR-016).
export function inlineSchedulesForExport(model, schedules = []) {
  if (!schedules || schedules.length === 0) return model;
  // Build a lookup: scheduleId → scheduleJson entries
  const scheduleEntries = {};
  for (const sched of schedules) {
    for (const entry of sched.scheduleJson || []) {
      scheduleEntries[sched.id] = scheduleEntries[sched.id] || {};
      scheduleEntries[sched.id][entry.eventId] = entry.rows ?? [];
    }
  }
  if (Object.keys(scheduleEntries).length === 0) return model;
  return {
    ...model,
    bEvents: (model.bEvents || []).map(be => ({
      ...be,
      schedules: (be.schedules || []).map(s => {
        if (!s.scheduleRef) return s;
        const entryMap = scheduleEntries[s.scheduleRef];
        if (!entryMap) return s;
        const rows = entryMap[s.eventId ?? be.id] ?? entryMap[be.id] ?? [];
        // Re-inline: populate rows and remove scheduleRef for portability
        const { scheduleRef: _removed, ...rest } = s;
        return { ...rest, rows };
      }),
    })),
  };
}



export function preferMetricValue(primary, fallback) {
  if (fallback == null) return primary ?? null;
  if (primary == null) return fallback;
  if (primary === 0 && fallback !== 0) return fallback;
  return primary;
}

// results_json is no longer part of the run-history list query (it's fetched
// lazily per-row, on demand) — fetch it here unless the row already carries it.
export async function hydrateResultsFromHistoryRow(row) {
  if (!row?.id) return null;
  const json = row.results_json ?? await getRunResultsJson(row.id);
  if (!json || typeof json !== "object") return null;
  const summary = json.summary || {};
  const nextSummary = {
    ...summary,
    total: preferMetricValue(summary.total, row.total_arrived) ?? 0,
    served: preferMetricValue(summary.served, row.total_served) ?? 0,
    reneged: preferMetricValue(summary.reneged, row.total_reneged) ?? 0,
    avgWait: preferMetricValue(summary.avgWait, row.avg_wait_time),
    avgSvc: preferMetricValue(summary.avgSvc, row.avg_service_time),
  };
  return {
    ...json,
    summary: nextSummary,
    runLabel: json.runLabel || row.run_label || null,
  };
}

export function isStarterBlankModel(model = {}) {
  const current = model && typeof model === "object" ? model : {};
  return !(current.entityTypes || []).length &&
    !(current.stateVariables || []).length &&
    !(current.bEvents || []).length &&
    !(current.cEvents || []).length &&
    !(current.queues || []).length &&
    !(current.goals || []).length;
}

export function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

