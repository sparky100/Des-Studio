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
      utilisation: (() => { const v = pr?.utilisation ?? summary.resourceUtilisation?.[server.name] ?? summary.utilisation; return Number.isFinite(v) ? Math.round(v * 100) : null; })(),
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
      result.shiftWindows = server.shiftSchedule.map(p => ({
        time: parseInt(p.time, 10) || 0,
        capacity: parseInt(p.capacity, 10) || 1,
      }));
    }
    return result;
  });
}

function extractOutcomes(summary = {}) {
  const outcomes = summary.outcomes && typeof summary.outcomes === "object"
    ? summary.outcomes
    : {};
  const rows = Object.entries(outcomes)
    .map(([routeId, outcome]) => ({
      routeId,
      routeLabel: outcome.routeLabel || routeId,
      status: outcome.status || null,
      endedBy: outcome.endedBy || null,
      count: finiteOrNull(outcome.count),
      avgWait: finiteOrNull(outcome.avgWait),
      avgSojourn: finiteOrNull(outcome.avgSojourn),
    }))
    .filter(row => row.count != null && row.count > 0)
    .sort((a, b) => b.count - a.count || a.routeLabel.localeCompare(b.routeLabel));
  return rows.length ? rows : undefined;
}

const JOURNEY_PATH_LEGEND =
  "Path format: queues/sections visited in order → completion label. " +
  "Named labels (e.g. 'Discharged', 'ExitA') = explicit named outcome. " +
  "'Reneged' = entity left before being served (abandoned or timed out). " +
  "'Incomplete' = entity was still in the system when the simulation ended — " +
  "these highlight where demand outstripped capacity or where bottlenecks caused entities to get stuck. " +
  "A path with no terminal label = generic completion with no named outcome (entity finished but was not routed to a named exit).";

function extractJourneyDigest(results, model = {}) {
  const summary = results?.summary || {};
  const out = {};

  const qj = summary.queueJourneys;
  if (qj && typeof qj === "object") {
    const rows = Object.entries(qj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const total = rows.reduce((s, [, c]) => s + c, 0);
    if (rows.length) {
      out.topQueuePaths = rows.map(([path, count]) => ({
        path,
        count,
        pct: total > 0 ? Math.round(count / total * 100) : 0,
      }));
      out.pathLegend = JOURNEY_PATH_LEGEND;
    }
  }

  const sj = summary.journeys;
  const sectionById = {};
  for (const s of model.sections || []) sectionById[s.id] = s.name || s.id;
  if (sj && typeof sj === "object" && Object.keys(sj).length) {
    const rows = Object.entries(sj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const total = rows.reduce((s, [, c]) => s + c, 0);
    if (rows.length) {
      out.topSectionPaths = rows.map(([key, count]) => ({
        path: key.split("→").map(id => sectionById[id] || id).join("→"),
        count,
        pct: total > 0 ? Math.round(count / total * 100) : 0,
      }));
      if (!out.pathLegend) out.pathLegend = JOURNEY_PATH_LEGEND;
    }
  }

  return Object.keys(out).length ? out : undefined;
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
      // Include inter-arrival distribution so the LLM can suggest specific numeric param changes.
      // Only populated for single-stream events where the target is unambiguous.
      if (ev.schedules.length === 1) {
        const s = ev.schedules[0];
        if (s.dist && s.dist !== "schedule") {
          entry.dist = s.dist;
          entry.distParams = s.distParams || {};
        }
      }
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
    // Include service distribution so the LLM can suggest specific numeric param changes.
    // Only populated for single-schedule events where the target is unambiguous.
    const cScheds = ev.cSchedules || [];
    if (cScheds.length === 1 && cScheds[0].dist) {
      entry.dist = cScheds[0].dist;
      entry.distParams = cScheds[0].distParams || {};
    }
    return entry;
  });
}

/**
 * Build a compact sections digest for LLM prompts.
 * Only included for large models (≥8 queues or ≥3 stages) or when sections
 * are already configured — small single-stage models don't need sections context.
 * Resolves queue IDs to names and notes if entry/exit queues are unset.
 */
function buildSectionsDigest(model = {}) {
  const sections = model.sections || [];
  const numQueues = (model.queues || []).length;
  const isLargeModel = numQueues >= 8 || sections.length >= 3;

  // Only include sections context for large or already-sectioned models
  if (!sections.length && !isLargeModel) return [];
  if (!sections.length) return [];   // don't suggest sections just because model is large; only report what's configured

  const queueNameById = {};
  for (const q of model.queues || []) {
    if (q.id && q.name) queueNameById[q.id] = q.name;
  }
  return sections.map(s => ({
    name: s.name || s.id,
    memberQueues: (s.memberIds || []).map(id => queueNameById[id] || id).filter(Boolean),
    entryQueues:  (s.entryQueues || []).map(id => queueNameById[id] || id).filter(Boolean),
    exitQueues:   (s.exitQueues  || []).map(id => queueNameById[id] || id).filter(Boolean),
    note: (s.entryQueues || []).length === 0
      ? "No entry queue configured — entitiesIn count will be 0 in results"
      : null,
  }));
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
    anomalyRate: +(anomalies.length / entitySummary.length).toFixed(1),
    worstWait: +worstWait.toFixed(1),
    byType,
    threshold: +threshold.toFixed(1),
  };
}

