// engine/macros.js — Effect macro registry
//
// EXTENDING: To add a new macro (e.g. BATCH, PRIORITY_ASSIGN):
//   1. Add an entry to MACROS below
//   2. pattern:  regex matching the macro call
//   3. apply:    function(match, ctx) => void
//      ctx contains: { entities, state, helpers, clock, felRef,
//                      setLastCustId, setLastSrvId, getLastCustId, getLastSrvId,
//                      scheduleEvent, msgs }
//   3. No changes needed anywhere else

import { sampleAttrs } from "./distributions.js";
import { evaluatePredicate } from "./conditions.js";

// ── Safe scalar expression evaluator (replaces new Function in applyScalar) ──

// Recursive descent parser for arithmetic on number literals: + - * / ()
function safeArithmetic(s) {
  let i = 0;
  function skipWS() { while (i < s.length && s[i] === ' ') i++; }
  function parseNumber() {
    skipWS();
    let str = '';
    if (i < s.length && s[i] === '-') { str += '-'; i++; }
    while (i < s.length && /[\d.]/.test(s[i])) str += s[i++];
    return str ? parseFloat(str) : NaN;
  }
  function parsePrimary() {
    skipWS();
    if (i < s.length && s[i] === '(') {
      i++;
      const v = parseAddSub();
      skipWS();
      if (i < s.length && s[i] === ')') i++;
      return v;
    }
    return parseNumber();
  }
  function parseMulDiv() {
    let result = parsePrimary();
    skipWS();
    while (i < s.length && (s[i] === '*' || s[i] === '/')) {
      const op = s[i++];
      const right = parsePrimary();
      result = op === '*' ? result * right : (right !== 0 ? result / right : NaN);
      skipWS();
    }
    return result;
  }
  function parseAddSub() {
    let result = parseMulDiv();
    skipWS();
    while (i < s.length && (s[i] === '+' || s[i] === '-')) {
      const op = s[i++];
      const right = parseMulDiv();
      result = op === '+' ? result + right : result - right;
      skipWS();
    }
    return result;
  }
  const result = parseAddSub();
  skipWS();
  return i === s.length ? result : NaN;
}

// Evaluate a scalar RHS expression after state variable substitution.
// Returns a number, boolean, string, or raw string fallback — never executes code.
function safeEvalScalar(v) {
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  if (s === 'true')  return true;
  if (s === 'false') return false;
  if (/^[\d\s+\-*/.()]+$/.test(s)) {
    const n = safeArithmetic(s);
    if (!isNaN(n)) return n;
  }
  const n = Number(s);
  if (!isNaN(n) && s !== '') return n;
  return s; // raw string fallback — matches previous behaviour for unresolved identifiers
}

