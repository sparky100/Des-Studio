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
import { claimServerForEntity, releaseServerClaim, markEntityWaiting, clearWaitingState, selectWaiting, listWaiting } from "./entities.js";

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
    // Math functions: min(a,b), max(a,b), abs(a), round(a), floor(a), ceil(a)
    const rest = s.slice(i);
    const fnM  = rest.match(/^(min|max|abs|round|floor|ceil)\s*\(/i);
    if (fnM) {
      const fn = fnM[1].toLowerCase();
      i += fnM[0].length;
      const arg1 = parseAddSub();
      skipWS();
      let result;
      if (fn === 'abs' || fn === 'round' || fn === 'floor' || fn === 'ceil') {
        if (i < s.length && s[i] === ')') i++;
        result = Math[fn](arg1);
      } else {
        if (i < s.length && s[i] === ',') i++;
        const arg2 = parseAddSub();
        skipWS();
        if (i < s.length && s[i] === ')') i++;
        result = fn === 'min' ? Math.min(arg1, arg2) : Math.max(arg1, arg2);
      }
      return result;
    }
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
  const n = safeArithmetic(s);
  if (!isNaN(n)) return n;
  const direct = Number(s);
  if (!isNaN(direct) && s !== '') return direct;
  return s; // raw string fallback — matches previous behaviour for unresolved identifiers
}

// Evaluate an expression that may reference Entity.<attr>, state variables, clock,
// arithmetic operators (+,-,*,/), parentheses, and math functions (min,max,abs,round,floor,ceil).
// Never calls eval or new Function.
function evalEntityExpr(expr, { state, clock, entity }) {
  let s = String(expr).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  // Substitute Entity.attrName references
  s = s.replace(/\bEntity\.(\w+)\b/g, (_, attrName) => {
    const v = entity?.attrs?.[attrName];
    if (v === undefined) return '0';
    if (typeof v === 'string') return `"${v}"`;
    return String(+v || 0);
  });
  // Substitute state variables — longest names first to avoid partial replacement
  Object.keys(state || {})
    .filter(k => !k.startsWith('__'))
    .sort((a, b) => b.length - a.length)
    .forEach(k => {
      s = s.replace(new RegExp(`\\b${k}\\b`, 'g'),
        typeof state[k] === 'string' ? `"${state[k]}"` : String(state[k] ?? 0));
    });
  s = s.replace(/\bclock\b/g, String(clock));
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = safeArithmetic(s);
  if (!isNaN(n)) return n;
  const num = Number(s);
  if (!isNaN(num) && s !== '') return num;
  return s;
}

function normName(value) {
  return String(value || "").trim().toLowerCase();
}

function retireIdleExcessServers(ctx, serverTypeName) {
  const key = normName(serverTypeName);
  const desired = ctx.state?.__desiredServerCapacity?.[key];
  if (!Number.isInteger(desired)) return 0;

  const servers = ctx.entities.filter(e => e.role === "server" && normName(e.type) === key);
  let excess = servers.length - desired;
  let retired = 0;
  for (let i = ctx.entities.length - 1; i >= 0 && excess > 0; i--) {
    const entity = ctx.entities[i];
    if (
      entity.role === "server" &&
      normName(entity.type) === key &&
      entity.status === "idle" &&
      entity.currentCustId == null
    ) {
      ctx.entities.splice(i, 1);
      excess--;
      retired++;
    }
  }
  return retired;
}

function buildStageRecord(cust, srv, clock) {
  const waitStartedAt = cust.lastStageStart ?? cust.arrivalTime;
  const serviceStartedAt = cust.serviceStart ?? clock;
  return {
    serverType: srv?.type || "unknown",
    queueName: cust.lastQueue || cust.queue || null,
    waitStartedAt,
    serviceStartedAt,
    serviceEndedAt: clock,
    stageWait: +(cust.serviceStart != null
      ? (cust.serviceStart - waitStartedAt)
      : 0).toFixed(4),
    stageService: +(clock - serviceStartedAt).toFixed(4),
  };
}