export function buildKpis(model = {}, results = {}) {
  const summary = getSummary(results);
  const outcomes = extractOutcomes(summary);
  const agg = results?.aggregateStats || {};

  // For batch runs, use per-run average from CI stats rather than inflated totals.
  const resolveCount = (field) => {
    const ci = agg[`summary.${field}`];
    return (ci?.n >= 2 && Number.isFinite(ci.mean)) ? ci.mean : summary[field];
  };
  const isMultiRep = (agg["summary.served"]?.n ?? 1) > 1;

  const kpis = {
    queues: extractQueues(model, results),
    resources: extractResources(model, summary),
    throughput: finiteOrNull(resolveCount("served") ?? summary.throughput),
    totalEntities: finiteOrNull(summary.total),
    served: finiteOrNull(resolveCount("served")),
    reneged: finiteOrNull(resolveCount("reneged")),
    servedRatio: finiteOrNull(summary.servedRatio),
    renegedNote: (summary.reneged > 0) ? "Reneged entities left the system before being served (e.g. balked at a full queue or abandoned after waiting too long)." : undefined,
    avgWait: finiteOrNull(summary.avgWait),
    avgService: finiteOrNull(summary.avgSvc),
    avgSojourn: finiteOrNull(summary.avgSojourn),
    avgTimeInSystem: finiteOrNull(summary.avgTimeInSystem),
    maxSojourn: finiteOrNull(summary.maxSojourn),
    avgWIP: finiteOrNull(summary.avgWIP),
    ...(isMultiRep ? { _batchNote: `Per-run averages across ${agg["summary.served"]?.n} replications` } : {}),
  };
  if (outcomes) kpis.outcomes = outcomes;
  const journeys = extractJourneyDigest(results, model);
  if (journeys) kpis.journeys = journeys;
  if (summary.totalCost) kpis.totalCost = finiteOrNull(summary.totalCost);
  if (summary.costPerServed) kpis.costPerServed = finiteOrNull(summary.costPerServed);
  if (summary.maxWIP) kpis.maxWIP = finiteOrNull(summary.maxWIP);
  if (summary.perResource) kpis.resourceUtilisation = Object.fromEntries(
    Object.entries(summary.perResource).map(([name, r]) => [name, finiteOrNull(r.utilisation)])
  );
  if (summary.containerLevels) kpis.containerLevels = summary.containerLevels;
  if (summary.phaseCTruncated) kpis.warning_phaseCTruncated = true;
  if (summary.warnings?.length) kpis.warnings = summary.warnings;
  if (summary.terminatingState) {
    const ts = summary.terminatingState;
    const wipPct = ts.wipPct ?? (summary.total > 0 ? Math.round(((ts.waitingAtEnd + ts.servingAtEnd) / summary.total) * 100) : 0);
    kpis.terminatingState = {
      servingAtEnd: ts.servingAtEnd,
      waitingAtEnd: ts.waitingAtEnd,
      wipPct,
      note: wipPct > 10
        ? `WARNING: ${wipPct}% of entities were still in progress (${ts.servingAtEnd} serving, ${ts.waitingAtEnd} waiting) when the run ended. Service time and wait metrics may be understated — shorter tasks finish first. Review the model to identify where bottlenecks are forming. Consider increasing max simulation time or enabling the purge period.`
        : undefined,
    };
  }
  return kpis;
}

export function goalsToPrompt(model = {}) {
  const goals = model.goals || [];
  if (!goals.length) return null;
  return goals.filter(g => g.metric && g.target).map(g => {
    const scopeLabel = g.scope?.name ? `${g.scope.name} ` : "";
    return {
      metric: g.metric,
      target: parseFloat(g.target),
      operator: g.operator || "<",
      scope: g.scope || null,
      label: g.label || `${scopeLabel}${g.metric} ${g.operator} ${g.target}`,
    };
  });
}

