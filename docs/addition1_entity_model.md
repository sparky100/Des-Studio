# simmodlr — Entity Model, Attribute Schema & Action Vocabulary

> **Foundational Reference:** This document defines the entity model, attribute schema, and original action vocabulary for Sprints 1-3. It remains authoritative for entity class definitions, attribute types, and the core macro patterns.
>
> **Extended Macros:** The complete current macro vocabulary (19 macros) is documented in full in Section 5 and Section 11 of this document. AGENTS.md Section 5.1 is partially out of date and defers to this document for the authoritative list.
>
> **Queue Disciplines:** For the complete queue discipline set (FIFO, LIFO, PRIORITY, SPT, EDD, PRIORITY(attrName)), see Section 12 of this document and `AGENTS.md` Section 6.
>
> **Date:** Original 2026-04-30 | Updated 2026-05-21

## 1. Purpose & Scope

This document formally extends the Professional DES Tool Specification v1 with the entity model and action vocabulary required to build the Predicate Builder, condition evaluator, and simulation engine macros. It is the authoritative reference for Sprints 1 through 3.

**Claude Code must read this file at the start of every Sprint 1, 2, and 3 session, alongside CLAUDE.md.**

It defines three things precisely:

- The **Entity Class schema** — what an entity is, what attributes it carries, and how those attributes are defined by the modeller.
- The **State Variable schema** — the system-level variables available for condition evaluation.
- The **complete Action Vocabulary** — every operation a B-Event or C-Event is permitted to execute, with inputs, preconditions, and state changes for each.

> **Scope boundary:** This document does not cover statistical output definitions (Addition 2) or verification benchmarks (Addition 3). Those are deferred until Sprint 4.

---

## 2. Entity Class Schema

An entity is a transient object that enters the system at a Source node, moves through Queues and Activities, and exits at a Sink node. Every entity belongs to exactly one **Entity Class** defined by the modeller. The Entity Class defines the attribute schema — the names, types, and default values of all data the entity carries.

### 2.1 Entity Class Definition

The modeller defines one or more Entity Classes in the model editor. Each class has:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique identifier for the class. Used in Predicate Builder variable references. Example: `Customer`, `Job`, `Patient`. |
| `label` | string | No | Display name shown on canvas nodes. Defaults to `name` if omitted. |
| `colour` | hex string | No | Colour used to render entity tokens in the visual execution view. Defaults to `#4A90D9`. |
| `attributes` | Attribute[] | Yes | Ordered list of typed attributes the entity carries. May be an empty array if no attributes are needed. |
| `arrivalSource` | string | Yes | ID of the Source node that generates this entity class. One class per Source. |
| `role` | enum | Yes in simmodlr implementation | `customer` for arriving entities or `server` for pre-created resources. |
| `count` | number | Server only | Static server capacity when no `shiftSchedule` is present. |
| `shiftSchedule` | ShiftPeriod[] | No | Time-varying server capacity. If present, the first period defines initial capacity and overrides `count`. |

Server shift periods use this schema:

```json
{
  "shiftSchedule": [
    { "time": 0, "capacity": 3 },
    { "time": 480, "capacity": 6 },
    { "time": 960, "capacity": 2 }
  ]
}
```

`shiftSchedule` is implemented by scheduling `SHIFT_CHANGE` B-Events during engine initialisation. Capacity maps to server entity instances: increases create idle server instances; decreases retire idle excess only. Busy excess servers complete naturally and produce a warning in run results.

### 2.2 Attribute Definition

Each attribute in an Entity Class has the following fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Attribute identifier. Used in Predicate Builder as `Entity.name`. Must be unique within the class. Example: `priority`, `colour`, `size`. |
| `valueType` | enum | Yes | One of: `number` \| `string` \| `boolean`. Determines which operators are available in the Predicate Builder and which value inputs are shown. |
| `defaultValue` | any | Yes | Value assigned to this attribute when a new entity of this class is created at the Source. Must match `valueType`. |
| `allowedValues` | string[] | No | If present, the value input in the Predicate Builder renders as a dropdown rather than a free input. Only valid for `string` valueType. |
| `mutable` | boolean | No | If `true`, Activities may modify this attribute via the ASSIGN action. Defaults to `true`. Set `false` for immutable identity attributes. |

### 2.3 Attribute Value Types

The `valueType` field determines precisely how the attribute participates in conditions and actions:

| valueType | Valid Operators | Value Input | Notes |
|---|---|---|---|
| `number` | `== != < > <= >=` | Number input (`type=number`) | Used for priority levels, sizes, counts. `defaultValue` must parse as a finite number. **NaN is a hard validation error — never silently coerced to 0.** |
| `string` | `== !=` | Text input or dropdown if `allowedValues` set | Case-sensitive comparison. Example: `Entity.colour == 'Red'`. Quote delimiters are added by the engine — the modeller selects the value, not the syntax. |
| `boolean` | `== !=` | Toggle (`true` / `false`) | Renders as a two-option dropdown in the Predicate Builder. Valid values: `true`, `false` only. |

### 2.4 Example Entity Class (JSON)

This is the canonical serialisation format consumed by the engine. The Predicate Builder and all editors must produce output matching this schema.

```json
{
  "id": "ec_customer",
  "name": "Customer",
  "label": "Customer",
  "colour": "#4A90D9",
  "arrivalSource": "src_01",
  "attributes": [
    {
      "name": "priority",
      "valueType": "number",
      "defaultValue": 1,
      "mutable": true
    },
    {
      "name": "type",
      "valueType": "string",
      "defaultValue": "standard",
      "allowedValues": ["standard", "premium", "urgent"],
      "mutable": false
    }
  ]
}
```

---

## 3. State Variables

State variables are system-level numeric counters that track the current state of resources and queues. They are available in the Predicate Builder alongside entity attributes. Unlike entity attributes, state variables are not owned by an entity — they belong to the model and are updated automatically by the engine as macros execute.

### 3.1 Built-in Resource State Variables

For every Resource defined in the model, the engine automatically maintains:

| Variable Pattern | Type | Definition |
|---|---|---|
| `Resource.<id>.status` | enum | Current state of the resource. Values: `IDLE` or `BUSY`. Updated by SEIZE (→ BUSY) and RELEASE (→ IDLE). Available as a condition token in the Predicate Builder. |
| `Resource.<id>.busyCount` | number | Number of entities currently holding this resource. For single-capacity resources this is always 0 or 1. For multi-capacity resources this ranges 0 to `capacity`. |
| `Resource.<id>.capacity` | number | Total number of simultaneous occupancies the resource supports. Set at model definition time. Read-only at runtime. |
| `Resource.<id>.utilisation` | number | Running time-average fraction of capacity in use since warm-up end. Computed by engine at run completion — not available mid-run for conditions. |

### 3.2 Built-in Queue State Variables

For every Queue node defined in the model, the engine automatically maintains:

| Variable Pattern | Type | Definition |
|---|---|---|
| `Queue.<id>.length` | number | Current number of entities waiting in this queue. Updated after every ARRIVE, SEIZE, and RENEGE action. Available as a condition token. |
| `Queue.<id>.maxLength` | number | Observed maximum queue length since simulation start (including warm-up). Read-only. Not available for conditions. |

### 3.3 User-Defined State Variables

The modeller may define additional numeric counters in the State Variable Editor. These are available as condition tokens and may be modified by the ASSIGN action.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Identifier used in Predicate Builder. Example: `batchCount`, `totalRejected`. |
| `valueType` | enum | Yes | `number` only. User-defined state variables are always numeric. |
| `initialValue` | number | Yes | Value at simulation start. Reset to this value at warm-up end if warm-up is defined. |
| `resetOnWarmup` | boolean | No | If `true`, variable resets to `initialValue` when warm-up period ends. Defaults to `true`. |

