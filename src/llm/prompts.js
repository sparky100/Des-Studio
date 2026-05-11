const DEFAULT_MODEL_NAME = "Untitled model";
const MAX_PROMPT_WORDS = 1500;

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function truncateWords(text, maxWords = MAX_PROMPT_WORDS) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")} ...`;
}

function getSummary(results = {}) {
  return results.summary || results.results?.summary || {};
}

function extractQueues(model = {}, results = {}) {
  const summary = getSummary(results);
  const queues = Array.isArray(model.queues) ? model.queues : [];
  const waitDist = results.waitDist || {};
  const perQueue = results.perQueue || {};

  if (!queues.length) {
    return [{
      name: "Overall",
      meanWait: finiteOrNull(summary.avgWait),
      maxWait: finiteOrNull(summary.maxWait),
      p95: null,
      p99: null,
      renegeRate: summary.total ? finiteOrNull((summary.reneged || 0) / summary.total) : null,
      blockingCount: null,
      balkCount: null,
    }];
  }

    return queues.map(queue => {
      const qName = queue.name || queue.id || "Queue";
      const wd = waitDist[qName] || {};
      const pq = perQueue[qName] || {};
      return {
        name: qName,
        discipline: queue.discipline || "FIFO",
        capacity: queue.capacity ?? null,
        customerType: queue.customerType || null,
        meanWait: finiteOrNull(wd.mean),
        maxWait: finiteOrNull(summary.maxWait),
        p50: finiteOrNull(wd.p50),
        p90: finiteOrNull(wd.p90),
        p95: finiteOrNull(wd.p95),
        p99: finiteOrNull(wd.p99),
        nServed: finiteOrNull(wd.n),
        renegeRate: summary.total ? finiteOrNull((summary.reneged || 0) / summary.total) : null,
        blockingCount: finiteOrNull(pq.blockingCount),
        balkCount: finiteOrNull(pq.balkCount),
      };
    });
}

function extractResources(model = {}, summary = {}) {
  const servers = (model.entityTypes || []).filter(entity => entity.role === "server");
  return servers.map(server => {
    const pr = summary.perResource?.[server.name];
    return {
      name: server.name || server.id || "Server",
      utilisation: finiteOrNull(pr?.utilisation ?? summary.resourceUtilisation?.[server.name] ?? summary.utilisation),
      busyCount: finiteOrNull(pr?.busyCount ?? summary.busyCount),
      idleCount: finiteOrNull(pr?.idleCount),
      totalServers: finiteOrNull(pr?.total),
    };
  });
}

function extractExperiment(experimentConfig = {}) {
  return {
    warmup: experimentConfig.warmupPeriod ?? experimentConfig.warmup ?? 0,
    runDuration: experimentConfig.maxSimTime ?? experimentConfig.runDuration ?? null,
    replications: experimentConfig.replications ?? 1,
    seed: experimentConfig.seed ?? null,
    terminationMode: experimentConfig.terminationMode ?? "time",
  };
}

function buildKpis(model = {}, results = {}) {
  const summary = getSummary(results);
  return {
    queues: extractQueues(model, results),
    resources: extractResources(model, summary),
    throughput: finiteOrNull(summary.served ?? summary.throughput),
    totalEntities: finiteOrNull(summary.total),
    served: finiteOrNull(summary.served),
    reneged: finiteOrNull(summary.reneged),
    avgWait: finiteOrNull(summary.avgWait),
    avgService: finiteOrNull(summary.avgSvc),
    avgSojourn: finiteOrNull(summary.avgSojourn),
  };
}

function goalsToPrompt(model = {}) {
  const goals = model.goals || [];
  if (!goals.length) return null;
  return goals.filter(g => g.metric && g.target).map(g => ({
    metric: g.metric,
    target: parseFloat(g.target),
    operator: g.operator || "<",
    label: g.label || `${g.metric} ${g.operator} ${g.target}`,
  }));
}

