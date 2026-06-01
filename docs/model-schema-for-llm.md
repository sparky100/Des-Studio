# DES Studio — Model Schema Reference for LLM Generation

**Version:** 1.3.2
**Date:** 2026-06-01
**Sprint baseline:** Sprint 71

| Version | Date | Sprint | Changes |
|---------|------|--------|---------|
| v1.0.0 | 2026-05-23 | Sprint 70 | Initial versioned snapshot — schema as delivered at Sprint 70 |
| v1.1.0 | 2026-05-23 | Sprint 70 | Added SPT, EDD, PRIORITY(attrName) queue disciplines to §3; added V11 (Normal warning) and V16 (no termination condition warning) to §10 validation table |
| v1.2.0 | 2026-05-23 | Sprint 70 | Fixed app URL to `https://des.simmodlr.app`; updated LLM delivery instructions to save JSON file and produce magic link |
| v1.3.0 | 2026-05-24 | Sprint 71 | Added `openSky` data source type to §15 (OpenSky Network real-time adapter); added §15.1 `openSky` field reference and supported airports table; added "Airport Arrivals" model pattern to §11 |
| v1.3.1 | 2026-06-01 | Docs correction | Clarified probabilistic arrival splitting: use separate ARRIVE B-events with proportional inter-arrival means; never use `probabilisticRouting` on ARRIVE events |
| v1.3.2 | 2026-06-01 | Results contract | Added `entity.outcome` and `summary.outcomes` journey-conclusion result metadata for terminal route reporting and AI analysis |

---

**Purpose:** This file is the authoritative specification for generating valid DES Studio model JSON.
Paste it (or reference it) as context when prompting any LLM to create or modify a model.

---

## TOP 10 LLM MISTAKES

These are the most common errors LLMs make when generating DES Studio models.
Read this before writing any model JSON.

| # | Mistake | Fix |
|---|---------|------|
| 1 | `probabilisticRouting` on ARRIVE B-events | ARRIVE events route entities via their effect macro — never via routing tables. For arrival splits, create one ARRIVE B-event per stream and set each Exponential mean to `baseMean / probability`. |
| 2 | `"effect": ["RELEASE(Server)", "COMPLETE()"]` | `RELEASE` sets entity to `"waiting"` so `COMPLETE` is silently skipped. Use `"effect": ["COMPLETE()"]` alone — COMPLETE releases the server automatically. |
| 3 | Missing `useEntityCtx: true` on cSchedules | Without this, the target B-event can't identify the entity. Always add `"useEntityCtx": true` to every `cSchedules[]` entry. |
| 4 | `balkCondition` as a string | Must be a predicate object: `{ "variable": "...", "operator": "...", "value": "..." }`. Never a string expression. |
| 5 | `routing[].condition` as a string | Same as #4 — must be a predicate object, never a string. |
| 6 | `"effect"` as a bare string | Must be an array: `"effect": ["ARRIVE(Customer)"]` — never `"effect": "ARRIVE(Customer)"`. |
| 7 | `scheduledTime` as a number | Must be a string: `"scheduledTime": "0"` — never `"scheduledTime": 0`. |
| 8 | Distribution params as numbers | Must be strings: `"distParams": { "mean": "5" }` — never `{ "mean": 5 }`. |
| 9 | `RENEGE(Patient)` instead of `RENEGE(ctx)` | Always use `RENEGE(ctx)`. The entity-type form silently fails (validation V25). |
| 10 | No `COMPLETE()` or `RENEGE()` sink | Every model needs at least one exit path. Missing sinks = entities accumulate forever (validation V8, CHK-002). |

---

## 1. Top-Level Structure

```json
{
  "name": "string (required)",
  "description": "string (optional, 1–3 sentences)",
  "visibility": "private",
  "timeUnit": "minutes",
  "entityTypes": [],
  "stateVariables": [],
  "queues": [],
  "bEvents": [],
  "cEvents": [],
  "goals": [],
  "containerTypes": [],
  "experimentDefaults": {
    "maxSimTime": 500,
    "warmupPeriod": 0,
    "replications": 5,
    "liveDataMode": null
  },
  "dataSources": []
}
```

### Top-level field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Human-readable model name |
| `description` | string | No | 1–3 sentence summary, used by AI features |
| `visibility` | `"private"` \| `"public"` | No | Default `"private"` |
| `timeUnit` | `"seconds"` \| `"minutes"` \| `"hours"` \| `"days"` | No | Defines what one simulation clock unit represents. Default `"minutes"`. Shown in reports and AI narrative. |
| `epoch` | ISO 8601 datetime string, e.g. `"2026-05-18T08:00:00"` | No | Anchors simulation time zero to a real-world calendar datetime. Absent means abstract simulation time (no wall-clock anchor). When set, enables: (1) simulation time ↔ calendar datetime conversion throughout the engine; (2) automatic parsing of `HH:MM` or ISO datetime values in the `time` column of CSV imports; (3) display of the real-world period in reports and experiment controls. **Required when importing a CSV whose time column contains `HH:MM` or ISO datetime strings.** |
| `experimentDefaults.liveDataMode` | `null` \| `"calibrated_batch"` \| `"rolling"` \| `"lookahead"` | No | Live-data run mode. `null` = static (default). See §15 for live data. |
| `dataSources` | array | No | Live data source definitions. See §15. |

---

## 2. Entity Types

Every model has entity types. There are two roles: **customer** (flows through the system) and **server** (provides service).

```json
{
  "id": "et_patient",
  "name": "Patient",
  "role": "customer",
  "count": 0,
  "attrDefs": [
    {
      "name": "priority",
      "valueType": "number",
      "defaultValue": 3,
      "mutable": true,
      "dist": "Uniform",
      "distParams": { "min": "1", "max": "5" }
    }
  ]
}
```

```json
{
  "id": "et_nurse",
  "name": "Nurse",
  "role": "server",
  "count": 2,
  "attrDefs": []
}
```

### Rules

- `name` must be unique across all entity types.
- `role` is `"customer"` or `"server"`.
- Customer `count` is always `0` — arrivals are generated by `ARRIVE()`.
- Server `count` must be an integer ≥ 1.
- `attrDefs[].name` must be unique within the entity type.
- `attrDefs[].name` must not start with `Resource` or `Queue` (reserved namespaces).
- `attrDefs[].valueType` is `"number"`, `"string"`, or `"boolean"`.
- `attrDefs[].defaultValue` must match the declared `valueType`.
  - `number` → numeric string or number, e.g. `"3"` or `3`
  - `boolean` → `"true"` or `"false"` (string)
  - `string` → any string
- If `dist` is set, `distParams` is required. See §4 for valid distributions.

### Optional: Server Shift Schedule

Servers can have time-varying capacity:

```json
"shiftSchedule": [
  { "time": 0,   "capacity": 2 },
  { "time": 480, "capacity": 1 },
  { "time": 960, "capacity": 0 }
]
```

- First period must start at `time: 0`.
- Times must be strictly ascending.
- `capacity` must be a positive integer.

### Optional: Server Failure Model

Servers can have random failures (the engine auto-generates FAIL/REPAIR events):

```json
"mtbfDist": "Exponential",
"mtbfDistParams": { "mean": "360" },
"mttrDist": "Triangular",
"mttrDistParams": { "min": "20", "mode": "45", "max": "90" }
```

- All four fields (`mtbfDist`, `mtbfDistParams`, `mttrDist`, `mttrDistParams`) must be set together — partial specification is not valid.
- `mtbfDist` / `mttrDist`: any distribution name from §4. `Exponential` and `Triangular` are most common.
- Mean time between failures (`mtbfDist`) should be much larger than mean time to repair (`mttrDist`).
- No additional B-events or C-events are needed — the engine handles failure scheduling automatically.

---

## 2.1 Runtime Outcome Metadata

This is output metadata, not author-authored model JSON. When an entity reaches a terminal path, result snapshots may include:

```json
{
  "outcome": {
    "status": "completed",
    "routeId": "route-exit:b_triage_done",
    "routeLabel": "Exit",
    "endedBy": "direct-routing",
    "endedAt": 42.5,
    "sourceEventId": "b_triage_done",
    "sourceEventName": "Triage Done"
  }
}
```

The run summary also aggregates these conclusions:

```json
"summary": {
  "served": 19,
  "reneged": 0,
  "outcomes": {
    "route-exit:b_triage_done": {
      "routeId": "route-exit:b_triage_done",
      "routeLabel": "Exit",
      "status": "completed",
      "endedBy": "direct-routing",
      "count": 7
    }
  }
}
```

Use `summary.outcomes` for reports and AI analysis when answering how customers concluded their journey. Do not infer route-specific outcomes from log text.

---

## 3. Queues

Queues are waiting areas for customers.

```json
{
  "id": "q_triage",
  "name": "Triage Queue",
  "customerType": "Patient",
  "capacity": "",
  "discipline": "FIFO"
}
```

### Rules

- `name` must be unique across all queues. **Queue names are used as references in macros — they must match exactly (case-sensitive).**
- `customerType` must match the `name` of a customer entity type.
- `capacity`: `""` means unlimited. An integer ≥ 1 sets a finite buffer.
- `discipline`: `"FIFO"` (default), `"LIFO"`, `"PRIORITY"`, `"PRIORITY(attrName)"`, `"SPT"`, or `"EDD"`.
  - `PRIORITY` requires the customer entity type to have an attribute named **exactly** `priority` of type `number`. Lower numeric value = higher priority.
  - `PRIORITY(attrName)` uses the named attribute instead of `priority` — e.g. `"PRIORITY(severity)"`. The named attribute must be of type `number`.
  - `LIFO` selects the most-recently-arrived entity (last in, first out).
  - `SPT` (Shortest Processing Time) selects the entity with the smallest `serviceTime` or `processingTime` attribute value. FIFO tiebreaker on equal values.
  - `EDD` (Earliest Due Date) selects the entity with the smallest `dueDate` attribute value. FIFO tiebreaker on equal values.
