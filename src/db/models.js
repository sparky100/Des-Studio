// db/models.js — All Supabase database operations
//
// All functions are async and throw on error.
// The norm() function translates snake_case Supabase rows → camelCase model objects.

import { supabase } from "./supabase.js";
import { normalizeModelConditions } from "../model/conditionFormat.js";
import { buildPersistedResultsJson } from "./results-persistence.js";

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

export function normalizeProfileRole(role) {
  return PLATFORM_ROLES.has(role) ? role : "user";
}

export function normalizeProfile(profile = {}) {
  const role = normalizeProfileRole(profile.role);
  return {
    ...profile,
    role,
    isAdmin: role === "admin",
    suspended: profile.suspended ?? false,
  };
}

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

function errorText(error) {
  return [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
}

function isSchemaCompatibilityError(error) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  if (error.status === 400) return true;
  const text = errorText(error);
  return text.includes("column") || text.includes("select") || text.includes("schema");
}

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
      throw new Error(`simmodlr schema mismatch: ${result.error.message}`);
    }
    console.warn('[DB] schema fallback triggered — missing column or schema mismatch:', result.error?.message || result.error);
    desModelsSelectModeIndex = Math.min(i + 1, DES_MODELS_SELECTS.length - 1);
  }
  throw lastError;
}

// ── Row normalisation ─────────────────────────────────────────────────────────
export function norm(r) {
  const modelJson = r.model_json || {};
  return normalizeModelConditions({
    id:             r.id,
    name:           r.name,
    description:    r.description || "",
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
    timeUnit:       modelJson.timeUnit ?? 'minutes',
    epoch:          modelJson.epoch ?? null,
    dataSources:    modelJson.dataSources ?? [],
    owner_id:       r.owner_id,
    owner:          r.owner_id,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
    latestVersion:  r.latest_version || 0,
    parentModelId:  r.parent_model_id || null,
  });
}

function modelJsonFromModel(model = {}) {
  const json = {
    schemaVersion:        model.schemaVersion ?? 1,
    entityTypes:          model.entityTypes || [],
    stateVariables:       model.stateVariables || [],
    bEvents:              model.bEvents || [],
    cEvents:              model.cEvents || [],
    queues:               model.queues || [],
    graph:                model.graph || null,
    experimentDefaults:   model.experimentDefaults || {},
    goals:                model.goals || [],
    timeUnit:             model.timeUnit || 'minutes',
    epoch:                model.epoch || null,
  };
  if (model.dataSources?.length) json.dataSources = model.dataSources;
  return json;
}

