const DEFAULT_MODEL_NAME = "Untitled model";
const MAX_PROMPT_WORDS = 2000;

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
        overflowDestination: queue.overflowDestination || undefined,
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
    const result = {
      name: server.name || server.id || "Server",
      count: finiteOrNull(server.count),
      utilisation: finiteOrNull(pr?.utilisation ?? summary.resourceUtilisation?.[server.name] ?? summary.utilisation),
      busyCount: finiteOrNull(pr?.busyCount ?? summary.busyCount),
      idleCount: finiteOrNull(pr?.idleCount),
      totalServers: finiteOrNull(pr?.total),
    };
    if (server.mtbfDist) {
      result.failureModel = {
        mtbfDist: server.mtbfDist,
        mtbfParams: server.mtbfDistParams || {},
        mttrDist: server.mttrDist || null,
        mttrParams: server.mttrDistParams || {},
      };
    }
    if (Array.isArray(server.shiftSchedule) && server.shiftSchedule.length > 0) {
      result.shiftSchedule = `${server.shiftSchedule.length} period(s)`;
    }
    return result;
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

function extractBEvents(model = {}, results = {}) {
  const bEvents = model.bEvents || [];
  if (!bEvents.length) return undefined;
  const eventCounts = results.snap?.eventCounts || {};
  return bEvents.map(ev => {
    const effects = Array.isArray(ev.effect) ? ev.effect : (ev.effect ? [ev.effect] : []);
    const effectTypes = [...new Set(
      effects.map(e => String(e).match(/^\w+/)?.[0]?.toUpperCase()).filter(Boolean)
    )];
    const hasCond = Array.isArray(ev.routing) && ev.routing.length > 0;
    const hasProb = Array.isArray(ev.probabilisticRouting) && ev.probabilisticRouting.length > 0;
    const routingType = hasProb ? "probabilistic" : hasCond ? "conditional" : ev.defaultQueueName ? "fixed" : "none";
    const entry = {
      name: ev.name || ev.id || "Event",
      effectTypes: effectTypes.length ? effectTypes : ["(none)"],
      routing: routingType,
    };
    if (ev.defaultQueueName) entry.defaultQueue = ev.defaultQueueName;
    if (ev.balkCondition) entry.balkMode = "condition";
    else if (ev.balkProbability != null) entry.balkMode = `probability:${ev.balkProbability}`;
    if (ev.loopConfig?.maxLoopCount) {
      entry.loopGuard = `max ${ev.loopConfig.maxLoopCount}x${ev.loopConfig.exitQueueName ? ` → ${ev.loopConfig.exitQueueName}` : ""}`;
    }
    if (Array.isArray(ev.schedules) && ev.schedules.length > 0) {
      entry.arrivalStreams = ev.schedules.length;
      if (ev.schedules.some(s => s.isRenege)) entry.hasReneging = true;
      // ADR-016: timetable rows live in model_schedules, not inline.
      // externalSchedule: true → the bEvent uses a named schedule (scheduleRef UUID).
      // The rows are resolved at run-time from the selected model_schedule record.
      // inlineRows: true → legacy format; rows are still embedded in model JSON
      //   (user should migrate via the Schedules tab "Move to a named schedule" banner).
      const externalCount = ev.schedules.filter(s => s.scheduleRef && (!Array.isArray(s.rows) || s.rows.length === 0)).length;
      const inlineCount = ev.schedules.filter(s => Array.isArray(s.rows) && s.rows.length > 0 && !s.scheduleRef).length;
      if (externalCount > 0) entry.externalSchedule = true;
      if (inlineCount > 0) entry.inlineRows = true;
    }
    if (eventCounts[ev.id]) entry.fireCount = eventCounts[ev.id];
    return entry;
  });
}

function extractCEvents(model = {}) {
  const cEvents = model.cEvents || [];
  if (!cEvents.length) return undefined;
  return cEvents.map(ev => {
    const effects = Array.isArray(ev.effect) ? ev.effect : (ev.effect ? [ev.effect] : []);
    const effectTypes = [...new Set(
      effects.map(e => String(e).match(/^\w+/)?.[0]?.toUpperCase()).filter(Boolean)
    )];
    const entry = {
      name: ev.name || ev.id || "Event",
      effectTypes: effectTypes.length ? effectTypes : ["(none)"],
    };
    if (ev.priority != null) entry.priority = ev.priority;
    return entry;
  });
}

function extractEntityAnomalies(results = {}) {
  const entitySummary = results.entitySummary;
  if (!Array.isArray(entitySummary) || entitySummary.length === 0) return undefined;
  const meanWait = finiteOrNull(getSummary(results).avgWait);
  if (!meanWait || meanWait <= 0) return undefined;
  const threshold = meanWait * 3;
  const anomalies = entitySummary.filter(e => {
    const wait = Array.isArray(e.stages)
      ? e.stages.reduce((s, st) => s + (st.stageWait || 0), 0)
      : finiteOrNull(e.waitTime) ?? 0;
    return Number.isFinite(wait) && wait > threshold;
  });
  if (!anomalies.length) return undefined;
  const byType = {};
  anomalies.forEach(e => { const t = e.type || "unknown"; byType[t] = (byType[t] || 0) + 1; });
  const worstWait = Math.max(...anomalies.map(e =>
    Array.isArray(e.stages)
      ? e.stages.reduce((s, st) => s + (st.stageWait || 0), 0)
      : finiteOrNull(e.waitTime) ?? 0
  ));
  return {
    anomalyCount: anomalies.length,
    anomalyRate: +(anomalies.length / entitySummary.length).toFixed(4),
    worstWait: +worstWait.toFixed(4),
    byType,
    threshold: +threshold.toFixed(4),
  };
}

