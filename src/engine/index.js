// engine/index.js — Public API
//
// Usage:
//   import { buildEngine } from './engine/index.js'
//   const engine = buildEngine(model)
//   const result = engine.runAll()        // run to completion
//   const step   = engine.step()          // one Phase A→B→C cycle
//   const snap   = engine.getSnap()       // current state snapshot
//   const felSz  = engine.getFelSize()    // events in FEL

import { DISTRIBUTIONS, sample, sampleAttrs, mulberry32, normalizeDistributionName, getPiecewisePeriods } from "./distributions.js";
import { makeHelpers, createServerEntities, releaseServerClaim, clearWaitingState, markEntityWaiting }   from "./entities.js";
import { evalCondition }                        from "./conditions.js";
import { fireBEvent, fireCEvent }              from "./phases.js";
import { nullRegistry }                        from "./adapters/index.js";
import { SnapshotAdapter }                     from "./adapters/SnapshotAdapter.js";

export { DISTRIBUTIONS, sample, sampleAttrs };

/**
 * Call before buildEngine() when model.experimentDefaults.liveDataMode === 'calibrated_batch'.
 * Pre-fetches all data sources so registry.resolve() can operate synchronously during the run.
 * Safe to call unconditionally — a no-op when liveDataMode is absent or null.
 *
 * @param {{ experimentDefaults?: { liveDataMode?: string } }} model
 * @param {import('./adapters/index.js').AdapterRegistry | typeof import('./adapters/index.js').nullRegistry} registry
 */
export async function prefetchForRun(model, registry, engineRef = null) {
  const mode = model?.experimentDefaults?.liveDataMode;
  if (mode === 'calibrated_batch') {
    await registry.prefetchAll();
  }
  // rolling: WebSocketAdapter.prefetch() waits for first message, keeps connection open
  if (mode === 'rolling') {
    await registry.prefetchAll();
  }
  if (mode === 'lookahead') {
    const snapshotSource = (model?.dataSources || []).find(ds => ds.type === 'snapshot');
    if (snapshotSource) {
      const adapter = new SnapshotAdapter(snapshotSource);
      await adapter.prefetch();
      const snapshot = adapter.getSnapshot();
      if (snapshot && engineRef && typeof engineRef.injectState === 'function') {
        engineRef.injectState(snapshot);
      } else if (snapshot && typeof registry.getSnapshot === 'function') {
        // Store on registry's internal adapter map via registerMock-equivalent approach
        registry.registerMock?.(snapshotSource.id, adapter);
      }
    }
    await registry.prefetchAll();
  }
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
      return { ...entityType, count: String(schedule[0].capacity) };
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

function makeFailureEvents(model, rng) {
  const events = [];
  for (const entityType of model.entityTypes || []) {
    if (entityType.role !== "server") continue;
    const mtbfDist = entityType.mtbfDist || entityType.failureDist;
    const mtbfParams = entityType.mtbfDistParams || entityType.failureDistParams;
    const mttrDist = entityType.mttrDist || entityType.repairDist;
    const mttrParams = entityType.mttrDistParams || entityType.repairDistParams;
    if (!mtbfDist || !mtbfParams) continue;

    const serverName = entityType.name;
    let t = sample(mtbfDist, mtbfParams, rng);
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
      const repairTime = t + sample(mttrDist, mttrParams, rng);
      events.push({
        id: `repair:${serverName}:${repairTime.toFixed(4)}`,
        type: "REPAIR",
        name: `Repair: ${serverName}`,
        serverTypeName: serverName,
        scheduledTime: repairTime,
      });
      t += sample(mtbfDist, mtbfParams, rng);
      count++;
    }
  }
  return events;
}

