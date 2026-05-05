# DES Tool — Specification Addition 1
## Entity Model, Attribute Schema & Action Vocabulary
**Status:** Approved for Sprint 1 | **Version:** 1.0

---

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
| `role` | enum | Yes in DES Studio implementation | `customer` for arriving entities or `server` for pre-created resources. |
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
| **Routing** | Routing is determined by the edge leaving the Activity node in the DAG. A single outgoing edge to one Queue or Sink is the standard case. Conditional routing is not supported in this version. |
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
| **Scheduling** | The RENEGE B-Event is scheduled inside the ARRIVE action at `T_arrival + sample(patienceDist)`. It is not scheduled by a C-Event. The modeller sets `patienceDist` on the Source node, not on the Activity. |
| **Error conditions** | If `patienceDist` produces a non-positive sample, the engine must raise a validation error. An entity cannot renege before it arrives. |

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
| `lognormal` | `logMean: number, logStdDev: number` | exp(logMean + logStdDev²/2) | For right-skewed service times. Parameters are mean and stddev of the underlying normal. |
| `empirical` | `values: number[]` (non-empty), optional `sourceFile`, `column` | mean(values) | Samples uniformly from list. Values may be entered inline or imported from CSV. |
| `piecewise` | `periods: { startTime, distribution }[]` | active period mean | Selects the period with the greatest `startTime <= clock`, then delegates sampling to that period's distribution. |

### 6.2 Distribution JSON Schema

Parametric distributions:

```json
{ "type": "exponential", "rate": 0.1 }

{ "type": "uniform", "min": 5, "max": 15 }

{ "type": "normal", "mean": 10, "stdDev": 2 }

{ "type": "triangular", "min": 4, "mode": 8, "max": 15 }

{ "type": "fixed", "value": 8 }

{ "type": "lognormal", "logMean": 2.1, "logStdDev": 0.4 }
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

DES Studio stores UI-authored piecewise distributions in the existing schedule shape as `dist: "Piecewise"` with `distParams.periods[]`. The engine accepts both the lower-case schema form above and the UI form.

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
| V7 | Every Activity node must have exactly one incoming edge and one outgoing edge. | Blocking | `Activity '{id}' has {n} incoming / {m} outgoing edges. Expected 1 of each.` |
| V8 | The model must contain at least one Source node and one Sink node. | Blocking | `Model has no Source node.` / `Model has no Sink node.` |
| V9 | No C-Event condition may reference an undefined variable or attribute. | Blocking | `Condition references unknown variable '{ref}' in C-event '{id}'.` |
| V10 | No entity attribute name may collide with a built-in state variable prefix (`Resource`, `Queue`). | Blocking | `Attribute name '{name}' conflicts with built-in variable namespace.` |
| V11 | Normal distribution where > 5% of samples would be negative (detectable when mean < 2 × stdDev). | Warning only | `Normal distribution in '{context}' may produce negative samples frequently (mean={m}, stdDev={s}). Samples will be clamped to 0.` |
| V12 | Piecewise distributions must have at least one period and period 0 must start at time 0. | Blocking | `{context}: Piecewise distribution must start at time 0.` |
| V13 | Piecewise distribution periods must be sorted ascending by `startTime`. | Blocking | `{context}: Piecewise periods are not sorted by start time.` |
| V14 | Server `shiftSchedule` must start at time 0, be sorted ascending, and use positive integer capacities. | Blocking | `Server '{name}' shift schedule must start at time 0.` |
| V15 | Shift times after configured run duration are unreachable. | Warning only | `Server '{name}' shift at t={time} is after the run duration.` |
| V16 | Open-ended arrival models should define a time or condition termination. | Warning only | `No simulation time limit or termination condition set.` |

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

### Action Vocabulary — Closed Set
- The five permitted macros are: ARRIVE, SEIZE, COMPLETE, ASSIGN, RENEGE
- No other macros may be added without updating Addition 1
- The 'Custom...' free-text escape hatch is REMOVED — do not recreate it
- new Function(), eval(), and any dynamic code execution are PROHIBITED
- All condition logic is serialised as JSON and evaluated by the safe condition evaluator

### Queue Discipline Implementation
- FIFO: select entity with smallest arrivalTime
- LIFO: select entity with largest arrivalTime
- PRIORITY: select entity with smallest Entity.priority (number); FIFO tiebreaker
- queueRule is read and enforced by the engine on every SEIZE — not just stored in UI

### Distributions — Open and Extensible
- The seven distributions in Section 6.1 are currently supported — this is not a closed set
- New distribution types are added via registerDistribution() in distributions.js only
- No engine, macro, or validation files change when adding a new distribution type
- All sampling uses the seeded PRNG passed to buildEngine() — never Math.random()
- Negative duration samples from Normal/Lognormal are clamped to 0 (not an error)
- Non-positive inter-arrival or patience samples ARE a hard error — halt the engine
- CSV-imported empirical distributions store the values array in model_json at import time
- The engine never accesses CSV files at runtime — values array only

### Validation Gates (all must run before buildEngine() proceeds)
- V1–V10 are blocking — run is prevented, error shown inline in editor
- V11 is a warning — run proceeds with a visible banner
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

The following are valid future extensions but are **not supported** in the current version. If a modeller's use case requires one of these, the correct answer is that this version does not support it — not to add a workaround.

- **Conditional routing** — different next nodes from one Activity based on state
- **Resource pooling** — shared capacity across resource types
- **Batch arrivals** — multiple entities created per ARRIVE event
- **Pre-emption** — interrupting an in-service entity to serve a higher-priority one
- **Entity splitting or joining** — fork/join patterns
- **Multiple entity classes per Source** — one Source generates one class only

The following are **explicitly in scope** and should not be treated as out of scope when encountered during development:

- **CSV-imported empirical distributions** — see Section 6.3. Values are extracted at import time and stored in model_json. No runtime file access.
- **Additional parametric distribution types** — added via the registry pattern in distributions.js. No ADR required unless the sampler interface changes.
