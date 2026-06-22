// Pure results-shaping helpers for charts and result panels.
// Keep engine-shaped objects out of chart components where possible.

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function customerTypeForQueue(queue, model) {
  if (queue.customerType) return queue.customerType;
  const customerTypes = (model?.entityTypes || []).filter(et => et.role !== "server");
  if (customerTypes.length === 1) return customerTypes[0].name;
  return queue.name;
}

function maxPointValue(series) {
  return Math.max(0, ...((series?.points || []).map(p => finiteNumber(p.value))));
}

// A series whose every point is zero carries no information — hide it rather
// than render a flat line at zero.
function hasNonZeroValue(series) {
  return (series?.points || []).some(p => finiteNumber(p.value) !== 0);
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function buildRuntimeMetricsModel(results = {}) {
  const runtimeMetrics = results?.runtimeMetrics && typeof results.runtimeMetrics === "object"
    ? results.runtimeMetrics
    : {};
  const maxQueueLengthByQueue = runtimeMetrics?.max_queue_length_by_queue
    && typeof runtimeMetrics.max_queue_length_by_queue === "object"
    ? Object.entries(runtimeMetrics.max_queue_length_by_queue)
      .map(([queueName, depth]) => ({
        queueName,
        depth: finiteOrNull(depth),
      }))
      .filter(row => row.depth != null)
      .sort((a, b) => b.depth - a.depth || a.queueName.localeCompare(b.queueName))
    : [];

  const metrics = {
    wallClockMs: finiteOrNull(runtimeMetrics.wall_clock_ms),
    replications: finiteOrNull(runtimeMetrics.replications),
    eventsProcessed: finiteOrNull(runtimeMetrics.events_processed),
    cEventScans: finiteOrNull(runtimeMetrics.c_event_scans),
    cEventsFired: finiteOrNull(runtimeMetrics.c_events_fired),
    entitiesCreated: finiteOrNull(runtimeMetrics.entities_created),
    entitiesCompleted: finiteOrNull(runtimeMetrics.entities_completed),
    maxQueueLengthByQueue,
  };

  const hasMetrics = Object.values(metrics).some(value => (
    Array.isArray(value) ? value.length > 0 : value != null
  ));

  return {
    hasMetrics,
    metrics,
  };
}

export function buildQueueDepthSeries(results = {}, model = {}, sectionFilter = null) {
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];
  const queues = Array.isArray(model?.queues) ? model.queues : [];
  const filteredQueues = sectionFilter
    ? queues.filter(q => sectionFilter.shouldInclude(q.id))
    : queues;

  return filteredQueues.map(queue => {
    const queueName = queue.name || queue.id || "Queue";
    const fallbackType = customerTypeForQueue(queue, model);
    const hasQueueData = timeSeries.some(entry => entry?.byQueue?.[queueName]);
    const hasAnyQueueData = timeSeries.some(entry => Object.keys(entry?.byQueue || {}).length > 0);
    return {
      id: queue.id || queueName,
      label: queueName,
      points: timeSeries.map(entry => ({
        t: finiteNumber(entry?.t),
        value: hasQueueData
          ? finiteNumber(entry?.byQueue?.[queueName]?.waiting)
          : hasAnyQueueData
            ? 0
            : finiteNumber(entry?.byQueue?.[queueName]?.waiting ?? entry?.byType?.[fallbackType]?.waiting),
      })),
      source: hasQueueData ? "queue" : hasAnyQueueData ? "queue-empty" : "type-fallback",
      sourceLabel: hasQueueData
        ? "Queue measurements taken during the run"
        : hasAnyQueueData
          ? `No ${queueName} data — queue was always empty`
          : `Fallback from ${fallbackType} waiting counts`,
    };
  });
}

