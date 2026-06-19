// ui/execute/executeHelpers.js — Pure helper constants and functions (no React dependency)

import { TOKEN_COLORS } from "../shared/tokens.js";
import { slugifyResultName, timestampForFilename, csvEscape, downloadTextFile } from "../shared/utils.js";
import { buildWaitDistEntry, finalizeWeightedStats } from "../../engine/statistics.js";
export { downloadTextFile };

export const tokenColor = (id) => TOKEN_COLORS[(id - 1) % TOKEN_COLORS.length];
export const CI_METRICS = ["summary.total", "summary.avgWait", "summary.avgSvc", "summary.avgSojourn", "summary.avgTimeInSystem", "summary.served", "summary.reneged", "summary.servedRatio", "summary.totalCost", "summary.costPerServed"];
export const METRIC_LABELS = {
  "summary.total": "Arrived",
  "summary.avgWait": "Avg wait",
  "summary.avgSvc": "Avg service",
  "summary.avgSojourn": "Avg sojourn",
  "summary.avgTimeInSystem": "Avg time in system",
  "summary.served": "Served",
  "summary.reneged": "Reneged",
  "summary.servedRatio": "Completion rate",
  "summary.totalCost": "Total cost",
  "summary.costPerServed": "Cost / served",
};

export const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : "—";

export const COUNT_METRICS = new Set(["summary.total", "summary.served", "summary.reneged"]);

export const fmtMetric = (metric, value) => {
  if (!Number.isFinite(value)) return "—";
  if (metric === "summary.servedRatio") return `${Math.round(value * 100)}%`;
  if (COUNT_METRICS.has(metric)) return String(Math.round(value));
  return value.toFixed(1);
};
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

