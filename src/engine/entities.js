// engine/entities.js — Entity lifecycle and status helpers
//
// EXTENDING: To add a new entity role (e.g. "resource"):
//   1. Add it to ENTITY_ROLES below
//   2. Add creation logic in createServerEntities if pre-created at t=0
//   3. Update statusHelpers if the new role has unique status semantics

import { evaluatePredicate } from "./conditions.js";
import { sample } from "./distributions.js";

export const ENTITY_ROLES = {
  customer: {
    label:       "customer",
    description: "Arrives during simulation via ARRIVE(). Flows through queues and servers.",
    preCreated:  false,
    initialStatus: "waiting",
  },
  server: {
    label:       "server",
    description: "Pre-created at t=0 in the quantity set by count. Processes customers.",
    preCreated:  true,
    initialStatus: "idle",
  },
  batch: {
    label:       "batch",
    description: "Created by BATCH macro. Represents a group of entities that flow as one unit.",
    preCreated:  false,
    initialStatus: "waiting",
  },
};

// Valid entity statuses
export const ENTITY_STATUSES = {
  waiting:   { color: "#f0883e", label: "Waiting"   },
  serving:   { color: "#06b6d4", label: "Serving"   },
  done:      { color: "#3fb950", label: "Done"      },
  reneged:   { color: "#f85149", label: "Reneged"   },
  idle:      { color: "#3fb950", label: "Idle"      },
  busy:      { color: "#f59e0b", label: "Busy"      },
  failed:    { color: "#f85149", label: "Failed"    },
  batched:   { color: "#8b5cf6", label: "Batched"   },
};

let _seq = 0;
export const resetSeq = () => { _seq = 0; };
export const nextId   = () => ++_seq;

function norm(value) {
  return String(value || "").trim().toLowerCase();
}

export function queueDisciplineComparator(discipline = "FIFO") {
  const d = (discipline || "FIFO").toUpperCase();

  // PRIORITY(attrName) — sort by specified attribute, FIFO tiebreaker
  const priorityMatch = d.match(/^PRIORITY\((\w+)\)$/);
  if (priorityMatch) {
    const attrNameUpper = priorityMatch[1];
    return (a, b) => {
      // Case-insensitive attribute lookup — discipline is uppercased but attrs keep original casing
      const findAttr = (entity) => {
        if (!entity.attrs) return Infinity;
        for (const key of Object.keys(entity.attrs)) {
          if (key.toUpperCase() === attrNameUpper) return Number(entity.attrs[key]);
        }
        return Infinity;
      };
      const pa = findAttr(a);
      const pb = findAttr(b);
      if (pa !== pb) return pa - pb;
      return (a.arrivalTime || 0) - (b.arrivalTime || 0);
    };
  }

  // SPT — Shortest Processing Time (uses attrs.serviceTime or attrs.processingTime)
  if (d === "SPT") {
    return (a, b) => {
      const sa = Number(a.attrs?.serviceTime ?? a.attrs?.processingTime ?? Infinity);
      const sb = Number(b.attrs?.serviceTime ?? b.attrs?.processingTime ?? Infinity);
      if (sa !== sb) return sa - sb;
      return (a.arrivalTime || 0) - (b.arrivalTime || 0);
    };
  }

  // EDD — Earliest Due Date (uses attrs.dueDate)
  if (d === "EDD") {
    return (a, b) => {
      const da = Number(a.attrs?.dueDate ?? Infinity);
      const db = Number(b.attrs?.dueDate ?? Infinity);
      if (da !== db) return da - db;
      return (a.arrivalTime || 0) - (b.arrivalTime || 0);
    };
  }

  switch (d) {
    case "LIFO":
      return (a, b) => (b.arrivalTime || 0) - (a.arrivalTime || 0);
    case "PRIORITY":
      return (a, b) => {
        const pa = Number(a.attrs?.priority ?? Infinity);
        const pb = Number(b.attrs?.priority ?? Infinity);
        if (pa !== pb) return pa - pb;
        return (a.arrivalTime || 0) - (b.arrivalTime || 0);
      };
    default:
      return (a, b) => (a.arrivalTime || 0) - (b.arrivalTime || 0);
  }
}

export function sortWaitingEntities(waiting, discipline = "FIFO") {
  return [...waiting].sort(queueDisciplineComparator(discipline));
}

/**
 * Single authoritative queue-discipline selector (M4).
 * Returns the first entity from `entities` waiting in the named queue or type,
 * sorted by discipline. Set `isQueueName=true` to match entity.queue; false for entity.type.
 */