### 3.4 Variable Reference Syntax in the Predicate Builder

The Predicate Builder references variables using a dot-notation namespace. The engine resolves these at runtime against the live simulation state:

| Reference | Example | Resolves to |
|---|---|---|
| `Entity.<attributeName>` | `Entity.priority` | The value of the named attribute on the entity currently being evaluated for selection from the queue. |
| `Resource.<id>.status` | `Resource.machine_01.status` | `IDLE` or `BUSY` for the named resource. |
| `Resource.<id>.busyCount` | `Resource.machine_01.busyCount` | Integer count of entities currently holding the resource. |
| `Queue.<id>.length` | `Queue.q_main.length` | Integer count of entities currently waiting in the named queue. |
| `<userVarName>` | `batchCount` | The current value of a user-defined state variable. |

---

## 4. Predicate Builder Specification

The Predicate Builder is the UI component that constructs condition expressions for C-Events. It must be impossible to construct a syntactically invalid or type-mismatched condition using this component. **Free-text entry is prohibited.**

### 4.1 Single Predicate Structure

A single predicate is a triple: variable reference, operator, and value. The operator options are filtered by the `valueType` of the selected variable.

> **`value` is always a literal, never a second dynamic reference.** Both the legacy string condition DSL and this JSON predicate form parse the right-hand side as a fixed literal at model-load time — it is never resolved as another `Queue.<id>.length`, `Resource.<id>.busyCount`, or state-variable reference. A predicate comparing two dynamic tokens to each other (e.g. attempting `{ "variable": "Queue.q_main.length", "operator": ">", "value": "Queue.q_other.length" }`) parses `value` as a non-numeric literal and the comparison is always `false` — no error is raised. To gate logic on a dynamic threshold, introduce a dedicated state variable and compare it to a literal constant in its own clause instead of comparing two dynamic tokens directly.

```json
{
  "variable": "Queue.q_main.length",
  "operator": ">=",
  "value": 1
}
```

### 4.2 Compound Predicate Structure

Multiple predicates are joined by `AND` or `OR`. Precedence is left-to-right for same-level connectors. Mixed AND/OR at the same level is permitted but the UI must display the evaluation order explicitly to the modeller.

```json
{
  "operator": "AND",
  "clauses": [
    { "variable": "Resource.machine_01.status", "operator": "==", "value": "IDLE" },
    { "variable": "Queue.q_main.length",        "operator": ">=", "value": 1      }
  ]
}
```

### 4.3 Entity Filter Predicate

When an Activity uses Filtered Entity Selection, a separate entity-level predicate is applied to each candidate in the queue before the Queue Rule is applied. This predicate references `Entity.<attributeName>` variables only.

```json
{
  "entityFilter": {
    "variable": "Entity.type",
    "operator": "==",
    "value": "urgent"
  },
  "queueRule": "FIFO"
}
```

> **Implementation rule:** The Predicate Builder must never emit a raw string that is passed to `eval()`, `new Function()`, or any dynamic code execution mechanism. The predicate is always serialised as a JSON structure and evaluated by the engine's safe condition evaluator.

---

## 5. Action Vocabulary — Complete Macro Set

This section defines every action the engine supports. This is the **complete and closed set** — no action outside this vocabulary may be used in a B-Event or C-Event.

> **Closed vocabulary rule:** If a modeller's requirement cannot be expressed using the five macros below, the correct response is to extend this specification — not to add a free-text field or eval hook. The `Custom...` free-text escape hatch identified in audit finding C1 is prohibited and must be removed.

---

### MACRO 1 — ARRIVE

| Field | Detail |
|---|---|
| **Category** | B-Event action (scheduled, deterministic) |
| **Purpose** | Creates a new entity of a specified class, places it in a target queue, and schedules the next arrival B-Event using the inter-arrival distribution. |
| **Called by** | Source node — automatically at simulation start and after each arrival fires. |
| **Inputs** | `entityClassId: string` — the Entity Class to instantiate. `queueId: string` — the Queue node to place the entity in. `interArrivalDist: Distribution` — delay until the next ARRIVE B-Event is scheduled. |
| **Preconditions** | `entityClassId` must reference a valid Entity Class. `queueId` must reference a valid Queue node. `interArrivalDist` must be a valid Distribution (see Section 6). |
| **State changes** | 1. New entity instance created with all attributes set to their `defaultValue`. 2. Entity placed at the tail of `queueId`. 3. `Queue.<queueId>.length` incremented by 1. 4. New ARRIVE B-Event scheduled at `T_now + sample(interArrivalDist)`. |
| **Scheduling** | The next arrival is scheduled as a B-Event, not a C-Event. The Source node does not need a C-Event condition — arrival is unconditional. |
| **Error conditions** | If `interArrivalDist` produces a negative sample, the engine must raise a model error and halt. Negative inter-arrival times are not permitted. |

---

### MACRO 2 — SEIZE

| Field | Detail |
|---|---|
| **Category** | C-Event action (conditional) |
| **Purpose** | Removes an entity from a queue, assigns it to a resource, marks the resource BUSY, and schedules the service completion B-Event. |
| **Called by** | Activity node — in the C-Event phase when the condition is true. |
| **Inputs** | `queueId: string` — the Queue to select an entity from. `resourceId: string` — the Resource to assign the entity to. `serviceDist: Distribution` — duration of the activity. `entityFilter: Predicate \| null` — optional entity-level filter applied before queue rule. `queueRule: enum` — `FIFO \| LIFO \| PRIORITY`. |
| **Preconditions** | `Resource.<resourceId>.status` must be `IDLE`. `Queue.<queueId>.length` must be >= 1. If `entityFilter` is defined, at least one entity in the queue must satisfy it. |
| **State changes** | 1. Entity selected from queue per `entityFilter` (if any) then `queueRule`. 2. Entity removed from queue. `Queue.<queueId>.length` decremented by 1. 3. `Resource.<resourceId>.status` set to `BUSY`. 4. `Resource.<resourceId>.busyCount` incremented by 1. 5. Entity's `inServiceSince` timestamp set to `T_now`. 6. COMPLETE B-Event scheduled at `T_now + sample(serviceDist)`. |
| **Queue rule — FIFO** | Select entity with smallest `arrivalTime` among candidates. |
| **Queue rule — LIFO** | Select entity with largest `arrivalTime` among candidates. |
| **Queue rule — PRIORITY** | Select entity with smallest `Entity.priority` attribute value among candidates. The `priority` attribute must be of `valueType: number`. If two entities share the same priority value, FIFO is used as the tiebreaker. |
| **Error conditions** | If `queueRule` is `PRIORITY` but the entity class has no attribute named `priority` of `valueType: number`, the engine must raise a model error at validation time — not at runtime. |

---

### MACRO 3 — COMPLETE

