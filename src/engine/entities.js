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
};

// Valid entity statuses
export const ENTITY_STATUSES = {
  waiting:  { color: "#f0883e", label: "Waiting"  },
  serving:  { color: "#06b6d4", label: "Serving"  },
  done:     { color: "#3fb950", label: "Done"     },
  reneged:  { color: "#f85149", label: "Reneged"  },
  idle:     { color: "#3fb950", label: "Idle"     },
  busy:     { color: "#f59e0b", label: "Busy"     },
};

let _seq = 0;
export const resetSeq = () => { _seq = 0; };
export const nextId   = () => ++_seq;

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
export function makeHelpers(entities) {
  const match = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

  return {
    entities,
    waitingOf: (type, discipline = 'FIFO') => {
      const waiting = entities.filter(e => match(e.type, type) && e.status === 'waiting');
      switch ((discipline || 'FIFO').toUpperCase()) {
        case 'LIFO':
          return waiting.sort((a, b) => (b.arrivalTime || 0) - (a.arrivalTime || 0));
        case 'PRIORITY':
          return waiting.sort((a, b) => {
            const pa = Number(a.attrs?.priority ?? Infinity);
            const pb = Number(b.attrs?.priority ?? Infinity);
            if (pa !== pb) return pa - pb;
            return (a.arrivalTime || 0) - (b.arrivalTime || 0); // FIFO tiebreaker
          });
        default: // FIFO
          return waiting.sort((a, b) => (a.arrivalTime || 0) - (b.arrivalTime || 0));
      }
    },

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

