// @ts-check
import { getPiecewisePeriods, normalizeDistributionName } from "./distributions.js";

const STAGE_MACROS = new Set(["ASSIGN", "COSEIZE", "MATCH", "BATCH", "UNBATCH", "DELAY"]);
// Stage macros whose input queue is args[0] and whose output is the B-event(s)
// the C-event schedules — the ones the flow walk below can follow. MATCH,
// BATCH and UNBATCH move or merge entities through queues named inside the
// macro, so a model using them falls back to the conservative stage count.
const FLOW_STAGE_MACROS = new Set(["ASSIGN", "COSEIZE", "DELAY"]);
// SPLIT creates child entities mid-route, so per-arrival visits undercount.
const ENTITY_MULTIPLYING_MACROS = new Set(["SPLIT", "JOIN"]);
// Phase C only evaluates C-events whose inputs changed (dirty-set filtering)
// once a model has this many C-events — mirrors enableFilteredPhaseC in
// engine/index.js.
const FILTERED_PHASE_C_MIN_CEVENTS = 8;
// Scans per B-event firing when no measured ratio is available. Calibrated on
// the built-in templates and the World Oil Network model: without filtering
// every C-event is evaluated once per pass and a firing usually triggers a
// second pass (measured 1.3–1.7 × C-events per B-event); with filtering the
// skipped C-events roughly offset the restart passes (measured 0.9 × C-events
// on the oil model, 23 C-events).
const DEFAULT_FILTERED_SCAN_FRACTION = 1;
const DEFAULT_UNFILTERED_PASSES = 1.5;
const SERVICE_MACROS = new Set(["ASSIGN", "COSEIZE"]);

/** @param {any} effect */
function effectText(effect) {
  if (Array.isArray(effect)) return effect.filter(Boolean).join(";");
  return String(effect || "");
}

/** @param {any} effect */
function parseCalls(effect) {
  const text = effectText(effect);
  /** @type {Array<{ macro: string, args: string[] }>} */
  const calls = [];
  for (const match of text.matchAll(/([A-Z_]+)\s*\(([^)]*)\)/g)) {
    const macro = String(match[1] || "").trim().toUpperCase();
    const args = String(match[2] || "")
      .split(",")
      .map(part => part.trim())
      .filter(Boolean);
    calls.push({ macro, args });
  }
  return calls;
}

/** @param {any} value */
function parsePositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {any} dist
 * @param {Record<string, any>} [params]
 * @returns {number|null}
 */
