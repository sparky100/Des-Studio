// LocalStorage CRUD backend for anonymous/local mode.
// Mirrors the models.js API shape so callers can swap backends.

const STORAGE_KEY = "des_studio_models";
const RUNS_KEY = "des_studio_runs";

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
  return readAll();
}

export function saveLocalModel(model) {
  const models = readAll();
  const idx = models.findIndex(m => m.id === model.id);
  const now = new Date().toISOString();
  if (idx >= 0) {
    models[idx] = { ...models[idx], ...model, updatedAt: now };
    writeAll(models);
    return models[idx];
  }
  const saved = { ...model, id: genId(), createdAt: now, updatedAt: now };
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

export function saveLocalRun(modelId, result, config) {
  const allRuns = readLocalRuns();
  if (!allRuns[modelId]) allRuns[modelId] = [];
  allRuns[modelId].push({
    id: genId(),
    createdAt: new Date().toISOString(),
    seed: config?.seed,
    replications: config?.replications || 1,
    warmupPeriod: config?.warmupPeriod,
    maxSimTime: config?.maxTime,
    runLabel: config?.runLabel || "",
    ...result,
  });
  // Keep last 50 runs per model
  if (allRuns[modelId].length > 50) allRuns[modelId] = allRuns[modelId].slice(-50);
  localStorage.setItem(RUNS_KEY, JSON.stringify(allRuns));
}

export function fetchLocalRunHistory(modelId) {
  const allRuns = readLocalRuns();
  return allRuns[modelId] || [];
}

// Sweep storage (localStorage)
const SWEEPS_KEY = "des_studio_sweeps";

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
