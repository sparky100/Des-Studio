# ADR-017: Queue-Scoped Balking, Capacity, and Reneging

**Date:** 2026-06-18
**Status:** Accepted
**Decided by:** Architecture review

---

## Context

### The problem

Balking (F11.2) and queue-capacity/overflow (F11.1/F11.3) were enforced
only inside the `ARRIVE` macro — the mechanism by which an entity joins
the *first* queue of its journey. Every later queue-join in a multi-stage
process (`RELEASE(Server, Queue)`, conditional routing, probabilistic
routing, `BATCH`/`UNBATCH`/`SPLIT`, preemption re-queue, loop-guard exit)
called `markEntityWaiting()` directly with no check at all.

In a real multi-stage model (e.g. a finish-line → recovery → voucher →
food/drink → exit flow), entities reach later-stage queues via `RELEASE`
and routing, not `ARRIVE`. Those queues already accept a `capacity` and
`overflowDestination` in the UI, but the fields silently did nothing —
the queue could overfill indefinitely and no balking ever occurred past
the first stage.

A related bug: when an overflow *did* trigger (at the first-stage
`ARRIVE` only), the reroute to `overflowDestination` called
`markEntityWaiting` directly on the destination queue, never re-checking
*that* queue's own capacity. An overflow chain (A full → reroute to B,
B also full) silently overfilled B rather than rerouting again or exiting.

Reneging was more flexible — it could be wired to any B-event via
`schedules[{isRenege:true}]` — but required hand-authoring a separate
`RENEGE(ctx)` B-event and referencing its `eventId` from every event that
might feed a given queue. There was no per-queue notion of "patience".

### Why this matters

Capacity, balking, and reneging are properties of the *queue* — a
physical or policy limit on how many entities a buffer can hold, and how
impatient entities are while waiting in it — not properties of whichever
specific macro call happens to deliver an entity into that buffer. The
old design conflated "the entity's source mechanism" with "the queue's
behavioural rules", which broke as soon as a model had more than one
queue-joining mechanism feeding the same buffer (the common case in any
multi-stage process).

---

## Decision

**Centralize balking, capacity/overflow, and (optionally) reneging into
a single join function, `attemptQueueJoin()`, and make balking/reneging
configuration live on the Queue object instead of the B-event.**

### `attemptQueueJoin(entity, queueName, clock, ctx, opts = {})`

Added to `src/engine/entities.js`, alongside `markEntityWaiting` and
`findQueueConfig`, which it wraps. Order of checks:

1. **Balk check** (F11.2) — `qDef.balkCondition` (via `evaluatePredicate`)
   and/or `qDef.balkProbability` (via `ctx.rng()`).
2. **Capacity/overflow check** (F11.1/F11.3) — if the queue is at
   `capacity`, reroute to `qDef.overflowDestination` (recursing back into
   `attemptQueueJoin` against the destination, see below) or exit the
   system if unset.
3. On success — `markEntityWaiting(entity, clock, queueName)`, then
   schedule an auto-renege timer if `qDef.renegeDist` is set.

Returns `true`/`false` so callers know whether the entity is still live.

Every call site that used to call `markEntityWaiting` directly now calls
`attemptQueueJoin` instead: `ARRIVE`, `RELEASE`, `BATCH`, `UNBATCH`,
`SPLIT`, conditional/probabilistic routing (`applyRoute` in
`phases.js`), loop-guard exit, and preemption re-queue (with
`opts.skipBalk: true` — a preempted entity is resuming an interrupted
wait, not making a fresh decision to join, but capacity still applies).

### Recursive overflow chains

`rerouteOrExit()` (the balk-reroute / capacity-overflow-reroute helper,
relocated from `macros.js` into `entities.js`) recurses into
`attemptQueueJoin` against the overflow destination instead of calling
`markEntityWaiting` directly, threading a `visitedQueues` Set through
`opts` to guarantee termination. A→B→C overflow chains are now correctly
re-checked at every hop; a cycle (A→B, B→A) falls back to "exit system"
rather than looping or silently overfilling. **V46** (new validation
rule) detects `overflowDestination` cycles at design time.