- `overflowDestination` (optional): name of another queue to receive overflow entities when this queue is full.

---

## 4. Distributions

Used in B-event schedules, C-event service times, and entity attribute defaults.

| Distribution  | Required params                              | Constraints                        |
|---------------|----------------------------------------------|------------------------------------|
| `Fixed`       | `{ "value": "5" }`                           | value is numeric                   |
| `Exponential` | `{ "mean": "5" }`                            | mean > 0                           |
| `Uniform`     | `{ "min": "2", "max": "8" }`                 | max > min                          |
| `Normal`      | `{ "mean": "10", "stddev": "2" }`            | stddev > 0; warn if mean < 2×stddev|
| `Triangular`  | `{ "min": "2", "mode": "5", "max": "10" }`   | min ≤ mode ≤ max                   |
| `Erlang`      | `{ "k": "3", "mean": "6" }`                  | k integer ≥ 1; mean > 0            |
| `Empirical`   | `{ "values": [4, 6, 8, 12] }` (or via CSV import) | Non-empty array; samples uniformly |
| `Piecewise`   | `{ "periods": [{ "startTime": "0", "dist": "Exponential", "distParams": { "mean": "3" } }, ...] }` | First period must start at 0; sorted ascending |
| `Schedule`    | `{ "times": [10, 25, 40] }` or `{ "rows": [{ "time": 10, "attrs": { ... } }, ...] }` | Planned absolute arrival times; exhausts and stops |
| `ServerAttr`  | `{ "attr": "serviceTime" }`                  | Reads named attribute from matched server entity; returns max(0, value) or 1 if not found |
| `EntityAttr`  | `{ "attr": "requestedDuration" }`            | Reads named attribute from arriving customer entity; returns value or 0 if not found |

**All numeric parameter values must be strings** (e.g. `"5"`, not `5`).

---

## 5. B-Events (Bound Events)

B-events are scheduled future occurrences — arrivals and service completions.

```json
{
  "id": "b_arrive",
  "name": "Patient Arrives",
  "scheduledTime": "0",
  "effect": ["ARRIVE(Patient, Triage Queue)"],
  "schedules": [
    {
      "eventId": "b_arrive",
      "dist": "Exponential",
      "distParams": { "mean": "5" }
    }
  ]
}
```

```json
{
  "id": "b_triage_done",
  "name": "Triage Complete",
  "scheduledTime": "9999",
  "effect": ["RELEASE(Nurse, Treatment Queue)"],
  "schedules": []
}
```

### Alternative schedule shape: planned arrivals

Instead of `dist`/`distParams`, a schedule entry can supply an explicit list of pre-determined arrival times. Use this when you have historical or planned data rather than a statistical distribution.

**Times-only (equal-spaced or irregular):**

```json
{
  "eventId": "b_arrive",
  "times": [10, 25, 40, 60, 85]
}
```

**Times with per-arrival entity attributes (imported from CSV):**

```json
{
  "eventId": "b_arrive",
  "rows": [
    { "time": 10, "attrs": { "severity": 3, "age": 45 } },
    { "time": 25, "attrs": { "severity": 1, "age": 32 } },
    { "time": 60, "attrs": { "severity": 2, "age": 28 } }
  ]
}
```

- Each `rows[].time` is an absolute simulation clock time. When the model has an `epoch` set, the time column in the source CSV can instead contain `HH:MM` (e.g. `08:30`) or ISO datetime (e.g. `2026-05-18T08:30:00`) strings; the importer converts them to simulation-clock offsets from `epoch` automatically.
- `rows[].attrs` key names must match `attrDefs[].name` on the arriving entity type.
- When all scheduled arrivals are exhausted the arrival B-event does not reschedule.
- `times[]` and `rows[]` are mutually exclusive with `dist`/`distParams` in the same schedule entry.

> **Developer note:** The conversion from `HH:MM` / ISO timestamps to simulation time is handled by `parsePlanCsv(text, { epoch, timeUnit })` in `src/ui/shared/planCsvParser.js`. Pass the model's `epoch` string and `timeUnit` to this function when building integrations that ingest CSV data.

### Planned Arrival CSV Delivery

When a model uses planned arrivals with `rows[]`, always create a companion CSV alongside the model JSON.

There are **two CSV formats** depending on whether the model has one or multiple arrival B-events.

---

#### Format 1 — Single arrival B-event

Use when the model has exactly one arrival B-event.

The CSV must:
- use `time` as the first column
- include one column for each `attrDefs[].name` on the arriving entity type
- use column names that **exactly match** the entity attribute names (case-sensitive)
- contain one row per planned arrival
- use numeric simulation times unless the model has an `epoch`, in which case `HH:MM` or ISO timestamps may be used

Example — a clinic model with `epoch` set and a `Patient` entity with attributes `severity` and `age`:

```
time,severity,age
08:00,3,45
08:15,1,32
08:30,2,28
```

---

#### Format 2 — Multiple arrival B-events (required when model has more than one arrival B-event)

Use when the model has two or more arrival B-events (e.g. separate arrival streams per route, service type, or entry point). **A single-event CSV cannot represent multiple streams — you must use this format.**

The CSV must:
- use `event` as the **first column** — this is the trigger that switches the importer to multi-event mode
- use `time` as the **second column**
- include one column for each `attrDefs[].name` on the arriving entity type (remaining columns)
- use column names that **exactly match** the entity attribute names (case-sensitive)
- contain one row per planned arrival across all streams

The `event` column value must match either the B-event `id` or the B-event `name` (matching is case-insensitive). Using the B-event `id` (e.g. `b_wcml_train_arrives`) is recommended for reliability.

Accepted spellings for the first-column header: `event`, `eventid`, `event_id`, `b_event`, `bevent`, `b-event`.

Example — a Glasgow Central station model with `epoch` set and separate arrival streams per route, `Train` entity with attributes `train_id`, `route_group`, `platform_group`, `operation_type`, `priority`:

```
event,time,train_id,route_group,platform_group,operation_type,priority
b_wcml_train_arrives,05:40,HL0001,wcml_motherwell,long_distance,arrival,2
b_wcml_train_arrives,05:57,HL0002,wcml_motherwell,long_distance,arrival,2
b_south_western_train_arrives,05:43,SW0001,south_western_barrhead,suburban_regional,arrival,3
b_cathcart_train_arrives,05:49,CN0001,cathcart_newton_neilston,suburban_regional,arrival,3
b_ayrshire_train_arrives,05:51,AY0001,ayrshire_inverclyde_paisley,suburban_regional,arrival,3
b_low_level_train_arrives,05:55,LL0001,low_level,suburban_regional,arrival,4
```

Rows for different B-events can be interleaved in any order — the importer groups them by the `event` column value.

**When to use Format 2:** Any model where `bEvents` contains more than one entry with a non-empty `schedules[]` array (i.e. more than one arrival generator). If you generate Format 1 for such a model, only one B-event will receive rows and the other arrival streams will produce no arrivals.

---

**Size guidance:** For schedules with more than 50 rows, keep the model JSON's `rows[]` empty (`"rows": []`) and deliver all arrival data exclusively in the companion CSV. The user imports it via the **Schedules** tab. For 50 rows or fewer, embedding rows inline in the JSON is acceptable.

> **ADR-016 note (Sprint 73+):** In production models, timetable rows are stored externally in the `model_schedules` Supabase table rather than inline in `model_json`. A B-event schedule entry may carry a `scheduleRef` UUID instead of `rows[]`. The engine merges external rows at run-time via `resolveInlineSchedules()`. When generating a model JSON for import, leave `rows[]` empty and note in the companion CSV; users load schedule data via the **Schedules** tab. You do not need to emit `scheduleRef` — the platform assigns it.

The companion CSV is returned in the `companionCsv` field of the response envelope (see Response Format). Set `companionCsv` to `null` when the model does not use planned arrivals.

### Rules

- `id` must be unique across all B-events.
- `scheduledTime`: use `"0"` for arrival generators (they reschedule themselves). Use `"9999"` for completion/release events (scheduled by the engine at service start).
- `schedules`: for recurring B-events (arrivals), include one entry with `eventId` matching this event's own `id` and either a distribution or a `times[]`/`rows[]` list. Leave as `[]` for completion events.
- `schedules[].eventId` **is required** — must reference a valid B-event `id`. An entry without `eventId` is silently skipped by the engine and the event will never re-fire (CHK-010 error).
- `schedules[].isRenege` (boolean, optional): when `true`, this schedule entry is an abandonment timer. If the entity is still waiting when this fires, it reneges. Pair with a B-event whose `effect` is `["RENEGE(ctx)"]`. Only one `isRenege` entry per B-event is meaningful.
- `balkCondition` (optional): a **predicate object** `{ "variable", "operator", "value" }` — tested at arrival time. If true, the entity does not join the queue. Use `"variable": "Queue.<queueName>.length"` to test queue occupancy. **Never a string** (CHK-011 error).
- `routing[].condition` **must be a predicate object** — never a string (CHK-012 error). See §5 Conditional Routing Table.
- `defaultQueueName` (optional): fallback queue used when no routing condition matches. Must reference a valid queue name. Required when using `routing` without a guaranteed catch-all condition.

### Effect Macros for B-Events

The `effect` field is **always an array of strings**. Each string is one macro call. Example: `"effect": ["ARRIVE(Patient, Triage Queue)"]`. You may combine multiple macros in the array: `"effect": ["SET(waiting, 1)", "ARRIVE(Patient, Queue)"]`.

> **Note:** The single-string form `"effect": "ARRIVE(...)"` is not supported — always use an array.