export function buildEngine(model, seed, warmupPeriod = 0, maxSimTime = null, terminationCondition = null, maxCycles = 5000, maxCPasses = 500, collectTimeSeries = false, registry = nullRegistry) {
  const runtimeModel = modelWithShiftInitialCapacity(model);
  // ── Seeded PRNG — all sampling in this engine instance uses this rng ──────
  const rng = mulberry32(seed);
  let _warmupComplete = false;
  let _terminationConditionMet = false;
  let _phaseCTruncated = false;
  let _excludedCount = 0;
  let _statsResetTime = 0;
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

  const helpers = () => makeHelpers(entities, runtimeModel);
  const createServerEntity = (serverTypeName, arrivalTime = clock) => {
    const match = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
    const entityType = (runtimeModel.entityTypes || []).find(et => et.role === "server" && match(et.name, serverTypeName));
    if (!entityType) return null;
    return {
      id: nextId(),
      type: entityType.name.trim(),
      role: "server",
      status: "idle",
      attrs: sampleAttrs(entityType.attrDefs || entityType.attrs, rng),
      arrivalTime,
      stages: [],
    };
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
    };
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
      const scheduledTime = parseFloat(ev.scheduledTime);
      return {
        ...ev,
        scheduledTime: Number.isFinite(scheduledTime) ? scheduledTime : 0,
      };
    });

  fel.push(...makeRateChangeEvents(runtimeModel), ...makeShiftChangeEvents(runtimeModel), ...makeFailureEvents(runtimeModel, rng));

  if (warmupPeriod > 0) {
    fel.push({ type: "WARMUP", name: "Warm-up complete", scheduledTime: warmupPeriod });
  }

  fel.sort((a, b) => a.scheduledTime - b.scheduledTime);

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
    warnings,
    createServerEntity,
    incQueueMetric,
    incEventCount,
    _arbitration,
    registry,
  });

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
    if (terminationCondition) {
      const h = makeHelpers(entities, runtimeModel);
      if (evalCondition(terminationCondition, h, state, clock)) {
        _terminationConditionMet = true;
        const msg = "Termination condition met — simulation complete";
        const endEntry = makeTraceEntry("END", { message: msg });
        log.push(endEntry);
        return { done: true, cycleLog: [endEntry], snap: stepSnapshot() };
      }
    }

    const phaseAClock = { from: previousClock, to: clock, dueEvents: due.map(e => ({ id: e.id || e.name, name: e.name || e.id || "?", type: e.type || "B" })) };
    const phaseAEntry = makeTraceEntry("A", { message: `Clock → t=${clock.toFixed(3)}`, clock: phaseAClock });
    cycleLog.push(phaseAEntry);
    log.push(phaseAEntry);

    // Phase B — fire all due events
    fel = fel.filter(ev => Math.abs(ev.scheduledTime - clock) >= 1e-9);

    for (const ev of due) {
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
            const custId = srv.currentCustId;
            const cust = entities.find(e => e.id === custId);
            if (cust) {
              const scheduledDuration = srv._scheduledDuration || 0;
              const remainingService = Math.max(0, scheduledDuration - (clock - (cust.serviceStart || clock)));
              cust._remainingService = remainingService;
              releaseServerClaim(cust, srv);
              clearWaitingState(cust);
              markEntityWaiting(cust, clock, cust.lastQueue || cust.queue);
            }
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
        let repairedCount = 0;
        for (const srv of failedServers) {
          const failedAt = srv._failedAt;
          srv.status = "idle";
          srv._failedAt = undefined;
          srv._downtime = failedAt != null ? +(clock - failedAt).toFixed(4) : 0;
          repairedCount++;
        }
        const msg = `REPAIR: ${repairedCount} ${sType} server(s) restored at t=${clock.toFixed(3)}`;
        cycleLog.push({ phase: "B", time: clock, message: msg });
        log.push(_trace("B", { message: msg, event: { type: "B", id: ev.id, name: ev.name, fired: true, result: [msg], entityIds: failedServers.map(s => s.id) } }));
        continue;
      }

      const ctx = makeCtx(ev);
      ctx.clock = clock;
      const { msgs, felEntries, skipped } = fireBEvent(ev, ctx);

      for (const entry of felEntries) fel.push(entry);
      fel.sort((a, b) => a.scheduledTime - b.scheduledTime);

      const msg = [`B: "${ev.name}"`, ...msgs].filter(Boolean).join("  ·  ");
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
      cycleLog.push({ phase: "B", time: clock, message: msg, skipped, event: { type: "B", id: ev.id || ev.name || "?", name: ev.name || ev.id || "?", fired: !skipped, result: msgs, entityIds, newEvents } });
      log.push(_trace("B", { event: { type: "B", id: ev.id || ev.name || "?", name: ev.name || ev.id || "?", fired: !skipped, result: msgs, entityIds, newEvents }, message: msg, skipped }));
    }