function meanForDistribution(dist, params = {}) {
  const name = normalizeDistributionName(dist);
  switch (name) {
    case "Fixed":
      return parsePositiveNumber(params.value);
    case "Uniform": {
      const min = Number(params.min);
      const max = Number(params.max);
      return Number.isFinite(min) && Number.isFinite(max) && max >= min ? (min + max) / 2 : null;
    }
    case "Exponential":
      return parsePositiveNumber(params.mean);
    case "Normal":
      return parsePositiveNumber(params.mean);
    case "Triangular": {
      const min = Number(params.min);
      const mode = Number(params.mode);
      const max = Number(params.max);
      return Number.isFinite(min) && Number.isFinite(mode) && Number.isFinite(max) ? (min + mode + max) / 3 : null;
    }
    case "Erlang":
      return parsePositiveNumber(params.mean);
    case "Empirical": {
      const values = Array.isArray(params.values) ? params.values.map(Number).filter(Number.isFinite) : [];
      if (!values.length) return null;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    case "Piecewise": {
      const periods = getPiecewisePeriods(params);
      const nestedMeans = periods
        .map((/** @type {any} */ period) => {
          const raw = period.distribution || period;
          return meanForDistribution(raw.dist || raw.type || "Fixed", {
            ...(raw.distParams || raw.params || {}),
            value: raw.value ?? raw.distParams?.value ?? raw.params?.value,
            mean: raw.mean ?? raw.distParams?.mean ?? raw.params?.mean,
            min: raw.min ?? raw.distParams?.min ?? raw.params?.min,
            max: raw.max ?? raw.distParams?.max ?? raw.params?.max,
            mode: raw.mode ?? raw.distParams?.mode ?? raw.params?.mode,
            stddev: raw.stddev ?? raw.distParams?.stddev ?? raw.params?.stddev,
            k: raw.k ?? raw.distParams?.k ?? raw.params?.k,
          });
        })
        .filter(Number.isFinite);
      if (!nestedMeans.length) return null;
      return /** @type {number[]} */ (nestedMeans).reduce((sum, value) => sum + value, 0) / nestedMeans.length;
    }
    default:
      return null;
  }
}

/** @param {number[]} values */
function sumCounts(values) {
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * @param {Record<string, any>} [schedule]
 * @param {Record<string, any>} [schedulesMap]
 */
function countScheduleEntries(schedule = {}, schedulesMap = {}) {
  const distName = normalizeDistributionName(schedule.dist);
  const hasRows = Array.isArray(schedule.rows) && schedule.rows.length > 0;
  const hasRef = !!schedule.scheduleRef;
  if (distName !== "Schedule" && !hasRows && !hasRef) return 0;

  // ADR-016: external schedule referenced by UUID
  if (schedule.scheduleRef) {
    const external = schedulesMap[schedule.scheduleRef];
    return Array.isArray(external?.rows) ? external.rows.length : 0;
  }
  // ADR-016: inline rows stored at top level of the schedule entry
  if (Array.isArray(schedule.rows) && schedule.rows.length > 0) {
    return schedule.rows.length;
  }
  // Legacy format: rows/times inside distParams
  const rows = Array.isArray(schedule.distParams?.rows) ? schedule.distParams.rows.length : 0;
  const times = Array.isArray(schedule.distParams?.times) ? schedule.distParams.times.length : 0;
  return rows + times;
}

/**
 * @param {Record<string, any>} model
 * @param {Record<string, any>} [schedulesMap]
 */
export function countPlannedScheduleRows(model, schedulesMap = {}) {
  let total = 0;
  for (const bEvent of model?.bEvents || []) {
    for (const schedule of bEvent.schedules || []) {
      total += countScheduleEntries(schedule, schedulesMap);
    }
  }
  for (const cEvent of model?.cEvents || []) {
    for (const schedule of cEvent.cSchedules || []) {
      total += countScheduleEntries(schedule, schedulesMap);
    }
  }
  return total;
}

/**
 * @param {Record<string, any>} schedule
 * @param {Record<string, any>} schedulesMap
 */
function resolveScheduleRows(schedule, schedulesMap) {
  // ADR-016 external
  if (schedule.scheduleRef) {
    const external = schedulesMap[schedule.scheduleRef];
    return Array.isArray(external?.rows) ? external.rows : [];
  }
  // ADR-016 inline top-level
  if (Array.isArray(schedule.rows) && schedule.rows.length > 0) {
    return schedule.rows;
  }
  // Legacy distParams.rows or distParams.times
  if (Array.isArray(schedule.distParams?.rows)) return schedule.distParams.rows;
  if (Array.isArray(schedule.distParams?.times)) return schedule.distParams.times.map((/** @type {any} */ t) => ({ time: t }));
  return [];
}

/**
 * @param {Record<string, any>} bEvent
 * @param {number|null} maxSimTime
 * @param {string[]} unknowns
 * @param {Record<string, any>} [schedulesMap]
 */
function estimateRecurringArrivals(bEvent, maxSimTime, unknowns, schedulesMap = {}) {
  const calls = parseCalls(bEvent.effect).filter(call => call.macro === "ARRIVE");
  if (!calls.length) return { plannedArrivals: 0, expectedArrivals: 0, meanArrivalRateByQueue: {}, expectedArrivalsByQueue: {}, firings: 0 };

  const scheduledTime = Number.isFinite(Number(bEvent.scheduledTime)) ? Number(bEvent.scheduledTime) : 0;
  const selfSchedules = (bEvent.schedules || []).filter((/** @type {any} */ schedule) => schedule.eventId === bEvent.id);
  const initialMultiplier = maxSimTime == null || scheduledTime <= maxSimTime ? calls.length : 0;
  let plannedArrivals = initialMultiplier;
  let expectedArrivals = initialMultiplier;
  /** @type {Record<string, number>} */
  const meanArrivalRateByQueue = {};

  for (const schedule of selfSchedules) {
    const distName = normalizeDistributionName(schedule.dist);
    const hasInlineRows = Array.isArray(schedule.rows) && schedule.rows.length > 0;
    const hasRef = !!schedule.scheduleRef;
    if (distName === "Schedule" || hasInlineRows || hasRef) {
      const rows = resolveScheduleRows(schedule, schedulesMap);
      const times = rows.map((/** @type {any} */ row) => Number(row.time ?? row)).filter(Number.isFinite);
      if (maxSimTime == null) {
        unknowns.push(`Arrival event '${bEvent.name || bEvent.id}' uses a planned schedule, but the stop rule is not time-bounded.`);
        continue;
      }
      const withinHorizon = times.filter((/** @type {number} */ time) => time <= maxSimTime).length * calls.length;
      plannedArrivals += withinHorizon;
      expectedArrivals += withinHorizon;
      // Derive an effective mean arrival rate so bottleneck detection works for timetable models
      if (maxSimTime > 0 && withinHorizon > 0) {
        const effectiveRate = withinHorizon / maxSimTime;
        for (const call of calls) {
          const queueName = call.args[1] || call.args[0] || "default";
          meanArrivalRateByQueue[queueName] = (meanArrivalRateByQueue[queueName] || 0) + effectiveRate;
        }
      }
      continue;
    }

    const mean = meanForDistribution(schedule.dist, schedule.distParams || {});
    if (!(maxSimTime != null) || mean == null || !Number.isFinite(mean) || mean <= 0) {
      unknowns.push(`Arrival event '${bEvent.name || bEvent.id}' uses ${distName} recurrence that cannot be bounded confidently before execution.`);
      continue;
    }

    const remainingWindow = Math.max(0, maxSimTime - scheduledTime);
    const repeats = Math.ceil(remainingWindow / mean) * calls.length;
    expectedArrivals += repeats;
    const rate = 1 / mean;
    for (const call of calls) {
      const queueName = call.args[1] || call.args[0] || "default";
      meanArrivalRateByQueue[queueName] = (meanArrivalRateByQueue[queueName] || 0) + rate;
    }
  }

  // Every ARRIVE call in the effect fires once per firing of the event, so
  // each call's queue receives expectedArrivals / calls.length entities.
  const firings = expectedArrivals / calls.length;
  /** @type {Record<string, number>} */
  const expectedArrivalsByQueue = {};
  for (const call of calls) {
    const queueName = queueKey(call.args[1]);
    expectedArrivalsByQueue[queueName] = (expectedArrivalsByQueue[queueName] || 0) + firings;
  }
  return { plannedArrivals, expectedArrivals, meanArrivalRateByQueue, expectedArrivalsByQueue, firings };
}

/** @param {any} name */
function queueKey(name) {
  return String(name || "").trim().toLowerCase();
}

/**
 * Firings of a B-event that does not ARRIVE entities but re-schedules itself
 * (a clock tick, a daily demand top-up, a status refresh). Each firing is a
 * cycle and a Phase C scan even though no entity moves.
 * @param {Record<string, any>} bEvent
 * @param {number|null} maxSimTime
 */
function estimateRecurringNonArrivalFirings(bEvent, maxSimTime) {
  if (maxSimTime == null) return 0;
  if (parseCalls(bEvent.effect).some(call => call.macro === "ARRIVE")) return 0;
  const selfSchedules = (bEvent.schedules || []).filter((/** @type {any} */ schedule) => schedule.eventId === bEvent.id);
  if (!selfSchedules.length) return 0;
  const scheduledTime = Number(bEvent.scheduledTime);
  if (!Number.isFinite(scheduledTime) || scheduledTime > maxSimTime) return 0;
  let firings = 1;
  for (const schedule of selfSchedules) {
    const mean = meanForDistribution(schedule.dist, schedule.distParams || {});
    if (mean == null || !Number.isFinite(mean) || mean <= 0) continue;
    firings += Math.ceil(Math.max(0, maxSimTime - scheduledTime) / mean);
  }
  return firings;
}

/**
 * Expected number of stage visits (C-event firings that each schedule one
 * completion B-event) for an entity entering each queue, found by walking the
 * model's flow: queue → consuming ASSIGN/COSEIZE/DELAY C-event → the B-event
 * it schedules → routing / probabilistic routing / RELEASE target queue → …
 * Probabilistic branches are weighted by probability; conditional branches
 * and alternative consumers of the same queue take the longest path, so the
 * figure errs high. Returns null when the flow can't be followed (loops,
 * MATCH/BATCH/UNBATCH stages), in which case the caller falls back to
 * assuming every entity visits every stage.
 * @param {Record<string, any>} model
 * @returns {((queueName: string) => number) | null}
 */
function buildStageVisitEstimator(model) {
  const cEvents = model?.cEvents || [];
  const bEventsById = new Map((model?.bEvents || []).map((/** @type {any} */ b) => [b.id, b]));
  /** @type {Map<string, any[]>} */
  const consumersByQueue = new Map();
  for (const cEvent of cEvents) {
    const calls = parseCalls(cEvent.effect);
    if (calls.some(call => (STAGE_MACROS.has(call.macro) && !FLOW_STAGE_MACROS.has(call.macro)) || ENTITY_MULTIPLYING_MACROS.has(call.macro))) return null;
    const stage = calls.find(call => FLOW_STAGE_MACROS.has(call.macro));
    if (!stage) continue;
    const key = queueKey(stage.args[0]);
    if (!consumersByQueue.has(key)) consumersByQueue.set(key, []);
    /** @type {any[]} */ (consumersByQueue.get(key)).push(cEvent);
  }
  if ((model?.bEvents || []).some((/** @type {any} */ b) => b.loopConfig || parseCalls(b.effect).some(call => ENTITY_MULTIPLYING_MACROS.has(call.macro)))) return null;

  /** @type {Map<string, number>} */
  const memo = new Map();
  let cyclic = false;

  /** @param {any} bEvent @param {Set<string>} stack */
  function visitsAfter(bEvent, stack) {
    if (!bEvent) return 0;
    let best = 0;
    const conditional = [
      ...(bEvent.routing || []).map((/** @type {any} */ branch) => branch?.queueName),
      bEvent.defaultQueueName,
      ...parseCalls(bEvent.effect)
        .filter(call => call.macro === "RELEASE" || call.macro === "RELEASE_COSEIZED")
        .map(call => call.macro === "RELEASE" ? call.args[1] : null),
    ].filter(Boolean);
    for (const queueName of conditional) best = Math.max(best, visits(queueName, stack));
    const probabilistic = bEvent.probabilisticRouting || [];
    if (probabilistic.length) {
      let weighted = 0;
      for (const branch of probabilistic) {
        const p = Number(branch?.probability);
        if (branch?.queueName && Number.isFinite(p) && p > 0) weighted += p * visits(branch.queueName, stack);
      }
      best = Math.max(best, weighted);
    }
    return best;
  }

  /** @param {string} queueName @param {Set<string>} stack */
  function visits(queueName, stack) {
    const key = queueKey(queueName);
    if (memo.has(key)) return /** @type {number} */ (memo.get(key));
    if (stack.has(key)) { cyclic = true; return 0; }
    const consumers = consumersByQueue.get(key) || [];
    if (!consumers.length) { memo.set(key, 0); return 0; }
    stack.add(key);
    let best = 0;
    for (const cEvent of consumers) {
      let after = 0;
      for (const schedule of cEvent.cSchedules || []) {
        after = Math.max(after, visitsAfter(bEventsById.get(schedule.eventId), stack));
      }
      best = Math.max(best, 1 + after);
    }
    stack.delete(key);
    memo.set(key, best);
    return best;
  }

  for (const key of consumersByQueue.keys()) visits(key, new Set());
  if (cyclic) return null;
  return (queueName) => visits(queueName, new Set());
}

/**
 * @param {Record<string, any>} cEvent
 * @param {Record<string, any>[]} entityTypes
 */
function estimateServiceCapacity(cEvent, entityTypes) {
  const call = parseCalls(cEvent.effect).find(entry => SERVICE_MACROS.has(entry.macro));
  if (!call) return null;

  const queueName = call.args[0] || null;
  const resourceNames = call.macro === "ASSIGN" ? [call.args[1]] : call.args.slice(1);
  const schedule = (cEvent.cSchedules || [])[0];
  const meanServiceTime = schedule ? meanForDistribution(schedule.dist, schedule.distParams || {}) : null;
  if (!queueName || !resourceNames.length || meanServiceTime == null || !Number.isFinite(meanServiceTime) || meanServiceTime <= 0) return null;

  const capacities = resourceNames
    .map((/** @type {any} */ resourceName) => {
      const entity = (entityTypes || []).find((/** @type {any} */ type) => String(type.name || "").trim().toLowerCase() === String(resourceName || "").trim().toLowerCase());
      const count = parsePositiveNumber(entity?.count) || 1;
      return count / meanServiceTime;
    })
    .filter(Number.isFinite);
  if (!capacities.length) return null;

  return {
    queueName,
    resourceNames,
    meanServiceTime,
    serviceCapacityPerUnit: Math.min(...capacities),
  };
}

/**
 * @param {Record<string, any>} model
 * @param {Record<string, number>} arrivalRateByQueue
 * @param {number} expectedEntities
 * @param {number|null} maxSimTime
 */
function buildBottlenecks(model, arrivalRateByQueue, expectedEntities, maxSimTime) {
  const bottlenecks = [];
  const queues = model.queues || [];
  const cEvents = model.cEvents || [];
  const entityTypes = model.entityTypes || [];

  for (const cEvent of cEvents) {
    const capacity = estimateServiceCapacity(cEvent, entityTypes);
    if (!capacity) continue;
    const arrivalRate = arrivalRateByQueue[capacity.queueName];
    if (!Number.isFinite(arrivalRate) || arrivalRate <= 0) continue;
    const utilisation = arrivalRate / capacity.serviceCapacityPerUnit;
    if (utilisation >= 0.85) {
      bottlenecks.push({
        queueName: capacity.queueName,
        resourceNames: capacity.resourceNames,
        utilisationEstimate: Number(utilisation.toFixed(2)),
        reason: `Incoming work is roughly ${Math.round(utilisation * 100)}% of available service capacity.`,
      });
    }
  }

  for (const queue of queues) {
    const capacity = parsePositiveNumber(queue.capacity);
    if (!capacity || maxSimTime == null) continue;
    if (expectedEntities > capacity * 2) {
      bottlenecks.push({
        queueName: queue.name,
        resourceNames: [],
        utilisationEstimate: null,
        reason: `Finite capacity (${capacity}) is small relative to the estimated workload.`,
      });
    }
  }

  return bottlenecks.slice(0, 4);
}

/**
 * @param {number} totalScans
 * @param {number} totalEntities
 * @param {number} [plannedScheduleRows]
 */
function classifyRisk(totalScans, totalEntities, plannedScheduleRows = 0) {
  if (totalScans > 1000000 || totalEntities > 50000 || plannedScheduleRows > 100000) return "too_large";
  if (totalScans > 250000 || totalEntities > 10000 || plannedScheduleRows > 10000) return "large";
  if (totalScans > 50000 || totalEntities > 2000 || plannedScheduleRows > 1000) return "medium";
  return "small";
}

/**
 * @param {Record<string, any>} model
 * @param {Record<string, any>} [options]
 */
export function estimateRunComplexity(model, options = {}) {
  const experimentDefaults = model?.experimentDefaults || {};
  const terminationMode = options.terminationMode || experimentDefaults.terminationMode || "time";
  const maxSimTime = terminationMode === "time"
    ? (Number.isFinite(Number(options.maxSimTime)) ? Number(options.maxSimTime) : Number.isFinite(Number(model?.maxSimTime)) ? Number(model.maxSimTime) : null)
    : null;
  const replications = Math.max(1, parseInt(options.replications ?? experimentDefaults.replications ?? 1, 10) || 1);
  const schedulesMap = options.schedulesMap || {};
  /** @type {string[]} */
  const unknowns = [];
  const plannedScheduleRows = countPlannedScheduleRows(model, schedulesMap);

  const initialCustomerEntities = sumCounts(
    (model?.entityTypes || [])
      .filter((/** @type {any} */ entityType) => entityType.role !== "server")
      .map((/** @type {any} */ entityType) => Math.max(0, Number(entityType.count) || 0))
  );

  let plannedArrivals = initialCustomerEntities;
  let expectedEntities = initialCustomerEntities;
  let arrivalFirings = 0;
  let otherRecurringFirings = 0;
  /** @type {Record<string, number>} */
  const arrivalRateByQueue = {};
  /** @type {Record<string, number>} */
  const expectedArrivalsByQueue = {};

  for (const bEvent of model?.bEvents || []) {
    const estimate = estimateRecurringArrivals(bEvent, maxSimTime, unknowns, schedulesMap);
    plannedArrivals += estimate.plannedArrivals;
    expectedEntities += estimate.expectedArrivals;
    arrivalFirings += estimate.firings;
    otherRecurringFirings += estimateRecurringNonArrivalFirings(bEvent, maxSimTime);
    for (const [queueName, rate] of Object.entries(estimate.meanArrivalRateByQueue)) {
      arrivalRateByQueue[queueName] = (arrivalRateByQueue[queueName] || 0) + rate;
    }
    for (const [queueName, count] of Object.entries(estimate.expectedArrivalsByQueue)) {
      expectedArrivalsByQueue[queueName] = (expectedArrivalsByQueue[queueName] || 0) + count;
    }
  }

  const cEventCount = (model?.cEvents || []).length;
  const stageCount = Math.max(
    1,
    (model?.cEvents || []).filter((/** @type {any} */ cEvent) => parseCalls(cEvent.effect).some(call => STAGE_MACROS.has(call.macro))).length
  );
  // Stage visits per entity: follow the flow from each arrival queue when the
  // model's routing can be traced, else assume every entity visits every stage.
  const stageVisitsFor = buildStageVisitEstimator(model);
  let estimatedStageTransitions;
  let stageVisitBasis;
  if (stageVisitsFor) {
    const queueVisits = Object.entries(expectedArrivalsByQueue).map(([queueName, count]) => ({ count, visits: stageVisitsFor(queueName) }));
    // Initial entities have no arrival queue — give them the longest route.
    const longest = queueVisits.reduce((max, entry) => Math.max(max, entry.visits), 0) || stageCount;
    estimatedStageTransitions = queueVisits.reduce((sum, entry) => sum + entry.count * entry.visits, 0)
      + initialCustomerEntities * longest;
    stageVisitBasis = "flow";
  } else {
    estimatedStageTransitions = expectedEntities * stageCount;
    stageVisitBasis = "all-stages";
  }
  const meanStageVisitsPerEntity = expectedEntities > 0 ? estimatedStageTransitions / expectedEntities : 0;
  // One cycle per arrival, per stage completion, and per firing of any other
  // self-recurring B-event (ticks, demand top-ups) — each followed by a Phase C scan.
  const estimatedBEventFirings = Math.ceil(arrivalFirings + estimatedStageTransitions + otherRecurringFirings);
  const scanBasis = resolveScanBasis(cEventCount, options.calibration);
  const estimatedCEventScans = Math.ceil(estimatedBEventFirings * scanBasis.scansPerBEvent);
  const totalEstimatedEntities = expectedEntities * replications;
  const totalEstimatedScans = estimatedCEventScans * replications;

  if (terminationMode !== "time") {
    unknowns.push("The model stops on a condition rather than a fixed run duration, so recurring arrivals may continue longer than this estimate assumes.");
  }
  if (maxSimTime == null) {
    unknowns.push("No fixed run duration is set, so recurring workload can only be bounded loosely.");
  }

  const confidence = terminationMode !== "time"
    ? "low"
    : unknowns.length > 0
      ? "medium"
      : "high";
  const bottlenecks = buildBottlenecks(model || {}, arrivalRateByQueue, expectedEntities, maxSimTime);

  return {
    plannedArrivals,
    plannedScheduleRows,
    expectedEntities,
    bEventCount: (model?.bEvents || []).length,
    cEventCount,
    estimatedStageTransitions,
    meanStageVisitsPerEntity: +meanStageVisitsPerEntity.toFixed(2),
    stageVisitBasis,
    otherRecurringFirings,
    estimatedBEventFirings,
    scansPerBEvent: scanBasis.scansPerBEvent,
    scanBasis: scanBasis.source,
    scanBasisDescription: scanBasis.description,
    estimatedCEventScans,
    replications,
    totalEstimatedEntities,
    totalEstimatedScans,
    // Whole-run (all replications) size — drives how much detail is saved.
    // The tier scan limit and runtime scan cap are per replication instead.
    riskLevel: classifyRisk(totalEstimatedScans, totalEstimatedEntities, plannedScheduleRows),
    bottlenecks,
    confidence,
    assumptions: [
      "Recurring ARRIVE schedules are estimated from distribution means rather than sampled trajectories.",
      stageVisitBasis === "flow"
        ? "Stage visits follow each arrival queue's route through the model (probabilistic branches weighted, conditional branches taking the longest path)."
        : "Stage transitions assume each service/activity-stage C-event fires once per arriving entity (the route could not be traced).",
      `C-event scans per run: ${scanBasis.description}`,
      "Bottlenecks are flagged only when arrival pressure and service capacity are both obvious from model structure.",
    ],
    unknowns: Array.from(new Set(unknowns)),
  };
}

/**
 * How many C-event condition evaluations one B-event firing costs.
 * @param {number} cEventCount
 * @param {{ scansPerBEvent?: number, cEventCount?: number }|null|undefined} calibration
 *   measured ratio from a previous run of this model (see scansPerBEventFromMetrics)
 */
function resolveScanBasis(cEventCount, calibration) {
  const n = Math.max(1, cEventCount);
  const measured = Number(calibration?.scansPerBEvent);
  if (Number.isFinite(measured) && measured > 0 && Number(calibration?.cEventCount) === cEventCount) {
    return {
      scansPerBEvent: +measured.toFixed(3),
      source: "measured",
      description: `${measured.toFixed(1)} scans per B-event, measured on this model's last run.`,
    };
  }
  if (cEventCount >= FILTERED_PHASE_C_MIN_CEVENTS) {
    const perEvent = n * DEFAULT_FILTERED_SCAN_FRACTION;
    return {
      scansPerBEvent: perEvent,
      source: "filtered",
      description: `about ${perEvent.toFixed(1)} scans per B-event (one per C-event — the engine skips C-events whose inputs did not change, which roughly offsets the re-scan after each firing).`,
    };
  }
  const perEvent = n * DEFAULT_UNFILTERED_PASSES;
  return {
    scansPerBEvent: perEvent,
    source: "full",
    description: `about ${perEvent.toFixed(1)} scans per B-event (all ${cEventCount} C-events checked each pass, plus a re-scan after a firing).`,
  };
}

/**
 * Measured scans per B-event firing from a completed run's runtimeMetrics,
 * for feeding back into estimateRunComplexity({ calibration }).
 * @param {Record<string, any>|null|undefined} runtimeMetrics
 * @param {number} cEventCount
 */
export function scansPerBEventFromMetrics(runtimeMetrics, cEventCount) {
  const scans = Number(runtimeMetrics?.c_event_scans);
  const bFirings = Number(runtimeMetrics?.events_processed) - Number(runtimeMetrics?.c_events_fired || 0);
  if (!Number.isFinite(scans) || !Number.isFinite(bFirings) || bFirings < 100 || scans <= 0) return null;
  return { scansPerBEvent: scans / bFirings, cEventCount };
}

// Derives a per-replication cycle cap from the complexity estimate instead of
// using a flat default — estimatedBEventFirings is a direct proxy for cycle
// count (one cycle ≈ one distinct event time), so this scales the engine's
// safety valve to the model instead of truncating large-but-legitimate runs.
/**
 * @param {Record<string, any>} complexityEstimate
 * @param {{ floor?: number, safetyFactor?: number, ceiling?: number }} [options]
 */
export function estimateMaxCycles(complexityEstimate, options = {}) {
  const floor = options.floor ?? 5000;
  const safetyFactor = options.safetyFactor ?? 2;
  const ceiling = options.ceiling ?? 5_000_000;
  const estimated = Number(complexityEstimate?.estimatedBEventFirings) || 0;
  return Math.min(ceiling, Math.max(floor, Math.ceil(estimated * safetyFactor)));
}

// Compares the pre-run complexity estimate against a completed run's real
// runtimeMetrics, so estimator accuracy can be tracked over time and used to
// recalibrate estimateRunComplexity() instead of relying on static guesses.
/**
 * @param {Record<string, any>|null} complexityEstimate
 * @param {Record<string, any>|null} runtimeMetrics
 */
export function computeEstimateAccuracy(complexityEstimate, runtimeMetrics) {
  if (!complexityEstimate || !runtimeMetrics) return null;
  const scansEstimated = Number(complexityEstimate.estimatedCEventScans) || 0;
  const scansActual = Number(runtimeMetrics.c_event_scans) || 0;
  const entitiesEstimated = Number(complexityEstimate.expectedEntities) || 0;
  const entitiesActual = Number(runtimeMetrics.entities_created) || 0;
  return {
    scansEstimated,
    scansActual,
    scansRatio: scansEstimated > 0 ? +(scansActual / scansEstimated).toFixed(4) : null,
    entitiesEstimated,
    entitiesActual,
    entitiesRatio: entitiesEstimated > 0 ? +(entitiesActual / entitiesEstimated).toFixed(4) : null,
  };
}