// Streaming accumulator: processes each replication's time series as it arrives
// (O(M) per rep) and accumulates sums into TypedArrays, so the raw per-rep
// series can be freed immediately rather than held until all reps finish.
//
// knownMaxTime (when the run uses time-based termination) seeds the grid as
// maxPoints evenly spaced points over [0, knownMaxTime] up front, instead of
// deriving it from whichever replication's addSeries() call happens to land
// first. Replications complete in non-deterministic worker order, and an
// individual replication's own clock can stop short of knownMaxTime (e.g. its
// event list empties early) — anchoring the grid to that one replication would
// silently truncate every other (correctly longer-running) replication's data
// past that point. With no knownMaxTime (condition-based termination, no
// a-priori run length), fall back to deriving the grid from the first series.
export function makeTimeSeriesAccumulator(maxPoints = 500, knownMaxTime = null) {
  let grid = Number.isFinite(knownMaxTime) && knownMaxTime > 0
    ? Array.from({ length: maxPoints }, (_, i) => (i / (maxPoints - 1)) * knownMaxTime)
    : null;
  let queueSums = grid ? {} : null;
  let typeSums = grid ? {} : null;
  let wipSums = grid ? new Float64Array(grid.length) : null;
  let completedSums = grid ? new Float64Array(grid.length) : null;
  let count = 0;

  // Queues/types that haven't received any entities yet are simply absent
  // from a sample's byQueue/byType map (sparse representation), so a key
  // can legitimately first appear well after t=0 or in a later replication.
  // Keys are therefore created lazily, on first sight, rather than only
  // being seeded from the first sample of the first replication — otherwise
  // any queue/type that was empty at t=0 would be silently dropped from
  // every subsequent average forever.
  function ensureQueueKey(k) {
    if (!queueSums[k]) queueSums[k] = {
      waiting: new Float64Array(grid.length),
      total: new Float64Array(grid.length),
      // avgWait is weighted by waitN (entities that cleared the queue in this
      // bucket), not by replication count — a rep with no completions in a
      // bucket contributes nothing rather than diluting the average toward 0.
      waitSum: new Float64Array(grid.length),
      waitN: new Float64Array(grid.length),
    };
    return queueSums[k];
  }
  function ensureTypeKey(k) {
    if (!typeSums[k]) typeSums[k] = { waiting: new Float64Array(grid.length), busy: new Float64Array(grid.length), idle: new Float64Array(grid.length), total: new Float64Array(grid.length) };
    return typeSums[k];
  }

  function addSeries(ts) {
    if (!Array.isArray(ts) || ts.length === 0) return;
    if (!grid) {
      const times = ts.map(pt => pt.t);
      grid = times.length > maxPoints
        ? Array.from({ length: maxPoints }, (_, i) => times[Math.round(i * (times.length - 1) / (maxPoints - 1))])
        : times.slice();
      queueSums = {};
      typeSums = {};
      wipSums = new Float64Array(grid.length);
      completedSums = new Float64Array(grid.length);
    }
    let j = 0;
    let waitConsumedIdx = -1; // highest raw-sample index whose waitN/waitSum has already been folded in
    for (let gi = 0; gi < grid.length; gi++) {
      const t = grid[gi];
      while (j < ts.length - 1 && ts[j + 1].t <= t) j++;
      const pt = ts[j]?.t <= t ? ts[j] : null;
      if (!pt) continue;
      // A coarse grid point can skip over several raw samples (the engine records one
      // per event, far denser than maxPoints) — fold in every raw sample's waitN/waitSum
      // since the last grid point that consumed one, not just the last sample reached,
      // or completions recorded in the skipped samples are silently lost.
      for (let k = waitConsumedIdx + 1; k <= j; k++) {
        for (const [qName, q] of Object.entries(ts[k].byQueue || {})) {
          if (!q.waitN) continue;
          const s = ensureQueueKey(qName);
          s.waitSum[gi] += q.avgWait * q.waitN;
          s.waitN[gi] += q.waitN;
        }
        // completed is a delta-since-last-sample counter (like waitN above),
        // not a level — fold in every skipped raw sample's count, or
        // completions recorded between grid points are silently lost.
        if (typeof ts[k].completed === "number") completedSums[gi] += ts[k].completed;
      }
      waitConsumedIdx = j;
      for (const [k, q] of Object.entries(pt.byQueue || {})) {
        const s = ensureQueueKey(k);
        s.waiting[gi] += q.waiting ?? 0;
        s.total[gi] += q.total ?? 0;
      }
      for (const [k, ty] of Object.entries(pt.byType || {})) {
        const s = ensureTypeKey(k);
        s.waiting[gi] += ty.waiting ?? 0;
        s.busy[gi] += ty.busy ?? 0;
        s.idle[gi] += ty.idle ?? 0;
        s.total[gi] += ty.total ?? 0;
      }
      if (typeof pt.wip === "number") wipSums[gi] += pt.wip;
    }
    count++;
  }

  function getResult() {
    if (!grid || count === 0) return undefined;
    return grid.map((t, gi) => {
      const byQueue = {}, byType = {};
      for (const [k, s] of Object.entries(queueSums))
        byQueue[k] = {
          waiting: s.waiting[gi] / count,
          total: s.total[gi] / count,
          avgWait: s.waitN[gi] > 0 ? s.waitSum[gi] / s.waitN[gi] : null,
          waitN: s.waitN[gi],
        };
      for (const [k, s] of Object.entries(typeSums))
        byType[k] = { waiting: s.waiting[gi] / count, busy: s.busy[gi] / count, idle: s.idle[gi] / count, total: s.total[gi] / count };
      return { t, byQueue, byType, wip: wipSums[gi] / count, completed: completedSums[gi] / count };
    });
  }

  return { addSeries, getResult };
}

