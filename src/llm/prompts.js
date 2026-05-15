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

  const goalGaps = buildGoalGaps(model, results);
  const goalsInstr = goalGaps?.length
    ? ` Performance goals were set. For each goal use this format: "[goal label]: current = [value], target [op] [target] → MET / MISSED (gap: [gap])". Cite exact numbers from the goalGaps data.`
    : "";

  if (goalGaps?.length) payload.goalGaps = goalGaps;

  return {
    kind: "narrative",
    messages: makeMessages(
      system,
      payload,
      "Highlight the most significant findings. Flag any queues where mean wait exceeds 2 x service time as possible overload. Use per-queue percentiles to distinguish typical from extreme waits." + goalsInstr
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

// ── Goal gap analysis ────────────────────────────────────────────────────────
// Maps goal metric names to aggregateStats keys
const GOAL_STAT_KEY = {
  avgWait:    "summary.avgWait",
  avgSvc:     "summary.avgSvc",
  avgSojourn: "summary.avgSojourn",
  served:     "summary.served",
  reneged:    "summary.reneged",
  totalCost:  "summary.totalCost",
};

function buildGoalGaps(model = {}, results = {}) {
  const goals = model.goals || [];
  if (!goals.length) return null;
  const summary = getSummary(results);
  const agg = results.aggregateStats || {};
  return goals.filter(g => g.metric && g.target).map(g => {
    const statKey = GOAL_STAT_KEY[g.metric];
    const current = statKey
      ? finiteOrNull(agg[statKey]?.mean ?? summary[g.metric])
      : finiteOrNull(summary[g.metric]);
    const target = parseFloat(g.target);
    const op = g.operator || "<";
    let met = null;
    if (current != null) {
      if (op === "<")  met = current < target;
      else if (op === "<=") met = current <= target;
      else if (op === ">")  met = current > target;
      else if (op === ">=") met = current >= target;
      else if (op === "==") met = Math.abs(current - target) < 0.001;
    }
    const gap = current != null ? +(current - target).toFixed(4) : null;
    return {
      metric: g.metric,
      label: g.label || `${g.metric} ${op} ${target}`,
      operator: op,
      target,
      current,
      gap,
      met,
    };
  });
}

// Evaluate whether a single sweep point's aggregateStats satisfies all goals.
// Returns { feasible: bool, gaps: [{metric, met, current, target}] }
export function evaluateSweepPointGoals(goals = [], aggregateStats = {}) {
  if (!goals.length) return { feasible: null, gaps: [] };
  const gaps = goals.filter(g => g.metric && g.target).map(g => {
    const statKey = GOAL_STAT_KEY[g.metric];
    const current = statKey ? finiteOrNull(aggregateStats[statKey]?.mean) : null;
    const target = parseFloat(g.target);
    const op = g.operator || "<";
    let met = null;
    if (current != null) {
      if (op === "<")  met = current < target;
      else if (op === "<=") met = current <= target;
      else if (op === ">")  met = current > target;
      else if (op === ">=") met = current >= target;
      else if (op === "==") met = Math.abs(current - target) < 0.001;
    }
    return { metric: g.metric, label: g.label || `${g.metric} ${op} ${target}`, operator: op, target, current, met };
  });
  const feasible = gaps.every(g => g.met === true);
  return { feasible, gaps };
}

export function buildSuggestionPrompt(model = {}, experimentConfig = {}, results = {}) {
  const system = [
    "You are a queueing systems expert and simulation analyst.",
    "Your role is to give specific, actionable, quantified improvement recommendations based on discrete-event simulation results.",
    "You have access to: per-queue wait percentiles (p50/p90/p95/p99), per-resource utilisation fractions,",
    "replication confidence intervals (CI 95%), per-queue blocking and balking counts,",
    "and when set, performance goals with their current gaps.",
    "You MUST follow the 6-step framework and output schema described in the instruction.",
    "Never give vague advice like 'consider increasing capacity' — always name the exact parameter and specific value.",
  ].join(" ");

  const entityTypes = (model.entityTypes || []).map(e => ({
    name: e.name, role: e.role, count: e.count,
    attrDefs: (e.attrDefs || []).filter(a => a.name).map(a => ({ name: a.name, dist: a.dist })),
  }));
  const queues = (model.queues || []).map(q => ({
    name: q.name, discipline: q.discipline, capacity: q.capacity ?? null, customerType: q.customerType,
  }));

  const kpis = buildKpis(model, results);
  const goalGaps = buildGoalGaps(model, results);

  // CI data from aggregateStats (replications)
  const agg = results.aggregateStats || {};
  const confidenceIntervals = Object.entries(agg)
    .filter(([, s]) => s && s.n >= 2)
    .map(([name, s]) => ({
      metric: name,
      mean: finiteOrNull(s.mean),
      ci95Lower: finiteOrNull(s.lower),
      ci95Upper: finiteOrNull(s.upper),
      n: s.n,
      ciWidth: (s.upper != null && s.lower != null) ? +(s.upper - s.lower).toFixed(4) : null,
    }));

  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
      entityTypes,
      queues,
      flowSummary: queues
        .filter(q => q.customerType)
        .map(q => `${q.customerType} entities wait in queue '${q.name}'`)
        .join("; ") || "No explicit queue-entity associations.",
    },
    experiment: extractExperiment(experimentConfig),
    kpis,
    goalGaps: goalGaps?.length ? goalGaps : undefined,
    confidenceIntervals: confidenceIntervals.length ? confidenceIntervals : undefined,
    waitDist: results.waitDist || {},
    perQueue: results.perQueue || {},
  };

  const highLoadWarning = kpis.resources.some(r => r.utilisation != null && r.utilisation > 0.85)
    ? " NOTE: At least one resource has utilisation > 0.85 — this is the HIGH LOAD REGIME where wait times are non-linearly sensitive to capacity; small capacity increases have outsized impact."
    : "";

  const goalInstruction = goalGaps?.length
    ? ` GOALS are defined — your primary objective is to identify changes that close the goal gaps. Address each unmet goal explicitly using the goalGaps data provided (field: current, target, gap, met).`
    : " No performance goals are set — prioritise reducing the most extreme waiting time or highest-utilisation bottleneck.";

  const instruction = [
    "Apply this 6-step framework for EVERY suggestion:",
    "1. BINDING CONSTRAINT: State which metric is farthest from its goal (or most critical). Give exact current value and target.",
    "2. CAUSE: Trace to root cause using utilisation, arrival rate, service time, percentile data, and blocking/balking counts. Name the specific resource or queue.",
    "3. PROPOSED CHANGE: Name the exact parameter, its current value, and a specific proposed value — never use vague 'increase/decrease' without a number.",
    "4. PREDICTED EFFECT: Use queueing theory (Little's Law, M/M/c) or CI extrapolation to quantify the expected improvement as a range. State uncertainty when CIs are wide.",
    "5. GOAL IMPACT: For each suggestion, state which goals would be met, which remain missed, which are unaffected.",
    "6. RANKING: If multiple suggestions, rank by expected impact on the binding constraint and explain the trade-off.",
    "",
    "OUTPUT FORMAT — use this exact schema for each suggestion:",
    "Suggestion N — [parameter or change]",
    "  Current: [exact value with units/context]",
    "  Proposed: [specific value or range]",
    "  Predicted effect: [metric] [direction] from [current] to ~[predicted range]",
    "  Goal impact: [goal label] → met / still missed / unaffected",
    "  Confidence: high / moderate / low — [one-line reason citing CIs or queueing regime]",
    "",
    goalInstruction,
    highLoadWarning,
  ].join("\n");

  return {
    kind: "suggestion",
    messages: makeMessages(system, payload, instruction),
    max_tokens: 800,
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