| Macro | Syntax | Meaning |
|-------|--------|---------|
| `ARRIVE` | `ARRIVE(EntityType, QueueName)` | Creates an entity of type `EntityType` and places it in `QueueName`. |
| `RELEASE` | `RELEASE(ServerType, QueueName)` | **Intermediate stage only.** Releases a server of type `ServerType`, moves served entity to `QueueName` for the next stage. Sets entity status to `"waiting"`. **Do NOT follow with `COMPLETE()` in the same effect — use `COMPLETE()` alone for terminal events.** |
| `COMPLETE` | `COMPLETE()` | Marks current entity as served and removes it from the system. Also releases the server automatically — no preceding `RELEASE()` needed. Use this alone as the terminal effect on the final service B-event. |
| `RENEGE` | `RENEGE(ctx)` | Marks current entity as reneged (abandoned). Always use `ctx` as the argument. |
| `UNBATCH` | `UNBATCH(QueueName)` | Splits a batch, sends each member to `QueueName`. |
| `FILL` | `FILL(containerId, amount)` | Adds `amount` to a container's level. `containerId` must match a declared container `id`. |
| `PREEMPT` | `PREEMPT(ServerType)` | Interrupts in-progress service; displaced entity re-queues with remaining service time. |
| `FAIL` | `FAIL(ServerType)` | Marks servers of this type as failed; interrupts in-progress service. Pair with a scheduled `REPAIR` B-event. |
| `REPAIR` | `REPAIR(ServerType)` | Restores failed servers to idle; triggers a C-scan for waiting entities. |
| `SPLIT` | `SPLIT(EntityType, N, QueueName)` | Creates N−1 clones of the context entity and places them in `QueueName`. |
| `SET` | `SET(varName, expression)` | Sets a state variable to an arithmetic expression. Supports `Entity.attrName`, state variables, `clock`, +−×÷, `min`/`max`/`abs`/`round`/`floor`/`ceil`. |
| `SET_ATTR` | `SET_ATTR(attrName, expression)` | Sets the context entity's attribute to the result of an arithmetic expression. |
| `COST` | `COST(expression)` | Accumulates a numeric expression to `summary.totalCost` and the entity's `__cost` attribute. |

### Optional: Conditional Routing Table

After service, route entities to different queues based on entity attribute conditions. Each `condition` is a **predicate object** — never a string.

```json
"routing": [
  { "condition": { "variable": "Entity.priority", "operator": "<", "value": 2 }, "queueName": "Urgent Queue" },
  { "condition": { "variable": "Entity.priority", "operator": ">=", "value": 2 }, "queueName": "General Queue" }
],
"defaultQueueName": "General Queue"
```

Predicate object fields:

| Field | Type | Description |
|---|---|---|
| `variable` | string | Must use `Entity.<attrName>` to reference an entity attribute |
| `operator` | string | One of `==`, `!=`, `<`, `>`, `<=`, `>=` |
| `value` | string \| number \| boolean | The comparison value; must match the attribute's `valueType` |

- `routing` and `probabilisticRouting` are mutually exclusive.
- `routing` cannot be combined with a queue argument in `RELEASE(Server, Queue)`.
- `defaultQueueName` must reference a valid queue name.
- **Do not use a string condition** (e.g. `"entity.priority < 2"`) — the engine only evaluates predicate objects in routing; a string will cause an error.

### Optional: Probabilistic Routing

> **Constraint: `probabilisticRouting` is only valid on B-events whose `effect` contains a `RELEASE` statement.** It must NOT be placed on arrival B-events (those whose effect contains `ARRIVE`). For arrival-time splitting (e.g. 30% high-acuity, 70% low-acuity), use separate ARRIVE B-events with appropriately scaled inter-arrival times (Poisson splitting) rather than probabilistic routing on a single arrival event. If the base Exponential mean is `M` and a stream probability is `p`, that stream's mean is `M / p`.

```json
"probabilisticRouting": [
  { "probability": 0.7, "queueName": "Ward Queue" },
  { "probability": 0.3, "queueName": "ICU Queue" }
]
```

- Probabilities must sum to exactly `1.0` (±0.001).
- `queueName` must reference a valid queue name, or `null` to exit the system ("Exit system" in the UI).
- **When `queueName` is `null` (exit), the B-Event's `effect` must include `COMPLETE()`, `RENEGE(ctx)`, or `RELEASE()`** — one of these is required so the entity lifecycle is properly closed (validation V30). For mid-network service events where a nurse or doctor is released, `RELEASE()` is the correct choice.

### Terminal Completion Pattern — Preferred vs Anti-Pattern

**Use `probabilisticRouting` with `queueName: null` ONLY when the event genuinely has probabilistic branching** — for example, some entities continue to another queue and some exit the system (e.g. A&E triage: 30% discharged, 70% continue to treatment).

**For a simple terminal service completion, do NOT use `probabilisticRouting` with `queueName: null`.** Use explicit `COMPLETE()` with no routing table.

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Preferred: Explicit COMPLETE** | Simple terminal completion — all entities exit after this event | `"effect": ["COMPLETE()"], "schedules": []` |
| **✓ Valid: RELEASE + probabilistic exit** | Mid-network service where some entities exit and some continue; server must be freed | `"effect": ["RELEASE(Nurse)"], "probabilisticRouting": [{"queueName": "Treatment Queue", "probability": 0.7}, {"queueName": null, "probability": 0.3}]` |
| **✗ Anti-Pattern: RELEASE then COMPLETE** | **(Broken — never use)** `RELEASE` sets entity to `"waiting"` so `COMPLETE` is silently skipped | `"effect": ["RELEASE(Server)", "COMPLETE()"]` |
| **✗ Anti-Pattern: Null routing with prob 1.0** | (Avoid) Redundant — adds unnecessary complexity | `"effect": ["COMPLETE()"], "probabilisticRouting": [{ "queueName": null, "probability": 1 }]` |

**Why RELEASE + null routing works:** `RELEASE()` frees the server and sets the entity to `"waiting"`, which triggers the routing block. Entities routed to `null` are then marked as done and counted as served by the engine. Do NOT add `COMPLETE()` after `RELEASE()` — `COMPLETE()` only fires on `"serving"` entities and will be silently skipped after a `RELEASE()`.

**Validation guidance (V30):** If `probabilisticRouting` contains only a single route with `probability: 1` and `queueName: null`, prefer replacing it with explicit `COMPLETE()` in the effect array and no routing table. This reduces model complexity and makes the terminal intent explicit.

> **Critical rule (V38): Never write `RELEASE(Server)` immediately before `COMPLETE()` in the same effect.** `RELEASE` sets the entity to `"waiting"` state. `COMPLETE` requires `"serving"` state and will silently skip, leaving the entity stuck in the departure queue forever. `COMPLETE()` releases the server automatically — no preceding `RELEASE` is needed on a terminal B-event.

**Correct pattern for simple terminal completion:**
```json
{
  "id": "b_departure_done",
  "name": "Departure Complete",
  "effect": ["COMPLETE()"],
  "schedules": []
}
```

**Wrong pattern — entities will never complete (validation warning V38):**
```json
{
  "id": "b_departure_done",
  "name": "Departure Complete",
  "effect": ["RELEASE(Server)", "COMPLETE()"],
  "schedules": []
}
```

**Correct pattern for intermediate stage (hand entity to next queue):**
```json
{
  "id": "b_stage1_done",
  "name": "Stage 1 Complete",
  "effect": ["RELEASE(Nurse, Treatment Queue)"],
  "schedules": []
}
```

**Correct pattern for probabilistic exit (some continue, some exit):**
```json
{
  "id": "b_triage_decision",
  "name": "Triage Decision",
  "effect": ["RELEASE(Nurse)"],
  "probabilisticRouting": [
    { "probability": 0.7, "queueName": "Ward Queue" },
    { "probability": 0.3, "queueName": null }
  ]
}
```
`RELEASE(Nurse)` frees the nurse and sets the entity to `"waiting"`, enabling the routing block to fire. The 30% routed to `null` ("Exit system") are counted as served by the engine. Do NOT add `COMPLETE()` here — it would be silently skipped.

### Optional: Balking

```json
"balkProbability": 0.1
```

Or condition-based — `balkCondition` is a **predicate object** (never a string):

```json
"balkCondition": { "variable": "Queue.Triage Queue.length", "operator": ">", "value": 10 }
```

| Field | Type | Description |
|---|---|---|
| `variable` | string | `Queue.<queueName>.length` to test queue occupancy |
| `operator` | string | One of `==`, `!=`, `<`, `>`, `<=`, `>=` |
| `value` | number | The threshold to compare against |

- **Do not use a string condition** (e.g. `"queue(X).length > 10"`) — that format is only valid in C-event `condition` fields; a string `balkCondition` will cause a pre-run error (CHK-011).

### Optional: Loop Guard (Recirculation)

```json
"loopConfig": {
  "maxLoopCount": 3,
  "exitQueueName": "Exit Queue"
}
```

- `maxLoopCount` must be an integer ≥ 1.
- `exitQueueName` must reference a valid queue name.

---

## 6. C-Events (Conditional Events)

C-events fire whenever their condition becomes true. They represent service start logic.

```json
{
  "id": "c_start_triage",
  "name": "Start Triage",
  "priority": 1,
  "condition": "queue(Triage Queue).length > 0 AND idle(Nurse).count > 0",
  "effect": ["ASSIGN(Triage Queue, Nurse)"],
  "cSchedules": [
    {
      "eventId": "b_triage_done",
      "dist": "Uniform",
      "distParams": { "min": "2", "max": "5" },
      "useEntityCtx": true
    }
  ]
}
```

### Rules

