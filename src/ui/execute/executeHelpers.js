// ui/execute/executeHelpers.js — Pure helper constants and functions (no React dependency)

import { C, FONT, TOKEN_COLORS } from "../shared/tokens.js";
import { slugifyResultName, timestampForFilename } from "../shared/utils.js";

export const tokenColor = (id) => TOKEN_COLORS[(id - 1) % TOKEN_COLORS.length];
export const CI_METRICS = ["summary.avgWait", "summary.avgSvc", "summary.avgSojourn", "summary.served", "summary.reneged", "summary.totalCost", "summary.costPerServed"];
export const METRIC_LABELS = {
  "summary.avgWait": "Avg wait",
  "summary.avgSvc": "Avg service",
  "summary.avgSojourn": "Avg sojourn",
  "summary.served": "Served",
  "summary.reneged": "Reneged",
  "summary.totalCost": "Total cost",
  "summary.costPerServed": "Cost / served",
};

export const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : "—";
export const makeBatchId = () => {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export function makeBatchResult(replicationPayloads, aggregateStats, maxTime, warmupPeriod) {
  const summaries = replicationPayloads.map(payload => payload.result?.summary || {});
  const total = summaries.reduce((sum, summary) => sum + (summary.total || 0), 0);
  const served = summaries.reduce((sum, summary) => sum + (summary.served || 0), 0);
  const reneged = summaries.reduce((sum, summary) => sum + (summary.reneged || 0), 0);
  const finalTime = Math.max(...replicationPayloads.map(payload => payload.result?.finalTime || 0), 0);

  const lastResult = replicationPayloads.filter(Boolean).pop()?.result;

  return {
    snap: { clock: finalTime },
    timeSeries: lastResult?.timeSeries,
    waitDist: lastResult?.waitDist,
    summary: {
      total,
      served,
      reneged,
      avgWait: aggregateStats["summary.avgWait"]?.mean ?? null,
      avgSvc: aggregateStats["summary.avgSvc"]?.mean ?? null,
      avgSojourn: aggregateStats["summary.avgSojourn"]?.mean ?? null,
      warmupPeriod,
      maxSimTime: maxTime,
    },
  };
}

export function buildResultsExportPayload({
  model,
  results,
  replicationResults = [],
  aggregateStats = {},
  config = {},
  batchStatus = "idle",
  exportedAt = new Date().toISOString(),
} = {}) {
  return {
    schema: "des-studio.results.v1",
    exportedAt,
    status: results ? "complete" : "partial",
    batchStatus,
    model: {
      id: config.modelId ?? null,
      name: model?.name ?? "Untitled model",
    },
    experiment: {
      runLabel: config.runLabel ?? null,
      seed: config.seed ?? null,
      replications: config.replications ?? Math.max(replicationResults.length, results ? 1 : 0),
      warmupPeriod: config.warmupPeriod ?? 0,
      maxSimTime: config.maxSimTime ?? null,
      terminationMode: config.terminationMode ?? "time",
      terminationCondition: config.terminationCondition ?? null,
    },
    results: results ?? null,
    replications: replicationResults.map(payload => ({
      replicationIndex: payload.replicationIndex,
      seed: payload.seed,
      summary: payload.result?.summary ?? payload.summary ?? {},
      finalTime: payload.result?.finalTime ?? payload.finalTime ?? payload.result?.snap?.clock ?? null,
    })),
    aggregateStats,
  };
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildResultsCsv({ results, replicationResults = [], aggregateStats = {}, config = {} } = {}) {
  const rows = [["runLabel", "replicationIndex", "seed", "served", "reneged", "avgWait", "avgSvc", "avgSojourn", "finalTime"]];

  const resultRows = replicationResults.length
    ? replicationResults.map(payload => ({
        replicationIndex: payload.replicationIndex,
        runLabel: payload.run_label || payload.label || config.runLabel || "",
        seed: payload.seed,
        summary: payload.result?.summary ?? payload.summary ?? {},
        finalTime: payload.result?.finalTime ?? payload.finalTime ?? payload.result?.snap?.clock ?? null,
      }))
    : results
      ? [{
          replicationIndex: 0,
          runLabel: config.runLabel || "",
          seed: config.seed ?? null,
          summary: results.summary ?? {},
          finalTime: results.finalTime ?? results.snap?.clock ?? null,
        }]
      : [];

  for (const row of resultRows) {
    rows.push([
      row.runLabel,
      row.replicationIndex,
      row.seed,
      row.summary.served,
      row.summary.reneged,
      row.summary.avgWait,
      row.summary.avgSvc,
      row.summary.avgSojourn,
      row.finalTime,
    ]);
  }

  const aggregateRows = Object.entries(aggregateStats)
    .filter(([, stat]) => stat && stat.n > 0)
    .map(([metric, stat]) => [
      metric,
      stat.n,
      stat.mean,
      stat.lower,
      stat.upper,
      stat.halfWidth,
    ]);

  if (aggregateRows.length) {
    rows.push([]);
    rows.push(["metric", "n", "mean", "lower95", "upper95", "halfWidth"]);
    rows.push(...aggregateRows);
  }

  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

export function downloadTextFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function makeRunLabel(payload) {
  if (!payload) return "Run";
  if (payload.run_label) return payload.run_label;
  if (payload.label) return payload.label;
  if (payload.replicationIndex != null) return `Replication ${payload.replicationIndex + 1} (seed ${payload.seed ?? "?"})`;
  return "Completed run";
}

export function makeRunPromptPayload(label, payload) {
  const summary = payload?.result?.summary || payload?.summary || payload?.results?.summary || {};
  return {
    label,
    experimentConfig: payload?.experiment || payload?.experimentConfig || {},
    kpis: {
      served: summary.served ?? null,
      reneged: summary.reneged ?? null,
      totalEntities: summary.total ?? null,
      avgWait: summary.avgWait ?? null,
      avgService: summary.avgSvc ?? null,
      avgSojourn: summary.avgSojourn ?? null,
    },
    finalTime: payload?.result?.finalTime ?? payload?.finalTime ?? payload?.results?.snap?.clock ?? null,
  };
}

export function makeSavedRunPromptPayload(row) {
  const summary = row?.results_json?.summary || {};
  return {
    label: row?.run_label || row?.label || row?.ran_at || "Saved run",
    experimentConfig: {
      warmupPeriod: row?.warmup_period ?? null,
      maxSimTime: row?.max_simulation_time ?? row?.results_json?.summary?.maxSimTime ?? null,
      replications: row?.replications ?? 1,
      seed: row?.seed ?? null,
    },
    kpis: {
      served: row?.total_served ?? summary.served ?? null,
      reneged: row?.total_reneged ?? summary.reneged ?? null,
      totalEntities: row?.total_arrived ?? summary.total ?? null,
      avgWait: row?.avg_wait_time ?? summary.avgWait ?? null,
      avgService: row?.avg_service_time ?? summary.avgSvc ?? null,
      avgSojourn: summary.avgSojourn ?? null,
      renegeRate: row?.renege_rate ?? null,
    },
    finalTime: row?.results_json?.clock ?? row?.results_json?.summary?.finalTime ?? null,
  };
}