function makeMessages(system, payload, instruction) {
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: truncateWords(JSON.stringify(instruction ? { instruction, ...payload } : payload, null, 2)),
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

  // Build a sections digest so the LLM understands section entry/exit semantics
  const sectionsDigest = buildSectionsDigest(model);

  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
      goals: goalsToPrompt(model),
      ...(stateVariables.length ? { stateVariables } : {}),
      ...(sectionsDigest.length ? { sections: sectionsDigest } : {}),
    },
    experiment,
    kpis: buildKpis(model, results),
    waitDist: waitDistForPrompt,
    perQueue: Object.keys(perQueue).length ? perQueue : undefined,
    ...(confidenceIntervals.length ? { confidenceIntervals } : {}),
    ...(shiftCapacity.length ? { shiftCapacity } : {}),
  };

  const goalGaps = buildGoalGaps(model, agg, getSummary(results));
  const goalsInstr = goalGaps?.length
    ? ` Performance goals were set. For each goal use this format: "[goal label]: current = [value], target [op] [target] → MET / MISSED (gap: [gap])". Cite exact numbers from the goalGaps data.`
    : "";

  if (goalGaps?.length) payload.goalGaps = goalGaps;

  const warningsInstr = payload.kpis.warning_phaseCTruncated
    ? " NOTE: Phase C was truncated during this run — some conditional events may not have fired. Mention this caveat."
    : "";

  const wipInstr = payload.kpis.terminatingState?.note
    ? ` WARNING: ${payload.kpis.terminatingState.note}`
    : "";

  const repInstr = experiment.replications > 1
    ? ` This was a ${experiment.replications}-replication study — reference the 95% CI ranges from confidenceIntervals rather than single-run point estimates when available.`
    : " This was a single-replication run — results are point estimates with no confidence intervals.";

  const planInstr = shiftCapacity.length
    ? " The model uses a shift-based capacity plan (shiftCapacity). Mention whether the plan appears to be adequately staffed relative to the observed demand. When suggesting capacity changes, recommend adjusting specific shift period(s) — mention the time and target capacity. Do not suggest changing the static count — shifts already control capacity."
    : "";

  return {
    kind: "narrative",
    messages: makeMessages(
      system,
      payload,
      "Highlight the most significant findings. Flag any queues where mean wait exceeds 2 x service time as possible overload. Use per-queue percentiles to distinguish typical from extreme waits. If cost or WIP data is present, comment on it briefly." + repInstr + planInstr + goalsInstr + wipInstr + warningsInstr
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

  // Arrival events — count + distribution params on first schedule
  const beCountA = (modelA.bEvents || []).length;
  const beCountB = (modelB.bEvents || []).length;
  if (beCountA !== beCountB) differences.push(`Arrival event count: ${beCountA} → ${beCountB}`);
  for (const ev of (modelA.bEvents || [])) {
    const evB = (modelB.bEvents || []).find(e => (e.name || e.id) === (ev.name || ev.id));
    if (!evB) continue;
    const sA = ev.schedules?.[0]; const sB = evB.schedules?.[0];
    if (!sA || !sB) continue;
    if (sA.dist !== sB.dist) differences.push(`"${ev.name}" arrival dist: ${sA.dist} → ${sB.dist}`);
    for (const k of Object.keys(sA.distParams || {})) {
      if ((sA.distParams[k]) !== (sB.distParams?.[k])) {
        differences.push(`"${ev.name}.${k}": ${sA.distParams[k]} → ${sB.distParams?.[k]}`);
      }
    }
  }

  // Service events — distribution params on first cSchedule
  for (const ev of (modelA.cEvents || [])) {
    const evB = (modelB.cEvents || []).find(e => (e.name || e.id) === (ev.name || ev.id));
    if (!evB) continue;
    const sA = ev.cSchedules?.[0]; const sB = evB.cSchedules?.[0];
    if (!sA || !sB) continue;
    if (sA.dist !== sB.dist) differences.push(`"${ev.name}" service dist: ${sA.dist} → ${sB.dist}`);
    for (const k of Object.keys(sA.distParams || {})) {
      if ((sA.distParams[k]) !== (sB.distParams?.[k])) {
        differences.push(`"${ev.name}.${k}": ${sA.distParams[k]} → ${sB.distParams?.[k]}`);
      }
    }
  }

  // Entity shift schedule capacities
  for (const et of etA) {
    const etBItem = (modelB.entityTypes || []).find(e => (e.name || e.id) === et.name);
    const ssA = (modelA.entityTypes || []).find(e => (e.name || e.id) === et.name)?.shiftSchedule;
    const ssB = etBItem?.shiftSchedule;
    if (!Array.isArray(ssA) || !Array.isArray(ssB)) continue;
    ssA.forEach((p, i) => {
      if (ssB[i] && p.capacity !== ssB[i].capacity) {
        differences.push(`"${et.name}" shift @t=${p.time}: capacity ${ssB[i].capacity} → ${p.capacity}`);
      }
    });
  }

  // State variables
  for (const sv of (modelA.stateVariables || [])) {
    const svB = (modelB.stateVariables || []).find(v => (v.name || v.id) === (sv.name || sv.id));
    if (svB && sv.initialValue !== svB.initialValue) {
      differences.push(`"${sv.name}" initialValue: ${svB.initialValue} → ${sv.initialValue}`);
    }
  }

  // Schedules
  const schedCountA = (modelA.schedules || []).length + (modelA.shiftSchedules || []).length;
  const schedCountB = (modelB.schedules || []).length + (modelB.shiftSchedules || []).length;
  if (schedCountA !== schedCountB) differences.push(`Schedule entry count: ${schedCountA} → ${schedCountB}`);

  if (differences.length === 0) {
    return { identical: true, note: "Both runs use identical model structure and parameter values — differences reflect seed variation only." };
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

function resolveScopedGoalValue(metric, scope, aggregateStats = {}, summary = {}) {
  if (scope?.type === "queue") {
    const qId = scope.id;
    if (aggregateStats[`queue.${metric.replace("summary.", "")}.${qId}`]?.mean != null) {
      return aggregateStats[`queue.${metric.replace("summary.", "")}.${qId}`].mean;
    }
    const wd = Array.isArray(summary.waitDist) ? summary.waitDist : [];
    const q = wd.find(w => w.queueId === qId || w.queue === qId);
    if (q) {
      if (metric === "summary.avgWait") return q.mean;
      if (metric === "summary.served") return q.n;
      if (metric === "summary.reneged") return q.reneged;
      if (metric === "summary.avgWIP" || metric === "summary.maxWIP") return q.avgDepth;
    }
    if (summary.byQueue?.[qId]) {
      const bq = summary.byQueue[qId];
      if (metric === "summary.avgWait") return bq.avgWait;
      if (metric === "summary.avgWIP" || metric === "summary.maxWIP") return bq.avgWIP;
    }
  }
  if (scope?.type === "resource") {
    const rName = scope.name || scope.id;
    if (aggregateStats[`resource.utilisation.${rName}`]?.mean != null) {
      return aggregateStats[`resource.utilisation.${rName}`].mean;
    }
    return summary.perResource?.[rName]?.utilisation ?? null;
  }
  if (scope?.type === "container") {
    const cName = scope.name || scope.id;
    const key = metric.replace("container.", "");
    if (aggregateStats[`container.${key}.${cName}`]?.mean != null) {
      return aggregateStats[`container.${key}.${cName}`].mean;
    }
    return summary.containerLevels?.[cName]?.[key] ?? null;
  }
  return null;
}

// Maps goal metric names (without summary. prefix for legacy) to aggregateStats keys
const GOAL_STAT_KEY = {
  avgWait:    "summary.avgWait",
  avgSvc:     "summary.avgSvc",
  avgSojourn: "summary.avgSojourn",
  avgTimeInSystem: "summary.avgTimeInSystem",
  avgWIP:     "summary.avgWIP",
  maxWIP:     "summary.maxWIP",
  served:     "summary.served",
  servedRatio: "summary.servedRatio",
  reneged:    "summary.reneged",
  totalCost:  "summary.totalCost",
  costPerServed: "summary.costPerServed",
};

// Goal metric paths (as stored in model.goals[].metric) → key in the single-run summary
const GOAL_SUMMARY_KEY = {
  'summary.avgWait':    'avgWait',
  'summary.avgSvc':     'avgSvc',
  'summary.avgSojourn': 'avgSojourn',
  'summary.avgTimeInSystem': 'avgTimeInSystem',
  'summary.avgWIP':     'avgWIP',
  'summary.maxWIP':     'maxWIP',
  'summary.served':     'served',
  'summary.servedRatio': 'servedRatio',
  'summary.reneged':    'reneged',
  'summary.totalCost':  'totalCost',
  'summary.costPerServed': 'costPerServed',
  avgWait:    'avgWait',
  avgSvc:     'avgSvc',
  avgSojourn: 'avgSojourn',
  avgTimeInSystem: 'avgTimeInSystem',
  avgWIP:     'avgWIP',
  maxWIP:     'maxWIP',
  served:     'served',
  servedRatio: 'servedRatio',
  reneged:    'reneged',
  totalCost:  'totalCost',
  costPerServed: 'costPerServed',
};

function resolvePercentileValue(operator, summary = {}, scope) {
  const p = parseInt(operator.replace("p", ""), 10);
  if (!p) return null;
  if (scope?.type === "queue") {
    const qId = scope.id;
    const wd = Array.isArray(summary.waitDist) ? summary.waitDist : [];
    const q = wd.find(w => w.queueId === qId || w.queue === qId);
    if (q) {
      const key = `p${p}`;
      return q[key] ?? null;
    }
  }
  const wd = Array.isArray(summary.waitDist) ? summary.waitDist : [];
  const allValues = wd.flatMap(w => w.values || []);
  if (!allValues.length) return null;
  allValues.sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * allValues.length) - 1;
  return allValues[Math.max(0, idx)] ?? null;
}

export function buildGoalGaps(model = {}, aggregateStats = {}, summary = {}) {
  const goals = model.goals || [];
  if (!goals.length) return null;
  return goals.filter(g => g.metric && g.target).map(g => {
    const isPercentile = typeof g.operator === "string" && g.operator.startsWith("p");
    let current = null;
    if (isPercentile) {
      current = finiteOrNull(resolvePercentileValue(g.operator, summary, g.scope));
    } else if (g.scope) {
      current = finiteOrNull(resolveScopedGoalValue(g.metric, g.scope, aggregateStats, summary));
    } else {
      current = finiteOrNull(aggregateStats[g.metric]?.mean)
             ?? finiteOrNull(summary[GOAL_SUMMARY_KEY[g.metric] ?? g.metric]);
    }
    const target = parseFloat(g.target);
    const op = g.operator || "<";
    let met = false;
    if (current != null) {
      if (isPercentile) {
        met = current < target;
      } else if (op === "<")  met = current < target;
      else if (op === "<=") met = current <= target;
      else if (op === ">")  met = current > target;
      else if (op === ">=") met = current >= target;
      else if (op === "==") met = Math.abs(current - target) < 0.001;
    }
    const gap = current != null ? +(current - target).toFixed(1) : null;
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
export function evaluateSweepPointGoals(goals = [], aggregateStats = {}) {
  if (!goals.length) return { feasible: null, gaps: [] };
  const gaps = goals.filter(g => g.metric && g.target).map(g => {
    const isPercentile = typeof g.operator === "string" && g.operator.startsWith("p");
    const statKey = !isPercentile && !g.scope ? (GOAL_STAT_KEY[g.metric] || null) : null;
    const current = statKey ? finiteOrNull(aggregateStats[statKey]?.mean) : null;
    const target = parseFloat(g.target);
    const op = g.operator || "<";
    let met = null;
    if (current != null) {
      if (isPercentile) met = current < target;
      else if (op === "<")  met = current < target;
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
  const goalGaps = buildGoalGaps(model, results.aggregateStats || {}, getSummary(results));

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
      ciWidth: (s.upper != null && s.lower != null) ? +(s.upper - s.lower).toFixed(1) : null,
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
      ...(() => { const sd = buildSectionsDigest(model); return sd.length ? { sections: sd } : {}; })(),
    },
    experiment: extractExperiment(experimentConfig),
    kpis,
    confidenceIntervals: confidenceIntervals.length ? confidenceIntervals : undefined,
    // perQueue already contains p50/p90/p95/p99 — omit waitDist to avoid sending duplicate percentile data
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
    "OUTPUT FORMAT — output ONLY a single JSON block wrapped in ```json ... ``` fences — no other text before or after the fences:",
    '{ "analysis": "<narrative>", "suggestions": [ { "rank": 1, "constraint": "<KPI=value (goal: op target)>", "cause": "<mechanism>", "change": { "type": "entityTypeCount|queueCapacity|stateVariable|bEventDistParam|cEventDistParam|shiftPeriodCapacity|manual", "target": "<name>", "from": 0, "to": 0 }, "predicted": "<new KPI range>", "goalImpact": "<goal label MET|MISSED>", "confidence": "high|moderate|low" } ] }',
    "AUTOMATABLE types — Run Comparison will apply this exact change to the model:",
    "  entityTypeCount    — change a flat server/entity type's numeric count (only for resources WITHOUT shiftWindows). 'from' = exact current count, 'to' = exact new count.",
    "  queueCapacity      — change a queue's numeric capacity limit. 'from' = exact current cap, 'to' = exact new cap.",
    "  stateVariable      — change a state variable's numeric initialValue. 'from' = exact current value, 'to' = exact new value.",
    "  bEventDistParam    — change a numeric parameter of a bEvent's inter-arrival distribution. 'target' = '<bEventName>.<paramKey>' (e.g. 'Arrivals.rate'). Only use when the bEvent has a single arrival stream — read dist and distParams from the model data provided.",
    "  cEventDistParam    — change a numeric parameter of a cEvent's service distribution. 'target' = '<cEventName>.<paramKey>' (e.g. 'ServiceComplete.mean'). Only use when the cEvent has a single schedule — read dist and distParams from the model data provided.",
    "  shiftPeriodCapacity — change the capacity of ONE specific period in a resource's shift schedule. 'target' = '<EntityName>.<periodTime>' where periodTime is the integer start time shown in shiftWindows (e.g. 'TriageNurse.0' for the period starting at time 0, 'TriageNurse.480' for the period starting at time 480). 'from' = current capacity of that period from shiftWindows, 'to' = new capacity. Use this for ANY resource that shows shiftWindows.",
    "  HARD REQUIREMENTS for ANY automatable type:",
    "  1. 'target' MUST exactly match the name from the model data (entityTypes, queues, stateVariables, or bEvents/cEvents).",
    "  2. 'from' MUST be the exact current numeric value — read it from the model data above. Do not guess.",
    "  3. 'to' MUST be a specific number, not a range, not null. e.g. from 3 to 4, not 'more', not null.",
    "  If the exact current value cannot be read from the model data, use 'manual'.",
    "MANUAL type — user must implement this change in the model editor:",
    "  Use type 'manual' for EVERY other kind of change, including:",
    "  - Resource suggestions phrased without specific from/to numbers ('add resources', 'redistribute capacity')",
    "  - Queue discipline changes (FIFO → Priority, shortest-job-first, etc.)",
    "  - Routing or priority rule changes (add priority queuing, bypass logic, conditional routing)",
    "  - Distribution type changes (e.g. switching from Fixed to Exponential)",
    "  - Distribution parameter changes on bEvents with multiple arrival streams",
    "  - Shift scheduling or staffing pattern adjustments",
    "  - Balking, reneging, or renege-condition modifications",
    "  - Adding a new entity type, queue, or event that does not yet exist in the model",
    "  - Any structural change that cannot be expressed as a single exact numeric field update.",
    "When in doubt, use 'manual'. A grayed-out button is far better than a comparison that makes no actual change.",
    "",
    goalInstruction,
    highLoadWarning,
  ].join("\n");

  return {
    kind: "suggestion",
    messages: makeMessages(system, payload, instruction),
    max_tokens: 1400,
  };
}

export function buildExplainResultsPrompt(model = {}, experimentConfig = {}, results = {}, ciResults = []) {
  const system = [
    "You are an expert simulation analyst and queueing systems expert.",
    "Interpret the following discrete-event simulation results and produce a structured JSON response.",
    "The response must be a single JSON block — no narrative text outside the JSON.",
    "The 'analysis' field contains a brief plain-English markdown narrative (under 200 words). The 'suggestions' array contains specific, actionable improvement recommendations.",
    "Use plain English in the analysis. Technical terms should appear only after a plain-English explanation.",
  ].join(" ");

  const perQueue = results.perQueue || {};
  const stateVariables = (model.stateVariables || []).filter(v => v.name).map(v => ({
    name: v.name, initialValue: v.initialValue ?? null,
  }));
  const entityTypes = (model.entityTypes || []).map(e => ({
    name: e.name, role: e.role, count: e.count ?? null,
  }));
  const queues = (model.queues || []).map(q => ({
    name: q.name, discipline: q.discipline, capacity: q.capacity ?? null,
  }));
  const bEvents = extractBEvents(model, results);
  const cEvents = extractCEvents(model);

  const agg = results.aggregateStats || {};
  const confidenceIntervals = Object.entries(agg)
    .filter(([, s]) => s && s.n >= 2)
    .map(([name, s]) => ({
      metric: name,
      mean: finiteOrNull(s.mean),
      ci95Lower: finiteOrNull(s.lower),
      ci95Upper: finiteOrNull(s.upper),
      n: s.n,
      ciWidth: (s.upper != null && s.lower != null) ? +(s.upper - s.lower).toFixed(1) : null,
    }));

  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description || "",
      goals: goalsToPrompt(model),
      ...(entityTypes.length ? { entityTypes } : {}),
      ...(queues.length ? { queues } : {}),
      ...(stateVariables.length ? { stateVariables } : {}),
      ...(bEvents ? { bEvents } : {}),
      ...(cEvents ? { cEvents } : {}),
    },
    experiment: extractExperiment(experimentConfig),
    kpis: buildKpis(model, results),
    // perQueue already contains p50/p90/p95/p99 — omit waitDist to avoid sending duplicate percentile data
    perQueue: Object.keys(perQueue).length ? perQueue : undefined,
    aggregateStats: results.aggregateStats || {},
    confidenceIntervals: confidenceIntervals.length ? confidenceIntervals : undefined,
  };

  const goalGaps = buildGoalGaps(model, results.aggregateStats || {}, getSummary(results));
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

  const wipInstr = payload.kpis.terminatingState?.note
    ? ` WARNING: ${payload.kpis.terminatingState.note}`
    : "";

  const goalInstruction = goalGaps?.length
    ? ` The model has performance goals. For each suggestion, state which goals would be met, which remain missed, and which are unaffected.`
    : "";

  const instruction = [
    "CRITICAL: Your ENTIRE response must be a single JSON code block wrapped in ```json ... ``` fences. No text before or after.",
    '{ "analysis": "## What Happened\\n<2–4 sentences: binding bottleneck, utilisation highlights, queue percentile data>\\n\\n## What to Change\\n<1–3 plain-English recommendations, one sentence each>", "suggestions": [ { "rank": 1, "constraint": "<KPI=value (goal: op target)>", "cause": "<mechanism>", "change": { "type": "entityTypeCount|queueCapacity|stateVariable|bEventDistParam|cEventDistParam|shiftPeriodCapacity|manual", "target": "<name>", "from": 0, "to": 0 }, "predicted": "<new KPI range>", "goalImpact": "<goal label MET|MISSED>", "confidence": "high|moderate|low" } ] }',
    "",
    "The 'analysis' value is a markdown string with exactly two headings (total under 200 words):",
    "  Heading '## What Happened': 2–4 sentences — binding bottleneck, utilisation highlights, queue percentile data." + goalsInstr + warningsInstr + wipInstr,
    "  Heading '## What to Change': 1–3 plain-English recommendations, one sentence each. Each must correspond to a suggestion object in the array.",
    "",
    "AUTOMATABLE types — Run Comparison will apply this exact change to the model:",
    "  entityTypeCount     — change a flat server/entity type's numeric count (only for resources WITHOUT shiftWindows).",
    "  queueCapacity       — change a queue's numeric capacity limit.",
    "  stateVariable       — change a state variable's numeric initialValue.",
    "  bEventDistParam     — change a numeric distribution param on a bEvent (single stream). target='EventName.paramKey'.",
    "  cEventDistParam     — change a numeric distribution param on a cEvent (single schedule). target='EventName.paramKey'.",
    "  shiftPeriodCapacity — change ONE shift period capacity for a resource with shiftWindows. target='EntityName.<periodTime>' (e.g. 'TriageNurse.0'). 'from' = current capacity of that period from shiftWindows, 'to' = new capacity.",
    "  HARD REQUIREMENTS for ANY automatable type:",
    "  1. 'target' MUST exactly match the name from model.entityTypes, model.queues, or model.stateVariables.",
    "  2. 'from' MUST be the exact current numeric value — read it from model data. Do not guess.",
    "  3. 'to' MUST be a specific number, not a range, not null.",
    "  If the exact current value cannot be confirmed from the model data, use 'manual'.",
    "MANUAL type — use for: discipline changes, routing, distribution type changes, structural additions, multi-stream events, or multi-period shift adjustments.",
    "When in doubt, use 'manual'. A grayed-out button is far better than a comparison that makes no actual change.",
    "Never give vague advice — always name the exact parameter and specific value.",
    "When the model has a failure/repair model, factor availability into capacity calculations.",
    "When state variables are present, they may represent conditions that affect routing or service rates.",
    goalInstruction,
    highLoadWarning,
  ].join("\n");

  return {
    kind: "explainResults",
    messages: makeMessages(system, payload, instruction),
    max_tokens: 2400,
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

  // Repair common LLM structural error: premature } closes a suggestion object before
  // predicted/goalImpact/confidence are written, leaving them as stray array properties.
  // e.g. { ..., "to": 4 }, "predicted": "..." → { ..., "to": 4, "predicted": "..."
  const tryRepair = (json) => json
    .replace(/([\d"'true|false|null])\s*\}\s*,\s*"predicted"\s*:/g, '$1, "predicted":')
    .replace(/([\d"'true|false|null])\s*\}\s*,\s*"goalImpact"\s*:/g, '$1, "goalImpact":')
    .replace(/([\d"'true|false|null])\s*\}\s*,\s*"confidence"\s*:/g, '$1, "confidence":');

  // Recover partial suggestions when the last entry is truncated/malformed — walk
  // backwards through },  boundaries and close the array at the first valid one.
  const tryTruncate = (json) => {
    const sugStart = json.indexOf('"suggestions"');
    if (sugStart === -1) return json;
    let cursor = json.lastIndexOf('},');
    while (cursor > sugStart) {
      const candidate = json.substring(0, cursor + 1) + '] }';
      try { JSON.parse(candidate); return candidate; } catch { /* try earlier boundary */ }
      cursor = json.lastIndexOf('},', cursor - 1);
    }
    return json;
  };

  // Normalise a suggestion that has type/target/from/to at the top level (no change wrapper).
  const normaliseSuggestion = (s) => {
    if (s.change) return s;
    const type = s.type || s.changeType;
    if (!type) return s;
    return {
      ...s,
      change: { type, target: s.target ?? s.changeTarget ?? null, from: s.from ?? s.changeFrom ?? null, to: s.to ?? s.changeTo ?? null },
    };
  };

  const parseSuggestions = (parsed) => Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .filter(s => s && typeof s === "object")
        .map(normaliseSuggestion)
        .filter(s => typeof s.rank === "number" && s.change && typeof s.change.type === "string")
    : [];

  const repaired = tryRepair(rawJson);
  for (const candidate of [rawJson, repaired, tryTruncate(rawJson), tryTruncate(repaired)]) {
    try {
      const parsed = JSON.parse(candidate);
      const analysis = typeof parsed.analysis === "string" ? parsed.analysis : (narrativeOnly || "");
      return { analysis, suggestions: parseSuggestions(parsed) };
    } catch { /* try next candidate */ }
  }

  // Both parse attempts failed — return narrative only.
  const cleaned = stripStructuredBlock(text);
  return { analysis: cleaned || text, suggestions: [] };
}

export function applySuggestionPatch(model, change) {
  const clone = JSON.parse(JSON.stringify(model));
  if (!change || !change.type) return clone;

  if (change.type === "entityTypeCount") {
    const entities = clone.entityTypes || [];
    const found = entities.find(e => e.name === change.target || e.id === change.target);
    if (!found) return clone;
    const oldCount = Number(found.count) || 1;
    const newCount = Number.isInteger(change.to) ? change.to : parseInt(change.to, 10);
    found.count = newCount;
    // Engine overwrites count with shiftSchedule[0].capacity — scale all shift periods too.
    if (Array.isArray(found.shiftSchedule) && found.shiftSchedule.length > 0 && oldCount > 0) {
      const scale = newCount / oldCount;
      found.shiftSchedule = found.shiftSchedule.map(p => ({
        ...p,
        capacity: Math.max(1, Math.round(p.capacity * scale)),
      }));
    }
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

  if (change.type === "bEventDistParam") {
    const [eventName, paramKey] = (change.target || "").split(".");
    const ev = (clone.bEvents || []).find(e => e.name === eventName || e.id === eventName);
    const sched = ev?.schedules?.[0];
    if (sched?.distParams && paramKey && paramKey in sched.distParams) {
      sched.distParams[paramKey] = change.to;
    }
    return clone;
  }

  if (change.type === "cEventDistParam") {
    const [eventName, paramKey] = (change.target || "").split(".");
    const ev = (clone.cEvents || []).find(e => e.name === eventName || e.id === eventName);
    const sched = ev?.cSchedules?.[0];
    if (sched?.distParams && paramKey && paramKey in sched.distParams) {
      sched.distParams[paramKey] = change.to;
    }
    return clone;
  }

  if (change.type === "shiftPeriodCapacity") {
    const dotIdx = (change.target || "").lastIndexOf(".");
    const entityName = change.target.slice(0, dotIdx);
    const periodTime = Number(change.target.slice(dotIdx + 1));
    const et = (clone.entityTypes || []).find(e => e.name === entityName || e.id === entityName);
    if (et && Array.isArray(et.shiftSchedule)) {
      const period = et.shiftSchedule.find(p => Number(p.time) === periodTime);
      if (period) {
        period.capacity = change.to;
        if (periodTime === 0) et.count = change.to;
      }
    }
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

  // On the first turn send the full data context; follow-up turns send the question only.
  // The conversation history gives the LLM sufficient context without repeating the payload.
  const isFirstTurn = conversationHistory.length === 0;

  let userContent;
  if (isFirstTurn) {
    const summary = getSummary(results);
    const kpis = buildKpis(model, results);
    const entityTypes = (model.entityTypes || []).map(e => ({ name: e.name, role: e.role }));
    const queues = (model.queues || []).map(q => ({
      name: q.name,
      discipline: q.discipline,
      capacity: q.capacity,
      customerType: q.customerType,
    }));
    const perQueue = results.perQueue || {};
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
      perQueue: Object.keys(perQueue).length ? perQueue : null,
      timeSeriesAvailable: !!(Array.isArray(results.timeSeries) && results.timeSeries.length > 0),
    };
    userContent = truncateWords(JSON.stringify({ question, data: dataPayload }));
  } else {
    userContent = question;
  }

  const messages = [
    { role: "system", content: system },
    ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
    { role: "user", content: userContent },
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

  const goalGaps = buildGoalGaps(model, results.aggregateStats || {}, getSummary(results));
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
        content: truncateWords(JSON.stringify({ instruction, ...payload }, null, 2)),
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
    // No JSON structure detected — treat the whole response as a plain-text analysis
    if (!fenceMatch && !incompleteFence && !tagMatch) {
      return { analysis: text.trim(), recommendations: [], infeasibleGoals: [] };
    }

    // Truncated JSON — try to salvage the analysis field and any complete recommendation objects
    const analysisMatch = rawJson.match(/"analysis"\s*:\s*"((?:[^"\\]|\\.)*)"/);;
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

  const goalGaps = buildGoalGaps(model, results.aggregateStats || {}, getSummary(results));
  const entityAnomalies = extractEntityAnomalies(results);
  const queues = extractQueues(model, results);
  const resources = extractResources(model, summary);
  const outcomes = extractOutcomes(summary);

  const payload = {
    model: { name: model.name || DEFAULT_MODEL_NAME, goals: goalsToPrompt(model) },
    kpis: { avgWait: finiteOrNull(summary.avgWait), avgSvc: finiteOrNull(summary.avgSvc), served: finiteOrNull(summary.served), reneged: finiteOrNull(summary.reneged), avgWIP: finiteOrNull(summary.avgWIP), ...(outcomes ? { outcomes } : {}) },
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

export function buildModelQueryPrompt(question, model = {}, history = [], context = {}) {
  const isFirstTurn = history.length === 0;

  let userContent;
  if (isFirstTurn) {
    const entityTypes = (model.entityTypes || []).map(et => {
      const entry = { name: et.name || et.id, role: et.role || 'customer' };
      if (et.role === 'server') entry.count = et.count ?? 1;
      const attrs = (et.attrDefs || []).filter(a => a.name).map(a => ({
        name: a.name,
        valueType: a.valueType || 'number',
        ...(a.defaultValue != null && a.defaultValue !== '' ? { defaultValue: a.defaultValue } : {}),
      }));
      if (attrs.length) entry.attributes = attrs;
      if (et.mtbfDist) entry.failureModel = { mtbfDist: et.mtbfDist, mttrDist: et.mttrDist };
      return entry;
    });

    const queues = (model.queues || []).map(q => ({
      name: q.name || q.id,
      discipline: q.discipline || 'FIFO',
      capacity: q.capacity ?? null,
      customerType: q.customerType || null,
    }));

    const bEvents = (model.bEvents || []).slice(0, 12).map(ev => {
      const effects = Array.isArray(ev.effect) ? ev.effect : (ev.effect ? [ev.effect] : []);
      const effectTypes = [...new Set(
        effects.map(e => String(e).match(/^\w+/)?.[0]?.toUpperCase()).filter(Boolean)
      )];
      return { name: ev.name || ev.id, effectTypes: effectTypes.length ? effectTypes : ['none'] };
    });

    const cEvents = (model.cEvents || []).slice(0, 12).map(ev => {
      const effects = Array.isArray(ev.effect) ? ev.effect : (ev.effect ? [ev.effect] : []);
      const effectTypes = [...new Set(
        effects.map(e => String(e).match(/^\w+/)?.[0]?.toUpperCase()).filter(Boolean)
      )];
      return { name: ev.name || ev.id, priority: ev.priority ?? null, effectTypes: effectTypes.length ? effectTypes : ['none'] };
    });

    const goals = (model.goals || []).filter(g => g.metric && g.target).map(g => ({
      label: g.label || g.metric,
      metric: g.metric,
      operator: g.operator || '<',
      target: parseFloat(g.target),
    }));

    const sectionsDigest = buildSectionsDigest(model);
    const stateVariables = (model.stateVariables || []).filter(v => v.name).map(v => ({
      name: v.name, initialValue: v.initialValue ?? null,
    }));

    const modelDigest = {
      name: model.name || 'Unnamed',
      description: model.description || '',
      entityTypes,
      queues,
      bEvents: bEvents.length ? bEvents : undefined,
      cEvents: cEvents.length ? cEvents : undefined,
      goals: goals.length ? goals : undefined,
      sections: sectionsDigest.length ? sectionsDigest : undefined,
      stateVariables: stateVariables.length ? stateVariables : undefined,
    };

    if (context.currentTab) modelDigest._currentTab = context.currentTab;
    if (context.workflowMode) modelDigest._workflowMode = context.workflowMode;

    const systemContent = [
      "You are assisting a simulation modeller in simmodlr. You have full knowledge of the model structure below.",
      "Give concrete, specific answers that reference the model's actual entities, queues, events, and attributes by name.",
      "When asked to review a specific editor tab (entity types, queues, B-events, C-events, sections, state variables), focus your analysis on that area.",
      "If the model has C-events, you can reason about conditional event logic and whether the conditions and effects are correctly wired.",
      "If the model has performance goals, you can assess whether the model structure is sufficient to measure them.",
      "If a question requires running the simulation to answer definitively (e.g. 'what is the average wait?'), say so — you can only reason about the model definition, not predict results.",
      "Do not invent data not present in the model context above.",
    ].join('\n\n');

    userContent = truncateWords(JSON.stringify({ question, model: modelDigest }, null, 2));
  } else {
    userContent = question;
  }

  const messages = [
    ...(isFirstTurn ? [{ role: 'system', content: 'You are assisting a simulation modeller in simmodlr. You have detailed knowledge of the model. Answer concisely and precisely. Do not invent data.' }] : [{ role: 'system', content: 'Continue assisting the modeller about the model described earlier. Be concise and precise. Do not invent data.' }]),
    ...history.slice(-8),
    { role: 'user', content: userContent },
  ];

  return { kind: 'model_query', messages, max_tokens: 600 };
}

// ── Explore: adaptive batch analysis with opportunity identification ──────────

/**
 * Builds a prompt that asks the LLM to identify bottlenecks, quick wins, and
 * investment opportunities from a statistically validated batch result.
 *
 * @param {Object} model
 * @param {Object} combinedResult  - output of makeBatchResult
 * @param {Object} aggregateStats  - output of summarizeReplicationResults (CI per metric path)
 * @param {Object} ciSummary       - { kpiPath, ci, converged, finalReps, relativeHalfWidth }
 * @param {string} tier            - 'free' | 'standard' | 'pro'
 * @returns {{ kind: string, messages: Array, max_tokens: number }}
 */
export function buildBatchAnalysisPrompt(model, combinedResult, aggregateStats, ciSummary, tier) {
  const system =
    "You are an expert discrete-event simulation analyst. You have been given statistically " +
    "validated batch simulation results. Identify improvement opportunities in a structured format. " +
    "Be specific: cite queue names, utilisation percentages, and CI ranges from aggregateStats. " +
    "Keep each point to one sentence. Use only the data provided — do not invent figures.";

  const kpis = buildKpis(model, combinedResult);
  const goals = goalsToPrompt(model);

  const rwhText = ciSummary.relativeHalfWidth != null
    ? `±${ciSummary.relativeHalfWidth.toFixed(1)}%`
    : "unknown";

  const goalGaps = buildGoalGaps(model, aggregateStats, getSummary(combinedResult));
  const bEvents = extractBEvents(model, combinedResult);
  const cEvents = extractCEvents(model);
  const payload = {
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      description: model.description ? truncateWords(model.description, 60) : undefined,
      goals,
      entityTypes: (model.entityTypes || []).map(e => ({ name: e.name, role: e.role, count: e.count, ...(Array.isArray(e.shiftSchedule) && e.shiftSchedule.length ? { shiftWindows: e.shiftSchedule.map(p => ({ time: parseInt(p.time, 10) || 0, capacity: parseInt(p.capacity, 10) || 1 })) } : {}) })),
      queues: (model.queues || []).map(q => ({ name: q.name, capacity: q.capacity ?? null })),
      stateVariables: (model.stateVariables || []).filter(v => v.name).map(v => ({ name: v.name, initialValue: v.initialValue ?? null })),
      ...(bEvents ? { bEvents } : {}),
      ...(cEvents ? { cEvents } : {}),
    },
    statisticalContext: {
      finalReplications: ciSummary.finalReps,
      converged: ciSummary.converged,
      relativeHalfWidth: rwhText,
      tier,
      primaryKpi: ciSummary.kpiPath,
      ci: ciSummary.ci
        ? {
            mean: finiteOrNull(ciSummary.ci.mean),
            lower: finiteOrNull(ciSummary.ci.lower),
            upper: finiteOrNull(ciSummary.ci.upper),
            halfWidth: finiteOrNull(ciSummary.ci.halfWidth),
          }
        : null,
    },
    kpis,
    aggregateStats: Object.fromEntries(
      Object.entries(aggregateStats || {})
        .filter(([, v]) => v && v.n > 0)
        .map(([k, v]) => [k, { n: v.n, mean: finiteOrNull(v.mean), lower: finiteOrNull(v.lower), upper: finiteOrNull(v.upper) }])
    ),
    ...(goalGaps?.length ? { goalGaps } : {}),
  };

  const goalsInstr = goalGaps?.length
    ? ` Performance goals were set. For each goal use this format: "[goal label]: current = [value], target [op] [target] → MET / MISSED (gap: [gap])". Cite exact numbers from the goalGaps data.`
    : "";

  const truncatedInstr = kpis.warning_phaseCTruncated
    ? " NOTE: Phase C was truncated during this run — some conditional events may not have fired. Mention this caveat in the Confidence Summary."
    : "";

  const instruction =
    "Produce a structured analysis with exactly these five sections:\n" +
    "### Bottlenecks\nRank the top 3 bottlenecks by impact on throughput or wait time. " +
    "For each state the queue/resource name, utilisation or wait metric, and why it is a bottleneck.\n" +
    "### Quick Wins\nIn 2–3 sentences of prose (NO numbered list), describe the most impactful policy or scheduling change achievable without adding resources (e.g. priority rules, routing, warmup period). Do NOT use numbered list items in this section.\n" +
    "### Investment Opportunities\nIn 1–2 sentences of prose (NO numbered list), describe structural improvements requiring additional resources or redesign. Do NOT use numbered list items in this section.\n" +
    "### Automatable Changes\nList up to 3 changes that can be expressed as a single numeric parameter update to the existing model. " +
    "Allowed types: (a) server/entity-type count — only for resources WITHOUT shiftWindows, (b) a single shift period capacity for a resource that shows shiftWindows — format 'EntityName.<periodTime>' e.g. 'TriageNurse.0' for period at time 0 — cite the period time, current capacity, and proposed capacity from shiftWindows, (c) queue capacity limit, (d) state variable initial value, (e) a numeric distribution parameter on a bEvent or cEvent with a single schedule. " +
    "For each item cite the exact current value from the model data and propose a specific new number — no ranges, no vague directions. " +
    "Format each as a numbered item, e.g. '1. Increase Nurse count from 2 to 3 — expected to reduce avgWait by ~30%' or '2. Reduce Arrivals inter-arrival rate from 0.5 to 0.4'. " +
    "If no such changes are warranted by the data, omit this section entirely.\n" +
    "### Confidence Summary\nOne paragraph: state whether results are statistically robust, " +
    "cite the CI and replication count, and flag any caveats from non-convergence or warnings.\n\n" +
    "NUMBER FORMAT: Express all numeric values to at most 1 decimal place. Express all utilisation values as integer percentages (e.g. '57%' not '57.3%' or '0.57'). Express all time values to at most 1 decimal place." +
    goalsInstr + truncatedInstr;

  return {
    kind: "batch_analysis",
    messages: makeMessages(system, payload, instruction),
    max_tokens: 1000,
  };
}

/**
 * Converts a free-text improvement opportunity into a single structured change object,
 * using the same schema as buildSuggestionPrompt so applySuggestionPatch can apply it.
 */
export function buildApplyOpportunityPrompt(opportunityText, model = {}, results = {}) {
  const system = [
    "You are a queueing systems expert. Given a simulation improvement opportunity and the current model,",
    "produce a single structured change in the exact JSON format specified.",
    "Be specific: name the exact parameter, its current value from the model, and the proposed new value.",
    "If the improvement is directional (e.g. 'increase doctors') but no specific number is given,",
    "choose a sensible increment (+1 server, or the smallest change expected to improve the KPI) and explain in 'predicted'.",
    "Use type 'manual' ONLY if the change cannot be expressed as a single numeric field update.",
  ].join(" ");

  const entityTypes = (model.entityTypes || []).map(e => ({
    name: e.name, role: e.role, count: e.count,
    ...(Array.isArray(e.shiftSchedule) && e.shiftSchedule.length ? { shiftWindows: e.shiftSchedule.map(p => ({ time: parseInt(p.time, 10) || 0, capacity: parseInt(p.capacity, 10) || 1 })) } : {}),
  }));
  const queues = (model.queues || []).map(q => ({
    name: q.name, capacity: q.capacity ?? null,
  }));
  const stateVariables = (model.stateVariables || []).filter(v => v.name).map(v => ({
    name: v.name, initialValue: v.initialValue ?? null,
  }));
  const bEvents = extractBEvents(model, results || {});
  const cEvents = extractCEvents(model);
  const kpis = buildKpis(model, results || {});

  const payload = {
    opportunity: opportunityText,
    model: {
      name: model.name || DEFAULT_MODEL_NAME,
      entityTypes,
      queues,
      stateVariables,
      ...(bEvents ? { bEvents } : {}),
      ...(cEvents ? { cEvents } : {}),
    },
    kpis,
  };

  const instruction = [
    "Convert this improvement opportunity into a single structured change.",
    "Output one JSON block wrapped in ```json ... ``` fences with this schema:",
    '{ "analysis": "<one sentence explaining what will change and why>", "suggestions": [ { "rank": 1, "constraint": "<metric=value>", "cause": "<brief cause>", "change": { "type": "entityTypeCount|queueCapacity|stateVariable|bEventDistParam|cEventDistParam|shiftPeriodCapacity|manual", "target": "<exact name from model>", "from": 0, "to": 0 }, "predicted": "<expected improvement>", "goalImpact": "<MET|MISSED|N/A>", "confidence": "high|moderate|low" } ] }',
    "AUTOMATABLE types — Run Comparison will apply this exact change to the model:",
    "  entityTypeCount     — change a flat server/entity type's numeric count (only for resources WITHOUT shiftWindows). 'from' = exact current count, 'to' = exact new count.",
    "  queueCapacity       — change a queue's numeric capacity limit. 'from' = exact current cap, 'to' = exact new cap.",
    "  stateVariable       — change a state variable's numeric initialValue. 'from' = exact current value, 'to' = exact new value.",
    "  bEventDistParam     — change a numeric distribution parameter on a bEvent. 'target' = '<bEventName>.<paramKey>' (e.g. 'Arrivals.rate'). Only use when the bEvent has a single arrival stream with dist and distParams visible in the model data.",
    "  cEventDistParam     — change a numeric distribution parameter on a cEvent. 'target' = '<cEventName>.<paramKey>' (e.g. 'ServiceComplete.mean'). Only use when the cEvent has a single schedule with dist and distParams visible in the model data.",
    "  shiftPeriodCapacity — change ONE shift period capacity for a resource with shiftWindows. 'target' = '<EntityName>.<periodTime>' where periodTime is the integer start time from shiftWindows (e.g. 'TriageNurse.0' for period at time 0, 'TriageNurse.480' for period at time 480). 'from' = current capacity of that period from shiftWindows, 'to' = new capacity.",
    "  HARD REQUIREMENTS for ANY automatable type:",
    "  1. 'target' MUST exactly match the name from the model data.",
    "  2. 'from' MUST be the exact current numeric value — read it from the model data above. Do not guess.",
    "  3. 'to' MUST be a specific number, not a range, not null.",
    "  If the exact current value cannot be read from the model, use 'manual'.",
    "MANUAL type — user must implement this change in the model editor:",
    "  Use type 'manual' for EVERY other kind of change, including:",
    "  - Resource suggestions phrased without specific from/to numbers ('add resources', 'redistribute capacity')",
    "  - Queue discipline changes (FIFO → Priority, shortest-job-first, etc.)",
    "  - Routing or priority rule changes",
    "  - Distribution type changes (e.g. switching from Fixed to Exponential)",
    "  - Distribution parameter changes on bEvents with multiple arrival streams",
    "  - Shift scheduling or staffing pattern adjustments",
    "  - Balking, reneging, or renege-condition modifications",
    "  - Adding a new entity type, queue, or event that does not yet exist in the model",
    "  - Any structural change that cannot be expressed as a single exact numeric field update.",
    "When in doubt, use 'manual'. A grayed-out button is far better than a comparison that makes no actual change.",
  ].join("\n");

  return {
    kind: "suggestion",
    messages: makeMessages(system, payload, instruction),
    max_tokens: 800,
  };
}