| Field | Detail |
|---|---|
| **Category** | B-Event action (scheduled, deterministic) |
| **Purpose** | Fires when service ends. Releases the resource, records entity statistics, and routes the entity to the next node (Queue or Sink). |
| **Called by** | Engine — when the COMPLETE B-Event fires on the Future Events List. |
| **Inputs** | `entityId: string` — the entity completing service. `resourceId: string` — the resource being released. `nextNodeId: string` — the Queue or Sink node the entity moves to. |
| **Preconditions** | The entity must currently be assigned to the resource (internal engine check). If not, this is an engine logic error. |
| **State changes** | 1. `Resource.<resourceId>.status` set to `IDLE`. 2. `Resource.<resourceId>.busyCount` decremented by 1. 3. Entity sojourn time at this activity recorded: `T_now - entity.inServiceSince`. 4. If `nextNodeId` is a Queue: entity placed in that queue, `Queue.<nextNodeId>.length` incremented by 1. 5. If `nextNodeId` is a Sink: throughput recorded, total time-in-system recorded (`T_now - entity.arrivalTime`), entity disposed. |
| **Routing** | Determined by the RELEASE B-Event fired by the Activity. **Single route** (default): `RELEASE(ServerType, QueueName)` — fixed target queue. **Conditional routing** (F10.1): optional `routing: [{ condition, queueName }]` array + `defaultQueueName` on the B-event. Conditions are `evaluatePredicate` predicates against the released entity's attributes; first match wins; `defaultQueueName` is used when no condition matches. **Probabilistic routing** (F10.2): optional `probabilisticRouting: [{ probability, queueName }]` array; sampled using the replication's seeded RNG; probabilities must sum to 1.0 (±0.001). `routing`, `probabilisticRouting`, and a RELEASE literal queue arg are mutually exclusive on the same B-event. |
| **Post-execution** | COMPLETE fires in Phase B. After all Phase B events fire at `T_now`, Phase C scan begins. A SEIZE C-Event on the now-IDLE resource is the expected next step. |

---

### MACRO 4 — ASSIGN

| Field | Detail |
|---|---|
| **Category** | C-Event action (conditional) or B-Event action (scheduled) |
| **Purpose** | Modifies a user-defined state variable or a mutable entity attribute. Used to implement counters, flags, and entity state changes during processing. |
| **Called by** | Any Activity node — either as part of a C-Event action sequence or as a standalone B-Event effect. |
| **Inputs** | `target: string` — the variable or attribute to modify. Must be a user-defined state variable name or `Entity.<attributeName>` where `mutable` is `true`. `operator: enum` — `SET \| INCREMENT \| DECREMENT`. `value: number \| string \| boolean` — must match the `valueType` of the target. |
| **Operators** | `SET`: assigns the value directly. `target = value`. `INCREMENT`: adds value to target. Only valid for `number` valueType. `target = target + value`. `DECREMENT`: subtracts value from target. Only valid for `number` valueType. `target = target - value`. |
| **Preconditions** | Target must exist in the model. If `Entity.<attributeName>`, the attribute's `mutable` field must be `true`. Assigning to an immutable attribute is a validation error. |
| **State changes** | The named variable or attribute is updated in the live simulation state. The change is visible immediately to subsequent C-Event condition evaluations in the same Phase C scan. |
| **Error conditions** | Assigning a string value to a number variable, or a number to a boolean, is a type error. The Predicate Builder must prevent this at model-build time. The engine must also validate at run-start. |

---

### MACRO 5 — RENEGE

| Field | Detail |
|---|---|
| **Category** | B-Event action (scheduled, deterministic) |
| **Purpose** | Removes an entity from a queue before it is selected for service — the entity abandons the system after waiting too long. Routes the entity to a designated Sink or alternative Queue. |
| **Called by** | Engine — when the RENEGE B-Event fires. Scheduled at arrival: `T_renege = T_arrival + sample(patienceDist)`. |
| **Inputs** | `entityId: string` — the entity that may renege. `queueId: string` — the queue the entity is waiting in. `patienceDist: Distribution` — patience time sampled at arrival. `nextNodeId: string` — Sink or alternative Queue to route the reneging entity to. |
| **Preconditions** | Entity must still be in `queueId` when the B-Event fires. If the entity has already been seized (SEIZE fired first), the RENEGE B-Event is cancelled silently — this is the standard race condition and is correct behaviour. |
| **State changes** | 1. If entity is still in queue: entity removed. `Queue.<queueId>.length` decremented by 1. 2. Renege count for this queue incremented by 1. 3. Entity routed to `nextNodeId` per the COMPLETE routing rules. 4. If entity has already been seized: no state change. RENEGE B-Event is a no-op. |
| **Scheduling** | **Preferred:** set `renegeDist`/`renegeDistParams` directly on the Queue itself — the engine auto-schedules the timer at `T_join + sample(renegeDist)` for every entity that joins that queue, regardless of how it arrived (ARRIVE, RELEASE-routing, BATCH, SPLIT), with no B-Event authoring required. Use this for any simple patience-based abandonment. **Fallback (conditional reneging only):** manually add a second `schedules[]` entry (`isRenege: true`) on whichever B-event delivers the entity into the queue — reserve this for cases where reneging must be conditional on something the queue-level timer can't express (e.g. only renege while a state variable holds a specific value). Both mechanisms can coexist on the same queue. |
| **Error conditions** | If `patienceDist`/`renegeDist` produces a non-positive sample, the engine must raise a validation error. An entity cannot renege before it joins the queue. |

---

### MACRO 6 — BATCH (Sprint 12)

| Field | Detail |
|---|---|
| **Category** | C-Event action (conditional) |
| **Purpose** | Accumulates `batchSize` entities from a queue into a single parent batch entity. The parent entity carries `batch.children` storing the original entities. Used for assembly/kitting patterns. |
| **Called by** | C-Event — fires when `queue(QueueName).length >= batchSize`. |
| **Inputs** | `queueName: string` — the queue to accumulate entities from. `batchSize: integer >= 2` — number of entities to consume per batch. |
| **Preconditions** | Queue must exist. At least `batchSize` entities must be waiting in the queue. Entities are selected per the queue's discipline (FIFO/LIFO/PRIORITY). |
| **State changes** | 1. `batchSize` entities removed from the entities pool. 2. Parent batch entity created with `role: "batch"`, `batch.children` storing copies of original entities. 3. Parent placed in the same queue with attributes copied from the first child. 4. `lastCustId` set to the parent entity ID. |
| **Routing** | The batch entity competes with individual entities in the queue. A SEIZE on the same queue will pick up the batch (or individual entities) per queue discipline. |
| **Error conditions** | `batchSize < 2` is a validation error (V22). Referencing a non-existent queue is a validation error (V22). |

---

### MACRO 7 — UNBATCH (Sprint 12)

| Field | Detail |
|---|---|
| **Category** | B-Event action (scheduled, deterministic) |
| **Purpose** | Restores the original entities from a batch parent to a target queue. Children retain their original IDs, `arrivalTime`, `stages`, and attributes. |
| **Called by** | B-Event — fires after the batch parent has been processed (e.g., after RELEASE). |
| **Inputs** | `targetQueue: string` — the queue to restore child entities to. |
| **Preconditions** | The context entity (via `_contextCustId` or `getLastCustId()`) must be a batch parent entity with `role: "batch"` and non-empty `batch.children`. |
| **State changes** | 1. Each child in `batch.children` is pushed into the entities pool with `status: "waiting"` and `queue: targetQueue`. 2. Parent entity status set to `"done"`, `completionTime` set to clock. 3. Children preserve their original IDs, `arrivalTime`, `stages`, and `attrs`. |
| **Error conditions** | Referencing a non-existent queue is a validation error (V23). Calling UNBATCH on a non-batch entity is a no-op with a warning. |

---

### Entity.loopCount (Sprint 12)

Every entity carries a `loopCount` field initialized to `0`. This counter is incremented each time the entity traverses a loop edge (back-edge in the visual graph). The loop guard enforces a `maxLoopCount` — when exceeded, the entity is routed to `exitQueueName` (or exits the system if `exitQueueName` is null).