export function makeBatchResult(replicationPayloads, aggregateStats, maxTime, warmupPeriod, precomputedTimeSeries) {
  const summaries = replicationPayloads.map(payload => payload.result?.summary || {});
  const total = summaries.reduce((sum, summary) => sum + (summary.total || 0), 0);
  const served = summaries.reduce((sum, summary) => sum + (summary.served || 0), 0);
  const reneged = summaries.reduce((sum, summary) => sum + (summary.reneged || 0), 0);
  const finalTime = Math.max(...replicationPayloads.map(payload => payload.result?.finalTime || 0), 0);

  const lastResult = replicationPayloads.filter(Boolean).pop()?.result;

  const outcomeAcc = {};
  for (const summary of summaries) {
    for (const [routeId, outcome] of Object.entries(summary.outcomes || {})) {
      if (!outcomeAcc[routeId]) {
        outcomeAcc[routeId] = {
          routeId,
          routeLabel: outcome.routeLabel || routeId,
          status: outcome.status || "completed",
          endedBy: outcome.endedBy || "unknown",
          count: 0,
          _waitSum: 0, _waitN: 0,
          _sojournSum: 0, _sojournN: 0,
        };
      }
      const n = Number(outcome.count) || 0;
      outcomeAcc[routeId].count += n;
      // Weighted accumulation so the batch average reflects entity counts not rep counts
      if (Number.isFinite(outcome.avgWait))    { outcomeAcc[routeId]._waitSum    += outcome.avgWait    * n; outcomeAcc[routeId]._waitN    += n; }
      if (Number.isFinite(outcome.avgSojourn)) { outcomeAcc[routeId]._sojournSum += outcome.avgSojourn * n; outcomeAcc[routeId]._sojournN += n; }
    }
  }
  for (const o of Object.values(outcomeAcc)) finalizeWeightedStats(o);

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

  // Aggregate per-section stats across replications (weighted by entity count)
  const sectionAcc = {};
  const journeyAcc = {};
  for (const s of summaries) {
    for (const [secId, sec] of Object.entries(s.sections || {})) {
      if (!sectionAcc[secId]) sectionAcc[secId] = { count: 0, _sojournSum: 0 };
      sectionAcc[secId].count      += sec.count      || 0;
      sectionAcc[secId]._sojournSum += (sec.avgSojourn || 0) * (sec.count || 0);
    }
    for (const [key, count] of Object.entries(s.journeys || {})) {
      journeyAcc[key] = (journeyAcc[key] || 0) + count;
    }
  }
  const sections = Object.keys(sectionAcc).length
    ? Object.fromEntries(Object.entries(sectionAcc).map(([id, acc]) => {
        const { _sojournSum, ...rest } = acc;
        return [id, { ...rest, avgSojourn: acc.count > 0 ? +(_sojournSum / acc.count).toFixed(4) : null }];
      }))
    : undefined;
  const journeys = Object.keys(journeyAcc).length ? journeyAcc : undefined;

  const queueJourneyAcc = {};
  for (const s of summaries) {
    for (const [key, count] of Object.entries(s.queueJourneys || {})) {
      queueJourneyAcc[key] = (queueJourneyAcc[key] || 0) + count;
    }
  }
  const queueJourneys = Object.keys(queueJourneyAcc).length ? queueJourneyAcc : undefined;

  // Aggregate per-queue balk/block counts across all replications (F11.2/F11.1/F11.3)
  const perQueueAcc = {};
  for (const payload of replicationPayloads) {
    const pq = payload?.result?.perQueue;
    if (!pq) continue;
    for (const [qName, counts] of Object.entries(pq)) {
      if (!perQueueAcc[qName]) perQueueAcc[qName] = { blockingCount: 0, balkCount: 0 };
      perQueueAcc[qName].blockingCount += counts.blockingCount || 0;
      perQueueAcc[qName].balkCount     += counts.balkCount || 0;
    }
  }
  const perQueue = Object.keys(perQueueAcc).length ? perQueueAcc : undefined;

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
        return [qName, buildWaitDistEntry(sorted)];
      }))
    : lastResult?.waitDist;

  // Aggregate sojournDist across all replications by pooling raw values
  const sojournDistAcc = [];
  for (const payload of replicationPayloads) {
    const sd = payload?.result?.sojournDist;
    if (!sd || !Array.isArray(sd.values)) continue;
    for (const v of sd.values) sojournDistAcc.push(v);
  }
  const sojournDist = sojournDistAcc.length
    ? buildWaitDistEntry([...sojournDistAcc].sort((a, b) => a - b))
    : lastResult?.sojournDist;

  // Aggregate waitByArrival across all replications by pooling raw
  // [arrivalTime, totalWait] points — global, not per-queue or per-attribute,
  // so just concatenate rather than re-deriving distributions.
  const waitByArrivalAcc = [];
  for (const payload of replicationPayloads) {
    const points = payload?.result?.waitByArrival;
    if (!Array.isArray(points)) continue;
    for (const pt of points) waitByArrivalAcc.push(pt);
  }
  const waitByArrival = waitByArrivalAcc.length ? waitByArrivalAcc : lastResult?.waitByArrival;

