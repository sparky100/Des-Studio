// @ts-check
// engine/entities.js — Entity lifecycle and status helpers
//
// EXTENDING: To add a new entity role (e.g. "resource"):
//   1. Add it to ENTITY_ROLES below
//   2. Add creation logic in createServerEntities if pre-created at t=0
//   3. Update statusHelpers if the new role has unique status semantics

import { evaluatePredicate } from "./conditions.js";
import { sample } from "./distributions.js";

/**
 * idle/busy: the idle(T).count / busy(T).count figures (suspended servers
 * excluded). snapIdle/snapBusy/snapFailed: the same servers classified the way
 * snapshots and chart samples count them (suspension ignored, a server in
 * turnaround counted as busy). total: servers of the type in the roster.
 * @typedef {{ idle: number, busy: number, snapIdle: number, snapBusy: number, snapFailed: number, total: number }} ServerTypeCounts
 */

/**
 * @typedef {{
 *   waitingByQueue: Map<string, Record<string, any>[]>,
 *   servers: Record<string, any>[],
 *   fifoSortedByQueue: Map<string, boolean>,
 *   byId: Map<any, Record<string, any>>,
 *   serversByType: Map<string, Record<string, any>[]>|null,
 *   serverCountsByType: Map<string, ServerTypeCounts>|null,
 *   inSystem: number,
 * }} QueueIndex
 */

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
  balked:    { color: "#d29922", label: "Balked"    },
  idle:      { color: "#3fb950", label: "Idle"      },
  busy:      { color: "#f59e0b", label: "Busy"      },
  failed:    { color: "#f85149", label: "Failed"    },
  batched:   { color: "#8b5cf6", label: "Batched"   },
};

let _seq = 0;
export const resetSeq = () => { _seq = 0; };
export const nextId   = () => ++_seq;

