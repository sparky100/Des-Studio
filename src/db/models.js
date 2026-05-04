// db/models.js — All Supabase database operations
//
// All functions are async and throw on error.
// The norm() function translates snake_case Supabase rows → camelCase model objects.

import { supabase } from "./supabase.js";

// ── Row normalisation ─────────────────────────────────────────────────────────
export function norm(r) {
  return {
    id:             r.id,
    name:           r.name,
    description:    r.description || "",
    visibility:     r.visibility,
    access:         r.access      || {},
    entityTypes:    r.entity_types     || [],
    stateVariables: r.state_variables  || [],
    bEvents:        r.b_events         || [],
    cEvents:        r.c_events         || [],
    queues:         r.queues           || [],
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
    owner_id:        userId,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function fetchModels(userId) {
  let query = supabase.from("des_models").select("*");
  if (userId) {
    query = query.or(`owner_id.eq.${userId},visibility.eq.public,access->${userId}.is.not.null`);
  } else {
    query = query.eq("visibility", "public");
  }
  
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
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
  return data || [];
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

export async function deleteModel(id) {
  const { error } = await supabase.from("des_models").delete().eq("id", id);
  if (error) throw error;
}

export async function setVisibility(id, visibility) {
  const { error } = await supabase
    .from("des_models")
    .update({ visibility })
    .eq("id", id);
  if (error) throw error;
}

export async function setAccess(id, access) {
  const { error } = await supabase
    .from("des_models")
    .update({ access })
    .eq("id", id);
  if (error) throw error;
}

// ── Simulation run history ────────────────────────────────────────────────────

export async function saveSimulationRun(modelId, userId, result, config = {}) {
  const s = result.summary || {};
  const { error } = await supabase.from("simulation_runs").insert({
    model_id:            modelId,
    run_by:              userId,
    replications:        config.replications || 1,
    max_simulation_time: config.maxTime      || 500,
    warmup_period:       config.warmupPeriod || null,
    seed:                config.seed         || null,
    total_arrived:       s.total    || 0,
    total_served:        s.served   || 0,
    total_reneged:       s.reneged  || 0,
    avg_wait_time:       s.avgWait  ?? null,
    avg_service_time:    s.avgSojourn ?? null,
    renege_rate:         s.total ? (s.reneged / s.total) : 0,
    results_json:        { summary: s, clock: result.snap?.clock },
    duration_ms:         config.durationMs || null,
  });
  if (error) throw error;
}

export async function fetchRunHistory(modelId) {
  const { data, error } = await supabase
    .from("simulation_runs")
    .select("id, ran_at, total_arrived, total_served, total_reneged, avg_wait_time, avg_service_time, renege_rate, duration_ms, replications, results_json, warmup_period")
    .eq("model_id", modelId)
    .order("ran_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  if (data && data.length > 0 && data[0].warmup_period === undefined) {
    console.warn(
      "Supabase simulation_runs table missing warmup_period column. " +
      "Run: ALTER TABLE simulation_runs ADD COLUMN IF NOT EXISTS warmup_period REAL;"
    );
  }
  return data || [];
}

export async function forkModel(sourceModelId, newUserId, newName = "") {
  // 1. Fetch the original model
  const { data: sourceModel, error: fetchError } = await supabase
    .from("des_models")
    .select("*")
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