- `id` must be unique across all C-events.
- `priority`: integer, lower value = fires first when multiple conditions are simultaneously true.
- `condition`: predicate expression (see §6.1 below).
- `effect` must use `ASSIGN` for standard service start.
- `cSchedules[].eventId` must reference a valid B-event `id`.
- `cSchedules[].useEntityCtx`: **must be `true`** for service completion events so the engine associates the scheduled B-event with the specific entity being served. Omitting it means the B-event fires with no entity context and `COMPLETE()`/`RELEASE()` will not know which entity to remove.

### Attribute-conditional `cSchedules` — the `when` field

Each `cSchedule` entry may carry an optional `when` predicate (same JSON format as routing predicates — §6.1). When any entry has `when`, **first-match semantics** apply: the engine evaluates entries in order and schedules the first one whose predicate is satisfied, then stops. An entry without `when` at the end acts as the fallback.

This is the standard pattern for routing service time to the right distribution based on entity attributes imported from a plan:

```json
"cSchedules": [
  {
    "eventId": "b_hip_complete",
    "dist": "Normal",
    "distParams": { "mean": "120", "stddev": "20" },
    "useEntityCtx": true,
    "when": { "variable": "Entity.surgery_type", "operator": "==", "value": "hip" }
  },
  {
    "eventId": "b_knee_complete",
    "dist": "Normal",
    "distParams": { "mean": "90", "stddev": "15" },
    "useEntityCtx": true,
    "when": { "variable": "Entity.surgery_type", "operator": "==", "value": "knee" }
  },
  {
    "eventId": "b_generic_complete",
    "dist": "Exponential",
    "distParams": { "mean": "60" },
    "useEntityCtx": true
  }
]
```

**V29 warning** is raised if all entries have `when` and there is no fallback — entities not matching any condition would silently receive no service.

### Effect Macros for C-Events

The `effect` field on C-events is **always an array of strings**, same as B-events. Example: `"effect": ["ASSIGN(Queue, Server)"]`.

| Macro | Syntax | Meaning |
|-------|--------|---------|
| `ASSIGN` | `ASSIGN(QueueName, ServerType)` | Seizes a server of `ServerType`, starts serving the front entity from `QueueName`. Schedules `cSchedules` B-events. |
| `BATCH` | `BATCH(QueueName, N)` | Accumulates N entities from `QueueName` into a parent batch entity. N ≥ 2. C-events only. |
| `COSEIZE` | `COSEIZE(QueueName, Srv1, Srv2, ...)` | Atomically seizes one entity and multiple server types simultaneously. Fails cleanly if any server is unavailable. |
| `MATCH` | `MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue)` | Pairs one entity from each queue into a combined batch in `TargetQueue`. |
| `SET` | `SET(variableName, expression)` | Sets a state variable to an arithmetic expression. |
| `SET_ATTR` | `SET_ATTR(attrName, expression)` | Sets the context entity's attribute to an arithmetic expression. |
| `COST` | `COST(expression)` | Accumulates a numeric expression to `summary.totalCost`. |
| `RENEGE_OLDEST` | `RENEGE_OLDEST(CustomerType)` | Removes the oldest entity of the given type from its queue. Used for max-queue-length policies or timeout eviction. |
| `DRAIN` | `DRAIN(containerId, amount)` | Removes `amount` from a container's level. Level must be ≥ amount (no-op with error if not). |

### 6.1 Condition Formats — Two Different Systems

**There are two condition formats in DES Studio. They are NOT interchangeable.**

#### Format A — C-event `condition` string (global state predicate)

Used **only** in `cEvents[].condition`. Written as a string expression.

| Predicate | Meaning |
|-----------|---------|
| `queue(QueueName).length > 0` | Queue has ≥ 1 entity waiting |
| `queue(QueueName).length >= N` | Queue has ≥ N entities waiting |
| `idle(ServerType).count > 0` | At least one server of type `ServerType` is idle |
| `busy(ServerType).count > 0` | At least one server of type `ServerType` is busy |
| `idle(ServerType).count >= N` | At least N servers are idle |

Combine with `AND`, `OR`, `NOT`. Queue and server names must match exactly (case-sensitive).

```json
"condition": "queue(Triage Queue).length > 0 AND idle(Nurse).count > 0"
```

> **This string format is valid ONLY for `cEvents[].condition`.** Do not use it anywhere else.

---

#### Format B — Predicate object (entity attribute or queue test)

Used for: `bEvents[].balkCondition`, `bEvents[].routing[].condition`, `cEvents[].cSchedules[].when`.

Always a JSON object — never a string:

```json
{ "variable": "Entity.priority", "operator": "<", "value": 2 }
```

| Field | Type | Description |
|---|---|---|
| `variable` | string | `Entity.<attrName>` for entity attributes; `Queue.<queueName>.length` for queue length |
| `operator` | string | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| `value` | string \| number \| boolean | Comparison value matching the attribute's `valueType` |

Variable name prefixes:
- `Entity.flight_id` — reads the `flight_id` attribute of the current entity
- `Entity.route_type` — reads the `route_type` attribute of the current entity
- `Queue.Arrival Holding Queue.length` — reads the current length of that queue

> **Do not use the string format (Format A) for balkCondition, routing conditions, or when predicates.** The engine calls a different evaluator for these fields; a string value will produce a pre-run error (CHK-011 or CHK-012).

---

## 7. State Variables

Global variables that can be read and written during simulation.

```json
{
  "id": "sv_shift_active",
  "name": "shiftActive",
  "valueType": "number",
  "initialValue": 1,
  "resetOnWarmup": true
}
```

- `name` must be unique.
- `valueType`: always `"number"` for user-defined state variables.
- `resetOnWarmup` (optional, default `true`): if `true`, the variable resets to `initialValue` when the warm-up period ends.
- Set via `SET(variableName, expression)` in B-event or C-event effects.
- Read in conditions via `state.variableName`.

---

## 8. Container Types

Continuous-level resources (tanks, buffers, stock).

```json
{
  "id": "ct_tank",
  "capacity": 1000,
  "initialLevel": 500
}
```

- `id` must be unique and non-empty. Containers have no separate `name` field — the `id` is both the identifier and the macro argument.
- `capacity` (optional): maximum level, must be > 0 when set. Omit for unbounded.
- `initialLevel` (optional, default 0): must be ≥ 0 and ≤ `capacity`.
- Manipulated by `FILL(id, amount)` and `DRAIN(id, amount)` — the first argument must match the container's `id` exactly (case-insensitive).
- `DRAIN` is a no-op (with error log) if the current level < amount — levels never go negative.

---

## 9. Goals (Optional)

Performance targets for the AI analysis and optimisation features.

```json
{
  "metric": "summary.avgWait",
  "operator": "<",
  "target": 5,
  "label": "Average wait under 5 min"
}
```

| `metric` key | Meaning |
|---|---|
| `summary.avgWait` | Mean customer wait time |
| `summary.avgSvc` | Mean service time |
| `summary.avgSojourn` | Mean total time in system |
| `summary.served` | Total customers served |
| `summary.reneged` | Total customers who abandoned |
| `summary.totalCost` | Total cost (requires cost model) |

`operator`: one of `<`, `<=`, `>`, `>=`, `==`

---

## 10. Validation Rules Summary

DES Studio runs two validation layers before every simulation. Both block the run on errors.
All generated model JSON MUST pass every blocking rule below.

### Blocking Errors (run prevented)

| Code | Rule |
|------|------|
| V1 | All entity type names must be unique and non-empty |
| V2 | Attribute names must be unique within each entity type |
| V3 | `defaultValue` must match declared `valueType` (number → numeric, boolean → `"true"`/`"false"`) |
| V4 | A queue with `discipline: "PRIORITY"` requires the customer entity type to have a `priority` attribute of type `number` |
| V5 | Distribution parameters must be within valid bounds (see §4). Exponential: mean > 0. Uniform: max > min. Normal: stddev > 0. Triangular: min ≤ mode ≤ max. Erlang: k ≥ 1 integer and mean > 0. Fixed: value must be numeric. |
| V6 | Every `eventId` reference in `schedules[]` and `cSchedules[]` must point to an existing B-event `id` |
| CHK-010 | Every B-event `schedules[]` entry must have an `eventId` field — entries without one are silently skipped and the event will never re-fire |
| V8 | Model must have at least one B-event with `ARRIVE()` effect **AND** at least one B-event with `COMPLETE()` or `RENEGE(ctx)` effect. Missing both is a blocking error; missing exactly one is a warning (see below). |
| V9 | Queue names referenced in C-event conditions and `cSchedules[].queueName` must match a defined queue |
| CHK-003 | C-event `cSchedules[]` entries and condition expressions must not reference undefined queues |
| CHK-004 | C-event references to server types (in `ASSIGN` effect or schedules) must match a defined server entity type |
| CHK-001 | Every customer entity type must have at least one arrival B-event that creates it |
| CHK-002 | Every customer entity type that has an arrival must also have an exit path — at least one B-event with `COMPLETE()` or `RENEGE(ctx)` as its effect |
| V10 | Attribute names must not start with reserved namespace prefixes `Resource` or `Queue` |
| V12 | Piecewise distribution must have at least one period, the first period must start at time 0, and nested piecewise distributions within a period are not supported |
| V13 | Piecewise distribution periods must be sorted ascending by `startTime` |
| V14 | Server `shiftSchedule` must start at time 0, be sorted ascending, and use positive integer capacities |
| V17 | `routing` table entries must reference defined queue names (or `null` for exit). Mutually exclusive with `RELEASE(Server, QueueName)` in the same effect — pick one. |
| V18 | `probabilisticRouting` probabilities must sum to 1.0 (±0.001). Each branch's `queueName` must reference a defined queue (or `null` for exit). Mutually exclusive with `routing` and `RELEASE(Server, QueueName)`. |
| V19 | Server entity type `count` must be an integer ≥ 1 |
| V20 | Queue `capacity`, when set, must be an integer ≥ 1. `overflowDestination`, when set, must reference a defined queue. |
| V21 | `balkProbability` must be a finite number in [0, 1] |
| CHK-011 | `balkCondition` **must be a predicate object** `{ variable, operator, value }` — never a string |
| CHK-012 | `routing[].condition` **must be a predicate object** `{ variable, operator, value }` — never a string |
| V22 | `BATCH` size must be an integer ≥ 2 and the referenced queue must exist |
| V23 | `UNBATCH` target queue must reference a defined queue |
| V24 | `loopConfig.maxLoopCount` must be an integer ≥ 1. `loopConfig.exitQueueName`, when set, must reference a defined queue. |
| V25 | `RENEGE` must always use `(ctx)` as its argument — never an entity type name like `RENEGE(Patient)` |
| V26 | Container `id` must be unique and non-empty; `capacity` > 0 when set; `initialLevel` ≥ 0 and ≤ `capacity`. Also: B-event `scheduledTime` must be numeric. |
| V27 | `FILL` and `DRAIN` macros must reference a declared container `id` |
| V28 | `epoch`, when set, must be a valid ISO 8601 datetime string (e.g. `"2026-05-18T08:00:00"`) |
| V30 | If `probabilisticRouting` contains a `null` (exit) branch, the B-event's effect **must** include `COMPLETE()` or `RENEGE(ctx)` — otherwise entities routed to exit aren't counted as served |
| V31 | If `routing` (conditional) contains a `null` (exit) branch, the B-event's effect **must** end with `COMPLETE()` or `RENEGE(ctx)` |
| V32 | A B-event effect list **must not** contain more than one terminal sink (`COMPLETE` or `RENEGE`). Choose one. |
| V34 | `experimentDefaults.replications` must be a positive integer (≥ 1) |
| V35 | `warmupPeriod` must be strictly less than `maxSimTime` |
| V36 | `mtbfDist` and `mttrDist` are only valid on entity types with `role: "server"` |
| V37 | When either `mtbfDist` or `mttrDist` is set on a server entity type, **both** must be present with valid distribution parameters |

