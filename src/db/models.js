// @ts-check
// db/models.js — All Supabase database operations
//
// All functions are async and throw on error.
// The norm() function translates snake_case Supabase rows → camelCase model objects.

import { supabase } from "./supabase.js";
import { normalizeModelConditions } from "../model/conditionFormat.js";
import { migrateBalkingToQueues } from "../model/balkMigration.js";
import { buildPersistedResultsJson } from "./results-persistence.js";
import { STUDY_SCHEMA_VERSION } from "../contracts/study";

// Every column that this module reads or writes. Used by validateDbSchema().
export const EXPECTED_COLUMNS = [
  'id', 'owner_id', 'name', 'description', 'entity_types', 'state_variables',
  'b_events', 'c_events', 'visibility', 'access', 'created_at', 'updated_at',
  'queues', 'tags', 'goals', 'latest_version', 'model_json', 'parent_model_id',
];

export const DEFAULT_USER_SETTINGS = Object.freeze({
  ui: {},
  execute: {},
  ai: {},
});

const PLATFORM_ROLES = new Set(["user", "admin"]);

/** @param {string} [role] */
export function normalizeProfileRole(role) {
  return PLATFORM_ROLES.has(role ?? "") ? role : "user";
}

/** @param {Record<string, any>} [profile] */
export function normalizeProfile(profile = {}) {
  const role = normalizeProfileRole(profile.role);
  return {
    ...profile,
    role,
    isAdmin: role === "admin",
    suspended: profile.suspended ?? false,
  };
}

/** @param {Record<string, any>} [row] */
export function normalizeUserSettings(row = {}) {
  return {
    schemaVersion: row.schema_version ?? 1,
    settings: {
      ...DEFAULT_USER_SETTINGS,
      ...(row.settings_json || {}),
    },
  };
}

const DES_MODELS_SELECT_CURRENT = "id,name,description,tags,visibility,access,entity_types,state_variables,b_events,c_events,queues,goals,model_json,owner_id,created_at,updated_at,latest_version,parent_model_id";
const DES_MODELS_SELECT_LEGACY = "id,name,description,tags,visibility,access,entity_types,state_variables,b_events,c_events,queues,goals,owner_id,created_at,updated_at";
const DES_MODELS_SELECT_MINIMAL = "id,name,description,visibility,entity_types,state_variables,b_events,c_events,owner_id,created_at,updated_at";
const DES_MODELS_SELECTS = [
  DES_MODELS_SELECT_CURRENT,
  DES_MODELS_SELECT_LEGACY,
  DES_MODELS_SELECT_MINIMAL,
];
let desModelsSelectModeIndex = 0;

export function __resetDesModelsSchemaModeForTests() {
  desModelsSelectModeIndex = 0;
}

/** @param {any} error */
function errorText(error) {
  return [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
}

/** @param {any} error */
function isSchemaCompatibilityError(error) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  if (error.status === 400) return true;
  const text = errorText(error);
  return text.includes("column") || text.includes("select") || text.includes("schema");
}

/** @param {(selectClause: string) => PromiseLike<any>} buildQuery */
async function runDesModelsSelect(buildQuery) {
  let lastError = null;
  for (let i = desModelsSelectModeIndex; i < DES_MODELS_SELECTS.length; i++) {
    const selectClause = DES_MODELS_SELECTS[i];
    const result = await buildQuery(selectClause);
    if (!result?.error) {
      desModelsSelectModeIndex = i;
      return result;
    }
    lastError = result.error;
    if (!isSchemaCompatibilityError(result.error)) {
      throw result.error;
    }
    if (process.env.NODE_ENV === 'development') {
      throw new Error(`flow schema mismatch: ${result.error.message}`);
    }
    console.warn('[DB] schema fallback triggered — missing column or schema mismatch:', result.error?.message || result.error);
    desModelsSelectModeIndex = Math.min(i + 1, DES_MODELS_SELECTS.length - 1);
  }
  throw lastError;
}

// ── Row normalisation ─────────────────────────────────────────────────────────
/** @param {Record<string, any>} r */
export function norm(r) {
  const modelJson = r.model_json || {};
  // normalizeModelConditions/migrateBalkingToQueues live outside this pass's
  // typecheck scope (src/model/) and are untyped — cast at the boundary.
  return /** @type {Record<string, any>} */ (migrateBalkingToQueues(normalizeModelConditions({
    id:             r.id,
    name:           r.name,
    description:    r.description || "",
    notes:          modelJson.notes || "",
    tags:           r.tags || [],
    visibility:     r.visibility,
    access:         r.access      || {},
    entityTypes:    r.entity_types     || [],
    stateVariables: r.state_variables  || [],
    bEvents:        r.b_events         || [],
    cEvents:        r.c_events         || [],
    queues:         r.queues           || [],
    graph:          modelJson.graph ?? r.graph ?? null,
    experimentDefaults: modelJson.experimentDefaults ?? r.experiment_defaults ?? {},
    goals:          r.goals            || [],
    containerTypes: modelJson.containerTypes ?? [],
    distances:      modelJson.distances ?? [],
    skills:         modelJson.skills   || [],
    timeUnit:       modelJson.timeUnit ?? 'minutes',
    epoch:          modelJson.epoch ?? null,
    dataSources:    modelJson.dataSources ?? [],
    sections:       modelJson.sections ?? [],
    exposedParams:  modelJson.exposedParams ?? [],
    owner_id:       r.owner_id,
    owner:          r.owner_id,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
    latestVersion:  r.latest_version || 0,
    parentModelId:  r.parent_model_id || null,
  })));
}

/** @param {Record<string, any>} [model] */
function modelJsonFromModel(model = {}) {
  /** @type {Record<string, any>} */
  const json = {
    schemaVersion:        model.schemaVersion ?? 1,
    entityTypes:          model.entityTypes || [],
    stateVariables:       model.stateVariables || [],
    bEvents:              model.bEvents || [],
    cEvents:              model.cEvents || [],
    queues:               model.queues || [],
    containerTypes:       model.containerTypes || [],
    distances:            model.distances || [],
    skills:               model.skills || [],
    graph:                model.graph || null,
    experimentDefaults:   model.experimentDefaults || {},
    goals:                model.goals || [],
    timeUnit:             model.timeUnit || 'minutes',
    epoch:                model.epoch || null,
  };
  if (model.dataSources?.length) json.dataSources = model.dataSources;
  if (model.sections?.length) json.sections = model.sections;
  if (model.exposedParams?.length) json.exposedParams = model.exposedParams;
  if (model.notes) json.notes = model.notes;
  return json;
}

// ── Model to row (for save/update) ────────────────────────────────────────────
/**
 * @param {Record<string, any>} model
 * @param {string} userId
 */
