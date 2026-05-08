# ADR-012: Recirculation and Batching Design

**Date:** 2026-05-08
**Status:** Accepted
**Sprint:** Sprint 12

## Context

Sprint 12 adds two modelling capabilities: entity batching (assembly/kitting) and controlled recirculation (rework loops). These are the most architecturally complex extensions, deferred until routing (Sprint 10) and capacity (Sprint 11) were stable.

Four design questions needed answers before any code could be written:

1. **Back-edges** — how to represent recirculation loops in `model_json` without breaking the existing DAG (directed acyclic graph) topology enforcement.
2. **Loop guard** — what mechanism prevents infinite loops. Without a guard, a model with a back-edge would cycle forever until the Phase C pass cap or cycle limit is hit.
3. **BATCH semantics** — how entities accumulate into a batch. The macro vocabulary already has SEIZE (take one entity from queue); BATCH must accumulate N entities before proceeding.
4. **UNBATCH semantics** — whether dispersed entities are new instances or restored originals. Affects attribute preservation, arrivalTime, and stage history.

## Decision

### Decision 1 — Back-edge representation

Back-edges are represented by an explicit `loop` flag on edges in `model_json.graph.edges[]`:

```json
{
  "id": "edge:activity:queue-rework",
  "from": "activity:activity_1",
  "to": "queue:queue_2",
  "source": "routing",
  "label": "rework (30%)",
  "loop": true,
  "maxLoopCount": 3,
  "exitQueueName": "Sink"
}
```

The DAG enforcement in `graph-operations.js` (`wouldCreateCycle`) is relaxed only for edges where `loop` is explicitly `true`. All other edges remain cycle-checked. This is a narrow opt-in relaxation — not a removal of the cycle rule.

The back-edge is stored on the visual edge metadata, not on the canonical model's B-Event or C-Event definitions. The canonical model remains DAG-compatible; the loop metadata is presentation-layer information about which route is a rework path. This avoids schema changes to the five canonical keys (`entityTypes`, `stateVariables`, `bEvents`, `cEvents`, `queues`).

Derivation (`deriveGraphFromModel`) auto-detects back-edges: when an Activity's routing table targets a queue that is already upstream of that Activity in the flow topology, the derived edge gets `loop: true`.

### Decision 2 — Loop guard (Option C)

Both guards are required:

1. **Max recirculation count** on each loop edge (`maxLoopCount`, integer >= 1). The engine tracks `Entity.loopCount` and increments it each time an entity crosses a loop edge. When `loopCount >= maxLoopCount`, the entity is routed to `exitQueueName` instead.
2. **Conditional exit** — the model can ALSO use a C-Event condition to route entities out of the loop early based on entity state (e.g., `Entity.quality == "pass"`). The predicate builder exposes `Entity.loopCount` as a condition token.

The engine enforces the max count as a hard guard. The modeller also has the option to add conditional early exit via the Predicate Builder. This prevents infinite loops even if the model's conditions are incorrectly configured.

**`exitQueueName` behaviour:**
- If set to a valid queue name: entity is routed to that queue when maxLoopCount is reached
- If set to null/empty ("Exit system"): entity is marked done and counted as served when maxLoopCount is reached

### Decision 3 — BATCH (queue-accumulation, Option A)

BATCH accumulates entities in a queue. When the queue depth reaches `batchSize`, the BATCH C-Event fires, removes `batchSize` entities, creates a parent batch entity, and places it in the target queue.

```javascript
BATCH(QueueName, batchSize)
```

- `QueueName` — the queue to accumulate entities in. Must exist. Entities arrive here via normal ARRIVE.
- `batchSize` — integer >= 2. Minimum number of entities to form a batch.
- The parent entity (`role: "batch"`) carries `batch.children = [entity1, entity2, ...]` storing original entities.
- Parent entity attributes are copied from the first child.
- BATCH is a **C-Event action** — fires when `queue(QueueName).length >= batchSize`.
- If more entities are waiting than batchSize, only batchSize are consumed; the rest remain.

