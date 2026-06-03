// LocalStorage CRUD backend for anonymous/local mode.
// Mirrors the models.js API shape so callers can swap backends.
import { normalizeModelConditions } from "../model/conditionFormat.js";
import { buildPersistedResultsJson } from "./results-persistence.js";

const STORAGE_KEY = "simmodlr_models";
const RUNS_KEY = "simmodlr_runs";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function writeAll(models) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
}

function genId() {
  return "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

export function fetchLocalModels() {
  return readAll().map(model => normalizeModelConditions(model));
}

export function saveLocalModel(model) {
  const normalizedModel = normalizeModelConditions(model);
  const models = readAll();
  const idx = models.findIndex(m => m.id === normalizedModel.id);
  const now = new Date().toISOString();
  if (idx >= 0) {
    models[idx] = { ...models[idx], ...normalizedModel, updatedAt: now };
    writeAll(models);
    return models[idx];
  }
  const saved = { ...normalizedModel, id: genId(), createdAt: now, updatedAt: now };
  writeAll([...models, saved]);
  return saved;
}

export function deleteLocalModel(id) {
  const models = readAll().filter(m => m.id !== id);
  writeAll(models);
  // Also clean up runs
  const runs = readLocalRuns();
  delete runs[id];
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
}

// Run history (per-model)
function readLocalRuns() {
  try {
    return JSON.parse(localStorage.getItem(RUNS_KEY) || "{}");
  } catch { return {}; }
}

function buildLocalResultsJson(result, config = {}) {
  return buildPersistedResultsJson(result, config);
}

function preferSummaryValue(primary, summaryValue) {
  if (summaryValue == null) return primary ?? null;
  if (primary == null) return summaryValue;
  if (primary === 0 && summaryValue !== 0) return summaryValue;
  return primary;
}

function normalizeLocalRunRow(row = {}) {
  const resultsJson = row.results_json || row.resultsJson || buildLocalResultsJson(row, {
    runLabel: row.runLabel || row.run_label || "",
  });
  const summary = resultsJson.summary || row.summary || {};
  const total = preferSummaryValue(row.total_arrived, summary.total) ?? 0;
  const served = preferSummaryValue(row.total_served, summary.served) ?? 0;
  const reneged = preferSummaryValue(row.total_reneged, summary.reneged) ?? 0;
  const ranAt = row.ran_at || row.createdAt || row.created_at || new Date().toISOString();
  const replications = row.replications || 1;

  return {
    id: row.id || genId(),
    ran_at: ranAt,
    createdAt: ranAt,
    seed: row.seed ?? null,
    replications,
    warmup_period: row.warmup_period ?? row.warmupPeriod ?? null,
    max_simulation_time: row.max_simulation_time ?? row.maxSimTime ?? null,
    total_arrived: total,
    total_served: served,
    total_reneged: reneged,
    avg_wait_time: preferSummaryValue(row.avg_wait_time, summary.avgWait),
    avg_service_time: preferSummaryValue(row.avg_service_time, summary.avgSvc),
    renege_rate: total ? (reneged / total) : 0,
    duration_ms: row.duration_ms ?? row.durationMs ?? null,
    run_label: row.run_label || row.runLabel || "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    archived: !!row.archived,
    ai_insights: row.ai_insights || null,
    version_id: row.version_id || row.versionId || null,
    results_json: resultsJson,
  };
}

export function saveLocalRun(modelId, result, config) {
  const allRuns = readLocalRuns();
  if (!allRuns[modelId]) allRuns[modelId] = [];
  const summary = result?.summary || {};
  allRuns[modelId].push(normalizeLocalRunRow({
    id: genId(),
    ran_at: new Date().toISOString(),
    seed: config?.seed ?? null,
    replications: config?.replications || 1,
    warmup_period: config?.warmupPeriod ?? null,
    max_simulation_time: config?.maxTime ?? null,
    total_arrived: summary.total ?? 0,
    total_served: summary.served ?? 0,
    total_reneged: summary.reneged ?? 0,
    avg_wait_time: summary.avgWait ?? null,
    avg_service_time: summary.avgSvc ?? null,
    duration_ms: config?.durationMs ?? null,
    run_label: config?.runLabel || "",
    version_id: config?.versionId || null,
    results_json: buildLocalResultsJson(result, config),
  }));
  // Keep last 50 runs per model
  if (allRuns[modelId].length > 50) allRuns[modelId] = allRuns[modelId].slice(-50);
  localStorage.setItem(RUNS_KEY, JSON.stringify(allRuns));
}

export function fetchLocalRunHistory(modelId) {
  const allRuns = readLocalRuns();
  return (allRuns[modelId] || [])
    .map(normalizeLocalRunRow)
    .sort((a, b) => new Date(b.ran_at).getTime() - new Date(a.ran_at).getTime());
}

// Sweep storage (localStorage)
const SWEEPS_KEY = "simmodlr_sweeps";

function readLocalSweeps() {
  try { return JSON.parse(localStorage.getItem(SWEEPS_KEY) || "{}"); }
  catch { return {}; }
}

export function saveLocalSweep(modelId, config, results) {
  const allSweeps = readLocalSweeps();
  if (!allSweeps[modelId]) allSweeps[modelId] = [];
  allSweeps[modelId].push({
    id: genId(),
    createdAt: new Date().toISOString(),
    config,
    results,
  });
  if (allSweeps[modelId].length > 20) allSweeps[modelId] = allSweeps[modelId].slice(-20);
  localStorage.setItem(SWEEPS_KEY, JSON.stringify(allSweeps));
}

export function fetchLocalSweeps(modelId) {
  const allSweeps = readLocalSweeps();
  return allSweeps[modelId] || [];
}

/**
 * No-op stub — feedback submission requires Supabase.
 * Provided so callers can import from either backend without branching.
 */
// eslint-disable-next-line no-unused-vars
export async function submitFeedback(_params) {
  // Local mode: silently discard feedback (no Supabase connection available)
}
