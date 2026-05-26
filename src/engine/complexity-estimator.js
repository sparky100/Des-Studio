import { getPiecewisePeriods, normalizeDistributionName } from "./distributions.js";

const STAGE_MACROS = new Set(["ASSIGN", "COSEIZE", "MATCH", "BATCH", "UNBATCH"]);
const SERVICE_MACROS = new Set(["ASSIGN", "COSEIZE"]);

function effectText(effect) {
  if (Array.isArray(effect)) return effect.filter(Boolean).join(";");
  return String(effect || "");
}

function parseCalls(effect) {
  const text = effectText(effect);
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

function parsePositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
        .map(period => {
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
      return nestedMeans.reduce((sum, value) => sum + value, 0) / nestedMeans.length;
    }
    default:
      return null;
  }
}

function sumCounts(values) {
  return values.reduce((sum, value) => sum + value, 0);
}

function countScheduleEntries(schedule = {}) {
  const distName = normalizeDistributionName(schedule.dist);
  if (distName !== "Schedule") return 0;
  const rows = Array.isArray(schedule.distParams?.rows) ? schedule.distParams.rows.length : 0;
  const times = Array.isArray(schedule.distParams?.times) ? schedule.distParams.times.length : 0;
  return rows + times;
}

export function countPlannedScheduleRows(model) {
  let total = 0;
  for (const bEvent of model?.bEvents || []) {
    for (const schedule of bEvent.schedules || []) {
      total += countScheduleEntries(schedule);
    }
  }
  for (const cEvent of model?.cEvents || []) {
    for (const schedule of cEvent.cSchedules || []) {
      total += countScheduleEntries(schedule);
    }
  }
  return total;
}

function estimateRecurringArrivals(bEvent, maxSimTime, unknowns) {
  const calls = parseCalls(bEvent.effect).filter(call => call.macro === "ARRIVE");
  if (!calls.length) return { plannedArrivals: 0, expectedArrivals: 0, meanArrivalRateByQueue: {} };

  const scheduledTime = Number.isFinite(Number(bEvent.scheduledTime)) ? Number(bEvent.scheduledTime) : 0;
  const selfSchedules = (bEvent.schedules || []).filter(schedule => schedule.eventId === bEvent.id);
  const initialMultiplier = maxSimTime == null || scheduledTime <= maxSimTime ? calls.length : 0;
  let plannedArrivals = initialMultiplier;
  let expectedArrivals = initialMultiplier;
  const meanArrivalRateByQueue = {};

  for (const schedule of selfSchedules) {
    const distName = normalizeDistributionName(schedule.dist);
    if (distName === "Schedule") {
      const rows = Array.isArray(schedule.distParams?.rows) ? schedule.distParams.rows : [];
      const times = rows.length
        ? rows.map(row => Number(row.time)).filter(Number.isFinite)
        : Array.isArray(schedule.distParams?.times)
          ? schedule.distParams.times.map(Number).filter(Number.isFinite)
          : [];
      if (maxSimTime == null) {
        unknowns.push(`Arrival event '${bEvent.name || bEvent.id}' uses a planned schedule, but the stop rule is not time-bounded.`);
        continue;
      }
      const withinHorizon = times.filter(time => time <= maxSimTime).length * calls.length;
      plannedArrivals += withinHorizon;
      expectedArrivals += withinHorizon;
      continue;
    }

    const mean = meanForDistribution(schedule.dist, schedule.distParams || {});
    if (!(maxSimTime != null) || !Number.isFinite(mean) || mean <= 0) {
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

  return { plannedArrivals, expectedArrivals, meanArrivalRateByQueue };
}

function estimateServiceCapacity(cEvent, entityTypes) {
  const call = parseCalls(cEvent.effect).find(entry => SERVICE_MACROS.has(entry.macro));
  if (!call) return null;

  const queueName = call.args[0] || null;
  const resourceNames = call.macro === "ASSIGN" ? [call.args[1]] : call.args.slice(1);
  const schedule = (cEvent.cSchedules || [])[0];
  const meanServiceTime = schedule ? meanForDistribution(schedule.dist, schedule.distParams || {}) : null;
  if (!queueName || !resourceNames.length || !Number.isFinite(meanServiceTime) || meanServiceTime <= 0) return null;

  const capacities = resourceNames
    .map(resourceName => {
      const entity = (entityTypes || []).find(type => String(type.name || "").trim().toLowerCase() === String(resourceName || "").trim().toLowerCase());
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

function classifyRisk(totalScans, totalEntities) {
  if (totalScans > 1000000 || totalEntities > 50000) return "too_large";
  if (totalScans > 250000 || totalEntities > 10000) return "large";
  if (totalScans > 50000 || totalEntities > 2000) return "medium";
  return "small";
}

export function estimateRunComplexity(model, options = {}) {
  const experimentDefaults = model?.experimentDefaults || {};
  const terminationMode = options.terminationMode || experimentDefaults.terminationMode || "time";
  const maxSimTime = terminationMode === "time"
    ? (Number.isFinite(Number(options.maxSimTime)) ? Number(options.maxSimTime) : Number.isFinite(Number(model?.maxSimTime)) ? Number(model.maxSimTime) : null)
    : null;
  const replications = Math.max(1, parseInt(options.replications ?? experimentDefaults.replications ?? 1, 10) || 1);
  const unknowns = [];
  const plannedScheduleRows = countPlannedScheduleRows(model);

  const initialCustomerEntities = sumCounts(
    (model?.entityTypes || [])
      .filter(entityType => entityType.role !== "server")
      .map(entityType => Math.max(0, Number(entityType.count) || 0))
  );

  let plannedArrivals = initialCustomerEntities;
  let expectedEntities = initialCustomerEntities;
  const arrivalRateByQueue = {};

  for (const bEvent of model?.bEvents || []) {
    const estimate = estimateRecurringArrivals(bEvent, maxSimTime, unknowns);
    plannedArrivals += estimate.plannedArrivals;
    expectedEntities += estimate.expectedArrivals;
    for (const [queueName, rate] of Object.entries(estimate.meanArrivalRateByQueue)) {
      arrivalRateByQueue[queueName] = (arrivalRateByQueue[queueName] || 0) + rate;
    }
  }

  const stageCount = Math.max(
    1,
    (model?.cEvents || []).filter(cEvent => parseCalls(cEvent.effect).some(call => STAGE_MACROS.has(call.macro))).length
  );
  const estimatedStageTransitions = expectedEntities * stageCount;
  const estimatedBEventFirings = expectedEntities + estimatedStageTransitions;
  const estimatedCEventScans = estimatedBEventFirings * Math.max(1, (model?.cEvents || []).length);
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
    cEventCount: (model?.cEvents || []).length,
    estimatedStageTransitions,
    estimatedCEventScans,
    replications,
    totalEstimatedEntities,
    totalEstimatedScans,
    riskLevel: classifyRisk(totalEstimatedScans, totalEstimatedEntities),
    bottlenecks,
    confidence,
    assumptions: [
      "Recurring ARRIVE schedules are estimated from distribution means rather than sampled trajectories.",
      "Stage transitions assume each active service-stage C-event can fire once per arriving entity.",
      "Bottlenecks are flagged only when arrival pressure and service capacity are both obvious from model structure.",
    ],
    unknowns: Array.from(new Set(unknowns)),
  };
}
