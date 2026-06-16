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
    return {
      id: queue.id || queueName,
      label: queueName,
      points: timeSeries.map(entry => ({
        t: finiteNumber(entry?.t),
        value: finiteNumber(
          entry?.byQueue?.[queueName]?.waiting,
          finiteNumber(entry?.byType?.[fallbackType]?.waiting)
        ),
      })),
      source: timeSeries.some(entry => entry?.byQueue?.[queueName])
        ? "queue"
        : "type-fallback",
      sourceLabel: timeSeries.some(entry => entry?.byQueue?.[queueName])
        ? "Queue measurements taken during the run"
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
        value: finiteNumber(entry?.byType?.[server.name]?.total),
      })),
      sourceLabel: `Busy ${server.name} resources measured during the run, divided by actual capacity at each time point`,
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

export function buildChartSections(results = {}, model = {}, sectionFilter = null) {
  const queueDepthSeries = buildQueueDepthSeries(results, model, sectionFilter);
  const serverUtilizationSeries = buildServerUtilizationSeries(results, model, sectionFilter);
  const waitDistributions = buildWaitDistributions(results, model, sectionFilter);

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
    chartSections,
    runtimeMetrics,
  };
}
