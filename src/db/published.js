// db/published.js — publishing a model (ADR-022, ADR-025).
//
// Two clearly separated sides, and keeping them apart IS the security design:
//
//   OWNER SIDE   getPublishedSettings / savePublishedSettings / publishModel /
//                withdrawPublishedModel / unpublishPublishedModel /
//                deletePublishedModel — these go through the table, under the
//                owner's RLS policy.
//
//   PUBLIC SIDE  fetchPublishedModel / fetchPublishedModelList — these call
//                the SECURITY DEFINER functions and are the ONLY way to read
//                a published model. There is no anon select policy on the
//                table, so nothing can be enumerated.
//
// The owner's status is a three-value act (draft → published → withdrawn),
// deliberately separate from `des_models.visibility`, which only controls
// listing in the signed-in community gallery.

import { supabase } from "./supabase.js";
import { buildSchedulesMap } from "./models.js";

const TABLE = "published_models";

/** The statuses a published model can be in. */
export const PUBLISH_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  WITHDRAWN: "withdrawn",
});

/** The licences an owner can publish under. */
export const PUBLISH_LICENCES = Object.freeze([
  { value: "all-rights-reserved", label: "All rights reserved" },
  { value: "cc-by-4.0",           label: "Creative Commons Attribution 4.0" },
  { value: "cc-by-sa-4.0",        label: "Creative Commons Attribution-ShareAlike 4.0" },
  { value: "mit",                 label: "MIT licence" },
  { value: "cc0-1.0",             label: "Public domain (CC0)" },
]);

/**
 * A licence's readable name. The stored value is a slug; people should never
 * be shown "cc-by-sa-4.0".
 * @param {string|null|undefined} value
 */
export function licenceLabel(value) {
  return PUBLISH_LICENCES.find(l => l.value === value)?.label || value || "All rights reserved";
}

/**
 * Escape a typed search for use inside ILIKE: `%` and `_` are wildcards and
 * `\` is its escape character, and someone searching "50%" means the text.
 * @param {string} text
 */
export function escapeLikePattern(text) {
  return String(text).replace(/[\\%_]/g, ch => `\\${ch}`);
}

/** The categories a published model can be listed under. */
export const PUBLISH_CATEGORIES = Object.freeze([
  { value: "healthcare",    label: "Healthcare" },
  { value: "logistics",     label: "Logistics" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "service",       label: "Service systems" },
  { value: "transport",     label: "Transport" },
  { value: "retail",        label: "Retail" },
  { value: "education",     label: "Education" },
  { value: "public-sector", label: "Public sector" },
  { value: "other",         label: "Other" },
]);

/**
 * Normalise a row from the table into the shape the UI uses.
 * @param {any} row
 */
export function normalizePublished(row) {
  if (!row) return null;
  return {
    id: row.id,
    modelId: row.model_id,
    ownerId: row.owner_id,
    title: row.title || "",
    summary: row.summary || "",
    description: row.description || "",
    category: row.category || null,
    licence: row.licence || "all-rights-reserved",
    coverImageUrl: row.cover_image_url || null,
    releasedVersionId: row.released_version_id || null,
    releaseNotes: row.release_notes || "",
    showEvidenceRegister: row.show_evidence_register !== false,
    exposedParams: Array.isArray(row.exposed_params) ? row.exposed_params : [],
    releasedSchedules: Array.isArray(row.released_schedules) ? row.released_schedules : [],
    status: row.status || PUBLISH_STATUS.DRAFT,
    publishedAt: row.published_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

/**
 * The owner's own published row for a model, or null if it has never been
 * published.
 * @param {string} modelId
 */
export async function getPublishedSettings(modelId) {
  if (!modelId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("model_id", modelId)
    .maybeSingle();
  if (error) throw error;
  return normalizePublished(data);
}

/**
 * Create or update the owner's published row. Does not publish — the row is
 * saved as a draft until publishModel() is called.
 *
 * @param {string} modelId
 * @param {string} userId
 * @param {Record<string, any>} settings
 */
export async function savePublishedSettings(modelId, userId, settings = {}) {
  if (!modelId) throw new Error("A model is required.");
  // The table requires a non-empty title (a published page with no title is
  // not a page). Checked here so the caller gets a clear message rather than
  // a raw database constraint error.
  const title = (settings.title || "").trim();
  if (!title) throw new Error("Give the published model a title before saving.");
  const row = {
    model_id: modelId,
    owner_id: userId,
    title,
    summary: settings.summary || "",
    description: settings.description || "",
    category: settings.category || null,
    licence: settings.licence || "all-rights-reserved",
    cover_image_url: settings.coverImageUrl || null,
    released_version_id: settings.releasedVersionId || null,
    release_notes: settings.releaseNotes || "",
    show_evidence_register: settings.showEvidenceRegister !== false,
    exposed_params: Array.isArray(settings.exposedParams) ? settings.exposedParams : [],
  };
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "model_id" })
    .select()
    .single();
  if (error) throw error;
  return normalizePublished(data);
}

/**
 * The three status changes all end in `.single()`, which errors when the row
 * is not there. A raw "JSON object requested, multiple (or no) rows returned"
 * is a poor way to learn that you have not saved the publish settings yet.
 *
 * @param {any} data
 * @param {any} error
 * @param {string} what
 */
function requireRow(data, error, what) {
  if (error) throw error;
  if (!data) throw new Error(`There is no publish record for this model yet — ${what} after saving the publish settings.`);
  return normalizePublished(data);
}

export async function publishModel(modelId, userId) {
  if (!modelId || !userId) throw new Error("A model and its owner are required.");
  const { data, error } = await supabase.rpc("publish_model", { p_model_id: modelId });
  return requireRow(data, error, "publish it");
}

/**
 * Withdraw a published model. The public page stops resolving — a withdrawn
 * model returns the same empty answer as one that was never published, so
 * the id cannot be probed.
 *
 * @param {string} modelId
 * @param {string} userId
 */
export async function withdrawPublishedModel(modelId, userId) {
  if (!modelId) throw new Error("A model is required.");
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: PUBLISH_STATUS.WITHDRAWN, published_at: null })
    .eq("model_id", modelId)
    .eq("owner_id", userId)
    .select()
    .single();
  return requireRow(data, error, "withdraw it");
}

