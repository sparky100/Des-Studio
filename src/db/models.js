/*
 * MIGRATION REQUIRED IN SUPABASE:
 * Run this SQL in Supabase SQL Editor if not already done:
 * ALTER TABLE des_models ADD COLUMN IF NOT EXISTS queues jsonb NOT NULL DEFAULT '[]'::jsonb;
 */

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
    queues:         r.queues           || [],
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
    queues:          model.queues         || [],
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

// ── Simulation run history ────────────────────────────────────────────────────

export async function saveSimulationRun(modelId, userId, result, config = {}) {
  const s = result.summary || {};
  const { error } = await supabase.from("simulation_runs").insert({
    model_id:            modelId,
    run_by:              userId,
    replications:        config.replications || 1,
    max_simulation_time: config.maxTime      || 500,
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
    .select("id, ran_at, total_arrived, total_served, total_reneged, avg_wait_time, avg_service_time, renege_rate, duration_ms, replications, results_json")
    .eq("model_id", modelId)
    .order("ran_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data || [];
}

