const LARGE_RUN_RISK_LEVELS = new Set(["large", "too_large"]);
const COMPACT_TIME_SERIES_MAX_POINTS = 200;
const ENTITY_SUMMARY_TYPE_LIMIT = 12;

function sampleEvenly(items, maxPoints) {
  if (!Array.isArray(items)) return [];
  if (items.length <= maxPoints) return items.slice();
  if (maxPoints <= 1) return [items[items.length - 1]];

  const lastIndex = items.length - 1;
  const selected = new Set([0, lastIndex]);
  for (let i = 1; i < maxPoints - 1; i++) {
    selected.add(Math.round((i * lastIndex) / (maxPoints - 1)));
  }
  return Array.from(selected)
    .sort((a, b) => a - b)
    .map(index => items[index]);
}

function summarizeEntitySummary(entitySummary = []) {
  const byStatus = {};
  const byType = {};

  for (const entity of entitySummary) {
    const status = entity?.status || "unknown";
    const type = entity?.type || entity?.role || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
  }

  return {
    totalEntities: entitySummary.length,
    byStatus,
    byType: Object.fromEntries(
      Object.entries(byType)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, ENTITY_SUMMARY_TYPE_LIMIT)
    ),
  };
}

function buildLogSummary(logEntries = []) {
  const lastEntry = logEntries.at(-1) || null;
  return {
    entries: logEntries.length,
    finalPhase: lastEntry?.phase || null,
    finalTime: lastEntry?.time ?? null,
    finalMessage: lastEntry?.message || null,
  };
}

function summarizeWaitDist(waitDist = {}) {
  const entries = Object.entries(waitDist || {});
  return Object.fromEntries(entries.map(([queueName, stats]) => [
    queueName,
    stats ? {
      n: stats.n ?? 0,
      mean: stats.mean ?? null,
      p50: stats.p50 ?? null,
      p90: stats.p90 ?? null,
      p95: stats.p95 ?? null,
      p99: stats.p99 ?? null,
    } : null,
  ]));
}

export function resolveResultDetailLevel(config = {}) {
  if (config.resultDetailLevel === "minimal" || config.resultDetailLevel === "compact" || config.resultDetailLevel === "full") {
    return config.resultDetailLevel;
  }
  if (config.minimalResults === true) return "minimal";
  if (config.compactResults === true) return "compact";
  if (LARGE_RUN_RISK_LEVELS.has(String(config.riskLevel || "").trim().toLowerCase())) {
    return "compact";
  }
  return "minimal";
}

export function withResultsPayloadSize(resultsJson) {
  const payloadSizeBytes = JSON.stringify(resultsJson).length;
  return {
    ...resultsJson,
    _results_payload_size_bytes: payloadSizeBytes,
  };
}

