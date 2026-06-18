import { buildHistogramFD, summarizeEntitySummary } from "../engine/statistics.js";

const LARGE_RUN_RISK_LEVELS = new Set(["large", "too_large"]);
const COMPACT_TIME_SERIES_MAX_POINTS = 200;
const MINIMAL_TIME_SERIES_MAX_POINTS = 150;

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

function buildLogSummary(logEntries = []) {
  const lastEntry = logEntries.at(-1) || null;
  return {
    entries: logEntries.length,
    finalPhase: lastEntry?.phase || null,
    finalTime: lastEntry?.time ?? null,
    finalMessage: lastEntry?.message || null,
  };
}

/**
 * Compact wait-time distribution for "minimal" saves.
 * Keeps all summary percentiles AND pre-computes Freedman-Diaconis histogram bins
 * (≤20 bins, ~600 bytes per queue) from the raw values array before dropping it.
 * This lets the WaitHistogram component render for any saved run, regardless of
 * detail level, without storing tens of KB of raw observation arrays.
 */
function compactifyDistEntry(d) {
  return d ? {
    n:    d.n    ?? 0,
    mean: d.mean ?? null,
    p50:  d.p50  ?? null,
    p90:  d.p90  ?? null,
    p95:  d.p95  ?? null,
    p99:  d.p99  ?? null,
    histogram: Array.isArray(d.values) && d.values.length > 1
      ? buildHistogramFD(d.values, { maxBins: 20 })
      : null,
  } : null;
}

function compactifyWaitDist(waitDist = {}) {
  return Object.fromEntries(Object.entries(waitDist || {}).map(([qName, d]) => [qName, compactifyDistEntry(d)]));
}

// Same compaction as compactifyWaitDist, applied one level deeper
// (attrName -> queueName -> attrValue -> dist) for the entity-attribute breakdown.
function compactifyWaitDistByAttr(waitDistByAttr = {}) {
  return Object.fromEntries(Object.entries(waitDistByAttr || {}).map(([attrName, byQueue]) => [
    attrName,
    Object.fromEntries(Object.entries(byQueue || {}).map(([qName, byValue]) => [
      qName,
      Object.fromEntries(Object.entries(byValue || {}).map(([value, d]) => [value, compactifyDistEntry(d)])),
    ])),
  ]));
}

// Bin raw [arrivalTime, totalWait] points into a fixed number of arrival-time
// buckets, replacing the (potentially large, one-entry-per-entity) raw array
// with a small summary — same trade-off as compactifyDistEntry's histogram.
const ARRIVAL_BUCKET_COUNT = 24;

function compactifyArrivalSeries(points) {
  if (!Array.isArray(points) || points.length === 0) return { buckets: [] };
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const minT = sorted[0][0];
  const maxT = sorted[sorted.length - 1][0];
  if (maxT <= minT) {
    const mean = sorted.reduce((sum, [, w]) => sum + w, 0) / sorted.length;
    return { buckets: [{ t: minT, n: sorted.length, mean }] };
  }
  const bucketWidth = (maxT - minT) / ARRIVAL_BUCKET_COUNT;
  const sums = new Array(ARRIVAL_BUCKET_COUNT).fill(0);
  const counts = new Array(ARRIVAL_BUCKET_COUNT).fill(0);
  for (const [t, w] of sorted) {
    const idx = Math.min(ARRIVAL_BUCKET_COUNT - 1, Math.floor((t - minT) / bucketWidth));
    sums[idx] += w;
    counts[idx]++;
  }
  const buckets = [];
  for (let i = 0; i < ARRIVAL_BUCKET_COUNT; i++) {
    if (counts[i] === 0) continue;
    buckets.push({ t: minT + (i + 0.5) * bucketWidth, n: counts[i], mean: sums[i] / counts[i] });
  }
  return { buckets };
}

// Same idea as compactifyWaitDistByAttr, but one level shallower (no queue
// dimension — waitByArrivalAttr is a global, whole-journey breakdown).
function compactifyWaitByArrivalAttr(waitByArrivalAttr = {}) {
  return Object.fromEntries(Object.entries(waitByArrivalAttr || {}).map(([attrName, byValue]) => [
    attrName,
    Object.fromEntries(Object.entries(byValue || {}).map(([value, points]) => [value, compactifyArrivalSeries(points)])),
  ]));
}