### Warnings (run proceeds, banner shown)

| Code | Rule |
|------|------|
| V8-warn | Missing ARRIVE source but sink exists, or missing COMPLETE/RENEGE sink but source exists — the model is runnable but incomplete |
| V11 | Normal distribution where `mean < 2 × stddev` — negative samples are likely and will be clamped to 0 by the engine |
| V15 | A shift change time is after the configured run duration — the shift will never fire during the simulation |
| V16 | No `maxSimTime` or `terminationCondition` configured — the run may continue until the cycle limit |
| V29 | A C-event whose `cSchedules` entries all have a `when` predicate with no fallback entry — entities not matching any condition receive no service |
| V33 | `probabilisticRouting` with a single 100% null-exit branch and `COMPLETE()` — valid but unusual. Prefer plain `COMPLETE()` without routing for simple terminal completions. |
| V38 | `RELEASE()` immediately followed by `COMPLETE()` in the same B-event effect. `RELEASE` sets entity to `"waiting"` so `COMPLETE` skips silently. Use `COMPLETE()` alone — it releases the server automatically. |
| CHK-005 | Follow-on event chain has no terminal event — may cause infinite scheduling |
| CHK-006 | A queue is referenced in a C-event condition but no B-event routes entities into it |
| CHK-007 | Entity types are defined but no events exist — the model will not simulate anything |
| CHK-008 | A server entity type is defined but never used in any C-event — it will show 0% utilisation |
| W-CAP-01 | Multi-class resource contention — multiple customer types competing for the same server type may cause unexpected priority inversion |
| W-CAP-02 | Very high arrival rate — an arrival schedule uses Exponential with mean interval < 0.001, suggesting arrivals beyond discrete-event simulation limits |

---

## 13. IDs and Naming Conventions

- `id` fields are for internal references only. Use a short prefix + descriptive name:
  - Entity types: `et_` prefix (e.g. `et_patient`, `et_nurse`)
  - Queues: `q_` prefix (e.g. `q_triage`, `q_treatment`)
  - B-events: `b_` prefix (e.g. `b_arrive`, `b_complete`)
  - C-events: `c_` prefix (e.g. `c_start_service`)
  - State variables: `sv_` prefix (e.g. `sv_shift_active`)
  - Containers: `ct_` prefix (e.g. `ct_tank`)
- `name` fields are the human-readable labels shown in the UI. They are also used as references in macro arguments — **they must match exactly including case**.
- Queue `name` is referenced in: `ARRIVE(Type, QueueName)`, `RELEASE(Server, QueueName)`, `ASSIGN(QueueName, Server)`, condition predicates `queue(QueueName)`, `overflowDestination`, `defaultQueueName`, routing `queueName`.
- Entity type `name` is referenced in: `ARRIVE(EntityType, ...)`, `ASSIGN(QueueName, ServerType)`, `RELEASE(ServerType, ...)`, condition predicates `idle(ServerType)`, `busy(ServerType)`, queue `customerType`.

---

## 16. Patterns & Anti-Patterns

Common modelling patterns and the mistakes to avoid when generating DES Studio models.

### 16.1 Terminal Completion (V30, V38)

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Preferred: Explicit COMPLETE** | Simple terminal completion — all entities exit after this event | `"effect": ["COMPLETE()"], "schedules": []` |
| **✗ Anti-Pattern: RELEASE then COMPLETE** | **(Broken — never use)** `RELEASE` sets entity to `"waiting"` so `COMPLETE` is silently skipped; entities loop forever (validation warning V38) | `"effect": ["RELEASE(Server)", "COMPLETE()"]` |
| **✗ Anti-Pattern: Null routing with prob 1.0** | (Avoid) Redundant — adds unnecessary complexity | `"effect": ["COMPLETE()"], "probabilisticRouting": [{ "queueName": null, "probability": 1 }]` |
| **✓ Valid: Probabilistic exit** | Genuine branching — some entities exit, some continue | `"probabilisticRouting": [{ "queueName": "Next Queue", "probability": 0.7 }, { "queueName": null, "probability": 0.3 }]` |

**Rule:** `COMPLETE()` releases the server automatically. On a terminal B-event, write `"effect": ["COMPLETE()"]` alone — no preceding `RELEASE()`. If `probabilisticRouting` contains only a single route with `probability: 1` and `queueName: null`, prefer replacing it with explicit `COMPLETE()` and no routing table.

---

### 16.2 Entity Lifecycle Completeness

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Complete lifecycle** | Every entity type has ARRIVE → service → COMPLETE/RENEGE path | `ARRIVE(Patient)` → `ASSIGN(Triage Queue, Nurse)` → `COMPLETE()` |
| **✗ Missing sink** | Entities arrive but never complete — queue grows indefinitely | `ARRIVE(Patient)` → `ASSIGN(...)` → no `COMPLETE()` or `RENEGE()` |
| **✗ Orphaned release** | Server released but entity not completed — not counted as served | `RELEASE(Server)` without `COMPLETE()` on terminal event |

**Rule:** Every model must have at least one ARRIVE source and at least one COMPLETE or RENEGE sink (validation V8).

---

### 16.3 Queue-to-Activity Binding (ADR-005)

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Matching names** | Queue name matches entity type name — discipline honoured | Queue: `"Patient Queue"`, Entity: `"Patient"`, C-Event: `ASSIGN(Patient Queue, Nurse)` |
| **✗ Mismatched names** | Queue name differs from entity type — silently falls back to FIFO | Queue: `"Waiting Room"`, Entity: `"Patient"` — PRIORITY discipline ignored |

**Rule:** Name queues as `"<EntityTypeName> Queue"` to ensure queue discipline (FIFO/LIFO/PRIORITY) is correctly applied.

---

### 16.4 C-Event Priority & Restart Rule

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Explicit priorities** | Multiple C-Events compete for same resources — order matters | `priority: 1` for urgent, `priority: 2` for routine |
| **✗ All same priority** | C-Events fire in array order — may cause priority inversion | All C-Events at `priority: 1` or no priority field |
| **✗ Condition always true** | C-Event fires every pass — wastes C-scan cycles | `condition: "true"` or no condition on high-priority C-Event |

**Rule:** Lower priority number = higher priority. When a C-Event fires, the scan restarts from priority 1 (Three-Phase restart rule).

---

### 16.5 Distribution Parameter Types

| Pattern | When to Use | Example |
|---|---|---|
| **✓ String parameters** | All distribution parameters as strings | `"distParams": { "mean": "5", "stddev": "2" }` |
| ** Numeric parameters** | (Invalid) Numbers instead of strings | `"distParams": { "mean": 5, "stddev": 2 }` |

**Rule:** All `distParams` values must be strings (e.g., `"5"` not `5`). The engine parses them internally.

---

### 16.6 Warm-up & Termination

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Valid warm-up** | `warmupPeriod < maxSimTime` — statistics collected after warm-up | `warmupPeriod: 50`, `maxSimTime: 500` |
| **✗ Warm-up ≥ run time** | (Invalid) All statistics excluded — nothing measured | `warmupPeriod: 500`, `maxSimTime: 500` |
| **✓ Time termination** | Fixed-duration runs | `maxSimTime: 500` |
| **✓ Condition termination** | Stop when entity count reached | `terminationCondition: "summary.served >= 100"` |
| **✗ No termination** | (Warning V16) Run executes until cycle limit | No `maxSimTime` or `terminationCondition` |

**Rule:** Set either `maxSimTime` or `terminationCondition` (or both). Warm-up must be less than run duration.

---

### 16.7 State Variable Namespaces

| Pattern | When to Use | Example |
|---|---|---|
| **✓ User variables** | Custom state variables with unique names | `name: "arrival_count"`, `name: "shift_active"` |
| **✗ Reserved namespace** | (Invalid V10) Collides with `Resource.*` or `Queue.*` | `name: "Resource.Nurse"`, `name: "Queue.Triage.length"` |