function toRow(model, userId) {
  const normalized = /** @type {Record<string, any>} */ (normalizeModelConditions(model));
  return {
    name:            normalized.name,
    description:     normalized.description    || "",
    visibility:      normalized.visibility     || "private",
    access:          normalized.access         || {},
    entity_types:    normalized.entityTypes    || [],
    state_variables: normalized.stateVariables || [],
    b_events:        normalized.bEvents        || [],
    c_events:        normalized.cEvents        || [],
    queues:          normalized.queues         || [],
    goals:           normalized.goals          || [],
    tags:            normalized.tags           || [],
    model_json:      modelJsonFromModel(normalized),
    owner_id:        userId,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** @param {string} [userId] */
export async function fetchModels(userId) {
  let data;
  if (userId) {
    const sort = { ascending: false };
    const [visible, sharedViewer, sharedEditor] = await Promise.all([
      runDesModelsSelect((selectClause) =>
        supabase
          .from("des_models")
          .select(selectClause)
          .or(`owner_id.eq.${userId},visibility.eq.public`)
          .order("updated_at", sort)
      ),
      runDesModelsSelect((selectClause) =>
        supabase
          .from("des_models")
          .select(selectClause)
          .contains("access", { [userId]: "viewer" })
          .order("updated_at", sort)
      ),
      runDesModelsSelect((selectClause) =>
        supabase
          .from("des_models")
          .select(selectClause)
          .contains("access", { [userId]: "editor" })
          .order("updated_at", sort)
      ),
    ]);

    const byId = new Map();
    for (const row of [
      ...(visible.data || []),
      ...(sharedViewer.data || []),
      ...(sharedEditor.data || []),
    ]) {
      byId.set(row.id, row);
    }
    data = Array.from(byId.values()).sort((a, b) =>
      String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
    );
  } else {
    const { data: publicData } = await runDesModelsSelect((selectClause) =>
      supabase
        .from("des_models")
        .select(selectClause)
        .eq("visibility", "public")
        .order("updated_at", { ascending: false })
    );
    data = publicData || [];
  }

  if (data && data.length > 0 && data[0].queues === undefined) {
    console.warn(
      "Supabase des_models table missing queues column. " +
      "Run: ALTER TABLE des_models ADD COLUMN IF NOT EXISTS queues jsonb NOT NULL DEFAULT '[]'::jsonb;"
    );
  }
  return (data || []).map(norm);
}

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, initials, color, role, plan");
  if (error) throw error;
  return (data || []).map(normalizeProfile);
}

/** @param {string} [userId] */
export async function fetchUserSettings(userId) {
  if (!userId) {
    return normalizeUserSettings();
  }

  const { data, error } = await supabase
    .from("user_settings")
    .select("schema_version, settings_json")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return normalizeUserSettings();
    }
    throw error;
  }

  return normalizeUserSettings(data);
}

/**
 * @param {string} userId
 * @param {Record<string, any>} [settings]
 * @param {number} [schemaVersion]
 */
export async function saveUserSettings(userId, settings = {}, schemaVersion = 1) {
  if (!userId) {
    throw new Error("User id is required to save user settings.");
  }

  const { data, error } = await supabase
    .from("user_settings")
    .upsert({
      user_id: userId,
      schema_version: schemaVersion,
      settings_json: {
        ...DEFAULT_USER_SETTINGS,
        ...(settings || {}),
      },
      updated_at: new Date().toISOString(),
    })
    .select("schema_version, settings_json")
    .single();

  if (error) throw error;
  return normalizeUserSettings(data);
}

/**
 * @param {Record<string, any>} model
 * @param {string} userId
 */
export async function saveModel(model, userId) {
  const row = toRow(model, userId);
  /** @param {Record<string, any>} payload */
  const persist = async (payload) => {
    // No .single() here: an UPDATE that RLS filters out (e.g. an editor
    // collaborator, once the des_models "Allow update" policy is scoped
    // wrongly, or a model deleted concurrently) legitimately affects zero
    // rows with no Postgres error — .single() would turn that into a raw,
    // user-facing PGRST116 "Cannot coerce the result to a single JSON
    // object" instead of the clear message thrown below.
    if (model.id) {
      return supabase
        .from("des_models")
        .update(payload)
        .eq("id", model.id)
        .select();
    }
    return supabase
      .from("des_models")
      .insert(payload)
      .select();
  };

  const initialRow = desModelsSelectModeIndex === 0 ? row : (() => {
    const { model_json, ...legacyRow } = row;
    return legacyRow;
  })();

  let result = await persist(initialRow);
  if (result.error && isSchemaCompatibilityError(result.error) && errorText(result.error).includes("model_json")) {
    if (process.env.NODE_ENV === 'development') {
      throw new Error(`flow schema mismatch: ${result.error.message}`);
    }
    console.warn('[DB] model_json column missing — falling back to legacy save (dataSources will not be persisted):', result.error?.message || result.error);
    desModelsSelectModeIndex = Math.min(1, DES_MODELS_SELECTS.length - 1);
    const { model_json, ...legacyRow } = row;
    result = await persist(legacyRow);
  }
  if (result.error) throw result.error;
  if (!result.data || result.data.length === 0) {
    throw new Error("You don't have permission to save this model, or it no longer exists.");
  }
  return norm(result.data[0]);
}

/**
 * @param {string} id
 * @param {string} userId
 */