// Legacy alias — used only for the payload-size safety guard path below.
const summarizeWaitDist = compactifyWaitDist;

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
  // Allow callers (e.g. AdaptiveBatchPanel) to embed _model_snapshot directly
  // without needing a full runRecord (which requires buildRunRecord + resolvedSeed).
  if (!resultsJson._model_snapshot && config.modelSnapshot) {
    resultsJson._model_snapshot = config.modelSnapshot;
  }
  // Allow callers (e.g. AdaptiveBatchPanel) to embed _experiment_config directly
  // without needing a full runRecord.  This ensures the replication count and run
  // parameters stored in results_json always reflect the actual executed values,
  // never a fallback reconstructed from the wrong field (e.g. initial-batch size).
  if (!resultsJson._experiment_config && config.experimentConfig) {
    resultsJson._experiment_config = config.experimentConfig;
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

  // Always strip the full trace log — never persist it to the database.
  if (Array.isArray(resultsJson.log) && resultsJson.log.length > 0) {
    resultsJson.logSummary = buildLogSummary(resultsJson.log);
    delete resultsJson.log;
    trimmedFields.push("log");
  }

  if (detailLevel === "minimal") {
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
      // Keep a 50-point skeleton so queue-depth and server-utilisation charts
      // remain functional when viewing saved runs from history.
      const originalPoints = resultsJson.timeSeries.length;
      resultsJson.timeSeries = sampleEvenly(resultsJson.timeSeries, MINIMAL_TIME_SERIES_MAX_POINTS);
      if (resultsJson.timeSeries.length < originalPoints) {
        resultsJson._time_series_sampling = {
          originalPoints,
          savedPoints: resultsJson.timeSeries.length,
        };
        trimmedFields.push("timeSeries.sampled");
      }
    }
    if (resultsJson.waitDist && typeof resultsJson.waitDist === "object") {
      // Replace raw values arrays with pre-computed histogram bins (~600 bytes/queue).
      resultsJson.waitDist = compactifyWaitDist(resultsJson.waitDist);
      trimmedFields.push("waitDist.values→histogram");
    }
    if (resultsJson.waitDistByAttr && typeof resultsJson.waitDistByAttr === "object") {
      resultsJson.waitDistByAttr = compactifyWaitDistByAttr(resultsJson.waitDistByAttr);
      trimmedFields.push("waitDistByAttr.values→histogram");
    }
    if (resultsJson.waitByArrivalAttr && typeof resultsJson.waitByArrivalAttr === "object") {
      resultsJson.waitByArrivalAttr = compactifyWaitByArrivalAttr(resultsJson.waitByArrivalAttr);
      trimmedFields.push("waitByArrivalAttr.points→buckets");
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
    if (resultsJson.waitDist && typeof resultsJson.waitDist === "object") {
      resultsJson.waitDist = compactifyWaitDist(resultsJson.waitDist);
      trimmedFields.push("waitDist.values→histogram");
    }
    if (resultsJson.waitDistByAttr && typeof resultsJson.waitDistByAttr === "object") {
      resultsJson.waitDistByAttr = compactifyWaitDistByAttr(resultsJson.waitDistByAttr);
      trimmedFields.push("waitDistByAttr.values→histogram");
    }
    if (resultsJson.waitByArrivalAttr && typeof resultsJson.waitByArrivalAttr === "object") {
      resultsJson.waitByArrivalAttr = compactifyWaitByArrivalAttr(resultsJson.waitByArrivalAttr);
      trimmedFields.push("waitByArrivalAttr.points→buckets");
    }
  }

  if (trimmedFields.length > 0) {
    resultsJson._trimmed_fields = trimmedFields;
  }

  // Payload size guard: if the payload still exceeds the safe threshold after
  // detail-level trimming (e.g. "full" saves for large timetable models), force
  // the same stripping that "minimal" applies so the INSERT does not time out.
  const PAYLOAD_SAFE_BYTES = 800_000;
  if (detailLevel !== "minimal" && JSON.stringify(resultsJson).length > PAYLOAD_SAFE_BYTES) {
    delete resultsJson.trace;
    if (Array.isArray(resultsJson.entitySummary) && resultsJson.entitySummary.length > 0) {
      resultsJson.entitySummaryCompact = summarizeEntitySummary(resultsJson.entitySummary);
      delete resultsJson.entitySummary;
    }
    if (Array.isArray(resultsJson.timeSeries) && resultsJson.timeSeries.length > 0) {
      resultsJson.timeSeries = sampleEvenly(resultsJson.timeSeries, MINIMAL_TIME_SERIES_MAX_POINTS);
    }
    if (resultsJson.waitDist && typeof resultsJson.waitDist === "object") {
      resultsJson.waitDist = compactifyWaitDist(resultsJson.waitDist);
    }
    if (resultsJson.waitDistByAttr && typeof resultsJson.waitDistByAttr === "object") {
      resultsJson.waitDistByAttr = compactifyWaitDistByAttr(resultsJson.waitDistByAttr);
    }
    if (resultsJson.waitByArrivalAttr && typeof resultsJson.waitByArrivalAttr === "object") {
      resultsJson.waitByArrivalAttr = compactifyWaitByArrivalAttr(resultsJson.waitByArrivalAttr);
    }
    if (Array.isArray(resultsJson.replications)) {
      resultsJson.replications = resultsJson.replications.map(r => ({
        replicationIndex: r.replicationIndex,
        seed: r.seed,
        summary: r.summary,
        finalTime: r.finalTime,
      }));
    }
    resultsJson._result_detail_level = "minimal";
    resultsJson._auto_trimmed_from = detailLevel;
    resultsJson._auto_trim_reason = "payload_size_guard";
  }

  return withResultsPayloadSize(resultsJson);
}