/** @param {any} value */
function norm(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * @param {string} [discipline]
 * @returns {(a: Record<string, any>, b: Record<string, any>) => number}
 */
export function queueDisciplineComparator(discipline = "FIFO") {
  const d = (discipline || "FIFO").toUpperCase();

  // PRIORITY(attrName) — sort by specified attribute, FIFO tiebreaker
  const priorityMatch = d.match(/^PRIORITY\((\w+)\)$/);
  if (priorityMatch) {
    const attrNameUpper = priorityMatch[1];
    return (a, b) => {
      // Case-insensitive attribute lookup — discipline is uppercased but attrs keep original casing
      const findAttr = (/** @type {Record<string, any>} */ entity) => {
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

/**
 * @param {Record<string, any>[]} waiting
 * @param {string} [discipline]
 */
export function sortWaitingEntities(waiting, discipline = "FIFO") {
  return [...waiting].sort(queueDisciplineComparator(discipline));
}

// ── Queue index — O(1)-amortised waiting-queue membership ───────────────────
//
// `waitingByQueue` mirrors the set of entities with status==="waiting", keyed
// by normalized queue name. It exists so hot-path queue-membership checks
// (balk/capacity depth, ASSIGN/DELAY/BATCH candidate lists, queue(Name).length
// predicates) don't have to filter the entire live `entities` array — which,
// for a congested model, can be dominated by a single deep queue's backlog.
//
// Maintained at exactly two chokepoints: markEntityWaiting (add) and
// clearWaitingState (remove) — verified (by exhaustive grep across
// src/engine/*.js) to be the sole production sites that respectively set and
// clear "waiting" status, with entity.queue always still intact at the
// clearWaitingState call site. The one exception is BATCH's macro-level
// `entities.splice()` removal of already-waiting children, which bypasses
// clearWaitingState entirely — that call site removes from the index
// explicitly (see macros.js).
// `servers` is a small, stable roster of all server entities — kept separate
// from `waitingByQueue` because idleOf/busyOf/failedOf (called on every
// Phase-C condition check and ASSIGN) only ever need to scan servers, but
// without this they scan the full `entities` array including the entire
// customer backlog. Servers are added/removed only via SHIFT_CHANGE
// (phases.js) and capacity reconciliation (macros.js) — both call
// indexAddServer/indexRemoveServer explicitly since they splice `entities`
// directly. Status transitions (idle/busy/failed) happen in place on the
// same object reference, so no add/remove bookkeeping is needed for those.
/** @returns {QueueIndex} */
export function createQueueIndex() {
  return { waitingByQueue: new Map(), servers: [], fifoSortedByQueue: new Map(), byId: new Map(), serversByType: null, serverCountsByType: null, inSystem: 0 };
}

// O(1) replacement for the dozens of `entities.find(e => e.id === id)` call
// sites used to resolve "the customer"/"the server" referenced by a firing
// event — those scans are the dominant remaining cost on a congested model
// once queue-membership and sort costs are already indexed. Maintained at
// every entities.push/splice site (see indexTrackEntity/indexUntrackEntity).
/**
 * @param {QueueIndex|null} index
 * @param {Record<string, any>[]} entities
 * @param {any} id
 */
export function findEntityById(index, entities, id) {
  if (id == null) return null;
  return index ? (index.byId.get(id) ?? null) : (entities.find(e => e.id === id) ?? null);
}

// Registers an entity in the byId index. Call at every site that adds an
// entity to the live `entities` array. Safe to call with a falsy index (no-op).
/**
 * @param {QueueIndex|null} index
 * @param {Record<string, any>|null|undefined} entity
 */
export function indexTrackEntity(index, entity) {
  if (!index || !entity) return;
  const prev = index.byId.get(entity.id);
  if (prev === entity) return;
  if (prev && isInSystem(prev)) index.inSystem--;
  index.byId.set(entity.id, entity);
  if (isInSystem(entity)) index.inSystem++;
}

// A customer still in the system: not a server, not done/reneged/balked.
// index.inSystem counts the tracked (live) entities for which this holds —
// the work-in-progress figure, kept exact by indexTrackEntity/
// indexUntrackEntity and markTerminal (the only ways an entity enters or
// leaves that set: an entity never goes from terminal back to live — UNBATCH
// restores children as new objects, which are tracked afresh).
/** @param {Record<string, any>} e */
export function isInSystem(e) {
  return e.role !== "server" && e.status !== "done" && e.status !== "reneged" && e.status !== "balked";
}

/**
 * Set a terminal status (done / reneged / balked), keeping index.inSystem exact.
 * @param {QueueIndex|null} index
 * @param {Record<string, any>} entity
 * @param {"done"|"reneged"|"balked"} status
 */
export function markTerminal(index, entity, status) {
  const counted = !!index && index.byId.get(entity.id) === entity && isInSystem(entity);
  entity.status = status;
  if (counted) index.inSystem--;
}

// Unregisters an entity from the byId index. Call at every site that removes
// an entity from the live `entities` array — including BATCH's children
// splice, since a batched child is no longer live until UNBATCH re-tracks it
// (under the same id, but as a new cloned object) via attemptQueueJoin.
/**
 * @param {QueueIndex|null} index
 * @param {Record<string, any>|null|undefined} entity
 */
export function indexUntrackEntity(index, entity) {
  if (!index || !entity) return;
  if (index.byId.get(entity.id) === entity) {
    index.byId.delete(entity.id);
    if (isInSystem(entity)) index.inSystem--;
  }
}

// Plain FIFO (the default/unrecognized-discipline case) sorts purely by
// arrivalTime. As long as every entity has been appended to a queue bucket
// in non-decreasing arrivalTime order, the bucket is already in FIFO order —
// ties keep insertion order, which is exactly what a stable sort over an
// already-sorted array produces anyway. `indexAdd` tracks per-bucket
// "known sorted" state so reads can skip the O(M log M) sort (the dominant
// cost on a deep, congested queue — re-paid on essentially every Phase-C
// condition check and ASSIGN/BATCH/MATCH candidate lookup). An out-of-order
// append (e.g. a preempted entity re-joining with its original, older
// arrivalTime) marks the bucket dirty; `readSortedBucket` then pays one
// real sort on the *next* read to restore the invariant (sorting in place,
// so the cost is amortised across however many reads happen before the
// next out-of-order append) rather than falling back to sorting forever.
/** @param {any} discipline */
function isPlainFifo(discipline) {
  const d = norm(discipline);
  return !d || d === "fifo";
}

// Returns the live per-queue bucket, resorted in place first if a prior
// out-of-order join left it dirty. Callers must treat the returned array as
// read-only (it's the live bucket, not a copy) — copy before mutating/
// returning to outside code that might splice/shift it.
/**
 * @param {QueueIndex} index
 * @param {string} queueName
 * @param {string} discipline
 */
function readSortedBucket(index, queueName, discipline) {
  const key = norm(queueName);
  const bucket = index.waitingByQueue.get(key) || [];
  if (isPlainFifo(discipline) && index.fifoSortedByQueue.get(key) === false) {
    bucket.sort(queueDisciplineComparator(discipline));
    index.fifoSortedByQueue.set(key, true);
  }
  return bucket;
}

/**
 * @param {QueueIndex|null} index
 * @param {Record<string, any>|null|undefined} server
 */
export function indexAddServer(index, server) {
  if (!index || !server) return;
  index.servers.push(server);
  index.serversByType = null;
  index.serverCountsByType = null;
}

/**
 * @param {QueueIndex|null} index
 * @param {Record<string, any>|null|undefined} server
 */
export function indexRemoveServer(index, server) {
  if (!index || !server) return;
  const i = index.servers.indexOf(server);
  if (i !== -1) index.servers.splice(i, 1);
  index.serversByType = null;
  index.serverCountsByType = null;
  _serverMeta.delete(server);
}

// Servers of one type, in roster order — built lazily from index.servers and
// dropped whenever the roster changes (indexAddServer/indexRemoveServer).
// idle()/busy() counts and ASSIGN/COSEIZE candidate lists then scan only that
// type's servers, with the type name normalised once per lookup instead of
// twice per server.
/**
 * @param {QueueIndex} index
 * @param {any} type
 * @returns {Record<string, any>[]}
 */
export function serversOfType(index, type) {
  if (!index.serversByType) {
    /** @type {Map<string, Record<string, any>[]>} */
    const byType = new Map();
    for (const srv of index.servers) {
      const key = norm(srv.type);
      let list = byType.get(key);
      if (!list) byType.set(key, list = []);
      list.push(srv);
    }
    // Roster order is normally creation order, which is already the
    // (arrivalTime, id) order idleOf() returns — flag it so callers can skip
    // the sort. (arrivalTime/id never change after creation.)
    for (const list of byType.values()) {
      /** @type {any} */ (list)._sortedForResources = list.every((srv, i) => i === 0 || compareResources(list[i - 1], srv) <= 0);
    }
    index.serversByType = byType;
    // Per-type idle/busy counts, kept current by setServerStatus /
    // setServerSuspended until the roster next changes.
    /** @type {Map<string, ServerTypeCounts>} */
    const counts = new Map();
    for (const [key, list] of byType) {
      const c = { idle: 0, busy: 0, snapIdle: 0, snapBusy: 0, snapFailed: 0, total: list.length };
      for (const srv of list) {
        const cls = serverCountClass(srv);
        if (cls) c[cls]++;
        const snapCls = serverSnapshotClass(srv);
        if (snapCls) c[snapCls]++;
        _serverMeta.set(srv, { index, key });
      }
      counts.set(key, c);
    }
    index.serverCountsByType = counts;
  }
  return index.serversByType.get(norm(type)) || [];
}

/**
 * @param {QueueIndex} index
 * @param {any} type
 * @returns {ServerTypeCounts}
 */
export function serverCountsOfType(index, type) {
  if (!index.serversByType || !index.serverCountsByType) serversOfType(index, type);
  return /** @type {Map<string, ServerTypeCounts>} */ (index.serverCountsByType).get(norm(type))
    || { idle: 0, busy: 0, snapIdle: 0, snapBusy: 0, snapFailed: 0, total: 0 };
}

// Snapshot classification (see ServerTypeCounts).
/** @param {Record<string, any>} srv @returns {"snapIdle"|"snapBusy"|"snapFailed"|null} */
function serverSnapshotClass(srv) {
  if (srv.status === "idle") return "snapIdle";
  if (srv.status === "busy" || srv.status === "serving" || srv.status === "turnaround") return "snapBusy";
  if (srv.status === "failed") return "snapFailed";
  return null;
}

// Which per-type count a server is in: idle(T).count / busy(T).count semantics.
/** @param {Record<string, any>} srv @returns {"idle"|"busy"|null} */
function serverCountClass(srv) {
  if (srv._suspended) return null;
  if (srv.status === "idle") return "idle";
  if (srv.status === "busy" || srv.status === "serving") return "busy";
  return null;
}

// Each indexed server's index and normalised type key, for count upkeep.
/** @type {WeakMap<object, { index: QueueIndex, key: string }>} */
const _serverMeta = new WeakMap();

/** @param {Record<string, any>} srv @param {() => void} change */
function changeServer(srv, change) {
  const meta = _serverMeta.get(srv);
  const counts = meta?.index.serverCountsByType?.get(meta.key);
  const before = counts ? serverCountClass(srv) : null;
  const snapBefore = counts ? serverSnapshotClass(srv) : null;
  change();
  if (!counts) return;
  const after = serverCountClass(srv);
  if (before !== after) {
    if (before) counts[before]--;
    if (after) counts[after]++;
  }
  const snapAfter = serverSnapshotClass(srv);
  if (snapBefore !== snapAfter) {
    if (snapBefore) counts[snapBefore]--;
    if (snapAfter) counts[snapAfter]++;
  }
}

/**
 * Set a server's status, keeping the index's per-type idle/busy counts exact.
 * @param {Record<string, any>} srv
 * @param {string} status
 */
export function setServerStatus(srv, status) {
  changeServer(srv, () => { srv.status = status; });
}

/**
 * @param {Record<string, any>} srv
 * @param {boolean} suspended
 */
export function setServerSuspended(srv, suspended) {
  changeServer(srv, () => {
    if (suspended) srv._suspended = true;
    else delete srv._suspended;
  });
}

/**
 * @param {QueueIndex|null} index
 * @param {string|null|undefined} queueName
 * @param {Record<string, any>} entity
 */
export function indexAdd(index, queueName, entity) {
  if (!index || !queueName) return;
  const key = norm(queueName);
  let bucket = index.waitingByQueue.get(key);
  if (!bucket) {
    bucket = [];
    index.waitingByQueue.set(key, bucket);
    index.fifoSortedByQueue.set(key, true);
  } else if (bucket.length && (entity.arrivalTime || 0) < (bucket[bucket.length - 1].arrivalTime || 0)) {
    index.fifoSortedByQueue.set(key, false);
  }
  bucket.push(entity);
}

/**
 * @param {QueueIndex|null} index
 * @param {string|null|undefined} queueName
 * @param {Record<string, any>} entity
 */
export function indexRemove(index, queueName, entity) {
  if (!index || !queueName) return;
  const bucket = index.waitingByQueue.get(norm(queueName));
  if (!bucket) return;
  const i = bucket.indexOf(entity);
  if (i !== -1) bucket.splice(i, 1);
}

/**
 * @param {QueueIndex|null} index
 * @param {string} queueName
 */
export function indexBucket(index, queueName) {
  if (!index) return null;
  return index.waitingByQueue.get(norm(queueName)) || [];
}

// Rebuilds the index from scratch in one O(live) pass. Only needed after
// bulk entity-array replacement that doesn't go through the chokepoints
// (there is currently no such site for waiting entities — prune only ever
// removes done/reneged entities, which are never in the index — but this is
// kept as a safety net for callers that construct/replace `entities` directly,
// e.g. tests).
/**
 * @param {QueueIndex} index
 * @param {Record<string, any>[]} entities
 */
export function rebuildQueueIndex(index, entities) {
  index.waitingByQueue.clear();
  index.fifoSortedByQueue.clear();
  for (const e of entities) {
    if (e.status === "waiting" && e.queue) indexAdd(index, e.queue, e);
  }
}

/**
 * Single authoritative queue-discipline selector (M4).
 * Returns the first entity from `entities` waiting in the named queue or type,
 * sorted by discipline. Set `isQueueName=true` to match entity.queue; false for entity.type.
 */
/**
 * @param {any} token
 * @param {string} discipline
 * @param {Record<string, any>[]} entities
 * @param {((entity: any) => boolean)|null} [filterFn]
 * @param {boolean} [isQueueName]
 * @param {QueueIndex|null} [index]
 */
export function selectWaiting(token, discipline, entities, filterFn = null, isQueueName = false, index = null) {
  return listWaiting(token, discipline, entities, filterFn, isQueueName, true, index)[0] ?? null;
}

/**
 * Sorted-list variant of selectWaiting. `includeBatches=false` excludes batch entities.
 * When `isQueueName` is true and `index` is supplied, reads the small per-queue
 * bucket instead of filtering the entire `entities` array — same resulting set
 * and sort order, just without the O(N) scan.
 */
/**
 * @param {any} token
 * @param {string} discipline
 * @param {Record<string, any>[]} entities
 * @param {((entity: any) => boolean)|null} [filterFn]
 * @param {boolean} [isQueueName]
 * @param {boolean} [includeBatches]
 * @param {QueueIndex|null} [index]
 */
export function listWaiting(token, discipline, entities, filterFn = null, isQueueName = false, includeBatches = true, index = null) {
  const key = norm(token);
  const useIndex = isQueueName && index;
  let pool;
  if (useIndex) {
    pool = readSortedBucket(index, token, discipline);
    if (!includeBatches) pool = pool.filter(e => e.role !== "batch");
  } else {
    pool = entities.filter(e => {
      if (e.status !== "waiting") return false;
      if (!includeBatches && e.role === "batch") return false;
      return isQueueName
        ? (e.queue && norm(e.queue) === key)
        : (norm(e.type) === key);
    });
  }
  if (filterFn) pool = pool.filter(filterFn);
  if (useIndex && isPlainFifo(discipline)) return [...pool];
  return sortWaitingEntities(pool, discipline);
}

/** @param {Record<string, any>[]} resources */
export function sortResourceEntities(resources) {
  return sortResourcesInPlace([...resources]);
}

// Same order as sortResourceEntities, for an array the caller already owns
// (e.g. a fresh .filter() result) — skips the extra copy.
/** @param {Record<string, any>[]} resources */
function sortResourcesInPlace(resources) {
  return resources.sort(compareResources);
}

/** @param {Record<string, any>} a @param {Record<string, any>} b */
function compareResources(a, b) {
  const timeDelta = (a.arrivalTime || 0) - (b.arrivalTime || 0);
  if (timeDelta !== 0) return timeDelta;
  return (a.id || 0) - (b.id || 0);
}

/**
 * @param {Record<string, any>} customer
 * @param {Record<string, any>} server
 * @param {number} clock
 * @param {string|null} [queueName]
 */
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

/**
 * @param {Record<string, any>} entity
 * @param {number} clock
 * @param {string|null} [queueName]
 */
function waitingSnapshot(entity, clock, queueName) {
  return {
    kind: "queue",
    queueName: queueName ?? entity.queue ?? entity.lastQueue ?? null,
    enteredAt: clock,
  };
}

/**
 * entity is genuinely required (the default queueName expression reads it
 * unguarded), but the `if (!entity) return false` below stays as defensive
 * belt-and-suspenders for callers this signature can't fully police.
 * @param {Record<string, any>} entity
 * @param {number} clock
 * @param {string|null} [queueName]
 * @param {QueueIndex|null} [index]
 */
export function markEntityWaiting(entity, clock, queueName = entity.queue ?? entity.lastQueue ?? null, index = null) {
  if (!entity) return false;
  if (entity.status === "done" || entity.status === "reneged" || entity.status === "balked") return false;
  // An entity can be re-routed into a new queue while already "waiting" in
  // another (e.g. RELEASE's provisional join immediately followed by
  // conditional/probabilistic routing's re-join) — no clearWaitingState runs
  // between the two, so the stale bucket entry must be dropped here.
  if (index && entity.status === "waiting" && entity.queue) {
    indexRemove(index, entity.queue, entity);
  }
  entity.status = "waiting";
  entity.queue = queueName;
  entity.waitingSince = clock;
  entity.waitingFor = waitingSnapshot(entity, clock, queueName);
  indexAdd(index, queueName, entity);
  return true;
}

/**
 * @param {Record<string, any>|null} entity
 * @param {QueueIndex|null} [index]
 */
export function clearWaitingState(entity, index = null) {
  if (!entity) return false;
  if (index && entity.status === "waiting" && entity.queue) {
    indexRemove(index, entity.queue, entity);
  }
  delete entity.waitingFor;
  delete entity.waitingSince;
  return true;
}

// How many servers each entity has ever claimed. While it is 1, no server
// other than the one just released can point at the entity, so completion and
// preemption can skip scanning the roster for co-seized partners. Kept off the
// entity object so it never shows up in results.
/** @type {WeakMap<object, number>} */
const _claimCounts = new WeakMap();
/** @param {Record<string, any>} entity */
export function noteServerClaim(entity) {
  _claimCounts.set(entity, (_claimCounts.get(entity) || 0) + 1);
}
/** @param {Record<string, any>} entity */
export function mayHoldOtherServers(entity) {
  return (_claimCounts.get(entity) || 0) > 1;
}

/**
 * @param {Record<string, any>|null} customer
 * @param {Record<string, any>|null} server
 * @param {number} clock
 * @param {QueueIndex|null} [index]
 * @param {Record<string, any>|null} [ctx]
 * @param {string|null} [skill]
 */
export function claimServerForEntity(customer, server, clock, index = null, ctx = null, skill = null) {
  if (!customer || !server) return false;
  if (customer.status !== "waiting" || server.status !== "idle") return false;
  // Servers seized by one ASSIGN/COSEIZE share a claim group, so a failure or
  // preemption can tell a stage's own (co-seized) servers from one the entity
  // still holds from an earlier stage. COSEIZE copies this onto its aux units.
  // Deterministic key (no shared counter), so identical runs stay identical.
  server._claimGroup = `${customer.id}@${server.id}@${clock}`;
  noteServerClaim(customer);

  const queueName = customer.queue ?? customer.lastQueue ?? null;
  const claim = claimSnapshot(customer, server, clock, queueName);

  clearWaitingState(customer, index);
  customer.status = "serving";
  customer.serviceStart = clock;
  customer.serverId = server.id;
  customer.lastQueue = queueName;
  customer.resourceClaim = claim;
  delete customer.queue;

  setServerStatus(server, "busy");
  server._busyStart = clock;
  server.currentCustId = customer.id;
  server._currentSkill = skill;
  server.resourceClaim = claim;

  // Tag with current shift label for per-shift utilisation tracking (F86.4)
  if (ctx?.state?.__currentShiftLabel?.[server.type]) {
    server._shiftLabel = ctx.state.__currentShiftLabel[server.type];
  }

  // Flush starvation timer — server was idle and is now busy
  if (server._starvationStart != null) {
    server._starvationTime = (server._starvationTime || 0) + Math.max(0, clock - server._starvationStart);
    delete server._starvationStart;
  }

  return true;
}

/**
 * @param {Record<string, any>|null} customer
 * @param {Record<string, any>|null} server
 * @param {number} clock
 */
export function releaseServerClaim(customer, server, clock) {
  if (!customer && !server) return false;

  if (customer) {
    delete customer.serverId;
    delete customer.resourceClaim;
  }
  if (server) {
    const prevSkill = server._currentSkill;
    const prevShiftLabel = server._shiftLabel;
    delete server.currentCustId;
    delete server.resourceClaim;
    delete server._currentSkill;
    if (server.status === "busy") {
      if (server._busyStart != null && clock != null) {
        const delta = Math.max(0, clock - server._busyStart);
        server._busyTime = (server._busyTime || 0) + delta;
        if (prevSkill) {
          if (!server._skillBusyTime) server._skillBusyTime = {};
          server._skillBusyTime[prevSkill] = (server._skillBusyTime[prevSkill] || 0) + delta;
        }
        // Per-shift utilisation (F86.4): attribute only THIS stint's duration to
        // the shift that was active when it started, into a per-label map —
        // never overwrite a single scalar with the label. server._shiftLabel is
        // only ever reassigned at the *next* claim, so without this map a server
        // that stays claimed across many stints/shifts has its entire lifetime
        // _busyTime silently misattributed to whichever shift happened to be
        // active at its most recent claim, wildly inflating that shift's
        // utilisation (seen as >100%, even >1000%, in practice) while starving
        // every other shift of the credit it actually earned.
        if (prevShiftLabel) {
          if (!server._shiftBusyTime) server._shiftBusyTime = {};
          server._shiftBusyTime[prevShiftLabel] = (server._shiftBusyTime[prevShiftLabel] || 0) + delta;
        }
      }
      delete server._busyStart;
      setServerStatus(server, "idle");
      // Start starvation timer — server just became idle; if no work arrives, this is starvation
      server._starvationStart = clock;
    }
  }

  return true;
}

// Selects which busy server (and, implicitly, its current customer) a
// PREEMPT/FINISH macro should act on. Mirrors queueDisciplineComparator's
// PRIORITY(attrName) idiom exactly (case-insensitive attr lookup, Infinity
// for missing, ascending sort) — the same attribute means the same thing
// whether it's driving a queue's discipline or a preemption/finish
// criterion. LONGEST/SHORTEST rank by elapsed service time (clock -
// serviceStart) rather than remaining time, since remaining time
// (srv._scheduledDuration) isn't reliably set for every busy server (only
// primary claims whose completion schedule uses useEntityCtx: true).
// No criterion, or an unrecognized one, falls back to the first busy
// server in filter order — today's behavior, unchanged.
/**
 * @param {Record<string, any>[]} busyServers
 * @param {string|null} criterion
 * @param {Record<string, any>[]} entities
 * @param {QueueIndex|null} index
 * @param {(msg: string) => void} [warn]
 */
export function selectVictimServer(busyServers, criterion, entities, index, warn) {
  if (!criterion) return busyServers[0] ?? null;

  const candidates = busyServers
    .map((/** @type {any} */ srv) => ({ srv, cust: findEntityById(index, entities, srv.currentCustId) }))
    .filter((/** @type {any} */ p) => p.cust);
  if (candidates.length === 0) return busyServers[0] ?? null;

  const priorityMatch = criterion.match(/^PRIORITY\((\w+)\)$/i);
  /** @type {((a: any, b: any) => number)|null} */
  let comparator = null;
  if (priorityMatch) {
    const attrNameUpper = priorityMatch[1].toUpperCase();
    comparator = (a, b) => {
      const findAttr = (/** @type {any} */ p) => {
        if (!p.cust.attrs) return Infinity;
        for (const key of Object.keys(p.cust.attrs)) {
          if (key.toUpperCase() === attrNameUpper) return Number(p.cust.attrs[key]);
        }
        return Infinity;
      };
      const pa = findAttr(a), pb = findAttr(b);
      if (pa !== pb) return pa - pb;
      return (a.cust.serviceStart ?? 0) - (b.cust.serviceStart ?? 0);
    };
  } else if (/^LONGEST$/i.test(criterion)) {
    comparator = (a, b) => (a.cust.serviceStart ?? 0) - (b.cust.serviceStart ?? 0);
  } else if (/^SHORTEST$/i.test(criterion)) {
    comparator = (a, b) => (b.cust.serviceStart ?? 0) - (a.cust.serviceStart ?? 0);
  }

  if (!comparator) {
    warn?.(`unrecognized selection criterion "${criterion}" — falling back to first busy server`);
    return busyServers[0] ?? null;
  }

  return [...candidates].sort(comparator)[0].srv;
}

// A preempted customer resumes an interrupted wait — it's not making a fresh decision
// to join a queue, so balking is skipped, but capacity/overflow (F11.1/F11.3) still
// applies (it could overflow/exit if its original queue is now full).
// ── Carried claims (an entity holding a server across stages) ─────────────
// COSEIZE(Q, Berth, VLCC) → RELEASE_COSEIZED([Berth]) → ASSIGN(Hormuz, Lane)
// → RELEASE(Lane) → DELAY(voyage) → RELEASE(VLCC): through the middle stages
// the entity "carries" its VLCC claim. A carried claim is any server claimed
// by the entity that is not part of the claim group serving its current
// stage (none, when the entity is waiting or in a DELAY).

/**
 * @param {Record<string, any>|null} cust
 * @param {Record<string, any>|null} srv
 * @param {Record<string, any>|null} [ctx]  needs entities (and index, if any)
 */
export function isCarriedClaim(cust, srv, ctx = null) {
  if (!cust || !srv || srv.currentCustId !== cust.id || srv._claimGroup == null) return false;
  let currentGroup = null;
  if (cust.status === "serving" && cust.serverId != null) {
    const primary = cust.serverId === srv.id ? srv : findEntityById(ctx?.index ?? null, ctx?.entities || [], cust.serverId);
    if (primary && primary.currentCustId === cust.id) currentGroup = primary._claimGroup ?? null;
  }
  return currentGroup == null || srv._claimGroup !== currentGroup;
}

/**
 * Drop a carried claim (its server failed, was preempted or removed): the
 * server is freed, the entity carries on with its current stage. The lost
 * type is remembered so the later RELEASE of it still routes the entity
 * instead of stranding it.
 * @param {Record<string, any>} cust
 * @param {Record<string, any>} srv
 * @param {number} clock
 * @param {Record<string, any>|null} ctx
 * @param {string} reason
 */
function dropCarriedClaim(cust, srv, clock, ctx, reason) {
  releaseServerClaim(null, srv, clock);
  cust._lostClaimTypes = [...(cust._lostClaimTypes || []), norm(srv.type)];
  ctx?.msgs?.push(`${reason}: #${cust.id} lost its ${srv.type} #${srv.id} (held from an earlier stage) — it continues its current stage`);
}

/**
 * True (and consumes the record) when this entity lost its claim on a server
 * of `serverType` to a failure/preemption — see dropCarriedClaim.
 * @param {Record<string, any>|null} cust
 * @param {string} serverType
 */
export function consumeLostClaim(cust, serverType) {
  if (!cust) return false;
  const list = cust?._lostClaimTypes;
  if (!Array.isArray(list)) return false;
  const i = list.indexOf(norm(serverType));
  if (i < 0) return false;
  list.splice(i, 1);
  if (!list.length) delete cust._lostClaimTypes;
  return true;
}

/**
 * @param {Record<string, any>} cust
 * @param {Record<string, any>} srv
 * @param {number} clock
 * @param {Record<string, any>} ctx
 * @param {string} [reason] — what triggered this interruption: "PREEMPT" (default,
 *   the PREEMPT macro), "FAIL" (the FAIL macro), "FAILURE" (automatic MTBF/MTTR
 *   breakdown), or "SHIFT_CHANGE" (reactive capacity retirement when a shift closes).
 */
export function preemptCustomer(cust, srv, clock, ctx, reason = "PREEMPT") {
  if (isCarriedClaim(cust, srv, ctx)) {
    dropCarriedClaim(cust, srv, clock, ctx, reason);
    return 0;
  }
  const scheduledDuration = srv._scheduledDuration || 0;
  const remainingService  = Math.max(0, scheduledDuration - (clock - (cust.serviceStart ?? clock)));
  cust._remainingService  = remainingService;
  // Count the interruption by the customer's entity type (F-request: "how many times
  // was a RepairJob preempted?") with a reason breakdown, mirroring the __balked/
  // __reneged state-counter convention and the endedBy BALK/BLOCK split from balked
  // entities (PR #517) — one shared shape for "why did this entity's flow get cut short".
  if (ctx?.state) {
    const state = ctx.state;
    state.__preemptCounts = state.__preemptCounts || {};
    const acc = state.__preemptCounts[cust.type] || (state.__preemptCounts[cust.type] = { total: 0, byReason: {} });
    acc.total++;
    acc.byReason[reason] = (acc.byReason[reason] || 0) + 1;
  }
  releaseServerClaim(cust, srv, clock);
  // Release any other co-seized servers still claimed by this customer (COSEIZE pattern) —
  // otherwise a PREEMPT/FAIL on one co-seized resource leaves the others stuck "busy" forever.
  // Only servers from the same claim group: a server the entity carries from
  // an earlier stage (see isCarriedClaim) stays with it.
  const auxiliaryBusy = !mayHoldOtherServers(cust) ? [] : (ctx?.index ? ctx.index.servers : (ctx?.entities || [])).filter((/** @type {any} */ e) =>
    e.role === "server" &&
    e.currentCustId === cust.id &&
    e.id !== srv.id &&
    (e.status === "busy" || e.status === "serving") &&
    (srv._claimGroup == null || e._claimGroup == null || e._claimGroup === srv._claimGroup)
  );
  for (const auxSrv of auxiliaryBusy) {
    releaseServerClaim(null, auxSrv, clock);
    ctx?.msgs?.push(`Server #${auxSrv.id} (${auxSrv.type}) → idle (COSEIZE release on preempt/fail)`);
  }
  clearWaitingState(cust, ctx?.index);
  attemptQueueJoin(cust, cust.lastQueue || cust.queue, clock, ctx, { skipBalk: true });
  return remainingService;
}

// Fold a server's lifetime stats into a persistent per-type accumulator before
// it's removed from `entities` (capacity retiring below headcount — shift
// close, preemption, or reactive excess retirement). Without this, a
// server's entire busy/starvation/downtime/per-shift history disappears from
// the run summary the moment it's retired — which happens routinely for any
// calendar-constrained resource that opens and closes every day. Always
// called on an idle server (releaseServerClaim/preemptCustomer already ran),
// so there is no in-progress busy segment left to compute here.
/**
 * @param {Record<string, any>|null} srv
 * @param {Record<string, any>|null} state
 */
export function flushRetiredServerStats(srv, state) {
  if (!srv || srv.role !== "server" || !state) return;
  state.__retiredResourceStats = state.__retiredResourceStats || {};
  const acc = state.__retiredResourceStats[srv.type] || (state.__retiredResourceStats[srv.type] = {
    busyTimeSum: 0, starvationTimeSum: 0, maxContStarvDur: 0, downtimeSum: 0, failureCount: 0,
    skillBusyTimeSum: {}, perShiftBusyTimeSum: {},
  });
  acc.busyTimeSum   += srv._busyTime      || 0;
  acc.turnaroundTimeSum = (acc.turnaroundTimeSum || 0) + (srv._turnaroundTime || 0);
  acc.downtimeSum   += srv._totalDowntime || 0;
  acc.failureCount  += srv._failureCount  || 0;
  const starv = srv._starvationTime || 0;
  acc.starvationTimeSum += starv;
  if (starv > acc.maxContStarvDur) acc.maxContStarvDur = starv;
  if (srv._skillBusyTime) {
    for (const [skill, bt] of Object.entries(srv._skillBusyTime)) {
      acc.skillBusyTimeSum[skill] = (acc.skillBusyTimeSum[skill] || 0) + bt;
    }
  }
  if (srv._shiftBusyTime) {
    for (const [label, bt] of Object.entries(srv._shiftBusyTime)) {
      acc.perShiftBusyTimeSum[label] = (acc.perShiftBusyTimeSum[label] || 0) + bt;
    }
  }
}

// ── Server turnaround (B4) ────────────────────────────────────────────────
// A server type with turnaroundDist/turnaroundDistParams is unavailable for a
// sampled time after it releases an entity — a tanker sailing back empty, an
// ambulance returning to base, an aircraft turnaround. The entity moves on
// immediately; the server sits in status "turnaround" (neither idle nor busy
// with an entity) until a TURNAROUND_END event makes it idle again. Applies on
// normal completion releases (RELEASE, RELEASE_COSEIZED, COMPLETE, FINISH),
// not when work is cut short by PREEMPT, FAIL or a shift change.

/**
 * @param {Record<string, any>|null|undefined} model
 * @param {string} serverType
 * @returns {{ dist: string, params: Record<string, any> } | null}
 */
export function turnaroundSpecFor(model, serverType) {
  const key = norm(serverType);
  const et = (model?.entityTypes || []).find((/** @type {any} */ t) => t.role === "server" && norm(t.name) === key);
  if (!et?.turnaroundDist || !et.turnaroundDistParams) return null;
  return { dist: et.turnaroundDist, params: et.turnaroundDistParams };
}

/**
 * Put a just-released (idle) server into turnaround when its type defines one.
 * @param {Record<string, any>} srv
 * @param {Record<string, any>} ctx  macro ctx: model, rng, streamRegistry, clock, scheduleEvent, msgs
 * @returns {number} the sampled turnaround time (0 = none)
 */
export function beginTurnaround(srv, ctx) {
  if (!srv || srv.role !== "server" || srv.status !== "idle" || typeof ctx?.scheduleEvent !== "function") return 0;
  const spec = turnaroundSpecFor(ctx.model, srv.type);
  if (!spec) return 0;
  const duration = Math.max(0, Number(sample(spec.dist, spec.params, ctx.rng, null, {
    streamName: `turnaround:${srv.type}`,
    streamRegistry: ctx.streamRegistry,
  })) || 0);
  if (!(duration > 0)) return 0;
  // Not starving while away: releaseServerClaim started the idle timer.
  delete srv._starvationStart;
  setServerStatus(srv, "turnaround");
  srv._turnaroundStart = ctx.clock;
  srv._turnaroundToken = (srv._turnaroundToken || 0) + 1;
  ctx.scheduleEvent({
    id: `turnaround:${srv.id}:${srv._turnaroundToken}`,
    type: "TURNAROUND_END",
    name: `Turnaround complete: ${srv.type}`,
    serverTypeName: srv.type,
    serverId: srv.id,
    token: srv._turnaroundToken,
    scheduledTime: ctx.clock + duration,
  });
  ctx.msgs?.push(`Server #${srv.id} (${srv.type}) → turnaround for ${duration.toFixed(3)} t`);
  return duration;
}

/**
 * Close a server's turnaround interval (on TURNAROUND_END, or a failure during
 * turnaround). Leaves the status for the caller to set.
 * @param {Record<string, any>} srv
 * @param {number} clock
 */
export function endTurnaround(srv, clock) {
  if (!srv || srv.status !== "turnaround") return 0;
  const elapsed = srv._turnaroundStart != null ? Math.max(0, clock - srv._turnaroundStart) : 0;
  srv._turnaroundTime = (srv._turnaroundTime || 0) + elapsed;
  srv._turnaroundCount = (srv._turnaroundCount || 0) + 1;
  delete srv._turnaroundStart;
  return elapsed;
}

/**
 * @param {Record<string, any>[]} failedServers
 * @param {number} clock
 */
export function repairServers(failedServers, clock) {
  let count = 0;
  for (const srv of failedServers) {
    const failedAt = srv._failedAt;
    const downtime  = failedAt != null ? +(clock - failedAt).toFixed(4) : 0;
    // Flush any pre-failure starvation interval [_starvationStart, failedAt) that the
    // FAILURE handler never closed out, so idle time before a breakdown isn't lost.
    if (srv._starvationStart != null) {
      const flushUpTo = Number.isFinite(failedAt) ? failedAt : clock;
      srv._starvationTime = (srv._starvationTime || 0) + Math.max(0, flushUpTo - srv._starvationStart);
    }
    setServerStatus(srv, "idle");
    srv._starvationStart = clock;
    srv._failedAt    = undefined;
    srv._downtime    = downtime;
    srv._totalDowntime = (srv._totalDowntime || 0) + downtime;
    srv._failureCount  = (srv._failureCount  || 0) + 1;
    count++;
  }
  return count;
}

/**
 * Removes terminal (done/reneged/balked) customer entities from the live
 * entity pool, and drops any FEL entries that exist only to act on a removed
 * entity (auto-renege timers, cSchedule completions requiring entity
 * context). Servers are never removed — they're long-lived resources, not
 * flow entities. Shared by the one-time warmup prune and the periodic
 * in-run prune so the FEL carve-out rule never drifts between the two.
 */
/**
 * @param {Record<string, any>[]} entities
 * @param {Record<string, any>[]} fel
 */
export function pruneTerminalEntities(entities, fel) {
  const kept = [];
  const removed = [];
  for (const e of entities) {
    if (e.role === "server" || (e.status !== "done" && e.status !== "reneged" && e.status !== "balked")) {
      kept.push(e);
    } else {
      removed.push(e);
    }
  }
  if (removed.length === 0) return { entities, fel, removed };

  const activeIds = new Set(kept.map(e => e.id));
  const keptFel = fel.filter(ev => {
    if (ev._contextCustId == null) return true;
    if (!ev._isRenege && !ev._requiresCtxEntity) return true;
    return activeIds.has(ev._contextCustId);
  });
  return { entities: kept, fel: keptFel, removed };
}

/**
 * @param {Record<string, any>|null} model
 * @param {any} token
 */
export function findQueueConfig(model, token) {
  const key = norm(token);
  return (model?.queues || []).find((/** @type {any} */ queue) => norm(queue.name) === key || norm(queue.customerType) === key) || null;
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
/**
 * @param {Record<string, any>} entity
 * @param {string} queueName
 * @param {number} clock
 * @param {Record<string, any>} ctx
 * @param {Record<string, any>} [opts]
 * @returns {boolean}
 */
export function attemptQueueJoin(entity, queueName, clock, ctx, opts = {}) {
  const { model, entities } = ctx;
  const qDef = findQueueConfig(model, queueName);
  const visited = opts.visitedQueues || new Set();
  const qKey = norm(qDef?.name || queueName);

  if (visited.has(qKey)) {
    discardFailedJoin(entity, ctx, `#${entity.id} (${entity.type}) overflow cycle detected at "${queueName}" — exited system`, {
      clock,
      queueName,
      routeId: `block:cycle:${qKey}`,
      routeLabel: `Blocked at "${queueName}" (overflow cycle)`,
      endedBy: "BLOCK",
    });
    return false;
  }
  visited.add(qKey);

  const queueDepth = () => ctx.index
    ? (indexBucket(ctx.index, queueName) || []).length
    : entities.filter((/** @type {any} */ e) => e.status === "waiting" && norm(e.queue) === norm(queueName)).length;

  if (!opts.skipBalk) {
    const balkCondition = qDef?.balkCondition ?? opts.legacyBalkCondition ?? null;
    if (balkCondition) {
      const qLen = queueDepth();
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
      const currentDepth = queueDepth();
      if (currentDepth >= cap) {
        return rerouteOrExit("blockingCount", `blocked (capacity ${cap})`, entity, qDef, queueName, clock, ctx, visited);
      }
    }
  }

  markEntityWaiting(entity, clock, queueName, ctx.index);
  const alreadyLive = ctx.index ? ctx.index.byId.get(entity.id) === entity : entities.includes(entity);
  if (!alreadyLive) {
    entities.push(entity);
    indexTrackEntity(ctx.index, entity);
    ctx.noteEntityCreated?.(entity);
  } else {
    ctx.noteQueueDepth?.(queueName);
  }
  ctx.setLastCustId?.(entity.id);
  if (qDef?.renegeDist) scheduleAutoRenege(entity, qDef, clock, ctx);
  return true;
}

/**
 * Records an entity's terminal outcome — how and why it left the system.
 * Shared by every macro/mechanism that ends an entity's journey (RENEGE,
 * RENEGE_OLDEST, COMPLETE/FINISH family, JOIN/MATCH family-completion, and
 * discardFailedJoin below for balked/blocked entities) so `getSummary()`'s
 * outcomes/journeys aggregation has one consistent shape to read regardless
 * of which mechanism produced it.
 * @param {Record<string, any>|null} entity
 * @param {{ status: string, routeId?: string, routeLabel?: string, endedBy: string, endedAt: number, sourceEventId?: any, sourceEventName?: any }} outcome
 */
export function setOutcome(entity, { status, routeId, routeLabel, endedBy, endedAt, sourceEventId = null, sourceEventName = null }) {
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

/**
 * @param {string} metricKey
 * @param {string} reasonLabel
 * @param {Record<string, any>} entity
 * @param {Record<string, any>|null} qDef
 * @param {string} queueName
 * @param {number} clock
 * @param {Record<string, any>} ctx
 * @param {Set<any>} visited
 * @returns {boolean}
 */
function rerouteOrExit(metricKey, reasonLabel, entity, qDef, queueName, clock, ctx, visited) {
  ctx.incQueueMetric?.(queueName, metricKey);
  const dest = qDef?.overflowDestination ?? null;
  if (dest) {
    ctx.msgs?.push(`#${entity.id} (${entity.type}) ${reasonLabel} at "${queueName}" → rerouted to "${dest}"`);
    return attemptQueueJoin(entity, dest, clock, ctx, { visitedQueues: visited });
  }
  const endedBy = metricKey === "balkCount" ? "BALK" : "BLOCK";
  discardFailedJoin(entity, ctx, `#${entity.id} (${entity.type}) ${reasonLabel} at "${queueName}" — exited system`, {
    clock,
    queueName,
    routeId: `${metricKey === "balkCount" ? "balk" : "block"}:${norm(queueName)}`,
    routeLabel: `${metricKey === "balkCount" ? "Balked" : "Blocked"} at "${queueName}"`,
    endedBy,
  });
  return false;
}

/**
 * An entity balked, was blocked at capacity, or hit an overflow-routing
 * cycle, and has nowhere left to go. Gives it a terminal "balked" status +
 * outcome record — mirroring RENEGE's shape — instead of silently vanishing
 * with no trace at all (the previous behavior: spliced out of `entities`
 * with no status change, so it could never appear in outcomes, journeys, or
 * even the total-arrived count).
 *
 * If the entity was never live in `ctx.entities` (e.g. it balked immediately
 * on ARRIVE, before ever successfully joining anything), it is added now —
 * the same way a successful join would have — so it is counted the same way
 * a customer who arrives and immediately reneges still is.
 * @param {Record<string, any>} entity
 * @param {Record<string, any>} ctx
 * @param {string} msg
 * @param {{ clock: number, queueName?: string, routeId: string, routeLabel: string, endedBy: string }} outcome
 */
function discardFailedJoin(entity, ctx, msg, { clock, queueName, routeId, routeLabel, endedBy }) {
  const { entities } = ctx;
  const alreadyLive = ctx.index ? ctx.index.byId.get(entity.id) === entity : entities.includes(entity);
  if (!alreadyLive) {
    entities.push(entity);
    indexTrackEntity(ctx.index, entity);
    ctx.noteEntityCreated?.(entity);
  }
  markTerminal(ctx.index, entity, "balked");
  entity.balkTime = clock;
  // The entity never actually joined `queueName` (that's the whole point of
  // balking/blocking), so `.queue`/`.lastQueue` are never set for it here —
  // but the live snapshot's per-queue breakdown (engine/index.js `snap().byQueue`)
  // still needs to attribute this balk/block to the specific queue it happened
  // at, not just the model-wide total. Record it in its own field so that
  // attribution doesn't collide with `.lastQueue`'s existing "queue this
  // entity actually waited/was served from" meaning used elsewhere.
  if (queueName) entity.terminalQueue = queueName;
  setOutcome(entity, { status: "balked", routeId, routeLabel, endedBy, endedAt: clock });
  if (ctx.state) ctx.state.__balked = (ctx.state.__balked || 0) + 1;
  ctx.msgs?.push(msg);
}

/**
 * @param {Record<string, any>} entity
 * @param {Record<string, any>} qDef
 * @param {number} clock
 * @param {Record<string, any>} ctx
 */
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
/**
 * @param {string} typeName
 * @param {string|null} [role]
 * @param {Record<string, any>} [attrs]
 * @param {number} [clock]
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
/**
 * @param {Record<string, any>[]} entityTypes
 * @param {(attrDefs: any) => Record<string, any>} sampleAttrsFn
 * @param {(() => number)|null} [rng]
 */
export function createServerEntities(entityTypes, sampleAttrsFn, rng = null) {
  const entities = [];
  for (const et of entityTypes) {
    if (et.role !== "server") continue;
    // A schedulePattern-closed resource legitimately starts at count 0
    // (modelWithShiftInitialCapacity resolves this before entities are built) —
    // only fall back to 1 when count is missing/invalid, not when it's a valid 0.
    // (`parseInt(et.count) || 1` previously treated a real 0 the same as NaN.)
    const parsedCount = parseInt(et.count, 10);
    const count = Number.isInteger(parsedCount) && parsedCount >= 0 ? parsedCount : 1;
    const profiles = Array.isArray(et.skillProfiles) ? et.skillProfiles : null;

    // Pre-calculate count-based profile assignments
    const countProfiles = profiles ? profiles.filter(p => p.count != null && p.count > 0) : [];
    const weightProfiles = profiles ? profiles.filter(p => p.weight != null && !(p.count != null && p.count > 0)) : [];
    let cumulativeCount = 0;
    const countAssignments = [];
    for (const p of countProfiles) {
      const n = Math.min(p.count, count - cumulativeCount);
      countAssignments.push({ profile: p, count: n });
      cumulativeCount += n;
    }

    for (let i = 0; i < count; i++) {
      /** @type {Record<string, any>} */
      const server = {
        id:          nextId(),
        type:        et.name.trim(),
        role:        "server",
        status:      "idle",
        attrs:       sampleAttrsFn(et.attrDefs || et.attrs),
        arrivalTime: 0,
        stages:      [],
        _starvationStart: 0,
        _instanceIndex: i,
      };

      // Assign instance skills from profiles
      if (profiles) {
        const instanceSkills = new Set();
        let skillPriority = 0;

        // Count-based: servers 0..N get assigned profiles in order
        let slot = i;
        for (const { profile, count: c } of countAssignments) {
          if (slot < c) {
            (profile.skills || []).forEach((/** @type {any} */ s) => instanceSkills.add(s));
            skillPriority = Math.max(skillPriority, Number(profile.priority) || 0);
            break;
          }
          slot -= c;
        }

        // Weight-based: each server independently rolls for each weight profile
        if (rng) {
          for (const p of weightProfiles) {
            const w = Math.max(0, Math.min(100, Number(p.weight) || 0));
            if (w > 0 && rng() < w / 100) {
              (p.skills || []).forEach((/** @type {any} */ s) => instanceSkills.add(s));
              skillPriority = Math.max(skillPriority, Number(p.priority) || 0);
            }
          }
        }

        server.skills = instanceSkills.size > 0 ? [...instanceSkills] : undefined;
        server._skillPriority = skillPriority;
      }

      entities.push(server);
    }
  }
  return entities;
}

/**
 * Status filter helpers — all case-insensitive on type name.
 */
// Server entity-type definitions by normalised name, cached per model object.
/** @type {WeakMap<object, Map<string, any>>} */
const _serverTypeDefCache = new WeakMap();
/** @param {any} model @param {any} typeName */
function serverTypeDef(model, typeName) {
  if (!model) return undefined;
  let byName = _serverTypeDefCache.get(model);
  if (!byName) {
    byName = new Map();
    for (const et of model.entityTypes || []) {
      if (et.role === "server" && !byName.has(norm(et.name))) byName.set(norm(et.name), et);
    }
    _serverTypeDefCache.set(model, byName);
  }
  return byName.get(norm(typeName));
}

/**
 * @param {Record<string, any>[]} entities
 * @param {Record<string, any>|null} [model]
 * @param {QueueIndex|null} [index]
 */
export function makeHelpers(entities, model = null, index = null) {
  const match = (/** @type {any} */ a, /** @type {any} */ b) => norm(a) === norm(b);

  // The small, stable server roster when an index is available, falling back
  // to scanning the full (potentially huge) entities array otherwise.
  const serverPool = () => index ? index.servers : entities.filter((/** @type {any} */ e) => e.role === "server");
  // Servers of one type (index-backed; full scan only without an index).
  const typePool = (/** @type {any} */ type) => index
    ? serversOfType(index, type)
    : entities.filter((/** @type {any} */ e) => e.role === "server" && match(e.type, type));
  /** @param {any} type @param {(e: any) => boolean} pred */
  const countOfType = (type, pred) => {
    let n = 0;
    for (const e of typePool(type)) if (pred(e)) n++;
    return n;
  };
  const isIdle = (/** @type {any} */ e) => e.status === "idle" && !e._suspended;
  // A filtered subset in resource order; a type bucket already in that order
  // (see serversOfType) needs no sort.
  /** @param {Record<string, any>[]} pool @param {(e: any) => boolean} pred */
  const sortedSubset = (pool, pred) => {
    const subset = pool.filter(pred);
    return /** @type {any} */ (pool)._sortedForResources ? subset : sortResourcesInPlace(subset);
  };
  const isBusy = (/** @type {any} */ e) => (e.status === "busy" || e.status === "serving") && !e._suspended;

  /**
   * @param {(entity: any) => boolean} predicate
   * @param {string} [discipline]
   * @param {((entity: any) => boolean)|null} [filterFn]
   */
  function filterWaiting(predicate, discipline = "FIFO", filterFn = null) {
    let waiting = entities.filter((/** @type {any} */ entity) => entity.status === "waiting" && predicate(entity));
    if (filterFn) waiting = waiting.filter(filterFn);
    return sortWaitingEntities(waiting, discipline);
  }

  /**
   * @param {any} queueName
   * @param {boolean} includeBatches
   */
  function makeQueueFilter(queueName, includeBatches) {
    return (/** @type {any} */ entity) => {
      if (!entity.queue || !match(entity.queue, queueName)) return false;
      if (!includeBatches && entity.role === "batch") return false;
      return true;
    };
  }

  // Reads the small per-queue index bucket when available instead of
  // filtering the entire (potentially huge) `entities` array — this is the
  // dominant cost for congested models, since waitingInQueue backs both
  // queue(Name).length predicate evaluation and ASSIGN/DELAY/BATCH/MATCH/
  // COSEIZE candidate lookups.
  /**
   * @param {any} queueName
   * @param {string} [discipline]
   * @param {((entity: any) => boolean)|null} [filterFn]
   * @param {boolean} [includeBatches]
   */
  function waitingInQueue(queueName, discipline = "FIFO", filterFn = null, includeBatches = true) {
    let pool = index ? readSortedBucket(index, queueName, discipline) : entities.filter(makeQueueFilter(queueName, includeBatches));
    if (index && !includeBatches) pool = pool.filter((/** @type {any} */ e) => e.role !== "batch");
    if (filterFn) pool = pool.filter(filterFn);
    if (index && isPlainFifo(discipline)) return [...pool];
    return sortWaitingEntities(pool, discipline);
  }

  // A server "has" a skill either via its type's static skills[] or its own
  // per-instance skills[] (from skillProfiles) — shared by hasSkillType and
  // idleOfAnySkill (cross-type ASSIGN pooling).
  /**
   * @param {any} entity
   * @param {any} skill
   */
  function entityHasSkill(entity, skill) {
    if (Array.isArray(entity.skills) && entity.skills.includes(skill)) return true;
    const et = (model?.entityTypes || []).find((/** @type {any} */ t) => t.role === "server" && match(t.name, entity.type));
    return !!(et && Array.isArray(et.skills) && et.skills.includes(skill));
  }

  return {
    entities,
    model,
    findQueueConfig: (/** @type {any} */ token) => findQueueConfig(model, token),

    waitingOf: (/** @type {any} */ type, /** @type {string} */ discipline = "FIFO", /** @type {any} */ filterFn = null) =>
      filterWaiting((entity) => match(entity.type, type), discipline, filterFn),

    waitingInQueue,

    selectWaitingOf: (/** @type {any} */ type, /** @type {string} */ discipline = "FIFO", /** @type {any} */ filterFn = null) =>
      filterWaiting((entity) => match(entity.type, type), discipline, filterFn)[0],

    selectWaitingInQueue: (/** @type {any} */ queueName, /** @type {string} */ discipline = "FIFO", /** @type {any} */ filterFn = null, includeBatches = true) =>
      waitingInQueue(queueName, discipline, filterFn, includeBatches)[0],

    idleOf: (/** @type {any} */ type) => sortedSubset(typePool(type), isIdle),

    // Counts for idle(T).count / busy(T).count conditions — no copy, no sort.
    idleCount: (/** @type {any} */ type) => index ? serverCountsOfType(index, type).idle : countOfType(type, isIdle),
    busyCount: (/** @type {any} */ type) => index ? serverCountsOfType(index, type).busy : countOfType(type, isBusy),

    // Cross-type pooling for ASSIGN(Queue, ANY, "Skill") — idle servers of any
    // type that carry the given skill, still sorted FIFO by idle-since time.
    idleOfAnySkill: (/** @type {any} */ skill) =>
      sortResourceEntities(serverPool().filter((/** @type {any} */ e) => e.status === "idle" && !e._suspended && entityHasSkill(e, skill))),

    busyOf: (/** @type {any} */ type) => sortedSubset(typePool(type), isBusy),

    failedOf: (/** @type {any} */ type) => sortedSubset(typePool(type), (/** @type {any} */ e) => e.status === "failed"),

    selectIdleOf: (/** @type {any} */ type) => sortedSubset(typePool(type), isIdle)[0],

    // Same server as idleOf(type)[0], without building the whole list when the
    // type's bucket is already in resource order.
    firstIdleOf: (/** @type {any} */ type) => {
      const pool = typePool(type);
      if (!/** @type {any} */ (pool)._sortedForResources) return sortedSubset(pool, isIdle)[0] ?? null;
      for (const e of pool) if (isIdle(e)) return e;
      return null;
    },

    hasSkillType: (/** @type {any} */ typeName, /** @type {any} */ skill) => {
      const et = serverTypeDef(model, typeName);
      return et && Array.isArray(et.skills) && et.skills.includes(skill);
    },

    findById: (/** @type {any} */ id) =>
      findEntityById(index, entities, id),

    allCustomers: () =>
      entities.filter((/** @type {any} */ e) => e.role !== "server"),

    allServers: () =>
      serverPool(),
  };
}