function buildKpis(model = {}, results = {}) {
  const summary = getSummary(results);
  const kpis = {
    queues: extractQueues(model, results),
    resources: extractResources(model, summary),
    throughput: finiteOrNull(summary.served ?? summary.throughput),
    totalEntities: finiteOrNull(summary.total),
    served: finiteOrNull(summary.served),
    reneged: finiteOrNull(summary.reneged),
    avgWait: finiteOrNull(summary.avgWait),
    avgService: finiteOrNull(summary.avgSvc),
    avgSojourn: finiteOrNull(summary.avgSojourn),
    maxSojourn: finiteOrNull(summary.maxSojourn),
    avgWIP: finiteOrNull(summary.avgWIP),
  };
  if (summary.totalCost) kpis.totalCost = finiteOrNull(summary.totalCost);
  if (summary.costPerServed) kpis.costPerServed = finiteOrNull(summary.costPerServed);
  if (summary.containerLevels) kpis.containerLevels = summary.containerLevels;
  if (summary.phaseCTruncated) kpis.warning_phaseCTruncated = true;
  if (summary.warnings?.length) kpis.warnings = summary.warnings;
  return kpis;
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
  const system = "You are an expert simulation analyst. Interpret the following discrete-event simulation results for a non-specialist audience. Be concise: 150-200 words. Use plain English. You have per-queue wait percentiles (p50, p90, p95, p99), per-resource utilisation and idle counts, per-queue blocking/balking counters, cost metrics, WIP, and container levels where applicable.";
  const waitDist = results.waitDist || {};
  const waitDistForPrompt = Object.keys(waitDist).length
    ? Object.fromEntries(Object.entries(waitDist).map(([q, w]) => [q, { n: w.n, mean: w.mean, p50: w.p50, p90: w.p90, p95: w.p95, p99: w.p99 }]))
    : undefined;
  const perQueue = results.perQueue || {};
  const stateVariables = (model.stateVariables || []).filter(v => v.name).map(v => ({
    name: v.name, initialValue: v.initialValue ?? null,
  }));

  const agg = results.aggregateStats || {};
  const confidenceIntervals = Object.entries(agg)
    .filter(([, s]) => s && s.n >= 2)
    .map(([name, s]) => ({
      metric: name,
      mean: finiteOrNull(s.mean),
      ci95Lower: finiteOrNull(s.lower),
      ci95Upper: finiteOrNull(s.upper),
      n: s.n,
    }));

  const experiment = extractExperiment(experimentConfig);

  // Shift schedule digest — extract actual windows so the LLM can reason about
  // time-varying capacity rather than just a generic "N period(s)" label.
  const shiftCapacity = (model.entityTypes || [])
    .filter(et => et.role === "server" && Array.isArray(et.shiftSchedule) && et.shiftSchedule.length > 0)
    .map(et => ({
      resource: et.name || et.id,
      totalCount: finiteOrNull(et.count),
      windows: et.shiftSchedule.map(w => ({ time: w.time, capacity: w.capacity })),
    }));

  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
      goals: goalsToPrompt(model),
      ...(stateVariables.length ? { stateVariables } : {}),
    },
    experiment,
    kpis: buildKpis(model, results),
    waitDist: waitDistForPrompt,
    perQueue: Object.keys(perQueue).length ? perQueue : undefined,
    ...(confidenceIntervals.length ? { confidenceIntervals } : {}),
    ...(shiftCapacity.length ? { shiftCapacity } : {}),
  };

  const goalGaps = buildGoalGaps(model, agg);
  const goalsInstr = goalGaps?.length
    ? ` Performance goals were set. For each goal use this format: "[goal label]: current = [value], target [op] [target] → MET / MISSED (gap: [gap])". Cite exact numbers from the goalGaps data.`
    : "";

  if (goalGaps?.length) payload.goalGaps = goalGaps;

  const warningsInstr = payload.kpis.warning_phaseCTruncated
    ? " NOTE: Phase C was truncated during this run — some conditional events may not have fired. Mention this caveat."
    : "";

  const repInstr = experiment.replications > 1
    ? ` This was a ${experiment.replications}-replication study — reference the 95% CI ranges from confidenceIntervals rather than single-run point estimates when available.`
    : " This was a single-replication run — results are point estimates with no confidence intervals.";

  const planInstr = shiftCapacity.length
    ? " The model uses a shift-based capacity plan (shiftCapacity). Mention whether the plan appears to be adequately staffed relative to the observed demand."
    : "";

  return {
    kind: "narrative",
    messages: makeMessages(
      system,
      payload,
      "Highlight the most significant findings. Flag any queues where mean wait exceeds 2 x service time as possible overload. Use per-queue percentiles to distinguish typical from extreme waits. If cost or WIP data is present, comment on it briefly." + repInstr + planInstr + goalsInstr + warningsInstr
    ),
    max_tokens: 450,
  };
}

