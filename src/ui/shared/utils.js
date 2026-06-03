// ui/shared/utils.js — General utility functions

const MODEL_JSON_KEYS = ["entityTypes", "stateVariables", "bEvents", "cEvents", "queues", "graph", "experimentDefaults", "goals", "containerTypes"];

/**
 * Normalise an imported JSON payload (raw model or DB envelope) into a
 * clean model object ready for validateModel() and saveModel().
 * Accepts both { model_json: {...} } DB envelopes and plain model objects.
 */
export function extractImportedModelPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Import must be a simmodlr model JSON object.");
  }
  const source = payload.model_json && typeof payload.model_json === "object"
    ? payload.model_json
    : payload;
  const sourceName = (payload.name || source.name || "Imported model").trim?.() || "Imported model";
  const model = {
    name: `${sourceName} (Imported)`,
    description: payload.description || source.description || "",
    visibility: "private",
    access: {},
  };
  for (const key of MODEL_JSON_KEYS) {
    if (key === "graph" || key === "experimentDefaults") {
      model[key] = source[key] && typeof source[key] === "object" && !Array.isArray(source[key])
        ? source[key]
        : key === "graph" ? null : {};
    } else {
      model[key] = Array.isArray(source[key]) ? source[key] : [];
    }
  }
  // Preserve scalar settings that are not array-valued model keys
  if (source.timeUnit) model.timeUnit = source.timeUnit;
  if (source.epoch)    model.epoch    = source.epoch;
  if (Array.isArray(source.dataSources)) model.dataSources = source.dataSources;
  return model;
}

export function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadTextFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); URL.revokeObjectURL(url); }
}

export function downloadJsonFile(payload, filename) {
  downloadTextFile(JSON.stringify(payload, null, 2), filename, "application/json");
}

export function buildRunHistoryExportPayload(model, rows = [], exportedAt = new Date().toISOString()) {
  return {
    schema: "simmodlr.run-history.v1",
    exportedAt,
    model: { id: model?.id ?? null, name: model?.name ?? "Untitled model" },
    runs: rows.map(row => ({
      id: row.id,
      runLabel: row.run_label || "",
      ranAt: row.ran_at,
      seed: row.seed ?? null,
      replications: row.replications ?? 1,
      warmupPeriod: row.warmup_period ?? null,
      maxSimulationTime: row.max_simulation_time ?? null,
      totalArrived: row.total_arrived ?? 0,
      totalServed: row.total_served ?? 0,
      totalReneged: row.total_reneged ?? 0,
      renegeRate: row.renege_rate ?? null,
      avgWaitTime: row.avg_wait_time ?? null,
      avgServiceTime: row.avg_service_time ?? null,
      durationMs: row.duration_ms ?? null,
      resultsJson: row.results_json ?? null,
    })),
  };
}

export function buildRunHistoryCsv(rows = []) {
  const headers = ["runLabel","ranAt","seed","replications","warmupPeriod","maxSimulationTime",
    "totalArrived","totalServed","totalReneged","renegeRate","avgWaitTime","avgServiceTime","durationMs"];
  const dataRows = rows.map(row => [
    row.run_label || "", row.ran_at, row.seed ?? "", row.replications ?? 1,
    row.warmup_period ?? "", row.max_simulation_time ?? "",
    row.total_arrived ?? 0, row.total_served ?? 0, row.total_reneged ?? 0,
    row.renege_rate ?? "", row.avg_wait_time ?? "", row.avg_service_time ?? "",
    row.duration_ms ?? "",
  ]);
  return [headers, ...dataRows].map(r => r.map(csvEscape).join(",")).join("\n");
}

export function slugifyResultName(name = "model") {
  const slug = String(name || "model")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "model";
}

export function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}