export function buildServerUtilizationSeries(results = {}, model = {}, sectionFilter = null) {
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];
  const serverTypes = (model?.entityTypes || []).filter(et => et.role === "server");
  const filteredServers = sectionFilter
    ? serverTypes.filter(s => sectionFilter.shouldInclude(s.id))
    : serverTypes;

  return filteredServers.map(server => {
    const hasShiftSchedule = Array.isArray(server.shiftSchedule) && server.shiftSchedule.length > 0;
    return {
      id: server.id || server.name,
      label: server.name,
      hasShiftSchedule,
      isPercent: true,
      points: timeSeries.map(entry => {
        const busy = finiteNumber(entry?.byType?.[server.name]?.busy);
        const total = finiteNumber(entry?.byType?.[server.name]?.total);
        return {
          t: finiteNumber(entry?.t),
          value: total > 0 ? (busy / total) * 100 : 0,
        };
      }),
      capacitySeries: timeSeries.map(entry => ({
        t: finiteNumber(entry?.t),
        value: finiteNumber(entry?.byType?.[server.name]?.total) - finiteNumber(entry?.byType?.[server.name]?.failed),
      })),
      sourceLabel: `Busy ${server.name} resources measured during the run, divided by actual capacity at each time point`,
    };
  });
}

export function buildWaitTimeSeries(results = {}, model = {}, sectionFilter = null) {
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];
  const queues = Array.isArray(model?.queues) ? model.queues : [];
  const filteredQueues = sectionFilter
    ? queues.filter(q => sectionFilter.shouldInclude(q.id))
    : queues;

  return filteredQueues.map(queue => {
    const queueName = queue.name || queue.id || "Queue";
    const points = timeSeries
      .filter(entry => entry?.byQueue?.[queueName]?.avgWait != null)
      .map(entry => ({
        t: finiteNumber(entry?.t),
        value: finiteOrNull(entry.byQueue[queueName].avgWait),
      }))
      .filter(p => p.value != null);
    return {
      id: queue.id || queueName,
      label: queueName,
      points,
      hasData: points.length >= 2,
      sourceLabel: "Average wait of entities that cleared the queue since the previous sample, on the same time axis as queue depth",
    };
  });
}

export function buildWaitDistributions(results = {}, model = {}, sectionFilter = null) {
  const waitDist = results?.waitDist && typeof results.waitDist === "object" ? results.waitDist : {};
  const queues = Array.isArray(model?.queues) ? model.queues : [];
  const nameToId = Object.fromEntries(queues.map(q => [q.name, q.id]));
  const breakdown = results?.summary?.waitSamplesBreakdown;
  const sourceSuffix = breakdown
    ? ` (${breakdown.served} served, ${breakdown.reneged} reneged${breakdown.inProgress > 0 ? `, ${breakdown.inProgress} in-progress` : ""})`
    : " from completed customers";
  return Object.entries(waitDist)
    .filter(([label, dist]) => {
      if (!dist) return false;
      if (sectionFilter) {
        const qid = nameToId[label];
        if (!qid || !sectionFilter.shouldInclude(qid)) return false;
      }
      return (
        (Array.isArray(dist.values) && dist.values.length >= 2) ||
        (Array.isArray(dist.histogram?.bins) && dist.histogram.bins.length >= 2)
      );
    })
    .map(([label, dist]) => {
      const values = Array.isArray(dist.values)
        ? [...dist.values].map(v => finiteNumber(v)).sort((a, b) => a - b)
        : [];
      const n = finiteNumber(dist.n, values.length);
      return {
        label,
        n,
        mean: finiteNumber(dist.mean),
        p50: finiteNumber(dist.p50),
        p90: finiteNumber(dist.p90),
        p95: finiteNumber(dist.p95),
        p99: finiteNumber(dist.p99),
        values,
        histogram: dist.histogram || null,
        sourceLabel: `${n} wait samples${sourceSuffix}`,
      };
    });
}

const ARRIVAL_BUCKET_COUNT = 24;