export function buildPersistedResultsJson(result = {}, config = {}) {
  const summary = result?.summary || {};
  let resultsJson = config.resultsJson ? { ...config.resultsJson } : {
    ...result,
    summary,
    clock: result?.snap?.clock ?? result?.clock ?? null,
  };

  if (!resultsJson.summary) {
    resultsJson.summary = summary;
  }
  if (result.phaseCTruncated || summary.phaseCTruncated) {
    resultsJson.phaseCTruncated = true;
    resultsJson.summary = { ...resultsJson.summary, phaseCTruncated: true };
  }
  if (Array.isArray(result.warnings) && result.warnings.length) {
    resultsJson.warnings = result.warnings;
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
  // Resolve detail level first so it can gate expensive fields like model_snapshot.
  const detailLevel = resolveResultDetailLevel(config);

  if (config.runRecord) {
    // ADR-016: now that timetable rows live in model_schedules (not model_json),
    // the model snapshot is small (~14 KB for Glasgow Central, down from ~290 KB).
    // The "full"-only guard introduced in the glasgow-supabase-save-perf branch
    // is no longer needed — we embed the snapshot for all detail levels when
    // includeModelSnapshot is set.  This restores reproduce/diff for all saves
    // without the INSERT payload bloat that originally motivated the guard.
    if (config.runRecord.model_snapshot && config.includeModelSnapshot === true) {
      resultsJson._model_snapshot = config.runRecord.model_snapshot;
    }
    resultsJson._engine_version  = config.runRecord.engine_version;
    resultsJson._prng_algorithm  = config.runRecord.prng_algorithm;
    resultsJson._base_seed       = config.runRecord.base_seed;
    if (config.runRecord.experiment_config) {
      resultsJson._experiment_config = config.runRecord.experiment_config;
    }
  }
  if (config.requestedCollectTimeSeries !== undefined) {
    resultsJson._requested_collect_time_series = !!config.requestedCollectTimeSeries;
  }
  if (config.effectiveCollectTimeSeries !== undefined) {
    resultsJson._effective_collect_time_series = !!config.effectiveCollectTimeSeries;
  }
  if (result.runtimeMetrics) {
    resultsJson.runtimeMetrics = result.runtimeMetrics;
  }
  const trimmedFields = [];
  resultsJson._result_detail_level = detailLevel;
  if (config.riskLevel) {
    resultsJson._result_risk_level = config.riskLevel;
  }

  if (detailLevel === "minimal") {
    if (Array.isArray(resultsJson.log) && resultsJson.log.length > 0) {
      resultsJson.logSummary = buildLogSummary(resultsJson.log);
      delete resultsJson.log;
      trimmedFields.push("log");
    }
    if (Array.isArray(resultsJson.trace) && resultsJson.trace.length > 0) {
      delete resultsJson.trace;
      trimmedFields.push("trace");
    }
    if (Array.isArray(resultsJson.entitySummary) && resultsJson.entitySummary.length > 0) {
      resultsJson.entitySummaryCompact = summarizeEntitySummary(resultsJson.entitySummary);
      delete resultsJson.entitySummary;
      trimmedFields.push("entitySummary");
    }
    if (Array.isArray(resultsJson.timeSeries) && resultsJson.timeSeries.length > 0) {
      delete resultsJson.timeSeries;
      trimmedFields.push("timeSeries");
    }
    if (resultsJson.waitDist && typeof resultsJson.waitDist === "object") {
      resultsJson.waitDist = summarizeWaitDist(resultsJson.waitDist);
      trimmedFields.push("waitDist.values");
    }
    if (Array.isArray(resultsJson.replications) && resultsJson.replications.length > 0) {
      resultsJson.replications = resultsJson.replications.map(replication => ({
        replicationIndex: replication.replicationIndex,
        seed: replication.seed,
        summary: replication.summary,
        finalTime: replication.finalTime,
      }));
    }
  } else if (detailLevel === "compact") {
    if (Array.isArray(resultsJson.log) && resultsJson.log.length > 0) {
      resultsJson.logSummary = buildLogSummary(resultsJson.log);
      delete resultsJson.log;
      trimmedFields.push("log");
    }
    if (Array.isArray(resultsJson.trace) && resultsJson.trace.length > 0) {
      delete resultsJson.trace;
      trimmedFields.push("trace");
    }
    if (Array.isArray(resultsJson.entitySummary) && resultsJson.entitySummary.length > 0) {
      resultsJson.entitySummaryCompact = summarizeEntitySummary(resultsJson.entitySummary);
      delete resultsJson.entitySummary;
      trimmedFields.push("entitySummary");
    }
    if (Array.isArray(resultsJson.timeSeries) && resultsJson.timeSeries.length > 0) {
      const originalPoints = resultsJson.timeSeries.length;
      const sampled = sampleEvenly(resultsJson.timeSeries, COMPACT_TIME_SERIES_MAX_POINTS);
      resultsJson.timeSeries = sampled;
      if (sampled.length < originalPoints) {
        resultsJson._time_series_sampling = {
          originalPoints,
          savedPoints: sampled.length,
        };
        trimmedFields.push("timeSeries");
      }
    }
  }

  if (trimmedFields.length > 0) {
    resultsJson._trimmed_fields = trimmedFields;
  }

  return withResultsPayloadSize(resultsJson);
}