How BATCH interacts with queue disciplines:
- The queue discipline (FIFO/LIFO/PRIORITY) determines which entities are selected for batching, in the same way it determines which entity is seized. The first N entities per the discipline order are batched.
- The discipline is read from the queue definition — no new discipline fields are needed.

### Decision 4 — UNBATCH (restore originals)

```javascript
UNBATCH(QueueName)
```

- Takes the batch parent entity from the execution context (same as COMPLETE uses `getLastCustId()`).
- Restores each child in `batch.children` as an individual entity in `QueueName`.
- Children retain their original `arrivalTime`, `stages`, `attrs`, and `queue` values.
- The parent entity is marked `status: "done"` and counted in `__served`.
- UNBATCH is a **B-Event action** — scheduled after the batch is processed (e.g., after RELEASE).

## Alternatives Considered

### Back-edge representation

**Schema on canonical model:** Adding a `loopGuard` field to B-Event routing entries. Rejected because routing entries describe entity routing intent, not graph topology. The loop metadata is visual-edge-level information, not canonical model logic.

**No DAG relaxation:** Requiring users to build rework loops using the existing C-Event mechanism (conditionally route to an upstream queue via a routing entry). Rejected because this creates a misleading visual graph (hidden cycles) and the engine would still cycle without explicit tracking.

### Loop guard

**Option A (max count only):** Simpler, but means modellers cannot express "rework until quality passes" without a separate C-Event condition. Rejected — providing both gives more modelling flexibility.

**Option B (conditional only):** Modeller must remember to add a termination condition. If the condition is never met, the model loops infinitely. Rejected — the hard count guard is a safety net.

### BATCH

**Option B (entity-attribute accumulation):** Entities carry a `batchCount` attribute that increments each time they pass a "combiner" node. When `batchCount == N`, the entity proceeds. Rejected because it requires entities to traverse the same node N times, which means N-1 passes through the loop before proceeding. This is fragile and hard to validate.

**Dedicated BATCH node type:** A new node type in the Visual Designer that holds batch configuration. Deferred — Option A uses the existing queue mechanism. A dedicated BATCH node is future syntactic sugar.

### UNBATCH

**Create new instances:** UNBATCH creates new entity instances with fresh IDs and default attributes. Rejected because entity attribute history (stage times, accumulated wait) would be lost. Restoring originals preserves the full entity lifecycle.

## Consequences

### Positive
- No changes to the five canonical `model_json` keys for loop metadata — back-edges are purely in the graph layer
- `wouldCreateCycle` remains strict for all non-loop edges — no accidental DAG relaxation
- BATCH reuses existing queue infrastructure and discipline logic
- UNBATCH preserves full entity history including arrivalTime and stages
- The loop count guard prevents infinite loops even with misconfigured conditions
- `Entity.loopCount` is auto-maintained and available in the Predicate Builder

### Negative
- Loop edges require both `maxLoopCount` and `exitQueueName` — two fields the modeller must set
- BATCH parent entity attribute inheritance is simple (first-child) — not all aggregation patterns are supported
- The derived graph auto-detection of loops may miss edge cases (e.g., multi-hop back-edges where the route passes through intermediate nodes)
- BATCH consumes entities from the front of the queue (per discipline) — modellers cannot batch from the back

### Rules added to AGENTS.md
- Back-edges in `model_json.graph` must set `loop: true` to bypass `wouldCreateCycle` — never disable cycle detection globally
- BATCH is a C-Event macro only; UNBATCH is a B-Event macro only
- `Entity.loopCount` is auto-incremented by the engine on every loop-edge traversal — never modified by ASSIGN
- `maxLoopCount` >= 1 and `exitQueueName` must exist are enforced at validation time (V24)
- `batchSize` must be integer >= 2 (V22)

## Open Questions

- A dedicated BATCH node type in the Visual Designer would provide a clearer visual affordance than a queue with `batchSize` — revisit if modeller feedback shows confusion
- Multi-hop back-edges (Activity → Queue1 → Activity2 → Queue1) are technically possible with the current design but auto-detection of `queueName` references in routing needs enhancement — this is a refinement, not a blocker
- BATCH currently copies attributes from the first child only — future sprints may add configurable aggregation (min, max, sum, average of child attributes)