function makeMessages(system, payload, instruction) {
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: truncateWords(JSON.stringify({ ...payload, instruction }, null, 2)),
    },
  ];
}

export function buildNarrativePrompt(model = {}, experimentConfig = {}, results = {}) {
  const system = "You are an expert simulation analyst. Interpret the following discrete-event simulation results for a non-specialist audience. Be concise: 150-200 words. Use plain English. You have per-queue wait percentiles (p50, p90, p95, p99), per-resource utilisation and idle counts, and per-queue blocking/balking counters.";
  const waitDist = results.waitDist || {};
  const waitDistForPrompt = Object.keys(waitDist).length
    ? Object.fromEntries(Object.entries(waitDist).map(([q, w]) => [q, { n: w.n, mean: w.mean, p50: w.p50, p90: w.p90, p95: w.p95, p99: w.p99 }]))
    : undefined;
  const perQueue = results.perQueue || {};
  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
      goals: goalsToPrompt(model),
    },
    experiment: extractExperiment(experimentConfig),
    kpis: buildKpis(model, results),
    waitDist: waitDistForPrompt,
    perQueue: Object.keys(perQueue).length ? perQueue : undefined,
    aggregateStats: results.aggregateStats || {},
  };

  const goalsInstr = model.goals?.length
    ? " Performance goals were set for this model. Assess each goal against the results and note whether it was met or missed."
    : "";

  return {
    kind: "narrative",
    messages: makeMessages(
      system,
      payload,
      "Highlight the most significant findings. Flag any queues where mean wait exceeds 2 x service time as possible overload. Use per-queue percentiles to distinguish between typical and extreme waits." + goalsInstr
    ),
    max_tokens: 450,
  };
}

export function buildComparisonPrompt(modelName = DEFAULT_MODEL_NAME, runA = {}, runB = {}) {
  const system = "You are an expert simulation analyst. Compare the two simulation runs below and explain the key differences to a non-specialist. Be concise: 200-250 words. Use an Option A / Option B frame.";
  const payload = {
    modelName: modelName || DEFAULT_MODEL_NAME,
    runA,
    runB,
  };

  return {
    kind: "comparison",
    messages: makeMessages(
      system,
      payload,
      "Compare the two runs side by side. Identify meaningful differences, likely tradeoffs, and any result that is too uncertain to interpret confidently."
    ),
    max_tokens: 550,
  };
}

export function buildSensitivityPrompt(modelName = DEFAULT_MODEL_NAME, experimentConfig = {}, ciResults = []) {
  const system = "You are an expert simulation analyst. Explain the statistical uncertainty in the following simulation results. Identify which KPIs have wide confidence intervals and what this implies for decision-making. Be concise: 150-200 words.";
  const payload = {
    modelName: modelName || DEFAULT_MODEL_NAME,
    experiment: extractExperiment(experimentConfig),
    confidenceIntervals: ciResults,
  };

  return {
    kind: "sensitivity",
    messages: makeMessages(
      system,
      payload,
      "Focus on uncertainty, confidence interval width, and which conclusions are robust enough to act on."
    ),
    max_tokens: 450,
  };
}

