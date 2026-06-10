// engine/index.js — Public API
//
// Usage:
//   import { buildEngine } from './engine/index.js'
//   const engine = buildEngine(model)
//   const result = engine.runAll()        // run to completion
//   const step   = engine.step()          // one Phase A→B→C cycle
//   const snap   = engine.getSnap()       // current state snapshot
//   const felSz  = engine.getFelSize()    // events in FEL

import { DISTRIBUTIONS, sample, sampleAttrs, mulberry32, normalizeDistributionName, getPiecewisePeriods, createStreamRegistry } from "./distributions.js";
import { buildWaitDistEntry, finalizeWeightedStats } from "./statistics.js";
import { buildTraceFromLog } from "../simulation/traceCollector.js";
import { makeHelpers, createServerEntities, releaseServerClaim, clearWaitingState, markEntityWaiting, preemptCustomer, repairServers } from "./entities.js";
import { compilePredicate, getPredicateDependencies, getConditionDiagnostics } from "./conditions.js";
import { fireBEvent, fireCEvent }              from "./phases.js";
import { makeSingleRunProgress } from "./progress-contract.js";
import { nullRegistry }                        from "./adapters/index.js";

export { DISTRIBUTIONS, sample, sampleAttrs };

function normalizeImpactName(value) {
  return String(value || "").trim().toLowerCase();
}

function createDirtySet() {
  return {
    all: false,
    queues: new Set(),
    resources: new Set(),
    stateVars: new Set(),
    builtins: new Set(),
  };
}

function markDirtyQueue(dirty, queueName) {
  if (queueName) dirty.queues.add(normalizeImpactName(queueName));
}

function markDirtyResource(dirty, resourceName) {
  if (resourceName) dirty.resources.add(normalizeImpactName(resourceName));
}

function markDirtyStateVar(dirty, stateVarName) {
  if (stateVarName) dirty.stateVars.add(stateVarName);
}

function markDirtyBuiltin(dirty, builtinName) {
  if (builtinName) dirty.builtins.add(builtinName);
}

function mergeDirtyInto(target, source) {
  if (!source) return target;
  target.all = target.all || source.all;
  for (const queueName of source.queues || []) target.queues.add(queueName);
  for (const resourceName of source.resources || []) target.resources.add(resourceName);
  for (const stateVarName of source.stateVars || []) target.stateVars.add(stateVarName);
  for (const builtinName of source.builtins || []) target.builtins.add(builtinName);
  return target;
}

function intersectsSet(a, b) {
  for (const value of a) {
    if (b.has(value)) return true;
  }
  return false;
}

function dirtyHasSignals(dirty) {
  return dirty.all
    || dirty.queues.size > 0
    || dirty.resources.size > 0
    || dirty.stateVars.size > 0
    || dirty.builtins.size > 0;
}

function queueHasWaiting(queueName, helpers, model) {
  const queueDef = (model.queues || []).find(q =>
    normalizeImpactName(q.name) === normalizeImpactName(queueName)
  );
  if (queueDef) {
    return (helpers.waitingInQueue?.(queueDef.name, queueDef.discipline || "FIFO") || []).length > 0;
  }
  return (helpers.waitingOf?.(queueName, "FIFO") || []).length > 0;
}

function shouldEvaluateCEvent(event, dirty, helpers, model, queueWaitingCache = null) {
  if (!dirty || !dirtyHasSignals(dirty) || dirty.all) return true;
  const deps = event._conditionDeps;
  if (!deps) return true;
  if (deps.unknown || deps.clock || deps.entityAttrs.size > 0) return true;
  if (intersectsSet(deps.queues, dirty.queues)) return true;
  const nonQueueDirty = intersectsSet(deps.resources, dirty.resources)
    || intersectsSet(deps.stateVars, dirty.stateVars)
    || intersectsSet(deps.builtins, dirty.builtins);
  if (!nonQueueDirty) return false;
  if (deps.queues.size === 0) return true;
  for (const queueName of deps.queues) {
    let hasWaiting;
    if (queueWaitingCache && queueWaitingCache.has(queueName)) {
      hasWaiting = queueWaitingCache.get(queueName);
    } else {
      hasWaiting = queueHasWaiting(queueName, helpers, model);
      queueWaitingCache?.set(queueName, hasWaiting);
    }
    if (hasWaiting) return true;
  }
  return false;
}

