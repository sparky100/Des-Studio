// Pure helpers for ModelDetail, moved verbatim out of ModelDetail.jsx (expert
// review C-11 tranche). No React in this module. ModelDetail re-exports
// buildModelExportPayload / slugifyModelName / modelJsonFromModel for the
// existing test imports, so both import paths stay valid.
import pkg from '../../package.json';
import { getRunResultsJson } from "./../db/models.js";

const MODEL_JSON_KEYS = ["entityTypes", "stateVariables", "bEvents", "cEvents", "queues", "containerTypes", "distances", "goals", "graph", "experimentDefaults"];

export function slugifyModelName(name = "") {
  return (name || "untitled")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

export function modelJsonFromModel(model = {}) {
  const json = MODEL_JSON_KEYS.reduce((acc, key) => {
    if (key === "graph") {
      return model.graph && typeof model.graph === "object" && !Array.isArray(model.graph)
        ? { ...acc, graph: model.graph }
        : acc;
    }
    if (key === "experimentDefaults") {
      return model.experimentDefaults && typeof model.experimentDefaults === "object" && !Array.isArray(model.experimentDefaults)
        ? { ...acc, experimentDefaults: model.experimentDefaults }
        : acc;
    }
    return {
      ...acc,
      [key]: Array.isArray(model[key]) ? model[key] : [],
    };
  }, { schemaVersion: model.schemaVersion ?? 1 });
  // Preserve live-data and time fields in exported JSON
  if (model.timeUnit)                  json.timeUnit    = model.timeUnit;
  if (model.epoch)                     json.epoch       = model.epoch;
  if (model.dataSources?.length)       json.dataSources = model.dataSources;
  if (model.sections?.length)          json.sections    = model.sections;
  if (model.exposedParams?.length)     json.exposedParams = model.exposedParams;
  return json;
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

