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

function extractQueues(model = {}, summary = {}) {
  const queues = Array.isArray(model.queues) ? model.queues : [];
  if (!queues.length) {
    return [{
      name: "Overall",
      meanWait: finiteOrNull(summary.avgWait),
      maxWait: finiteOrNull(summary.maxWait),
      renegeRate: summary.total ? finiteOrNull((summary.reneged || 0) / summary.total) : null,
    }];
  }

  return queues.map(queue => ({
    name: queue.name || queue.id || "Queue",
    meanWait: finiteOrNull(summary.avgWait),
    maxWait: finiteOrNull(summary.maxWait),
    renegeRate: summary.total ? finiteOrNull((summary.reneged || 0) / summary.total) : null,
  }));
}

function extractResources(model = {}, summary = {}) {
  const servers = (model.entityTypes || []).filter(entity => entity.role === "server");
  return servers.map(server => ({
    name: server.name || server.id || "Server",
    utilisation: finiteOrNull(summary.resourceUtilisation?.[server.name] ?? summary.utilisation),
    busyCount: finiteOrNull(summary.busyCount),
  }));
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
    queues: extractQueues(model, summary),
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
  const system = "You are an expert simulation analyst. Interpret the following discrete-event simulation results for a non-specialist audience. Be concise: 150-200 words. Use plain English.";
  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
    },
    experiment: extractExperiment(experimentConfig),
    kpis: buildKpis(model, results),
    aggregateStats: results.aggregateStats || {},
  };

  return {
    kind: "narrative",
    messages: makeMessages(
      system,
      payload,
      "Highlight the most significant findings. Flag any queues where mean wait exceeds 2 x service time as possible overload."
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

export function promptWordEstimate(prompt) {
  const text = (prompt?.messages || []).map(message => message.content).join(" ");
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
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
