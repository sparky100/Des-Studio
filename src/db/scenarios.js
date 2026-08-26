// @ts-check
// db/scenarios.js — Named-scenario CRUD (F-9: named-scenario manager)
//
// A scenario is a lightweight, named set of parameter deltas against an
// existing model (see src/engine/sweep-params.js — enumerateSweepableParams
// finds what's variable, applySweepValues applies a scenario's deltas onto
// a cloned model). Running a scenario for comparison happens in-memory on
// demand (src/ui/ScenarioManagerPanel.jsx) — this module only persists the
// named definition, not run results.
//
// All functions are async and throw on error, matching db/models.js.

import { supabase } from "./supabase.js";

/**
 * @param {string} modelId
 * @param {string} userId
 * @param {{ name: string, description?: string, paramDeltas: Array<{paramConfig: Record<string, any>, value: number}>, baseSeed?: number|null, replications?: number }} scenario
 */
export async function createScenario(modelId, userId, scenario) {
  const { data, error } = await supabase
    .from("scenarios")
    .insert({
      model_id: modelId,
      created_by: userId,
      name: scenario.name.trim(),
      description: scenario.description?.trim() || "",
      param_deltas: scenario.paramDeltas,
      base_seed: scenario.baseSeed ?? null,
      replications: Math.max(1, Number.parseInt(String(scenario.replications ?? 1), 10) || 1),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id;
}

/** @param {string} modelId */
export async function listScenarios(modelId) {
  const { data, error } = await supabase
    .from("scenarios")
    .select("*")
    .eq("model_id", modelId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** @param {string} scenarioId */
export async function deleteScenario(scenarioId) {
  const { error } = await supabase.from("scenarios").delete().eq("id", scenarioId);
  if (error) throw error;
}
