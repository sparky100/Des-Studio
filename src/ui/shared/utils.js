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
