// engine/phases.js — Three-Phase execution loop
//
// This module implements Pidd's Three-Phase approach:
//   Phase A: advance clock to next FEL event
//   Phase B: fire all bound events at current time
//   Phase C: evaluate and fire all conditional events until stable
//
// EXTENDING: To add pre/post-phase hooks (e.g. for statistics collection),
// add hook functions to the options object passed to runPhases().

import { MACROS, applyScalar }              from "./macros.js";
import { evalCondition, evaluatePredicate } from "./conditions.js";
import { sample }                           from "./distributions.js";
import { clearWaitingState, markEntityWaiting } from "./entities.js";

function hasConditionDefinition(condition) {
  if (!condition) return false;
  if (typeof condition === "string") return condition.trim() !== "";
  if (Array.isArray(condition)) return condition.some(hasConditionDefinition);
  if (typeof condition !== "object") return false;
  if (Array.isArray(condition.clauses)) return condition.clauses.some(hasConditionDefinition);
  return String(condition.variable || condition.token || condition.left || "").trim() !== "";
}

function isMeaningfulRoutingBranch(branch) {
  if (!branch || typeof branch !== "object") return false;
  return hasConditionDefinition(branch.condition);
}

function applyShiftChange(ev, ctx) {
  const serverTypeName = ev.serverTypeName || ev.payload?.serverTypeName;
  const target = parseInt(ev.newCapacity ?? ev.payload?.newCapacity, 10);
  if (!serverTypeName || !Number.isInteger(target) || target < 1) {
    return [`SHIFT_CHANGE ignored: invalid capacity for ${serverTypeName || "unknown server type"}`];
  }

  const match = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  ctx.state.__desiredServerCapacity = ctx.state.__desiredServerCapacity || {};
  ctx.state.__desiredServerCapacity[String(serverTypeName).trim().toLowerCase()] = target;
  const servers = ctx.entities.filter(e => e.role === "server" && match(e.type, serverTypeName));
  const current = servers.length;

  if (target > current) {
    const addCount = target - current;
    for (let i = 0; i < addCount; i++) {
      const created = ctx.createServerEntity?.(serverTypeName, ctx.clock);
      if (created) ctx.entities.push(created);
    }
    return [`SHIFT_CHANGE: ${serverTypeName} capacity -> ${target} (${addCount} added)`];
  }

  if (target < current) {
    let excess = current - target;
    for (let i = ctx.entities.length - 1; i >= 0 && excess > 0; i--) {
      const entity = ctx.entities[i];
      if (entity.role === "server" && match(entity.type, serverTypeName) && entity.status === "idle") {
        ctx.entities.splice(i, 1);
        excess--;
      }
    }
    const retainedBusy = excess;
    if (retainedBusy > 0) {
      const warning = `SHIFT_CHANGE: ${serverTypeName} target ${target} retained ${retainedBusy} busy server(s) until completion`;
      ctx.warnings?.push(warning);
      return [`SHIFT_CHANGE: ${serverTypeName} capacity -> ${target}`, warning];
    }
    return [`SHIFT_CHANGE: ${serverTypeName} capacity -> ${target}`];
  }

  return [`SHIFT_CHANGE: ${serverTypeName} capacity -> ${target}`];
}