// Compute an ensemble-average time series from all replication time series.
// For each time grid point we take the last-known snapshot per replication
// (step interpolation — correct for discrete queue counts) and average across reps.
function averageBatchTimeSeries(replicationPayloads, maxPoints = 500) {
  const allSeries = replicationPayloads
    .map(p => p?.result?.timeSeries)
    .filter(ts => Array.isArray(ts) && ts.length > 0);

  if (allSeries.length === 0) return undefined;
  if (allSeries.length === 1) return allSeries[0];

  // Union of all time points, then sample evenly if too many
  const allTimes = new Set();
  for (const ts of allSeries) for (const pt of ts) allTimes.add(pt.t);
  let timeGrid = Array.from(allTimes).sort((a, b) => a - b);
  if (timeGrid.length > maxPoints) {
    const step = (timeGrid.length - 1) / (maxPoints - 1);
    timeGrid = Array.from({ length: maxPoints }, (_, i) => timeGrid[Math.round(i * step)]);
  }

  // Collect all key names across all reps
  const queueNames = new Set();
  const typeNames = new Set();
  for (const ts of allSeries) {
    for (const pt of ts) {
      for (const k of Object.keys(pt.byQueue || {})) queueNames.add(k);
      for (const k of Object.keys(pt.byType || {})) typeNames.add(k);
    }
  }

  // For each replication, do a single O(M) forward pass to find the last-known
  // snapshot at each grid time — avoids O(M×N) nested scan
  const repSnapshots = allSeries.map(ts => {
    const snaps = [];
    let j = 0;
    for (const gridT of timeGrid) {
      while (j < ts.length - 1 && ts[j + 1].t <= gridT) j++;
      snaps.push(ts[j].t <= gridT ? ts[j] : null);
    }
    return snaps;
  });

  // Average across replications at each grid point
  return timeGrid.map((t, gi) => {
    const byQueue = {};
    const byType = {};
    let sumWip = 0, sumCompleted = 0, wipCount = 0, completedCount = 0;
    for (const snaps of repSnapshots) {
      const pt = snaps[gi];
      if (pt == null) continue;
      if (typeof pt.wip === "number") { sumWip += pt.wip; wipCount++; }
      if (typeof pt.completed === "number") { sumCompleted += pt.completed; completedCount++; }
    }
    const wip = wipCount > 0 ? sumWip / wipCount : undefined;
    const completed = completedCount > 0 ? sumCompleted / completedCount : undefined;

    for (const qName of queueNames) {
      let sumWaiting = 0, sumTotal = 0, count = 0, waitSum = 0, waitN = 0;
      for (const snaps of repSnapshots) {
        const q = snaps[gi]?.byQueue?.[qName];
        if (q != null) {
          sumWaiting += q.waiting ?? 0; sumTotal += q.total ?? 0; count++;
          if (q.waitN) { waitSum += q.avgWait * q.waitN; waitN += q.waitN; }
        }
      }
      if (count > 0) byQueue[qName] = {
        waiting: sumWaiting / count,
        total: sumTotal / count,
        avgWait: waitN > 0 ? waitSum / waitN : null,
        waitN,
      };
    }

    for (const tName of typeNames) {
      let sumWaiting = 0, sumBusy = 0, sumIdle = 0, sumTotal = 0, count = 0;
      for (const snaps of repSnapshots) {
        const ty = snaps[gi]?.byType?.[tName];
        if (ty != null) { sumWaiting += ty.waiting ?? 0; sumBusy += ty.busy ?? 0; sumIdle += ty.idle ?? 0; sumTotal += ty.total ?? 0; count++; }
      }
      if (count > 0) byType[tName] = { waiting: sumWaiting / count, busy: sumBusy / count, idle: sumIdle / count, total: sumTotal / count };
    }

    return { t, byQueue, byType, ...(wip !== undefined ? { wip } : {}), ...(completed !== undefined ? { completed } : {}) };
  });
}

  return {
    snap: { clock: finalTime },
    timeSeries: precomputedTimeSeries !== undefined ? precomputedTimeSeries : averageBatchTimeSeries(replicationPayloads),
    waitDist,
    sojournDist,
    waitByArrival,
    perQueue,
    runtimeMetrics: {
      replications: replicationPayloads.length,
    },
    summary: {
      total,
      served,
      reneged,
      servedRatio: served > 0 && total > 0 ? +(served / total).toFixed(4) : null,
      numReplications: replicationPayloads.length,
      avgWait: aggregateStats["summary.avgWait"]?.mean ?? null,
      avgSvc: aggregateStats["summary.avgSvc"]?.mean ?? null,
      avgSojourn: aggregateStats["summary.avgSojourn"]?.mean ?? null,
      avgTimeInSystem: aggregateStats["summary.avgTimeInSystem"]?.mean ?? null,
      avgWIP: aggregateStats["summary.avgWIP"]?.mean ?? null,
      maxSojourn: aggregateStats["summary.maxSojourn"]?.mean ?? null,
      totalCost: aggregateStats["summary.totalCost"]?.mean ?? null,
      costPerServed: aggregateStats["summary.costPerServed"]?.mean ?? null,
      avgWaitByLittle: aggregateStats["summary.avgWaitByLittle"]?.mean ?? null,
      warmupPeriod,
      maxSimTime: maxTime,
      outcomes: Object.keys(outcomeAcc).length ? outcomeAcc : undefined,
      perResource,
      sections,
      journeys,
      queueJourneys,
      waitSamplesBreakdown: {
        served: summaries.reduce((s, sm) => s + (sm.waitSamplesBreakdown?.served || 0), 0),
        reneged: summaries.reduce((s, sm) => s + (sm.waitSamplesBreakdown?.reneged || 0), 0),
        inProgress: summaries.reduce((s, sm) => s + (sm.waitSamplesBreakdown?.inProgress || 0), 0),
      },
      terminatingState: (() => {
        const n = summaries.length || 1;
        const totalWaiting = summaries.reduce((s, sm) => s + (sm.terminatingState?.waitingAtEnd || 0), 0);
        const totalServing = summaries.reduce((s, sm) => s + (sm.terminatingState?.servingAtEnd || 0), 0);
        return {
          waitingAtEnd: Math.round(totalWaiting / n),
          servingAtEnd: Math.round(totalServing / n),
          wipPct: total > 0 ? Math.round(((totalWaiting + totalServing) / total) * 100) : 0,
        };
      })(),
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
    schema: "simmodlr.results.v1",
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

export function buildResultsCsv({ results, replicationResults = [], aggregateStats = {}, config = {} } = {}) {
  const rows = [["runLabel", "replicationIndex", "seed", "arrived", "served", "reneged", "completionRate", "avgWait", "avgSvc", "avgSojourn", "avgTimeInSystem", "totalCost", "costPerServed", "finalTime"]];

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
      row.summary.total,
      row.summary.served,
      row.summary.reneged,
      row.summary.servedRatio != null ? Math.round(row.summary.servedRatio * 100) + "%" : "",
      row.summary.avgWait,
      row.summary.avgSvc,
      row.summary.avgSojourn,
      row.summary.avgTimeInSystem,
      row.summary.totalCost,
      row.summary.costPerServed,
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


export function formatRunTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");
}

export function makeDefaultRunLabel(type = "Batch", date = new Date()) {
  return `${type} ${formatRunTimestamp(date)}`;
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
