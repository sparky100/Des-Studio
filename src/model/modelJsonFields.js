// model/modelJsonFields.js — the model fields stored in model_json, in one place.
//
// db/models.js (modelJsonFromModel / norm) is the persistence of record. Every
// other path that rebuilds a model from parts — export, import, version
// restore, template start, the import-model edge function — used to keep its
// own hand-written list, and each one drifted: export dropped skills and
// notes, import dropped distances, template start dropped skills/sections/
// exposedParams/notes, version restore put back only 8 fields, the edge
// function dropped skills/distances/exposedParams/notes.
// tests/db/model-json-fields.test.js pushes a model with every field below set
// through each path and fails if one is lost. A new model_json field goes here.

/** Array-valued fields (missing → []). */
export const MODEL_JSON_ARRAY_FIELDS = Object.freeze([
  "entityTypes", "stateVariables", "bEvents", "cEvents", "queues",
  "containerTypes", "distances", "skills", "goals",
  "dataSources", "sections", "exposedParams",
]);

/** Object-valued fields (missing → graph: null, experimentDefaults: {}). */
export const MODEL_JSON_OBJECT_FIELDS = Object.freeze(["graph", "experimentDefaults"]);

/** Scalar settings, copied only when set. */
export const MODEL_JSON_SCALAR_FIELDS = Object.freeze(["timeUnit", "epoch", "notes"]);

export const MODEL_JSON_FIELDS = Object.freeze([
  ...MODEL_JSON_ARRAY_FIELDS, ...MODEL_JSON_OBJECT_FIELDS, ...MODEL_JSON_SCALAR_FIELDS,
]);

/**
 * Every model_json field of `source`, normalised: arrays default to [],
 * graph to null, experimentDefaults to {}; scalars are included only when set
 * (so spreading the result over a model keeps that model's own timeUnit etc.
 * when the source has none).
 * @param {Record<string, any>} [source]
 * @returns {Record<string, any>}
 */
export function pickModelJsonFields(source = {}) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of MODEL_JSON_ARRAY_FIELDS) out[key] = Array.isArray(source[key]) ? source[key] : [];
  for (const key of MODEL_JSON_OBJECT_FIELDS) {
    const value = source[key];
    out[key] = value && typeof value === "object" && !Array.isArray(value) ? value : (key === "graph" ? null : {});
  }
  for (const key of MODEL_JSON_SCALAR_FIELDS) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") out[key] = source[key];
  }
  return out;
}