// ── Apply an effect string ────────────────────────────────────────────────────
// Returns { msgs, felEntries }
// lastCustId / lastSrvId are returned via the context refs object
export function applyEffect(effect, ctx) {
  if (!effect || !effect.trim()) return { msgs: [], felEntries: [] };
  const { entities, state, model, clock, felRef, helpers } = ctx;
  const msgs       = [];
  const felEntries = [];
  let lastCustId   = felRef?._contextCustId ?? null;
  let lastSrvId    = felRef?._contextSrvId  ?? null;

  const macroCtx = {
    entities, state, model, clock, felRef, helpers,
    nextId: ctx.nextId,
    rng:    ctx.rng,
    entityFilter: ctx.entityFilter ?? null,
    incQueueMetric: ctx.incQueueMetric ?? null,
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
    const cust = entities.find(e => e.id === ev._contextCustId);
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

  // ── Route helper: apply a resolved queueName to the customer.
  // null / "" means "exit system" — complete the customer immediately.
  const applyRoute = (cust, queueName, note) => {
    if (!queueName) {
      const previousQueue = cust.queue ?? cust.lastQueue ?? null;
      clearWaitingState(cust);
      cust.status        = "done";
      cust.completionTime = clock;
      cust.sojournTime    = +(clock - cust.arrivalTime).toFixed(4);
      cust.lastQueue = previousQueue;
      delete cust.queue;
      ctx.state.__served  = (ctx.state.__served || 0) + 1;
      msgs.push(`Routing: #${cust.id} → exit system (${note})`);
    } else {
      markEntityWaiting(cust, clock, queueName);
      msgs.push(`Routing: #${cust.id} → "${queueName}" (${note})`);
    }
  };

  const routingBranches = Array.isArray(ev.routing) ? ev.routing.filter(isMeaningfulRoutingBranch) : [];
  const hasConditionalRouting = routingBranches.length > 0;

  // ── Conditional routing (F10.1) ──────────────────────────────────────────
  if (hasConditionalRouting) {
    const custId = effectCtx._lastCustId;
    const cust   = custId ? ctx.entities.find(e => e.id === custId) : null;
    if (cust && cust.status === "waiting") {
      let routed;
      for (const branch of routingBranches) {
        if (branch.condition && evaluatePredicate(branch.condition, { currentEntity: cust })) {
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
    const cust   = custId ? ctx.entities.find(e => e.id === custId) : null;
    if (cust && cust.status === "waiting") {
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
    const cust   = custId ? ctx.entities.find(e => e.id === custId) : null;
    if (cust && (cust.status === "waiting" || cust.status === "serving")) {
      cust.loopCount = (cust.loopCount || 0) + 1;
      const maxCount = parseInt(ev.loopConfig.maxLoopCount, 10);
      if (Number.isFinite(maxCount) && cust.loopCount >= maxCount) {
        const exitQ = ev.loopConfig.exitQueueName;
        if (exitQ) {
          markEntityWaiting(cust, clock, exitQ);
          msgs.push(`Loop guard: #${cust.id} recirculated ${cust.loopCount}x → "${exitQ}"`);
        } else {
          const previousQueue = cust.queue ?? cust.lastQueue ?? null;
          clearWaitingState(cust);
          cust.status = "done";
          cust.completionTime = clock;
          cust.sojournTime = +(clock - cust.arrivalTime).toFixed(4);
          cust.lastQueue = previousQueue;
          delete cust.queue;
          ctx.state.__served = (ctx.state.__served || 0) + 1;
          msgs.push(`Loop guard: #${cust.id} recirculated ${cust.loopCount}x → exit system`);
        }
      } else {
        msgs.push(`Loop guard: #${cust.id} loopCount → ${cust.loopCount}`);
      }
    }
  }

  // Process the B-event's own schedules list (next arrival, reneging timer, etc.)
  for (const sched of ev.schedules || []) {
    const tmpl = (model.bEvents || []).find(b => b.id === sched.eventId);
    if (!tmpl) continue;
    const delay = Math.max(0, sample(sched.dist || "Fixed", sched.distParams || {}, ctx.rng, null, { clock }));
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
    felEntries.push({
      ...tmpl,
      scheduledTime:    clock + delay,
      _sampledDelay:    `${sched.dist}(${delay.toFixed(3)})`,
      _isRenege:        !!sched.isRenege,
      _contextCustId:   sched.isRenege ? renegeTarget : effectCtx._lastCustId,
      _contextSrvId:    effectCtx._lastSrvId,
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

  // Process structured cSchedules
  for (const cs of ev.cSchedules || []) {
    const tmpl = (model.bEvents || []).find(b => b.id === cs.eventId);
    if (!tmpl) { msgs.push(`cSchedule: B-event "${cs.eventId}" not found`); continue; }

    // Resolve delay
    let delay = 0;
    if (cs.dist === "ServerAttr") {
      const srvId    = effectCtx._lastSrvId;
      const srv      = ctx.entities.find(e => e.id === srvId);
      const attrName = cs.distParams?.attr || "serviceTime";
      delay = Math.max(0, parseFloat(srv?.attrs?.[attrName]) || 1);
      msgs.push(`Scheduled "${tmpl.name}" @ t=${(clock + delay).toFixed(3)} [server.${attrName}=${delay}]`);
    } else {
      delay = Math.max(0, sample(cs.dist || "Fixed", cs.distParams || {}, ctx.rng, null, { clock }));
      msgs.push(`Scheduled "${tmpl.name}" @ t=${(clock + delay).toFixed(3)} [${cs.dist}(${delay.toFixed(3)})]`);
    }

    felEntries.push({
      ...tmpl,
      scheduledTime:  clock + delay,
      _sampledDelay:  `${cs.dist}(${delay.toFixed(3)})`,
      _contextCustId: cs.useEntityCtx ? effectCtx._lastCustId : undefined,
      _contextSrvId:  cs.useEntityCtx ? effectCtx._lastSrvId  : undefined,
    });
  }

  return { msgs, felEntries };
}