**Rule:** Do not name state variables with `Resource` or `Queue` prefix — these are reserved for engine-computed values.

---

### 16.8 Replication Configuration

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Valid replications** | One or more replications for statistical confidence | `replications: 10` |
| **✗ Zero replications** | (Invalid) No runs executed | `replications: 0` |
| **✓ Batch mode** | Multiple replications with aggregated CI | `replications: 20`, `liveDataMode: null` |
| **✓ Rolling mode** | Live data refresh per event — single replication | `replications: 1`, `liveDataMode: "rolling"` |

**Rule:** `replications` must be a positive integer ≥ 1. Use `replications: 1` for rolling live-data mode.

---

### 16.9 Effect Macro Syntax

| Pattern | When to Use | Example |
|---|---|---|
| **✓ RENEGE(ctx)** | Remove entity from queue with patience timeout | `RENEGE(ctx)` — uses current entity context |
| **✗ RENEGE(TypeName)** | (Invalid V25) Silently fails — no entity matched | `RENEGE(Patient)` — missing `ctx` |
| **✓ ASSIGN(queue, server)** | Bind entity from queue to server | `ASSIGN(Triage Queue, Nurse)` |
| **✗ ASSIGN with entity type** | (Invalid) Second arg must be server type, not entity | `ASSIGN(Patient Queue, Patient)` — should be `Nurse` |

**Rule:** `RENEGE` always takes `(ctx)` argument. `ASSIGN` second argument is the **server type**, not the customer type.

---

### 16.10 Routing Table Completeness (V29)

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Fallback route** | At least one route has no `when` predicate — catches all | One unconditional route, others conditional |
| **✗ All conditional** | (Warning V29) Entities matching no condition receive no service | All routes have `when` predicates — gaps possible |

**Rule:** When using conditional routing (`cSchedules[].when`), ensure at least one route has no `when` predicate as a fallback.

---

### 16.11 ARRIVE + probabilisticRouting Anti-Pattern

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Plain ARRIVE** | ARRIVE always routes to a queue via its effect syntax | `"effect": ["ARRIVE(Patient, Waiting Room)"]` — no `probabilisticRouting` |
| **✓ Split arrival streams** | Initial arrivals must be split by probability | Two B-events: `"ARRIVE(Patient, Urgent Queue)"` with mean `baseMean / 0.3`; `"ARRIVE(Patient, Routine Queue)"` with mean `baseMean / 0.7` |
| **✗ ARRIVE with probabilisticRouting** | (Invalid) ARRIVE creates entities and places them in a queue — routing tables are for B-events that already have an entity, not arrival events | `"effect": ["ARRIVE(Patient)"], "probabilisticRouting": [{"queueName": "A", "probability": 0.5}]` |

**Rule:** Never add `probabilisticRouting` to a B-event whose effect is `ARRIVE()`. ARRIVE events route via their effect argument `ARRIVE(Type, QueueName)`. If arrivals must be split probabilistically, create one ARRIVE B-event per stream and give each stream its own queue and schedule. For Exponential arrivals, scale each stream's mean inter-arrival time as `baseMean / probability`; for planned arrivals, use separate schedule rows or a multi-event CSV so each row belongs to the correct arrival B-event.

**Attribute guidance:** If the split implies attributes such as priority, severity, route, or class, declare those attributes in `entityTypes[].attrDefs` and set them at creation time on the stream-specific ARRIVE event, for example: `"effect": ["ARRIVE(Patient, Urgent Queue)", "SET_ATTR(priority, 1)", "SET_ATTR(severity, \"urgent\")"]`. Do not create a generic arrival and then probabilistically route it just to assign the class later.

---

### 16.12 Missing `useEntityCtx` on C-Event Schedules

| Pattern | When to Use | Example |
|---|---|---|
| **✓ useEntityCtx: true** | Always include when the target B-event operates on an entity | `"cSchedules": [{ "eventId": "b_complete", "useEntityCtx": true, "dist": "Exponential", "distParams": { "mean": "10" } }]` |
| **✗ Missing useEntityCtx** | (Common error) Without this flag, the B-event has no entity context — `COMPLETE()`, `RELEASE()`, and `RENEGE(ctx)` silently do nothing | `"cSchedules": [{ "eventId": "b_complete", "dist": "Exponential", "distParams": { "mean": "10" } }]` — no `useEntityCtx` |

**Rule:** Every `cSchedules[]` entry whose target B-event uses `COMPLETE()`, `RELEASE()`, `RENEGE(ctx)`, `SPLIT()`, `SET_ATTR()`, or `COST()` must have `"useEntityCtx": true`. Omitting it is the single most common LLM error.

---

### 16.13 Predicate Objects vs. Strings

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Predicate objects** | Always encode conditions as JSON predicate objects | `"balkCondition": { "variable": "queue(Waiting Room).length", "operator": ">", "value": "5" }` |
| **✗ String expressions** | (Invalid CHK-011, CHK-012) Strings are not parsed as conditions — silently ignored or crash | `"balkCondition": "queue(Waiting Room).length > 5"` |

**Rule:** `balkCondition` and `routing[].condition` must be predicate objects `{ "variable": "...", "operator": "...", "value": "..." }`, never string expressions. Valid operators: `==`, `!=`, `<`, `>`, `<=`, `>=`. Valid variable formats: `queue(Name).length`, `idle(Name).count`, `busy(Name).count`, `Entity.attrName`.

---

### 16.14 `effect` as Array vs. Bare String

| Pattern | When to Use | Example |
|---|---|---|
| **✓ effect as array** | Always use a JSON array even for a single effect | `"effect": ["COMPLETE()"]` |
| **✗ effect as bare string** | (Invalid) The engine expects an array — a bare string breaks parsing | `"effect": "COMPLETE()"` |

**Rule:** The `effect` field must always be an array of strings, even when it contains only one macro. Use `"effect": ["COMPLETE()"]`, never `"effect": "COMPLETE()"`.

---

### 16.15 `scheduledTime` as String vs. Number

| Pattern | When to Use | Example |
|---|---|---|
| **✓ scheduledTime as string** | Always use a string value | `"scheduledTime": "0"`, `"scheduledTime": "9999"` |
| **✗ scheduledTime as number** | (Invalid V26) The engine expects string-encoded numeric values | `"scheduledTime": 0`, `"scheduledTime": 9999` |

**Rule:** Every `scheduledTime` field must be a string representation of a number (e.g., `"0"`, `"10.5"`). Engine validation V26 enforces this.

---

## 11. Common Patterns

### Single-server queue (M/M/1)

```json
{
  "name": "M/M/1 Queue",
  "entityTypes": [
    { "id": "et_cust", "name": "Customer", "role": "customer", "count": 0, "attrDefs": [] },
    { "id": "et_srv",  "name": "Server",   "role": "server",   "count": 1, "attrDefs": [] }
  ],
  "queues": [
    { "id": "q_cust", "name": "Customer", "customerType": "Customer", "capacity": "", "discipline": "FIFO" }
  ],
  "bEvents": [
    { "id": "b_arrive",   "name": "Arrival",   "scheduledTime": "0",    "effect": ["ARRIVE(Customer, Customer)"],
      "schedules": [{ "eventId": "b_arrive", "dist": "Exponential", "distParams": { "mean": "1.111" } }] },
    { "id": "b_complete", "name": "Complete",  "scheduledTime": "9999", "effect": ["COMPLETE()"], "schedules": [] }
  ],
  "cEvents": [
    { "id": "c_seize", "name": "Seize Server", "priority": 1,
      "condition": "queue(Customer).length > 0 AND idle(Server).count > 0",
      "effect": ["ASSIGN(Customer, Server)"],
      "cSchedules": [{ "eventId": "b_complete", "dist": "Exponential", "distParams": { "mean": "1" }, "useEntityCtx": true }] }
  ],
  "stateVariables": [],
  "goals": [],
  "containerTypes": [],
  "experimentDefaults": { "maxSimTime": 500, "warmupPeriod": 50, "replications": 10 }
}
```

### Probabilistic acuity splitting (ARRIVE routing anti-pattern)

**Use case:** Arriving entities must be split into high/low priority queues by probability.
**Anti-pattern:** Adding `probabilisticRouting` to an ARRIVE B-event — ARRIVE routes via its effect argument, so the routing table is silently ignored.

**Correct pattern:** Use two ARRIVE events, each with a rate proportional to the split:

```json
{
  "name": "ED Triage — Correct Acuity Split",
  "entityTypes": [
    { "id": "et_patient", "name": "Patient", "role": "customer", "count": 0, "attrDefs": [] },
    { "id": "et_doc",     "name": "Clinician", "role": "server",  "count": 3, "attrDefs": [] }
  ],
  "queues": [
    { "id": "q_high", "name": "High Acuity Queue", "customerType": "Patient", "capacity": "", "discipline": "FIFO" },
    { "id": "q_low",  "name": "Low Acuity Queue",  "customerType": "Patient", "capacity": "", "discipline": "FIFO" }
  ],
  "bEvents": [
    { "id": "b_arrive_high", "name": "High Acuity Arrival", "scheduledTime": "0",
      "effect": ["ARRIVE(Patient, High Acuity Queue)"],
      "schedules": [{ "eventId": "b_arrive_high", "dist": "Exponential", "distParams": { "mean": "16.667" } }] },
    { "id": "b_arrive_low", "name": "Low Acuity Arrival", "scheduledTime": "0",
      "effect": ["ARRIVE(Patient, Low Acuity Queue)"],
      "schedules": [{ "eventId": "b_arrive_low", "dist": "Exponential", "distParams": { "mean": "7.143" } }] },
    { "id": "b_complete", "name": "Treatment Done", "scheduledTime": "9999",
      "effect": ["COMPLETE()"], "schedules": [] }
  ],
  "cEvents": [
    { "id": "c_high", "name": "High Acuity Care", "priority": 1,
      "condition": "queue(High Acuity Queue).length > 0 AND idle(Clinician).count > 0",
      "effect": ["ASSIGN(High Acuity Queue, Clinician)"],
      "cSchedules": [{ "eventId": "b_complete", "dist": "Exponential", "distParams": { "mean": "13" }, "useEntityCtx": true }] },
    { "id": "c_low", "name": "Low Acuity Care", "priority": 2,
      "condition": "queue(Low Acuity Queue).length > 0 AND idle(Clinician).count > 0",
      "effect": ["ASSIGN(Low Acuity Queue, Clinician)"],
      "cSchedules": [{ "eventId": "b_complete", "dist": "Exponential", "distParams": { "mean": "13" }, "useEntityCtx": true }] }
  ],
  "experimentDefaults": { "maxSimTime": 500, "warmupPeriod": 50, "replications": 10 }
}
```

