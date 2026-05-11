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

export function buildQueueDepthSeries(results = {}, model = {}) {
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];
  const queues = Array.isArray(model?.queues) ? model.queues : [];

  return queues.map(queue => {
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
        ? "Queue-specific runtime counts"
        : `Fallback from ${fallbackType} waiting counts`,
    };
  });
}

export function buildServerUtilizationSeries(results = {}, model = {}) {
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];
  const serverTypes = (model?.entityTypes || []).filter(et => et.role === "server");

  return serverTypes.map(server => {
    const capacity = Math.max(1, parseInt(server.count || "1", 10) || 1);
    return {
      id: server.id || server.name,
      label: server.name,
      capacity,
      points: timeSeries.map(entry => ({
        t: finiteNumber(entry?.t),
        value: finiteNumber(entry?.byType?.[server.name]?.busy) / capacity,
      })),
      sourceLabel: `Busy ${server.name} resources divided by capacity ${capacity}`,
    };
  });
}

export function buildWaitDistributions(results = {}) {
  const waitDist = results?.waitDist && typeof results.waitDist === "object" ? results.waitDist : {};
  return Object.entries(waitDist)
    .filter(([, dist]) => dist && Array.isArray(dist.values) && dist.values.length >= 2)
    .map(([label, dist]) => ({
      label,
      n: finiteNumber(dist.n, dist.values.length),
      mean: finiteNumber(dist.mean),
      p50: finiteNumber(dist.p50),
      p90: finiteNumber(dist.p90),
      p95: finiteNumber(dist.p95),
      p99: finiteNumber(dist.p99),
      values: [...dist.values].map(v => finiteNumber(v)).sort((a, b) => a - b),
      sourceLabel: `${finiteNumber(dist.n, dist.values.length)} completed waits from engine waitDist`,
    }));
}

export function buildChartSections(results = {}, model = {}) {
  const queueDepthSeries = buildQueueDepthSeries(results, model);
  const serverUtilizationSeries = buildServerUtilizationSeries(results, model);
  const waitDistributions = buildWaitDistributions(results);

  return [
    {
      id: "queue-depth",
      title: "Queue Depth Over Time",
      question: "Where are queues forming?",
      method: "Counts waiting entities after each Three-Phase cycle stabilises.",
      emptyMessage: "Run with Detailed output enabled to see queue depth over time.",
      series: queueDepthSeries,
      maxValue: Math.max(0, ...queueDepthSeries.map(maxPointValue)),
    },
    {
      id: "server-utilization",
      title: "Server Utilisation Over Time",
      question: "Are resources under- or over-utilised?",
      method: "Normalises busy resource counts by each server pool capacity.",
      emptyMessage: "Add a server/resource type and run with Detailed output enabled to see utilisation.",
      series: serverUtilizationSeries,
      maxValue: Math.max(0, ...serverUtilizationSeries.map(maxPointValue)),
    },
    {
      id: "wait-distribution",
      title: "Wait Time Distribution",
      question: "How variable is customer waiting time?",
      method: "Uses completed entity waits grouped by queue, with percentile markers.",
      emptyMessage: "Complete at least two customer waits to see wait-time distributions.",
      distributions: waitDistributions,
      maxValue: Math.max(0, ...waitDistributions.map(d => finiteNumber(d.p99))),
    },
  ];
}

export function buildResultsViewModel(results = {}, model = {}) {
  const timeSeries = Array.isArray(results?.timeSeries) ? results.timeSeries : [];
  const chartSections = buildChartSections(results, model);
  return {
    hasTimeSeries: timeSeries.length > 0,
    queueDepthSeries: chartSections.find(s => s.id === "queue-depth")?.series || [],
    serverUtilizationSeries: chartSections.find(s => s.id === "server-utilization")?.series || [],
    waitDistributions: chartSections.find(s => s.id === "wait-distribution")?.distributions || [],
    chartSections,
  };
}