function diffModelStructure(modelA = {}, modelB = {}) {
  if (!modelA || !modelB) {
    return { identical: null, note: "Structural data is not available for one or both runs — focus comparison on KPI differences only." };
  }

  const differences = [];

  // Entity types
  const etA = (modelA.entityTypes || []).map(e => ({ name: e.name || e.id, role: e.role, count: e.count ?? null }));
  const etB = (modelB.entityTypes || []).map(e => ({ name: e.name || e.id, role: e.role, count: e.count ?? null }));
  const etNamesA = new Set(etA.map(e => e.name));
  const etNamesB = new Set(etB.map(e => e.name));
  for (const name of etNamesA) {
    if (!etNamesB.has(name)) { differences.push(`Entity type "${name}" present in Option A only`); continue; }
    const a = etA.find(e => e.name === name);
    const b = etB.find(e => e.name === name);
    if (a.count !== b.count) differences.push(`Entity "${name}" count: ${a.count} → ${b.count}`);
    if (a.role !== b.role) differences.push(`Entity "${name}" role: ${a.role} → ${b.role}`);
  }
  for (const name of etNamesB) {
    if (!etNamesA.has(name)) differences.push(`Entity type "${name}" present in Option B only`);
  }

  // Queues
  const qA = (modelA.queues || []).map(q => ({ name: q.name || q.id, discipline: q.discipline, capacity: q.capacity ?? null }));
  const qB = (modelB.queues || []).map(q => ({ name: q.name || q.id, discipline: q.discipline, capacity: q.capacity ?? null }));
  const qNamesA = new Set(qA.map(q => q.name));
  const qNamesB = new Set(qB.map(q => q.name));
  for (const name of qNamesA) {
    if (!qNamesB.has(name)) { differences.push(`Queue "${name}" present in Option A only`); continue; }
    const a = qA.find(q => q.name === name);
    const b = qB.find(q => q.name === name);
    if (a.discipline !== b.discipline) differences.push(`Queue "${name}" discipline: ${a.discipline} → ${b.discipline}`);
    if (a.capacity !== b.capacity) differences.push(`Queue "${name}" capacity: ${a.capacity} → ${b.capacity}`);
  }
  for (const name of qNamesB) {
    if (!qNamesA.has(name)) differences.push(`Queue "${name}" present in Option B only`);
  }

  // Arrival events
  const beCountA = (modelA.bEvents || []).length;
  const beCountB = (modelB.bEvents || []).length;
  if (beCountA !== beCountB) differences.push(`Arrival event count: ${beCountA} → ${beCountB}`);

  // Schedules
  const schedCountA = (modelA.schedules || []).length + (modelA.shiftSchedules || []).length;
  const schedCountB = (modelB.schedules || []).length + (modelB.shiftSchedules || []).length;
  if (schedCountA !== schedCountB) differences.push(`Schedule entry count: ${schedCountA} → ${schedCountB}`);

  if (differences.length === 0) {
    return { identical: true, note: "Both runs use identical model structure — differences reflect parameter or seed variation only." };
  }
  return { identical: false, note: `Model structure differs between runs: ${differences.join("; ")}.` };
}

