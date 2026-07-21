// engine/phases.js — Three-Phase execution loop
//
// This module implements Pidd's Three-Phase approach:
//   Phase A: advance clock to next FEL event
//   Phase B: fire all bound events at current time
//   Phase C: evaluate and fire all conditional events until stable
//
// EXTENDING: To add pre/post-phase hooks (e.g. for statistics collection),
// add hook functions to the options object passed to runPhases().

import { MACROS, applyScalar, buildStageRecord } from "./macros.js";
import { evaluatePredicate } from "./conditions.js";
import { sample }                           from "./distributions.js";
import { clearWaitingState, attemptQueueJoin, preemptCustomer, releaseServerClaim, indexAddServer, indexRemoveServer, indexTrackEntity, indexUntrackEntity, findEntityById, flushRetiredServerStats } from "./entities.js";
import { hasConditionDefinition, isMeaningfulRoutingBranch } from "../model/conditionFormat.js";

// Distances are undirected — one declared entry covers travel in either direction.
function findDistancePair(distances, from, to) {
  const a = String(from ?? "").trim().toLowerCase();
  const b = String(to ?? "").trim().toLowerCase();
  return (distances || []).find(d => {
    const df = String(d.fromQueue ?? "").trim().toLowerCase();
    const dt = String(d.toQueue ?? "").trim().toLowerCase();
    return (df === a && dt === b) || (df === b && dt === a);
  });
}

function completeEntity(cust, ev, clock, state, index = null) {
  const previousQueue = cust.queue ?? cust.lastQueue ?? null;
  clearWaitingState(cust, index);
  cust.status         = "done";
  cust.completionTime = clock;
  cust.sojournTime    = +(clock - cust.arrivalTime).toFixed(4);
  cust.lastQueue      = previousQueue;
  delete cust.queue;
  state.__served = (state.__served || 0) + 1;
  state.__completedSinceSample = (state.__completedSinceSample || 0) + 1;
  return {
    endedAt: clock,
    ...(ev.id   ? { sourceEventId:   ev.id   } : {}),
    ...(ev.name ? { sourceEventName: ev.name } : {}),
  };
}