`Entity.loopCount` is readable in Predicate Builder conditions, enabling conditional early exit from rework loops.

### Entity.outcome and Journey Conclusions

When an entity leaves the model through a terminal path, the engine records how the journey ended:

```json
{
  "outcome": {
    "status": "completed",
    "routeId": "route-exit:b_triage_done",
    "routeLabel": "Triage Done",
    "endedBy": "direct-routing",
    "endedAt": 42.5,
    "sourceEventId": "b_triage_done",
    "sourceEventName": "Triage Done"
  }
}
```

Terminal macros and routes set this field as follows:

- `COMPLETE()` sets `status: "completed"` with an `event:<BEventId>` route. `routeLabel` is set to the B-Event name.
- `RENEGE(ctx)` and `RENEGE_OLDEST(...)` set `status: "reneged"`.
- A conditional or probabilistic `RELEASE(...)` route with `queueName: null` sets `status: "completed"` with a `route-exit:<BEventId>` route. `routeLabel` is derived from the B-Event name (e.g. `"Triage Done"`), making multiple direct-exit sinks distinguishable in results.
- A loop guard with no `exitQueueName` sets `status: "completed"` with a `loop-exit:<BEventId>` route.

Run summaries aggregate these into `summary.outcomes`, keyed by `routeId`, so Results, reports, exports, and AI analysis can distinguish "completed via consultation" from "discharged at triage" even when both count toward `summary.served`.

### Loop Guard (Sprint 12)

The loop guard is configured via `loopConfig` on a B-Event:

```json
{
  "loopConfig": {
    "maxLoopCount": 3,
    "exitQueueName": "Finished Queue"
  }
}
```

When a B-Event with `loopConfig` fires and routes an entity, the engine increments `entity.loopCount`. If `loopCount >= maxLoopCount`, the entity is redirected to `exitQueueName` (or completed if `exitQueueName` is null/empty).

---

### MACRO 8 — RENEGE_OLDEST

| Field | Detail |
|---|---|
| **Category** | C-Event action (conditional) |
| **Purpose** | Removes the oldest entity (per queue discipline) of a given type from its queue. Used to enforce maximum queue length policies by evicting the longest-waiting entity. |
| **Called by** | C-Event — fires when a queue overflow or timeout policy is triggered. |
| **Inputs** | `customerType: string` — the entity type to target. The queue is resolved from the entity type's configuration. |
| **Syntax** | `RENEGE_OLDEST(CustomerType)` |
| **Preconditions** | At least one entity of the given type must be waiting. If none is found, the macro is a no-op. |
| **State changes** | 1. Selects the entity from the queue per the queue's configured discipline (FIFO/LIFO/PRIORITY). 2. Removes the entity from the queue. 3. Sets `entity.status = "reneged"` and `entity.renegeTime = T_now`. 4. Increments `state.__reneged` counter. |
| **Error conditions** | If the type does not match any configured queue, a warning is logged and the macro is a no-op. |

---

### MACRO 9 — FILL

| Field | Detail |
|---|---|
| **Category** | B-Event or C-Event action |
| **Purpose** | Adds a specified amount to a named container's current level. Used for tank-filling, inventory restocking, and buffer-replenishment patterns. |
| **Called by** | Any B-Event or C-Event effect sequence. |
| **Inputs** | `containerName: string` — must reference a declared container in `model.containerTypes`. `amount: number` — must be a positive finite number. |
| **Syntax** | `FILL(ContainerName, amount)` |
| **Preconditions** | Container must be declared in `containerTypes`. `amount` must be > 0. |
| **State changes** | 1. Flushes the time-integral (`level × Δt`) before changing level. 2. New level = `min(current + amount, capacity)`. 3. Updates `__containerMin_<id>` and `__containerMax_<id>`. 4. If new level reaches capacity, a `[at capacity]` note is appended to the log. |
| **Error conditions** | Referencing an undeclared container is a model error (V27). Non-positive amount is logged as an error and the macro is a no-op. |

---

### MACRO 10 — DRAIN

| Field | Detail |
|---|---|
| **Category** | B-Event or C-Event action |
| **Purpose** | Subtracts a specified amount from a named container's current level. Used for consumption, withdrawal, and discharge patterns. |
| **Called by** | Any B-Event or C-Event effect sequence. |
| **Inputs** | `containerName: string` — must reference a declared container. `amount: number` — must be a positive finite number. |
| **Syntax** | `DRAIN(ContainerName, amount)` |
| **Preconditions** | Container must be declared. `amount` must be > 0. `current level >= amount` — the drain guard prevents the level from going negative. |
| **State changes** | 1. Flushes the time-integral before changing level. 2. New level = `current − amount`. 3. Updates `__containerMin_<id>` and `__containerMax_<id>`. |
| **Error conditions** | Referencing an undeclared container is a model error (V27). Non-positive amount is a no-op. Insufficient level (guard failure) is logged as an error and the macro is a no-op — **the drain is not partial**. |

---

### MACRO 11 — SET

| Field | Detail |
|---|---|
| **Category** | B-Event or C-Event action |
| **Purpose** | Assigns a computed value to a user-defined state variable. Supports arithmetic expressions over state variables, entity attributes, and the simulation clock. |
| **Called by** | Any B-Event or C-Event effect sequence. |
| **Inputs** | `varName: string` — a user-defined state variable name. `expression: string` — a safe arithmetic expression. |
| **Syntax** | `SET(varName, expression)` |
| **Expression support** | `Entity.<attr>`, state variable names, `clock`, arithmetic operators (+−×÷), parentheses, and math functions (`min`, `max`, `abs`, `round`, `floor`, `ceil`). |
| **Preconditions** | The expression must evaluate to a finite number. |
| **State changes** | `state[varName] = evaluatedValue`. The change is immediately visible to subsequent C-Event conditions in the same Phase C scan. |
| **Error conditions** | Non-finite result is logged as an error and the assignment is skipped. Dynamic code execution (`eval`, `new Function`) is never used — the expression is evaluated by the engine's safe evaluator. |

---

### MACRO 12 — SET_ATTR

| Field | Detail |
|---|---|
| **Category** | B-Event or C-Event action |
| **Purpose** | Mutates a named attribute on the context entity. Supports the same arithmetic expressions as SET. Requires an active entity context (must follow ARRIVE, ASSIGN/SEIZE, or COSEIZE). |
| **Called by** | Any B-Event or C-Event effect sequence where an entity context is active. |
| **Inputs** | `attrName: string` — the attribute to update. Prefix `Entity.` is optional. `expression: string` — a safe arithmetic expression. |
| **Syntax** | `SET_ATTR(Entity.attrName, expression)` or `SET_ATTR(attrName, expression)` |
| **Preconditions** | A context entity must be active. If none, the macro logs an error and is a no-op. |
| **State changes** | `entity.attrs[attrName] = evaluatedValue`. |
| **Error conditions** | No context entity: error logged, no-op. Non-finite expression result: error logged, assignment skipped. |

---

### MACRO 13 — COST

| Field | Detail |
|---|---|
| **Category** | B-Event or C-Event action |
| **Purpose** | Accumulates a cost amount to the model-wide `__totalCost` counter and to the context entity's `__cost` attribute. Used to track economic metrics across replications. |
| **Called by** | Any B-Event or C-Event effect sequence. |
| **Inputs** | `expression: string` — a safe arithmetic expression evaluating to a finite number. |
| **Syntax** | `COST(expression)` |
| **Preconditions** | Expression must evaluate to a finite number. |
| **State changes** | 1. `state.__totalCost += evaluatedAmount`. 2. If a context entity is active: `entity.attrs.__cost += evaluatedAmount`. |
| **Error conditions** | Non-finite expression result is logged as an error; no accumulation occurs. |