### Queue-level auto-reneging

`renegeDist`/`renegeDistParams` on the Queue. When set, the engine
auto-schedules a `RENEGE(ctx)` FEL entry the moment an entity
successfully joins — no model-authored B-event or `eventId` wiring
required. The existing manual `schedules[{isRenege:true, eventId}]`
mechanism is unchanged and can coexist on the same queue (the existing
"skip if not still waiting" guard at fire time prevents any double-fire
harm).

### New Queue fields

```
balkProbability   number, ∈ [0,1] (V21, moved from B-event scope)
balkCondition     predicate object { variable, operator, value } (CHK-011)
renegeDist        distribution name
renegeDistParams  distribution params (all string values)
```

### Backward compatibility

Legacy models with `balkProbability`/`balkCondition` on the ARRIVE
B-event are migrated onto the matching queue automatically at load time
via `migrateBalkingToQueues()` (`src/model/balkMigration.js`) — pure,
idempotent, never clobbers a queue's own pre-existing balk fields. The
legacy fields are left in place on the B-event (harmless) rather than
stripped. `attemptQueueJoin` also reads
`qDef.balkCondition ?? felRef?.balkCondition` as permanent
defense-in-depth for hand-edited/legacy JSON that bypasses `norm()`.

---

## Alternatives Considered

### A — Keep balking on the B-event, duplicate the check at every call site

Rejected: requires every join mechanism to carry its own balk
configuration, defeating the purpose (a queue reached by both `ARRIVE`
and `RELEASE` would need the same balk rule authored twice, and could
drift out of sync).

### B — Check capacity/balking only at `ARRIVE`, leave later stages
unchecked (status quo)

Rejected by the user as the explicit problem this ADR fixes — multi-stage
processes are the common case, not the exception.

### C — This decision (selected)

Centralizes the join-time checks in one function reused by every
queue-joining macro/mechanism, makes balking/reneging configuration a
queue property (matching the mental model of "this buffer has these
rules"), and fixes the overflow-chain recursion bug as a natural
consequence of having one join path instead of many duplicated ones.
**Accepted.**

---

## Consequences

### Positive

- Balking, capacity, and reneging behave identically no matter which
  macro delivers an entity into a queue.
- Overflow chains (A→B→C) are correctly re-validated at every hop instead
  of silently overfilling the second hop.
- Queue-level `renegeDist` removes the need to hand-wire a `RENEGE(ctx)`
  B-event for the common "every path into this queue shares one patience
  distribution" case.
- One centralized function (`attemptQueueJoin`) is the single place to
  extend join-time behavior in the future (e.g. jockeying, deferred).

### Negative

- `preemptCustomer`'s signature changed from
  `(cust, srv, clock, noteQueueDepth)` to `(cust, srv, clock, ctx)` —
  callers must pass the engine context, not a standalone depth-tracking
  callback.
- Models hand-authored against the old schema (balking on the B-event)
  continue to work only because of the migration step; new models should
  be authored with balking on the Queue from the start.

### Schema contract (per CLAUDE.md)

`balkProbability`, `balkCondition`, `renegeDist`, `renegeDistParams` on
the Queue flow through `db/models.js` serialization (`queues` is a
dedicated `jsonb` column, not nested in `model_json`, so no DDL/migration
was required) — round-trip assertions added to `tests/db/models.test.js`.

---

## Related

- `docs/model-schema-for-llm.md` §3 (Queue schema), §10 (validation table:
  V21 relocated, V46 added, CHK-011 extended to queues), and the new
  "Queue-level automatic reneging" subsection.
- `docs/patterns/04-reneging-abandonment.md` — zero-wiring `renegeDist`
  alternative.
- `docs/patterns/05-finite-capacity-balking.md` — multi-stage capacity
  now genuinely enforced at every stage, not just the first.