// Utilisation/available-time tracking for servers (busyTime, starvationTime, etc.)
// only begins once capacity actually changes here — newly added servers start with
// a fresh _starvationStart at ctx.clock (see createServerEntity), and removed idle
// servers simply stop being tracked entities. No separate "start tracking" step is
// needed; this is already correct, called from both time-based (SHIFT_CHANGE FEL
// event) and condition-based (`when`) shift triggers.
export function applyShiftChange(ev, ctx) {
  const serverTypeName = ev.serverTypeName || ev.payload?.serverTypeName;
  const target = parseInt(ev.newCapacity ?? ev.payload?.newCapacity, 10);
  // target === 0 is a legitimate "closed" period from a weekly schedulePattern
  // (V56 validates capacity 0 as expected there) — only reject missing type,
  // non-integers, and negatives. V14 already guarantees manually-authored
  // shiftSchedule entries never produce target < 1 in the first place.
  if (!serverTypeName || !Number.isInteger(target) || target < 0) {
    return [`SHIFT_CHANGE ignored: invalid capacity for ${serverTypeName || "unknown server type"}`];
  }

  const match = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  ctx.state.__desiredServerCapacity = ctx.state.__desiredServerCapacity || {};
  ctx.state.__desiredServerCapacity[String(serverTypeName).trim().toLowerCase()] = target;

  // Track shift period intervals for per-shift utilisation (F86.4)
  ctx.state.__shiftTimeline = ctx.state.__shiftTimeline || {};
  ctx.state.__shiftTimeline[serverTypeName] = ctx.state.__shiftTimeline[serverTypeName] || [];
  const timeline = ctx.state.__shiftTimeline[serverTypeName];
  if (timeline.length > 0) {
    const prev = timeline[timeline.length - 1];
    prev.endTime = ctx.clock;
    prev.elapsed = ctx.clock - prev.startTime;
  }
  timeline.push({ startTime: ctx.clock, endTime: null, capacity: target, elapsed: 0 });
  ctx.state.__currentShiftLabel = ctx.state.__currentShiftLabel || {};
  ctx.state.__currentShiftLabel[serverTypeName] = `shift_${ctx.clock}_cap${target}`;
  const servers = ctx.entities.filter(e => e.role === "server" && match(e.type, serverTypeName));
  const current = servers.length;
  const entityType = (ctx.model?.entityTypes || []).find(et => et.role === "server" && match(et.name, serverTypeName));
  const behavior = entityType?.shiftBehavior || "delay";

  if (target > current) {
    const addCount = target - current;
    for (let i = 0; i < addCount; i++) {
      const created = ctx.createServerEntity?.(serverTypeName, ctx.clock);
      if (created) {
        ctx.entities.push(created);
        indexAddServer(ctx.index, created);
        indexTrackEntity(ctx.index, created);
      }
    }
    // Reactivate suspended servers when capacity increases
    for (const srv of servers) {
      if (srv._suspended) {
        delete srv._suspended;
        srv.status = "idle";
        srv._starvationStart = clock;
      }
    }
    return [`SHIFT_CHANGE: ${serverTypeName} capacity -> ${target} (${addCount} added)`];
  }

  if (target < current) {
    let excess = current - target;
    const preempted = [];

    if (behavior === "preempt") {
      // Preempt busy servers — store remaining service, re-queue entity, remove server
      const busyServers = servers.filter(e => (e.status === "busy" || e.status === "serving") && !e._suspended);
      for (const srv of busyServers) {
        if (excess <= 0) break;
        const cust = findEntityById(ctx.index, ctx.entities, srv.currentCustId);
        let rem = 0;
        if (cust) {
          rem = srv._scheduledDuration != null
            ? Math.max(0, srv._scheduledDuration - (ctx.clock - (cust.serviceStart ?? ctx.clock)))
            : 0;
          cust._remainingService = rem;
          preemptCustomer(cust, srv, ctx.clock, ctx);
        }
        const idx = ctx.entities.indexOf(srv);
        if (idx >= 0) ctx.entities.splice(idx, 1);
        flushRetiredServerStats(srv, ctx.state);
        indexRemoveServer(ctx.index, srv);
        indexUntrackEntity(ctx.index, srv);
        excess--;
        preempted.push(`#${cust?.id ?? "?"} preempted (${rem.toFixed(1)} remaining)`);
      }
    } else if (behavior === "suspend") {
      // Suspend busy servers — freeze work, mark unavailable
      const busyServers = servers.filter(e => (e.status === "busy" || e.status === "serving") && !e._suspended);
      for (const srv of busyServers) {
        if (excess <= 0) break;
        srv._suspended = true;
        delete srv._busyStart;
        releaseServerClaim(null, srv, ctx.clock);
        excess--;
        preempted.push(`${srv.type} server suspended`);
      }
    }

    // Remove idle servers (all behaviors)
    for (let i = ctx.entities.length - 1; i >= 0 && excess > 0; i--) {
      const entity = ctx.entities[i];
      if (entity.role === "server" && match(entity.type, serverTypeName) && entity.status === "idle" && !entity._suspended) {
        ctx.entities.splice(i, 1);
        flushRetiredServerStats(entity, ctx.state);
        indexRemoveServer(ctx.index, entity);
        indexUntrackEntity(ctx.index, entity);
        excess--;
      }
    }

    const retainedBusy = excess;
    if (retainedBusy > 0) {
      const warning = `SHIFT_CHANGE: ${serverTypeName} target ${target} retained ${retainedBusy} busy server(s) until completion (behavior: ${behavior})`;
      ctx.warnings?.push(warning);
      if (preempted.length > 0) {
        return [`SHIFT_CHANGE: ${serverTypeName} capacity -> ${target} (${behavior})`, ...preempted, warning];
      }
      return [`SHIFT_CHANGE: ${serverTypeName} capacity -> ${target}`, warning];
    }
    if (preempted.length > 0) {
      return [`SHIFT_CHANGE: ${serverTypeName} capacity -> ${target} (${behavior})`, ...preempted];
    }
    return [`SHIFT_CHANGE: ${serverTypeName} capacity -> ${target}`];
  }

  return [`SHIFT_CHANGE: ${serverTypeName} capacity -> ${target}`];
}