---

### MACRO 14 — DELAY

| Field | Detail |
|---|---|
| **Category** | C-Event action (conditional) |
| **Purpose** | Starts a resource-free timed activity. Removes an entity from a queue, marks it as "serving" without claiming any server, and sets the entity context for the follow-on completion B-Event. The duration is specified in the C-Event's `cSchedules` entry (not on the macro itself). Routing (exit or next queue) is configured on the completion B-Event exactly as it is for a standard RELEASE event. |
| **Called by** | Activity node configured as "Delay (no resource)" — C-Event phase. |
| **Inputs** | `queueName: string` — the queue to draw the entity from. |
| **Syntax** | `DELAY(QueueName)` |
| **Preconditions** | At least one entity must be waiting in `queueName`. The queue's configured discipline (FIFO/LIFO/PRIORITY etc.) governs entity selection. |
| **State changes** | 1. Entity selected from the queue per the queue discipline. 2. Entity removed from the queue. 3. `entity.status` set to `"serving"`. 4. `entity.serviceStart` set to `T_now`. 5. `entity.lastQueue` updated. 6. `entity._isDelay = true` (flags this entity as delay-mode for routing guards). 7. `lastCustId` set to `entity.id`. `lastSrvId` is **not** set (no server is claimed). |
| **Routing** | The completion B-Event scheduled via `cSchedules` carries the entity context (`_contextCustId` set, `_contextSrvId` absent). The B-Event engine recognises the `_isDelay` flag and accepts the entity in `"serving"` status for conditional or probabilistic routing. Use `queueName: null` (UI: "Exit system (leave)") to discharge the entity; use a queue name to route it to the next stage. The standard `defaultQueueName` fallback applies. |
| **When to use** | Any activity that consumes time but requires no server or resource — a mandatory waiting period, cooling delay, inspection hold, patient recovery in an unmonitored bed, paperwork processing, or any scenario where the entity is "busy" for a duration but not occupying a resource. |
| **When NOT to use** | If a server or room must be reserved during the activity, use `ASSIGN(QueueName, ServerType)` instead. DELAY leaves the resource pool completely unaffected. |
| **Error conditions** | If no entity is waiting in `queueName`, the macro is a no-op with a warning logged. |

**Example — mandatory recovery delay before discharge:**

C-Event (fires when `queue(RecoveryQueue).length >= 1`):
```
DELAY(Recovery Queue)
```
cSchedule: B-Event `"Recovery Complete"`, distribution `Fixed(30)`, `useEntityCtx: true`.

B-Event `"Recovery Complete"` — probabilistic routing:
```json
{
  "probabilisticRouting": [
    { "probability": 0.8, "queueName": null },
    { "probability": 0.2, "queueName": "ICU Queue" }
  ]
}
```

**LLM guidance — how to set up a resource-free activity:**

1. Create a Queue for the waiting entities (e.g. `"Recovery Queue"`).
2. Create a C-Event with condition `queue(Recovery Queue).length >= 1`. Set activity type to **"Delay (no resource)"** and select `Recovery Queue` as the source queue. This stores the effect as `DELAY(Recovery Queue)`.
3. In the C-Event's Schedule section, add a cSchedule: select the completion B-Event, choose a duration distribution, and **check "Pass entity context"** (`useEntityCtx: true`).
4. Create the completion B-Event (e.g. `"Recovery Complete"`). **Leave the effect empty when using routing.** Use `COMPLETE()` only if the entity always exits with no routing — `COMPLETE()` fires before routing and will prevent any routing from executing. The exit/null routing branch already calls `completeEntity` internally. Configure routing (conditional, probabilistic, or a fixed queue) in the B-event's Routing panel.
5. No server type is needed. Do **not** add an `ASSIGN` or `RELEASE` effect.

---

## 5a. Container Types

Containers are continuous-level state objects (tanks, buffers, inventories) that accumulate and deplete over time. They are declared in `model.containerTypes` and manipulated via the FILL and DRAIN macros.

### Container Definition Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique identifier. Case-insensitive. Used in `FILL(id, amount)` and `DRAIN(id, amount)`. |
| `capacity` | number | No | Maximum level. Must be > 0 when set. Defaults to `Infinity` (unbounded). |
| `initialLevel` | number | No | Level at simulation start. Must be >= 0 and <= `capacity`. Defaults to 0. |

### Container State Variables (Engine-Maintained)

For every declared container, the engine automatically maintains:

| Variable | Type | Description |
|---|---|---|
| `__container_<id>` | number | Current level. Updated by FILL and DRAIN. |
| `__containerCap_<id>` | number | Maximum capacity (Infinity if uncapped). |
| `__containerMin_<id>` | number | Minimum level observed since simulation start. |
| `__containerMax_<id>` | number | Maximum level observed since simulation start. |
| `__containerIntegral_<id>` | number | Cumulative level × time (used for average level statistics). |

Container levels are accessible in Predicate Builder conditions via user-defined state variable references (the `__container_<id>` key).

### Example Container JSON

```json
{
  "containerTypes": [
    { "id": "raw_tank",      "capacity": 1000, "initialLevel": 500 },
    { "id": "finished_goods",                  "initialLevel": 0   }
  ]
}
```

---

## 6. Probability Distributions

All stochastic delays — inter-arrival times, service durations, patience times — are specified using a Distribution object. The engine samples from this distribution using the seeded PRNG assigned to the current replication.

> **Seeded RNG requirement:** Every distribution sample must use the replication's seeded PRNG, not `Math.random()`. The seed is passed into `buildEngine()` and stored with the run record. A model run with the same seed must produce bit-identical results on every execution.

**The distribution system is open and extensible.** The list below documents what is currently implemented. New distribution types — including user-defined types based on imported data — can be added by registering a handler in `distributions.js` without changing the engine, macro layer, or validation framework. See CLAUDE.md Section 7.2 for the registry pattern.

### 6.1 Currently Supported Distributions

| Distribution | Parameters | Mean | Notes |
|---|---|---|---|
| `exponential` | `rate: number` (λ > 0) | 1 / λ | Standard Poisson arrival process. `Sample = -ln(U) / λ` where `U ~ Uniform(0,1)`. |
| `uniform` | `min: number, max: number` (max > min) | (min + max) / 2 | `Sample = min + U * (max - min)`. |
| `normal` | `mean: number, stdDev: number` (stdDev > 0) | mean | Use Box-Muller transform. Clamp negative samples to 0 for durations. |
| `triangular` | `min, mode, max` (min ≤ mode ≤ max) | (min + mode + max) / 3 | Common for expert-estimate durations when data is limited. |
| `fixed` | `value: number` (value > 0) | value | Deterministic constant. No randomness. Useful for M/D/1 benchmarks. |
| `lognormal` | `logMean: number, logStdDev: number` (logStdDev > 0) | exp(logMean + logStdDev²/2) | **Implemented (Sprint 86).** Always positive — no zero-clamping needed. Recommended for heavily right-skewed durations (repair times, complex task durations with a long tail). Parameters are the mean and stddev of the underlying normal distribution, not the mean/stddev of the sampled values themselves. |
| `empirical` | `values: number[]` (non-empty), optional `sourceFile`, `column` | mean(values) | Samples uniformly from list. Values may be entered inline or imported from CSV. |
| `piecewise` | `periods: { startTime, distribution }[]` | active period mean | Selects the period with the greatest `startTime <= clock`, then delegates sampling to that period's distribution. |
| `erlang` | `k: integer` (≥ 1), `mean: number` (> 0) | mean | k-phase service process. `Sample = -ln(∏ᵢ₌₁ᵏ Uᵢ) / (k / mean)`. Generalises exponential (k=1). |
| `serverAttr` | `attr: string` (default: `"serviceTime"`) | attribute value | Reads the named attribute from the matched server entity at service-scheduling time. Allows per-server-instance service time variation. Returns `max(0, value)` or 1 if not found. |
| `entityAttr` | `attr: string` | attribute value | Reads the named attribute from the arriving customer entity. Resolved at runtime via entity context. Returns the attribute value or 0 if not found. |
| `schedule` | `times: number[]` or `rows: {time, attrs}[]`, optional `jitterDist`, `jitterParams` | per-plan | Generates arrivals at planned absolute times. `rows[]` supports per-arrival entity attribute overrides (S40.2). Returns `1e9` when the plan is exhausted (no further arrivals). Supports optional Normal or Uniform jitter. |