function compileEffectImpactTemplate(effectStr) {
  const text = Array.isArray(effectStr) ? effectStr.filter(Boolean).join(";") : String(effectStr || "");
  const parts = text.split(";").map(part => part.trim()).filter(Boolean);
  const actions = [];

  for (const part of parts) {
    let m;
    if ((m = part.match(/^ARRIVE\(([^,)]+)(?:\s*,\s*([^,)]+))?\)$/i))) {
      actions.push({ kind: "arrive", typeName: m[1].trim(), queueName: m[2]?.trim() || `${m[1].trim()}Queue` });
    } else if ((m = part.match(/^ASSIGN\(([^,)]+)\s*,\s*([^,)]+)\)$/i))) {
      actions.push({ kind: "assign", queueName: m[1].trim(), resourceName: m[2].trim() });
    } else if (part.match(/^COMPLETE\(\)$/i)) {
      actions.push({ kind: "complete" });
    } else if ((m = part.match(/^RELEASE\(([^,)]+)(?:\s*,\s*([^,)]+))?\)$/i))) {
      actions.push({ kind: "release", resourceName: m[1].trim(), targetQueue: m[2]?.trim() || null });
    } else if ((m = part.match(/^RENEGE(?:_OLDEST)?\(([^)]*)\)$/i))) {
      actions.push({ kind: "renege", queueHint: m[1]?.trim() || null });
    } else if ((m = part.match(/^COSEIZE\(([^,)]+)\s*,\s*(.+)\)$/i))) {
      actions.push({ kind: "coseize", queueName: m[1].trim(), resourceNames: m[2].split(",").map(s => s.trim()).filter(Boolean) });
    } else if ((m = part.match(/^MATCH\(([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^,)]+)\)$/i))) {
      actions.push({ kind: "match", queueNames: [m[2].trim(), m[4].trim(), m[5].trim()] });
    } else if ((m = part.match(/^BATCH\(([^,)]+)\s*,/i))) {
      actions.push({ kind: "queueOnly", queueNames: [m[1].trim()] });
    } else if ((m = part.match(/^UNBATCH\(([^,)]+)\)$/i))) {
      actions.push({ kind: "queueOnly", queueNames: [m[1].trim()] });
    } else if ((m = part.match(/^PREEMPT\(([^,)]+)\)$/i))) {
      actions.push({ kind: "preempt", resourceName: m[1].trim() });
    } else if ((m = part.match(/^FAIL\(([^,)]+)\)$/i)) || (m = part.match(/^REPAIR\(([^,)]+)\)$/i))) {
      actions.push({ kind: "resourceOnly", resourceName: m[1].trim() });
    } else if ((m = part.match(/^SET\((\w+)\s*,/i))) {
      actions.push({ kind: "stateVar", stateVarName: m[1] });
    } else if (part.match(/^SET_ATTR\(/i)) {
      actions.push({ kind: "all" });
    } else if (part.match(/^COST\(/i)) {
      actions.push({ kind: "noop" });
    } else {
      const scalarMatch = part.match(/^(\w+)\s*(\+\+|--|\+=|-=|=)/);
      if (scalarMatch) {
        actions.push({ kind: "stateVar", stateVarName: scalarMatch[1] });
      } else {
        actions.push({ kind: "all" });
      }
    }
  }

  return actions;
}

function deriveDirtyFromTemplate(template, event, ctx) {
  const dirty = createDirtySet();
  const currentCustomer = () => {
    const custId = ctx._lastCustId ?? event?._contextCustId;
    return custId != null ? ctx.entities.find(entity => entity.id === custId) : null;
  };
  const currentServer = () => {
    const srvId = ctx._lastSrvId ?? event?._contextSrvId;
    return srvId != null ? ctx.entities.find(entity => entity.id === srvId) : null;
  };

  for (const action of template || []) {
    switch (action.kind) {
      case "arrive":
        markDirtyQueue(dirty, action.typeName);
        markDirtyQueue(dirty, action.queueName);
        break;
      case "assign":
        markDirtyQueue(dirty, action.queueName);
        markDirtyResource(dirty, action.resourceName);
        break;
      case "complete": {
        const customer = currentCustomer();
        const server = currentServer();
        markDirtyBuiltin(dirty, "served");
        markDirtyQueue(dirty, customer?.type);
        markDirtyQueue(dirty, customer?.lastQueue || customer?.queue);
        markDirtyResource(dirty, server?.type);
        break;
      }
      case "release": {
        const customer = currentCustomer();
        markDirtyResource(dirty, action.resourceName);
        markDirtyQueue(dirty, customer?.type);
        markDirtyQueue(dirty, customer?.lastQueue || customer?.queue);
        markDirtyQueue(dirty, action.targetQueue);
        break;
      }
      case "renege": {
        const customer = currentCustomer();
        markDirtyBuiltin(dirty, "reneged");
        markDirtyQueue(dirty, customer?.type);
        markDirtyQueue(dirty, customer?.lastQueue || customer?.queue || action.queueHint);
        break;
      }
      case "coseize":
        markDirtyQueue(dirty, action.queueName);
        action.resourceNames.forEach(resourceName => markDirtyResource(dirty, resourceName));
        break;
      case "match":
      case "queueOnly":
        action.queueNames.forEach(queueName => markDirtyQueue(dirty, queueName));
        break;
      case "preempt": {
        const customer = currentCustomer();
        markDirtyResource(dirty, action.resourceName);
        markDirtyQueue(dirty, customer?.type);
        markDirtyQueue(dirty, customer?.lastQueue || customer?.queue);
        break;
      }
      case "resourceOnly":
        markDirtyResource(dirty, action.resourceName);
        break;
      case "stateVar":
        markDirtyStateVar(dirty, action.stateVarName);
        break;
      case "all":
        dirty.all = true;
        break;
      default:
        break;
    }
  }

  if (event?.type === "SHIFT_CHANGE" || event?.type === "FAILURE" || event?.type === "REPAIR") {
    markDirtyResource(dirty, event.serverTypeName);
  }
  return dirty;
}

function getValidShiftSchedule(entityType) {
  if (!Array.isArray(entityType.shiftSchedule) || entityType.shiftSchedule.length === 0) return [];
  return entityType.shiftSchedule
    .map(step => ({
      time: parseFloat(step.time ?? step.startTime ?? 0),
      capacity: parseInt(step.capacity, 10),
    }))
    .filter(step => Number.isFinite(step.time) && Number.isInteger(step.capacity) && step.capacity > 0)
    .sort((a, b) => a.time - b.time);
}

function modelWithShiftInitialCapacity(model) {
  return {
    ...model,
    entityTypes: (model.entityTypes || []).map(entityType => {
      if (entityType.role !== "server") return entityType;
      const schedule = getValidShiftSchedule(entityType);
      if (!schedule.length) return entityType;
      return { ...entityType, count: schedule[0].capacity };
    }),
  };
}

function makeShiftChangeEvents(model) {
  return (model.entityTypes || [])
    .filter(entityType => entityType.role === "server")
    .flatMap(entityType => getValidShiftSchedule(entityType).map(step => ({
      id: `shift:${entityType.id || entityType.name}:${step.time}`,
      type: "SHIFT_CHANGE",
      name: `Shift change: ${entityType.name}`,
      scheduledTime: step.time,
      serverTypeName: entityType.name,
      newCapacity: step.capacity,
    })));
}

function makeRateChangeEvents(model) {
  const events = [];
  const addPeriods = (ownerName, dist, distParams) => {
    if (normalizeDistributionName(dist) !== "Piecewise") return;
    for (const period of getPiecewisePeriods(distParams).slice(1)) {
      const startTime = parseFloat(period.startTime ?? period.time);
      if (!Number.isFinite(startTime)) continue;
      events.push({
        id: `rate:${ownerName}:${startTime}`,
        type: "RATE_CHANGE",
        name: `Rate change: ${ownerName}`,
        sourceName: ownerName,
        scheduledTime: startTime,
      });
    }
  };

  for (const bEvent of model.bEvents || []) {
    (bEvent.schedules || []).forEach((schedule, index) =>
      addPeriods(`${bEvent.name || bEvent.id} schedule ${index + 1}`, schedule.dist, schedule.distParams));
  }
  for (const cEvent of model.cEvents || []) {
    (cEvent.cSchedules || []).forEach((schedule, index) =>
      addPeriods(`${cEvent.name || cEvent.id} cSchedule ${index + 1}`, schedule.dist, schedule.distParams));
  }
  return events;
}

function makeFailureEvents(model, rng, streamRegistry) {
  const events = [];
  for (const entityType of model.entityTypes || []) {
    if (entityType.role !== "server") continue;
    const mtbfDist = entityType.mtbfDist || entityType.failureDist;
    const mtbfParams = entityType.mtbfDistParams || entityType.failureDistParams;
    const mttrDist = entityType.mttrDist || entityType.repairDist;
    const mttrParams = entityType.mttrDistParams || entityType.repairDistParams;
    if (!mtbfDist || !mtbfParams) continue;

    const serverName = entityType.name;
    const ctx = { streamName: `mtbf:${serverName}`, streamRegistry };
    let t = sample(mtbfDist, mtbfParams, rng, null, ctx);
    const maxTime = 100000;
    let count = 0;
    while (t < maxTime && count < 1000) {
      events.push({
        id: `fail:${serverName}:${t.toFixed(4)}`,
        type: "FAILURE",
        name: `Failure: ${serverName}`,
        serverTypeName: serverName,
        scheduledTime: t,
        mttrDist,
        mttrParams,
      });
      const repairTime = t + sample(mttrDist, mttrParams, rng, null, { streamName: `mttr:${serverName}`, streamRegistry });
      events.push({
        id: `repair:${serverName}:${repairTime.toFixed(4)}`,
        type: "REPAIR",
        name: `Repair: ${serverName}`,
        serverTypeName: serverName,
        scheduledTime: repairTime,
      });
      t += sample(mtbfDist, mtbfParams, rng, null, { streamName: `mtbf:${serverName}`, streamRegistry });
      count++;
    }
  }
  return events;
}

// ── resolveInlineSchedules ────────────────────────────────────────────────────
//
// Merges external schedule data (from the model_schedules table) into bEvent
// schedule entries that carry a scheduleRef UUID.
//
// This is a pure function — no mutations, no side-effects.
// Backward-compatible: when schedulesMap is empty / not provided the model is
// returned unchanged and all existing callers continue to work.
//
// schedulesMap shape:
//   { "<uuid>": { eventId, rows }, "<uuid>:<eventId>": { eventId, rows }, ... }
// The compound "<uuid>:<eventId>" key is preferred for multi-event schedules so
// each bEvent gets its own rows; the plain "<uuid>" key is the single-event fallback.
export function resolveInlineSchedules(model, schedulesMap = {}) {
  if (!schedulesMap || Object.keys(schedulesMap).length === 0) return model;
  return {
    ...model,
    bEvents: (model.bEvents || []).map(be => ({
      ...be,
      schedules: (be.schedules || []).map(s => {
        if (!s.scheduleRef) return s;                              // no ref — leave as-is
        // Always prefer schedulesMap when scheduleRef is present so updated named-schedule rows
        // override any stale inline rows[] left from a prior import.
        // Prefer compound key (multi-event schedule), fall back to plain uuid
        const resolved = schedulesMap[`${s.scheduleRef}:${be.id}`] ?? schedulesMap[s.scheduleRef];
        if (!resolved) return s;                                   // ref not found — 0 arrivals
        return { ...s, rows: resolved.rows ?? [] };
      }),
    })),
  };
}

export function buildEngine(model, seed, warmupPeriod = 0, maxSimTime = null, terminationCondition = null, maxCycles = 5000, maxCPasses = 500, collectTimeSeries = false, registry = nullRegistry, options = {}) {
  const engineOptions = options || {};
  // Resolve external schedule references before any processing.
  // When options.schedulesMap is provided, inline rows[] are merged from the
  // model_schedules table. Falls back to inline rows if no map is provided.
  const resolvedModel = resolveInlineSchedules(model, engineOptions.schedulesMap);
  const runtimeModel = modelWithShiftInitialCapacity(resolvedModel);
  // ── Seeded PRNG — all sampling in this engine instance uses this rng ──────
  const rng = mulberry32(seed);
  const streamRegistry = createStreamRegistry(seed);
  let _warmupComplete = false;
  let _terminationConditionMet = false;
  let _phaseCTruncated = false;
  let _excludedCount = 0;
  let _statsResetTime = 0;
  let _purgePhase = false;
  let _purgeStartedAt = null;
  let _servedInPurge = 0;
  const purgeConfig = engineOptions.purgePeriod || {};
  const purgeEnabled = !!purgeConfig.enabled;
  const maxPurgeTime = purgeConfig.maxPurgeTime || Math.min(2 * (maxSimTime || 500), 5000);
  const warnings = [];

  // ── Per-queue metrics (F11.4): blockingCount, balkCount per queue name ───────
  const _perQueue = {};
  const incQueueMetric = (qName, field) => {
    if (!_perQueue[qName]) _perQueue[qName] = { blockingCount: 0, balkCount: 0 };
    _perQueue[qName][field]++;
  };

  // ── Event fire counts: how many times each B/C-event has fired ─────────────
  const _eventCounts = {};
  const incEventCount = (id) => {
    if (id) _eventCounts[id] = (_eventCounts[id] || 0) + 1;
  };
  const _runtimeMetrics = {
    eventsProcessed: 0,
    cEventScans: 0,
    cEventsFired: 0,
    entitiesCreated: 0,
    maxQueueLengthByQueue: {},
    maxFutureEventListSize: 0,
  };
  let _cycleCount = 0;

  // ── Structured trace ─────────────────────────────────────────────────────
  // Monotonically increasing sequence index for ordering trace entries.
  // Trace is observational only — never mutates state, entities, or fel.
  let _traceSeq = 0;
  const nextSeq = () => ++_traceSeq;

  // Core structured trace emitter. Returns a trace entry with all required
  // phase/A fields populated. Callers add phase-specific payload fields.
  const _trace = (phase, extra = {}) => ({
    phase,
    time: clock,
    seq: nextSeq(),
    ...extra,
  });

  const makeTraceEntry = (phase, extra = {}) => _trace(phase, extra);
  const noteQueueDepth = (queueName) => {
    if (!queueName) return;
    const depth = entities.filter(entity => entity.role !== "server" && entity.status === "waiting" && entity.queue === queueName).length;
    const currentMax = _runtimeMetrics.maxQueueLengthByQueue[queueName] || 0;
    if (depth > currentMax) {
      _runtimeMetrics.maxQueueLengthByQueue[queueName] = depth;
    }
  };
  const noteEntityCreated = (entity) => {
    _runtimeMetrics.entitiesCreated++;
    if (entity?.queue) noteQueueDepth(entity.queue);
  };
  const noteFelSize = () => {
    if (fel.length > _runtimeMetrics.maxFutureEventListSize) {
      _runtimeMetrics.maxFutureEventListSize = fel.length;
    }
  };

  // ── Initialise scalar state ───────────────────────────────────────────────
  const state = { __served: 0, __reneged: 0 };
  for (const sv of runtimeModel.stateVariables || []) {
    try   { state[sv.name] = JSON.parse(sv.initialValue); }
    catch { state[sv.name] = sv.initialValue; }
  }
  // Container/level resources (G21)
  for (const ct of runtimeModel.containerTypes || []) {
    const cap  = isFinite(parseFloat(ct.capacity)) ? parseFloat(ct.capacity) : Infinity;
    const init = Math.min(Math.max(parseFloat(ct.initialLevel) || 0, 0), cap);
    state[`__container_${ct.id}`]         = init;
    state[`__containerCap_${ct.id}`]      = cap;
    state[`__containerMin_${ct.id}`]      = init;
    state[`__containerMax_${ct.id}`]      = init;
    state[`__containerIntegral_${ct.id}`] = 0;
    state[`__containerPrev_${ct.id}`]     = 0;
  }

  // ── Entity pool ───────────────────────────────────────────────────────────
  let _seq = 0;
  const nextId = () => ++_seq;

  let entities = createServerEntities(
    runtimeModel.entityTypes || [],
    (attrDefs) => sampleAttrs(attrDefs, rng)
  );
  // Assign IDs to pre-created servers
  for (const e of entities) e.id = nextId();
  _runtimeMetrics.entitiesCreated += entities.length;

  const helpers = () => makeHelpers(entities, runtimeModel);
  const createServerEntity = (serverTypeName, arrivalTime = clock) => {
    const match = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
    const entityType = (runtimeModel.entityTypes || []).find(et => et.role === "server" && match(et.name, serverTypeName));
    if (!entityType) return null;
    const created = {
      id: nextId(),
      type: entityType.name.trim(),
      role: "server",
      status: "idle",
      attrs: sampleAttrs(entityType.attrDefs || entityType.attrs, rng),
      arrivalTime,
      stages: [],
      _starvationStart: clock,
    };
    noteEntityCreated(created);
    return created;
  };
  const sortedCEvents = (runtimeModel.cEvents || []).slice()
    .sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999))
    .map(event => ({
      ...event,
      _compiledCondition: compilePredicate(event.condition),
      _conditionDeps: getPredicateDependencies(event.condition),
      _effectImpactTemplate: compileEffectImpactTemplate(event.effect),
    }));
  const enableFilteredPhaseC = sortedCEvents.length >= 8;
  const bEventImpactTemplates = enableFilteredPhaseC
    ? new Map((runtimeModel.bEvents || []).map(event => [event.id, compileEffectImpactTemplate(event.effect)]))
    : null;
  const compiledTerminationCondition = terminationCondition ? compilePredicate(terminationCondition) : null;
  const predicateState = {
    currentEntity: null,
    helpers: null,
    entities,
    model: runtimeModel,
    scalars: state,
    get clock() { return clock; },
    get __served() { return state.__served ?? 0; },
    get __reneged() { return state.__reneged ?? 0; },
    get __loopCount() { return state.__loopCount ?? 0; },
  };
  const usePredicateState = (helpers, currentEntity = null) => {
    predicateState.helpers = helpers;
    predicateState.currentEntity = currentEntity;
    predicateState.entities = entities;
    return predicateState;
  };

  // ── Snapshot ──────────────────────────────────────────────────────────────
  function snap(clock) {
    const h = makeHelpers(entities, runtimeModel);
    const types = [...new Set(entities.map(e => e.type))];
    const byType = {};
    types.forEach(t => {
      byType[t] = {
        waiting: h.waitingOf(t).length,
        idle:    h.idleOf(t).length,
        busy:    h.busyOf(t).length,
        total:   entities.filter(e => e.type === t).length,
      };
    });
    const byQueue = {};
    (runtimeModel.queues || []).forEach(q => {
      const qName = q.name;
      if (!qName) return;
      const seenEntities = entities.filter(e => e.role !== "server" && (e.queue === qName || e.lastQueue === qName));
      const waitingEntities = entities.filter(e => e.role !== "server" && e.queue === qName && e.status === "waiting");
      byQueue[qName] = {
        waiting: waitingEntities.length,
        total: seenEntities.length,
        reneged: seenEntities.filter(e => e.status === "reneged").length,
      };
    });
    // nextArrivals: maps each b-event id to its next scheduled time in the FEL.
    // Used by the Execute canvas to show countdowns on Source nodes.
    // FEL is already sorted; first occurrence of each id is the earliest.
    const nextArrivals = {};
    const _seen = new Set();
    for (const entry of fel) {
      if (entry.id && !_seen.has(entry.id)) {
        nextArrivals[entry.id] = entry.scheduledTime;
        _seen.add(entry.id);
      }
    }

    // Container level snapshot for canvas display
    const containers = {};
    for (const ct of runtimeModel.containerTypes || []) {
      containers[ct.id] = {
        level:    state[`__container_${ct.id}`] ?? 0,
        capacity: state[`__containerCap_${ct.id}`] ?? Infinity,
      };
    }

    return {
      clock:    clock || 0,
      served:   state.__served  || 0,
      reneged:  state.__reneged || 0,
      entities: entities.map(e => ({ ...e, attrs: { ...e.attrs } })),
      scalars:  Object.fromEntries(
        Object.entries(state).filter(([k]) => !k.startsWith("__"))
      ),
      byType,
      byQueue,
      nextArrivals,
      eventCounts: { ..._eventCounts },
      containers:  Object.keys(containers).length ? containers : undefined,
      felPreview:  fel.slice(0, 100).map(e => ({
        scheduledTime:   e.scheduledTime,
        name:            e.name || e.id,
        id:              e.id,
        isRenege:        e._isRenege || false,
        contextEntityId: e._contextCustId ?? null,
      })),
    };
  }

  // ── Lightweight snapshot for time-series collection ───────────────────────
  // Single O(N) pass; produces the same shape as snap() byType/byQueue.
  function snapLite() {
    const byType = {};
    const byQueue = {};
    for (const e of entities) {
      const t = e.type;
      if (t) {
        if (!byType[t]) byType[t] = { waiting: 0, idle: 0, busy: 0, total: 0 };
        byType[t].total++;
        if (e.status === "waiting") byType[t].waiting++;
        else if (e.status === "idle") byType[t].idle++;
        else if (e.status === "busy" || e.status === "serving") byType[t].busy++;
      }
      if (e.role !== "server" && (e.queue || e.lastQueue)) {
        const qName = e.queue || e.lastQueue;
        if (!byQueue[qName]) byQueue[qName] = { waiting: 0, total: 0 };
        byQueue[qName].total++;
        if (e.status === "waiting") byQueue[qName].waiting++;
      }
    }
    return { byType, byQueue };
  }

  // ── Build initial FEL ─────────────────────────────────────────────────────
  let clock = 0;
  const log = [];
  const _timeSeries = collectTimeSeries ? [] : null; // null = disabled, zero overhead

  // G11 — WIP time-average tracking (Little's Law: avgWIP = ∫ WIP dt / T)
  let _wipIntegral = 0;
  let _lastWipSnapTime = 0;

  let fel = (runtimeModel.bEvents || [])
    .map(ev => {
      let scheduledTime = parseFloat(ev.scheduledTime);
      if (!Number.isFinite(scheduledTime)) scheduledTime = 0;

      // For B-events whose self-schedule entry uses rows[]/times[] planned data,
      // advance the initial FEL entry to the first planned time so there is no
      // phantom arrival at t=0 with no attributes.
      let _scheduleRowAttrs = undefined;
      for (const sched of ev.schedules || []) {
        // eventId may be absent when scheduleRef was set without eventId (treat as self-referencing)
        if (sched.eventId != null && sched.eventId !== ev.id) continue;
        const dp = sched.distParams || {};
        const rows = sched.rows ? sched.rows : (Array.isArray(dp.rows) ? dp.rows : null);
        const rawTimes = rows
          ? rows.map(r => Number(r.time))
          : (sched.times ? sched.times.map(Number) : (Array.isArray(dp.times) ? dp.times.map(Number) : []));
        const isScheduleDist = (sched.dist || "") === "Schedule" || rows || sched.times || dp.rows || dp.times;
        if (isScheduleDist && rawTimes.length > 0 && Number.isFinite(rawTimes[0])) {
          const schedKey = sched.eventId ?? ev.id;
          // Pre-advance: skip the phantom t=0 firing and start at the first planned time
          state[`__schedIdx_${schedKey}`] = 1;
          _scheduleRowAttrs = rows?.[0]?.attrs ?? null;
          state[`__schedRowAttrs_${schedKey}`] = _scheduleRowAttrs;
          scheduledTime = rawTimes[0];
        } else if (isScheduleDist) {
          // Schedule distribution detected but rows/times are empty (e.g. companion CSV not yet
          // imported). Push the event beyond any realistic sim horizon so no phantom arrival fires
          // at the model's default scheduledTime (often 0).
          scheduledTime = 1e9;
        }
        break;
      }

      return {
        ...ev,
        scheduledTime,
        ...(_scheduleRowAttrs !== undefined ? {
          _scheduleRowAttrs,
          // rows[0] entity is planned for scheduledTime; set so ARRIVE() stores _plannedTime
          ...(_scheduleRowAttrs !== null ? { _plannedArrivalTime: scheduledTime } : {}),
        } : {}),
      };
    });

  fel.push(...makeRateChangeEvents(runtimeModel), ...makeShiftChangeEvents(runtimeModel), ...makeFailureEvents(runtimeModel, rng, streamRegistry));

  if (warmupPeriod > 0) {
    fel.push({ type: "WARMUP", name: "Warm-up complete", scheduledTime: warmupPeriod });
  }

  fel.sort((a, b) => a.scheduledTime - b.scheduledTime);
  noteFelSize();

  log.push(_trace("INIT", { message: "Engine initialised" }));