// Bin raw [arrivalTime, totalWait] points into evenly-spaced arrival-time
// buckets for charting. Mirrors the persistence-layer compaction in
// src/db/results-persistence.js (compactifyArrivalSeries) so saved/compacted
// runs (which arrive pre-binned as { buckets: [...] }) render identically to
// freshly-run "full" detail results (which arrive as raw points).
function binArrivalPoints(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const minT = sorted[0][0];
  const maxT = sorted[sorted.length - 1][0];
  if (maxT <= minT) {
    const mean = sorted.reduce((sum, [, w]) => sum + w, 0) / sorted.length;
    return [{ t: minT, value: mean, n: sorted.length }];
  }
  const bucketWidth = (maxT - minT) / ARRIVAL_BUCKET_COUNT;
  const sums = new Array(ARRIVAL_BUCKET_COUNT).fill(0);
  const counts = new Array(ARRIVAL_BUCKET_COUNT).fill(0);
  for (const [t, w] of sorted) {
    const idx = Math.min(ARRIVAL_BUCKET_COUNT - 1, Math.floor((t - minT) / bucketWidth));
    sums[idx] += w;
    counts[idx]++;
  }
  const out = [];
  for (let i = 0; i < ARRIVAL_BUCKET_COUNT; i++) {
    if (counts[i] === 0) continue;
    out.push({ t: minT + (i + 0.5) * bucketWidth, value: sums[i] / counts[i], n: counts[i] });
  }
  return out;
}

export function buildWaitByArrival(results = {}) {
  const data = results?.waitByArrival;
  const points = Array.isArray(data)
    ? (data.length > 0 ? binArrivalPoints(data) : [])
    : Array.isArray(data?.buckets)
      ? data.buckets.map(b => ({ t: finiteNumber(b.t), value: finiteNumber(b.mean), n: finiteNumber(b.n) }))
      : [];
  return { points, hasData: points.length >= 2 };
}

const CHART_BUCKET_COUNT = 60;

// Bin { t, value } points into evenly-spaced time buckets, for smoothing
// dense/jagged raw time series in charts. Unlike binArrivalPoints, this is
// chart-display-only: callers keep the raw points around separately (e.g. as
// series.points) for stats/CSV/data-preview, and only feed this binned output
// to the chart itself. Returns the input unchanged if it's already small.
export function binSeriesPoints(points, { aggregate = "avg" } = {}) {
  if (!Array.isArray(points) || points.length <= CHART_BUCKET_COUNT) return points;
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const minT = sorted[0].t;
  const maxT = sorted[sorted.length - 1].t;
  if (maxT <= minT) return sorted;
  const bucketWidth = (maxT - minT) / CHART_BUCKET_COUNT;
  const sums = new Array(CHART_BUCKET_COUNT).fill(0);
  const counts = new Array(CHART_BUCKET_COUNT).fill(0);
  for (const p of sorted) {
    const idx = Math.min(CHART_BUCKET_COUNT - 1, Math.floor((p.t - minT) / bucketWidth));
    sums[idx] += p.value;
    counts[idx]++;
  }
  const out = [];
  for (let i = 0; i < CHART_BUCKET_COUNT; i++) {
    if (counts[i] === 0) continue;
    const t = minT + (i + 0.5) * bucketWidth;
    out.push({ t, value: aggregate === "sum" ? sums[i] : sums[i] / counts[i] });
  }
  return out;
}

export function buildWipSeries(results = {}) {
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];
  const points = timeSeries
    .filter(entry => entry?.wip != null)
    .map(entry => ({ t: finiteNumber(entry.t), value: finiteNumber(entry.wip) }));
  return [{
    id: "wip",
    label: "Entities in system",
    points,
    chartPoints: binSeriesPoints(points, { aggregate: "avg" }),
    hasData: points.length >= 2,
    sourceLabel: "Count of entities in the model (excluding servers, completed, and reneged entities) at each sampled time point",
  }];
}