export function selectWaiting(token, discipline, entities, filterFn = null, isQueueName = false) {
  return listWaiting(token, discipline, entities, filterFn, isQueueName)[0] ?? null;
}

/**
 * Sorted-list variant of selectWaiting. `includeBatches=false` excludes batch entities.
 */
export function listWaiting(token, discipline, entities, filterFn = null, isQueueName = false, includeBatches = true) {
  const key = norm(token);
  let pool = entities.filter(e => {
    if (e.status !== "waiting") return false;
    if (!includeBatches && e.role === "batch") return false;
    return isQueueName
      ? (e.queue && norm(e.queue) === key)
      : (norm(e.type) === key);
  });
  if (filterFn) pool = pool.filter(filterFn);
  return sortWaitingEntities(pool, discipline);
}

export function sortResourceEntities(resources) {
  return [...resources].sort((a, b) => {
    const timeDelta = (a.arrivalTime || 0) - (b.arrivalTime || 0);
    if (timeDelta !== 0) return timeDelta;
    return (a.id || 0) - (b.id || 0);
  });
}

function claimSnapshot(customer, server, clock, queueName) {
  return {
    customerId: customer.id,
    customerType: customer.type,
    serverId: server.id,
    serverType: server.type,
    queueName: queueName ?? customer.queue ?? customer.lastQueue ?? null,
    claimedAt: clock,
  };
}

function waitingSnapshot(entity, clock, queueName) {
  return {
    kind: "queue",
    queueName: queueName ?? entity.queue ?? entity.lastQueue ?? null,
    enteredAt: clock,
  };
}

export function markEntityWaiting(entity, clock, queueName = entity.queue ?? entity.lastQueue ?? null) {
  if (!entity) return false;
  if (entity.status === "done" || entity.status === "reneged") return false;
  entity.status = "waiting";
  entity.queue = queueName;
  entity.waitingSince = clock;
  entity.waitingFor = waitingSnapshot(entity, clock, queueName);
  return true;
}

export function clearWaitingState(entity) {
  if (!entity) return false;
  delete entity.waitingFor;
  delete entity.waitingSince;
  return true;
}

export function claimServerForEntity(customer, server, clock) {
  if (!customer || !server) return false;
  if (customer.status !== "waiting" || server.status !== "idle") return false;

  const queueName = customer.queue ?? customer.lastQueue ?? null;
  const claim = claimSnapshot(customer, server, clock, queueName);

  clearWaitingState(customer);
  customer.status = "serving";
  customer.serviceStart = clock;
  customer.serverId = server.id;
  customer.lastQueue = queueName;
  customer.resourceClaim = claim;
  delete customer.queue;

  server.status = "busy";
  server._busyStart = clock;
  server.currentCustId = customer.id;
  server.resourceClaim = claim;

  // Flush starvation timer — server was idle and is now busy
  if (server._starvationStart != null) {
    server._starvationTime = (server._starvationTime || 0) + Math.max(0, clock - server._starvationStart);
    delete server._starvationStart;
  }

  return true;
}

export function releaseServerClaim(customer, server, clock) {
  if (!customer && !server) return false;

  if (customer) {
    delete customer.serverId;
    delete customer.resourceClaim;
  }
  if (server) {
    delete server.currentCustId;
    delete server.resourceClaim;
    if (server.status === "busy") {
      if (server._busyStart != null && clock != null) {
        server._busyTime = (server._busyTime || 0) + Math.max(0, clock - server._busyStart);
      }
      delete server._busyStart;
      server.status = "idle";
      // Start starvation timer — server just became idle; if no work arrives, this is starvation
      server._starvationStart = clock;
    }
  }

  return true;
}

// A preempted customer resumes an interrupted wait — it's not making a fresh decision
// to join a queue, so balking is skipped, but capacity/overflow (F11.1/F11.3) still
// applies (it could overflow/exit if its original queue is now full).
export function preemptCustomer(cust, srv, clock, ctx) {
  const scheduledDuration = srv._scheduledDuration || 0;
  const remainingService  = Math.max(0, scheduledDuration - (clock - (cust.serviceStart ?? clock)));
  cust._remainingService  = remainingService;
  releaseServerClaim(cust, srv, clock);
  clearWaitingState(cust);
  attemptQueueJoin(cust, cust.lastQueue || cust.queue, clock, ctx, { skipBalk: true });
  return remainingService;
}