export function buildComparisonPrompt(modelName = DEFAULT_MODEL_NAME, runA = {}, runB = {}, modelA = null, modelB = null) {
  const structDiff = diffModelStructure(modelA, modelB);
  const structNote = structDiff.note;

  const system = [
    "You are an expert simulation analyst.",
    "Compare the two simulation runs below and explain the key differences to a non-specialist.",
    "Be concise: 200-250 words. Use an Option A / Option B frame.",
    structDiff.identical === true
      ? "The model structure is identical between runs — do not speculate about structural differences."
      : structDiff.identical === false
        ? "The model structure has changed between runs — factor structural differences into your explanation."
        : "Structural model data is unavailable — focus only on the KPI results provided.",
  ].join(" ");

  const payload = {
    modelName: modelName || DEFAULT_MODEL_NAME,
    structuralNote: structNote,
    runA,
    runB,
  };

  return {
    kind: "comparison",
    messages: makeMessages(
      system,
      payload,
      "Compare the two runs side by side. Identify meaningful differences, likely tradeoffs, and any result that is too uncertain to interpret confidently. If the model structure is identical, make that clear and focus on what the results tell us."
    ),
    max_tokens: 600,
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

export function buildGoalGaps(model = {}, aggregateStats = {}) {
  const goals = model.goals || [];
  if (!goals.length) return null;
  return goals.filter(g => g.metric && g.target).map(g => {
    const current = finiteOrNull(aggregateStats[g.metric]?.mean);
    const target = parseFloat(g.target);
    const op = g.operator || "<";
    let met = false;
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
    "You have access to: per-queue wait percentiles (p50/p90/p95/p99), per-resource utilisation with failure/repair distributions,",
    "replication confidence intervals (CI 95%), per-queue blocking and balking counts,",
    "model event structure (B-event/C-event digest with routing types, loop guards, balking modes, arrival streams),",
    "state variables, cost metrics, WIP (Little's Law), container levels, entity anomaly counts,",
    "and when set, performance goals with their current gaps.",
    "Timetable schedules (Schedule distribution) are stored as named records in model_schedules — referenced via scheduleRef UUID on bEvents.",
    "When a bEvent shows externalSchedule:true, arrivals follow the named timetable rows loaded at run time.",
    "When a bEvent shows inlineRows:true, the rows are legacy inline data — advise moving to the Schedules tab.",
    "You MUST follow the 6-step chain-of-thought framework: binding constraint → cause → specific change → predicted effect → goal impact → ranking.",
    "Never give vague advice like 'consider increasing capacity' — always name the exact parameter and specific value.",
    "When the model has a failure/repair model on a resource, factor availability into capacity calculations.",
    "When a loop guard is present, consider whether the loop count limit is causing premature exits.",
    "When state variables are present, they may represent conditions that affect routing or service rates.",
  ].join(" ");

  const entityTypes = (model.entityTypes || []).map(e => {
    const entry = {
      name: e.name, role: e.role, count: e.count,
      attrDefs: (e.attrDefs || []).filter(a => a.name).map(a => ({ name: a.name, dist: a.dist })),
    };
    if (e.role === "server") {
      if (e.mtbfDist) entry.failureModel = { mtbfDist: e.mtbfDist, mtbfParams: e.mtbfDistParams, mttrDist: e.mttrDist, mttrParams: e.mttrDistParams };
      if (Array.isArray(e.shiftSchedule) && e.shiftSchedule.length > 0) entry.shiftSchedule = `${e.shiftSchedule.length} period(s)`;
    }
    return entry;
  });
  const queues = (model.queues || []).map(q => ({
    name: q.name, discipline: q.discipline, capacity: q.capacity ?? null, customerType: q.customerType,
    ...(q.overflowDestination ? { overflowDestination: q.overflowDestination } : {}),
  }));

  const kpis = buildKpis(model, results);
  const goalGaps = buildGoalGaps(model, results.aggregateStats || {});

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

  const bEvents = extractBEvents(model, results);
  const cEvents = extractCEvents(model);
  const stateVariables = (model.stateVariables || []).filter(v => v.name).map(v => ({
    name: v.name, initialValue: v.initialValue ?? null,
  }));
  const entityAnomalies = extractEntityAnomalies(results);

  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
      entityTypes,
      queues,
      stateVariables: (model.stateVariables || []).map(v => ({ name: v.name, initialValue: v.initialValue })),
      flowSummary: queues
        .filter(q => q.customerType)
        .map(q => `${q.customerType} entities wait in queue '${q.name}'`)
        .join("; ") || "No explicit queue-entity associations.",
      ...(bEvents ? { bEvents } : {}),
      ...(cEvents ? { cEvents } : {}),
      ...(stateVariables.length ? { stateVariables } : {}),
      ...(goalGaps?.length ? { goalGaps } : {}),
    },
    experiment: extractExperiment(experimentConfig),
    kpis,
    confidenceIntervals: confidenceIntervals.length ? confidenceIntervals : undefined,
    waitDist: results.waitDist || {},
    perQueue: results.perQueue || {},
    ...(entityAnomalies ? { entityAnomalies } : {}),
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
    "OUTPUT FORMAT — output a single JSON block wrapped in ```json ... ``` fences with this schema:",
    '{ "analysis": "<narrative>", "suggestions": [ { "rank": 1, "constraint": "<KPI=value (goal: op target)>", "cause": "<mechanism>", "change": { "type": "<entityTypeCount|queueCapacity|stateVariable|manual>", "target": "<name>", "from": <number>, "to": <number> }, "predicted": "<new KPI range>", "goalImpact": "<goal label MET|MISSED>", "confidence": "<high|moderate|low>" } ] }',
    "Use type 'manual' for structural changes that cannot be expressed as a single numeric field update.",
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

export function buildExplainResultsPrompt(model = {}, experimentConfig = {}, results = {}, ciResults = []) {
  const system = [
    "You are an expert simulation analyst and queueing systems expert.",
    "Interpret the following discrete-event simulation results for a non-specialist audience.",
    "Provide a comprehensive analysis in three sections: What Happened, How Reliable, and What to Change.",
    "Be concise: 300-500 words total. Use plain English. Technical terms should appear only in helper text or after a plain-English explanation.",
  ].join(" ");

  const waitDist = results.waitDist || {};
  const waitDistForPrompt = Object.keys(waitDist).length
    ? Object.fromEntries(Object.entries(waitDist).map(([q, w]) => [q, { n: w.n, mean: w.mean, p50: w.p50, p90: w.p90, p95: w.p95, p99: w.p99 }]))
    : undefined;
  const perQueue = results.perQueue || {};
  const stateVariables = (model.stateVariables || []).filter(v => v.name).map(v => ({
    name: v.name, initialValue: v.initialValue ?? null,
  }));

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
      goals: goalsToPrompt(model),
      ...(stateVariables.length ? { stateVariables } : {}),
    },
    experiment: extractExperiment(experimentConfig),
    kpis: buildKpis(model, results),
    waitDist: waitDistForPrompt,
    perQueue: Object.keys(perQueue).length ? perQueue : undefined,
    aggregateStats: results.aggregateStats || {},
    confidenceIntervals: confidenceIntervals.length ? confidenceIntervals : undefined,
  };

  const goalGaps = buildGoalGaps(model, results.aggregateStats || {});
  if (goalGaps?.length) payload.goalGaps = goalGaps;

  const goalsInstr = goalGaps?.length
    ? ` For each performance goal use: "[goal label]: current = [value], target [op] [target] → MET / MISSED (gap: [gap])".`
    : "";

  const warningsInstr = payload.kpis.warning_phaseCTruncated
    ? " NOTE: Phase C was truncated — some conditional events may not have fired. Mention this caveat."
    : "";

  const sensitivityReady = ciResults.some(item => item.n >= 5);
  const sensitivityInstr = sensitivityReady
    ? " In the 'How Reliable' section, identify which KPIs have wide confidence intervals and what this means for decision-making."
    : " Note that replication count is low, so confidence intervals may be wide and conclusions less certain.";

  const highLoadWarning = payload.kpis.resources.some(r => r.utilisation != null && r.utilisation > 0.85)
    ? " NOTE: One or more resources has utilisation above 85% — this is a common cause of queue instability. Factor this into your recommendations."
    : "";

  const goalInstruction = goalGaps?.length
    ? ` The model has performance goals. For each suggestion, state which goals would be met, which remain missed, and which are unaffected.`
    : "";

  const instruction = [
    "Structure your response in two parts:",
    "",
    "PART 1 — NARRATIVE ANALYSIS (plain text, 200-300 words)",
    "Write three sections:",
    "## What Happened",
    "Highlight the most significant findings. Flag queues where mean wait exceeds 2x service time as possible overload.",
    "Use per-queue percentiles to distinguish typical from extreme waits.",
    "If cost or WIP data is present, comment briefly." + goalsInstr + warningsInstr,
    "",
    "## How Reliable" + sensitivityInstr,
    "Discuss statistical uncertainty, confidence interval width, and which conclusions are robust enough to act on.",
    "",
    "## What to Change",
    "Briefly summarise your top 1-3 recommendations in plain English.",
    "",
    "PART 2 — STRUCTURED SUGGESTIONS (JSON block)",
    "After the narrative, output a single JSON block wrapped in ```json ... ``` fences with this schema:",
    '{ "analysis": "<narrative analysis text>", "suggestions": [ { "rank": 1, "constraint": "<KPI=value (goal: op target)>", "cause": "<mechanism>", "change": { "type": "<entityTypeCount|queueCapacity|stateVariable|manual>", "target": "<name>", "from": <number>, "to": <number> }, "predicted": "<new KPI range>", "goalImpact": "<goal label MET|MISSED>", "confidence": "<high|moderate|low>" } ] }',
    "Use type 'manual' for structural changes that cannot be expressed as a single numeric field update.",
    "Never give vague advice — always name the exact parameter and specific value.",
    "When the model has a failure/repair model, factor availability into capacity calculations.",
    "When state variables are present, they may represent conditions that affect routing or service rates.",
    "",
    goalInstruction,
    highLoadWarning,
  ].join("\n");

  return {
    kind: "explainResults",
    messages: makeMessages(system, payload, instruction),
    max_tokens: 1600,
  };
}

export function parseSuggestionResponse(text = "") {
  const stripStructuredBlock = (value = "") => value
    .replace(/<json>[\s\S]*?(?:<\/json>|$)/gi, "")
    .replace(/```json[\s\S]*?(?:```|$)/gi, "")
    .replace(/```[\s\S]*?(?:```|$)/g, "")
    .trim();

  // Support multiple JSON wrapper formats:
  //   1. ```json ... ```  (markdown fences — original prompt format)
  //   2. <json> ... </json>  (Claude 4.x XML-style tags)
  //   3. Raw JSON as fallback
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/);
  const tagMatch   = !fenceMatch && text.match(/<json>\s*([\s\S]*?)<\/json>/i);
  const rawJson    = fenceMatch
    ? fenceMatch[1].trim()
    : tagMatch
      ? tagMatch[1].trim()
      : text.trim();

  // Strip the matched block from the text to get the narrative portion
  // (the LLM sometimes outputs narrative text before/after the JSON block)
  const jsonBlock = fenceMatch
    ? fenceMatch[0]
    : tagMatch
      ? tagMatch[0]
      : null;
  const narrativeOnly = jsonBlock
    ? text.replace(jsonBlock, "").trim()
    : null;

  try {
    const parsed = JSON.parse(rawJson);
    const analysis = typeof parsed.analysis === "string"
      ? parsed.analysis
      : (narrativeOnly || "");
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter(s => s && typeof s === "object" && typeof s.rank === "number" && s.change && typeof s.change.type === "string")
      : [];
    return { analysis, suggestions };
  } catch {
    // JSON parse failed — keep any plain-English narrative, but strip the
    // structured JSON block even if the closing fence/tag is missing.
    const cleaned = stripStructuredBlock(text);
    return { analysis: cleaned || text, suggestions: [] };
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

// ── Sprint 70 — Constrained Plan Refinement ─────────────────────────────────

function extractScheduleDigest(model = {}) {
  const entries = [];
  const schedules = Array.isArray(model.schedules) ? model.schedules : [];
  const shiftSchedules = Array.isArray(model.shiftSchedules) ? model.shiftSchedules : [];
  for (const s of schedules) {
    entries.push({
      eventId: s.eventId || s.id,
      startTime: s.startTime ?? s.start ?? null,
      endTime: s.endTime ?? s.end ?? null,
      resourceType: s.resourceType || s.entityTypeName || null,
      count: s.count ?? null,
      shiftPattern: s.shiftPattern || null,
    });
  }
  for (const s of shiftSchedules) {
    entries.push({
      eventId: s.eventId || s.id,
      startTime: s.startTime ?? s.start ?? null,
      endTime: s.endTime ?? s.end ?? null,
      resourceType: s.resourceType || s.entityTypeName || null,
      count: s.count ?? null,
      shiftPattern: s.shiftPattern || s.pattern || null,
    });
  }
  // ADR-016: arrival timetable schedules linked via scheduleRef on bEvents.
  // Include a digest entry per linked schedule so the LLM knows the event name
  // and how many timetabled arrivals are defined.
  for (const be of model.bEvents || []) {
    for (const s of be.schedules || []) {
      if (!s.scheduleRef) continue;
      entries.push({
        eventId: be.id,
        eventName: be.name || be.id,
        type: "arrivalTimetable",
        scheduleRef: s.scheduleRef,
        rowCount: Array.isArray(s.rows) && s.rows.length > 0 ? s.rows.length : null,
      });
    }
  }
  return entries;
}

function extractCapacityEnvelope(model = {}) {
  const servers = (model.entityTypes || []).filter(e => e.role === "server");
  return servers.map(s => {
    const shiftWindows = Array.isArray(s.shiftSchedule) ? s.shiftSchedule : [];
    return {
      name: s.name || s.id,
      totalCount: finiteOrNull(s.count),
      shiftWindows: shiftWindows.map(w => ({ time: w.time, capacity: w.capacity })),
    };
  });
}

export function buildPlanRefinementPrompt(model = {}, experimentConfig = {}, results = {}) {
  const system = [
    "You are an expert discrete-event simulation analyst specialising in constrained scheduling.",
    "The user has run a simulation with a fixed plan — either a resource capacity plan (shift windows) or an arrival timetable, or both.",
    "Your task is to recommend tactical adjustments to the schedule that improve goal attainment without increasing total resource capacity.",
    "You must not recommend adding servers, increasing staff counts, or any other capacity increase.",
    "Treat resource counts and shift windows as hard constraints.",
    "When the scheduleDigest contains arrivalTimetable entries, the plan is a fixed arrival timetable — recommend timing adjustments to smooth demand rather than adding capacity.",
    "Distinguish clearly between recommendations that are within current capacity and any constraints that make full goal attainment infeasible.",
  ].join(" ");

  const goalGaps = buildGoalGaps(model, results.aggregateStats || {});
  const queues = extractQueues(model, results);
  const kpiSummary = queues.map(q => ({
    name: q.name,
    meanWait: q.meanWait,
    p90Wait: q.p90,
    utilisation: null,
  }));

  const summary = getSummary(results);
  const resources = extractResources(model, summary);
  for (const r of resources) {
    const kq = kpiSummary.find(k => k.name === r.name);
    if (kq) kq.utilisation = r.utilisation;
    else kpiSummary.push({ name: r.name, meanWait: null, p90Wait: null, utilisation: r.utilisation });
  }

  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
    },
    scheduleDigest: extractScheduleDigest(model),
    capacityEnvelope: extractCapacityEnvelope(model),
    goalGaps: goalGaps || [],
    kpiSummary,
    constraintStatement: "Resource counts and shift windows are fixed. Recommend schedule timing and sequencing changes only.",
  };

  const outputSchema = JSON.stringify({
    analysis: "string — 100–150 word plain-English summary of the scheduling situation and what is and is not achievable",
    recommendations: [
      {
        rank: 1,
        targetScheduleId: "id of the schedule entry to modify",
        change: "plain-English description of the proposed change",
        rationale: "why this change closes the goal gap",
        goalImpact: "which goals are expected to improve and by how much",
        feasible: true,
        revisedEntry: { "...": "revised schedule object" },
      },
    ],
    infeasibleGoals: [
      { goalLabel: "string", reason: "why this goal cannot be met within current capacity" },
    ],
  }, null, 2);

  const instruction = `Respond with a fenced \`\`\`json block using this exact schema:\n${outputSchema}`;

  return {
    kind: "plan-refinement",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: truncateWords(JSON.stringify({ ...payload, instruction }, null, 2)),
      },
    ],
    max_tokens: 1800,
  };
}