// Phase C — evaluate conditionals until stable
    // Sort by ev.priority ascending (lower integer = higher priority, missing = last).
    const sortedCEvents = (runtimeModel.cEvents || []).slice()
      .sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));

    let cFired = true, cPass = 0;
    while (cFired && cPass < maxCPasses) {
      cFired = false; cPass++;
      for (let idx = 0; idx < sortedCEvents.length; idx++) {
        const ev = sortedCEvents[idx];
        const h = makeHelpers(entities, runtimeModel);
        const condTrue = evalCondition(ev.condition, h, state, clock);
        if (!condTrue) {
          const falseEntry = makeTraceEntry("C", {
            message: `C: "${ev.name || ev.id}" — condition false`,
            cEval: {
              eventId: ev.id || ev.name || "?",
              eventName: ev.name || ev.id || "?",
              priority: ev.priority ?? 9999,
              pass: cPass,
              conditionTrue: false,
              failureReason: "condition false",
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
        for (const entry of felEntries) fel.push(entry);
        if (felEntries.length) fel.sort((a, b) => a.scheduledTime - b.scheduledTime);
        cFired = true;
        const msg = [`C: "${ev.name}"`, ...msgs].filter(Boolean).join("  ·  ");
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
    if (terminationCondition) {
      const h = makeHelpers(entities, runtimeModel);
      if (evalCondition(terminationCondition, h, state, clock)) {
        _terminationConditionMet = true;
        const msg = "Termination condition met — simulation complete";
        const endEntry = makeTraceEntry("END", { message: msg });
        log.push(endEntry);
        return { done: true, cycleLog: [...cycleLog, endEntry], snap: stepSnapshot(), felSize: fel.length, phaseCTruncated };
      }
    }

    // Collect time-series snapshot after Phase C stabilises (F10.4a)
    const stepSnap = (_timeSeries !== null || captureSnap) ? snap(clock) : null;
    if (_timeSeries !== null && stepSnap) _timeSeries.push({ t: stepSnap.clock, byType: stepSnap.byType, byQueue: stepSnap.byQueue });

    // G11 — WIP time-average: integrate WIP count over time
    const dt = clock - _lastWipSnapTime;
    if (dt > 0) {
      const wipCount = entities.filter(e => e.role !== "server" && e.status !== "done" && e.status !== "reneged").length;
      _wipIntegral += wipCount * dt;
      _lastWipSnapTime = clock;
    }

    return { done: false, cycleLog, snap: stepSnap, felSize: fel.length, phaseCTruncated };
  }

  // ── runAll(): run to completion ───────────────────────────────────────────
  function runAll() {
    let c = 0;

    // Initial termination check
    if (terminationCondition) {
      const h = makeHelpers(entities, runtimeModel);
      if (evalCondition(terminationCondition, h, state, clock)) {
        _terminationConditionMet = true;
        log.push(makeTraceEntry("END", { message: "Termination condition met at start" }));
      }
    }

    while (fel.length > 0 && c < maxCycles && !_terminationConditionMet) {
      c++;
      const r = step({ captureSnap: false });
      if (r.done) break;
    }
    if (!_terminationConditionMet && c >= maxCycles) {
      log.push(makeTraceEntry("END", { message: `Cycle limit reached (${maxCycles}) — simulation halted` }));
    } else if (fel.length === 0 && !_terminationConditionMet) {
      log.push(makeTraceEntry("END", { message: "FEL empty — simulation complete" }));
    }

    return {
      finalTime: clock,
      log,
      snap:           snap(clock),
      summary:        getSummary(),
      phaseCTruncated: _phaseCTruncated,
      warnings:       warnings.slice(),
      entitySummary:  entities.map(e => ({ ...e, attrs: { ...e.attrs } })),
      timeSeries:     _timeSeries ?? undefined,
      waitDist:       computeWaitDist(entities),
      perQueue:       Object.keys(_perQueue).length ? { ..._perQueue } : undefined,
    };
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
    if (entity?.completionTime == null) return null;
    return truncateInterval(entity.arrivalTime, entity.completionTime);
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
      const n = sorted.length;
      if (n === 0) continue;
      const pct = (p) => sorted[Math.min(Math.floor(p * n), n - 1)];
      dist[q] = {
        n,
        mean: +(sorted.reduce((s, v) => s + v, 0) / n).toFixed(4),
        p50:  +pct(0.50).toFixed(4),
        p90:  +pct(0.90).toFixed(4),
        p95:  +pct(0.95).toFixed(4),
        p99:  +pct(0.99).toFixed(4),
        values: sorted.map(v => +v.toFixed(4)),
      };
    }
    return dist;
  }

  function getSummary() {
    const customers    = entities.filter(e => e.role !== "server");
    const served       = customers.filter(e => e.status === "done");
    const reneged      = customers.filter(e => e.status === "reneged");
    const servers      = entities.filter(e => e.role === "server");

    const waitSamples = served.map(entityWaitAfterWarmup);
    const avgWait = waitSamples.length
      ? waitSamples.reduce((s, value) => s + value, 0) / waitSamples.length
      : null;
    const serviceSamples = served
      .map(entityServiceAfterWarmup)
      .filter(value => value != null);
    const avgSvc = serviceSamples.length
      ? serviceSamples.reduce((s, value) => s + value, 0) / serviceSamples.length
      : null;
    const sojournSamples = customers
      .map(entitySojournAfterWarmup)
      .filter(value => value != null);
    const avgSojourn = sojournSamples.length
      ? sojournSamples.reduce((s, value) => s + value, 0) / sojournSamples.length
      : null;
    const maxSojourn = sojournSamples.length
      ? Math.max(...sojournSamples)
      : null;

    const perResource = {};
    for (const srv of servers) {
      if (!perResource[srv.type]) perResource[srv.type] = { total: 0, busyCount: 0, idleCount: 0 };
      perResource[srv.type].total++;
      if (srv.status === "busy" || srv.status === "serving") perResource[srv.type].busyCount++;
      else perResource[srv.type].idleCount++;
    }
    for (const type of Object.keys(perResource)) {
      const r = perResource[type];
      r.utilisation = r.total > 0 ? +(r.busyCount / r.total).toFixed(4) : 0;
    }

    const totalCost   = state.__totalCost || 0;
    const costPerServed = served.length > 0 ? +(totalCost / served.length).toFixed(4) : null;

    // Container level summary (G21)
    const containerLevels = {};
    const elapsed = clock - _statsResetTime;
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

    return {
      total:             customers.length,
      served:            served.length,
      reneged:           reneged.length,
      avgWait:           avgWait   != null ? +avgWait.toFixed(4)   : null,
      avgSvc:            avgSvc    != null ? +avgSvc.toFixed(4)    : null,
      avgSojourn:        avgSojourn!= null ? +avgSojourn.toFixed(4): null,
      maxSojourn:        maxSojourn!= null ? +maxSojourn.toFixed(4): null,
      avgWIP:            (clock - _statsResetTime) > 0 ? +(_wipIntegral / (clock - _statsResetTime)).toFixed(4) : 0,
      totalCost:         +totalCost.toFixed(4),
      costPerServed,
      perResource:       Object.keys(perResource).length ? perResource : undefined,
      containerLevels:   Object.keys(containerLevels).length ? containerLevels : undefined,
      warmupPeriod,
      excludedCount:     _excludedCount,
      phaseCTruncated:   _phaseCTruncated,
      maxCPasses,
      warnings,
    };
  }

  // ── runAllAsync(): async FEL loop for rolling mode ───────────────────────
  // Uses registry.resolveAsync() at each B/C sample site.
  // The existing step() / runAll() functions are unchanged.
  // onStep(snap, cycleLog) is called after each step (optional, for UI progress).
  async function runAllAsync(onStep = null) {
    let c = 0;

    // Initial termination check
    if (terminationCondition) {
      const h = makeHelpers(entities, runtimeModel);
      if (evalCondition(terminationCondition, h, state, clock)) {
        _terminationConditionMet = true;
        log.push(makeTraceEntry('END', { message: 'Termination condition met at start' }));
      }
    }

    while (fel.length > 0 && c < maxCycles && !_terminationConditionMet) {
      c++;
      // Use synchronous step but re-resolve any paramSource fields asynchronously
      // before the step runs, by pre-fetching the async values into the registry.
      // Since resolveAsync() updates the adapter's in-memory cache (or delegates to
      // getLatest()), and the engine's synchronous resolve() calls getLatest() from
      // the same cache, calling resolveAsync() first ensures fresh values are present.
      const dueTime = fel[0]?.scheduledTime;
      if (dueTime !== undefined) {
        await _asyncResolveDue(dueTime);
      }

      const r = step({ captureSnap: onStep != null });
      if (onStep) onStep(r.snap, r.cycleLog);
      if (r.done) break;
    }

    if (!_terminationConditionMet && c >= maxCycles) {
      log.push(makeTraceEntry('END', { message: `Cycle limit reached (${maxCycles}) -- simulation halted` }));
    } else if (fel.length === 0 && !_terminationConditionMet) {
      log.push(makeTraceEntry('END', { message: 'FEL empty -- simulation complete' }));
    }

    return {
      finalTime: clock,
      log,
      snap:            snap(clock),
      summary:         getSummary(),
      phaseCTruncated: _phaseCTruncated,
      warnings:        warnings.slice(),
      entitySummary:   entities.map(e => ({ ...e, attrs: { ...e.attrs } })),
      timeSeries:      _timeSeries ?? undefined,
      waitDist:        computeWaitDist(entities),
      perQueue:        Object.keys(_perQueue).length ? { ..._perQueue } : undefined,
    };
  }

  // Pre-resolve all paramSource fields that are due at the given clock time.
  // This populates the adapter cache so that synchronous resolve() calls in step()
  // return the latest async values.
  async function _asyncResolveDue(_dueTime) {
    // Collect all paramSource references that might be sampled this step
    const sources = [];
    for (const bev of runtimeModel.bEvents || []) {
      for (const sched of bev.schedules || []) {
        if (sched.paramSource) sources.push(sched.paramSource);
      }
    }
    for (const cev of runtimeModel.cEvents || []) {
      for (const cs of cev.cSchedules || []) {
        if (cs.paramSource) sources.push(cs.paramSource);
      }
    }
    // Call resolveAsync for each unique source — this refreshes the adapter cache
    const seen = new Set();
    for (const ps of sources) {
      const key = `${ps.sourceId}:${ps.field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await registry.resolveAsync({}, ps);
      } catch {
        // non-fatal
      }
    }
  }

  /**
   * Populate entity store from a SystemSnapshot; skip warm-up; reset clock to 0.
   * Does NOT add B-events to the FEL — arrivals still come from scheduled B-events.
   * Can be called before any steps.
   *
   * @param {object} snapshot  — validated SystemSnapshot (clock, entities[], queues{})
   * @returns {number}         — number of customer entities injected
   */
  function injectState(snapshot) {
    // Remove all existing customer entities (preserve server entities)
    entities = entities.filter(e => e.role === 'server');

    let injected = 0;
    for (const se of snapshot.entities || []) {
      const e = {
        id:          nextId(),
        type:        se.type,
        role:        'customer',
        status:      se.location === 'queue' ? 'waiting' : 'serving',
        attrs:       se.attrs ? { ...se.attrs } : {},
        arrivalTime: 0,
        stages:      [],
        lastStageStart: null,
        loopCount:   0,
      };
      if (se.location === 'queue') {
        e.queue = se.queueId;
        e.waitingSince = 0;
        e.waitingFor = { kind: 'queue', queueName: se.queueId, enteredAt: 0 };
      }
      entities.push(e);
      injected++;
    }

    // Mark warm-up as already complete and prune the WARMUP FEL entry
    _warmupComplete = true;
    fel = fel.filter(ev => ev.type !== 'WARMUP');

    // Reset simulation clock to 0 (not the wall-clock offset from the snapshot)
    clock = 0;

    return injected;
  }

  return {
    step,
    runAll,
    runAllAsync,
    injectState,
    getSnap:         () => snap(clock),
    getFelSize:      () => fel.length,
    getSummary,
    getTimeSeries:   () => _timeSeries ?? undefined,
    getWaitDist:     () => computeWaitDist(entities),
    getEntitySummary: () => entities.map(e => ({ ...e, attrs: { ...e.attrs } })),
  };
}