export function repairServers(failedServers, clock) {
  let count = 0;
  for (const srv of failedServers) {
    const failedAt = srv._failedAt;
    const downtime  = failedAt != null ? +(clock - failedAt).toFixed(4) : 0;
    srv.status       = "idle";
    srv._starvationStart = clock;
    srv._failedAt    = undefined;
    srv._downtime    = downtime;
    srv._totalDowntime = (srv._totalDowntime || 0) + downtime;
    srv._failureCount  = (srv._failureCount  || 0) + 1;
    count++;
  }
  return count;
}

export function findQueueConfig(model, token) {
  const key = norm(token);
  return (model?.queues || []).find(queue => norm(queue.name) === key || norm(queue.customerType) === key) || null;
}

/**
 * Centralized queue-join check (F11.1/F11.2/F11.3): balking, capacity/overflow, and
 * (on success) queue-level auto-reneging — enforced identically no matter which macro
 * delivers an entity into a queue (ARRIVE, RELEASE, routing, BATCH/UNBATCH/SPLIT, etc.).
 *
 * `entity` may or may not already be in `ctx.entities` — ARRIVE constructs the entity
 * before it has ever joined anything, while every other call site passes an entity
 * already present in the array. Both are handled uniformly.
 *
 * opts:
 *   skipBalk        — preempted entities resume an interrupted wait, not a fresh join
 *   skipCapacity     — kept for symmetry; unused today
 *   legacyBalkCondition / legacyBalkProbability — ARRIVE's backward-compat fallback to
 *                      B-event-level balk fields, for models authored before balking moved
 *                      to the Queue
 *   visitedQueues    — internal: cycle guard threaded through recursive overflow reroutes
 *
 * Returns true if the entity ended up waiting somewhere; false if it was discarded
 * (balked/blocked with no overflow destination, or an overflow cycle was detected).
 */
export function attemptQueueJoin(entity, queueName, clock, ctx, opts = {}) {
  const { model, entities } = ctx;
  const qDef = findQueueConfig(model, queueName);
  const visited = opts.visitedQueues || new Set();
  const qKey = norm(qDef?.name || queueName);

  if (visited.has(qKey)) {
    discardFailedJoin(entity, ctx, `#${entity.id} (${entity.type}) overflow cycle detected at "${queueName}" — exited system`);
    return false;
  }
  visited.add(qKey);

  if (!opts.skipBalk) {
    const balkCondition = qDef?.balkCondition ?? opts.legacyBalkCondition ?? null;
    if (balkCondition) {
      const qLen = entities.filter(e => e.status === "waiting" && norm(e.queue) === norm(queueName)).length;
      const balkState = { ...ctx.state, queues: { [queueName]: { length: qLen } } };
      if (evaluatePredicate(balkCondition, balkState)) {
        return rerouteOrExit("balkCount", "balked", entity, qDef, queueName, clock, ctx, visited);
      }
    }
    const balkProbability = qDef?.balkProbability ?? opts.legacyBalkProbability ?? null;
    if (balkProbability != null && ctx.rng() < balkProbability) {
      return rerouteOrExit("balkCount", "balked (p)", entity, qDef, queueName, clock, ctx, visited);
    }
  }

  if (!opts.skipCapacity) {
    const cap = qDef?.capacity != null ? parseInt(qDef.capacity, 10) : null;
    if (cap !== null && Number.isFinite(cap) && cap > 0) {
      const currentDepth = entities.filter(e => e.status === "waiting" && norm(e.queue) === norm(queueName)).length;
      if (currentDepth >= cap) {
        return rerouteOrExit("blockingCount", `blocked (capacity ${cap})`, entity, qDef, queueName, clock, ctx, visited);
      }
    }
  }

  markEntityWaiting(entity, clock, queueName);
  if (!entities.includes(entity)) {
    entities.push(entity);
    ctx.noteEntityCreated?.(entity);
  } else {
    ctx.noteQueueDepth?.(queueName);
  }
  ctx.setLastCustId?.(entity.id);
  if (qDef?.renegeDist) scheduleAutoRenege(entity, qDef, clock, ctx);
  return true;
}

function rerouteOrExit(metricKey, reasonLabel, entity, qDef, queueName, clock, ctx, visited) {
  ctx.incQueueMetric?.(queueName, metricKey);
  const dest = qDef?.overflowDestination ?? null;
  if (dest) {
    ctx.msgs?.push(`#${entity.id} (${entity.type}) ${reasonLabel} at "${queueName}" → rerouted to "${dest}"`);
    return attemptQueueJoin(entity, dest, clock, ctx, { visitedQueues: visited });
  }
  discardFailedJoin(entity, ctx, `#${entity.id} (${entity.type}) ${reasonLabel} at "${queueName}" — exited system`);
  return false;
}