export function parsePlanRefinementResponse(text = "") {
  // Match complete fenced block, or an incomplete one (truncated before closing ```)
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/);
  const incompleteFence = !fenceMatch && text.match(/```json\s*([\s\S]+)$/);
  const tagMatch = !fenceMatch && !incompleteFence && text.match(/<json>\s*([\s\S]*?)<\/json>/i);
  const rawJson = fenceMatch ? fenceMatch[1].trim()
    : incompleteFence ? incompleteFence[1].trim()
    : tagMatch ? tagMatch[1].trim()
    : text.trim();

  const mapRecommendations = (arr) => Array.isArray(arr)
    ? arr.filter(r => r && typeof r === "object").map(r => ({
        rank: r.rank ?? 1,
        targetScheduleId: r.targetScheduleId || null,
        change: r.change || "",
        rationale: r.rationale || "",
        goalImpact: r.goalImpact || "",
        feasible: Boolean(r.feasible),
        revisedEntry: r.revisedEntry || null,
      }))
    : [];

  try {
    const parsed = JSON.parse(rawJson);
    return {
      analysis: typeof parsed.analysis === "string" ? parsed.analysis : "",
      recommendations: mapRecommendations(parsed.recommendations),
      infeasibleGoals: Array.isArray(parsed.infeasibleGoals)
        ? parsed.infeasibleGoals.map(g => ({ goalLabel: g.goalLabel || "", reason: g.reason || "" }))
        : [],
    };
  } catch {
    // Truncated JSON — try to salvage the analysis field and any complete recommendation objects
    const analysisMatch = rawJson.match(/"analysis"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const analysis = analysisMatch
      ? analysisMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"')
      : "";

    // Attempt to extract complete recommendation objects from partial JSON
    const recs = [];
    const recPattern = /\{[^{}]*"rank"\s*:\s*(\d+)[^{}]*"change"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = recPattern.exec(rawJson)) !== null) {
      recs.push({ rank: Number(m[1]), targetScheduleId: null, change: m[2].replace(/\\n/g, "\n"), rationale: "", goalImpact: "", feasible: true, revisedEntry: null });
    }

    return { analysis: analysis || "Analysis incomplete — response was truncated. Try again.", recommendations: recs, infeasibleGoals: [] };
  }
}

export function applySchedulePatch(model, card) {
  const clone = JSON.parse(JSON.stringify(model));
  if (!card || !card.targetScheduleId) {
    throw new Error("applySchedulePatch: card.targetScheduleId is required");
  }
  const id = card.targetScheduleId;

  const schedules = Array.isArray(clone.schedules) ? clone.schedules : [];
  const shiftSchedules = Array.isArray(clone.shiftSchedules) ? clone.shiftSchedules : [];

  const schedIdx = schedules.findIndex(s => (s.id || s.eventId) === id);
  if (schedIdx !== -1) {
    clone.schedules[schedIdx] = { ...clone.schedules[schedIdx], ...card.revisedEntry };
    return clone;
  }

  const shiftIdx = shiftSchedules.findIndex(s => (s.id || s.eventId) === id);
  if (shiftIdx !== -1) {
    clone.shiftSchedules[shiftIdx] = { ...clone.shiftSchedules[shiftIdx], ...card.revisedEntry };
    return clone;
  }

  throw new Error(`applySchedulePatch: no schedule entry found with id "${id}"`);
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

export function buildModelDescriptionPrompt(model = {}, results = {}) {
  const hasCost = [
    ...(model.bEvents || []),
    ...(model.cEvents || []),
  ].some(ev => {
    const effects = Array.isArray(ev.effect) ? ev.effect : [ev.effect || ''];
    return effects.some(e => String(e).includes('COST('));
  });
  const hasShifts = (model.entityTypes || []).some(
    et => et.role === 'server' && Array.isArray(et.shiftSchedule) && et.shiftSchedule.length > 0
  );
  const hasContainers = Array.isArray(model.containerTypes) && model.containerTypes.length > 0;
  const hasFailures = (model.entityTypes || []).some(et => et.role === 'server' && et.mtbfDist);
  const hasPriority = (model.queues || []).some(q => q.discipline && q.discipline !== 'FIFO');
  const summary = getSummary(results);
  const isPlanBased = summary.avgPlanDeviation != null ||
    (model.bEvents || []).some(be =>
      (be.schedules || []).some(s => s.scheduleRef || (Array.isArray(s.rows) && s.rows.length > 0))
    );

  const context = {
    name: model.name || DEFAULT_MODEL_NAME,
    entityTypes: (model.entityTypes || []).map(et => ({
      name: et.name,
      role: et.role,
      ...(et.role === 'server' ? { count: et.count } : {}),
    })),
    queues: (model.queues || []).map(q => ({ name: q.name, discipline: q.discipline || 'FIFO' })),
    goals: (model.goals || []).filter(g => g.label || g.metric).map(g => ({ label: g.label || g.metric, target: g.target })),
    features: { hasCost, hasShifts, hasContainers, hasFailures, hasPriority, isPlanBased },
  };

  const system = [
    "You are writing a plain-English description of a discrete-event simulation model for inclusion in a professional client report.",
    "Your audience is a non-technical reader — a manager or board member, not a simulation practitioner.",
    "Write 100–160 words.",
    "Describe what real-world system this model represents (inferred from the entity and queue names).",
    "Explain what flows through the system, where congestion or waiting can occur, and what the key capacity constraints are.",
    isPlanBased
      ? "The model is driven by a pre-planned timetable or schedule — mention that results are based on the planned service timetable."
      : "",
    "If notable features are present (priority queuing, equipment failures, shift patterns, cost tracking), mention them in plain language.",
    "Do NOT interpret results — this is a description of what is modelled, not what the results show.",
    "Do NOT use technical simulation terms such as B-event, C-event, macro, ARRIVE, COMPLETE, FEL, DES, or entity.",
    "Tone: professional, clear, suitable for a board-level management report.",
  ].filter(Boolean).join(" ");

  return {
    kind: "model-description",
    messages: makeMessages(system, context, "Write the model description now."),
    max_tokens: 400,
  };
}

export function buildReportRecommendationsPrompt(model = {}, results = {}) {
  const summary = getSummary(results);
  const system = [
    "You are a queueing systems expert producing a structured recommendations section for a simulation analysis report.",
    "Produce exactly 3 recommendations based on the data provided. If fewer than 3 meaningful recommendations exist, produce fewer — do not pad with weak suggestions.",
    "Respond with a fenced ```json block containing ONLY a JSON array and nothing else.",
    "Each element must have: priority (integer 1-3), headline (max 10 words, imperative), finding (1-2 sentences with specific numbers), action (1-2 sentences, concrete and specific), expectedImpact (1 sentence), confidence (HIGH | MEDIUM | LOW).",
    "confidence is HIGH when supported by replicated CI data, MEDIUM for single-run results, LOW when inferred.",
  ].join(" ");

  const goalGaps = buildGoalGaps(model, results.aggregateStats || {});
  const entityAnomalies = extractEntityAnomalies(results);
  const queues = extractQueues(model, results);
  const resources = extractResources(model, summary);

  const payload = {
    model: { name: model.name || DEFAULT_MODEL_NAME, goals: goalsToPrompt(model) },
    kpis: { avgWait: finiteOrNull(summary.avgWait), avgSvc: finiteOrNull(summary.avgSvc), served: finiteOrNull(summary.served), reneged: finiteOrNull(summary.reneged), avgWIP: finiteOrNull(summary.avgWIP) },
    queues,
    resources,
    aggregateStats: results.aggregateStats || {},
    ...(goalGaps ? { goalGaps } : {}),
    ...(entityAnomalies ? { entityAnomalies } : {}),
  };

  return {
    kind: "report-recommendations",
    messages: makeMessages(system, payload, "Produce the recommendations JSON array now."),
    max_tokens: 700,
  };
}

