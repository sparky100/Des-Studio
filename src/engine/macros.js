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
import { claimServerForEntity, releaseServerClaim, clearWaitingState, selectWaiting, listWaiting, preemptCustomer, repairServers, attemptQueueJoin, indexRemove, indexAdd, indexRemoveServer, indexBucket, indexTrackEntity, indexUntrackEntity, findEntityById } from "./entities.js";

// ── Private helpers shared across multiple macros ────────────────────────────

function resolveScalarString(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  if (s === 'true')  return true;
  if (s === 'false') return false;
  const n = safeArithmetic(s);
  if (!isNaN(n)) return n;
  const num = Number(s);
  if (!isNaN(num) && s !== '') return num;
  return s;
}

function flushContainerIntegral(state, clock, cName) {
  const key  = `__container_${cName}`;
  const prev = state[`__containerPrev_${cName}`] ?? clock;
  state[`__containerIntegral_${cName}`] =
    (state[`__containerIntegral_${cName}`] ?? 0) + state[key] * Math.max(0, clock - prev);
  state[`__containerPrev_${cName}`] = clock;
}

function updateContainerMinMax(state, cName, newLevel) {
  const minKey = `__containerMin_${cName}`;
  const maxKey = `__containerMax_${cName}`;
  if (newLevel < (state[minKey] ?? newLevel)) state[minKey] = newLevel;
  if (newLevel > (state[maxKey] ?? newLevel)) state[maxKey] = newLevel;
}


function resolveContextEntity(ctx) {
  const custId = ctx.getLastCustId();
  return custId != null ? findEntityById(ctx.index, ctx.entities, custId) : null;
}

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
  return resolveScalarString(v.trim());
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
  return resolveScalarString(s.trim());
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
      indexRemoveServer(ctx.index, entity);
      indexUntrackEntity(ctx.index, entity);
      excess--;
      retired++;
    }
  }
  return retired;
}