export function buildThroughputSeries(results = {}) {
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];
  const points = timeSeries
    .filter(entry => entry?.completed != null)
    .map(entry => ({ t: finiteNumber(entry.t), value: finiteNumber(entry.completed) }));
  return [{
    id: "throughput",
    label: "Completions per interval",
    points,
    chartPoints: binSeriesPoints(points, { aggregate: "sum" }),
    hasData: points.length >= 2,
    sourceLabel: "Entities that completed (excluding reneges) since the previous sampled time point",
  }];
}

export function buildSystemSojournDistribution(results = {}) {
  const dist = results?.sojournDist;
  if (!dist) return [];
  const values = Array.isArray(dist.values)
    ? [...dist.values].map(v => finiteNumber(v)).sort((a, b) => a - b)
    : [];
  const hasHistogram = Array.isArray(dist.histogram?.bins) && dist.histogram.bins.length >= 2;
  if (!(values.length >= 2 || hasHistogram)) return [];
  const n = finiteNumber(dist.n, values.length);
  return [{
    label: "Whole-journey sojourn time",
    n,
    mean: finiteNumber(dist.mean),
    p50: finiteNumber(dist.p50),
    p90: finiteNumber(dist.p90),
    p95: finiteNumber(dist.p95),
    p99: finiteNumber(dist.p99),
    values,
    histogram: dist.histogram || null,
    sourceLabel: `${n} entity sojourn times (arrival to completion, across the whole system)`,
  }];
}

export function buildChartSections(results = {}, model = {}, sectionFilter = null) {
  const queueDepthSeries = buildQueueDepthSeries(results, model, sectionFilter).filter(hasNonZeroValue);
  const serverUtilizationSeries = buildServerUtilizationSeries(results, model, sectionFilter).filter(hasNonZeroValue);
  const waitDistributions = buildWaitDistributions(results, model, sectionFilter);
  const waitTimeSeries = buildWaitTimeSeries(results, model, sectionFilter).filter(s => s.hasData && hasNonZeroValue(s));
  const waitByArrival = buildWaitByArrival(results);
  const wipSeries = buildWipSeries(results).filter(s => s.hasData && hasNonZeroValue(s));
  const throughputSeries = buildThroughputSeries(results).filter(s => s.hasData && hasNonZeroValue(s));
  const systemSojournDistributions = buildSystemSojournDistribution(results);
  const hasNonZeroWaitByArrival = waitByArrival.hasData && hasNonZeroValue(waitByArrival);

  return [
    {
      id: "wait-distribution",
      title: "Waiting time distribution",
      question: "How much time is spent queueing?",
      method: "Shows the range of completed waiting times, with percentile markers.",
      emptyMessage: "Complete at least two customer waits to see wait-time distributions.",
      distributions: waitDistributions,
      maxValue: Math.max(0, ...waitDistributions.map(d => finiteNumber(d.p99))),
    },
    {
      id: "server-utilization",
      title: "How busy each resource was over time",
      question: "How busy are resources?",
      method: "Shows the percentage of each resource pool that was busy over time. 100% means all resources were in use simultaneously. Capacity and any shift patterns are noted below each chart.",
      emptyMessage: "Add a server/resource type and run with Detailed output enabled to see utilisation.",
      series: serverUtilizationSeries,
      maxValue: Math.max(0, ...serverUtilizationSeries.map(maxPointValue)),
    },
    {
      id: "queue-depth",
      title: "How queue size changed over time",
      question: "Where do queues build up?",
      method: "Shows how many entities were waiting as the run progressed.",
      emptyMessage: "Run with Detailed output enabled to see queue depth over time.",
      series: queueDepthSeries,
      maxValue: Math.max(0, ...queueDepthSeries.map(maxPointValue)),
    },
    {
      id: "wait-over-time",
      title: "How average wait time changed over time",
      question: "When did waits get longer?",
      method: "Shows the average wait of entities that finished waiting in each sampled time window, on the same time axis as queue depth.",
      emptyMessage: "Run with Detailed output enabled to see wait time over time.",
      series: waitTimeSeries,
      maxValue: Math.max(0, ...waitTimeSeries.map(maxPointValue)),
    },
    {
      id: "wait-by-arrival-attr",
      title: "Wait time by arrival time",
      question: "Did wait get worse for entities that arrived later?",
      method: "Shows each completed entity's total wait (across every queue it passed through), bucketed by when it arrived. This is a whole-journey view, not scoped to a single queue.",
      emptyMessage: "Run with Detailed output enabled to see wait by arrival time.",
      series: hasNonZeroWaitByArrival ? waitByArrival.points : [],
    },
    {
      id: "system-wip",
      title: "Entities in system over time",
      question: "How many entities are in the system at once?",
      method: "Shows the number of entities present in the model (waiting, in service, or otherwise in progress) at each sampled time point. A system-wide measure, not scoped to a single queue or resource.",
      emptyMessage: "Run with Detailed output enabled to see entities in system over time.",
      series: wipSeries,
      maxValue: Math.max(0, ...wipSeries.map(maxPointValue)),
    },
    {
      id: "system-throughput",
      title: "Throughput over time",
      question: "How many entities complete per interval?",
      method: "Shows the number of entities that completed (excluding reneges) since the previous sampled time point, on the same time axis as the other system trend charts.",
      emptyMessage: "Run with Detailed output enabled to see throughput over time.",
      series: throughputSeries,
      maxValue: Math.max(0, ...throughputSeries.map(maxPointValue)),
    },
    {
      id: "system-sojourn",
      title: "System-wide sojourn-time distribution",
      question: "How long do entities spend in the system overall?",
      method: "Shows the range of total time-in-system (arrival to completion) across every completed entity, pooled across all queues and stages.",
      emptyMessage: "Complete at least two entities to see the system-wide sojourn-time distribution.",
      distributions: systemSojournDistributions,
      maxValue: Math.max(0, ...systemSojournDistributions.map(d => finiteNumber(d.p99))),
    },
  ];
}