function claimMatchesPair(customer, server) {
  if (!customer || !server) return false;

  const customerServerId = customer.serverId ?? customer.resourceClaim?.serverId ?? null;
  const serverCustomerId = server.currentCustId ?? server.resourceClaim?.customerId ?? null;

  if (customerServerId != null && customerServerId !== server.id) return false;
  if (serverCustomerId != null && serverCustomerId !== customer.id) return false;

  if (customer.resourceClaim?.customerId != null && customer.resourceClaim.customerId !== customer.id) return false;
  if (server.resourceClaim?.serverId != null && server.resourceClaim.serverId !== server.id) return false;

  if (customer.resourceClaim && server.resourceClaim) {
    if (customer.resourceClaim.customerId !== server.resourceClaim.customerId) return false;
    if (customer.resourceClaim.serverId !== server.resourceClaim.serverId) return false;
  }

  return true;
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
              const rerouted = { id, type: typeName, role: et?.role || "customer",
                queue: dest, attrs: sampleAttrs(et?.attrDefs || et?.attrs || "", ctx.rng),
                arrivalTime: clock, stages: [], lastStageStart: null, loopCount: 0 };
              markEntityWaiting(rerouted, clock, dest);
              entities.push(rerouted);
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
            const rerouted = { id, type: typeName, role: et?.role || "customer",
              queue: dest, attrs: sampleAttrs(et?.attrDefs || et?.attrs || "", ctx.rng),
              arrivalTime: clock, stages: [], lastStageStart: null, loopCount: 0 };
            markEntityWaiting(rerouted, clock, dest);
            entities.push(rerouted);
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
            const rerouted = { id, type: typeName, role: et?.role || "customer",
              queue: dest, attrs: sampleAttrs(et?.attrDefs || et?.attrs || "", ctx.rng),
              arrivalTime: clock, stages: [], lastStageStart: null, loopCount: 0 };
            markEntityWaiting(rerouted, clock, dest);
            entities.push(rerouted);
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
      const sampledAttrs = sampleAttrs(et?.attrDefs || et?.attrs || "", ctx.rng);
      const rowAttrs = felRef?._scheduleRowAttrs ?? null;
      const ent = {
        id,
        type:           typeName,
        role:           et?.role || "customer",
        queue:          queueName,
        attrs:          rowAttrs ? { ...sampledAttrs, ...rowAttrs } : sampledAttrs,
        arrivalTime:    clock,
        stages:         [],
        lastStageStart: null,
        loopCount:      0,
      };
      markEntityWaiting(ent, clock, queueName);
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
      const { entities, helpers, clock, setLastCustId, setLastSrvId, msgs, _arbitration } = ctx;
      const arbitrationTarget = _arbitration && typeof _arbitration === "object" ? _arbitration : null;

      const matchedQ = helpers.findQueueConfig?.(cType);
      const discipline = matchedQ?.discipline || 'FIFO';

      const filterFn = ctx.entityFilter
        ? (entity) => evaluatePredicate(ctx.entityFilter, { currentEntity: entity })
        : null;

      const candidates = listWaiting(cType, discipline, entities, filterFn, !!matchedQ);
      const allIdleServers = helpers.idleOf(sType) || [];

      const arbitration = {
        type: "server",
        serverType: sType,
        discipline,
        queueName: matchedQ ? cType : null,
        candidates: candidates.map(e => ({
          entityId: e.id,
          type: e.type,
          key: "arrivalTime",
          value: e.arrivalTime || 0,
        })),
        idleServers: allIdleServers.map(s => ({ serverId: s.id, type: s.type })),
      };

      const cust = candidates[0] ?? null;
      const srv = allIdleServers[0] ?? null;

      if (cust && srv) {
        const queuedAt = cust.queue;
        if (!claimServerForEntity(cust, srv, clock)) {
          msgs.push(`ASSIGN(${cType},${sType}): claim failed`);
          return;
        }
        cust.lastQueue     = queuedAt ?? cust.lastQueue;
        cust.ceventName    = ctx.ceventName;
        setLastCustId(cust.id);
        setLastSrvId(srv.id);
        arbitration.winner = { entityId: cust.id, serverId: srv.id };
        arbitration.losers = candidates
          .filter(e => e.id !== cust.id)
          .map(e => ({ entityId: e.id, reason: "lower priority or later arrival" }));
        if (arbitrationTarget) Object.assign(arbitrationTarget, arbitration);
        msgs.push(
          `#${cust.id} (${cType}) → serving by #${srv.id} (${sType}) ` +
          `[waited ${(clock - cust.arrivalTime).toFixed(3)} t]`
        );
      } else {
        arbitration.noMatch = true;
        arbitration.candidateCount = candidates.length;
        arbitration.idleServerCount = allIdleServers.length;
        if (arbitrationTarget) Object.assign(arbitrationTarget, arbitration);
        msgs.push(`ASSIGN(${cType},${sType}): no match — queue=${candidates.length} idle=${allIdleServers.length}`);
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

      if (!cust) {
        msgs.push(`COMPLETE skipped — context customer #${custId ?? "?"} not found`);
        return;
      }
      if (cust.status !== "serving" && !(cust.role === "batch" && cust.status === "waiting")) {
        msgs.push(`COMPLETE skipped — #${cust.id} is ${cust.status}, not serving`);
        return;
      }
      if (cust.status === "serving") {
        if (!srv) {
          msgs.push(`COMPLETE skipped — #${cust.id} has no matching busy server`);
          return;
        }
        if (!claimMatchesPair(cust, srv)) {
          msgs.push(`COMPLETE skipped — stale or contradictory claim for customer #${cust.id} and server #${srv.id}`);
          return;
        }
      }

      if (cust.status === "serving" || cust.role === "batch") {
        if (!cust.stages) cust.stages = [];
        cust.stages.push(buildStageRecord(cust, srv, clock));
        clearWaitingState(cust);
        cust.status        = "done";
        cust.completionTime = clock;
        cust.sojournTime    = +(clock - cust.arrivalTime).toFixed(4);
        state.__served      = (state.__served || 0) + 1;
        msgs.push(`#${cust.id} done [sojourn ${cust.sojournTime.toFixed(2)} t, ${cust.stages.length} stage(s)]`);
      }
      if (srv) {
        releaseServerClaim(cust, srv);
        msgs.push(`Server #${srv.id} → idle`);
        const retired = retireIdleExcessServers(ctx, srv.type);
        if (retired > 0) {
          msgs.push(`Server capacity reconciliation: retired ${retired} idle ${srv.type} server(s)`);
        }
      }
      // Release any auxiliary servers that were co-seized with this customer (COSEIZE pattern).
      // They have currentCustId pointing to the now-done customer but were not tracked in
      // the primary server context, so COMPLETE would otherwise leave them permanently busy.
      const auxiliaryBusy = entities.filter(e =>
        e.role === "server" &&
        e.currentCustId === cust.id &&
        e.id !== srv?.id &&
        (e.status === "busy" || e.status === "serving")
      );
      for (const auxSrv of auxiliaryBusy) {
        releaseServerClaim(null, auxSrv);
        msgs.push(`Server #${auxSrv.id} (${auxSrv.type}) → idle (COSEIZE release)`);
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
        if (!claimMatchesPair(cust, srv)) {
          msgs.push(`RELEASE(${srvType}) skipped — stale or contradictory claim for customer #${cust.id} and server #${srv.id}`);
          return;
        }
        if (!cust.stages) cust.stages = [];
        cust.stages.push(buildStageRecord(cust, srv, clock));
        cust.lastStageStart = clock;
        markEntityWaiting(cust, clock, targetQueue || cust.lastQueue || cust.queue);
        delete cust.serviceStart;
        releaseServerClaim(cust, srv);
        const retired = retireIdleExcessServers(ctx, srv.type);
        msgs.push(`#${cust.id} released → waiting [queue: ${cust.queue}, stage ${cust.stages.length} done, srv #${srv.id} idle]`);
        if (retired > 0) {
          msgs.push(`Server capacity reconciliation: retired ${retired} idle ${srv.type} server(s)`);
        }
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
        clearWaitingState(ent);
        ent.status     = "reneged";
        ent.renegeTime = clock;
        state.__reneged = (state.__reneged || 0) + 1;
        msgs.push(`#${ent.id} reneged after ${(clock - ent.arrivalTime).toFixed(3)} t`);
      } else if (ent) {
        msgs.push(`RENEGE skipped — #${id} already ${ent.status}`);
      }
    },
  },

  // ── BATCH(QueueName, batchSize|Entity.attrName) — C-Event macro ────────────
  // batchSize can be:
  //   - A literal integer: BATCH(QueueName, 5)
  //   - An entity attribute reference: BATCH(QueueName, Entity.batchSize)
  //     Reads the attribute from the first waiting entity in the queue
  {
    name:    "BATCH",
    pattern: /^BATCH\(([^,)]+)\s*,\s*(.+)\)$/i,
    apply(match, ctx) {
      const queueName = match[1].trim();
      const batchSizeArg = match[2].trim();
      const { entities, model, clock, msgs, setLastCustId, helpers, nextId } = ctx;

      const qDef = (model.queues || []).find(
        q => q.name?.trim().toLowerCase() === queueName.trim().toLowerCase()
      );
      if (!qDef) {
        msgs.push(`BATCH(${queueName},${batchSizeArg}): queue not found`);
        return;
      }
      const discipline = qDef.discipline || 'FIFO';

      const candidates = listWaiting(queueName, discipline, entities, null, true, false);

      // Resolve batch size: literal number or entity attribute reference
      let batchSize;
      const attrMatch = batchSizeArg.match(/^Entity\.(\w+)$/i);
      if (attrMatch) {
        const attrName = attrMatch[1];
        if (candidates.length === 0) {
          msgs.push(`BATCH(${queueName},${batchSizeArg}): no waiting entities to read attribute from`);
          return;
        }
        const firstEntity = candidates[0];
        const attrValue = firstEntity.attrs?.[attrName];
        if (attrValue == null) {
          msgs.push(`BATCH(${queueName},${batchSizeArg}): entity has no '${attrName}' attribute`);
          return;
        }
        batchSize = parseInt(attrValue, 10);
        if (!Number.isInteger(batchSize) || batchSize < 1) {
          msgs.push(`BATCH(${queueName},${batchSizeArg}): invalid batch size '${attrValue}' (must be integer >= 1)`);
          return;
        }
      } else {
        batchSize = parseInt(batchSizeArg, 10);
        if (!Number.isInteger(batchSize) || batchSize < 1) {
          msgs.push(`BATCH(${queueName},${batchSizeArg}): invalid batch size (must be integer >= 1)`);
          return;
        }
      }

      if (candidates.length < batchSize) {
        msgs.push(`BATCH(${queueName},${batchSize}): only ${candidates.length} waiting — insufficient`);
        return;
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
      markEntityWaiting(parent, clock, queueName);
      entities.push(parent);
      setLastCustId(parentId);
      msgs.push(`BATCH: #${ids.join(', #')} → batch #${parentId} in "${queueName}" (size=${batchSize})`);
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
          lastStageStart: clock,
        };
        markEntityWaiting(restored, clock, targetQueue);
        entities.push(restored);
        childIds.push(child.id);
      }

      clearWaitingState(parent);
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
      const { helpers, entities, state, clock, msgs } = ctx;
      const cType = match[1].trim();
      const matchedQ = helpers.findQueueConfig?.(cType);
      const discipline = matchedQ?.discipline || 'FIFO';
      const ent = selectWaiting(cType, discipline, entities, null, !!matchedQ);
      if (ent) {
        clearWaitingState(ent);
        ent.status     = "reneged";
        ent.renegeTime = clock;
        state.__reneged = (state.__reneged || 0) + 1;
        msgs.push(`#${ent.id} (${cType}) reneged after ${(clock - ent.arrivalTime).toFixed(3)} t`);
      }
    },
  },

  // ── FILL(ContainerName, amount) — B-event macro ───────────────────────────
  // Adds `amount` to a named container level; clamps to capacity.
  {
    name:    "FILL",
    pattern: /^FILL\(([^,)]+)\s*,\s*([^)]+)\)$/i,
    apply(match, ctx) {
      const cName  = match[1].trim();
      const amount = parseFloat(match[2].trim());
      const { state, clock, msgs } = ctx;
      const key    = `__container_${cName}`;
      const capKey = `__containerCap_${cName}`;
      if (!(key in state)) {
        msgs.push(`FILL(${cName}): container '${cName}' not declared in containerTypes`);
        return;
      }
      if (isNaN(amount) || amount <= 0) {
        msgs.push(`FILL(${cName},${match[2].trim()}): amount must be a positive number`);
        return;
      }
      // Flush time-integral before changing level
      const prev  = state[`__containerPrev_${cName}`] ?? clock;
      state[`__containerIntegral_${cName}`] =
        (state[`__containerIntegral_${cName}`] ?? 0) + state[key] * Math.max(0, clock - prev);
      state[`__containerPrev_${cName}`] = clock;

      const cap      = state[capKey] ?? Infinity;
      const newLevel = Math.min(state[key] + amount, cap);
      state[key] = newLevel;
      if (newLevel < (state[`__containerMin_${cName}`] ?? newLevel)) state[`__containerMin_${cName}`] = newLevel;
      if (newLevel > (state[`__containerMax_${cName}`] ?? newLevel)) state[`__containerMax_${cName}`] = newLevel;
      msgs.push(`FILL(${cName},${amount}): level → ${newLevel.toFixed(4)}${newLevel >= cap ? ' [at capacity]' : ''}`);
      ctx.trace?.push?.({ event: "Fill", container: cName, amount, level: newLevel, time: clock });
    },
  },

  // ── DRAIN(ContainerName, amount) — C-event macro ──────────────────────────
  // Guard: level >= amount. Subtracts amount from container level.
  {
    name:    "DRAIN",
    pattern: /^DRAIN\(([^,)]+)\s*,\s*([^)]+)\)$/i,
    apply(match, ctx) {
      const cName  = match[1].trim();
      const amount = parseFloat(match[2].trim());
      const { state, clock, msgs } = ctx;
      const key = `__container_${cName}`;
      if (!(key in state)) {
        msgs.push(`DRAIN(${cName}): container '${cName}' not declared in containerTypes`);
        return;
      }
      if (isNaN(amount) || amount <= 0) {
        msgs.push(`DRAIN(${cName},${match[2].trim()}): amount must be a positive number`);
        return;
      }
      if (state[key] < amount) {
        msgs.push(`DRAIN(${cName},${amount}): guard failed — level ${state[key].toFixed(4)} < ${amount}`);
        return;
      }
      // Flush time-integral before changing level
      const prev = state[`__containerPrev_${cName}`] ?? clock;
      state[`__containerIntegral_${cName}`] =
        (state[`__containerIntegral_${cName}`] ?? 0) + state[key] * Math.max(0, clock - prev);
      state[`__containerPrev_${cName}`] = clock;

      const newLevel = state[key] - amount;
      state[key] = newLevel;
      if (newLevel < (state[`__containerMin_${cName}`] ?? newLevel)) state[`__containerMin_${cName}`] = newLevel;
      if (newLevel > (state[`__containerMax_${cName}`] ?? newLevel)) state[`__containerMax_${cName}`] = newLevel;
      msgs.push(`DRAIN(${cName},${amount}): level → ${newLevel.toFixed(4)}`);
      ctx.trace?.push?.({ event: "Drain", container: cName, amount, level: newLevel, time: clock });
    },
  },

  // ── PREEMPT(ServerType) ────────────────────────────────────────────────────
  // Interrupts a busy server, re-queues the current customer with remaining service
  {
    name:    "PREEMPT",
    pattern: /^PREEMPT\(([^,)]+)\)$/i,
    apply(match, ctx) {
      const sType = match[1].trim();
      const { entities, clock, helpers, msgs, _arbitration } = ctx;
      const key = normName(sType);

      const busyServers = entities.filter(e =>
        e.role === "server" && normName(e.type) === key && (e.status === "busy" || e.status === "serving")
      );

      if (busyServers.length === 0) {
        msgs.push(`PREEMPT(${sType}): no busy server found`);
        return;
      }

      const srv = busyServers[0];
      const custId = srv.currentCustId;
      const cust = entities.find(e => e.id === custId);

      if (!cust) {
        msgs.push(`PREEMPT(${sType}): server #${srv.id} has no customer`);
        return;
      }

      const scheduledDuration = srv._scheduledDuration || 0;
      const remainingService = Math.max(0, scheduledDuration - (clock - (cust.serviceStart ?? clock)));
      cust._remainingService = remainingService;

      releaseServerClaim(cust, srv);
      clearWaitingState(cust);
      markEntityWaiting(cust, clock, cust.lastQueue || cust.queue);

      if (_arbitration && typeof _arbitration === "object") {
        Object.assign(_arbitration, {
          type: "preemption",
          serverType: sType,
          serverId: srv.id,
          preemptedEntity: cust.id,
          remainingService: +remainingService.toFixed(4),
        });
      }

      msgs.push(
        `PREEMPT: server #${srv.id} (${sType}) interrupted #${cust.id} ` +
        `[remaining ${remainingService.toFixed(3)} t] → re-queued`
      );
    },
  },

  // ── FAIL(ServerType) ───────────────────────────────────────────────────────
  // Sets matching servers to failed state; busy servers' customers re-queued
  {
    name:    "FAIL",
    pattern: /^FAIL\(([^,)]+)\)$/i,
    apply(match, ctx) {
      const sType = match[1].trim();
      const { entities, clock, helpers, msgs } = ctx;
      const key = normName(sType);

      const servers = entities.filter(e =>
        e.role === "server" && normName(e.type) === key && (e.status === "busy" || e.status === "serving" || e.status === "idle")
      );

      let failedCount = 0;
      for (const srv of servers) {
        if (srv.status === "busy" || srv.status === "serving") {
          const custId = srv.currentCustId;
          const cust = entities.find(e => e.id === custId);
          if (cust) {
            const scheduledDuration = srv._scheduledDuration || 0;
            const remainingService = Math.max(0, scheduledDuration - (clock - (cust.serviceStart ?? clock)));
            cust._remainingService = remainingService;
            releaseServerClaim(cust, srv);
            clearWaitingState(cust);
            markEntityWaiting(cust, clock, cust.lastQueue || cust.queue);
            msgs.push(`FAIL: server #${srv.id} (${sType}) failed — #${cust.id} re-queued [remaining ${remainingService.toFixed(3)} t]`);
          }
        }
        srv.status = "failed";
        srv._failedAt = clock;
        failedCount++;
      }

      if (failedCount === 0) {
        msgs.push(`FAIL(${sType}): no matching servers found`);
      } else {
        msgs.push(`FAIL: ${failedCount} ${sType} server(s) set to failed`);
      }
    },
  },

  // ── REPAIR(ServerType) ─────────────────────────────────────────────────────
  // Sets failed servers back to idle
  {
    name:    "REPAIR",
    pattern: /^REPAIR\(([^,)]+)\)$/i,
    apply(match, ctx) {
      const sType = match[1].trim();
      const { entities, clock, msgs } = ctx;
      const key = normName(sType);

      const failedServers = entities.filter(e =>
        e.role === "server" && normName(e.type) === key && e.status === "failed"
      );

      let repairedCount = 0;
      for (const srv of failedServers) {
        const failedAt = srv._failedAt;
        srv.status = "idle";
        srv._failedAt = undefined;
        srv._downtime = failedAt != null ? +(clock - failedAt).toFixed(4) : 0;
        repairedCount++;
      }

      if (repairedCount === 0) {
        msgs.push(`REPAIR(${sType}): no failed servers found`);
      } else {
        msgs.push(`REPAIR: ${repairedCount} ${sType} server(s) restored to idle`);
      }
    },
  },

  // ── SPLIT(EntityType, N, TargetQueue) ──────────────────────────────────────
  // Creates N-1 clones of the context entity, all placed in TargetQueue
  {
    name:    "SPLIT",
    pattern: /^SPLIT\(([^,)]+)\s*,\s*(\d+)\s*,\s*([^,)]+)\)$/i,
    apply(match, ctx) {
      const entityType = match[1].trim();
      const n = parseInt(match[2], 10);
      const targetQueue = match[3].trim();
      const { entities, clock, nextId, msgs, setLastCustId } = ctx;

      const custId = ctx.felRef?._contextCustId ?? ctx.getLastCustId?.();
      const cust = entities.find(e => e.id === custId);

      if (!cust) {
        msgs.push(`SPLIT(${entityType},${n},${targetQueue}): no context entity found`);
        return;
      }

      if (n < 2) {
        msgs.push(`SPLIT(${entityType},${n},${targetQueue}): N must be >= 2`);
        return;
      }

      const childIds = [];
      for (let i = 1; i < n; i++) {
        const childId = nextId();
        const child = {
          id: childId,
          type: entityType,
          role: "customer",
          status: "waiting",
          arrivalTime: clock,
          attrs: { ...cust.attrs },
          queue: targetQueue,
          lastQueue: targetQueue,
          stages: [],
          loopCount: 0,
          _splitFrom: cust.id,
          _splitIndex: i,
        };
        markEntityWaiting(child, clock, targetQueue);
        entities.push(child);
        childIds.push(childId);
      }

      cust._splitParent = true;
      cust._splitChildren = childIds;
      setLastCustId?.(cust.id);

      msgs.push(`SPLIT: #${cust.id} → ${n - 1} clones [${childIds.map(id => `#${id}`).join(', ')}] → "${targetQueue}"`);
    },
  },

  // ── COSEIZE(Queue, ServerType1, ServerType2[, ...]) ────────────────────────
  // Seizes one customer and multiple server types simultaneously
  {
    name:    "COSEIZE",
    pattern: /^COSEIZE\(([^,)]+)\s*,\s*(.+)\)$/i,
    apply(match, ctx) {
      const queueName = match[1].trim();
      const serverTypes = match[2].split(",").map(s => s.trim());
      const { entities, helpers, clock, setLastCustId, setLastSrvId, msgs } = ctx;

      const discipline = helpers.findQueueConfig?.(queueName)?.discipline || "FIFO";
      const queueCandidates = helpers.waitingInQueue?.(queueName, discipline) || [];
      const cust = queueCandidates[0];

      if (!cust) {
        msgs.push(`COSEIZE(${queueName}, ${serverTypes.join(', ')}): no waiting customer in "${queueName}"`);
        return;
      }

      const idleServersByType = {};
      for (const sType of serverTypes) {
        const idle = helpers.idleOf(sType) || [];
        if (idle.length === 0) {
          msgs.push(`COSEIZE(${queueName}, ${serverTypes.join(', ')}): no idle ${sType}`);
          return;
        }
        idleServersByType[sType] = idle[0];
      }

      // Claim all servers atomically — first uses claimServerForEntity (sets customer to serving),
      // subsequent servers get auxiliary claims without re-checking customer status.
      const serverEntries = Object.entries(idleServersByType);
      const primarySrv = serverEntries[0][1];
      if (!claimServerForEntity(cust, primarySrv, clock)) {
        msgs.push(`COSEIZE: claim failed for ${serverEntries[0][0]} #${primarySrv.id}`);
        return;
      }

      for (let i = 1; i < serverEntries.length; i++) {
        const [sType, srv] = serverEntries[i];
        srv.status = "busy";
        srv.currentCustId = cust.id;
        srv.resourceClaim = {
          customerId: cust.id,
          customerType: cust.type,
          serverId: srv.id,
          serverType: srv.type,
          queueName: queueName,
          claimedAt: clock,
        };
      }

      cust.lastQueue = queueName;
      cust.ceventName = ctx.ceventName;
      setLastCustId(cust.id);
      const srvIds = Object.values(idleServersByType).map(s => s.id);
      setLastSrvId(srvIds[0]);

      const serverDesc = Object.entries(idleServersByType)
        .map(([type, srv]) => `#${srv.id} (${type})`)
        .join(', ');
      msgs.push(
        `#${cust.id} → serving by ${serverDesc} ` +
        `[waited ${(clock - cust.arrivalTime).toFixed(3)} t]`
      );
    },
  },

  // ── MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue) ───────────────────────
  // Waits for one entity from each queue, pairs them, routes to TargetQueue
  {
    name:    "MATCH",
    pattern: /^MATCH\(([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^,)]+)\)$/i,
    apply(match, ctx) {
      const typeA = match[1].trim();
      const queueA = match[2].trim();
      const typeB = match[3].trim();
      const queueB = match[4].trim();
      const targetQueue = match[5].trim();
      const { entities, helpers, clock, msgs, nextId } = ctx;

      const disciplineA = helpers.findQueueConfig?.(queueA)?.discipline || "FIFO";
      const disciplineB = helpers.findQueueConfig?.(queueB)?.discipline || "FIFO";

      const candidatesA = helpers.waitingInQueue?.(queueA, disciplineA) || [];
      const candidatesB = helpers.waitingInQueue?.(queueB, disciplineB) || [];

      const entityA = candidatesA[0];
      const entityB = candidatesB[0];

      if (!entityA || !entityB) {
        msgs.push(`MATCH(${typeA},${queueA},${typeB},${queueB},${targetQueue}): no match — A=${candidatesA.length} B=${candidatesB.length}`);
        return;
      }

      const parentId = nextId();
      const parent = {
        id: parentId,
        type: `${typeA}+${typeB}`,
        role: "batch",
        status: "waiting",
        arrivalTime: clock,
        attrs: { ...entityA.attrs, ...entityB.attrs },
        queue: targetQueue,
        lastQueue: targetQueue,
        stages: [],
        loopCount: 0,
        _matchedFrom: [entityA.id, entityB.id],
      };
      entities.push(parent);

      clearWaitingState(entityA);
      entityA.status = "done";
      entityA.completionTime = clock;
      entityA._matchedInto = parentId;

      clearWaitingState(entityB);
      entityB.status = "done";
      entityB.completionTime = clock;
      entityB._matchedInto = parentId;

      msgs.push(`MATCH: #${entityA.id} (${typeA}) + #${entityB.id} (${typeB}) → #${parentId} → "${targetQueue}"`);
    },
  },

  // ── SET(varName, expr) ────────────────────────────────────────────────────
  // Updates a state variable using a safe arithmetic expression.
  // expr may reference: Entity.<attr>, state variables, clock,
  // arithmetic (+,-,*,/), parentheses, and math functions
  // (min(a,b), max(a,b), abs(a), round(a), floor(a), ceil(a)).
  {
    name:    "SET",
    pattern: /^SET\((\w+)\s*,\s*(.+)\)$/i,
    apply(match, ctx) {
      const varName = match[1].trim();
      const expr    = match[2].trim();
      const { state, clock, entities, getLastCustId, msgs } = ctx;
      const custId  = getLastCustId();
      const entity  = custId != null ? entities.find(e => e.id === custId) : null;
      const value   = evalEntityExpr(expr, { state, clock, entity });
      state[varName] = value;
      msgs.push(`SET ${varName} = ${value}`);
    },
  },

  // ── SET_ATTR(attrName, expr) / SET_ATTR(Entity.attrName, expr) ────────────
  // Mutates an attribute on the current context entity.
  // expr may reference: Entity.<attr>, state variables, clock,
  // arithmetic (+,-,*,/), parentheses, and math functions.
  {
    name:    "SET_ATTR",
    pattern: /^SET_ATTR\((?:Entity\.)?(\w+)\s*,\s*(.+)\)$/i,
    apply(match, ctx) {
      const attrName = match[1].trim();
      const expr     = match[2].trim();
      const { state, clock, entities, getLastCustId, msgs } = ctx;
      const custId   = getLastCustId();
      const entity   = custId != null ? entities.find(e => e.id === custId) : null;
      if (!entity) {
        msgs.push(`SET_ATTR(${attrName}): no context entity — use after ARRIVE, ASSIGN, or COSEIZE`);
        return;
      }
      if (!entity.attrs) entity.attrs = {};
      const value = evalEntityExpr(expr, { state, clock, entity });
      entity.attrs[attrName] = value;
      msgs.push(`SET_ATTR #${entity.id}.${attrName} = ${value}`);
    },
  },

  // ── COST(expr) ────────────────────────────────────────────────────────────
  // Accumulates a cost amount to state.__totalCost. Uses the same safe
  // arithmetic evaluator as SET/SET_ATTR — supports Entity.attr, state vars,
  // clock, +−×÷, and math functions (min/max/abs/round/floor/ceil).
  {
    name:    "COST",
    pattern: /^COST\((.+)\)$/i,
    apply(match, ctx) {
      const { state, clock, entities, felRef, getLastCustId, msgs } = ctx;
      const expr   = match[1].trim();
      const custId = felRef?._contextCustId ?? getLastCustId();
      const entity = custId != null ? entities.find(e => e.id === custId) : null;
      const amount = evalEntityExpr(expr, { state, clock, entity });
      if (!Number.isFinite(amount)) {
        msgs.push(`COST: expression "${expr}" did not evaluate to a finite number (got ${amount})`);
        return;
      }
      state.__totalCost = (state.__totalCost || 0) + amount;
      msgs.push(`COST += ${amount.toFixed(4)} (total ${state.__totalCost.toFixed(4)})`);
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