export function buildStageRecord(cust, srv, clock) {
  const waitStartedAt = cust.lastStageStart ?? cust.arrivalTime;
  const serviceStartedAt = cust.serviceStart ?? null;
  const wait = serviceStartedAt != null
    ? Math.max(0, serviceStartedAt - waitStartedAt)
    : Math.max(0, clock - waitStartedAt);
  const svc = serviceStartedAt != null
    ? Math.max(0, clock - serviceStartedAt)
    : 0;
  return {
    serverType: srv?.type || (cust._isDelay ? "delay" : "unknown"),
    queueName: cust.lastQueue || cust.queue || null,
    waitStartedAt,
    serviceStartedAt: serviceStartedAt ?? clock,
    serviceEndedAt: clock,
    stageWait:  +wait.toFixed(4),
    stageService: +svc.toFixed(4),
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

function setOutcome(entity, { status, routeId, routeLabel, endedBy, endedAt, sourceEventId = null, sourceEventName = null }) {
  if (!entity) return;
  entity.outcome = {
    status,
    routeId,
    routeLabel,
    endedBy,
    endedAt,
    ...(sourceEventId ? { sourceEventId } : {}),
    ...(sourceEventName ? { sourceEventName } : {}),
  };
}

export const MACROS = [

  // ── ARRIVE(Type[, QueueName]) ──────────────────────────────────────────────
  {
    name:    "ARRIVE",
    pattern: /^ARRIVE\(([^,)]+)(?:\s*,\s*([^,)]+))?\)$/i,
    apply(match, ctx) {
      const typeName  = match[1].trim();
      const queueName = match[2]?.trim() || (typeName + "Queue");
      const { model, clock, helpers, msgs, felRef } = ctx;
      const et = (model.entityTypes || []).find(
        e => e.name.trim().toLowerCase() === typeName.trim().toLowerCase()
      );

      // ── Construct the entity, then run it through the centralized join
      // check (F11.1/F11.2/F11.3) — balking/capacity/overflow are normally
      // configured on the Queue itself; the B-event-level balkCondition/
      // balkProbability fallback below exists only for legacy models authored
      // before balking moved to the Queue (pre-migration / hand-edited JSON).
      const id = ctx.nextId();
      const sampledAttrs = sampleAttrs(et?.attrDefs || et?.attrs || "", ctx.rng);
      const rowAttrs = felRef?._scheduleRowAttrs ?? null;
      const ent = {
        id,
        type:           typeName,
        role:           et?.role || "customer",
        attrs:          rowAttrs ? { ...sampledAttrs, ...rowAttrs } : sampledAttrs,
        arrivalTime:    clock,
        stages:         [],
        lastStageStart: null,
        loopCount:      0,
        _plannedTime:   felRef?._plannedArrivalTime ?? undefined,
      };

      const joined = attemptQueueJoin(ent, queueName, clock, ctx, {
        legacyBalkCondition:  felRef?.balkCondition,
        legacyBalkProbability: felRef?.balkProbability,
      });
      if (joined) {
        const depth = ctx.index ? indexBucket(ctx.index, queueName).length : helpers.waitingOf(typeName).length;
        msgs.push(`#${id} (${typeName}) arrived → waiting [queue: ${queueName}, depth: ${depth}]`);
      }
    },
  },

// ── ASSIGN(CustomerType|QueueName, ServerType[, "Skill"|Entity.attrName]) ───────
  // Optional 3rd parameter: a skill name (quoted string) OR Entity.attrName
  // (unquoted, resolves from the entity's attribute at runtime). When a skill is
  // specified, only idle servers whose server type has that skill are considered.
  // When Entity.attrName is used, the skill is read from the first waiting entity;
  // if the attribute is null/empty, no skill filter is applied.
  {
    name:    "ASSIGN",
    pattern: /^ASSIGN\(([^,)]+)\s*,\s*([^,)]+)(?:\s*,\s*"([^"]+)"|\s*,\s*Entity\.(\w+))?\)$/i,
    apply(match, ctx) {
      const cType = match[1].trim();
      const sType = match[2].trim();
      const skillLiteral = match[3] ? match[3].trim() : null;
      const skillAttrName = match[4] ? match[4].trim() : null;
      const { entities, helpers, clock, setLastCustId, setLastSrvId, msgs, _arbitration } = ctx;
      const arbitrationTarget = _arbitration && typeof _arbitration === "object" ? _arbitration : null;

      const matchedQ = helpers.findQueueConfig?.(cType);
      const discipline = matchedQ?.discipline || 'FIFO';
      const queueToken = matchedQ ? matchedQ.name : cType;

      const filterFn = ctx.entityFilter
        ? (entity) => evaluatePredicate(ctx.entityFilter, { currentEntity: entity })
        : null;

      const candidates = listWaiting(queueToken, discipline, entities, filterFn, !!matchedQ, true, ctx.index);
      const allIdleServers = helpers.idleOf(sType) || [];

      const cust = candidates[0] ?? null;

      // Resolve skill: literal takes precedence, otherwise resolve from entity attribute
      let skill = skillLiteral;
      if (!skill && skillAttrName && cust) {
        const raw = cust.attrs?.[skillAttrName];
        skill = (raw !== null && raw !== undefined && raw !== '') ? String(raw) : null;
      }

      // Filter by skill
      const idleServers = skill
        ? allIdleServers.filter(s => helpers.hasSkillType(s.type, skill))
        : allIdleServers;

      const arbitration = {
        type: "server",
        serverType: sType,
        skill: skill || undefined,
        discipline,
        queueName: matchedQ ? queueToken : null,
        candidates: candidates.map(e => ({
          entityId: e.id,
          type: e.type,
          key: "arrivalTime",
          value: e.arrivalTime || 0,
        })),
        idleServers: idleServers.map(s => ({ serverId: s.id, type: s.type, skill: skill || undefined })),
      };

      const srv = idleServers[0] ?? null;

      if (cust && srv) {
        const queuedAt = cust.queue;
        if (!claimServerForEntity(cust, srv, clock, ctx.index, ctx, skill)) {
          msgs.push(`ASSIGN(${cType},${sType}): claim failed`);
          return;
        }
        cust.lastQueue     = queuedAt ?? cust.lastQueue;
        cust.ceventName    = ctx.ceventName;
        setLastCustId(cust.id);
        setLastSrvId(srv.id);
        arbitration.winner = { entityId: cust.id, serverId: srv.id, skill: skill || undefined, skillSource: skillAttrName || undefined };
        arbitration.losers = candidates
          .filter(e => e.id !== cust.id)
          .map(e => ({ entityId: e.id, reason: "lower priority or later arrival" }));
        if (arbitrationTarget) Object.assign(arbitrationTarget, arbitration);
        const skillSuffix = skill ? ` (skill: ${skill}${skillAttrName ? ` ← Entity.${skillAttrName}` : ''})` : '';
        msgs.push(
          `#${cust.id} (${cType}) → serving by #${srv.id} (${sType})${skillSuffix} ` +
          `[waited ${(clock - cust.arrivalTime).toFixed(3)} t]`
        );
      } else {
        arbitration.noMatch = true;
        arbitration.candidateCount = candidates.length;
        arbitration.idleServerCount = allIdleServers.length;
        if (arbitrationTarget) Object.assign(arbitrationTarget, arbitration);
        const skillSuffix = skill ? ` (skill: ${skill})` : '';
        msgs.push(`ASSIGN(${cType},${sType}): no match — queue=${candidates.length} idle=${allIdleServers.length}${skillSuffix}`);
      }
    },
  },

