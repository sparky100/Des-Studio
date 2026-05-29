// ui/shared/utils.js — General utility functions

const MODEL_JSON_KEYS = ["entityTypes", "stateVariables", "bEvents", "cEvents", "queues", "graph", "experimentDefaults", "goals", "containerTypes"];

/**
 * Normalise an imported JSON payload (raw model or DB envelope) into a
 * clean model object ready for validateModel() and saveModel().
 * Accepts both { model_json: {...} } DB envelopes and plain model objects.
 */
export function extractImportedModelPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Import must be a DES Studio model JSON object.");
  }
  const source = payload.model_json && typeof payload.model_json === "object"
    ? payload.model_json
    : payload;
  const sourceName = (payload.name || source.name || "Imported model").trim?.() || "Imported model";
  const model = {
    name: `${sourceName} (Imported)`,
    description: payload.description || source.description || "",
    visibility: "private",
    access: {},
  };
  for (const key of MODEL_JSON_KEYS) {
    if (key === "graph" || key === "experimentDefaults") {
      model[key] = source[key] && typeof source[key] === "object" && !Array.isArray(source[key])
        ? source[key]
        : key === "graph" ? null : {};
    } else {
      model[key] = Array.isArray(source[key]) ? source[key] : [];
    }
  }
  // Strip unresolvable scheduleRef entries: if an exported file was produced while
  // the named-schedule fetch failed, schedule entries may carry a scheduleRef UUID
  // that has no rows and no dist — the green badge would show with no data visible.
  // Remove the orphan ref so DistPicker renders correctly on first open.
  if (Array.isArray(model.bEvents)) {
    model.bEvents = model.bEvents.map(be => ({
      ...be,
      schedules: (be.schedules || []).map(s => {
        if (!s.scheduleRef) return s;
        const hasRows = Array.isArray(s.rows) && s.rows.length > 0;
        if (hasRows) return s; // Properly inlined — keep as-is
        const { scheduleRef: _dropped, ...rest } = s;
        return rest; // Orphan ref — strip it so DistPicker shows the dist picker
      }),
    }));
  }
  // Preserve scalar settings that are not array-valued model keys
  if (source.timeUnit) model.timeUnit = source.timeUnit;
  if (source.epoch)    model.epoch    = source.epoch;
  if (Array.isArray(source.dataSources)) model.dataSources = source.dataSources;
  return model;
}

export function slugifyResultName(name = "model") {
  const slug = String(name || "model")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "model";
}

export function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}