### 6.2 Distribution JSON Schema

Parametric distributions:

```json
{ "type": "exponential", "rate": 0.1 }

{ "type": "uniform", "min": 5, "max": 15 }

{ "type": "normal", "mean": 10, "stdDev": 2 }

{ "type": "triangular", "min": 4, "mode": 8, "max": 15 }

{ "type": "fixed", "value": 8 }

{ "type": "erlang", "k": 3, "mean": 10 }

{ "type": "serverAttr", "attr": "serviceTime" }

{ "type": "entityAttr", "attr": "requestedDuration" }
```

Schedule distribution — planned absolute times (S40.2):

```json
{ "type": "schedule", "times": [10, 25, 40, 80] }
```

Schedule distribution — per-arrival rows with attribute overrides:

```json
{
  "type": "schedule",
  "rows": [
    { "time": 10, "attrs": { "priority": 1, "type": "urgent" } },
    { "time": 25, "attrs": { "priority": 3, "type": "standard" } }
  ],
  "jitterDist": "Normal",
  "jitterParams": { "mean": 0, "stddev": 2 }
}
```

Empirical distribution — inline values:

```json
{ "type": "empirical", "values": [4, 6, 7, 8, 12, 15] }
```

Empirical distribution — imported from CSV (values extracted at import time; CSV not stored):

```json
{
  "type": "empirical",
  "values": [4.2, 6.1, 7.8, 8.3, 12.0, 15.4],
  "sourceFile": "service_times_jan2026.csv",
  "column": "duration_minutes"
}
```

Piecewise time-varying distribution:

```json
{
  "type": "piecewise",
  "periods": [
    { "startTime": 0, "distribution": { "type": "exponential", "rate": 0.5 } },
    { "startTime": 480, "distribution": { "type": "exponential", "rate": 1.5 } }
  ]
}
```

simmodlr stores UI-authored piecewise distributions in the existing schedule shape as `dist: "Piecewise"` with `distParams.periods[]`. The engine accepts both the lower-case schema form above and the UI form.

### 6.3 CSV Import Rules

When a modeller imports a CSV to define an empirical distribution:

- The CSV is parsed in the browser at import time. The file itself is never stored in Supabase or passed to the engine.
- The numeric column selected by the modeller is extracted into the `values` array, which is stored in `model_json`.
- Non-numeric rows are skipped. If more than 10% of rows are skipped, the UI must show a warning before saving.
- After import, the Distribution Picker shows: filename, column name, row count accepted, min, max, mean. The modeller confirms before the values are written to the model.
- The engine has no knowledge of CSV files. It receives only the `values` array and samples from it using the seeded PRNG.
- `sourceFile` and `column` fields are stored for display purposes only. They have no runtime effect.

### 6.4 Extending with New Distribution Types

To add a new distribution type beyond those currently supported:

1. Register a handler in `distributions.js` using `registerDistribution()` (see CLAUDE.md Section 7.2). No other engine files change.
2. Add the new type's parameter schema to Section 6.2 of this document.
3. Add its validation logic as the `validate` function in the registry entry.
4. Add it to the Distribution Picker UI dropdown.
5. Write a unit test confirming the sampler produces the correct theoretical mean over 10,000 samples (within 2%).

No ADR is required for adding a new parametric distribution type. An ADR is required if the extension changes how the sampler is called from the engine or macro layer.

---

## 7. Pre-Run Model Validation Rules

The engine must validate the complete model before `buildEngine()` proceeds. Any validation failure must produce a descriptive error surfaced in the UI — the run must be blocked, not silently degraded.