export function parseReportRecommendations(text) {
  try {
    const raw = String(text || "").trim();
    const fenced  = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const tagged  = !fenced && raw.match(/<json>\s*([\s\S]*?)<\/json>/i);
    const jsonStr = fenced ? fenced[1].trim() : tagged ? tagged[1].trim() : raw;
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

// ── AI Sidebar: design-context model Q&A ──────────────────────────────────────

export function buildModelQueryPrompt(question, model = {}, history = []) {
  const entityTypes = (model.entityTypes || []);
  const customers   = entityTypes.filter(e => e.role === 'customer').map(e => e.name).join(', ') || 'none';
  const servers     = entityTypes.filter(e => e.role === 'server').map(e => `${e.name} (×${e.count ?? 1})`).join(', ') || 'none';
  const queues      = (model.queues || []).map(q => q.name).join(', ') || 'none';
  const bEvents     = (model.bEvents || []).slice(0, 8).map(ev => ev.name).join(', ') || 'none';
  const goals       = (model.goals || []).map(g => `${g.label}: target ${g.targetValue} ${g.metric}`).join('; ') || 'none';

  const context = `You are assisting a simulation modeller in DES Studio.

Model: ${model.name || 'Unnamed'}
${model.description ? `Description: ${model.description}\n` : ''}Entity types (customer): ${customers}
Resources (server): ${servers}
Queues: ${queues}
B-Events (arrivals/inputs): ${bEvents}
Performance goals: ${goals}

Answer questions about this model concisely and precisely. If a question requires running the simulation to answer definitively, say so. Do not invent data not present in the model definition above.`;

  const messages = [
    { role: 'system', content: context },
    ...history.slice(-8),
    { role: 'user', content: question },
  ];

  return { kind: 'model_query', messages, max_tokens: 400 };
}