// ── DELAY(QueueName) — resource-free activity ──────────────────────────────
// Removes entity from queue and marks it as serving without claiming any server.
// The C-Event cSchedules mechanism provides the delay duration; the completion
// B-Event handles routing via the standard conditional/probabilistic routing table.
  {
    name:    "DELAY",
    pattern: /^DELAY\(([^,)]+)\)$/i,
    apply(match, ctx) {
      const queueToken = match[1].trim();
      const { entities, helpers, clock, setLastCustId, msgs } = ctx;

      const matchedQ   = helpers.findQueueConfig?.(queueToken);
      const discipline = matchedQ?.discipline || 'FIFO';
      const token      = matchedQ ? matchedQ.name : queueToken;

      const filterFn = ctx.entityFilter
        ? (entity) => evaluatePredicate(ctx.entityFilter, { currentEntity: entity })
        : null;

      // DELAY has no server capacity — all waiting entities start simultaneously.
      // Process every entity in the queue in one Phase C invocation so N entities
      // need 1 pass rather than N passes.
      const waiting = listWaiting(token, discipline, entities, filterFn, !!matchedQ, true, ctx.index);

      if (waiting.length > 0) {
        const delayedIds = [];
        for (const cust of waiting) {
          const queuedAt = cust.queue;
          clearWaitingState(cust, ctx.index);
          cust.status       = "serving";
          cust.serviceStart = clock;
          cust.lastQueue    = queuedAt ?? cust.lastQueue;
          cust.ceventName   = ctx.ceventName;
          cust._isDelay     = true;
          delete cust.queue;
          delayedIds.push(cust.id);
          msgs.push(
            `#${cust.id} (${cust.type}) → delay [queue: ${token}, waited ${(clock - cust.arrivalTime).toFixed(3)} t]`
          );
        }
        setLastCustId(delayedIds[0]);
        ctx._delayedCustIds = delayedIds;
      } else {
        msgs.push(`DELAY(${queueToken}): no entity waiting`);
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
      const cust   = findEntityById(ctx.index, entities, custId);
      const srv    = findEntityById(ctx.index, entities, srvId);

      if (!cust) {
        msgs.push(`COMPLETE skipped — context customer #${custId ?? "?"} not found`);
        return;
      }
      if (cust.status !== "serving" && !(cust.role === "batch" && cust.status === "waiting")) {
        msgs.push(`COMPLETE skipped — #${cust.id} is ${cust.status}, not serving`);
        return;
      }
      if (cust.status === "serving") {
        if (!srv && !cust._isDelay) {
          msgs.push(`COMPLETE skipped — #${cust.id} has no matching busy server`);
          return;
        }
        if (srv && !claimMatchesPair(cust, srv)) {
          msgs.push(`COMPLETE skipped — stale or contradictory claim for customer #${cust.id} and server #${srv.id}`);
          return;
        }
      }

      if (cust.status === "serving" || cust.role === "batch") {
        if (!cust.stages) cust.stages = [];
        cust.stages.push(buildStageRecord(cust, srv, clock));
        clearWaitingState(cust, ctx.index);
        cust.status        = "done";
        cust.completionTime = clock;
        cust.sojournTime    = +(clock - cust.arrivalTime).toFixed(4);
        setOutcome(cust, {
          status: "completed",
          routeId: `event:${felRef?.id || felRef?.name || "complete"}`,
          routeLabel: felRef?.name || "Complete",
          endedBy: "COMPLETE",
          endedAt: clock,
          sourceEventId: felRef?.id || null,
          sourceEventName: felRef?.name || null,
        });
        state.__served      = (state.__served || 0) + 1;
        state.__completedSinceSample = (state.__completedSinceSample || 0) + 1;
        msgs.push(`#${cust.id} done [sojourn ${cust.sojournTime.toFixed(2)} t, ${cust.stages.length} stage(s)]`);
      }
      if (srv) {
        releaseServerClaim(cust, srv, clock);
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
        releaseServerClaim(null, auxSrv, clock);
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
      const srvById = findEntityById(ctx.index, entities, srvId);
      const srv    = (srvById && srvById.role === "server" ? srvById : null)
                  || entities.find(e => e.type.trim().toLowerCase() === srvType.trim().toLowerCase() && e.status === "busy");
      const cust   = srv
        ? (findEntityById(ctx.index, entities, srv.currentCustId) || findEntityById(ctx.index, entities, custId))
        : findEntityById(ctx.index, entities, custId);

      if (srv && cust) {
        if (!claimMatchesPair(cust, srv)) {
          msgs.push(`RELEASE(${srvType}) skipped — stale or contradictory claim for customer #${cust.id} and server #${srv.id}`);
          return;
        }
        if (!cust.stages) cust.stages = [];
        cust.stages.push(buildStageRecord(cust, srv, clock));
        cust.lastStageStart = clock;
        const destQueue = targetQueue || cust.lastQueue || cust.queue;
        delete cust.serviceStart;
        releaseServerClaim(cust, srv, clock);
        const joined = attemptQueueJoin(cust, destQueue, clock, ctx);
        const retired = retireIdleExcessServers(ctx, srv.type);
        if (joined) {
          msgs.push(`#${cust.id} released → waiting [queue: ${cust.queue}, stage ${cust.stages.length} done, srv #${srv.id} idle]`);
        }
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
      const ent = findEntityById(ctx.index, entities, id);
      if (ent && ent.status === "waiting") {
        if (!ent.stages) ent.stages = [];
        ent.stages.push(buildStageRecord(ent, null, clock));
        clearWaitingState(ent, ctx.index);
        ent.status     = "reneged";
        ent.renegeTime = clock;
        setOutcome(ent, {
          status: "reneged",
          routeId: `event:${felRef?.id || felRef?.name || "renege"}`,
          routeLabel: felRef?.name || "Reneged",
          endedBy: "RENEGE",
          endedAt: clock,
          sourceEventId: felRef?.id || null,
          sourceEventName: felRef?.name || null,
        });
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
      const { entities, model, clock, msgs, nextId } = ctx;

      const qDef = (model.queues || []).find(
        q => q.name?.trim().toLowerCase() === queueName.trim().toLowerCase()
      );
      if (!qDef) {
        msgs.push(`BATCH(${queueName},${batchSizeArg}): queue not found`);
        return;
      }
      const discipline = qDef.discipline || 'FIFO';

      const candidates = listWaiting(queueName, discipline, entities, null, true, false, ctx.index);

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
      // Direct splice bypasses clearWaitingState, so the waiting-queue index
      // (which tracks these entities by reference) must be updated explicitly.
      for (const child of batched) {
        if (child.status === "waiting" && child.queue) {
          indexRemove(ctx.index, child.queue, child);
        }
        indexUntrackEntity(ctx.index, child);
      }
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
      const joined = attemptQueueJoin(parent, queueName, clock, ctx);
      if (joined) {
        msgs.push(`BATCH: #${ids.join(', #')} → batch #${parentId} in "${queueName}" (size=${batchSize})`);
      }
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
      const parent = findEntityById(ctx.index, entities, parentId);

      if (!parent || parent.role !== "batch" || !parent.batch?.children?.length) {
        msgs.push(`UNBATCH: #${parentId} is not a batch entity or has no children`);
        return;
      }

      const children = parent.batch.children;
      const restoredIds = [];
      for (const child of children) {
        const restored = {
          ...child,
          attrs: { ...(child.attrs || {}) },
          lastStageStart: clock,
        };
        // Each restored child independently re-enters the queue-join check
        // (F11.1/F11.2/F11.3) — one child balking/blocking doesn't affect the others.
        if (attemptQueueJoin(restored, targetQueue, clock, ctx)) {
          restoredIds.push(child.id);
        }
      }

      clearWaitingState(parent, ctx.index);
      parent.status = "done";
      parent.completionTime = clock;
      setOutcome(parent, {
        status: "completed",
        routeId: "macro:UNBATCH",
        routeLabel: "Unbatched",
        endedBy: "UNBATCH",
        endedAt: clock,
      });
      if (restoredIds.length > 0) {
        msgs.push(`UNBATCH: batch #${parentId} → restored #${restoredIds.join(', #')} to "${targetQueue}"`);
      } else {
        msgs.push(`UNBATCH: batch #${parentId} → all children balked/blocked at "${targetQueue}"`);
      }
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
      const queueToken = matchedQ ? matchedQ.name : cType;
      const ent = selectWaiting(queueToken, discipline, entities, null, !!matchedQ, ctx.index);
      if (ent) {
        clearWaitingState(ent, ctx.index);
        ent.status     = "reneged";
        ent.renegeTime = clock;
        setOutcome(ent, {
          status: "reneged",
          routeId: "macro:RENEGE_OLDEST",
          routeLabel: "Reneged oldest",
          endedBy: "RENEGE_OLDEST",
          endedAt: clock,
        });
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
      const cName     = match[1].trim();
      const rawAmount = match[2].trim();
      const { state, clock, msgs } = ctx;
      const entity = resolveContextEntity(ctx);
      const amount = evalEntityExpr(rawAmount, { state, clock, entity });
      const key    = `__container_${cName}`;
      const capKey = `__containerCap_${cName}`;
      if (!(key in state)) {
        msgs.push(`FILL(${cName}): container '${cName}' not declared in containerTypes`);
        return;
      }
      if (isNaN(amount) || amount <= 0) {
        msgs.push(`FILL(${cName},${rawAmount}): amount must be a positive number`);
        return;
      }
      flushContainerIntegral(state, clock, cName);
      const cap      = state[capKey] ?? Infinity;
      const newLevel = Math.min(state[key] + amount, cap);
      state[key] = newLevel;
      updateContainerMinMax(state, cName, newLevel);
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
      const cName     = match[1].trim();
      const rawAmount = match[2].trim();
      const { state, clock, msgs } = ctx;
      const entity = resolveContextEntity(ctx);
      const amount = evalEntityExpr(rawAmount, { state, clock, entity });
      const key = `__container_${cName}`;
      if (!(key in state)) {
        msgs.push(`DRAIN(${cName}): container '${cName}' not declared in containerTypes`);
        return;
      }
      if (isNaN(amount) || amount <= 0) {
        msgs.push(`DRAIN(${cName},${rawAmount}): amount must be a positive number`);
        return;
      }
      if (state[key] < amount) {
        msgs.push(`DRAIN(${cName},${amount}): guard failed — level ${state[key].toFixed(4)} < ${amount}`);
        return;
      }
      flushContainerIntegral(state, clock, cName);
      const newLevel = state[key] - amount;
      state[key] = newLevel;
      updateContainerMinMax(state, cName, newLevel);
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
      const cust = findEntityById(ctx.index, entities, custId);

      if (!cust) {
        msgs.push(`PREEMPT(${sType}): server #${srv.id} has no customer`);
        return;
      }

      const remainingService = preemptCustomer(cust, srv, clock, ctx);

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
        if (srv.status === "idle" && srv._starvationStart != null) {
          srv._starvationTime = (srv._starvationTime || 0) + Math.max(0, clock - srv._starvationStart);
          delete srv._starvationStart;
        }
        if (srv.status === "busy" || srv.status === "serving") {
          const custId = srv.currentCustId;
          const cust = findEntityById(ctx.index, entities, custId);
          if (cust) {
            const remainingService = preemptCustomer(cust, srv, clock, ctx);
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

      const repairedCount = repairServers(failedServers, clock);

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
      const cust = findEntityById(ctx.index, entities, custId);

      if (!cust) {
        msgs.push(`SPLIT(${entityType},${n},${targetQueue}): no context entity found`);
        return;
      }

      if (n < 2) {
        msgs.push(`SPLIT(${entityType},${n},${targetQueue}): N must be >= 2`);
        return;
      }

      // Each clone independently re-enters the queue-join check (F11.1/F11.2/F11.3) —
      // one clone balking/blocking doesn't affect the others.
      const childIds = [];
      for (let i = 1; i < n; i++) {
        const childId = nextId();
        const child = {
          id: childId,
          type: entityType,
          role: "customer",
          arrivalTime: clock,
          attrs: { ...cust.attrs },
          lastQueue: targetQueue,
          stages: [],
          loopCount: 0,
          _splitFrom: cust.id,
          _splitIndex: i,
        };
        if (attemptQueueJoin(child, targetQueue, clock, ctx)) {
          childIds.push(childId);
        }
      }

      cust._splitParent = true;
      cust._splitChildren = childIds;
      setLastCustId?.(cust.id);

      if (childIds.length > 0) {
        msgs.push(`SPLIT: #${cust.id} → ${childIds.length} clone(s) [${childIds.map(id => `#${id}`).join(', ')}] → "${targetQueue}"`);
      } else {
        msgs.push(`SPLIT: #${cust.id} → all ${n - 1} clone(s) balked/blocked at "${targetQueue}"`);
      }
    },
  },

  // ── COSEIZE(Queue, ServerType1[Skill1], ServerType2[Skill2][, ...]) ────────
  // Seizes one customer and multiple server types simultaneously.
  // Optional per-type bracket skill: Doctor[Surgery] filters idle pool by skill.
  {
    name:    "COSEIZE",
    pattern: /^COSEIZE\(([^,)]+)\s*,\s*(.+)\)$/i,
    apply(match, ctx) {
      const queueName = match[1].trim();
      const rawArgs = match[2].split(",").map(s => s.trim());
      const { entities, helpers, clock, setLastCustId, setLastSrvId, msgs } = ctx;

      // Parse each argument: "Type[Skill]" or just "Type"
      const serverDefs = rawArgs.map(arg => {
        const bracketMatch = arg.match(/^([^\[]+)\[([^\]]+)\]$/);
        if (bracketMatch) {
          return { type: bracketMatch[1].trim(), skill: bracketMatch[2].trim() };
        }
        return { type: arg, skill: null };
      });

      const dupType = serverDefs.find((t, i) => serverDefs.some((d, j) => j !== i && d.type === t.type));
      if (dupType) {
        const typeList = serverDefs.map(d => d.skill ? `${d.type}[${d.skill}]` : d.type).join(', ');
        msgs.push(`COSEIZE(${queueName}, ${typeList}): duplicate server type "${dupType.type}" — each server type must appear once; COSEIZE seizes one server per listed type, not one per occurrence`);
        return;
      }

      const discipline = helpers.findQueueConfig?.(queueName)?.discipline || "FIFO";
      const queueCandidates = helpers.waitingInQueue?.(queueName, discipline) || [];
      const cust = queueCandidates[0];

      if (!cust) {
        const typeList = serverDefs.map(d => d.skill ? `${d.type}[${d.skill}]` : d.type).join(', ');
        msgs.push(`COSEIZE(${queueName}, ${typeList}): no waiting customer in "${queueName}"`);
        return;
      }

      const idleServersByType = {};
      for (const def of serverDefs) {
        const idle = helpers.idleOf(def.type) || [];
        const matched = def.skill
          ? idle.filter(s => helpers.hasSkillType(s.type, def.skill))
          : idle;
        if (matched.length === 0) {
          const typeLabel = def.skill ? `${def.type}[${def.skill}]` : def.type;
          msgs.push(`COSEIZE(${queueName}, ...): no idle ${typeLabel}`);
          return;
        }
        idleServersByType[def.type] = matched[0];
      }

      // Claim all servers atomically — first uses claimServerForEntity (sets customer to serving),
      // subsequent servers get auxiliary claims without re-checking customer status.
      const serverEntries = Object.entries(idleServersByType);
      const primarySrv = serverEntries[0][1];
      const primarySkill = (serverDefs.find(d => d.type === serverEntries[0][0]) || serverDefs[0]).skill;
      if (!claimServerForEntity(cust, primarySrv, clock, ctx.index, ctx, primarySkill)) {
        msgs.push(`COSEIZE: claim failed for ${serverEntries[0][0]} #${primarySrv.id}`);
        return;
      }

      for (let i = 1; i < serverEntries.length; i++) {
        const [sType, srv] = serverEntries[i];
        const auxSkill = (serverDefs.find(d => d.type === sType) || serverDefs[i]).skill;
        if (srv._starvationStart != null) {
          srv._starvationTime = (srv._starvationTime || 0) + Math.max(0, clock - srv._starvationStart);
          delete srv._starvationStart;
        }
        srv.status = "busy";
        srv._busyStart = clock;
        srv._currentSkill = auxSkill;
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
        .map(([type, srv]) => {
          const def = serverDefs.find(d => d.type === type);
          return def?.skill ? `#${srv.id} (${type}[${def.skill}])` : `#${srv.id} (${type})`;
        })
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
      const { entities, helpers, clock, msgs, nextId, noteEntityCreated } = ctx;

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
      noteEntityCreated?.(parent);
      // parent is born directly into "waiting" status (bypassing markEntityWaiting/
      // attemptQueueJoin), so the index must be updated explicitly here too.
      indexAdd(ctx.index, targetQueue, parent);
      indexTrackEntity(ctx.index, parent);

      clearWaitingState(entityA, ctx.index);
      entityA.status = "done";
      entityA.completionTime = clock;
      setOutcome(entityA, {
        status: "completed",
        routeId: "macro:MATCH",
        routeLabel: `Matched into ${targetQueue}`,
        endedBy: "MATCH",
        endedAt: clock,
      });
      entityA._matchedInto = parentId;

      clearWaitingState(entityB, ctx.index);
      entityB.status = "done";
      entityB.completionTime = clock;
      setOutcome(entityB, {
        status: "completed",
        routeId: "macro:MATCH",
        routeLabel: `Matched into ${targetQueue}`,
        endedBy: "MATCH",
        endedAt: clock,
      });
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
      const { state, clock, msgs } = ctx;
      const entity  = resolveContextEntity(ctx);
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
      const { state, clock, msgs } = ctx;
      const entity   = resolveContextEntity(ctx);
      if (!entity) {
        msgs.push(`SET_ATTR(${attrName}): no context entity — use after ARRIVE, ASSIGN, or COSEIZE`);
        return;
      }
      const _et = (ctx.model?.entityTypes || []).find(
        t => (t.name || '').trim().toLowerCase() === (entity.type || '').toLowerCase()
      );
      const _attrDef = (_et?.attrDefs || []).find(a => a.name === attrName);
      if (_attrDef?.mutable === false) {
        msgs.push(`SET_ATTR(${attrName}): attribute is immutable — write skipped`);
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
      const entity = custId != null ? findEntityById(ctx.index, entities, custId) : null;
      const amount = evalEntityExpr(expr, { state, clock, entity });
      if (!Number.isFinite(amount)) {
        msgs.push(`COST: expression "${expr}" did not evaluate to a finite number (got ${amount})`);
        return;
      }
      state.__totalCost = (state.__totalCost || 0) + amount;
      if (entity) entity.attrs.__cost = (entity.attrs.__cost || 0) + amount;
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

