// db/models.js — All Supabase database operations
//
// All functions are async and throw on error.
// The norm() function translates snake_case Supabase rows → camelCase model objects.

import { supabase } from "./supabase.js";

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

// ── Row normalisation ─────────────────────────────────────────────────────────
export function norm(r) {
  return {
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
    goals:          r.goals            || [],
    owner_id:       r.owner_id,
    owner:          r.owner_id,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
  };
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
    owner_id:        userId,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function fetchModels(userId) {
  let data;
  if (userId) {
    const sort = { ascending: false };
    const [visible, sharedViewer, sharedEditor] = await Promise.all([
      supabase
        .from("des_models")
        .select("id,name,description,tags,visibility,access,entity_types,state_variables,b_events,c_events,queues,goals,owner_id,created_at,updated_at")
        .or(`owner_id.eq.${userId},visibility.eq.public`)
        .order("updated_at", sort),
      supabase
        .from("des_models")
        .select("id,name,description,tags,visibility,access,entity_types,state_variables,b_events,c_events,queues,goals,owner_id,created_at,updated_at")
        .contains("access", { [userId]: "viewer" })
        .order("updated_at", sort),
      supabase
        .from("des_models")
        .select("id,name,description,tags,visibility,access,entity_types,state_variables,b_events,c_events,queues,goals,owner_id,created_at,updated_at")
        .contains("access", { [userId]: "editor" })
        .order("updated_at", sort),
    ]);

    const error = visible.error || sharedViewer.error || sharedEditor.error;
    if (error) throw error;

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
    const { data: publicData, error } = await supabase
      .from("des_models")
      .select("id,name,description,tags,visibility,access,entity_types,state_variables,b_events,c_events,queues,goals,owner_id,created_at,updated_at")
      .eq("visibility", "public")
      .order("updated_at", { ascending: false });
    if (error) throw error;
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
    .select("id, full_name, initials, color, role");
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
  if (model.id) {
    const { data, error } = await supabase
      .from("des_models")
      .update(row)
      .eq("id", model.id)
      .select()
      .single();
    if (error) throw error;
    return norm(data);
  } else {
    const { data, error } = await supabase
      .from("des_models")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return norm(data);
  }
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
  const resultsJson = config.resultsJson ? { ...config.resultsJson } : {
    summary: s,
    clock: result.snap?.clock,
  };
  if (!resultsJson.summary) {
    resultsJson.summary = s;
  }
  if (config.batchId) {
    resultsJson.batch_id = config.batchId;
  }
  if (config.aggregateStats) {
    resultsJson.aggregateStats = config.aggregateStats;
  }
  if (config.replicationResults) {
    resultsJson.replications = config.replicationResults;
  }
  const runLabel = typeof config.runLabel === "string" ? config.runLabel.trim() : "";
  if (runLabel) {
    resultsJson.runLabel = runLabel;
  }

  const { data, error } = await supabase.from("simulation_runs").insert({
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
  }).select("id").single();
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

export function normalizeRunHistoryRow(row = {}) {
  return {
    ...row,
    avg_service_time: row.avg_service_time ?? row.results_json?.summary?.avgSvc ?? null,
    run_label: row.results_json?.runLabel || row.results_json?.run_label || "",
    ai_insights: row.ai_insights || null,
  };
}

export async function fetchRunHistory(modelId) {
  const { data, error } = await supabase
    .from("simulation_runs")
    .select("id, ran_at, total_arrived, total_served, total_reneged, avg_wait_time, avg_service_time, renege_rate, duration_ms, replications, seed, max_simulation_time, results_json, warmup_period, ai_insights")
    .eq("model_id", modelId)
    .order("ran_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []).map(normalizeRunHistoryRow);
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

export async function forkModel(sourceModelId, newUserId, newName = "") {
  // 1. Fetch the original model — must be owned by or accessible to the user
  const { data: sourceModel, error: fetchError } = await supabase
    .from("des_models")
    .select("id,name,description,tags,visibility,access,entity_types,state_variables,b_events,c_events,queues,goals,owner_id,created_at,updated_at")
    .or(`owner_id.eq.${newUserId},visibility.eq.public`)
    .eq("id", sourceModelId)
    .single();
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
      config: {
        pinnedWidgets: config.pinnedWidgets || [],
        title: config.title || "",
      },
    })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, token: data.token, createdAt: data.created_at };
}

export async function getShareLink(token) {
  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("id, run_id, config, created_at, revoked_at")
    .eq("token", token)
    .single();
  if (linkError) throw linkError;
  if (!link) throw new Error("Share link not found.");
  if (link.revoked_at) throw new Error("This share link has been revoked.");

  const { data: run, error: runError } = await supabase
    .from("simulation_runs")
    .select("id, model_id, ran_at, replications, seed, total_arrived, total_served, total_reneged, avg_wait_time, avg_service_time, max_simulation_time, warmup_period, results_json, ai_insights")
    .eq("id", link.run_id)
    .single();
  if (runError) throw runError;
  if (!run) throw new Error("Run not found.");

  const { data: model, error: modelError } = await supabase
    .from("des_models")
    .select("name, entity_types, queues, model_json")
    .eq("id", run.model_id)
    .single();
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
    .select("id, token, config, created_at, revoked_at")
    .in("run_id", runIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(link => ({
    id: link.id,
    token: link.token,
    config: link.config,
    createdAt: link.created_at,
    revokedAt: link.revoked_at,
    isActive: !link.revoked_at,
  }));
}