/**
 * Return a published (or withdrawn) model to draft. The public page stops
 * resolving; the settings are kept so it can be published again.
 *
 * @param {string} modelId
 * @param {string} userId
 */
export async function unpublishPublishedModel(modelId, userId) {
  if (!modelId) throw new Error("A model is required.");
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: PUBLISH_STATUS.DRAFT, published_at: null })
    .eq("model_id", modelId)
    .eq("owner_id", userId)
    .select()
    .single();
  return requireRow(data, error, "unpublish it");
}

/**
 * Delete the published row entirely. The model itself is untouched.
 * @param {string} modelId
 * @param {string} userId
 */
export async function deletePublishedModel(modelId, userId) {
  if (!modelId) throw new Error("A model is required.");
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("model_id", modelId)
    .eq("owner_id", userId);
  if (error) throw error;
}

/**
 * The schedules map for a published model, built the same way the app builds
 * it for a model it owns: if one schedule is marked as the default, THAT one
 * is used; otherwise every schedule is merged. Using a different rule here
 * would make a published model behave differently from the owner's copy.
 *
 * The map's keys are what the engine's resolveInlineSchedules() looks up —
 * `<uuid>` and `<uuid>:<eventId>` — and the complexity estimator looks up
 * the plain `<uuid>` key, so both are needed.
 *
 * @param {any[]} schedules The published payload's `schedules`.
 * @returns {Record<string, any>}
 */
export function buildPublishedSchedulesMap(schedules) {
  const rows = Array.isArray(schedules) ? schedules : [];
  const defaultRow = rows.find(s => s?.isDefault);
  return buildSchedulesMap(defaultRow ? [defaultRow] : rows);
}

/**
 * Every published row the user owns — the owner's own "what have I
 * published" list.
 * @param {string} userId
 */
export async function listPublishedModelsForOwner(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizePublished);
}

// ── The public side ──────────────────────────────────────────────────────────
//
// These call the SECURITY DEFINER functions. There is no anon select policy
// on the table, so these are the only way to read a published model.

/**
 * The public payload for one published model, or null when there is none.
 *
 * A draft, a withdrawn model and a model that was never published all return
 * null — deliberately the same answer, so a stranger holding an id cannot
 * tell that it exists.
 *
 * @param {string} modelId
 */
export async function fetchPublishedModel(modelId) {
  if (!modelId) return null;
  const { data, error } = await supabase.rpc("get_published_model", { p_model_id: modelId });
  if (error) throw error;
  return data || null;
}

/**
 * The public gallery listing. Published models only; no model JSON is
 * returned, so a listing never carries every model's full definition.
 *
 * @param {{ category?: string|null, search?: string|null, limit?: number }} [options]
 */
export async function fetchPublishedModelList(options = {}) {
  const { data, error } = await supabase.rpc("list_published_models", {
    p_category: options.category || null,
    p_search: options.search ? escapeLikePattern(options.search) : null,
    p_limit: options.limit || 50,
  });
  if (error) throw error;
  return (data || []).map(row => ({
    modelId: row.model_id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    licence: row.licence,
    coverImageUrl: row.cover_image_url,
    author: row.author || null,
    publishedAt: row.published_at,
  }));
}