| # | Rule | Type | Error Message Pattern |
|---|---|---|---|
| V1 | Every Entity Class must have a unique non-empty name. | Blocking | `Entity class name is empty or duplicated: '{name}'.` |
| V2 | Every attribute name within an Entity Class must be unique. | Blocking | `Duplicate attribute '{attr}' in entity class '{class}'.` |
| V3 | Every attribute `defaultValue` must match its declared `valueType`. | Blocking | `Default value '{val}' is not a valid {type} for attribute '{attr}'.` |
| V4 | If queue rule is PRIORITY, the entity class must have a numeric attribute named `priority`. | Blocking | `Queue '{id}' uses PRIORITY discipline but entity class '{class}' has no numeric 'priority' attribute.` |
| V5 | Every Distribution parameter must be within valid bounds (rate > 0, stdDev > 0, max > min, etc.). | Blocking | `Distribution parameter out of range in {context}: {detail}.` |
| V6 | No B-Event schedule may reference a non-existent event ID. | Blocking | `Schedule in '{event}' references unknown event ID '{ref}'.` |
| V7 | *(Reserved — not currently implemented in the engine. Activity edge validation is deferred.)* | — | — |
| V8 | The model must contain at least one Source node and one Sink node. | Blocking | `Model has no Source node.` / `Model has no Sink node.` |
| V9 | No C-Event condition may reference an undefined variable or attribute. | Blocking | `Condition references unknown variable '{ref}' in C-event '{id}'.` |
| V10 | No entity attribute name may collide with a built-in state variable prefix (`Resource`, `Queue`). | Blocking | `Attribute name '{name}' conflicts with built-in variable namespace.` |
| V11 | Normal distribution where > 5% of samples would be negative (detectable when mean < 2 × stdDev). | Warning only | `Normal distribution in '{context}' may produce negative samples frequently (mean={m}, stdDev={s}). Samples will be clamped to 0.` |
| V12 | Piecewise distributions must have at least one period and period 0 must start at time 0. | Blocking | `{context}: Piecewise distribution must start at time 0.` |
| V13 | Piecewise distribution periods must be sorted ascending by `startTime`. | Blocking | `{context}: Piecewise periods are not sorted by start time.` |
| V14 | Server `shiftSchedule` must start at time 0, be sorted ascending, and use positive integer capacities. | Blocking | `Server '{name}' shift schedule must start at time 0.` |
| V15 | Shift times after configured run duration are unreachable. | Warning only | `Server '{name}' shift at t={time} is after the run duration.` |
| V16 | Open-ended arrival models should define a time or condition termination. | Warning only | `No simulation time limit or termination condition set.` |
| V17 | B-event `routing` entries: every `queueName` must reference a defined queue; `defaultQueueName` must also be a defined queue; `routing` and a RELEASE literal queue arg are mutually exclusive. | Blocking | `B-Event '{name}' routing entry {n} references unknown queue '{q}'.` |
| V18 | B-event `probabilisticRouting`: probabilities must sum to 1.0 (±0.001); every `queueName` must reference a defined queue; mutually exclusive with `routing` and a RELEASE literal queue arg. | Blocking | `B-Event '{name}' probabilistic routing probabilities sum to {sum}, must be 1.0.` |
| V19 | Server entity type `count` must be an integer ≥ 1. | Blocking | `Server type '{name}' count '{val}' must be an integer ≥ 1.` |
| V20 | Queue `capacity` must be an integer ≥ 1 when set. If `overflowDestination` is set, it must reference a defined queue. | Blocking | `Queue 'X' capacity 'Y' must be an integer >= 1.` / `Queue 'X' overflowDestination 'Y' does not match any defined queue.` |
| V21 | `balkProbability` on a Queue must be between 0 and 1 inclusive. | Blocking | `Queue 'X' balkProbability 'Y' must be between 0 and 1.` |
| V22 | BATCH `batchSize` must be an integer ≥ 2. The referenced queue must exist. | Blocking | `BATCH batchSize must be integer >= 2.` / `BATCH references unknown queue 'X'.` |
| V23 | UNBATCH `targetQueue` must reference a defined queue. | Blocking | `UNBATCH references unknown queue 'X'.` |
| V24 | Loop guard `maxLoopCount` must be an integer ≥ 1. `exitQueueName` must reference a defined queue when set. | Blocking | `Loop guard maxLoopCount must be integer >= 1.` / `Loop guard exitQueueName 'X' does not match any defined queue.` |
| V25 | `RENEGE(arg)` — the argument must be `ctx`. `RENEGE(TypeName)` silently fails because the type name is not a numeric entity ID. | Warning only | `B-Event 'X' uses RENEGE('Y') which will silently fail. Use RENEGE(ctx) to reference the current entity instead.` |
| V26 | Every container in `containerTypes` must have a non-empty unique `id`. `capacity` must be > 0 when set. `initialLevel` must be ≥ 0 and ≤ `capacity`. | Blocking | `Container at position N has an empty id.` / `Duplicate container id: 'X'.` / `Container 'X': capacity must be > 0.` / `Container 'X': initialLevel must be >= 0.` / `Container 'X': initialLevel (N) exceeds capacity (M).` |
| V27 | FILL and DRAIN macros must reference a container declared in `containerTypes`. | Blocking | `B-Event 'X' FILL references undeclared container 'Y'.` / similar for DRAIN and C-Events. |
| V28 | `model.epoch`, when set, must be a valid ISO 8601 datetime string. | Blocking | `Model epoch 'X' is not a valid ISO 8601 datetime. Use the Settings tab to correct it.` |
| V29 | A C-event with `cSchedules` entries that all have a `when` condition must also have a fallback entry (one without `when`). Without a fallback, entities that match no condition receive no service. | Warning only | `C-event 'X' has attribute-conditional cSchedules but no fallback entry (one without a 'when' condition). Entities that don't match any condition will receive no service.` |
| V30 | A B-event with `probabilisticRouting` that includes a null-destination branch must have `COMPLETE()` or `RENEGE()` in its effect list. | Blocking | `B-Event 'X' has a null probabilistic routing branch but no terminal lifecycle macro (COMPLETE/RENEGE).` |
| V31 | A B-event using routing (conditional or probabilistic) to a null exit must include `COMPLETE()` or `RENEGE()` in its effect. | Blocking | `B-Event 'X' routes to exit but has no terminal macro.` |
| V32 | A B-event or C-event effect list must not contain more than one terminal lifecycle sink (`COMPLETE` or `RENEGE`). | Blocking | `B-Event/C-Event 'X' has multiple terminal macros (COMPLETE/RENEGE).` |
| V33 | A B-event with a single 100% probabilistic null exit and `COMPLETE()` — valid but unusual pattern. | Warning only | `B-Event 'X' routes 100% to exit — no entity ever joins a queue from this event.` |
| V34 | `experimentDefaults.replications` must be a positive integer. | Blocking | `Replication count must be a positive integer.` |
| V35 | `experimentDefaults.warmupPeriod` must be less than `experimentDefaults.maxSimTime`. | Blocking | `Warm-up period (X) must be shorter than run duration (Y).` |
| V36 | Server failure distribution fields (`mtbfDist`, `mttrDist`, `mtbfDistParams`, `mttrDistParams`) are only valid on entity types with `role: "server"`. `failureScope` must be `"unit"` or `"pool"` if set. | Blocking | `Entity type 'X' is not a server — failure settings are not applicable.` |
| V37 | When either `mtbfDist` or `mttrDist` is set, both must be present and point to valid distributions. | Blocking | `Server 'X': both MTBF and MTTR distributions must be set together.` |
| W-FAIL-01 | Server with `failureScope: "pool"` and `count > 1`. | Warning | `Server 'X' uses pool failure scope — a single failure will take the entire pool offline.` |

> **Note:** V7 is intentionally skipped (reserved for future activity-edge validation).

---

## 8. Rules for CLAUDE.md

The following must be added to `CLAUDE.md` before Sprint 1 begins. Copy this section verbatim.

```
## Entity & Action Vocabulary — Mandatory Rules (Addition 1)

### Entity Attributes
- valueType is always one of: number | string | boolean — no other types permitted
- NaN is never silently coerced to 0 — it is a hard validation error (V3)
- Immutable attributes (mutable: false) may not be modified by ASSIGN
- Entity.priority must be a number attribute for PRIORITY queue discipline (V4)
- allowedValues is only valid for string valueType

### Action Vocabulary — Open Set (as of Sprint 33+)
- The currently implemented macros are: ARRIVE, SEIZE/ASSIGN, COMPLETE, DELAY, RENEGE, BATCH, UNBATCH, RENEGE_OLDEST, FILL, DRAIN, SET, SET_ATTR, COST, PREEMPT, FAIL, REPAIR, SPLIT, COSEIZE, MATCH
- SEIZE and ASSIGN are engine synonyms for the resource-claiming action (C-Event phase)
- BATCH is a C-Event only macro; UNBATCH is a B-Event only macro
- FILL and DRAIN operate on container levels; containers must be declared in containerTypes
- SET modifies state variables; SET_ATTR modifies entity attributes; both use safe expression evaluator
- The 'Custom...' free-text escape hatch is REMOVED — do not recreate it
- new Function(), eval(), and any dynamic code execution are PROHIBITED
- All condition logic is serialised as JSON and evaluated by the safe condition evaluator

### Queue Discipline Implementation
- FIFO: select entity with smallest arrivalTime
- LIFO: select entity with largest arrivalTime
- PRIORITY: select entity with smallest Entity.priority (number); FIFO tiebreaker
- SPT: select entity with smallest service time / processing time; FIFO tiebreaker
- EDD: select entity with smallest due date; FIFO tiebreaker
- PRIORITY(attrName): select entity with smallest value of named attribute; FIFO tiebreaker
- queueRule is read and enforced by the engine on every SEIZE/ASSIGN — not just stored in UI

### Container Types
- Containers are declared in model.containerTypes with id, capacity (optional), initialLevel (optional)
- FILL(id, amount) and DRAIN(id, amount) are the only permitted operations on containers
- DRAIN guards: if level < amount the drain is rejected (no-op with error log) — levels never go negative
- Container levels are tracked via __container_<id> state variables readable in Predicate Builder conditions

### Distributions — Open and Extensible
- The 11 distributions in Section 6.1 are currently supported (lognormal listed but not yet implemented)
- New distribution types are added via registerDistribution() in distributions.js only
- No engine, macro, or validation files change when adding a new distribution type
- All sampling uses the seeded PRNG passed to buildEngine() — never Math.random()
- Negative duration samples from Normal are clamped to 0 (not an error)
- Non-positive inter-arrival or patience samples ARE a hard error — halt the engine
- CSV-imported empirical distributions store the values array in model_json at import time
- The engine never accesses CSV files at runtime — values array only
- Schedule distributions use rows[] for per-arrival attribute overrides (S40.2); plan exhaustion returns 1e9

### Validation Gates (all must run before buildEngine() proceeds)
- V1–V10 are blocking — run is prevented, error shown inline in editor
- V11, V15, V16 are warnings — run proceeds with a visible banner
- V20 (Queue capacity): must be integer >= 1; overflowDestination must reference a defined queue
- V21 (balking): balkProbability must be 0–1
- V22 (BATCH): batchSize must be integer >= 2; queue must exist
- V23 (UNBATCH): target queue must exist
- V24 (loop guard): maxLoopCount must be integer >= 1; exitQueueName must exist when set
- V25 (RENEGE argument): RENEGE(ctx) is correct; RENEGE(TypeName) silently fails — warning
- V26 (container types): id non-empty and unique; capacity > 0; initialLevel >= 0 and <= capacity
- V27 (FILL/DRAIN): referenced container must be declared in containerTypes
- V28 (epoch): model.epoch must be valid ISO 8601 when set
- V29 (cSchedule fallback): all-conditional cSchedules without a fallback entry — warning
- Validation errors must identify the specific node/event/attribute by name
- Console.log is not sufficient — errors must be surfaced in the UI

### Predicate Builder Constraints
- Variable picker: Entity attributes + Resource state vars + Queue state vars + user vars only
- Operator dropdown: filtered by valueType (number: 6 ops, string: 2 ops, boolean: 2 ops)
- Value input: changes widget type by valueType (number input / dropdown / toggle)
- Compound predicates serialise to nested JSON (Section 4.2) — never a flat string
- Entity filter predicates reference Entity.<attr> variables only — no Resource or Queue vars
```