// ── Apply an effect string ────────────────────────────────────────────────────
// Returns { msgs, felEntries }
// lastCustId / lastSrvId are returned via the context refs object
export function applyEffect(effect, ctx) {
  const { entities, state, model, clock, felRef, helpers, fel } = ctx;
  if (!effect || !effect.trim()) {
    // No macros ran, so carry the scheduled context straight through — callers
    // (e.g. fireBEvent's routing block) rely on ctx._lastCustId/_lastSrvId to
    // resolve the entity even when there's no effect, such as a DELAY-completion
    // B-event that resolves the entity purely via a routing table.
    ctx._lastCustId = ctx._lastCustId ?? felRef?._contextCustId ?? null;
    ctx._lastSrvId  = ctx._lastSrvId  ?? felRef?._contextSrvId  ?? null;
    return { msgs: [], felEntries: [] };
  }
  const msgs       = [];
  const felEntries = [];
  let lastCustId   = felRef?._contextCustId ?? null;
  let lastSrvId    = felRef?._contextSrvId  ?? null;

  const macroCtx = {
    entities, state, model, clock, felRef, helpers, fel,
    nextId: ctx.nextId,
    rng:    ctx.rng,
    entityFilter: ctx.entityFilter ?? null,
    ceventName: ctx.ceventName ?? null,
    incQueueMetric: ctx.incQueueMetric ?? null,
    noteEntityCreated: ctx.noteEntityCreated ?? null,
    noteQueueDepth: ctx.noteQueueDepth ?? null,
    streamRegistry: ctx.streamRegistry ?? null,
    _arbitration: ctx._arbitration ?? null,
    index: ctx.index ?? null,
    getLastCustId: () => lastCustId,
    getLastSrvId:  () => lastSrvId,
    setLastCustId: (id) => { lastCustId = id; },
    setLastSrvId:  (id) => { lastSrvId  = id; },
    scheduleEvent: (entry) => felEntries.push(entry),
    msgs,
  };

  for (const part of effect.split(";").map(s => s.trim()).filter(Boolean)) {
    let handled = false;

    // Try each registered macro
    for (const macro of MACROS) {
      const m = part.match(macro.pattern);
      if (m) {
        macro.apply(m, macroCtx);
        handled = true;
        break;
      }
    }

    // Scalar effects (VAR++, VAR--, VAR+=N, VAR=val)
    if (!handled) {
      try {
        if (!applyScalar(part, state, clock)) {
          msgs.push(`Unknown effect: ${part}`);
        }
      } catch (e) {
        msgs.push(`Effect error: ${e.message}`);
      }
    }
  }

  // Store last IDs back into context for use by callers (e.g. C-event schedules)
  ctx._lastCustId = lastCustId;
  ctx._lastSrvId  = lastSrvId;
  if (macroCtx._delayedCustIds) ctx._delayedCustIds = macroCtx._delayedCustIds;

  return { msgs, felEntries };
}

