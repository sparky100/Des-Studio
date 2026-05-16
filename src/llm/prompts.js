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

export function buildGoalGaps(model = {}, aggregateStats = {}) {
  const goals = model.goals || [];
  if (!goals.length) return [];
  return goals.map(g => {
    const stat = aggregateStats[g.metric];
    const current = stat?.mean ?? null;
    if (current === null) return { metric: g.metric, current: null, target: g.target, gap: null, met: false };
    const met = g.operator === '<'  ? current < g.target
              : g.operator === '<=' ? current <= g.target
              : g.operator === '>'  ? current > g.target
              : g.operator === '>=' ? current >= g.target
              : current === g.target;
    const gap = g.operator === '<' || g.operator === '<=' ? current - g.target : g.target - current;
    return { metric: g.metric, label: g.label || g.metric, current: finiteOrNull(current), target: g.target, gap: finiteOrNull(gap), met };
  });
}

export function buildSuggestionPrompt(model = {}, experimentConfig = {}, results = {}) {
  const system = [
    "You are an expert simulation analyst. Analyse the model and run results using this 6-step chain-of-thought:",
    "1. Binding constraint — identify the single KPI furthest from its goal (or the worst bottleneck if no goals).",
    "2. Cause — explain the mechanism (utilisation, queue discipline, capacity, arrival rate, etc.).",
    "3. Proposed change — state a concrete, numeric model change (entity count, queue capacity, or state variable value).",
    "4. Predicted effect — estimate the new KPI value after the change.",
    "5. Goal impact — state whether each goal would be MET or MISSED after the change.",
    "6. Ranking — if multiple changes are possible, rank them by expected goal impact.",
    "",
    "Output your response as a JSON block wrapped in ```json ... ``` fences with this schema:",
    '{ "analysis": "<narrative string>", "suggestions": [ { "rank": 1, "constraint": "<KPI = value (goal: op target)>", "cause": "<mechanism>", "change": { "type": "<entityTypeCount|queueCapacity|stateVariable|manual>", "target": "<name>", "from": <number>, "to": <number> }, "predicted": "<new KPI range>", "goalImpact": "<goal label MET|MISSED>", "confidence": "<high|medium|low>" } ] }',
    "",
    "Use type 'manual' for structural changes that cannot be expressed as a single numeric field update.",
    "Include the full narrative in the top-level 'analysis' field.",
    "You have per-queue wait percentiles (p50, p90, p95, p99), per-resource utilisation, failure model, and per-queue blocking/balking data.",
  ].join("\n");

  const entityTypes = (model.entityTypes || []).map(e => ({
    name: e.name,
    role: e.role,
    count: e.count ?? null,
    failureModel: e.failureModel ?? null,
  }));
  const queues = (model.queues || []).map(q => ({
    name: q.name,
    discipline: q.discipline,
    capacity: q.capacity ?? null,
    customerType: q.customerType ?? null,
  }));
  const goalGaps = buildGoalGaps(model, results.aggregateStats || {});
  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
      goals: goalsToPrompt(model),
      goalGaps: goalGaps.length ? goalGaps : undefined,
      entityTypes,
      queues,
      stateVariables: (model.stateVariables || []).map(v => ({ name: v.name, initialValue: v.initialValue })),
      flowSummary: queues
        .filter(q => q.customerType)
        .map(q => `${q.customerType} entities wait in queue '${q.name}'`)
        .join("; ") || "No queue-entity associations defined.",
    },
    experiment: extractExperiment(experimentConfig),
    kpis: buildKpis(model, results),
    waitDist: results.waitDist || {},
    perQueue: results.perQueue || {},
    aggregateStats: results.aggregateStats || {},
  };

  return {
    kind: "suggestion",
    messages: makeMessages(
      system,
      payload,
      "Apply the 6-step chain-of-thought. Identify the binding constraint from goalGaps (if present) or KPI data. Propose up to 3 ranked suggestions. Output only the JSON block."
    ),
    max_tokens: 800,
  };
}

export function parseSuggestionResponse(text = "") {
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/);
  const rawJson = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    const parsed = JSON.parse(rawJson);
    const analysis = typeof parsed.analysis === "string" ? parsed.analysis : "";
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter(s => s && typeof s === "object" && typeof s.rank === "number" && s.change && typeof s.change.type === "string")
      : [];
    return { analysis, suggestions };
  } catch {
    return { analysis: text, suggestions: [] };
  }
}

export function applySuggestionPatch(model, change) {
  const clone = JSON.parse(JSON.stringify(model));
  if (!change || !change.type) return clone;

  if (change.type === "entityTypeCount") {
    const entities = clone.entityTypes || [];
    const found = entities.find(e => e.name === change.target || e.id === change.target);
    if (!found) return clone;
    found.count = change.to;
    return clone;
  }

  if (change.type === "queueCapacity") {
    const queues = clone.queues || [];
    const found = queues.find(q => q.name === change.target || q.id === change.target);
    if (!found) return clone;
    found.capacity = change.to;
    return clone;
  }

  if (change.type === "stateVariable") {
    const vars = clone.stateVariables || [];
    const found = vars.find(v => v.name === change.target || v.id === change.target);
    if (!found) return clone;
    found.initialValue = change.to;
    return clone;
  }

  return clone;
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