function discardFailedJoin(entity, ctx, msg) {
  const { entities } = ctx;
  const idx = entities.indexOf(entity);
  if (idx !== -1) entities.splice(idx, 1);
  ctx.msgs?.push(msg);
}

function scheduleAutoRenege(entity, qDef, clock, ctx) {
  if (typeof ctx.scheduleEvent !== "function") return;
  const qKey = qDef.id || norm(qDef.name);
  const schedCtx = { clock, streamName: `auto-renege:${qKey}`, streamRegistry: ctx.streamRegistry };
  const delay = Math.max(0, sample(qDef.renegeDist, qDef.renegeDistParams || {}, ctx.rng, null, schedCtx));
  ctx.scheduleEvent({
    id:            `auto_renege_${qKey}`,
    name:          `Auto-Renege (${qDef.name})`,
    effect:        "RENEGE(ctx)",
    schedules:     [],
    scheduledTime: clock + delay,
    _isRenege:        true,
    _contextCustId:   entity.id,
  });
}

/**
 * Create a new customer entity.
 */
export function createCustomer(typeName, role, attrs, clock) {
  return {
    id:          nextId(),
    type:        typeName,
    role:        role || "customer",
    status:      "waiting",
    attrs,
    arrivalTime: clock,
    stages:      [],
    lastStageStart: null,
    loopCount: 0,
  };
}

/**
 * Pre-create all server entities from entity type definitions.
 */
export function createServerEntities(entityTypes, sampleAttrsFn) {
  const entities = [];
  for (const et of entityTypes) {
    if (et.role !== "server") continue;
    const count = Math.max(1, parseInt(et.count) || 1);
    for (let i = 0; i < count; i++) {
      entities.push({
        id:          nextId(),
        type:        et.name.trim(),
        role:        "server",
        status:      "idle",
        attrs:       sampleAttrsFn(et.attrDefs || et.attrs),
        arrivalTime: 0,
        stages:      [],
        _starvationStart: 0,
        _instanceIndex: i,
      });
    }
  }
  return entities;
}

/**
 * Status filter helpers — all case-insensitive on type name.
 */
export function makeHelpers(entities, model = null) {
  const match = (a, b) => norm(a) === norm(b);

  function filterWaiting(predicate, discipline = "FIFO", filterFn = null) {
    let waiting = entities.filter(entity => entity.status === "waiting" && predicate(entity));
    if (filterFn) waiting = waiting.filter(filterFn);
    return sortWaitingEntities(waiting, discipline);
  }

  function makeQueueFilter(queueName, includeBatches) {
    return entity => {
      if (!entity.queue || !match(entity.queue, queueName)) return false;
      if (!includeBatches && entity.role === "batch") return false;
      return true;
    };
  }

  return {
    entities,
    model,
    findQueueConfig: (token) => findQueueConfig(model, token),

    waitingOf: (type, discipline = "FIFO", filterFn = null) =>
      filterWaiting(entity => match(entity.type, type), discipline, filterFn),

    waitingInQueue: (queueName, discipline = "FIFO", filterFn = null, includeBatches = true) =>
      filterWaiting(makeQueueFilter(queueName, includeBatches), discipline, filterFn),

    selectWaitingOf: (type, discipline = "FIFO", filterFn = null) =>
      filterWaiting(entity => match(entity.type, type), discipline, filterFn)[0],

    selectWaitingInQueue: (queueName, discipline = "FIFO", filterFn = null, includeBatches = true) =>
      filterWaiting(makeQueueFilter(queueName, includeBatches), discipline, filterFn)[0],

    idleOf: (type) =>
      sortResourceEntities(entities.filter(e => match(e.type, type) && e.status === "idle" && !e._suspended)),

    busyOf: (type) =>
      sortResourceEntities(entities.filter(e => match(e.type, type) && (e.status === "busy" || e.status === "serving") && !e._suspended)),

    selectIdleOf: (type) =>
      sortResourceEntities(entities.filter(e => match(e.type, type) && e.status === "idle" && !e._suspended))[0],

    findById: (id) =>
      entities.find(e => e.id === id),

    allCustomers: () =>
      entities.filter(e => e.role !== "server"),

    allServers: () =>
      entities.filter(e => e.role === "server"),
  };
}