// ── Phase B: fire one bound event ────────────────────────────────────────────
export function fireBEvent(ev, ctx) {
  const { entities, clock, model } = ctx;
  const log   = [];

  if (ev.type === "RATE_CHANGE") {
    return {
      msgs: [`RATE_CHANGE: ${ev.sourceName || ev.name || "piecewise source"} period active`],
      felEntries: [],
      skipped: false,
    };
  }

  if (ev.type === "SHIFT_CHANGE") {
    return {
      msgs: applyShiftChange(ev, ctx),
      felEntries: [],
      skipped: false,
    };
  }

  // Reneging guard: skip if context customer is no longer waiting
  if (ev._isRenege && ev._contextCustId != null) {
    const cust = findEntityById(ctx.index, entities, ev._contextCustId);
    if (cust && cust.status !== "waiting") {
      return {
        msgs:       [`Skipped: "${ev.name}" — #${ev._contextCustId} already ${cust.status}`],
        felEntries: [],
        skipped:    true,
      };
    }
  }

  // Count B-event firing (skip synthetic system events)
  if (ev.id && !ev.type) ctx.incEventCount?.(ev.id);

  const effectCtx = { ...ctx, felRef: ev };
  const effectStr = Array.isArray(ev.effect) ? ev.effect.filter(Boolean).join(';') : (ev.effect || '');
  const { msgs, felEntries } = applyEffect(effectStr, effectCtx);

  // Shared context for queue-join checks (F11.1/F11.2/F11.3) performed outside of
  // applyEffect — conditional/probabilistic routing and the loop-guard exit both
  // deliver an already-existing entity into a (possibly new) queue, same as RELEASE.
  const joinCtx = { ...ctx, msgs, scheduleEvent: (entry) => felEntries.push(entry) };

  // ── Route helper: apply a resolved queueName to the customer.
  // null / "" means "exit system" — complete the customer immediately.
  const applyRoute = (cust, queueName, note) => {
    // A DELAY completion routed purely via the routing table (no COMPLETE()/RELEASE()
    // macro ran) would otherwise never get a stage record at the delay boundary, leaving
    // lastStageStart stale and folding the delay duration into whatever wait/service comes
    // next. Close out the delay as its own "delay"-tagged stage before routing onward.
    if (cust._isDelay) {
      if (!cust.stages) cust.stages = [];
      cust.stages.push(buildStageRecord(cust, null, clock));
      cust.lastStageStart = clock;
      delete cust.serviceStart;
      delete cust._isDelay;
    }
    if (!queueName) {
      const evTail = completeEntity(cust, ev, clock, ctx.state, ctx.index);
      cust.outcome = {
        status: "completed",
        routeId: `route-exit:${ev.id || ev.name || "unknown"}`,
        routeLabel: ev.name || "Exit",
        endedBy: "direct-routing",
        ...evTail,
      };
      ctx.incEventCount?.(`route-exit:${ev.id || ev.name || "unknown"}`);
      msgs.push(`Routing: #${cust.id} → exit system (${note})`);
    } else if (attemptQueueJoin(cust, queueName, clock, joinCtx)) {
      msgs.push(`Routing: #${cust.id} → "${queueName}" (${note})`);
    }
  };

  const routingBranches = Array.isArray(ev.routing) ? ev.routing.filter(isMeaningfulRoutingBranch) : [];
  const hasConditionalRouting = routingBranches.length > 0;

  // ── Conditional routing (F10.1) ──────────────────────────────────────────
  if (hasConditionalRouting) {
    const custId = effectCtx._lastCustId;
    const cust   = custId ? findEntityById(ctx.index, ctx.entities, custId) : null;
    // Accept entities in "serving" state when this is a DELAY completion (no server context)
    const isDelayCompletion = cust?.status === "serving" && ev._contextCustId != null && !ev._contextSrvId;
    if (cust && (cust.status === "waiting" || isDelayCompletion)) {
      let routed;
      // NOTE: previously this omitted `model`/`helpers`/`scalars`, so queue(...)/
      // idle(...)/busy(...)/attr(...) tokens silently resolved to undefined in
      // routing[] conditions (only Entity.<attr> and bare state-var comparisons ever
      // worked here) — a pre-existing gap, not something introduced by this change.
      // Fixed to match the canonical predicate-state shape used for C-event/termination
      // conditions (see `predicateState` in index.js), which is what makes dynamic
      // RHS comparisons like queue(A).length < queue(B).length usable in routing.
      const routingPredicateState = {
        currentEntity: cust,
        resources: {},
        queues: {},
        helpers: ctx.helpers,
        model,
        entities: ctx.entities,
        scalars: ctx.state,
        clock,
        __served: ctx.state.__served ?? 0,
        __reneged: ctx.state.__reneged ?? 0,
        __loopCount: ctx.state.__loopCount ?? 0,
      };
      for (const branch of routingBranches) {
        if (branch.condition && evaluatePredicate(branch.condition, routingPredicateState)) {
          routed = branch.queueName;
          break;
        }
      }
      if (routed === undefined) routed = ev.defaultQueueName ?? null;
      if (routed !== undefined) {
        applyRoute(cust, routed || null, "conditional");
      } else {
        const warn = `RELEASE routing: no condition matched for entity #${cust.id} and no defaultQueueName set`;
        msgs.push(warn);
        ctx.warnings?.push(warn);
      }
    }
  }

  // ── Probabilistic routing (F10.2) ────────────────────────────────────────
  if (Array.isArray(ev.probabilisticRouting) && ev.probabilisticRouting.length > 0) {
    const custId = effectCtx._lastCustId;
    const cust   = custId ? findEntityById(ctx.index, ctx.entities, custId) : null;
    // Accept entities in "serving" state when this is a DELAY completion (no server context)
    const isDelayCompletion = cust?.status === "serving" && ev._contextCustId != null && !ev._contextSrvId;
    if (cust && (cust.status === "waiting" || isDelayCompletion)) {
      const roll = ctx.rng();
      let cumulative = 0;
      let chosen = ev.probabilisticRouting[ev.probabilisticRouting.length - 1].queueName;
      for (const branch of ev.probabilisticRouting) {
        cumulative += branch.probability;
        if (roll < cumulative) { chosen = branch.queueName; break; }
      }
      applyRoute(cust, chosen || null, `p=${roll.toFixed(4)}`);
    }
  }

  // ── Loop guard (F12.4): increment loopCount and apply max-circulation guard ──
  if (ev.loopConfig) {
    const custId = effectCtx._lastCustId;
    const cust   = custId ? findEntityById(ctx.index, ctx.entities, custId) : null;
    if (cust && (cust.status === "waiting" || cust.status === "serving")) {
      cust.loopCount = (cust.loopCount || 0) + 1;
      const maxCount = parseInt(ev.loopConfig.maxLoopCount, 10);
      if (Number.isFinite(maxCount) && cust.loopCount >= maxCount) {
        const exitQ = ev.loopConfig.exitQueueName;
        if (exitQ) {
          if (attemptQueueJoin(cust, exitQ, clock, joinCtx)) {
            msgs.push(`Loop guard: #${cust.id} recirculated ${cust.loopCount}x → "${exitQ}"`);
          }
        } else {
          const evTail = completeEntity(cust, ev, clock, ctx.state, ctx.index);
          cust.outcome = {
            status: "completed",
            routeId: `loop-exit:${ev.id || ev.name || "unknown"}`,
            routeLabel: "Loop guard exit",
            endedBy: "loop-guard",
            ...evTail,
          };
          msgs.push(`Loop guard: #${cust.id} recirculated ${cust.loopCount}x → exit system`);
        }
      } else {
        msgs.push(`Loop guard: #${cust.id} loopCount → ${cust.loopCount}`);
      }
    }
  }

  // Process the B-event's own schedules list (next arrival, reneging timer, etc.)
  for (const sched of ev.schedules || []) {
    // eventId may be absent when scheduleRef was linked without it — treat as self-referencing
    const selfId = sched.eventId ?? ev.id;
    const tmpl = (model.bEvents || []).find(b => b.id === selfId);
    if (!tmpl) continue;
    // Purge phase: suppress new arrivals (non-renege schedules create entities — skip them)
    if (ctx._purgePhase && !sched.isRenege) {
      // During run-down, don't schedule new arrival events
      continue;
    }
    const schedCtx = { clock, state: ctx.state, schedKey: selfId, streamName: sched.isRenege ? `renege:${selfId}` : `arrival:${selfId}`, streamRegistry: ctx.streamRegistry }; 
    // rows[]/times[] may be top-level on the entry (schema doc format) or inside distParams
    const topLevelData = sched.rows ? { rows: sched.rows } : sched.times ? { times: sched.times } : null;
    const baseParams = topLevelData ? { ...topLevelData, ...(sched.distParams || {}) } : (sched.distParams || {});
    const schedDist = sched.dist || (topLevelData ? "Schedule" : "Fixed");
    const resolvedBParams = ctx.registry
      ? ctx.registry.resolve(baseParams, sched.paramSource)
      : baseParams;
    const delay = Math.max(0, sample(schedDist, resolvedBParams, ctx.rng, null, schedCtx));
    // Carry per-arrival row attrs from schedule rows[] (S40.2)
    const rowAttrs = ctx.state?.[`__schedRowAttrs_${selfId}`] ?? null;
    let renegeTarget;
    if (sched.isRenege) {
      renegeTarget = effectCtx._lastCustId;
      if (renegeTarget == null) {
        const warning = `Renege schedule skipped for "${tmpl.name}": no context customer available`;
        msgs.push(warning);
        ctx.warnings?.push(warning);
        continue;
      }
    }
    const plannedArrivalTime = rowAttrs ? clock + delay : undefined;
    felEntries.push({
      ...tmpl,
      scheduledTime:        clock + delay,
      _sampledDelay:        `${sched.dist}(${delay.toFixed(3)})`,
      _isRenege:            !!sched.isRenege,
      _contextCustId:       sched.isRenege ? renegeTarget : effectCtx._lastCustId,
      _contextSrvId:        effectCtx._lastSrvId,
      _scheduleRowAttrs:    rowAttrs || undefined,
      _plannedArrivalTime:  plannedArrivalTime,
    });
    msgs.push(`Scheduled "${tmpl.name}" @ t=${(clock + delay).toFixed(3)} [${sched.dist}(${delay.toFixed(3)})]`);
  }

  return { msgs, felEntries, skipped: false };
}

