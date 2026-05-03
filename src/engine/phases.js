// engine/phases.js — Three-Phase execution loop
//
// This module implements Pidd's Three-Phase approach:
//   Phase A: advance clock to next FEL event
//   Phase B: fire all bound events at current time
//   Phase C: evaluate and fire all conditional events until stable
//
// EXTENDING: To add pre/post-phase hooks (e.g. for statistics collection),
// add hook functions to the options object passed to runPhases().

import { MACROS, applyScalar } from "./macros.js";
import { evalCondition }       from "./conditions.js";
import { sample }              from "./distributions.js";

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

  const effectCtx = { ...ctx, felRef: ev };
  const { msgs, felEntries } = applyEffect(ev.effect, effectCtx);

  // Process the B-event's own schedules list (next arrival, reneging timer, etc.)
  for (const sched of ev.schedules || []) {
    const tmpl = (model.bEvents || []).find(b => b.id === sched.eventId);
    if (!tmpl) continue;
    const delay = Math.max(0, sample(sched.dist || "Fixed", sched.distParams || {}, ctx.rng));
    let renegeTarget;
    if (sched.isRenege) {
      // Tag the newest waiting customer
      const newest = entities
        .filter(e => e.status === "waiting")
        .sort((a, b) => (b.arrivalTime || 0) - (a.arrivalTime || 0))[0];
      renegeTarget = newest?.id;
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
  const { clock, model } = ctx;
  const effectCtx = { ...ctx, felRef: null };
  const { msgs, felEntries } = applyEffect(ev.effect, effectCtx);

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
      delay = Math.max(0, sample(cs.dist || "Fixed", cs.distParams || {}, ctx.rng));
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

