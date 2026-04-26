// engine/index.js — Public API
//
// Usage:
//   import { buildEngine } from './engine/index.js'
//   const engine = buildEngine(model)
//   const result = engine.runAll()        // run to completion
//   const step   = engine.step()          // one Phase A→B→C cycle
//   const snap   = engine.getSnap()       // current state snapshot
//   const felSz  = engine.getFelSize()    // events in FEL

import { DISTRIBUTIONS, sample, sampleAttrs } from "./distributions.js";
import { makeHelpers, createServerEntities }   from "./entities.js";
import { evalCondition }                        from "./conditions.js";
import { fireBEvent, fireCEvent }              from "./phases.js";

export { DISTRIBUTIONS, sample, sampleAttrs };

export function buildEngine(model, maxCycles = 800) {
  // ── Initialise scalar state ───────────────────────────────────────────────
  const state = { __served: 0, __reneged: 0 };
  for (const sv of model.stateVariables || []) {
    try   { state[sv.name] = JSON.parse(sv.initialValue); }
    catch { state[sv.name] = sv.initialValue; }
  }

  // ── Entity pool ─────────────────────────────────────────────────────────────
  let _seq = 0;
  const nextId = () => ++_seq;

  const entities = createServerEntities(
    model.entityTypes || [],
    (attrDefs) => sampleAttrs(attrDefs)
  );
  // Assign IDs to pre-created servers
  for (const e of entities) e.id = nextId();

  const helpers = () => makeHelpers(entities);

  // ── Snapshot ──────────────────────────────────────────────────────────────
  function snap(clock) {
    const h = makeHelpers(entities);
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
    
    // ── Build snap.queues by grouping waiting customers by their queue field ──
    const queues = {};
    const waitingCustomers = entities.filter(e => e.role !== 'server' && e.status === 'waiting');
    
    waitingCustomers.forEach(cust => {
      const qName = cust.queue || (cust.type + 'Queue');
      if (!queues[qName]) {
        queues[qName] = { 
          length: 0, 
          entities: [], 
          totalWaitTime: 0, 
          peakLength: 0 
        };
      }
      const waitTime = clock - (cust.queueEntryTime || cust.arrivalTime || 0);
      queues[qName].entities.push(cust);
      queues[qName].totalWaitTime += waitTime;
      queues[qName].length++;
    });
    
    // Compute avgWaitTime for each queue
    Object.keys(queues).forEach(qName => {
      queues[qName].avgWaitTime = queues[qName].length > 0 
        ? queues[qName].totalWaitTime / queues[qName].length 
        : 0;
      delete queues[qName].totalWaitTime;
    });
    
    return {
      clock:    clock || 0,
      served:   state.__served  || 0,
      reneged:  state.__reneged || 0,
      entities: entities.map(e => ({ ...e, attrs: { ...e.attrs } })),
      scalars:  Object.fromEntries(
        Object.entries(state).filter(([k]) => !k.startsWith("__"))
      ),
      byType,
      queues,
    };
  }

  // ── Build initial FEL ─────────────────────────────────────────────────────
  let clock = 0;
  const log = [];

  let fel = (model.bEvents || [])
    .filter(ev => parseFloat(ev.scheduledTime) < 900)
    .map(ev => ({ ...ev, scheduledTime: parseFloat(ev.scheduledTime) || 0 }))
    .sort((a, b) => a.scheduledTime - b.scheduledTime);

  log.push({ phase: "INIT", time: 0, message: "Engine initialised", snap: snap(0) });

  // ── Shared execution context ──────────────────────────────────────────────
  const makeCtx = (felRef = null) => ({
    entities,
    state,
    model,
    clock,
    felRef,
    helpers: makeHelpers(entities),
    nextId,
    _lastCustId: null,
    _lastSrvId:  null,
  });

  // ── step(): one Phase A → B → C cycle ────────────────────────────────────
  function step() {
    if (fel.length === 0) {
      log.push({ phase: "END", time: clock, message: "FEL empty — simulation complete", snap: snap(clock) });
      return { done: true, cycleLog: [{ phase: "END", time: clock, message: "FEL empty" }], snap: snap(clock) };
    }

    const cycleLog = [];

    // Phase A — advance clock
    clock = fel[0].scheduledTime;
    cycleLog.push({ phase: "A", time: clock, message: `Clock → t=${clock.toFixed(3)}` });
    log.push({ phase: "A", time: clock, message: `Clock → t=${clock.toFixed(3)}`, snap: snap(clock) });

    // Phase B — fire all due events
    const due = fel.filter(ev => Math.abs(ev.scheduledTime - clock) < 1e-9);
    fel       = fel.filter(ev => Math.abs(ev.scheduledTime - clock) >= 1e-9);

    for (const ev of due) {
      const ctx = makeCtx(ev);
      ctx.clock = clock;
      const { msgs, felEntries, skipped } = fireBEvent(ev, ctx);

      for (const entry of felEntries) fel.push(entry);
      fel.sort((a, b) => a.scheduledTime - b.scheduledTime);

      const msg = [`B: "${ev.name}"`, ...msgs].filter(Boolean).join("  ·  ");
      cycleLog.push({ phase: "B", time: clock, message: msg, skipped });
      log.push({ phase: "B", time: clock, message: msg, snap: snap(clock), skipped });
    }

    // Phase C — evaluate conditionals until stable
    let cFired = true, cPass = 0;
    while (cFired && cPass < 100) {
      cFired = false; cPass++;
      const firedThisPass = new Set();
      for (const ev of model.cEvents || []) {
        if (firedThisPass.has(ev.id)) continue;
        const h = makeHelpers(entities);
        if (!evalCondition(ev.condition, h, state, clock)) continue;
        const ctx = makeCtx(null);
        ctx.clock = clock;
        const { msgs, felEntries } = fireCEvent(ev, ctx);
        for (const entry of felEntries) fel.push(entry);
        if (felEntries.length) fel.sort((a, b) => a.scheduledTime - b.scheduledTime);
        firedThisPass.add(ev.id);
        cFired = true;
        const msg = [`C: "${ev.name}"`, ...msgs].filter(Boolean).join("  ·  ");
        cycleLog.push({ phase: "C", time: clock, message: msg });
        log.push({ phase: "C", time: clock, message: msg, snap: snap(clock) });
      }
      if (!cFired) {
        cycleLog.push({ phase: "C", time: clock, message: "No C-events can fire → Phase A" });
        log.push({ phase: "C", time: clock, message: "No C-events can fire → Phase A", snap: snap(clock) });
      }
    }

    return { done: false, cycleLog, snap: snap(clock), felSize: fel.length };
  }

  // ── runAll(): run to completion ───────────────────────────────────────────
  function runAll() {
    let c = 0;
    while (fel.length > 0 && c < maxCycles) {
      c++;
      const r = step();
      if (r.done) break;
    }
    log.push({ phase: "END", time: clock, message: "Simulation complete", snap: snap(clock) });

    const customers    = entities.filter(e => e.role !== "server");
    const served       = customers.filter(e => e.status === "done");
    const reneged      = customers.filter(e => e.status === "reneged");

    const avgWait = served.length
      ? served.reduce((s, e) => s + ((e.serviceStart || 0) - e.arrivalTime), 0) / served.length
      : null;
    const avgSvc = served.filter(e => e.completionTime != null && e.serviceStart != null).length
      ? served.filter(e => e.completionTime != null && e.serviceStart != null)
          .reduce((s, e) => s + (e.completionTime - e.serviceStart), 0) / served.length
      : null;
    const withSojourn  = customers.filter(e => e.sojournTime != null);
    const avgSojourn   = withSojourn.length ? withSojourn.reduce((s, e) => s + e.sojournTime, 0) / withSojourn.length : null;
    const maxSojourn   = withSojourn.length ? Math.max(...withSojourn.map(e => e.sojournTime)) : null;

    return {
      finalTime: clock,
      log,
      snap:      snap(clock),
      summary: {
        total:      customers.length,
        served:     served.length,
        reneged:    reneged.length,
        avgWait:    avgWait   != null ? +avgWait.toFixed(4)   : null,
        avgSvc:     avgSvc    != null ? +avgSvc.toFixed(4)    : null,
        avgSojourn: avgSojourn!= null ? +avgSojourn.toFixed(4): null,
        maxSojourn: maxSojourn!= null ? +maxSojourn.toFixed(4): null,
      },
      entitySummary: entities.map(e => ({ ...e, attrs: { ...e.attrs } })),
    };
  }

  return {
    step,
    runAll,
    getSnap:    () => snap(clock),
    getFelSize: () => fel.length,
  };
}