export const MACROS = [

  // ── ARRIVE(Type[, QueueName]) ──────────────────────────────────────────────
  {
    name:    "ARRIVE",
    pattern: /^ARRIVE\(([^,)]+)(?:\s*,\s*([^,)]+))?\)$/i,
    apply(match, ctx) {
      const typeName  = match[1].trim();
      const queueName = match[2]?.trim() || (typeName + "Queue");
      const { entities, model, clock, helpers, setLastCustId, msgs, incQueueMetric, felRef } = ctx;
      const et = (model.entityTypes || []).find(
        e => e.name.trim().toLowerCase() === typeName.trim().toLowerCase()
      );
      const qDef = (model.queues || []).find(
        q => q.name?.trim().toLowerCase() === queueName.trim().toLowerCase()
      );

      // ── F11.2 Balking — evaluated before entity joins ────────────────────
      // Balk config lives on the B-event (felRef) that fired this ARRIVE.
      const bEvent = felRef;
      if (bEvent) {
        // Condition-based balking — uses evaluatePredicate (already imported at top)
        if (bEvent.balkCondition) {
          const qLen = entities.filter(
            e => e.status === "waiting" && e.queue?.trim().toLowerCase() === queueName.trim().toLowerCase()
          ).length;
          // Build a state object that exposes Queue.<name>.length for the predicate evaluator
          const balkState = {
            ...ctx.state,
            queues: { [queueName]: { length: qLen } },
          };
          const balks = evaluatePredicate(bEvent.balkCondition, balkState);
          if (balks) {
            incQueueMetric?.(queueName, "balkCount");
            const dest = qDef?.overflowDestination ?? null;
            if (dest) {
              const id = ctx.nextId();
              entities.push({ id, type: typeName, role: et?.role || "customer", status: "waiting",
                queue: dest, attrs: sampleAttrs(et?.attrDefs || et?.attrs || "", ctx.rng),
                arrivalTime: clock, stages: [], lastStageStart: null, loopCount: 0 });
              setLastCustId(id);
              msgs.push(`#${id} (${typeName}) balked → rerouted to "${dest}"`);
            } else {
              msgs.push(`(${typeName}) balked at ${queueName} — not recorded`);
            }
            return;
          }
        }
        // Probability-based balking
        if (bEvent.balkProbability != null && ctx.rng() < bEvent.balkProbability) {
          incQueueMetric?.(queueName, "balkCount");
          const dest = qDef?.overflowDestination ?? null;
          if (dest) {
            const id = ctx.nextId();
            entities.push({ id, type: typeName, role: et?.role || "customer", status: "waiting",
              queue: dest, attrs: sampleAttrs(et?.attrDefs || et?.attrs || "", ctx.rng),
              arrivalTime: clock, stages: [], lastStageStart: null, loopCount: 0 });
            setLastCustId(id);
            msgs.push(`#${id} (${typeName}) balked (p) → rerouted to "${dest}"`);
          } else {
            msgs.push(`(${typeName}) balked at ${queueName} — exited`);
          }
          return;
        }
      }

      // ── F11.1 Finite queue capacity — checked after balking ──────────────
      const cap = qDef?.capacity != null ? parseInt(qDef.capacity, 10) : null;
      if (cap !== null && Number.isFinite(cap) && cap > 0) {
        const currentDepth = entities.filter(
          e => e.status === "waiting" && e.queue?.trim().toLowerCase() === queueName.trim().toLowerCase()
        ).length;
        if (currentDepth >= cap) {
          incQueueMetric?.(queueName, "blockingCount");
          // F11.3 overflow routing: route to overflowDestination or exit
          const dest = qDef?.overflowDestination ?? null;
          if (dest) {
            const id = ctx.nextId();
            entities.push({ id, type: typeName, role: et?.role || "customer", status: "waiting",
              queue: dest, attrs: sampleAttrs(et?.attrDefs || et?.attrs || "", ctx.rng),
              arrivalTime: clock, stages: [], lastStageStart: null, loopCount: 0 });
            setLastCustId(id);
            msgs.push(`#${id} (${typeName}) blocked (capacity ${cap}) → overflow to "${dest}"`);
          } else {
            msgs.push(`(${typeName}) blocked at ${queueName} (capacity ${cap}) → exited system`);
          }
          return;
        }
      }

      // ── Normal join ───────────────────────────────────────────────────────
      const id = ctx.nextId();
      const ent = {
        id,
        type:           typeName,
        role:           et?.role || "customer",
        status:         "waiting",
        queue:          queueName,
        attrs:          sampleAttrs(et?.attrDefs || et?.attrs || "", ctx.rng),
        arrivalTime:    clock,
        stages:         [],
        lastStageStart: null,
        loopCount:      0,
      };
      entities.push(ent);
      setLastCustId(id);
      msgs.push(`#${id} (${typeName}) arrived → waiting [queue: ${queueName}, depth: ${helpers.waitingOf(typeName).length}]`);
    },
  },

  // ── ASSIGN(CustomerType|QueueName, ServerType) ────────────────────────────
  {
    name:    "ASSIGN",
    pattern: /^ASSIGN\(([^,)]+)\s*,\s*([^,)]+)\)$/i,
    apply(match, ctx) {
      const cType = match[1].trim();
      const sType = match[2].trim();
      const { entities, helpers, clock, setLastCustId, setLastSrvId, msgs } = ctx;

      // Look up queue discipline for this entity type or queue name
      const queues = ctx.model?.queues || [];
      const matchedQ = queues.find(q => {
        const n = q.name?.trim().toLowerCase();
        const t = q.customerType?.trim().toLowerCase();
        const c = cType.trim().toLowerCase();
        return n === c || t === c;
      });
      const discipline = matchedQ?.discipline || 'FIFO';

      // Build entity filter function from predicate JSON if present
      const filterFn = ctx.entityFilter
        ? (entity) => evaluatePredicate(ctx.entityFilter, { currentEntity: entity })
        : null;

      // Prefer queue-name match first (more specific — prevents cross-queue theft
      // when e.g. ASSIGN(Patient, Nurse) picks up a patient in the Treatment queue).
      // Fall back to entity-type match for backward compat (queue name = entity type).
      let inQueue = entities.filter(e =>
        e.queue &&
        e.queue.trim().toLowerCase() === cType.trim().toLowerCase() &&
        e.status === "waiting"
      );
      if (filterFn) inQueue = inQueue.filter(filterFn);
      inQueue = inQueue.sort((a, b) => {
        if (discipline.toUpperCase() === 'LIFO')
          return (b.arrivalTime || 0) - (a.arrivalTime || 0);
        if (discipline.toUpperCase() === 'PRIORITY') {
          const pa = Number(a.attrs?.priority ?? Infinity);
          const pb = Number(b.attrs?.priority ?? Infinity);
          if (pa !== pb) return pa - pb;
        }
        return (a.arrivalTime || 0) - (b.arrivalTime || 0);
      });
      let cust = inQueue[0];
      if (!cust) {
        cust = helpers.waitingOf(cType, discipline, filterFn)[0];
      }

      const srv = helpers.idleOf(sType)[0];

      if (cust && srv) {
        cust.status       = "serving";
        cust.serviceStart = clock;
        cust.serverId     = srv.id;
        srv.status        = "busy";
        srv.currentCustId = cust.id;
        setLastCustId(cust.id);
        setLastSrvId(srv.id);
        msgs.push(
          `#${cust.id} (${cType}) → serving by #${srv.id} (${sType}) ` +
          `[waited ${(clock - cust.arrivalTime).toFixed(3)} t]`
        );
      } else {
        msgs.push(`ASSIGN(${cType},${sType}): no match — queue=${helpers.waitingOf(cType).length} idle=${helpers.idleOf(sType).length}`);
      }
    },
  },

  // ── COMPLETE() ─────────────────────────────────────────────────────────────
  {
    name:    "COMPLETE",
    pattern: /^COMPLETE\(\)$/i,
    apply(_match, ctx) {
      const { entities, state, clock, felRef, getLastCustId, getLastSrvId, msgs } = ctx;
      const custId = felRef?._contextCustId ?? getLastCustId();
      const srvId  = felRef?._contextSrvId  ?? getLastSrvId();
      const cust   = entities.find(e => e.id === custId);
      const srv    = entities.find(e => e.id === srvId);

      if (cust && (cust.status === "serving" || cust.status === "waiting")) {
        if (!cust.stages) cust.stages = [];
        cust.stages.push({
          serverType:   srv?.type || "unknown",
          stageWait:    +(cust.serviceStart != null
            ? (cust.serviceStart - (cust.lastStageStart ?? cust.arrivalTime))
            : 0).toFixed(4),
          stageService: +(clock - (cust.serviceStart || clock)).toFixed(4),
        });
        cust.status        = "done";
        cust.completionTime = clock;
        cust.sojournTime    = +(clock - cust.arrivalTime).toFixed(4);
        state.__served      = (state.__served || 0) + 1;
        msgs.push(`#${cust.id} done [sojourn ${cust.sojournTime.toFixed(2)} t, ${cust.stages.length} stage(s)]`);
      }
      if (srv) {
        srv.status = "idle";
        delete srv.currentCustId;
        msgs.push(`Server #${srv.id} → idle`);
      }
    },
  },

  // ── RELEASE(ServerType[, TargetQueue]) ────────────────────────────────────
  // Frees server, returns customer to waiting — preserves arrivalTime for sojourn
  {
    name:    "RELEASE",
    pattern: /^RELEASE\(([^,)]+)(?:\s*,\s*([^,)]+))?\)$/i,
    apply(match, ctx) {
      const srvType     = match[1].trim();
      const targetQueue = match[2]?.trim() || null;
      const { entities, clock, getLastCustId, getLastSrvId, felRef, msgs } = ctx;
      const custId = felRef?._contextCustId ?? getLastCustId();
      const srvId  = felRef?._contextSrvId  ?? getLastSrvId();
      const srv    = entities.find(e => e.id === srvId && e.role === "server")
                  || entities.find(e => e.type.trim().toLowerCase() === srvType.trim().toLowerCase() && e.status === "busy");
      const cust   = srv
        ? (entities.find(e => e.id === srv.currentCustId) || entities.find(e => e.id === custId))
        : entities.find(e => e.id === custId);

      if (srv && cust) {
        if (!cust.stages) cust.stages = [];
        cust.stages.push({
          serverType:   srv.type,
          stageWait:    +(cust.serviceStart != null
            ? (cust.serviceStart - (cust.lastStageStart ?? cust.arrivalTime))
            : 0).toFixed(4),
          stageService: +(clock - (cust.serviceStart || clock)).toFixed(4),
        });
        cust.lastStageStart = clock;
        cust.status         = "waiting";
        if (targetQueue) cust.queue = targetQueue;
        delete cust.serviceStart;
        delete cust.serverId;
        srv.status = "idle";
        delete srv.currentCustId;
        msgs.push(`#${cust.id} released → waiting [queue: ${cust.queue}, stage ${cust.stages.length} done, srv #${srv.id} idle]`);
      } else {
        msgs.push(`RELEASE(${srvType}): no busy server+customer pair found`);
      }
    },
  },

  // ── RENEGE(ctx) ────────────────────────────────────────────────────────────
  {
    name:    "RENEGE",
    pattern: /^RENEGE\((\w+)\)$/i,
    apply(match, ctx) {
      const { entities, state, clock, felRef, getLastCustId, msgs } = ctx;
      const id  = match[1] === "ctx"
        ? (felRef?._contextCustId ?? getLastCustId())
        : parseInt(match[1]);
      const ent = entities.find(e => e.id === id);
      if (ent && ent.status === "waiting") {
        ent.status     = "reneged";
        ent.renegeTime = clock;
        state.__reneged = (state.__reneged || 0) + 1;
        msgs.push(`#${ent.id} reneged after ${(clock - ent.arrivalTime).toFixed(3)} t`);
      } else if (ent) {
        msgs.push(`RENEGE skipped — #${id} already ${ent.status}`);
      }
    },
  },

  // ── BATCH(QueueName, batchSize) — C-Event macro ────────────────────────────
  {
    name:    "BATCH",
    pattern: /^BATCH\(([^,)]+)\s*,\s*(\d+)\)$/i,
    apply(match, ctx) {
      const queueName = match[1].trim();
      const batchSize = parseInt(match[2], 10);
      const { entities, model, clock, msgs, setLastCustId, helpers, nextId } = ctx;

      const qDef = (model.queues || []).find(
        q => q.name?.trim().toLowerCase() === queueName.trim().toLowerCase()
      );
      if (!qDef) {
        msgs.push(`BATCH(${queueName},${batchSize}): queue not found`);
        return;
      }
      const discipline = qDef.discipline || 'FIFO';

      let candidates = entities.filter(
        e => e.status === "waiting" && e.role !== "batch" &&
          e.queue?.trim().toLowerCase() === queueName.trim().toLowerCase()
      );
      if (candidates.length < batchSize) {
        msgs.push(`BATCH(${queueName},${batchSize}): only ${candidates.length} waiting — insufficient`);
        return;
      }
      switch ((discipline || 'FIFO').toUpperCase()) {
        case 'LIFO': candidates.sort((a, b) => (b.arrivalTime || 0) - (a.arrivalTime || 0)); break;
        case 'PRIORITY':
          candidates.sort((a, b) => {
            const pa = Number(a.attrs?.priority ?? Infinity);
            const pb = Number(b.attrs?.priority ?? Infinity);
            if (pa !== pb) return pa - pb;
            return (a.arrivalTime || 0) - (b.arrivalTime || 0);
          });
          break;
        default:
          candidates.sort((a, b) => (a.arrivalTime || 0) - (b.arrivalTime || 0));
      }

      const batched = candidates.slice(0, batchSize);
      const ids = batched.map(e => e.id);
      const idSet = new Set(ids);
      for (let i = entities.length - 1; i >= 0; i--) {
        if (idSet.has(entities[i].id)) {
          entities.splice(i, 1);
        }
      }

      const firstChild = batched[0];
      const parentId = nextId();
      const parent = {
        id: parentId,
        type: firstChild.type,
        role: "batch",
        status: "waiting",
        queue: queueName,
        attrs: { ...(firstChild.attrs || {}) },
        arrivalTime: clock,
        stages: [],
        lastStageStart: null,
        loopCount: 0,
        batch: {
          children: batched.map(e => ({
            ...e,
            attrs: { ...(e.attrs || {}) },
            stages: e.stages ? e.stages.map(s => ({ ...s })) : [],
          })),
        },
      };
      entities.push(parent);
      setLastCustId(parentId);
      msgs.push(`BATCH: #${ids.join(', #')} → batch #${parentId} in "${queueName}"`);
    },
  },

  // ── UNBATCH(QueueName) — B-Event macro ──────────────────────────────────────
  {
    name:    "UNBATCH",
    pattern: /^UNBATCH\(([^,)]+)\)$/i,
    apply(match, ctx) {
      const targetQueue = match[1].trim();
      const { entities, clock, felRef, getLastCustId, msgs } = ctx;

      const parentId = felRef?._contextCustId ?? getLastCustId();
      const parent = entities.find(e => e.id === parentId);

      if (!parent || parent.role !== "batch" || !parent.batch?.children?.length) {
        msgs.push(`UNBATCH: #${parentId} is not a batch entity or has no children`);
        return;
      }

      const children = parent.batch.children;
      const childIds = [];
      for (const child of children) {
        const restored = {
          ...child,
          attrs: { ...(child.attrs || {}) },
          status: "waiting",
          queue: targetQueue,
          lastStageStart: clock,
        };
        entities.push(restored);
        childIds.push(child.id);
      }

      parent.status = "done";
      parent.completionTime = clock;
      msgs.push(`UNBATCH: batch #${parentId} → restored #${childIds.join(', #')} to "${targetQueue}"`);
    },
  },

  // ── RENEGE_OLDEST(Type) ────────────────────────────────────────────────────
  {
    name:    "RENEGE_OLDEST",
    pattern: /^RENEGE_OLDEST\((\w+)\)$/i,
    apply(match, ctx) {
      const { helpers, state, clock, msgs } = ctx;
      const cType = match[1].trim();
      const queues = ctx.model?.queues || [];
      const matchedQ = queues.find(q => {
        const n = q.name?.trim().toLowerCase();
        const t = q.customerType?.trim().toLowerCase();
        const c = cType.toLowerCase();
        return n === c || t === c;
      });
      const discipline = matchedQ?.discipline || 'FIFO';
      const ent = helpers.waitingOf(cType, discipline)[0];
      if (ent) {
        ent.status     = "reneged";
        ent.renegeTime = clock;
        state.__reneged = (state.__reneged || 0) + 1;
        msgs.push(`#${ent.id} (${cType}) reneged after ${(clock - ent.arrivalTime).toFixed(3)} t`);
      }
    },
  },
];