export async function deleteModel(id, userId) {
  if (!id || !userId) {
    return { ok: false, error: "Model id and user id are required to delete a model." };
  }

  // No committed schema file currently confirms simulation_runs cascade behaviour.
  const { data, error } = await supabase
    .from("des_models")
    .delete()
    .eq("id", id)
    .eq("owner_id", userId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (Array.isArray(data) && data.length === 0) {
    return { ok: false, error: "Model not found or you do not own it." };
  }
  return { ok: true };
}

/**
 * @param {string} id
 * @param {string} visibility
 * @param {string} userId
 */
export async function setVisibility(id, visibility, userId) {
  // .select("id") + a 0-row check, not just `if (error)` — an UPDATE whose
  // WHERE clause matches nothing (wrong id, row deleted concurrently) is not
  // a Postgres error, so without this a mismatch here silently "succeeds"
  // with nothing written. Same pattern as deleteModel/saveModel/setAccess.
  const { data, error } = await supabase
    .from("des_models")
    .update({ visibility })
    .eq("id", id)
    .eq("owner_id", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("You don't have permission to change this model's visibility, or it no longer exists.");
  }
}

/**
 * @param {string} id
 * @param {Record<string, any>} access
 * @param {string} userId
 */
export async function setAccess(id, access, userId) {
  // Same 0-row hardening as setVisibility above — a silently-empty match here
  // was one plausible cause of "the collaborator disappears": the write
  // reports success with nothing actually written.
  const { data, error } = await supabase
    .from("des_models")
    .update({ access })
    .eq("id", id)
    .eq("owner_id", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("You don't have permission to change this model's collaborators, or it no longer exists.");
  }
}

/**
 * @param {string} modelId
 * @param {string} userId
 * @param {string[]} tags
 */
export async function updateModelTags(modelId, userId, tags) {
  const { error } = await supabase
    .from("des_models")
    .update({ tags: Array.isArray(tags) ? tags : [] })
    .eq("id", modelId)
    .eq("owner_id", userId);
  if (error) throw error;
  return { ok: true };
}

// ── Simulation run history ────────────────────────────────────────────────────

/**
 * @param {string} modelId
 * @param {string} userId
 * @param {Record<string, any>} result
 * @param {Record<string, any>} [config]
 */
export async function saveSimulationRun(modelId, userId, result, config = {}) {
  const s = result.summary || {};
  const runLabel = typeof config.runLabel === "string" ? config.runLabel.trim() : "";
  const resultsJson = buildPersistedResultsJson(result, config);

  /** @type {Record<string, any>} */
  const runPayload = {
    model_id:            modelId,
    run_by:              userId,
    replications:        config.replications || 1,
    max_simulation_time: config.maxTime      ?? 500,
    warmup_period:       config.warmupPeriod || null,
    seed:                config.seed         ?? null,
    total_arrived:       s.total    || 0,
    total_served:        s.served   || 0,
    total_reneged:       s.reneged  || 0,
    avg_wait_time:       s.avgWait  ?? null,
    avg_service_time:    s.avgSvc ?? null,
    renege_rate:         s.total ? (s.reneged / s.total) : 0,
    results_json:        resultsJson,
    aggregate_stats:     config.aggregateStats ?? resultsJson.aggregateStats ?? null,
    duration_ms:         config.durationMs || null,
    run_label:           runLabel || null,
  };
  // Only include version_id when explicitly provided (migration may not be applied yet)
  if (config.versionId) {
    runPayload.version_id = config.versionId;
  }

  const { data, error } = await supabase.from("simulation_runs").insert(runPayload).select("id").single();
  if (error) throw error;
  return data?.id;
}

/**
 * @param {string} runId
 * @param {any} insights
 */
export async function saveAiInsights(runId, insights) {
  const { error } = await supabase
    .from("simulation_runs")
    .update({ ai_insights: insights })
    .eq("id", runId);
  if (error) throw error;
  return { ok: true };
}

/** @param {Record<string, any>} [row] */
export function normalizeRunHistoryRow(row = {}) {
  const totalArrived = row.total_arrived ?? 0;
  const totalServed = row.total_served ?? 0;
  const totalReneged = row.total_reneged ?? 0;
  return {
    ...row,
    total_arrived: totalArrived,
    total_served: totalServed,
    total_reneged: totalReneged,
    avg_wait_time: row.avg_wait_time,
    avg_service_time: row.avg_service_time,
    renege_rate: totalArrived ? (totalReneged / totalArrived) : (row.renege_rate ?? 0),
    run_label: row.run_label || "",
    tags: row.tags || [],
    archived: row.archived || false,
    ai_insights: row.ai_insights || null,
    aggregate_stats: row.aggregate_stats || null,
  };
}

/**
 * @param {string} modelId
 * @param {{ search?: string, tags?: string[], archived?: boolean }} [filters]
 */
export async function fetchRunHistory(modelId, filters = {}) {
  const { search, tags, archived = false } = filters;
  let query = supabase
    .from("simulation_runs")
    .select("id, ran_at, total_arrived, total_served, total_reneged, avg_wait_time, avg_service_time, renege_rate, duration_ms, replications, seed, max_simulation_time, aggregate_stats, warmup_period, ai_insights, run_label, tags, archived, version_id, model_versions(version, name)")
    .eq("model_id", modelId)
    .eq("archived", archived)
    .order("ran_at", { ascending: false })
    .limit(20);
  if (tags && tags.length > 0) {
    query = query.contains("tags", tags);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []).map(normalizeRunHistoryRow);
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    return rows.filter(r => (r.run_label || "").toLowerCase().includes(q));
  }
  return rows;
}

// --- F28.6: Run organisation helpers ---

/**
 * @param {string} runId
 * @param {string} userId
 * @param {string} label
 */