export function buildSuggestionPrompt(model = {}, experimentConfig = {}, results = {}) {
  const system = "You are an expert simulation analyst. Given a model and its run results, suggest specific structural changes to improve performance. Be concise: 150-200 words. Recommend concrete numeric changes (e.g. 'increase capacity from 2 to 3', 'add a server'). You have per-queue wait percentile data (p50, p90, p95, p99), per-resource utilisation and idle count, and per-queue blocking/balking counters. Use these to pinpoint the bottleneck precisely.";
  const entityTypes = (model.entityTypes || []).map(e => ({ name: e.name, role: e.role, count: e.count }));
  const queues = (model.queues || []).map(q => ({ name: q.name, discipline: q.discipline, capacity: q.capacity, customerType: q.customerType }));
  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
      goals: goalsToPrompt(model),
      entityTypes,
      queues,
      flowSummary: queues
        .filter(q => q.customerType)
        .map(q => `${q.customerType} entities wait in queue '${q.name}'`)
        .join("; ") || "No queue-entity associations defined.",
    },
    experiment: extractExperiment(experimentConfig),
    kpis: buildKpis(model, results),
    waitDist: results.waitDist || {},
    perQueue: results.perQueue || {},
  };

  const suggestionGoals = model.goals?.length
    ? " Performance goals were defined for this model — your recommendations should prioritise changes that help meet those goals."
    : "";
  return {
    kind: "suggestion",
    messages: makeMessages(
      system,
      payload,
      "Based on the KPI data, identify the primary bottleneck and recommend a specific model change. Consider per-queue wait percentiles (p50, p90, p95), per-resource utilisation, and blocking/balking counters. State the expected impact (e.g. 'mean wait would drop from 8.2 to ~4.5'). If multiple changes are needed, prioritise the single most impactful one." + suggestionGoals
    ),
    max_tokens: 450,
  };
}

export function promptWordEstimate(prompt) {
  const text = (prompt?.messages || []).map(message => message.content).join(" ");
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}

export function buildResultsQueryPrompt(question, model = {}, results = {}, conversationHistory = []) {
  const system = "You are a simulation results analyst. Answer questions about the simulation run using only the provided KPI data. You have per-queue wait percentiles (p50, p90, p95, p99), per-resource utilisation and idle counts, and per-queue blocking/balking counters. Be concise and specific — always cite exact KPI values. If the data does not contain the answer, say so clearly. Never invent numbers.";
  const summary = getSummary(results);
  const kpis = buildKpis(model, results);
  const entityTypes = (model.entityTypes || []).map(e => ({ name: e.name, role: e.role }));
  const queues = (model.queues || []).map(q => ({
    name: q.name,
    discipline: q.discipline,
    capacity: q.capacity,
    customerType: q.customerType,
  }));

  const waitDist = results.waitDist || {};
  const perQueue = results.perQueue || {};
  const waitDistForPrompt = Object.keys(waitDist).length
    ? Object.fromEntries(Object.entries(waitDist).map(([q, w]) => [q, { n: w.n, mean: w.mean, p50: w.p50, p90: w.p90, p95: w.p95, p99: w.p99 }]))
    : null;

  const dataPayload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
      entityTypes,
      queues,
      stateVariables: (model.stateVariables || []).map(v => ({ name: v.name, initialValue: v.initialValue })),
    },
    kpis,
    summary: {
      warmupPeriod: summary.warmupPeriod,
      maxSimTime: summary.maxSimTime,
      totalEntities: summary.total,
      served: summary.served,
      reneged: summary.reneged,
      avgWait: summary.avgWait,
      avgService: summary.avgSvc,
      avgSojourn: summary.avgSojourn,
    },
    waitDist: waitDistForPrompt,
    perQueue: Object.keys(perQueue).length ? perQueue : null,
    timeSeriesAvailable: !!(Array.isArray(results.timeSeries) && results.timeSeries.length > 0),
  };

  const messages = [
    { role: "system", content: system },
    ...conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: "user",
      content: truncateWords(JSON.stringify({
        data: dataPayload,
        question,
      }, null, 2)),
    },
  ];

  return {
    kind: "query",
    messages,
    max_tokens: 600,
  };
}

export function buildCiResults(aggregateStats = {}) {
  return Object.entries(aggregateStats)
    .filter(([, stat]) => stat && stat.n >= 2)
    .map(([name, stat]) => ({
      name,
      mean: finiteOrNull(stat.mean),
      ci95Lower: finiteOrNull(stat.lower),
      ci95Upper: finiteOrNull(stat.upper),
      stdDev: finiteOrNull(stat.stdDev),
      n: stat.n,
    }));
}