---

## 9. Predicate Builder Implementation Checklist

Before marking the Predicate Builder feature complete, verify all of the following:

- [ ] Variable picker lists all Entity attributes, Resource state vars, Queue state vars, and user-defined state vars — nothing else
- [ ] Operator dropdown is filtered by `valueType`: number → 6 operators, string → 2, boolean → 2
- [ ] Value input changes widget type based on `valueType`: number → number input, string with `allowedValues` → dropdown, string without → text input, boolean → toggle
- [ ] Compound predicates (AND/OR) serialise to the nested JSON structure in Section 4.2 — not a flat string
- [ ] Entity filter predicates reference `Entity.<attr>` variables only — `Resource` and `Queue` variables must not appear in entity filter context
- [ ] The serialised predicate JSON is validated against the engine schema before saving
- [ ] It is impossible to construct a type-mismatched predicate through the UI
- [ ] `new Function()`, `eval()`, and any dynamic code execution are absent from condition evaluation

---

## 10. Out of Scope for This Version

The following were valid future extensions at the time of writing but have since been implemented:

- ~~**Conditional routing**~~ — ✅ Implemented in Sprint 10 (RELEASE routing table with conditions and probabilistic routing)
- ~~**Resource pooling**~~ — ✅ Implemented in Sprint 10 (multi-server resources with capacity > 1)
- ~~**Pre-emption**~~ — ✅ Implemented in Sprint 32 (PREEMPT macro with remaining service time preservation)
- ~~**Entity splitting**~~ — ✅ Implemented in Sprint 33 (SPLIT macro creating N-1 clones)

The following remain **out of scope**:

- **Batch arrivals** — multiple entities created per ARRIVE event
- **Multiple entity classes per Source** — one Source generates one class only

The following are **explicitly in scope** and should not be treated as out of scope when encountered during development:

- **CSV-imported empirical distributions** — see Section 6.3. Values are extracted at import time and stored in model_json. No runtime file access.
- **Additional parametric distribution types** — added via the registry pattern in distributions.js. No ADR required unless the sampler interface changes.

## 11. Complete Macro Vocabulary (Current)

The complete macro set implemented in the engine. This is the authoritative list — AGENTS.md Section 5.1 is partially outdated and defers to this section.

> **Naming note:** SEIZE (documented in Section 5, Macro 2) and ASSIGN (code macro name) are engine synonyms for the resource-claiming action. The validation layer accepts both. Use SEIZE in new model definitions for clarity.

| Macro | Phase | Sprint | Purpose |
|---|---|---|---|
| ARRIVE | B-Event | 1 | Creates entity, places in queue, schedules next arrival |
| SEIZE / ASSIGN | C-Event | 1 | Matches waiting entity to idle server; schedules COMPLETE |
| COMPLETE | B-Event | 1 | Releases server, records stats, routes entity to next node |
| RELEASE | B-Event | 1 | Frees server and routes entity to another queue |
| RENEGE | B-Event | 1 | Removes entity from queue after patience timeout; routes to Sink |
| BATCH | C-Event | 12 | Accumulates N entities per queue discipline into a parent batch entity |
| UNBATCH | B-Event | 12 | Restores children from a parent batch to a target queue |
| PREEMPT | B-Event | 32 | Interrupts busy server; re-queues displaced entity with remaining service time |
| FAIL | B-Event | 32 | Sets matching servers to failed status |
| REPAIR | B-Event | 32 | Restores failed servers to idle |
| SPLIT | C/B-Event | 33 | `SPLIT(EntityType, N, Queue)` — exactly 3 args. Creates N-1 clones of the context entity and routes them to Queue; records `_splitParent`/`_splitChildren`. Trigger from a one-shot context only (e.g. a cSchedule-fired B-event) — a recurring C-event condition on the same entity/queue will refire unboundedly since SPLIT doesn't change the context entity's status. |
| COSEIZE | C-Event | 33 | Atomically seizes multiple server types simultaneously |
| MATCH | C-Event | 33 | `MATCH(TypeA, QueueA, TypeB, QueueB, Target)` — pairs one entity from each queue into a batch entity in Target. Merged attrs = `{...entityFromQueueA.attrs, ...entityFromQueueB.attrs}` — QueueB's value overwrites QueueA's on any name collision. |
| RENEGE_OLDEST | C-Event | post-33 | Removes the oldest waiting entity of a given type per queue discipline |
| FILL | B or C-Event | post-33 | Adds amount to a declared container level (clamped to capacity) |
| DRAIN | B or C-Event | post-33 | Subtracts amount from a declared container level (guard: level must be ≥ amount) |
| SET | B or C-Event | post-33 | Assigns a computed arithmetic expression to a user-defined state variable |
| SET_ATTR | B or C-Event | post-33 | Mutates a named attribute on the context entity using an arithmetic expression |
| COST | B or C-Event | post-33 | Accumulates a cost amount to `state.__totalCost` and per-entity `__cost` attribute |
| DELAY | C-Event | post-33 | Resource-free timed activity — removes entity from queue, marks "serving" without claiming any server; completion B-Event handles routing |

## 12. Extended Queue Disciplines (Post-Sprint 3)

The original 3 queue disciplines (FIFO, LIFO, PRIORITY) defined in Section 8 have been extended. The complete current set is documented in `AGENTS.md` Section 6:

| Discipline | Sprint | Selection Rule |
|---|---|---|
| FIFO | 1 | Smallest arrivalTime |
| LIFO | 1 | Largest arrivalTime |
| PRIORITY | 1 | Smallest priority attribute value (FIFO tiebreaker) |
| SPT | 33 | Shortest processing time first |
| EDD | 33 | Earliest due date first |
| PRIORITY(attrName) | 33 | Lowest value of specified attribute |
