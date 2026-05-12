// engine/entities.js — Entity lifecycle and status helpers
//
// EXTENDING: To add a new entity role (e.g. "resource"):
//   1. Add it to ENTITY_ROLES below
//   2. Add creation logic in createServerEntities if pre-created at t=0
//   3. Update statusHelpers if the new role has unique status semantics

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
  waiting:  { color: "#f0883e", label: "Waiting"  },
  serving:  { color: "#06b6d4", label: "Serving"  },
  done:     { color: "#3fb950", label: "Done"     },
  reneged:  { color: "#f85149", label: "Reneged"  },
  idle:     { color: "#3fb950", label: "Idle"     },
  busy:     { color: "#f59e0b", label: "Busy"     },
  batched:  { color: "#8b5cf6", label: "Batched"  },
};

let _seq = 0;
export const resetSeq = () => { _seq = 0; };
export const nextId   = () => ++_seq;

function norm(value) {
  return String(value || "").trim().toLowerCase();
}

export function queueDisciplineComparator(discipline = "FIFO") {
  switch ((discipline || "FIFO").toUpperCase()) {
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

export function findQueueConfig(model, token) {
  const key = norm(token);
  return (model?.queues || []).find(queue => norm(queue.name) === key || norm(queue.customerType) === key) || null;
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

  return {
    entities,
    model,
    findQueueConfig: (token) => findQueueConfig(model, token),

    waitingOf: (type, discipline = "FIFO", filterFn = null) =>
      filterWaiting(entity => match(entity.type, type), discipline, filterFn),

    waitingInQueue: (queueName, discipline = "FIFO", filterFn = null, includeBatches = true) =>
      filterWaiting(entity => {
        if (!entity.queue || !match(entity.queue, queueName)) return false;
        if (!includeBatches && entity.role === "batch") return false;
        return true;
      }, discipline, filterFn),

    selectWaitingOf: (type, discipline = "FIFO", filterFn = null) =>
      filterWaiting(entity => match(entity.type, type), discipline, filterFn)[0],

    selectWaitingInQueue: (queueName, discipline = "FIFO", filterFn = null, includeBatches = true) =>
      filterWaiting(entity => {
        if (!entity.queue || !match(entity.queue, queueName)) return false;
        if (!includeBatches && entity.role === "batch") return false;
        return true;
      }, discipline, filterFn)[0],

    idleOf: (type) =>
      entities.filter(e => match(e.type, type) && e.status === "idle"),

    busyOf: (type) =>
      entities.filter(e => match(e.type, type) && (e.status === "busy" || e.status === "serving")),

    findById: (id) =>
      entities.find(e => e.id === id),

    allCustomers: () =>
      entities.filter(e => e.role !== "server"),

    allServers: () =>
      entities.filter(e => e.role === "server"),
  };
}