export async function updateRunLabel(runId, userId, label) {
  const { error } = await supabase
    .from("simulation_runs")
    .update({ run_label: label || null })
    .eq("id", runId)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

/**
 * @param {string} runId
 * @param {string} userId
 * @param {string[]} tags
 */
export async function updateRunTags(runId, userId, tags) {
  const { error } = await supabase
    .from("simulation_runs")
    .update({ tags: Array.isArray(tags) ? tags : [] })
    .eq("id", runId)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

/**
 * @param {string} runId
 * @param {string} userId
 */
export async function archiveRun(runId, userId) {
  const { error } = await supabase
    .from("simulation_runs")
    .update({ archived: true })
    .eq("id", runId)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

/**
 * @param {string} runId
 * @param {string} userId
 */
export async function unarchiveRun(runId, userId) {
  const { error } = await supabase
    .from("simulation_runs")
    .update({ archived: false })
    .eq("id", runId)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

/** @param {string} runId */
export async function getRun(runId) {
  const { data, error } = await supabase
    .from('simulation_runs')
    .select('id, results_json, max_simulation_time, warmup_period, replications, seed, ran_at, version_id, model_versions(id, version, name, model_json)')
    .eq('id', runId)
    .single();
  if (error) throw error;
  const row = /** @type {Record<string, any>} */ (data);
  const rj = row.results_json || {};
  // Prefer embedded snapshot (set only for "full" detail-level saves).
  // Fall back to the model_json from the linked model version when the run
  // recorded a version_id — this gives reproduce/diff full fidelity without
  // requiring the full model to be embedded in every results row.
  const mv = row.model_versions ?? null;
  return {
    id:             row.id,
    model_snapshot: rj._model_snapshot  ?? null,
    version_model:  mv?.model_json      ?? null,
    version_id:     row.version_id      ?? null,
    version_number: mv?.version         ?? null,
    version_name:   mv?.name            ?? null,
    base_seed:      rj._base_seed       ?? row.seed ?? null,
    engine_version: rj._engine_version  ?? null,
    experiment_config: rj._experiment_config ?? {
      maxSimTime:           row.max_simulation_time ?? 500,
      warmupPeriod:         row.warmup_period       ?? 0,
      replications:         row.replications        ?? 1,
      seed:                 rj._base_seed ?? row.seed ?? null,
      terminationMode:      'time',
      terminationCondition: null,
    },
    summary: rj.summary ?? null,
    results_json: rj,
  };
}

// Lazy-fetch the full results_json for a single run, on demand — used by
// history-row actions (compare, LLM bundle export, results export) that
// need the full payload only when the user actually triggers them, so the
// run-history list query itself doesn't have to select results_json.
/** @param {string} runId */
export async function getRunResultsJson(runId) {
  const { data, error } = await supabase
    .from("simulation_runs")
    .select("id, results_json")
    .eq("id", runId)
    .single();
  if (error) throw error;
  return data?.results_json || {};
}

/**
 * @param {string} runId
 * @param {string} userId
 */
export async function deleteSimulationRun(runId, userId) {
  const { error } = await supabase
    .from("simulation_runs")
    .delete()
    .eq("id", runId)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

/**
 * @param {string[]} [modelIds]
 * @param {string} [userId]
 */
export async function fetchRunStatsForModels(modelIds = [], userId) {
  const ids = Array.from(new Set(modelIds.filter(Boolean)));
  /** @type {Record<string, { runs: number }>} */
  const emptyStats = ids.reduce((stats, id) => ({ ...stats, [id]: { runs: 0 } }), {});
  if (!ids.length || !userId) return emptyStats;

  const { data, error } = await supabase
    .from("simulation_runs")
    .select("model_id")
    .in("model_id", ids)
    .eq("run_by", userId);
  if (error) throw error;

  return (data || []).reduce((stats, row) => {
    if (!stats[row.model_id]) stats[row.model_id] = { runs: 0 };
    stats[row.model_id].runs += 1;
    return stats;
  }, emptyStats);
}

/**
 * @param {string} sourceModelId
 * @param {string} newUserId
 * @param {string} [newName]
 * @param {{ parentModelId?: string }} [options]
 */
export async function forkModel(sourceModelId, newUserId, newName = "", options = {}) {
  // 1. Fetch the original model — must be owned by or accessible to the user
  const { data: sourceModel, error: fetchError } = await runDesModelsSelect((selectClause) =>
    supabase
      .from("des_models")
      .select(selectClause)
      .or(`owner_id.eq.${newUserId},visibility.eq.public`)
      .eq("id", sourceModelId)
      .single()
  );
  if (fetchError) throw fetchError;
  if (!sourceModel) throw new Error("Source model not found.");

  // 2. Prepare the new model row
  const forkedModel = {
    ...sourceModel,
    id:             undefined, // New model, so no ID
    owner_id:       newUserId,
    name:           newName || `Fork of ${sourceModel.name}`,
    visibility:     'private', // Forked models are always private
    access:         {},        // Clear access rules
    parent_model_id: options.parentModelId || null,
    latest_version: 0,
    created_at:     undefined, // Supabase will set these
    updated_at:     undefined,
  };

  // 3. Insert the new model
  const { data, error: insertError } = await supabase
    .from("des_models")
    .insert(forkedModel)
    .select()
    .single();
  if (insertError) throw insertError;
  return norm(data);
}

// ── Share links ───────────────────────────────────────────────────────────────

/**
 * @param {string} runId
 * @param {string} userId
 * @param {{ expiresAt?: string, pinnedWidgets?: any[], title?: string }} [config]
 */
export async function createShareLink(runId, userId, config = {}) {
  // No Math.random fallback: a share token must never be guessable, and
  // crypto.randomUUID is available in every supported browser and Node ≥ 16.
  const token = globalThis.crypto.randomUUID();

  const { data, error } = await supabase
    .from("share_links")
    .insert({
      run_id: runId,
      created_by: userId,
      token,
      expires_at: config.expiresAt || null,
      config: {
        pinnedWidgets: config.pinnedWidgets || [],
        title: config.title || "",
      },
    })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, token: data.token, createdAt: data.created_at, expiresAt: data.expires_at };
}

/** @param {string} token */
export async function getShareLink(token) {
  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("id, run_id, config, created_at, revoked_at, expires_at")
    .eq("token", token)
    .single();
  if (linkError) throw linkError;
  if (!link) throw new Error("Share link not found.");
  if (link.revoked_at) throw new Error("This share link has been revoked.");
  if (link.expires_at && new Date(link.expires_at) <= new Date()) throw new Error("This share link has expired.");

  // Fire-and-forget: record the view (non-blocking, best-effort)
  supabase.rpc("increment_share_view", { p_token: token }).then(() => {}, () => {});

  const { data: run, error: runError } = await supabase
    .from("simulation_runs")
    .select("id, model_id, ran_at, replications, seed, total_arrived, total_served, total_reneged, avg_wait_time, avg_service_time, max_simulation_time, warmup_period, results_json, ai_insights, narrative_text, model_description_text")
    .eq("id", link.run_id)
    .single();
  if (runError) throw runError;
  if (!run) throw new Error("Run not found.");

  const { data: model, error: modelError } = await runDesModelsSelect((selectClause) =>
    supabase
      .from("des_models")
      .select(selectClause)
      .eq("id", run.model_id)
      .single()
  );
  if (modelError) throw modelError;

  const modelGraph = model.model_json?.graph || null;

  return {
    share: {
      id: link.id,
      token,
      config: link.config,
      createdAt: link.created_at,
    },
    run: {
      id: run.id,
      ranAt: run.ran_at,
      replications: run.replications,
      seed: run.seed,
      totalArrived: run.total_arrived,
      totalServed: run.total_served,
      totalReneged: run.total_reneged,
      avgWaitTime: run.avg_wait_time,
      avgServiceTime: run.avg_service_time,
      maxSimulationTime: run.max_simulation_time,
      warmupPeriod: run.warmup_period,
      resultsJson: run.results_json,
      aiInsights: run.ai_insights || null,
      narrativeText: run.narrative_text || null,
      modelDescriptionText: run.model_description_text || null,
    },
    model: {
      name: model.name,
      entityTypes: model.entity_types || [],
      queues: model.queues || [],
      graph: modelGraph,
    },
  };
}

/**
 * @param {string} id
 * @param {string} userId
 */
export async function revokeShareLink(id, userId) {
  // No .single() — a mismatched id/created_by legitimately affects zero
  // rows with no Postgres error, and .single() would throw the raw
  // PGRST116 coercion error before the friendly check below ever ran.
  const { data, error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("created_by", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Share link not found or you do not own it.");
  return { ok: true };
}

// ── Studies (parameter-sweep experiments) ────────────────────────────────────
// A Study is distinct from an Experiment (below) — a Study varies parameters
// across a range/sample and evaluates goals; an Experiment is a saved named
// parameter set. `studies` was renamed from `sweeps` (Sprint 15-16) — legacy
// rows have `schema_version === null` and keep their `config`/`results` blob
// shape; new rows populate `definition`/`schema_version`/`status`/`origin`
// and store per-point results in the separate `study_points` table instead
// of the `results` blob (see 20260905090000_studies_definition_and_points.sql).

/**
 * @param {string} modelId
 * @param {string} userId
 * @param {import('../contracts/study').StudyDefinition} definition
 * @param {import('../contracts/study').StudyPoint[]} [points]
 * @param {import('../contracts/study').StudyStatus} [status]
 */
export async function saveStudy(modelId, userId, definition, points = [], status = "complete") {
  const origin = definition?.origin || { kind: "user" };
  const { data, error } = await supabase
    .from("studies")
    .insert({
      model_id: modelId,
      run_by: userId,
      definition,
      schema_version: STUDY_SCHEMA_VERSION,
      status,
      origin,
      // Denormalised from origin.refId when this study was seeded from a
      // previous one (sequential plans) — see study.ts's StudyOrigin and
      // 20260905100000_studies_phase3.sql. Any other origin kind (user/
      // experiment/ai) leaves this null.
      parent_study_id: origin.kind === "study" ? origin.refId || null : null,
    })
    .select("id, definition, schema_version, status, origin, parent_study_id, created_at")
    .single();
  if (error) throw error;

  const studyId = data.id;
  if (points.length > 0) {
    const rows = points.map((p, i) => ({
      study_id: studyId,
      point_index: p.pointIndex ?? i,
      params: p.params,
      replications: p.replications ?? definition?.runBudget?.replicationsPerPoint ?? 1,
      metrics: p.metrics || {},
      feasible: p.feasible ?? null,
      seed: p.seed ?? null,
    }));
    const { error: pointsError } = await supabase.from("study_points").insert(rows);
    if (pointsError) throw pointsError;
  }

  return {
    id: studyId,
    definition: data.definition,
    schemaVersion: data.schema_version,
    status: data.status,
    origin: data.origin,
    parentStudyId: data.parent_study_id ?? null,
    createdAt: data.created_at,
  };
}

/** @param {string} id */
export async function getStudy(id) {
  const { data, error } = await supabase
    .from("studies")
    .select("id, model_id, definition, config, results, schema_version, status, origin, parent_study_id, created_at")
    .eq("id", id)
    .single();
  if (error) throw error;

  // Legacy blob row (pre-Study schema) — return the untouched shape, no
  // attempt to reshape it into the new definition/points form.
  if (data.schema_version == null) {
    return {
      id: data.id,
      modelId: data.model_id,
      legacy: true,
      config: data.config,
      results: data.results,
      createdAt: data.created_at,
    };
  }

  const { data: pointRows, error: pointsError } = await supabase
    .from("study_points")
    .select("id, point_index, params, replications, metrics, feasible, seed, created_at")
    .eq("study_id", id)
    .order("point_index", { ascending: true });
  if (pointsError) throw pointsError;

  return {
    id: data.id,
    modelId: data.model_id,
    legacy: false,
    definition: data.definition,
    schemaVersion: data.schema_version,
    status: data.status,
    origin: data.origin,
    parentStudyId: data.parent_study_id ?? null,
    createdAt: data.created_at,
    points: (pointRows || []).map(r => ({
      id: r.id,
      pointIndex: r.point_index,
      params: r.params,
      replications: r.replications,
      metrics: r.metrics,
      feasible: r.feasible,
      seed: r.seed,
      createdAt: r.created_at,
    })),
  };
}

/** @param {string} modelId */
export async function listStudies(modelId) {
  const { data, error } = await supabase
    .from("studies")
    .select("id, definition, config, schema_version, status, origin, created_at")
    .eq("model_id", modelId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(row => {
    const legacy = row.schema_version == null;
    return {
      id: row.id,
      legacy,
      name: legacy ? (row.config?.paramConfig?.label || row.config?.label || "Sweep") : (row.definition?.name || "Untitled study"),
      planType: legacy ? (row.config?.paramConfigs ? "grid2d" : "grid1d") : (row.definition?.planType || null),
      status: row.status || (legacy ? "complete" : null),
      origin: row.origin || (legacy ? { kind: "user" } : null),
      createdAt: row.created_at,
    };
  });
}

/**
 * @param {string} id
 * @param {string} userId
 */
export async function deleteStudy(id, userId) {
  const { error } = await supabase
    .from("studies")
    .delete()
    .eq("id", id)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

/** @param {string} modelId */
export async function listShareLinks(modelId) {
  const { data: runs, error: runsError } = await supabase
    .from("simulation_runs")
    .select("id")
    .eq("model_id", modelId);
  if (runsError) throw runsError;

  const runIds = (runs || []).map(r => r.id);
  if (runIds.length === 0) return [];

  const { data, error } = await supabase
    .from("share_links")
    .select("id, token, config, created_at, revoked_at, run_id, expires_at, view_count, last_viewed_at")
    .in("run_id", runIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(link => {
    const expired = link.expires_at != null && new Date(link.expires_at) <= new Date();
    return {
      id: link.id,
      token: link.token,
      config: link.config,
      createdAt: link.created_at,
      revokedAt: link.revoked_at,
      expiresAt: link.expires_at,
      viewCount: link.view_count ?? 0,
      lastViewedAt: link.last_viewed_at,
      isActive: !link.revoked_at && !expired,
      isExpired: expired,
      runId: link.run_id,
    };
  });
}

// ── Platform config (admin only) ──────────────────────────────────────────────

/** @param {string} key */
export async function getPlatformConfig(key) {
  const { data, error } = await supabase
    .from("platform_config")
    .select("value")
    .eq("key", key)
    .single();
  if (error && error.code !== "PGRST116") throw error; // PGRST116 = not found
  return data?.value ?? null;
}

/**
 * @param {string} key
 * @param {any} value
 * @param {string} userId
 */
export async function setPlatformConfig(key, value, userId) {
  const { error } = await supabase
    .from("platform_config")
    .upsert({ key, value, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
  return { ok: true };
}

export async function fetchTierPolicies() {
  return getPlatformConfig("tier_policies");
}
/**
 * @param {any} policies
 * @param {string} userId
 */
export async function saveTierPolicies(policies, userId) {
  return setPlatformConfig("tier_policies", policies, userId);
}

export async function fetchAllUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeProfile);
}

/**
 * @param {string} userId
 * @param {string} role
 */
export async function updateUserRole(userId, role) {
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw error;
  return { ok: true };
}

/** @param {string} userId */
export async function suspendUser(userId) {
  const { error } = await supabase
    .from("profiles")
    .update({ suspended: true, suspended_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
  return { ok: true };
}

/** @param {string} userId */
export async function unsuspendUser(userId) {
  const { error } = await supabase
    .from("profiles")
    .update({ suspended: false, suspended_at: null })
    .eq("id", userId);
  if (error) throw error;
  return { ok: true };
}

/**
 * @param {string} action
 * @param {string|null} [targetId]
 * @param {string|null} [targetKey]
 * @param {any} [oldValue]
 * @param {any} [newValue]
 */
export async function logAdminAction(action, targetId = null, targetKey = null, oldValue = null, newValue = null) {
  const { error } = await supabase.rpc("log_admin_action", {
    p_action:     action,
    p_target_id:  targetId,
    p_target_key: targetKey,
    p_old_value:  oldValue != null ? String(oldValue) : null,
    p_new_value:  newValue != null ? String(newValue) : null,
  });
  if (error) throw error;
  return { ok: true };
}

/** @param {number} [limit] */
export async function fetchAuditLog(limit = 100) {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, actor_id, action, target_id, target_key, old_value, new_value, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(row => ({
    id:        row.id,
    actorId:   row.actor_id,
    action:    row.action,
    targetId:  row.target_id,
    targetKey: row.target_key,
    oldValue:  row.old_value,
    newValue:  row.new_value,
    createdAt: row.created_at,
  }));
}

// --- F28.1: Saved Experiment Definitions ---

/** @param {Record<string, any>} [row] */
function normalizeExperiment(row = {}) {
  return {
    id: row.id,
    modelId: row.model_id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? null,
    config: row.config ?? {},
    // Set when this experiment was created via the Studies tab's "Promote to
    // Experiment" action (src/contracts/study.ts's StudyPoint) — null for
    // every other experiment. See 20260905100000_studies_phase3.sql.
    sourceStudyPointId: row.source_study_point_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** @param {string} modelId */
export async function fetchExperiments(modelId) {
  const { data, error } = await supabase
    .from("experiments")
    .select("*")
    .eq("model_id", modelId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeExperiment);
}

/** @param {{ modelId: string, userId: string, name: string, description?: string, config: Record<string, any>, sourceStudyPointId?: string }} params */
export async function saveExperiment({ modelId, userId, name, description, config, sourceStudyPointId }) {
  const { data, error } = await supabase
    .from("experiments")
    .insert({
      model_id: modelId,
      user_id: userId,
      name,
      description: description || null,
      config,
      source_study_point_id: sourceStudyPointId || null,
    })
    .select()
    .single();
  if (error) throw error;
  return normalizeExperiment(data);
}

/**
 * @param {string} id
 * @param {{ name?: string, description?: string, config?: Record<string, any> }} params
 */
export async function updateExperiment(id, { name, description, config }) {
  /** @type {Record<string, any>} */
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description || null;
  if (config !== undefined) patch.config = config;
  const { data, error } = await supabase
    .from("experiments")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return normalizeExperiment(data);
}

/**
 * @param {string} id
 * @param {string} userId
 */
export async function cloneExperiment(id, userId) {
  const { data: src, error: fetchErr } = await supabase
    .from("experiments")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;
  const { data, error } = await supabase
    .from("experiments")
    .insert({
      model_id: src.model_id,
      user_id: userId,
      name: `${src.name} (copy)`,
      description: src.description,
      config: src.config,
    })
    .select()
    .single();
  if (error) throw error;
  return normalizeExperiment(data);
}

/** @param {string} id */
export async function deleteExperiment(id) {
  const { error } = await supabase
    .from("experiments")
    .delete()
    .eq("id", id);
  if (error) throw error;
  return { ok: true };
}

// ── Diagnoses ────────────────────────────────────────────────────────────────
// Persists DiagnosticsTab.jsx's AI diagnosis result, keyed to the
// simulation_runs row it was run against (previously ephemeral React state
// only — see 20260905100000_studies_phase3.sql). Rows are immutable after
// insert (enforced by a DB trigger), matching study_points' write-once shape.

/** @param {Record<string, any>} row */
function normalizeDiagnosis(row = {}) {
  return {
    id: row.id,
    runId: row.run_id,
    userId: row.user_id,
    versionId: row.version_id ?? null,
    result: row.result,
    createdAt: row.created_at,
  };
}

/**
 * @param {string} runId
 * @param {string} userId
 * @param {Record<string, any>} result the parsed diagnosis JSON (findings/overallAssessment)
 * @param {string|null} [versionId]
 */
export async function saveDiagnosis(runId, userId, result, versionId = null) {
  const { data, error } = await supabase
    .from("diagnoses")
    .insert({ run_id: runId, user_id: userId, version_id: versionId, result })
    .select()
    .single();
  if (error) throw error;
  return normalizeDiagnosis(data);
}

/** @param {string} runId */
export async function listDiagnosesForRun(runId) {
  const { data, error } = await supabase
    .from("diagnoses")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeDiagnosis);
}

// ── Model Versions ────────────────────────────────────────────────────────────

/** @param {Record<string, any>} row */
function normalizeVersion(row) {
  return {
    id: row.id,
    modelId: row.model_id,
    version: row.version,
    name: row.name,
    notes: row.notes,
    modelJson: row.model_json,
    isStructural: row.is_structural,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/** @param {string} modelId */
export async function getNextVersion(modelId) {
  const { data, error } = await supabase
    .from("model_versions")
    .select("version")
    .eq("model_id", modelId)
    .order("version", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data.length > 0) ? data[0].version + 1 : 1;
}

/**
 * @param {string} modelId
 * @param {string} userId
 * @param {{ version: number, name?: string, notes?: string, modelJson: Record<string, any>, isStructural?: boolean }} params
 */
export async function createVersion(modelId, userId, { version, name, notes, modelJson, isStructural }) {
  const { data, error } = await supabase
    .from("model_versions")
    .insert({
      model_id: modelId,
      version,
      name: name || null,
      notes: notes || null,
      model_json: modelJson,
      is_structural: isStructural !== undefined ? isStructural : true,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;

  // Update denormalised latest_version on the model
  await supabase
    .from("des_models")
    .update({ latest_version: version })
    .eq("id", modelId);

  return normalizeVersion(data);
}

/** @param {string} modelId */
export async function listVersions(modelId) {
  const { data, error } = await supabase
    .from("model_versions")
    .select("*")
    .eq("model_id", modelId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeVersion);
}

/**
 * @param {string} modelId
 * @param {number} version
 */
export async function getVersion(modelId, version) {
  const { data, error } = await supabase
    .from("model_versions")
    .select("*")
    .eq("model_id", modelId)
    .eq("version", version)
    .single();
  if (error) throw error;
  if (!data) return null;
  return normalizeVersion(data);
}

/**
 * @param {string} modelId
 * @param {string} versionId
 * @param {string} userId
 */
export async function deleteVersion(modelId, versionId, userId) {
  const { data: model, error: modelError } = await runDesModelsSelect((selectClause) =>
    supabase
      .from("des_models")
      .select(selectClause)
      .eq("id", modelId)
      .single()
  );
  if (modelError) throw modelError;
  if (!model || model.owner_id !== userId) throw new Error("Only the model owner can delete versions.");

  const { error } = await supabase
    .from("model_versions")
    .delete()
    .eq("id", versionId)
    .eq("model_id", modelId);
  if (error) throw error;

  // Recalculate latest_version after deletion
  const { data: remaining } = await supabase
    .from("model_versions")
    .select("version")
    .eq("model_id", modelId)
    .order("version", { ascending: false })
    .limit(1);
  const newLatest = remaining && remaining.length > 0 ? remaining[0].version : 0;
  await supabase
    .from("des_models")
    .update({ latest_version: newLatest })
    .eq("id", modelId);

  return { ok: true };
}

// ── Feedback admin functions (PR #115) ────────────────────────────────────────

const FEEDBACK_STATUSES = ["new", "reviewed", "actioned", "dismissed"];

/**
 * Fetch feedback rows for admin triage. Requires admin RLS policy.
 * @param {{ limit?: number, offset?: number, status?: string }} opts
 * @returns {Promise<Array<{id: string, createdAt: string, userId: string|null, accountEmail: string|null, replyEmail: string|null, category: string, message: string, appVersion: string|null, pageContext: string|null, status: string}>>}
 */
export async function fetchFeedback({ limit = 100, offset = 0, status } = {}) {
  let query = supabase
    .from("feedback")
    .select("id, created_at, user_id, account_email, reply_email, category, message, app_version, page_context, status")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(r => ({
    id:          r.id,
    createdAt:   r.created_at,
    userId:      r.user_id,
    accountEmail:r.account_email,
    replyEmail:  r.reply_email,
    category:    r.category,
    message:     r.message,
    appVersion:  r.app_version,
    pageContext: r.page_context,
    status:      r.status,
  }));
}

/**
 * Update the status of a feedback row (admin-only).
 * @param {string} id  - UUID of the feedback row
 * @param {string} status - one of: new | reviewed | actioned | dismissed
 */
export async function updateFeedbackStatus(id, status) {
  if (!FEEDBACK_STATUSES.includes(status)) {
    throw new Error(`Invalid feedback status "${status}". Must be one of: ${FEEDBACK_STATUSES.join(", ")}.`);
  }
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
  return { ok: true };
}

// ── Sprint 71: SaaS Operator Layer ───────────────────────────────────────────

/**
 * Fetch admin user stats via the get_admin_user_stats() security-definer RPC.
 * Returns aggregated per-user usage data. Requires admin role.
 * Use in admin panel instead of fetchAllUsers() for the enhanced user list.
 */
export async function fetchAdminUserStats() {
  const { data, error } = await supabase.rpc("get_admin_user_stats");
  if (error) throw error;
  return /** @type {Record<string, any>[]} */ (data || []).map(row => ({
    id:           row.id,
    email:        row.email,
    role:         row.role,
    plan:         row.plan || "free",
    suspended:    row.suspended ?? false,
    signupAt:     row.signup_at,
    lastActiveAt: row.last_active_at,
    modelCount:   Number(row.model_count ?? 0),
    runCount:     Number(row.run_count ?? 0),
    runsLast30d:  Number(row.runs_last_30d ?? 0),
    isAdmin:      row.role === "admin",
  }));
}

/**
 * Fetch platform-wide KPI counts for the Usage tab.
 * Requires admin role.
 */
export async function fetchPlatformStats() {
  const { data, error } = await supabase.rpc("get_platform_stats");
  if (error) throw error;
  return data || {};
}

/**
 * Fetch daily signup counts for the past p_days days.
 * Requires admin role.
 * @param {number} days - Number of days to look back (default 30)
 */
export async function fetchSignupCounts(days = 30) {
  const { data, error } = await supabase.rpc("get_signup_counts", { p_days: days });
  if (error) throw error;
  return /** @type {Record<string, any>[]} */ (data || []).map(row => ({ day: row.day, count: Number(row.count) }));
}

/**
 * Update the plan for a user. Admin-only operation.
 * @param {string} userId - Target user UUID
 * @param {'free'|'pro'} plan - New plan value
 */
export async function updateUserPlan(userId, plan) {
  const { error } = await supabase
    .from("profiles")
    .update({ plan })
    .eq("id", userId);
  if (error) throw error;
  return { ok: true };
}

// ── Model Schedules (ADR-016) ─────────────────────────────────────────────────
//
// model_schedules rows hold the timetable data extracted from bEvent.schedules[].rows[].
// The engine resolves scheduleRef UUIDs at run initialisation via resolveInlineSchedules().

/**
 * Normalise a model_schedules row from Supabase into a plain JS object.
 */
/** @param {Record<string, any>} row */
function normSchedule(row) {
  return {
    id:           row.id,
    modelId:      row.model_id,
    name:         row.name,
    description:  row.description ?? null,
    scheduleJson: row.schedule_json ?? [],
    isDefault:    row.is_default   ?? false,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    createdBy:    row.created_by   ?? null,
  };
}

/**
 * Fetch all schedules for a given model, ordered by is_default DESC, name ASC.
 * Returns an empty array when the model has no schedules.
 */
/** @param {string} modelId */
export async function fetchModelSchedules(modelId) {
  const { data, error } = await supabase
    .from('model_schedules')
    .select('id, model_id, name, description, schedule_json, is_default, created_at, updated_at, created_by')
    .eq('model_id', modelId)
    .order('is_default', { ascending: false })
    .order('name',       { ascending: true  });
  if (error) throw error;
  return (data || []).map(normSchedule);
}

/**
 * Fetch a single model_schedule by its UUID.
 */
/** @param {string} scheduleId */
export async function fetchModelSchedule(scheduleId) {
  const { data, error } = await supabase
    .from('model_schedules')
    .select('id, model_id, name, description, schedule_json, is_default, created_at, updated_at, created_by')
    .eq('id', scheduleId)
    .single();
  if (error) throw error;
  return normSchedule(data);
}

/**
 * Build a schedulesMap keyed by schedule id from an array of schedule rows.
 *
 * For each schedule entry, two kinds of key are written:
 *   "<scheduleId>"              — first entry only, for single-event backward compat
 *   "<scheduleId>:<eventId>"    — one per event entry, for multi-event schedules
 *
 * resolveInlineSchedules() prefers the compound key when available so that each
 * bEvent gets its own rows rather than sharing the first stream's rows.
 */
/** @param {Record<string, any>[]} scheduleRows */
export function buildSchedulesMap(scheduleRows) {
  /** @type {Record<string, any>} */
  const map = {};
  for (const sched of scheduleRows) {
    const entries = Array.isArray(sched.scheduleJson) ? sched.scheduleJson : [];
    for (const entry of entries) {
      // Compound key: used by resolveInlineSchedules for multi-event schedules
      if (entry.eventId) {
        map[`${sched.id}:${entry.eventId}`] = { eventId: entry.eventId, rows: entry.rows ?? [] };
      }
      // Plain key: kept for single-event backward compatibility (first entry wins)
      if (!map[sched.id]) {
        map[sched.id] = { eventId: entry.eventId, rows: entry.rows ?? [] };
      }
    }
    if (!map[sched.id]) {
      map[sched.id] = { eventId: null, rows: [] };
    }
  }
  return map;
}

/**
 * Save (insert or update) a model_schedule row.
 *
 * @param {Record<string, any>} schedule  Object with: id? (omit for insert), modelId, name, description?, scheduleJson, isDefault?
 * @param {string} userId    Authenticated user id (set as created_by on insert)
 * @returns {Promise<Record<string, any>>} Normalised schedule row
 */
export async function saveModelSchedule(schedule, userId) {
  const payload = {
    model_id:      schedule.modelId,
    name:          schedule.name,
    description:   schedule.description ?? null,
    schedule_json: schedule.scheduleJson ?? [],
    is_default:    schedule.isDefault    ?? false,
    created_by:    userId,
  };

  // No .single() here — see saveModel's comment: an editor-role update RLS
  // filters out affects zero rows with no Postgres error, and .single()
  // would surface that as a raw PGRST116 coercion error instead of the
  // clear message thrown below.
  let result;
  if (schedule.id) {
    result = await supabase
      .from('model_schedules')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', schedule.id)
      .select();
  } else {
    result = await supabase
      .from('model_schedules')
      .insert(payload)
      .select();
  }
  if (result.error) throw result.error;
  if (!result.data || result.data.length === 0) {
    throw new Error("You don't have permission to edit this schedule, or it no longer exists.");
  }
  return normSchedule(result.data[0]);
}

/**
 * Delete a model_schedule row by id.
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
 */
/**
 * @param {string} scheduleId
 * @param {string} userId
 */
export async function deleteModelSchedule(scheduleId, userId) {
  // RLS enforces ownership — we still pass userId for belt-and-braces.
  const { data, error } = await supabase
    .from('model_schedules')
    .delete()
    .eq('id', scheduleId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Schedule not found or you do not have permission to delete it.' };
  }
  return { ok: true };
}

/**
 * Set a schedule as the default for its model.
 * Clears the is_default flag on all other schedules for the same model, then
 * sets it on the target schedule. Uses two separate updates (Supabase does not
 * support conditional multi-row updates in a single call).
 */
/**
 * @param {string} scheduleId
 * @param {string} modelId
 */
export async function setDefaultSchedule(scheduleId, modelId) {
  // Clear existing default
  const { error: clearErr } = await supabase
    .from('model_schedules')
    .update({ is_default: false })
    .eq('model_id', modelId)
    .eq('is_default', true);
  if (clearErr) throw clearErr;

  // Set new default
  const { error: setErr } = await supabase
    .from('model_schedules')
    .update({ is_default: true })
    .eq('id', scheduleId);
  if (setErr) throw setErr;
}

/**
 * Extract timetable rows from a model's bEvents and save them as a named schedule.
 * Used by Phase 2 migration: takes a model with inline rows[] and creates a
 * model_schedules row for them, then returns updated bEvents with scheduleRef set.
 *
 * @param {Record<string, any>} model     Full model object with bEvents
 * @param {string} userId    Authenticated user id
 * @param {string} [name]    Schedule name (default: "Default Schedule")
 * @returns {Promise<{ savedSchedule: Record<string, any>|null, updatedBEvents: any[] }>} The saved schedule and bEvents with scheduleRef
 */
export async function extractInlineSchedule(model, userId, name = 'Default Schedule') {
  if (!model.id) throw new Error('extractInlineSchedule: model must have an id');

  // Collect all bEvent schedule entries that have rows[]
  /** @type {Array<{eventId: any, rows: any}>} */
  const scheduleJson = [];
  const updatedBEvents = (model.bEvents || []).map((/** @type {any} */ be) => {
    const updatedSchedules = (be.schedules || []).map((/** @type {any} */ s) => {
      if (!Array.isArray(s.rows) || s.rows.length === 0) return s;
      // This entry has inline rows — add to scheduleJson
      scheduleJson.push({ eventId: s.eventId ?? be.id, rows: s.rows });
      // Return without rows[] — scheduleRef will be set after save
      return { ...s, rows: [] };
    });
    return { ...be, schedules: updatedSchedules };
  });

  if (scheduleJson.length === 0) {
    // No inline rows found — nothing to extract
    return { savedSchedule: null, updatedBEvents: model.bEvents };
  }

  // Save the schedule
  const savedSchedule = await saveModelSchedule({
    modelId:      model.id,
    name,
    scheduleJson,
    isDefault:    true,
  }, userId);

  // Patch bEvents with scheduleRef pointing to the saved schedule
  const patchedBEvents = updatedBEvents.map((/** @type {any} */ be) => ({
    ...be,
    schedules: (be.schedules || []).map((/** @type {any} */ s) => {
      // Match back: if this entry's eventId was extracted, add scheduleRef
      const wasExtracted = scheduleJson.some(e => e.eventId === (s.eventId ?? be.id));
      if (wasExtracted && !s.scheduleRef) {
        return { ...s, scheduleRef: savedSchedule.id };
      }
      return s;
    }),
  }));

  return { savedSchedule, updatedBEvents: patchedBEvents };
}

// ── Dev-only schema probe ─────────────────────────────────────────────────────

/**
 * validateDbSchema — dev-only startup probe.
 *
 * Issues a lightweight SELECT against des_models to confirm all EXPECTED_COLUMNS
 * exist. Only runs when NODE_ENV === 'development'. Never throws — logs diagnostics
 * to console.error so developers see schema drift immediately without crashing the app.
 *
 * Call once from App.jsx useEffect on mount.
 */
export async function validateDbSchema() {
  if (process.env.NODE_ENV !== 'development') return;

  const { error } = await supabase
    .from('des_models')
    .select(EXPECTED_COLUMNS.join(','))
    .limit(0);

  if (error) {
    console.error(
      '[flow] validateDbSchema: des_models schema mismatch detected.\n' +
      'Expected columns: ' + EXPECTED_COLUMNS.join(', ') + '\n' +
      'Error: ' + (error.message || JSON.stringify(error)) + '\n' +
      'Run the latest Supabase migration or update EXPECTED_COLUMNS in src/db/models.js.'
    );
  }
}