// ── Model to row (for save/update) ────────────────────────────────────────────
function toRow(model, userId) {
  return {
    name:            model.name,
    description:     model.description    || "",
    visibility:      model.visibility     || "private",
    access:          model.access         || {},
    entity_types:    model.entityTypes    || [],
    state_variables: model.stateVariables || [],
    b_events:        model.bEvents        || [],
    c_events:        model.cEvents        || [],
    queues:          model.queues         || [],
    goals:           model.goals          || [],
    model_json:      modelJsonFromModel(model),
    owner_id:        userId,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

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

export async function saveModel(model, userId) {
  const row = toRow(model, userId);
  const persist = async (payload) => {
    if (model.id) {
      return supabase
        .from("des_models")
        .update(payload)
        .eq("id", model.id)
        .select()
        .single();
    }
    return supabase
      .from("des_models")
      .insert(payload)
      .select()
      .single();
  };

  const initialRow = desModelsSelectModeIndex === 0 ? row : (() => {
    const { model_json, ...legacyRow } = row;
    return legacyRow;
  })();

  let result = await persist(initialRow);
  if (result.error && isSchemaCompatibilityError(result.error) && errorText(result.error).includes("model_json")) {
    if (process.env.NODE_ENV === 'development') {
      throw new Error(`simmodlr schema mismatch: ${result.error.message}`);
    }
    console.warn('[DB] model_json column missing — falling back to legacy save (dataSources will not be persisted):', result.error?.message || result.error);
    desModelsSelectModeIndex = Math.min(1, DES_MODELS_SELECTS.length - 1);
    const { model_json, ...legacyRow } = row;
    result = await persist(legacyRow);
  }
  if (result.error) throw result.error;
  return norm(result.data);
}

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

export async function setVisibility(id, visibility, userId) {
  const { error } = await supabase
    .from("des_models")
    .update({ visibility })
    .eq("id", id)
    .eq("owner_id", userId);
  if (error) throw error;
}

export async function setAccess(id, access, userId) {
  const { error } = await supabase
    .from("des_models")
    .update({ access })
    .eq("id", id)
    .eq("owner_id", userId);
  if (error) throw error;
}

// ── Simulation run history ────────────────────────────────────────────────────

export async function saveSimulationRun(modelId, userId, result, config = {}) {
  const s = result.summary || {};
  const runLabel = typeof config.runLabel === "string" ? config.runLabel.trim() : "";
  const resultsJson = buildPersistedResultsJson(result, config);

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

export async function saveAiInsights(runId, insights) {
  const { error } = await supabase
    .from("simulation_runs")
    .update({ ai_insights: insights })
    .eq("id", runId);
  if (error) throw error;
  return { ok: true };
}

function preferSummaryValue(primary, summaryValue) {
  if (summaryValue == null) return primary ?? null;
  if (primary == null) return summaryValue;
  if (primary === 0 && summaryValue !== 0) return summaryValue;
  return primary;
}

export function normalizeRunHistoryRow(row = {}) {
  const summary = row.results_json?.summary || {};
  const totalArrived = preferSummaryValue(row.total_arrived, summary.total) ?? 0;
  const totalServed = preferSummaryValue(row.total_served, summary.served) ?? 0;
  const totalReneged = preferSummaryValue(row.total_reneged, summary.reneged) ?? 0;
  const avgWaitTime = preferSummaryValue(row.avg_wait_time, summary.avgWait);
  const avgServiceTime = preferSummaryValue(row.avg_service_time, summary.avgSvc);
  return {
    ...row,
    total_arrived: totalArrived,
    total_served: totalServed,
    total_reneged: totalReneged,
    avg_wait_time: avgWaitTime,
    avg_service_time: avgServiceTime,
    renege_rate: totalArrived ? (totalReneged / totalArrived) : (row.renege_rate ?? 0),
    // Prefer real column; fall back to JSON for legacy rows
    run_label: row.run_label || row.results_json?.runLabel || row.results_json?.run_label || "",
    tags: row.tags || [],
    archived: row.archived || false,
    ai_insights: row.ai_insights || null,
  };
}

export async function fetchRunHistory(modelId, filters = {}) {
  const { search, tags, archived = false } = filters;
  let query = supabase
    .from("simulation_runs")
    .select("id, ran_at, total_arrived, total_served, total_reneged, avg_wait_time, avg_service_time, renege_rate, duration_ms, replications, seed, max_simulation_time, results_json, warmup_period, ai_insights, run_label, tags, archived, version_id, model_versions(version, name)")
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

export async function updateRunLabel(runId, userId, label) {
  const { error } = await supabase
    .from("simulation_runs")
    .update({ run_label: label || null })
    .eq("id", runId)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

export async function updateRunTags(runId, userId, tags) {
  const { error } = await supabase
    .from("simulation_runs")
    .update({ tags: Array.isArray(tags) ? tags : [] })
    .eq("id", runId)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

export async function archiveRun(runId, userId) {
  const { error } = await supabase
    .from("simulation_runs")
    .update({ archived: true })
    .eq("id", runId)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

export async function unarchiveRun(runId, userId) {
  const { error } = await supabase
    .from("simulation_runs")
    .update({ archived: false })
    .eq("id", runId)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

export async function getRun(runId) {
  const { data, error } = await supabase
    .from('simulation_runs')
    .select('id, results_json, max_simulation_time, warmup_period, replications, seed, ran_at, version_id, model_versions(id, version, name, model_json)')
    .eq('id', runId)
    .single();
  if (error) throw error;
  const rj = data.results_json || {};
  // Prefer embedded snapshot (set only for "full" detail-level saves).
  // Fall back to the model_json from the linked model version when the run
  // recorded a version_id — this gives reproduce/diff full fidelity without
  // requiring the full model to be embedded in every results row.
  const mv = data.model_versions ?? null;
  return {
    id:             data.id,
    model_snapshot: rj._model_snapshot  ?? null,
    version_model:  mv?.model_json      ?? null,
    version_id:     data.version_id     ?? null,
    version_number: mv?.version         ?? null,
    version_name:   mv?.name            ?? null,
    base_seed:      rj._base_seed       ?? data.seed ?? null,
    engine_version: rj._engine_version  ?? null,
    experiment_config: rj._experiment_config ?? {
      maxSimTime:           data.max_simulation_time ?? 500,
      warmupPeriod:         data.warmup_period       ?? 0,
      replications:         data.replications        ?? 1,
      seed:                 rj._base_seed ?? data.seed ?? null,
      terminationMode:      'time',
      terminationCondition: null,
    },
    summary: rj.summary ?? null,
    results_json: rj,
  };
}

export async function deleteSimulationRun(runId, userId) {
  const { error } = await supabase
    .from("simulation_runs")
    .delete()
    .eq("id", runId)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

export async function fetchRunStatsForModels(modelIds = [], userId) {
  const ids = Array.from(new Set(modelIds.filter(Boolean)));
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

export async function createShareLink(runId, userId, config = {}) {
  const token = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  supabase.rpc("increment_share_view", { p_token: token }).then(() => {}).catch(() => {});

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

export async function revokeShareLink(id, userId) {
  const { data, error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("created_by", userId)
    .select("id")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Share link not found or you do not own it.");
  return { ok: true };
}

export async function saveSweep(modelId, userId, config, results) {
  const { data, error } = await supabase
    .from("sweeps")
    .insert({
      model_id: modelId,
      run_by: userId,
      config,
      results,
    })
    .select("id, config, results, created_at")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    config: data.config,
    results: data.results,
    createdAt: data.created_at,
  };
}

export async function getSweep(id) {
  const { data, error } = await supabase
    .from("sweeps")
    .select("id, model_id, config, results, created_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return {
    id: data.id,
    modelId: data.model_id,
    config: data.config,
    results: data.results,
    createdAt: data.created_at,
  };
}

export async function listSweeps(modelId) {
  const { data, error } = await supabase
    .from("sweeps")
    .select("id, config, results, created_at")
    .eq("model_id", modelId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(s => ({
    id: s.id,
    config: s.config,
    results: s.results,
    createdAt: s.created_at,
  }));
}

export async function deleteSweep(id, userId) {
  const { error } = await supabase
    .from("sweeps")
    .delete()
    .eq("id", id)
    .eq("run_by", userId);
  if (error) throw error;
  return { ok: true };
}

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

export async function getPlatformConfig(key) {
  const { data, error } = await supabase
    .from("platform_config")
    .select("value")
    .eq("key", key)
    .single();
  if (error && error.code !== "PGRST116") throw error; // PGRST116 = not found
  return data?.value ?? null;
}

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

export async function updateUserRole(userId, role) {
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw error;
  return { ok: true };
}

export async function suspendUser(userId) {
  const { error } = await supabase
    .from("profiles")
    .update({ suspended: true, suspended_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
  return { ok: true };
}

export async function unsuspendUser(userId) {
  const { error } = await supabase
    .from("profiles")
    .update({ suspended: false, suspended_at: null })
    .eq("id", userId);
  if (error) throw error;
  return { ok: true };
}

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

function normalizeExperiment(row = {}) {
  return {
    id: row.id,
    modelId: row.model_id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? null,
    config: row.config ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchExperiments(modelId) {
  const { data, error } = await supabase
    .from("experiments")
    .select("*")
    .eq("model_id", modelId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeExperiment);
}

export async function saveExperiment({ modelId, userId, name, description, config }) {
  const { data, error } = await supabase
    .from("experiments")
    .insert({ model_id: modelId, user_id: userId, name, description: description || null, config })
    .select()
    .single();
  if (error) throw error;
  return normalizeExperiment(data);
}

export async function updateExperiment(id, { name, description, config }) {
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

export async function deleteExperiment(id) {
  const { error } = await supabase
    .from("experiments")
    .delete()
    .eq("id", id);
  if (error) throw error;
  return { ok: true };
}

// ── Model Versions ────────────────────────────────────────────────────────────

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

export async function listVersions(modelId) {
  const { data, error } = await supabase
    .from("model_versions")
    .select("*")
    .eq("model_id", modelId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeVersion);
}

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
 * @returns {Promise<Array<{id,createdAt,userId,accountEmail,replyEmail,category,message,appVersion,pageContext,status}>>}
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
  return (data || []).map(row => ({
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
  return (data || []).map(row => ({ day: row.day, count: Number(row.count) }));
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
export function buildSchedulesMap(scheduleRows) {
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
 * @param {object} schedule  Object with: id? (omit for insert), modelId, name, description?, scheduleJson, isDefault?
 * @param {string} userId    Authenticated user id (set as created_by on insert)
 * @returns {object} Normalised schedule row
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

  let result;
  if (schedule.id) {
    result = await supabase
      .from('model_schedules')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', schedule.id)
      .select()
      .single();
  } else {
    result = await supabase
      .from('model_schedules')
      .insert(payload)
      .select()
      .single();
  }
  if (result.error) throw result.error;
  return normSchedule(result.data);
}

/**
 * Delete a model_schedule row by id.
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
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
 * @param {object} model     Full model object with bEvents
 * @param {string} userId    Authenticated user id
 * @param {string} [name]    Schedule name (default: "Default Schedule")
 * @returns {{ savedSchedule, updatedBEvents }} The saved schedule and bEvents with scheduleRef
 */
export async function extractInlineSchedule(model, userId, name = 'Default Schedule') {
  if (!model.id) throw new Error('extractInlineSchedule: model must have an id');

  // Collect all bEvent schedule entries that have rows[]
  const scheduleJson = [];
  const updatedBEvents = (model.bEvents || []).map(be => {
    const updatedSchedules = (be.schedules || []).map(s => {
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
  const patchedBEvents = updatedBEvents.map(be => ({
    ...be,
    schedules: (be.schedules || []).map(s => {
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
      '[simmodlr] validateDbSchema: des_models schema mismatch detected.\n' +
      'Expected columns: ' + EXPECTED_COLUMNS.join(', ') + '\n' +
      'Error: ' + (error.message || JSON.stringify(error)) + '\n' +
      'Run the latest Supabase migration or update EXPECTED_COLUMNS in src/db/models.js.'
    );
  }
}

