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
    owner_id:        userId,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function fetchModels() {
  const { data, error } = await supabase
    .from("des_models")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
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

// ── Simulation run history (future: save results) ─────────────────────────────
export async function saveSimulationRun(modelId, userId, result, config = {}) {
  const { error } = await supabase.from("simulation_runs").insert({
    model_id:            modelId,
    run_by:              userId,
    replications:        config.replications || 1,
    max_simulation_time: config.maxTime      || 500,
    seed:                config.seed         || null,
    total_arrived:       result.summary?.total    || 0,
    total_served:        result.summary?.served   || 0,
    total_reneged:       result.summary?.reneged  || 0,
    avg_wait_time:       result.summary?.avgWait  || null,
    avg_service_time:    result.summary?.avgSvc   || null,
    renege_rate:         result.summary?.total
      ? (result.summary.reneged / result.summary.total)
      : 0,
    results_json:        result,
  });
  if (error) throw error;
}