export function resolveSectionFilter(model, sectionIds) {
  if (!Array.isArray(sectionIds) || sectionIds.length === 0) return null;
  const sections = Array.isArray(model?.sections) ? model.sections : [];
  const queues = Array.isArray(model?.queues) ? model.queues : [];
  const entityTypes = Array.isArray(model?.entityTypes) ? model.entityTypes : [];
  const allQueueIds = new Set(queues.map(q => q.id));
  const allTypeIds = new Set(entityTypes.map(et => et.id));

  if (sectionIds.includes("unassigned")) {
    const assignedIds = new Set(sections.flatMap(s => s.memberIds || []));
    return {
      shouldInclude: (id) => (allQueueIds.has(id) || allTypeIds.has(id)) && !assignedIds.has(id),
    };
  }
  const memberSet = new Set();
  for (const sid of sectionIds) {
    const section = sections.find(s => s.id === sid);
    if (section?.memberIds) section.memberIds.forEach(id => memberSet.add(id));
  }
  if (memberSet.size === 0) return null;
  return {
    shouldInclude: (id) => memberSet.has(id),
  };
}

export function buildResultsViewModel(results = {}, model = {}, options = {}) {
  const { activeSectionIds } = options;
  const sectionFilter = resolveSectionFilter(model, activeSectionIds);
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];
  const chartSections = buildChartSections(results, model, sectionFilter);
  const runtimeMetrics = buildRuntimeMetricsModel(results);
  return {
    hasTimeSeries: timeSeries.length > 0,
    queueDepthSeries: chartSections.find(s => s.id === "queue-depth")?.series || [],
    serverUtilizationSeries: chartSections.find(s => s.id === "server-utilization")?.series || [],
    waitDistributions: chartSections.find(s => s.id === "wait-distribution")?.distributions || [],
    waitTimeSeries: chartSections.find(s => s.id === "wait-over-time")?.series || [],
    chartSections,
    runtimeMetrics,
  };
}