// ── Phase C: fire one conditional event ──────────────────────────────────────
export function fireCEvent(ev, ctx) {
  // Count C-event firing
  if (ev.id) ctx.incEventCount?.(ev.id);

  const { clock, model } = ctx;
  const effectCtx = { ...ctx, felRef: null, entityFilter: ev.entityFilter ?? null, ceventName: ev.name };
  const effectStr = Array.isArray(ev.effect) ? ev.effect.filter(Boolean).join(';') : (ev.effect || '');
  const { msgs, felEntries } = applyEffect(effectStr, effectCtx);

  // Resolve attribute-conditional cSchedules.
  // When ANY entry has a `when` predicate, first-match semantics apply:
  //   iterate in order, use the first entry whose predicate is true (or that has no `when`),
  //   skip all remaining entries.
  // When NO entries have `when`, all entries fire (unchanged legacy behaviour).
  const allCSchedules = ev.cSchedules || [];
  const hasAnyWhen = allCSchedules.some(cs => cs.when);
  let resolvedSchedules;
  if (!hasAnyWhen) {
    resolvedSchedules = allCSchedules;
  } else {
    const custId0 = effectCtx._lastCustId;
    const custEntity0 = custId0 ? findEntityById(ctx.index, ctx.entities, custId0) : null;
    const predicateState0 = {
      currentEntity: custEntity0 ?? null,
      resources: {},
      queues: {},
      ...ctx.state,
    };
    const match = allCSchedules.find(cs =>
      !cs.when || evaluatePredicate(cs.when, predicateState0)
    );
    resolvedSchedules = match ? [match] : [];
  }

  // Process structured cSchedules
  for (const cs of resolvedSchedules) {
    const tmpl = (model.bEvents || []).find(b => b.id === cs.eventId);
    if (!tmpl) { msgs.push(`cSchedule: B-event "${cs.eventId}" not found`); continue; }

    // Guard: if this cSchedule requires entity context but the effect produced no match, skip it.
    // Prevents spurious FEL entries when ASSIGN finds no eligible entity/server pair.
    if (cs.useEntityCtx && effectCtx._lastCustId == null && effectCtx._lastSrvId == null) {
      msgs.push(`cSchedule: skipped "${tmpl.name}" — effect produced no entity context`);
      continue;
    }

    // When DELAY batched multiple entities (no when-predicate path), create one
    // completion B-event per entity with an independently sampled delay.
    const batchIds = (cs.useEntityCtx && !hasAnyWhen && effectCtx._delayedCustIds?.length > 0)
      ? effectCtx._delayedCustIds
      : [cs.useEntityCtx ? effectCtx._lastCustId : undefined];

    for (const perCustId of batchIds) {
      // Resolve delay
      let delay = 0;
      if (cs.dist === "ServerAttr") {
        const srvId    = effectCtx._lastSrvId;
        const srv      = findEntityById(ctx.index, ctx.entities, srvId);
        const attrName = cs.distParams?.attr || "serviceTime";
        delay = Math.max(0, parseFloat(srv?.attrs?.[attrName]) || 1);
        msgs.push(`Scheduled "${tmpl.name}" @ t=${(clock + delay).toFixed(3)} [server.${attrName}=${delay}]`);
      } else if (cs.dist === "EntityAttr") {
        const cust     = perCustId ? findEntityById(ctx.index, ctx.entities, perCustId) : null;
        const attrName = cs.distParams?.attr || "serviceTime";
        const raw      = cust?.attrs?.[attrName];
        if (raw == null) {
          msgs.push(`EntityAttr: entity #${perCustId} has no attribute '${attrName}' — delay = 0`);
        }
        delay = Math.max(0, parseFloat(raw) || 0);
        msgs.push(`Scheduled "${tmpl.name}" @ t=${(clock + delay).toFixed(3)} [entity.${attrName}=${delay}]`);
      } else if (cs.dist === "Distance") {
        const { from, to, speedAttr, speedSource } = cs.distParams || {};
        const pair = findDistancePair(model.distances, from, to);
        let speedVal;
        if (speedSource === "server") {
          const srv = findEntityById(ctx.index, ctx.entities, effectCtx._lastSrvId);
          speedVal = parseFloat(srv?.attrs?.[speedAttr]);
        } else {
          const cust = perCustId ? findEntityById(ctx.index, ctx.entities, perCustId) : null;
          speedVal = parseFloat(cust?.attrs?.[speedAttr]);
        }
        if (!pair) {
          msgs.push(`Distance(${from}→${to}): no declared distance for this pair — delay = 0`);
        } else if (!Number.isFinite(speedVal) || speedVal <= 0) {
          msgs.push(`Distance(${from}→${to}): invalid/missing speed attribute '${speedAttr}' (${speedSource}) — delay = 0`);
        }
        delay = (pair && Number.isFinite(speedVal) && speedVal > 0) ? pair.distance / speedVal : 0;
        msgs.push(`Scheduled "${tmpl.name}" @ t=${(clock + delay).toFixed(3)} [Distance(${from}→${to})=${delay.toFixed(3)}]`);
      } else {
        // Check if the customer has remaining service from preemption/failure
        const cust = perCustId ? findEntityById(ctx.index, ctx.entities, perCustId) : null;
        if (cust && cust._remainingService != null && cust._remainingService > 0) {
          delay = cust._remainingService;
          delete cust._remainingService;
          msgs.push(`Scheduled "${tmpl.name}" @ t=${(clock + delay).toFixed(3)} [remaining service]`);
        } else {
          const resolvedCParams = ctx.registry
            ? ctx.registry.resolve(cs.distParams || {}, cs.paramSource)
            : (cs.distParams || {});
          delay = Math.max(0, sample(cs.dist || "Fixed", resolvedCParams, ctx.rng, null, { clock, streamName: `service:${ev.id}`, streamRegistry: ctx.streamRegistry }));
          msgs.push(`Scheduled "${tmpl.name}" @ t=${(clock + delay).toFixed(3)} [${cs.dist}(${delay.toFixed(3)})]`);
        }
      }

      felEntries.push({
        ...tmpl,
        scheduledTime:       clock + delay,
        _sampledDelay:       `${cs.dist}(${delay.toFixed(3)})`,
        _contextCustId:      cs.useEntityCtx ? perCustId : undefined,
        _contextSrvId:       cs.useEntityCtx ? effectCtx._lastSrvId  : undefined,
        _requiresCtxEntity:  cs.useEntityCtx ? true : undefined,
      });

      // Store scheduled duration on server for preemption/failure remaining-service calculation
      if (cs.useEntityCtx && effectCtx._lastSrvId) {
        const srv = findEntityById(ctx.index, ctx.entities, effectCtx._lastSrvId);
        if (srv) srv._scheduledDuration = delay;
      }
    }
  }

  return { msgs, felEntries };
}