/**
 * Apply a single scalar effect part (VAR++, VAR--, VAR+=N, VAR=val).
 * Returns true if handled.
 */
export function applyScalar(part, state, clock) {
  const r1 = part.match(/^(\w+)\+\+$/);
  const r2 = part.match(/^(\w+)--$/);
  const r3 = part.match(/^(\w+)\s*\+=\s*(.+)$/);
  const r4 = part.match(/^(\w+)\s*-=\s*(.+)$/);
  const r5 = part.match(/^(\w+)\s*=\s*(.+)$/);

  if (r1) { state[r1[1]] = (Number(state[r1[1]]) || 0) + 1; return true; }
  if (r2) { state[r2[1]] = (Number(state[r2[1]]) || 0) - 1; return true; }
  if (r3) { state[r3[1]] = (Number(state[r3[1]]) || 0) + parseFloat(r3[2]); return true; }
  if (r4) { state[r4[1]] = (Number(state[r4[1]]) || 0) - parseFloat(r4[2]); return true; }
  if (r5) {
    let v = r5[2].trim();
    Object.keys(state).filter(k => !k.startsWith("__")).forEach(k => {
      v = v.replace(new RegExp(`\\b${k}\\b`, "g"),
        typeof state[k] === "string" ? `"${state[k]}"` : String(state[k]));
    });
    v = v.replace(/\bclock\b/g, String(clock));
    state[r5[1]] = safeEvalScalar(v);
    return true;
  }
  return false;
}