**Key rule for splitting arrivals:** Base arrival rate = 1 patient per 5 min = 12/hr. High acuity = 30% = 1 per 16.667 min. Low acuity = 70% = 1 per 7.143 min. Create one ARRIVE B-event per acuity group, each with its own schedule and proportional rate. Never use `probabilisticRouting` on an ARRIVE event.

---

### Two-stage pipeline (RELEASE pattern)

For multi-stage models, use `RELEASE(ServerType, NextQueueName)` at the end of stage 1 to hand the entity to stage 2:

- Stage 1 completion B-event: `"effect": ["RELEASE(Nurse, Treatment Queue)"]`
- Stage 2 C-event: `"condition": "queue(Treatment Queue).length > 0 AND idle(Doctor).count > 0"`, `"effect": ["ASSIGN(Treatment Queue, Doctor)"]`
- Stage 2 completion B-event: `"effect": ["COMPLETE()"]`

### Airport arrivals with live OpenSky data

A two-stage ground-handling model where aircraft arrival rate is driven by real-time data from the OpenSky Network (see §15.1 for full `openSky` adapter reference).

```json
{
  "name": "Airport Arrivals — Live (OpenSky)",
  "description": "Real-time aircraft arrival and ground-handling model. Arrival inter-arrival times are pulled live from OpenSky for EGLL. Gate controllers assign stands (2–8 min), ground crews perform turnaround (25–90 min).",
  "timeUnit": "minutes",
  "entityTypes": [
    { "id": "et_aircraft",  "name": "Aircraft",        "role": "customer", "count": 0, "attrDefs": [] },
    { "id": "et_gate_ctrl", "name": "Gate Controller", "role": "server",   "count": 3, "attrDefs": [] },
    { "id": "et_gnd_crew",  "name": "Ground Crew",     "role": "server",   "count": 5, "attrDefs": [] }
  ],
  "queues": [
    { "id": "q_holding",    "name": "Holding Stack",  "customerType": "Aircraft", "capacity": "", "discipline": "FIFO" },
    { "id": "q_turnaround", "name": "Turnaround Bay", "customerType": "Aircraft", "capacity": "", "discipline": "FIFO" }
  ],
  "bEvents": [
    { "id": "b_arrive", "name": "Aircraft Arrives", "scheduledTime": "0",
      "effect": ["ARRIVE(Aircraft, Holding Stack)"],
      "schedules": [{
        "eventId": "b_arrive",
        "dist": "Exponential",
        "distParams": { "mean": "3.5" },
        "paramSource": { "sourceId": "ds_opensky", "field": "interArrivalMean", "targetParam": "mean", "fallback": "3.5" }
      }]
    },
    { "id": "b_gate_done",       "name": "Gate Assigned",     "scheduledTime": "9999", "effect": ["RELEASE(Gate Controller, Turnaround Bay)"], "schedules": [] },
    { "id": "b_turnaround_done", "name": "Turnaround Complete","scheduledTime": "9999", "effect": ["COMPLETE()"], "schedules": [] }
  ],
  "cEvents": [
    { "id": "c_assign_gate", "name": "Assign Gate", "priority": 1,
      "condition": "queue(Holding Stack).length > 0 AND idle(Gate Controller).count > 0",
      "effect": ["ASSIGN(Holding Stack, Gate Controller)"],
      "cSchedules": [{ "eventId": "b_gate_done", "dist": "Uniform", "distParams": { "min": "2", "max": "8" }, "useEntityCtx": true }]
    },
    { "id": "c_start_turnaround", "name": "Start Turnaround", "priority": 2,
      "condition": "queue(Turnaround Bay).length > 0 AND idle(Ground Crew).count > 0",
      "effect": ["ASSIGN(Turnaround Bay, Ground Crew)"],
      "cSchedules": [{ "eventId": "b_turnaround_done", "dist": "Triangular", "distParams": { "min": "25", "mode": "45", "max": "90" }, "useEntityCtx": true }]
    }
  ],
  "goals": [
    { "metric": "summary.avgSojourn", "operator": "<=", "target": 90, "label": "Mean sojourn ≤ 90 min" },
    { "metric": "summary.avgWait",    "operator": "<",  "target": 15, "label": "Mean holding wait < 15 min" }
  ],
  "dataSources": [{
    "id": "ds_opensky", "label": "OpenSky Network — Live Arrivals",
    "type": "openSky", "url": "https://opensky-network.org/api/states/all",
    "airportIcao": "EGLL", "radiusNm": 50, "refreshSecs": 30
  }],
  "experimentDefaults": { "maxSimTime": 480, "warmupPeriod": 60, "replications": 5, "liveDataMode": "calibrated_batch" }
}
```

**Change airport:** edit `dataSources[0].airportIcao` to any supported ICAO code (see §15.1). The fallback `"3.5"` minutes keeps the model runnable offline.

---

### Reneging (Abandonment)

Add a renege schedule to the arrival B-event. The renege fires if the entity hasn't been served within the timeout:

```json
{
  "eventId": "b_renege",
  "dist": "Exponential",
  "distParams": { "mean": "15" },
  "isRenege": true
}
```

And the renege B-event:
```json
{ "id": "b_renege", "name": "Renege", "scheduledTime": "9999", "effect": ["RENEGE(ctx)"], "schedules": [] }
```

---

## 14. Agent API — Programmatic Model Import

An agent or script can validate and save a model in a single HTTP call without opening the UI.

### Endpoint

```
POST https://<project-ref>.supabase.co/functions/v1/import-model
```

Replace `<project-ref>` with your Supabase project reference ID (visible in the project URL).

### Authentication

Pass a valid Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <your-jwt>
```

Obtain a JWT by calling `supabase.auth.signInWithPassword()` or via the Supabase Auth API:

```bash
curl -s -X POST \
  https://<project-ref>.supabase.co/auth/v1/token?grant_type=password \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}' \
  | jq -r '.access_token'
```

### Request Body

```json
{
  "model": { ... },
  "name": "My Model Name (optional override)"
}
```

- `model` (required): a DES Studio model JSON object matching the schema in §1–§13
- `name` (optional): if provided, overrides the `name` field inside `model`

### Success Response — 201

```json
{
  "ok": true,
  "modelId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "warnings": []
}
```

The model is saved as a private model owned by the authenticated user. Open it in the UI at:
`https://<your-des-studio-url>/#model/<modelId>`

### Error Responses

**401 Unauthorized** — missing or invalid JWT:
```json
{ "ok": false, "errors": ["Authentication required."] }
```

**400 Bad Request** — malformed request body:
```json
{ "ok": false, "errors": ["Request must include a 'model' object."] }
```

**422 Unprocessable Entity** — model fails structural validation:
```json
{
  "ok": false,
  "errors": [
    "[V8] No arrival source and no sink: add an ARRIVE(Type) effect and a COMPLETE() or RENEGE() effect.",
    "[V1] Duplicate entity class name: 'Customer'."
  ],
  "warnings": []
}
```

**500 Internal Server Error** — database error:
```json
{ "ok": false, "errors": ["Database error: <message>"] }
```

### Complete curl Example

```bash
# 1. Get a JWT (store in TOKEN)
TOKEN=$(curl -s -X POST \
  https://<project-ref>.supabase.co/auth/v1/token?grant_type=password \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}' \
  | jq -r '.access_token')

# 2. POST the model
curl -s -X POST \
  https://<project-ref>.supabase.co/functions/v1/import-model \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "M/M/1 Queue",
    "model": {
      "entityTypes": [
        { "id": "et_customer", "name": "Customer", "role": "customer" },
        { "id": "et_server",   "name": "Server",   "role": "server", "count": 1 }
      ],
      "queues": [
        { "id": "q_main", "name": "Queue", "customerType": "Customer", "discipline": "FIFO" }
      ],
      "bEvents": [
        { "id": "b_arrive",   "name": "Arrival",  "scheduledTime": "0",    "effect": ["ARRIVE(Customer, Queue)"],
          "schedules": [{ "eventId": "b_arrive",   "dist": "Exponential", "distParams": { "mean": "1" } }] },
        { "id": "b_complete", "name": "Complete",  "scheduledTime": "9999", "effect": ["COMPLETE()"], "schedules": [] }
      ],
      "cEvents": [
        { "id": "c_seize", "name": "Start Service", "priority": 1,
          "condition": "queue(Queue).length > 0 AND idle(Server).count > 0",
          "effect": ["ASSIGN(Queue, Server)"],
          "cSchedules": [{ "eventId": "b_complete", "dist": "Exponential", "distParams": { "mean": "0.8" }, "useEntityCtx": true }] }
      ],
      "stateVariables": [],
      "goals": [],
      "containerTypes": [],
      "experimentDefaults": { "maxSimTime": 500, "warmupPeriod": 50, "replications": 10 }
    }
  }' | jq .
```

