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

export const MACROS = [

  // ── ARRIVE(Type[, QueueName]) ──────────────────────────────────────────────
  {
    name:    "ARRIVE",
    pattern: /^ARRIVE\((\w+)(?:\s*,\s*(\w+))?\)$/i,
    apply(match, ctx) {
      const typeName  = match[1];
      const queueName = match[2] || (typeName + "Queue");
      const { entities, model, clock, helpers, setLastCustId, msgs } = ctx;
      const et = (model.entityTypes || []).find(
        e => e.name.trim().toLowerCase() === typeName.trim().toLowerCase()
      );
      const id = ctx.nextId();
      const ent = {
        id,
        type:           typeName,
        role:           et?.role || "customer",
        status:         "waiting",
        queue:          queueName,
        attrs:          sampleAttrs(et?.attrDefs || et?.attrs || ""),
        arrivalTime:    clock,
        stages:         [],
        lastStageStart: null,
      };
      entities.push(ent);
      setLastCustId(id);
      msgs.push(`#${id} (${typeName}) arrived → waiting [queue: ${queueName}, depth: ${helpers.waitingOf(typeName).length}]`);
    },
  },

  // ── ASSIGN(CustomerType|QueueName, ServerType) ────────────────────────────
  {
    name:    "ASSIGN",
    pattern: /^ASSIGN\((\w+)\s*,\s*(\w+)\)$/i,
    apply(match, ctx) {
      const [, cType, sType] = match;
      const { entities, helpers, clock, setLastCustId, setLastSrvId, msgs } = ctx;

      // First try by entity type; if empty, treat cType as a queue name
      let cust = helpers.waitingOf(cType)[0];
      if (!cust) {
        const inQueue = entities.filter(e =>
          e.queue &&
          e.queue.trim().toLowerCase() === cType.trim().toLowerCase() &&
          e.status === "waiting"
        ).sort((a, b) => (a.arrivalTime || 0) - (b.arrivalTime || 0));
        cust = inQueue[0];
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
    pattern: /^RELEASE\((\w+)(?:\s*,\s*(\w+))?\)$/i,
    apply(match, ctx) {
      const srvType     = match[1];
      const targetQueue = match[2] || null;
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

  // ── RENEGE_OLDEST(Type) ────────────────────────────────────────────────────
  {
    name:    "RENEGE_OLDEST",
    pattern: /^RENEGE_OLDEST\((\w+)\)$/i,
    apply(match, ctx) {
      const { helpers, state, clock, msgs } = ctx;
      const ent = helpers.waitingOf(match[1])[0];
      if (ent) {
        ent.status     = "reneged";
        ent.renegeTime = clock;
        state.__reneged = (state.__reneged || 0) + 1;
        msgs.push(`#${ent.id} (${match[1]}) reneged after ${(clock - ent.arrivalTime).toFixed(3)} t`);
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
    try {
      // eslint-disable-next-line no-new-func
      state[r5[1]] = new Function(`return (${v})`)();
    } catch {
      state[r5[1]] = r5[2].trim();
    }
    return true;
  }
  return false;
}

