// ui/execute/executeHelpers.js — Pure helper constants and functions (no React dependency)

import { TOKEN_COLORS } from "../shared/tokens.js";
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

export function makeBatchRuntimeMetrics(replicationPayloads, replications, wallClockMs = null) {
  const runtimeRows = replicationPayloads
    .map(payload => payload?.result?.runtimeMetrics)
    .filter(Boolean);
  const maxQueueLengthByQueue = {};

  for (const row of runtimeRows) {
    for (const [queueName, depth] of Object.entries(row.max_queue_length_by_queue || {})) {
      const numericDepth = Number(depth);
      if (!Number.isFinite(numericDepth)) continue;
      maxQueueLengthByQueue[queueName] = Math.max(maxQueueLengthByQueue[queueName] || 0, numericDepth);
    }
  }

  return {
    wall_clock_ms: wallClockMs,
    replications: replications ?? runtimeRows.length,
    events_processed: runtimeRows.reduce((sum, row) => sum + (Number(row.events_processed) || 0), 0),
    c_event_scans: runtimeRows.reduce((sum, row) => sum + (Number(row.c_event_scans) || 0), 0),
    c_events_fired: runtimeRows.reduce((sum, row) => sum + (Number(row.c_events_fired) || 0), 0),
    entities_created: runtimeRows.reduce((sum, row) => sum + (Number(row.entities_created) || 0), 0),
    entities_completed: runtimeRows.reduce((sum, row) => sum + (Number(row.entities_completed) || 0), 0),
    max_queue_length_by_queue: Object.keys(maxQueueLengthByQueue).length ? maxQueueLengthByQueue : undefined,
  };
}

export function makeBatchResult(replicationPayloads, aggregateStats, maxTime, warmupPeriod) {
  const summaries = replicationPayloads.map(payload => payload.result?.summary || {});
  const total = summaries.reduce((sum, summary) => sum + (summary.total || 0), 0);
  const served = summaries.reduce((sum, summary) => sum + (summary.served || 0), 0);
  const reneged = summaries.reduce((sum, summary) => sum + (summary.reneged || 0), 0);
  const finalTime = Math.max(...replicationPayloads.map(payload => payload.result?.finalTime || 0), 0);

  const lastResult = replicationPayloads.filter(Boolean).pop()?.result;

  // Average perResource utilisation across replications
  const perResourceAcc = {};
  for (const s of summaries) {
    if (!s.perResource) continue;
    for (const [type, stats] of Object.entries(s.perResource)) {
      if (!perResourceAcc[type]) perResourceAcc[type] = { utilSum: 0, count: 0, total: stats.total };
      perResourceAcc[type].utilSum += stats.utilisation ?? 0;
      perResourceAcc[type].count++;
    }
  }
  const perResource = Object.keys(perResourceAcc).length
    ? Object.fromEntries(
        Object.entries(perResourceAcc).map(([type, acc]) => [
          type,
          { total: acc.total, utilisation: acc.count ? +(acc.utilSum / acc.count).toFixed(4) : 0 },
        ])
      )
    : undefined;

  // Aggregate waitDist across all replications by pooling raw values per queue
  const waitDistAcc = {};
  for (const payload of replicationPayloads) {
    const wd = payload?.result?.waitDist;
    if (!wd) continue;
    for (const [qName, qDist] of Object.entries(wd)) {
      if (!Array.isArray(qDist.values)) continue;
      if (!waitDistAcc[qName]) waitDistAcc[qName] = [];
      for (const v of qDist.values) waitDistAcc[qName].push(v);
    }
  }
  const waitDist = Object.keys(waitDistAcc).length
    ? Object.fromEntries(Object.entries(waitDistAcc).map(([qName, vals]) => {
        const sorted = [...vals].sort((a, b) => a - b);
        const n = sorted.length;
        const pct = (p) => sorted[Math.min(Math.floor(p * n), n - 1)];
        return [qName, {
          n,
          mean: +(sorted.reduce((s, v) => s + v, 0) / n).toFixed(4),
          p50:  +pct(0.50).toFixed(4),
          p90:  +pct(0.90).toFixed(4),
          p95:  +pct(0.95).toFixed(4),
          p99:  +pct(0.99).toFixed(4),
          values: sorted.map(v => +v.toFixed(4)),
        }];
      }))
    : lastResult?.waitDist;

  return {
    snap: { clock: finalTime },
    timeSeries: lastResult?.timeSeries,
    waitDist,
    summary: {
      total,
      served,
      reneged,
      avgWait: aggregateStats["summary.avgWait"]?.mean ?? null,
      avgSvc: aggregateStats["summary.avgSvc"]?.mean ?? null,
      avgSojourn: aggregateStats["summary.avgSojourn"]?.mean ?? null,
      warmupPeriod,
      maxSimTime: maxTime,
      perResource,
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
  metricsOnly = false,
  exportedAt = new Date().toISOString(),
} = {}) {
  function stripResults(r) {
    if (!r) return null;
    // Always drop the event log — too large, not useful outside the app.
    const { log, ...rest } = r;
    if (!metricsOnly) return rest;
    // Metrics-only: keep just summary KPIs; drop time series, distributions, entity details, and snapshot.
    const { summary, phaseCTruncated, runtimeMetrics } = rest;
    return { summary, phaseCTruncated, runtimeMetrics };
  }

  return {
    schema: "des-studio.results.v1",
    exportedAt,
    status: results ? "complete" : "partial",
    batchStatus,
    metricsOnly,
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
    results: stripResults(results),
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

export function formatRunTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");
}

export function makeDefaultRunLabel(modelName, date = new Date()) {
  return `${modelName || "Model"} ${formatRunTimestamp(date)}`;
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