Expected output:
```json
{
  "ok": true,
  "modelId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "warnings": []
}
```

### Validation Rules Checked by the API

The endpoint applies the same structural validation as the UI import pipeline. The checks cover:
V1 (entity names), V2 (attribute names), V4 (PRIORITY discipline), V8 (arrival/sink), V9 (queue condition refs), V19 (server count), V20 (queue capacity), V21 (balk probability).

Full distribution-parameter validation (V5, V11–V13) and shift-schedule validation (V14–V15) are enforced by the engine at run time. The API focuses on structural correctness sufficient to save a model safely.

---

## 15. Live Data Sources (Optional — Sprint 58+)

> **Note:** `dataSources` entries are parsed and stored with the model but are not validated by the engine's pre-run checker (V1–V29). Structural validation — field completeness, URL reachability, auth configuration — is deferred to the live-data integration layer at runtime.

Models can connect distribution parameters to live REST or WebSocket feeds so that arrival rates, service times, or resource counts are fetched from real systems before or during a run.

### `dataSources[]` (top-level)

```json
"dataSources": [
  {
    "id": "ds_arrivals",
    "label": "Live Arrival Feed",
    "type": "rest",
    "url": "https://ops.example.com/sim-feed",
    "authHeader": "Authorization",
    "authSecret": "{{env.OPS_TOKEN}}",
    "refreshSecs": 60
  }
]
```

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Unique within the model; referenced by `paramSource.sourceId` |
| `label` | Yes | Human-readable name shown in the UI |
| `type` | Yes | `"rest"` \| `"scheduleFeed"` \| `"actualsStream"` \| `"websocket"` \| `"stateSnapshot"` \| `"openSky"` \| `"mock"` |
| `url` | Yes | Full HTTPS URL to the endpoint. For `openSky` sources, set to `"https://opensky-network.org/api/states/all"` — the adapter constructs the bounding-box query internally. |
| `authHeader` | No | Header name for authentication (e.g. `"Authorization"`) |
| `authSecret` | No | `{{env.VAR_NAME}}` placeholder — **never a literal credential**. Actual value is entered by the user in `sessionStorage` at runtime. |
| `refreshSecs` | No | Cache TTL in seconds for REST sources (default 60, minimum 10). For `openSky`, the adapter polls every 30 s internally; set `refreshSecs: 30` to align. |
| `entityType` | `scheduleFeed` only | Name of the entity type that will arrive |
| `targetBEventId` | `scheduleFeed` only | ID of the B-event whose `rows[]` will be populated |
| `timeField` | `scheduleFeed` only | Dot-notation path in each activity object to the start time (default `"time"`) |
| `attrMap` | `scheduleFeed` only | Object mapping API field paths to entity attribute names. Use `"entityId"` as the target name to set the entity display name |
| `airportIcao` | `openSky` only | ICAO airport code (see §15.1 for supported airports). Default `"EGLL"`. |
| `radiusNm` | `openSky` only | Detection radius in nautical miles (default 50). Aircraft within this radius of the airport that are descending and below 3 000 m are counted as arrivals. |

### 15.1 `openSky` data source

The `openSky` source type connects directly to the [OpenSky Network REST API](https://opensky-network.org/apidoc/rest.html) to detect arriving aircraft in real time. The adapter polls the `states/all` endpoint every 30 seconds, filters for aircraft that are descending, within the configured radius, and below 3 000 m altitude, and computes inter-arrival intervals in minutes. No authentication is required (the public endpoint is rate-limited).

**Supported airports (`airportIcao`):**

| ICAO | Airport |
|------|---------|
| `EGLL` | London Heathrow (default) |
| `KJFK` | New York JFK |
| `KLAX` | Los Angeles |
| `KORD` | Chicago O'Hare |
| `EDDF` | Frankfurt |
| `RJTT` | Tokyo Haneda |
| `YSSY` | Sydney |
| `LFPG` | Paris CDG |

**Fields exposed via `paramSource.field`:**

| Field | Type | Description |
|---|---|---|
| `interArrivalMean` | number (minutes) | Mean of all observed inter-arrival intervals. Returns `null` until at least 2 arrivals are detected. |
| `arrivalCount` | number | Total number of arrivals detected since the adapter started. |
| `interArrivals` | number[] | Full array of observed inter-arrival intervals in minutes. |

**Example data source declaration:**

```json
{
  "id": "ds_opensky",
  "label": "OpenSky Network — Live Arrivals",
  "type": "openSky",
  "url": "https://opensky-network.org/api/states/all",
  "airportIcao": "EGLL",
  "radiusNm": 50,
  "refreshSecs": 30
}
```

**Binding to a B-event schedule:**

```json
{
  "eventId": "b_arrive",
  "dist": "Exponential",
  "distParams": { "mean": "3.5" },
  "paramSource": {
    "sourceId": "ds_opensky",
    "field": "interArrivalMean",
    "targetParam": "mean",
    "fallback": "3.5"
  }
}
```

The `fallback` value is used when the adapter has not yet observed enough arrivals (< 2). `"3.5"` minutes ≈ 17 arrivals/hour, typical for a major hub in peak hours.

**Required experiment mode:** set `experimentDefaults.liveDataMode: "calibrated_batch"` so the engine prefetches the live inter-arrival mean once before starting the run.

---

### `scheduleFeed` data source

A `scheduleFeed` source fetches a planned-arrival schedule from a REST endpoint and injects it as `rows[]` into the named B-event before the run. The plan provides *what* arrives and *when* (entity attributes); the model provides *how long* service takes (calibrated distributions).

```json
{
  "id": "ds_theatre",
  "label": "Operating Theatre Schedule",
  "type": "scheduleFeed",
  "url": "https://his.example.com/api/theatre/today",
  "authHeader": "Authorization",
  "authSecret": "{{env.HIS_TOKEN}}",
  "entityType": "Patient",
  "targetBEventId": "b_patient_arrives",
  "timeField": "startTime",
  "attrMap": {
    "patientName": "entityId",
    "surgeryType": "surgery_type",
    "priority": "priority"
  }
}
```

**Rules:**
- The API response may be a bare JSON array, `{ "activities": [...] }`, or any object whose first value is an array.
- Each activity's time field may be a plain number (sim time), an `HH:MM` string, or an ISO 8601 datetime. ISO/HH:MM timestamps require `model.epoch` to be set.
- `entityId` is a reserved attribute name — when set, its value becomes the entity's display name in the simulation UI.
- Credential values in `authSecret` must always use `{{env.VAR}}` syntax; actual tokens are entered at session time and are never persisted.
- Planned durations in the feed are **ignored** — service time is always derived from the model's calibrated distributions.

### `actualsStream` data source

An `actualsStream` source receives actual start-time updates from an external system (e.g. a live theatre management system) and reroutes pre-scheduled FEL entries to their actual times.

```json
{
  "id": "ds_actuals",
  "label": "Theatre Actuals Feed",
  "type": "actualsStream",
  "url": "wss://his.example.com/api/theatre/actuals",
  "authHeader": "Authorization",
  "authSecret": "{{env.HIS_TOKEN}}"
}
```

**Expected WebSocket message formats:**
```json
{ "entityId": "Alice",  "actualTime": "2026-05-18T09:05:00" }
{ "entityId": "Bob",    "actualTime": 65 }
{ "type": "batch", "updates": [{ "entityId": "...", "actualTime": "..." }] }
```

`actualTime` may be a plain simulation time number, an `HH:MM` string, or a full ISO 8601 datetime. ISO/HH:MM values require `model.epoch` to be set.

The adapter calls `engine.updateScheduledTime(entityId, newSimTime)` for each update, rescheduling the matching pre-scheduled arrival in the FEL while preserving the original `_plannedTime` on the entity for deviation reporting.

**`getSummary().avgPlanDeviation`**: when entities have both `_plannedTime` (from rows[]) and `arrivalTime` (actual), the engine reports the average deviation (actual minus planned). Positive = late; negative = early; null = no planned data. The report includes a "Plan vs Actual" section when this metric is present.

### `paramSource` on a schedule or cSchedule

Bind a specific distribution parameter to a field from a live source:

```json
{
  "dist": "Exponential",
  "distParams": { "mean": "1.5" },
  "paramSource": {
    "sourceId": "ds_arrivals",
    "field": "mean_interarrival_mins",
    "targetParam": "mean",
    "fallback": "1.5"
  }
}
```

| Field | Required | Description |
|---|---|---|
| `sourceId` | Yes | Must match a `dataSources[].id` |
| `field` | Yes | Dot-notation path into the API JSON response (e.g. `mean` or `arrivals.mean`) |
| `targetParam` | No | Which key in `distParams` to replace; defaults to the first key |
| `fallback` | No | Value to use if the source is unavailable; if absent, the static `distParams` value is preserved |

### `experimentDefaults.liveDataMode`

```json
"experimentDefaults": {
  "maxSimTime": 500,
  "warmupPeriod": 50,
  "replications": 10,
  "liveDataMode": "calibrated_batch"
}
```

| Value | Behaviour |
|---|---|
| `null` or absent | Static run — no live data (default) |
| `"calibrated_batch"` | Fetch all live values once before the run; all replications use the frozen values |
| `"rolling"` | Re-sample parameters on each FEL event; replications locked to 1 (Sprint 59+) |

---


| `"lookahead"` | Inject live system snapshot; skip warm-up; simulate forward N minutes (Sprint 60+) |

> **Security note:** `authSecret` fields must always contain `{{env.VAR}}` placeholders, never literal tokens or passwords. The actual credential is entered by the user in the browser at session time and is never stored in the database or included in model exports.

For full integration guidance see `docs/DES_Studio_RealTime_Integration_Guide.md`.