// ── Shared execution context ──────────────────────────────────────────────
  // _arbitration: set by ASSIGN macro to record queue/server selection reasoning
  // for structured trace emission. Shape defined in F27.4 contract.
  const _arbitration = {};
  const makeCtx = (felRef = null) => ({
    entities,
    state,
    model: runtimeModel,
    clock,
    felRef,
    helpers: makeHelpers(entities, runtimeModel),
    nextId,
    rng,
    streamRegistry,
    warnings,
    createServerEntity,
    incQueueMetric,
    incEventCount,
    noteEntityCreated,
    noteQueueDepth,
    _arbitration,
    _purgePhase,
    registry,
  });

  function checkTermination() {
    if (!terminationCondition) return null;
    const h = makeHelpers(entities, runtimeModel);
    if (!compiledTerminationCondition(usePredicateState(h))) return null;
    _terminationConditionMet = true;
    const msg      = "Termination condition met — simulation complete";
    const endEntry = makeTraceEntry("END", { message: msg });
    log.push(endEntry);
    return endEntry;
  }

  function buildFelEventLog(phase, ev, msgs, ctx, felEntries) {
    const msg = [`${phase}: "${ev.name}"`, ...msgs].filter(Boolean).join("  ·  ");
    const entityIds = [
      ...(ctx._lastCustId != null ? [ctx._lastCustId] : []),
      ...(ctx._lastSrvId  != null ? [ctx._lastSrvId]  : []),
    ];
    const newEvents = felEntries.map(fe => ({
      id:     fe.id || fe.name || "?",
      name:   fe.name || fe.id || "?",
      at:     fe.scheduledTime,
      reason: fe._isRenege ? "renege" : "schedule",
    }));
    return { msg, entityIds, newEvents };
  }

  // ── step(): one Phase A → B → C cycle ────────────────────────────────────
  function step(options = {}) {
    const captureSnap = options.captureSnap !== false;
    const stepSnapshot = () => (captureSnap ? snap(clock) : null);

    if (_terminationConditionMet) {
      return { done: true, cycleLog: [], snap: stepSnapshot() };
    }

if (fel.length === 0) {
      log.push(_trace("END", { message: "FEL empty — simulation complete" }));
      return { done: true, cycleLog: [_trace("END", { message: "FEL empty" })], snap: stepSnapshot() };
    }

const cycleLog = [];

    // Phase A — advance clock
    const previousClock = clock;
    const nextTime = fel[0].scheduledTime;

    // Compute due events before clock advance — needed for Phase A trace entry
    const due = fel.filter(ev => Math.abs(ev.scheduledTime - nextTime) < 1e-9);

    // Time-based termination check (before advancing clock)
    if (maxSimTime !== null && nextTime > maxSimTime) {
      clock = maxSimTime;
      _terminationConditionMet = true;
      const msg = `Run limit reached (t=${maxSimTime.toFixed(3)}) — simulation complete`;
      log.push(_trace("END", { message: msg }));
      return { done: true, cycleLog: [_trace("END", { message: msg })], snap: stepSnapshot() };
    }

    clock = nextTime;

    // Condition-based termination check
    {
      const endEntry = checkTermination();
      if (endEntry) return { done: true, cycleLog: [endEntry], snap: stepSnapshot() };
    }

    const phaseAClock = { from: previousClock, to: clock, dueEvents: due.map(e => ({ id: e.id || e.name, name: e.name || e.id || "?", type: e.type || "B" })) };
    _cycleCount++;
    const phaseAEntry = makeTraceEntry("A", { message: `Clock → t=${clock.toFixed(3)}`, clock: phaseAClock });
    cycleLog.push(phaseAEntry);
    log.push(phaseAEntry);

    // Phase B — fire all due events
    fel = fel.filter(ev => Math.abs(ev.scheduledTime - clock) >= 1e-9);
    let phaseCDirty = enableFilteredPhaseC ? createDirtySet() : null;

    for (const ev of due) {
      _runtimeMetrics.eventsProcessed++;
      if (ev.type === 'WARMUP' && !_warmupComplete) {
        _warmupComplete = true;
        _statsResetTime = clock;
        _wipIntegral = 0;
        _lastWipSnapTime = clock;
        const msg = `Warm-up complete at t=${clock.toFixed(3)}. Statistics reset.`;
        cycleLog.push({ phase: "WARMUP", time: clock, message: msg });
        log.push(_trace("WARMUP", { message: msg }));
        state.__served = 0;
        state.__reneged = 0;
        for (const srv of entities.filter(e => e.role === 'server')) {
          srv._busyTime = 0;
          if (srv.status === 'busy') srv._busyStart = clock;
          else delete srv._busyStart;
        }
        for (const sv of runtimeModel.stateVariables || []) {
          if (sv.resetOnWarmup) {
            try   { state[sv.name] = JSON.parse(sv.initialValue); }
            catch { state[sv.name] = sv.initialValue; }
          }
        }
        const beforeCount = entities.filter(e => e.role !== 'server').length;
        entities = entities.filter(e => e.role === 'server' || (e.status !== 'done' && e.status !== 'reneged'));
        const afterCount = entities.filter(e => e.role !== 'server').length;
        _excludedCount = beforeCount - afterCount;
        // M2 fix: prune FEL entries whose context entity was removed at warmup.
        // Only prune events that require the context entity to function (RENEGE and
        // cSchedule-based COMPLETE entries with _requiresCtxEntity). Regular B-event
        // self-schedules (e.g. next ARRIVE) carry _contextCustId as metadata only and
        // must NOT be pruned — they remain valid regardless of the creating entity's fate.
        const activeIds = new Set(entities.map(e => e.id));
        fel = fel.filter(ev => {
          if (ev._contextCustId == null) return true;
          if (!ev._isRenege && !ev._requiresCtxEntity) return true;
          return activeIds.has(ev._contextCustId);
        });
        continue; // Proceed to next due event
      }

      if (ev.type === 'FAILURE') {
        const sType = ev.serverTypeName;
        const key = sType.trim().toLowerCase();
        const servers = entities.filter(e =>
          e.role === "server" && e.type.trim().toLowerCase() === key && (e.status === "busy" || e.status === "serving" || e.status === "idle")
        );
        let failedCount = 0;
        for (const srv of servers) {
          if (srv.status === "busy" || srv.status === "serving") {
            const cust = entities.find(e => e.id === srv.currentCustId);
            if (cust) preemptCustomer(cust, srv, clock, null);
          }
          srv.status = "failed";
          srv._failedAt = clock;
          failedCount++;
        }
        const msg = `FAILURE: ${failedCount} ${sType} server(s) failed at t=${clock.toFixed(3)}`;
        cycleLog.push({ phase: "B", time: clock, message: msg });
        log.push(_trace("B", { message: msg, event: { type: "B", id: ev.id, name: ev.name, fired: true, result: [msg], entityIds: servers.map(s => s.id) } }));
        continue;
      }

      if (ev.type === 'REPAIR') {
        const sType = ev.serverTypeName;
        const key = sType.trim().toLowerCase();
        const failedServers = entities.filter(e =>
          e.role === "server" && e.type.trim().toLowerCase() === key && e.status === "failed"
        );
        const repairedCount = repairServers(failedServers, clock);
        const msg = `REPAIR: ${repairedCount} ${sType} server(s) restored at t=${clock.toFixed(3)}`;
        cycleLog.push({ phase: "B", time: clock, message: msg });
        log.push(_trace("B", { message: msg, event: { type: "B", id: ev.id, name: ev.name, fired: true, result: [msg], entityIds: failedServers.map(s => s.id) } }));
        continue;
      }

      const ctx = makeCtx(ev);
      ctx.clock = clock;
      const { msgs, felEntries, skipped } = fireBEvent(ev, ctx);
      if (enableFilteredPhaseC) {
        mergeDirtyInto(
          phaseCDirty,
          deriveDirtyFromTemplate(
            bEventImpactTemplates.get(ev.id),
            { ...ev, _contextCustId: ctx._lastCustId ?? ev._contextCustId, _contextSrvId: ctx._lastSrvId ?? ev._contextSrvId },
            ctx
          )
        );
      }

      for (const entry of felEntries) fel.push(entry);
      fel.sort((a, b) => a.scheduledTime - b.scheduledTime);
      noteFelSize();

      const { msg, entityIds, newEvents } = buildFelEventLog("B", ev, msgs, ctx, felEntries);
      cycleLog.push({ phase: "B", time: clock, message: msg, skipped, event: { type: "B", id: ev.id || ev.name || "?", name: ev.name || ev.id || "?", fired: !skipped, result: msgs, entityIds, newEvents } });
      log.push(_trace("B", { event: { type: "B", id: ev.id || ev.name || "?", name: ev.name || ev.id || "?", fired: !skipped, result: msgs, entityIds, newEvents }, message: msg, skipped }));
    }

// Phase C — evaluate conditionals until stable
    let cFired = true, cPass = 0;
    while (cFired && cPass < maxCPasses) {
      cFired = false; cPass++;
      const h = makeHelpers(entities, runtimeModel);
      const predicateCtx = usePredicateState(h);
      const queueWaitingCache = enableFilteredPhaseC ? new Map() : null;
      for (let idx = 0; idx < sortedCEvents.length; idx++) {
        const ev = sortedCEvents[idx];
        if (enableFilteredPhaseC && !shouldEvaluateCEvent(ev, phaseCDirty, h, runtimeModel, queueWaitingCache)) {
          const skipEntry = makeTraceEntry("C", {
            message: `C: "${ev.name || ev.id}" — skipped (no relevant state change)`,
            cEval: {
              eventId: ev.id || ev.name || "?",
              eventName: ev.name || ev.id || "?",
              priority: ev.priority ?? 9999,
              pass: cPass,
              conditionTrue: false,
              skippedBecause: "dirty-skip",
            },
          });
          cycleLog.push(skipEntry);
          log.push(skipEntry);
          continue;
        }
        _runtimeMetrics.cEventScans++;
        const condTrue = ev._compiledCondition(predicateCtx);
        if (!condTrue) {
          const diag = getConditionDiagnostics(ev.condition, predicateCtx);
          const falseEntry = makeTraceEntry("C", {
            message: `C: "${ev.name || ev.id}" — condition false${diag ? ` [${diag}]` : ''}`,
            cEval: {
              eventId: ev.id || ev.name || "?",
              eventName: ev.name || ev.id || "?",
              priority: ev.priority ?? 9999,
              pass: cPass,
              conditionTrue: false,
              failureReason: "condition false",
              diagnostics: diag || undefined,
            },
          });
          cycleLog.push(falseEntry);
          log.push(falseEntry);
          continue;
        }
        // Clear arbitration from any prior C-event pass, then build fresh ctx
        for (const k in _arbitration) delete _arbitration[k];
        const ctx = makeCtx(null);
        ctx.clock = clock;
        const { msgs, felEntries } = fireCEvent(ev, ctx);
        if (enableFilteredPhaseC) {
          phaseCDirty.all = true;
        }
        for (const entry of felEntries) fel.push(entry);
        if (felEntries.length) fel.sort((a, b) => a.scheduledTime - b.scheduledTime);
        noteFelSize();
        _runtimeMetrics.cEventsFired++;
        _runtimeMetrics.eventsProcessed++;
        cFired = true;
        const { msg, entityIds, newEvents } = buildFelEventLog("C", ev, msgs, ctx, felEntries);
        const firedEntry = makeTraceEntry("C", {
          cEval: { eventId: ev.id || ev.name || "?", eventName: ev.name || ev.id || "?", priority: ev.priority ?? 9999, pass: cPass, conditionTrue: true },
          event: { type: "C", id: ev.id || ev.name || "?", name: ev.name || ev.id || "?", fired: true, result: msgs, entityIds, newEvents },
          message: msg,
          arbitration: Object.keys(ctx._arbitration).length ? { ...ctx._arbitration } : undefined,
        });
        cycleLog.push(firedEntry);
        log.push(firedEntry);
        for (let skippedIndex = idx + 1; skippedIndex < sortedCEvents.length; skippedIndex++) {
          const skippedEvent = sortedCEvents[skippedIndex];
          const skippedEntry = makeTraceEntry("C", {
            cEval: {
              eventId: skippedEvent.id || skippedEvent.name || "?",
              eventName: skippedEvent.name || skippedEvent.id || "?",
              priority: skippedEvent.priority ?? 9999,
              pass: cPass,
              conditionTrue: false,
              skippedBecause: "restart",
            },
            message: `C: "${skippedEvent.name || skippedEvent.id}" skipped (restart)`,
          });
          cycleLog.push(skippedEntry);
          log.push(skippedEntry);
        }
        break; // restart from Priority 1 — Three-Phase restart rule
      }
      if (!cFired) {
        const stableEntry = makeTraceEntry("C", { message: "No C-events can fire → Phase A" });
        cycleLog.push(stableEntry);
        log.push(stableEntry);
      }
    }

    // cFired=true at loop exit means the cap stopped an in-progress scan — truncated
    const phaseCTruncated = cFired;
    if (phaseCTruncated) {
      const truncMsg = `Phase C truncated after ${maxCPasses} passes at t=${clock.toFixed(3)} — model may have an unstable condition`;
      _phaseCTruncated = true;
      warnings.push(truncMsg);
      cycleLog.push({ phase: "C", time: clock, message: truncMsg });
      log.push(_trace("WARNING", { warning: { code: "PHASE_C_TRUNCATED", message: truncMsg, detail: `reached ${maxCPasses} passes` }, message: truncMsg }));
    }

    // Condition-based termination check (post-step)
    {
      const endEntry = checkTermination();
      if (endEntry) return { done: true, cycleLog: [...cycleLog, endEntry], snap: stepSnapshot(), felSize: fel.length, phaseCTruncated };
    }

    // Collect time-series snapshot after Phase C stabilises (F10.4a)
    const stepSnap = captureSnap ? snap(clock) : null;
    if (_timeSeries !== null) {
      if (stepSnap) {
        _timeSeries.push({ t: clock, byType: stepSnap.byType, byQueue: stepSnap.byQueue });
      } else {
        const lite = snapLite();
        _timeSeries.push({ t: clock, byType: lite.byType, byQueue: lite.byQueue });
      }
    }

    // G11 — WIP time-average: integrate WIP count over time
    const dt = clock - _lastWipSnapTime;
    if (dt > 0) {
      const wipCount = entities.filter(e => e.role !== "server" && e.status !== "done" && e.status !== "reneged").length;
      _wipIntegral += wipCount * dt;
      _lastWipSnapTime = clock;
    }

    return { done: false, cycleLog, snap: stepSnap, felSize: fel.length, phaseCTruncated };
  }

  function getProgressSnapshot(overrides = {}) {
    const cancelled = !!overrides.cancelled;
    const done = !!overrides.done || cancelled || _terminationConditionMet || fel.length === 0 || _cycleCount >= maxCycles;
    return makeSingleRunProgress({
      completed: _cycleCount,
      total: maxCycles,
      running: done ? 0 : 1,
      cancelled,
      clock,
      felSize: fel.length,
      eventsProcessed: _runtimeMetrics.eventsProcessed,
      terminationMode: terminationCondition ? "condition" : "time",
      ...overrides,
    });
  }

  function buildRunResult(cancelMeta = null) {
    const cancellation = cancelMeta?.cancelled ? {
      cancelled: true,
      partial: true,
      completionStatus: "cancelled",
    } : null;
    if (cancelMeta?.message) {
      log.push(makeTraceEntry("CANCEL", { message: cancelMeta.message }));
    }

    const engineSummary = getSummary();
    const engineSummaryWithDuration = { ...engineSummary, simulatedDuration: clock };
    const { trace, traceTruncated } = buildTraceFromLog(log, runtimeModel, engineSummaryWithDuration);

    return {
      finalTime: clock,
      log,
      snap:            snap(clock),
      summary:         engineSummary,
      runtimeMetrics:  getRuntimeMetrics(engineSummary.served),
      phaseCTruncated: _phaseCTruncated,
      warnings:        warnings.slice(),
      entitySummary:   entities.map(e => ({ ...e, attrs: { ...e.attrs } })),
      timeSeries:      _timeSeries ?? undefined,
      waitDist:        computeWaitDist(entities),
      perQueue:        Object.keys(_perQueue).length ? { ..._perQueue } : undefined,
      trace,
      traceTruncated,
      ...(cancellation || {}),
    };
  }

  // ── runAll(): run to completion ───────────────────────────────────────────
  function runAll(runOptions = {}) {
    const onProgress = runOptions.onProgress || engineOptions.onProgress;
    const shouldCancel = runOptions.shouldCancel || engineOptions.shouldCancel;

    // Initial termination check
    if (terminationCondition) {
      const h = makeHelpers(entities, runtimeModel);
      if (compiledTerminationCondition(usePredicateState(h))) {
        _terminationConditionMet = true;
        log.push(makeTraceEntry("END", { message: "Termination condition met at start" }));
      }
    }

    onProgress?.(getProgressSnapshot());
    if (shouldCancel?.(getProgressSnapshot())) {
      onProgress?.(getProgressSnapshot({ cancelled: true, done: true }));
      return buildRunResult({ cancelled: true, message: "Run cancelled before processing any events." });
    }

    while (fel.length > 0 && _cycleCount < maxCycles && !_terminationConditionMet) {
      // Check if maxSimTime reached and purge is enabled
      if (maxSimTime != null && clock >= maxSimTime && purgeEnabled && !_purgePhase) {
        _purgePhase = true;
        _purgeStartedAt = clock;
        log.push(makeTraceEntry("PURGE", { message: `Purge period started — blocking new arrivals until all entities exit (max ${maxPurgeTime} time units)` }));
      }
      const r = step({ captureSnap: false });
      onProgress?.(getProgressSnapshot());
      if (r.done) break;
      if (shouldCancel?.(getProgressSnapshot())) {
        onProgress?.(getProgressSnapshot({ cancelled: true, done: true }));
        return buildRunResult({ cancelled: true, message: "Run cancelled at a safe checkpoint. Partial results shown." });
      }
    }
    // Purge period: continue until all customer entities exit or maxPurgeTime elapsed
    if (_purgePhase) {
      const customerEntities = () => entities.filter(e => e.role !== "server" && (e.status === "waiting" || e.status === "serving"));
      while (fel.length > 0 && _cycleCount < maxCycles && !_terminationConditionMet && customerEntities().length > 0) {
        if (_purgeStartedAt != null && (clock - _purgeStartedAt) >= maxPurgeTime) {
          log.push(makeTraceEntry("END", { message: `Purge period max time reached (${maxPurgeTime})` }));
          break;
        }
        if (maxSimTime != null && (clock - maxSimTime) > maxPurgeTime) {
          log.push(makeTraceEntry("END", { message: `Purge period max time reached (${maxPurgeTime})` }));
          break;
        }
        const r = step({ captureSnap: false });
        onProgress?.(getProgressSnapshot());
        if (r.done) break;
      }
    }
    if (!_terminationConditionMet && _cycleCount >= maxCycles) {
      log.push(makeTraceEntry("END", { message: `Cycle limit reached (${maxCycles}) — simulation halted` }));
    } else if (fel.length === 0 && !_terminationConditionMet) {
      log.push(makeTraceEntry("END", { message: "FEL empty — simulation complete" }));
    }
    onProgress?.(getProgressSnapshot({ done: true }));
    return buildRunResult();
  }

  function truncateInterval(start, end) {
    if (start == null || end == null) return 0;
    return Math.max(0, end - Math.max(start, _statsResetTime));
  }

  function entityWaitAfterWarmup(entity) {
    if (!entity?.stages?.length) {
      if (entity?.serviceStart == null) return 0;
      return truncateInterval(entity.arrivalTime, entity.serviceStart);
    }
    return entity.stages.reduce((sum, stage) => sum + truncateInterval(stage.waitStartedAt, stage.serviceStartedAt), 0);
  }

  function entityServiceAfterWarmup(entity) {
    if (!entity?.stages?.length) {
      if (entity?.serviceStart == null || entity?.completionTime == null) return null;
      return truncateInterval(entity.serviceStart, entity.completionTime);
    }
    return entity.stages.reduce((sum, stage) => sum + truncateInterval(stage.serviceStartedAt, stage.serviceEndedAt), 0);
  }

  function entitySojournAfterWarmup(entity) {
    const endTime = entity?.completionTime ?? entity?.renegeTime ?? null;
    if (endTime == null) return null;
    return truncateInterval(entity.arrivalTime, endTime);
  }

  // ── waitDist: per-queue wait-time distribution (F10.4b) ───────────────────
  // Wait time = serviceStart − arrivalTime, recorded for every served customer.
  // Always computed (cheap O(n)) regardless of collectTimeSeries flag.
  function computeWaitDist(allEntities) {
    const byQueue = {};
    for (const e of allEntities) {
      if (e.role === "server" || !e.stages || e.stages.length === 0) continue;
      // Aggregate waits for ALL stages, keyed by queueName recorded in each stage
      for (const stage of e.stages) {
        const qName = stage.queueName || e.lastQueue || e.queue;
        if (!qName) continue;
        const wait = truncateInterval(stage.waitStartedAt, stage.serviceStartedAt);
        if (!byQueue[qName]) byQueue[qName] = [];
        byQueue[qName].push(wait);
      }
    }
    const dist = {};
    for (const [q, waits] of Object.entries(byQueue)) {
      const sorted = [...waits].sort((a, b) => a - b);
      if (sorted.length === 0) continue;
      dist[q] = buildWaitDistEntry(sorted);
    }
    return dist;
  }

  function getSummary() {
    const customers    = entities.filter(e => e.role !== "server");
    const served       = customers.filter(e => e.status === "done");
    const reneged      = customers.filter(e => e.status === "reneged");
    const waitingAtEnd = customers.filter(e => e.status === "waiting");
    const servingAtEnd = customers.filter(e => e.status === "serving").length;
    const servers      = entities.filter(e => e.role === "server");

    const servedWaits  = served
      .map(entityWaitAfterWarmup)
      .filter(w => w > 0);
    const renegedWaits = reneged
      .filter(e => e.stages?.length)
      .map(e => entityWaitAfterWarmup(e))
      .filter(w => w > 0);
    const inProgressWaits = waitingAtEnd.map(e => {
      const completed = e.stages?.length
        ? e.stages.reduce((sum, st) => sum + truncateInterval(st.waitStartedAt, st.serviceStartedAt), 0)
        : 0;
      const partial = truncateInterval(e.lastStageStart ?? e.arrivalTime, clock);
      return Math.max(0, completed + partial);
    }).filter(w => w > 0);

    const totalWeightedWait =
      servedWaits.reduce((a, b) => a + b, 0) +
      renegedWaits.reduce((a, b) => a + b, 0) +
      inProgressWaits.reduce((a, b) => a + b, 0) * 0.5;
    const totalWeightedN =
      servedWaits.length +
      renegedWaits.length +
      inProgressWaits.length * 0.5;
    const avgWait = totalWeightedN > 0 ? + (totalWeightedWait / totalWeightedN).toFixed(4) : null;
    const serviceSamples = served
      .map(entityServiceAfterWarmup)
      .filter(value => value != null);
    const avgSvc = serviceSamples.length
      ? serviceSamples.reduce((s, value) => s + value, 0) / serviceSamples.length
      : null;
    const sojournSamples = [...served, ...reneged]
      .map(entitySojournAfterWarmup)
      .filter(value => value != null);
    const avgSojourn = sojournSamples.length
      ? sojournSamples.reduce((s, value) => s + value, 0) / sojournSamples.length
      : null;
    const maxSojourn = sojournSamples.length
      ? Math.max(...sojournSamples)
      : null;

    const inProgressAtEnd = customers.filter(e => e.status === "waiting" || e.status === "serving");
    const servedSojourns = served
      .map(entitySojournAfterWarmup)
      .filter(v => v != null);
    const renegedSojourns = reneged
      .map(entitySojournAfterWarmup)
      .filter(v => v != null);
    const inProgressSojourns = inProgressAtEnd.map(e => {
      const partial = truncateInterval(e.arrivalTime, clock);
      return Math.max(0, partial);
    }).filter(v => v > 0);
    const totalWeightedSojourn =
      servedSojourns.reduce((a, b) => a + b, 0) +
      renegedSojourns.reduce((a, b) => a + b, 0) +
      inProgressSojourns.reduce((a, b) => a + b, 0) * 0.5;
    const totalWeightedSojournN =
      servedSojourns.length +
      renegedSojourns.length +
      inProgressSojourns.length * 0.5;
    const avgTimeInSystem = totalWeightedSojournN > 0
      ? +(totalWeightedSojourn / totalWeightedSojournN).toFixed(4)
      : null;

    const servedRatio = customers.length > 0
      ? +(served.length / customers.length).toFixed(4)
      : null;

    const outcomes = {};
    const ensureOutcome = (entity) => {
      const fallbackStatus = entity.status === "reneged" ? "reneged" : "completed";
      const fallbackRoute = entity.status === "reneged" ? "status:reneged" : "status:done";
      return entity.outcome || {
        status: fallbackStatus,
        routeId: fallbackRoute,
        routeLabel: entity.status === "reneged" ? "Reneged" : "Completed",
        endedBy: entity.status === "reneged" ? "status" : "status",
        endedAt: entity.renegeTime ?? entity.completionTime ?? null,
      };
    };
    for (const entity of customers) {
      if (entity.status !== "done" && entity.status !== "reneged") continue;
      const outcome = ensureOutcome(entity);
      if (outcome.endedAt != null && outcome.endedAt < _statsResetTime) continue;
      const routeId = outcome.routeId || `${outcome.status || entity.status}:unknown`;
      if (!outcomes[routeId]) {
        outcomes[routeId] = {
          routeId,
          routeLabel: outcome.routeLabel || routeId,
          status: outcome.status || (entity.status === "reneged" ? "reneged" : "completed"),
          endedBy: outcome.endedBy || "unknown",
          count: 0,
          _waitSum: 0, _waitN: 0,
          _sojournSum: 0, _sojournN: 0,
        };
      }
      outcomes[routeId].count++;
      const wait = entityWaitAfterWarmup(entity);
      if (Number.isFinite(wait)) { outcomes[routeId]._waitSum += wait; outcomes[routeId]._waitN++; }
      const endTime = entity.completionTime ?? entity.renegeTime ?? null;
      const sojourn = endTime != null ? truncateInterval(entity.arrivalTime, endTime) : null;
      if (Number.isFinite(sojourn)) { outcomes[routeId]._sojournSum += sojourn; outcomes[routeId]._sojournN++; }
    }
    for (const o of Object.values(outcomes)) finalizeWeightedStats(o);
    const elapsed = clock - _statsResetTime;
    const avgWip = elapsed > 0 ? +(_wipIntegral / elapsed).toFixed(4) : 0;
    // Little's Law check: L = λW → W = L/λ
    const arrivalRate = elapsed > 0 ? served.length / elapsed : 0;
    const avgWaitByLittle = arrivalRate > 0 ? +(avgWip / arrivalRate).toFixed(4) : null;
    const waitDiscrepancy = avgWait != null && avgWaitByLittle != null && avgWaitByLittle > 0
      ? Math.round((Math.abs(avgWait - avgWaitByLittle) / avgWaitByLittle) * 100)
      : null;

    const perResource = {};
    for (const srv of servers) {
      if (!perResource[srv.type]) perResource[srv.type] = { total: 0, busyTimeSum: 0, starvationTimeSum: 0 };
      perResource[srv.type].total++;
      const busyTime = (srv._busyTime || 0) + (
        srv.status === "busy" && srv._busyStart != null
          ? Math.max(0, clock - srv._busyStart)
          : 0
      );
      perResource[srv.type].busyTimeSum += busyTime;
      // Flush active starvation timer if running
      if (srv._starvationStart != null && srv.status === "idle") {
        const starvTime = (srv._starvationTime || 0) + Math.max(0, clock - srv._starvationStart);
        perResource[srv.type].starvationTimeSum += starvTime;
        srv._starvationTime = starvTime;
        delete srv._starvationStart;
      } else if (srv._starvationTime) {
        perResource[srv.type].starvationTimeSum += srv._starvationTime;
      }
    }
    for (const type of Object.keys(perResource)) {
      const r = perResource[type];
      const denominator = elapsed * r.total;
      r.utilisation = denominator > 0 ? +(r.busyTimeSum / denominator).toFixed(4) : 0;
      r.starvationTime = denominator > 0 ? +(r.starvationTimeSum / r.total).toFixed(4) : 0;
      r.starvationPct = denominator > 0 ? +(r.starvationTimeSum / denominator).toFixed(4) : 0;
      delete r.busyTimeSum;
      delete r.starvationTimeSum;
    }

    const totalCost   = state.__totalCost || 0;
    const costPerServed = served.length > 0 ? +(totalCost / served.length).toFixed(4) : null;

    // Container level summary (G21)
    const containerLevels = {};
    for (const ct of runtimeModel.containerTypes || []) {
      const level = state[`__container_${ct.id}`] ?? 0;
      const integral = state[`__containerIntegral_${ct.id}`] ?? 0;
      const prev = state[`__containerPrev_${ct.id}`] ?? 0;
      // Flush remaining area up to current clock
      const totalIntegral = integral + level * Math.max(0, clock - prev);
      containerLevels[ct.id] = {
        min:   +(state[`__containerMin_${ct.id}`] ?? level).toFixed(4),
        max:   +(state[`__containerMax_${ct.id}`] ?? level).toFixed(4),
        avg:   elapsed > 0 ? +(totalIntegral / elapsed).toFixed(4) : +level.toFixed(4),
        final: +level.toFixed(4),
      };
    }

    // Plan deviation: average of (arrivalTime - _plannedTime) for planned entities
    const plannedEntities = customers.filter(e => e._plannedTime != null && e.arrivalTime != null);
    const avgPlanDeviation = plannedEntities.length
      ? +(plannedEntities.reduce((s, e) => s + (e.arrivalTime - e._plannedTime), 0) / plannedEntities.length).toFixed(4)
      : null;

    // Per-section metrics
    const sectionStats = {};
    const journeys = {};
    if (runtimeModel.sections?.length) {
      const queueIdByName = {};
      for (const q of runtimeModel.queues || []) {
        if (q.id && q.name) queueIdByName[q.name.trim().toLowerCase()] = q.id;
      }
      const sectionMemberSet = {};
      const sectionEntrySet = {};
      const sectionExitSet = {};
      for (const sec of runtimeModel.sections) {
        sectionMemberSet[sec.id] = new Set(sec.memberIds || []);
        sectionEntrySet[sec.id]  = new Set(sec.entryQueues || []);
        sectionExitSet[sec.id]   = new Set(sec.exitQueues || []);
        sectionStats[sec.id] = { count: 0, _sojournSum: 0, entitiesIn: 0, entitiesOut: 0 };
      }
      for (const entity of customers) {
        if (!entity.stages?.length) continue;
        const visitedSections = [];
        let lastSection = null;
        for (const sec of runtimeModel.sections) {
          let sojourn = 0, didVisit = false, didEnter = false, didExit = false;
          for (const stage of entity.stages) {
            const qid = queueIdByName[stage.queueName?.trim().toLowerCase()];
            if (!qid || !sectionMemberSet[sec.id].has(qid)) continue;
            didVisit = true;
            sojourn += truncateInterval(stage.waitStartedAt, stage.serviceStartedAt)
                     + truncateInterval(stage.serviceStartedAt, stage.serviceEndedAt);
            if (sectionEntrySet[sec.id].has(qid)) didEnter = true;
            if (sectionExitSet[sec.id].has(qid)) didExit = true;
          }
          if (didVisit) {
            sectionStats[sec.id].count++;
            sectionStats[sec.id]._sojournSum += sojourn;
            if (didEnter) sectionStats[sec.id].entitiesIn++;
            if (didExit)  sectionStats[sec.id].entitiesOut++;
            if (sec.id !== lastSection) { visitedSections.push(sec.id); lastSection = sec.id; }
          }
        }
        if (visitedSections.length > 0) {
          const isDone = entity.status === "done" || entity.status === "reneged";
          let sink;
          if (!isDone)                          sink = "Incomplete";
          else if (entity.outcome?.routeLabel)  sink = entity.outcome.routeLabel;
          else if (entity.status === "reneged") sink = "Reneged";
          else                                  sink = null;
          const key = sink != null
            ? [...visitedSections, sink].join("→")
            : visitedSections.join("→");
          journeys[key] = (journeys[key] || 0) + 1;
        }
      }
      for (const sec of runtimeModel.sections) {
        const s = sectionStats[sec.id];
        s.avgSojourn = s.count > 0 ? +(s._sojournSum / s.count).toFixed(4) : null;
        delete s._sojournSum;
      }
    }

    const queueJourneys = {};
    for (const entity of customers) {
      if (!entity.stages?.length) continue;
      const queueParts = entity.stages.map(s => s.queueName).filter(Boolean);
      if (!queueParts.length) continue;
      const isDone = entity.status === "done" || entity.status === "reneged";
      let sink;
      if (!isDone)                          sink = "Incomplete";
      else if (entity.outcome?.routeLabel)  sink = entity.outcome.routeLabel;
      else if (entity.status === "reneged") sink = "Reneged";
      else                                  sink = null;
      const path = sink != null ? [...queueParts, sink].join("→") : queueParts.join("→");
      queueJourneys[path] = (queueJourneys[path] || 0) + 1;
    }

    return {
      total:             customers.length,
      served:            served.length,
      reneged:           reneged.length,
      avgWait:           avgWait   != null ? +avgWait.toFixed(4)   : null,
      avgWaitByLittle,
      waitDiscrepancy,
      waitSamplesBreakdown: {
        served:      servedWaits.length,
        reneged:     renegedWaits.length,
        inProgress:  inProgressWaits.length,
      },
      terminatingState: {
        waitingAtEnd: waitingAtEnd.length,
        servingAtEnd,
        wipPct: customers.length > 0 ? Math.round(((waitingAtEnd.length + servingAtEnd) / customers.length) * 100) : 0,
      },
      avgSvc:            avgSvc    != null ? +avgSvc.toFixed(4)    : null,
      avgSojourn:        avgSojourn!= null ? +avgSojourn.toFixed(4): null,
      maxSojourn:        maxSojourn!= null ? +maxSojourn.toFixed(4): null,
      avgTimeInSystem:   avgTimeInSystem != null ? +avgTimeInSystem.toFixed(4) : null,
      servedRatio,
      avgWIP:            avgWip,
      totalCost:         +totalCost.toFixed(4),
      costPerServed,
      avgPlanDeviation,
      outcomes:          Object.keys(outcomes).length      ? outcomes      : undefined,
      perResource:       Object.keys(perResource).length   ? perResource   : undefined,
      containerLevels:   Object.keys(containerLevels).length ? containerLevels : undefined,
      sections:          Object.keys(sectionStats).length  ? sectionStats  : undefined,
      journeys:          Object.keys(journeys).length      ? journeys      : undefined,
      queueJourneys:     Object.keys(queueJourneys).length ? queueJourneys : undefined,
      warmupPeriod,
      excludedCount:     _excludedCount,
      phaseCTruncated:   _phaseCTruncated,
      maxCPasses,
      purgePeriodUsed:   _purgePhase ? !!(purgeConfig.enabled) : false,
      purgeStartTime:    _purgeStartedAt,
      warnings,
    };
  }

  function getRuntimeMetrics(entitiesCompleted = state.__served || 0) {
    return {
      wall_clock_ms: null,
      replications: 1,
      events_processed: _runtimeMetrics.eventsProcessed,
      c_event_scans: _runtimeMetrics.cEventScans,
      c_events_fired: _runtimeMetrics.cEventsFired,
      entities_created: _runtimeMetrics.entitiesCreated,
      entities_completed: entitiesCompleted,
      max_queue_length_by_queue: Object.keys(_runtimeMetrics.maxQueueLengthByQueue).length
        ? { ..._runtimeMetrics.maxQueueLengthByQueue }
        : undefined,
      max_future_event_list_size: _runtimeMetrics.maxFutureEventListSize,
    };
  }

  /**
   * Reschedule a planned-arrival FEL entry to a new simulation time.
   * Matches FEL entries by entityId in _scheduleRowAttrs (planned arrivals) or
   * by _contextCustId (service completion events for a named entity).
   * Returns true if at least one entry was updated.
   *
   * @param {string} entityId  Value of the entity's entityId attribute
   * @param {number} newSimTime  New scheduled time in simulation units
   */
  function updateScheduledTime(entityId, newSimTime) {
    if (!entityId || !Number.isFinite(newSimTime)) return false;
    let updated = false;
    for (const entry of fel) {
      const scheduledEntityId = entry._scheduleRowAttrs?.entityId;
      if (scheduledEntityId === entityId) {
        entry._plannedArrivalTime = entry._plannedArrivalTime ?? entry.scheduledTime;
        entry.scheduledTime = newSimTime;
        updated = true;
      }
    }
    if (updated) fel.sort((a, b) => a.scheduledTime - b.scheduledTime);
    return updated;
  }

  return {
    step,
    runAll,
    buildResult:          (options = {}) => buildRunResult(options?.cancelled ? options : null),
    getSnap:              () => snap(clock),
    getFelSize:           () => fel.length,
    getCycleCount:        () => _cycleCount,
    getProgress:          (overrides = {}) => getProgressSnapshot(overrides),
    getSummary,
    getRuntimeMetrics,
    getTimeSeries:        () => _timeSeries ?? undefined,
    getWaitDist:          () => computeWaitDist(entities),
    getEntitySummary:     () => entities.map(e => ({ ...e, attrs: { ...e.attrs } })),
    updateScheduledTime,
  };
}

