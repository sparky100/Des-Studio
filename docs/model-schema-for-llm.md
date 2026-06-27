# simmodlr — Model Schema Reference for LLM Generation

**Version:** 2.3.0
**Date:** 2026-06-27
**Sprint baseline:** Sprint 88

| Version | Date | Sprint | Changes |
|---------|------|--------|---------|
| v2.3.0 | 2026-06-27 | Container conditions & expression amounts | Added `container(Id).level/.capacity/.min/.max` predicates to the §6.1 Format A table — container levels can now be read directly in `cEvents[].condition` strings (e.g. `"container(Tank).level >= 10"`), enabling DRAIN-blocking conditions. Updated `FILL`/`DRAIN` macro rows in §5 and §6 effect-macro tables: `amount` now accepts an expression (state variable or arithmetic combination, same evaluator as `SET`), not just a numeric literal. Updated V27 in §10 to document the new amount-shape checks: a bare numeric `amount` ≤ 0 is now a blocking error; a bare non-numeric `amount` that doesn't match a declared state variable name is a warning. Added a "Reading container levels in conditions" note to §8. |
| v2.2.3 | 2026-06-22 | overflowDestination id/name clarification | **Fixed a bug in §13's Complete Reference Model itself:** the "ED Wait Queue" overflow example used `"overflowDestination": "q_ed_overflow"` (the target queue's `id`) instead of `"ED Overflow Queue"` (its `name`) — LLMs copying this example verbatim would reproduce a V20 validation error. Corrected the example and added TOP LLM MISTAKES #20 (`overflowDestination` set to a queue's `id` instead of its `name`) — it is a name-style reference like `ARRIVE`/`RELEASE`/`ASSIGN` macro arguments, not an id-style one. Strengthened the §16 naming-rules cross-reference line to call out the id-vs-name contrast explicitly. |
| v2.2.2 | 2026-06-20 | DELAY completion resolution options (COMPLETE/routing/RELEASE) | Rewrote §6.2 Rules' "completion B-event" bullet into three explicit, mutually-exclusive options: (1) `COMPLETE()` — safe with no server, engine checks `_isDelay`; (2) a routing table (`routing[]`/`probabilisticRouting[]`) with no effect macro at all — the correct choice for "delay then continue to another queue, no server involved," since the engine's routing logic explicitly accepts a delay-held entity the same as a waiting one; (3) `RELEASE(ServerType[, TargetQueue])` — only valid when a server was genuinely seized earlier in the same entity's journey and held through the delay; `RELEASE` has no `_isDelay` awareness and will either no-op or act on an unrelated customer's claim if invented for a chain where nothing was ever seized. |
| v2.2.1 | 2026-06-20 | DELAY completion ARRIVE/ServerAttr clarification | Added TOP LLM MISTAKES #18 (`cSchedules[].dist: "ServerAttr"` on a `DELAY` C-event — no server exists to read from, silently falls back to a fixed delay of `1`) and #19 (a `DELAY` completion B-event whose **only** effect is `ARRIVE(...)` — never resolves the delayed entity, which is stuck in `"serving"` forever). Updated §6.2 Rules and the V47 validation table row (§10) to document both, including the legitimate exception: `ARRIVE` combined with `COMPLETE()`/`RELEASE()`/a routing table on the same B-event is fine (e.g. to spawn a derived/log entity while the delayed entity is separately resolved) — only a *bare* `ARRIVE` with nothing else is blocked. |
| v2.2.0 | 2026-06-18 | Queue-scoped balking/reneging | Balking (`balkProbability`/`balkCondition`) moved from the ARRIVE B-event to the Queue (§3) — checked on every join (ARRIVE, RELEASE, routing, batch/split, preemption), not just arrival. Added queue-level `renegeDist`/`renegeDistParams` for zero-wiring automatic patience timeouts (§3, §4 reneging pattern). Added V46 (overflow-destination cycle detection) to §10; relocated V21 to Queue scope; CHK-011 now also checks queues. Removed the B-event "Optional: Balking" worked example, replaced with a pointer to §3. Legacy B-event-level balking is migrated onto the matching queue automatically at load time (non-destructive, idempotent). |
| v2.1.0 | 2026-06-17 | Sprint 88 | Added MANDATORY GENERATION PROTOCOL (5-step checklist); §5 rows[] warning box; TOP LLM MISTAKE #16; closing Core Principle |
| v1.0.0 | 2026-05-23 | Sprint 70 | Initial versioned snapshot — schema as delivered at Sprint 70 |
| v1.1.0 | 2026-05-23 | Sprint 70 | Added SPT, EDD, PRIORITY(attrName) queue disciplines to §3; added V11 (Normal warning) and V16 (no termination condition warning) to §10 validation table |
| v1.2.0 | 2026-05-23 | Sprint 70 | Fixed app URL to `https://des.simmodlr.app`; updated LLM delivery instructions to save JSON file and produce magic link |
| v1.3.0 | 2026-05-24 | Sprint 71 | Added `openSky` data source type to §15 (OpenSky Network real-time adapter); added §15.1 `openSky` field reference and supported airports table; added "Airport Arrivals" model pattern to §11 |
| v1.3.1 | 2026-06-01 | Docs correction | Clarified probabilistic arrival splitting: use separate ARRIVE B-events with proportional inter-arrival means; never use `probabilisticRouting` on ARRIVE events |
| v1.3.2 | 2026-06-01 | Results contract | Added `entity.outcome` and `summary.outcomes` journey-conclusion result metadata for terminal route reporting and AI analysis |
| v1.4.0 | 2026-06-03 | Schema review | DES best-practice and consistency review: added V39 to §10 blocking errors; corrected V30/V31 to include RELEASE(); fixed balkCondition variable format in §16.13; added `terminationCondition` to §1; corrected §16.3 queue naming rule; added SPT/EDD/PRIORITY(attrName) attribute requirements to §3; added Empirical non-empty constraint to §4; added SPLIT/FILL/SPLIT to §5/§6 macro tables; added Normal distribution caveat to §4; added LIFO caveat to §3; expanded §16.6 with steady-state vs terminating guidance; added replication and stability best-practice notes; added §6.1 state variable and container predicates; added UI-parity notes for JSON-only settings |
| v1.5.0 | 2026-06-05 | Results accuracy | **§9 Goals:** added `summary.avgWIP` metric; added batch-mode note on per-replication evaluation of count goals. **§11.1 Sections:** corrected factual error — the engine actively uses `entryQueues`/`exitQueues` to compute `entitiesIn`/`entitiesOut`/`avgSojourn` (was incorrectly stated as "engine ignores sections entirely"); clarified dual purpose (UI organisation + statistical boundary tracking); aligned "large model" threshold with TOP LLM MISTAKES #13 (≥8 queues or ≥3 stages, consistent throughout); added note that sections with empty entry/exit arrays are cosmetic only and produce zero in/out counts. |
| v1.6.0 | 2026-06-09 | Sprint 85 | **§9 Goals:** added `summary.avgTimeInSystem` (weighted mean time across all entities including in-progress) and `summary.servedRatio` (service completion rate as decimal 0–1). Updated metric count from 13 to 15. Added `avgTimeInSystem` to percentile-capable time metrics. |
| v1.7.0 | 2026-06-12 | Schema enforcement | Added TOP LLM MISTAKES #15 (disconnected queue fragment) and V45 blocking error to §10. |
| v1.8.0 | 2026-06-13 | Schema correction | **§11.1 Sections:** corrected results-contract description (`count`/`avgSojourn` require `memberIds` only, not entry/exit queues); added per-section metric table (`count`, `avgSojourn`, `entitiesIn`, `entitiesOut`) with non-zero conditions; documented `summary.journeys` and `summary.queueJourneys` outputs; replaced imprecise entry/exit selection prose with concrete front-door/handoff-queue rules; added suggested colour palette for sections; clarified terminal-section `exitQueues` — journey tracking uses entity completion status (not exitQueues), but marking the sink queue as exitQueues enables `entitiesOut` throughput counting. Added TOP LLM MISTAKE #16 (sections without entryQueues/exitQueues — silent zero counts); hardened "Prefer" wording to MUST rule; added 4-step generation checklist; added terminal-section warning on exitQueues: [] pattern. |
| v2.0.0 | 2026-06-14 | Sections simplification | **§11.1 Sections:** removed `entryQueues`/`exitQueues` fields and all `entitiesIn`/`entitiesOut` stat tracking — journey counts (`summary.journeys`) already capture full flow. Simplified section schema to `memberIds` only. Removed TOP LLM MISTAKE #16. Updated engine, UI, LLM exports, and reference model accordingly. |
| v1.9.0 | 2026-06-14 | Doc quality | Fixed section numbering (§11–§16 were out of order; renumbered to match presentation order). Removed duplicate PREEMPT/FAIL/REPAIR rows from §5 macro table. Added §12 Response Format (was a dangling cross-reference). Expanded §5 loop guard into §5.1 with a worked example. Added §13 Complete Reference Model (3-section clinic). Clarified `defaultValue` vs `distParams` string rules in §2. Added API validation scope warning to §14. Added container vs state variable decision rule to §8. |

---

**Purpose:** This file is the authoritative specification for generating valid simmodlr model JSON.
Paste it (or reference it) as context when prompting any LLM to create or modify a model.

---

## MANDATORY GENERATION PROTOCOL

Before writing a single line of model JSON, you MUST complete these steps in order.
Skipping any step will produce an invalid model.

### Step 1 — Read the full schema
Read every section of this document (§1–§15) before generating anything.
Do not rely on memory or prior examples. The schema evolves; always read it fresh.

### Step 2 — Use the reference model as your template
§12.3 contains a complete valid model. Match its field names, structure, and nesting exactly.
If a field is not present in the reference model or explicitly defined in the schema, do not invent it.

### Step 3 — Read TOP LLM MISTAKES
Read every row in the TOP LLM MISTAKES table. For each one, confirm your model does not contain that pattern.

### Step 4 — Validate before output
Before returning any JSON, check every blocking rule in §10 programmatically or by inspection.
A model with any blocking error (V1–V47, CHK-001 to CHK-013) must not be returned to the user.
Fix all errors first.

### Step 5 — Planned arrivals: check row count
If the model uses rows[], count them.
- ≤ 50 rows: embed inline in `schedules[{ eventId, rows: [...] }]`
- > 50 rows: set `rows: []` in the JSON and deliver a companion CSV
rows[] belongs inside `schedules[]`, never directly on the B-event.

A model is either valid or it is not finished. The user should never have to ask for a valid model.

---

## TOP LLM MISTAKES

These are the most common errors LLMs make when generating simmodlr models.
Read this before writing any model JSON.

| # | Mistake | Fix |
|---|---------|------|
| 1 | `probabilisticRouting` on ARRIVE B-events | ARRIVE events route entities via their effect macro — never via routing tables. For arrival splits, create one ARRIVE B-event per stream and set each Exponential mean to `baseMean / probability`. Blocked by V39. |
| 2 | `"effect": ["RELEASE(Server)", "COMPLETE()"]` | `RELEASE` sets entity to `"waiting"` so `COMPLETE` is silently skipped. Use `"effect": ["COMPLETE()"]` alone — COMPLETE releases the server automatically. Warning V38. |
| 2b | `"effect": ["COMPLETE()", "RELEASE(Server)"]` | `COMPLETE` marks entity `"done"` and releases the server. The `RELEASE` that follows re-queues the completed entity, causing an **infinite loop**. Use `"effect": ["COMPLETE()"]` alone. Warning V38b. |
| 3 | Missing `useEntityCtx: true` on cSchedules | Without this, the target B-event can't identify the entity. Always add `"useEntityCtx": true` to every `cSchedules[]` entry. |
| 4 | `balkCondition` as a string, or placed on the B-event | Must be a predicate object on the Queue itself: `{ "variable": "Queue.Name.length", "operator": ">", "value": 5 }`. Never a string expression, and never nested under a B-event. Blocked by CHK-011. |
| 5 | `routing[].condition` as a string | Same as #4 — must be a predicate object, never a string. Blocked by CHK-012. |
| 6 | `"effect"` as a bare string | Must be an array: `"effect": ["ARRIVE(Customer)"]` — never `"effect": "ARRIVE(Customer)"`. |
| 7 | `scheduledTime` as a number | Must be a string: `"scheduledTime": "0"` — never `"scheduledTime": 0`. Blocked by V26. |
| 8 | Distribution params as numbers | Must be strings: `"distParams": { "mean": "5" }` — never `{ "mean": 5 }`. Blocked by V5. |
| 9 | `RENEGE(Patient)` instead of `RENEGE(ctx)` | Always use `RENEGE(ctx)`. The entity-type form silently fails. Blocked by V25. |
| 10 | No `COMPLETE()` or `RENEGE()` sink | Every model needs at least one exit path. Missing sinks = entities accumulate forever. Blocked by V8 / CHK-002. |
| 11 | Queue fed but no C-event consumes it | Every queue receiving entities via `ARRIVE()`, `RELEASE()`, or routing must have a C-event whose `effect` includes `ASSIGN(QueueName,...)`, `DELAY(QueueName)`, `BATCH(QueueName,N)`, `COSEIZE(QueueName,...)`, or `MATCH`. Warning CHK-013. |
| 12 | `RENEGE_OLDEST(CustomerType)` with non-existent type | The customer type argument must exactly match a defined entity type name (case-sensitive). A typo silently does nothing. |
| 13 | Missing `sections[]` on large models | Any model with ≥8 queues or ≥3 named stages MUST include a populated `sections[]`. Use `memberIds` (not `elementIds`). See §12.1. |
| 14 | Server `count` as a string instead of integer | `count` must be a JSON integer: `"count": 3`, never `"count": "3"`. When a `shiftSchedule` is present, always set `count` equal to `shiftSchedule[0].capacity`. Blocked by V19. |
| 15 | Disconnected queue/activity fragment | Every declared queue must be reachable from an arrival source. A queue that is never named as a destination in any `ARRIVE(Type, QueueName)`, `RELEASE(Server, QueueName)`, `defaultQueueName`, `routing[].queueName`, `probabilisticRouting[].queueName`, `loopConfig.exitQueueName`, or `overflowDestination` field is a fragment — it will never receive entities. Remove it, or add routing that targets it. Blocked by V45. |
| 16 | rows[] placed directly on the B-event instead of inside `schedules[]` | Move rows into `"schedules": [{"eventId": "b_arrive", "rows": [...]}]`. A top-level `rows[]` with empty `schedules[]` is silently ignored — V8 fires because the engine finds no arrival source. |
| 17 | Using `ASSIGN(QueueName, ServerType)` with an invented server type for a resource-free wait | If the activity does not claim any equipment/staff (a cooling period, mandatory hold, recovery time, paperwork delay), use `DELAY(QueueName)` instead — it holds the entity for the cSchedule duration without seizing a server. Never add `ASSIGN`/`RELEASE` alongside `DELAY` in the same C-event; `DELAY` is the entire effect. Blocked/flagged by V47. See §6.2. |
| 18 | `cSchedules[].dist: "ServerAttr"` on a `DELAY` C-event | `DELAY` never claims a server, so there is no server entity for `ServerAttr` to read an attribute from — the engine silently falls back to a fixed delay of `1`. Use a sampled distribution (`Exponential`, `Fixed`, `Uniform`, …) on the `cSchedules` entry instead. Warning V47. See §6.2. |
| 19 | A `DELAY` completion B-event whose **only** effect is `ARRIVE(...)` | `ARRIVE` always creates a brand-new entity — it never resolves the entity that was delayed, which is left stuck in `"serving"` status forever (a permanent leak). The completion B-event must include `COMPLETE()`, `RELEASE()`, or a routing table (`routing[]`/`probabilisticRouting[]`) to resolve the delayed entity. `ARRIVE` may still appear *alongside* one of those (e.g. to also spawn a separate derived/log entity) — only a *bare* `ARRIVE` with nothing else is the error. Blocked by V47. See §6.2. |
| 20 | `overflowDestination` set to a queue's `id` instead of its `name` | Unlike most id-style cross-references, `overflowDestination` is a name-style reference — same family as `ARRIVE(Type, QueueName)`, `RELEASE(Server, QueueName)`, and routing `queueName`. Set it to the target queue's exact `name` string. Setting it to the queue's `id` (e.g. `"q_unofficial"` instead of `"Unofficial Crossing Queue"`) never matches a defined queue name and is blocked by V20. See §16 for the full id-vs-name reference list. |

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
    "liveDataMode": null,
    "terminationCondition": null
  },
  "dataSources": [],
  "sections": []
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
| `experimentDefaults.maxSimTime` | number | No | Simulation end time in `timeUnit` units. Default 500. Set to 0 or omit to rely solely on `terminationCondition`. |
| `experimentDefaults.warmupPeriod` | number | No | Time before statistics collection begins. Must be < `maxSimTime` (V35). Default 0. |
| `experimentDefaults.replications` | integer | No | Number of independent runs for statistical averaging. Must be ≥ 1 (V34). Default 1. Use 10–30 for reliable confidence intervals. |
| `experimentDefaults.terminationCondition` | string \| null | No | Stop expression evaluated after each event, e.g. `"summary.served >= 100"`. When set, the run stops when the condition becomes true — regardless of `maxSimTime`. Editable in the UI's Execute panel → Run Configuration tab. Set `null` or omit for pure time-bounded runs. Warning V16 fires if neither `maxSimTime` nor `terminationCondition` is configured. |
| `experimentDefaults.liveDataMode` | `null` \| `"calibrated_batch"` \| `"rolling"` \| `"lookahead"` | No | Live-data run mode. `null` = static (default). See §15 for live data. |
| `dataSources` | array | No | Live data source definitions. See §15. |
| `sections` | array | No | Named groupings of model elements. See §12.1. |

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
- Customer `count` must be `0` (or omitted) — arrivals are generated by `ARRIVE()`, not by a pre-populated count. Setting a non-zero `count` on a customer entity is a modelling error; the field is ignored for customers.
- Server `count` must be an integer ≥ 1 (V19). This is the initial pool size; use `shiftSchedule` for time-varying capacity.
- `count` must be a **JSON integer** — never a string (e.g. `2`, not `"2"`). Blocked by V19.
- When `shiftSchedule` is present, set `count` to the **first entry's `capacity`** value. The engine initialises the server pool from this value at time 0, then applies shift changes at their scheduled times. A mismatch between `count` and `shiftSchedule[0].capacity` produces a V19-shift warning.
- `attrDefs[].name` must be unique within the entity type (V2).
- `attrDefs[].name` must not start with `Resource` or `Queue` (reserved namespaces — V10).
- `attrDefs[].valueType` is `"number"`, `"string"`, or `"boolean"`.
- `attrDefs[].defaultValue` must match the declared `valueType` (V3).
  - `number` → numeric string or number, e.g. `"3"` or `3`
  - `boolean` → `"true"` or `"false"` (string)
  - `string` → any string
- If `dist` is set, `distParams` is required. See §4 for valid distributions.

> **String rules: `defaultValue` vs `distParams`:** `defaultValue` for `number` type accepts either form (`"3"` or `3`). However, **all `distParams` values must always be strings** (`"3"`, never `3`) — the engine's distribution sampler requires the string form, and numeric `distParams` values will be blocked by V5. Do not carry the `defaultValue` leniency across to distribution parameters.

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
"mttrDistParams": { "min": "20", "mode": "45", "max": "90" },
"failureScope": "unit"
```

- All four fields (`mtbfDist`, `mtbfDistParams`, `mttrDist`, `mttrDistParams`) must be set together — partial specification is not valid.
- `failureScope` (optional, default `"unit"`): `"unit"` means each server instance fails and recovers independently. `"pool"` means one outage affects all servers of this type simultaneously. Use `"unit"` unless modelling shared-infrastructure failures.
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
- `customerType` must match the `name` of a customer entity type. This is the field that governs discipline application — the queue `name` is for display only and does not need to match the entity type name.
- `capacity`: `""` means unlimited. An integer ≥ 1 sets a finite buffer (V20).
- `discipline`: `"FIFO"` (default), `"LIFO"`, `"PRIORITY"`, `"PRIORITY(attrName)"`, `"SPT"`, or `"EDD"`.
  - `FIFO` — first in, first out. The default and most appropriate for customer-facing queues.
  - `LIFO` — last in, first out. Appropriate for stack-based processes (e.g. picking from the top of a physical pile). **Rarely correct for customer queues — verify intent before using.**
  - `PRIORITY` — requires the customer entity type to have an attribute named **exactly** `priority` of type `number` (V4). Lower numeric value = higher priority. FIFO tiebreaker on equal values.
  - `PRIORITY(attrName)` — uses the named attribute instead of `priority`, e.g. `"PRIORITY(severity)"`. The named attribute **must** exist on the customer entity type and be of type `number`. A missing or wrong-typed attribute silently falls back to FIFO.
  - `SPT` (Shortest Processing Time) — selects the entity with the smallest `serviceTime` or `processingTime` attribute value. The customer entity type **must** define an attribute named `serviceTime` or `processingTime` of type `number`; without it, discipline order is undefined. FIFO tiebreaker.
  - `EDD` (Earliest Due Date) — selects the entity with the smallest `dueDate` attribute value. The customer entity type **must** define an attribute named `dueDate` of type `number`; without it, discipline order is undefined. FIFO tiebreaker.
- `overflowDestination` (optional): name of another queue to receive overflow entities when this queue is full. UI-editable (appears when capacity is set). When the overflow destination is itself full, the engine recursively checks the next hop (and the one after that), exiting the system only if a cycle or dead end is reached — overflow chains (A→B→C) are checked at every hop, not just the first.
- `balkProbability` (optional, number 0–1): the probability an entity declines to join this queue, checked **every time** an entity attempts to join it — via `ARRIVE`, `RELEASE`, conditional/probabilistic routing, batch/split, or preemption re-queue — not just on arrival. V21 validates the range.
- `balkCondition` (optional): a **predicate object** `{ "variable", "operator", "value" }`, evaluated on every join attempt (same scope as `balkProbability` above). Use `"variable": "Queue.<queueName>.length"` to test queue occupancy. **Never a string** (CHK-011). Mutually combinable with `balkProbability` (both are checked if both are set).
- `renegeDist` / `renegeDistParams` (optional): when set, the engine automatically schedules a patience timer the moment an entity successfully joins this queue, sampled from the named distribution — no `RENEGE(ctx)` B-event needs to be authored. If the entity is still waiting when the timer fires, it abandons the queue exactly as a manually-wired renege would; if it has already been served, the timer is a no-op. This can be combined with the manual `schedules[{isRenege:true}]` B-event mechanism on the same model without conflict.

**Note:** Balking, capacity, and reneging are all properties of the Queue object — they apply uniformly no matter how an entity reaches the queue. Older models may have `balkProbability`/`balkCondition` on the ARRIVE B-event instead; these are migrated onto the matching queue automatically at load time (non-destructively — the legacy fields are left in place), so hand-written JSON should always place these fields on the queue, not the B-event.

---

## 4. Distributions

Used in B-event schedules, C-event service times, and entity attribute defaults.

| Distribution  | Required params                              | Constraints                        |
|---------------|----------------------------------------------|------------------------------------|
| `Fixed`       | `{ "value": "5" }`                           | value is numeric (V5)              |
| `Exponential` | `{ "mean": "5" }`                            | mean > 0 (V5)                      |
| `Uniform`     | `{ "min": "2", "max": "8" }`                 | max > min (V5)                     |
| `Normal`      | `{ "mean": "10", "stddev": "2" }`            | stddev > 0 (V5); warning V11 if mean < 2×stddev — negative samples clamped to 0. **For service times, prefer `Triangular` (bounded expert estimate) or `Erlang` (always positive, right-skewed) over Normal unless data specifically supports it.** |
| `Triangular`  | `{ "min": "2", "mode": "5", "max": "10" }`   | min ≤ mode ≤ max (V5). **Recommended for service times estimated by experts (best/likely/worst case).** |
| `Erlang`      | `{ "k": "3", "mean": "6" }`                  | k integer ≥ 1; mean > 0 (V5). **Recommended for multi-phase service processes — always positive, right-skewed like real service times.** |
| `Empirical`   | `{ "values": [4, 6, 8, 12] }` (or via CSV import) | Non-empty array required; samples uniformly from the list. An empty `values` array will produce no samples (no validation error — treat as a modelling error). |
| `Piecewise`   | `{ "periods": [{ "startTime": "0", "dist": "Exponential", "distParams": { "mean": "3" } }, ...] }` | First period must start at 0 (V12); periods sorted ascending (V13); nested Piecewise not supported (V12) |
| `Schedule`    | `{ "times": [10, 25, 40] }` or `{ "rows": [{ "time": 10, "attrs": { ... } }, ...] }` | Planned absolute arrival times; exhausts and stops. Empty rows/times array produces no arrivals (CHK-009). |
| `ServerAttr`  | `{ "attr": "serviceTime" }`                  | Reads named attribute from matched server entity; returns max(0, value) or 1 if not found |
| `EntityAttr`  | `{ "attr": "requestedDuration" }`            | Reads named attribute from arriving customer entity; returns value or 0 if not found |

**All numeric parameter values must be strings** (e.g. `"5"`, not `5`).

> **Distribution selection guidance for service times:** Use `Exponential` for memoryless inter-arrival times (Poisson process). Use `Triangular` when you have a best/typical/worst estimate. Use `Erlang` when service consists of multiple identifiable phases. Use `Empirical` when you have historical data. Avoid `Normal` for times that must be non-negative unless mean ≫ stddev.

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

> ⚠ **Common mistake:** `rows[]` must be placed inside `schedules[]` as
> `{"eventId": "b_arrive", "rows": [...]}` — never directly on the B-event object.
> A B-event with `rows[]` at the top level and an empty `schedules[]` will produce
> no arrivals and trigger V8.

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
- `balkCondition`/`balkProbability` are **not** B-event fields — they belong on the Queue object (see §3 Queues) and are checked on every join attempt, not just at arrival.
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
| `UNBATCH` | `UNBATCH(QueueName)` | Splits a batch entity, sends each member to `QueueName`. `QueueName` must reference a defined queue (V23). Every UNBATCH should be paired with a corresponding BATCH that created the batch entity being unbatched. |
| `FILL` | `FILL(containerId, amount)` | Adds `amount` to a container's level (clamped to capacity). `containerId` must match a declared container `id`. `amount` may be a numeric literal, a state variable name, or an arithmetic expression (e.g. `RefillRate * 2`) — same evaluator as `SET`. |
| `PREEMPT` | `PREEMPT(ServerType)` | Interrupts in-progress service; displaced entity re-queues with remaining service time. |
| `FAIL` | `FAIL(ServerType)` | Marks servers of this type as failed; interrupts in-progress service. Pair with a scheduled `REPAIR` B-event. |
| `REPAIR` | `REPAIR(ServerType)` | Restores failed servers to idle; triggers a C-scan for waiting entities. |
| `SPLIT` | `SPLIT(EntityType, N, QueueName)` | Creates N−1 clones of the context entity and places them in `QueueName`. N must be ≥ 2; `QueueName` must reference a defined queue. |
| `SET` | `SET(varName, expression)` | Sets a state variable to an arithmetic expression. Supports `Entity.attrName`, state variables, `clock`, +−×÷, `min`/`max`/`abs`/`round`/`floor`/`ceil`. |
| `SET_ATTR` | `SET_ATTR(attrName, expression)` | Sets the context entity's attribute to the result of an arithmetic expression. |
| `COST` | `COST(expression)` | Accumulates a numeric expression to `summary.totalCost` and the entity's `__cost` attribute. |

> ⚠ **SET_ATTR ordering — V44:** `SET_ATTR` requires a context entity established by a preceding `ARRIVE`, `ASSIGN`, `COSEIZE`, `SEIZE`, `BATCH`, or `SPLIT` macro in the same effect array. A `SET_ATTR` appearing before any such macro is silently skipped at runtime.
> 
> ✓ `["ARRIVE(Patient, Queue)", "SET_ATTR(severity, 3)"]` — ARRIVE first establishes context, SET_ATTR follows  
> ✗ `["SET_ATTR(severity, 3)", "ARRIVE(Patient, Queue)"]` — SET_ATTR fires before context exists, silently skipped  
> ✗ `["SET_ATTR(priority, 1)"]` alone on a scheduled B-event with no context macro — silently skipped

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
- `probabilisticRouting` cannot be combined with a queue argument in `RELEASE(Server, Queue)`. Use `RELEASE(Server)` (no queue arg) — the routing table controls where the entity goes. `RELEASE(Server, Queue)` hard-routes to a single queue and conflicts with the routing table (V18).
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
| **✓ Valid: RELEASE + probabilistic routing** | Mid-network service where the entity can branch to different queues; server freed, routing table decides next queue | `"effect": ["RELEASE(Nurse)"], "probabilisticRouting": [{"queueName": "Treatment Queue", "probability": 0.7}, {"queueName": "Diagnostics Queue", "probability": 0.3}]` |
| **✓ Valid: RELEASE + probabilistic exit** | Mid-network service where some entities exit and some continue; server must be freed | `"effect": ["RELEASE(Nurse)"], "probabilisticRouting": [{"queueName": "Treatment Queue", "probability": 0.7}, {"queueName": null, "probability": 0.3}]` |
| **✗ Anti-Pattern: RELEASE with queue arg + probabilisticRouting** | **(Broken — V18)** `RELEASE(Server, Queue)` hard-routes to one queue; combining with `probabilisticRouting` is mutually exclusive — engine rejects it | `"effect": ["RELEASE(Nurse, Treatment Queue)"], "probabilisticRouting": [...]` — **drop the queue arg: use `RELEASE(Nurse)` instead** |
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

Balking is **not** configured on the B-event — it's a field on the Queue itself (`balkProbability` / `balkCondition`), checked on every join attempt (ARRIVE, RELEASE, routing, batch/split), not just on arrival. See §3 Queues for the full field reference and the predicate-object shape. (Older models with `balkProbability`/`balkCondition` on the ARRIVE B-event are migrated onto the matching queue automatically at load time.)

### 5.1 Loop Guard (Recirculation)

Use `loopConfig` when an entity can cycle through a stage more than once — for example, a patient returning for a follow-up review, or a job re-entering a machine for a second pass.

```json
"loopConfig": {
  "maxLoopCount": 3,
  "exitQueueName": "Discharge Queue"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `maxLoopCount` | integer ≥ 1 | Yes | Maximum times the entity may re-enter this B-event's upstream queue before being forced to the exit path |
| `exitQueueName` | string | No | Queue to route the entity to when `maxLoopCount` is reached. Must reference a valid queue name (V24). Omit to let the entity renege or complete via its normal routing on the final pass. |

**When to use `loopConfig` vs explicit routing:**

| Approach | Use when |
|---|---|
| `loopConfig` | The recirculation count is the key variable (e.g. "up to 3 review cycles"). Simple to express; engine tracks the loop count automatically. |
| Explicit routing + state variable | You need conditional logic at each pass (e.g. "if severity > 2, continue; else discharge"). Use a `SET(loopCount, loopCount + 1)` state variable and a `routing` condition on the completion B-event. |

**Worked example — review cycle (max 3 passes):**

```json
{
  "id": "b_review_done",
  "name": "Review Complete",
  "scheduledTime": "9999",
  "effect": ["RELEASE(Clinician, Review Queue)"],
  "loopConfig": {
    "maxLoopCount": 3,
    "exitQueueName": "Discharge Queue"
  },
  "schedules": []
}
```

The entity re-enters `Review Queue` on each pass. After 3 passes, the engine routes it to `Discharge Queue` instead, bypassing the normal `RELEASE` destination.

**Interaction with `terminationCondition`:** `loopConfig` operates at the entity level (per-entity loop counter). `terminationCondition` operates at the run level (global state expression). Both can coexist — the loop guard fires first; if the entity exits via `exitQueueName`, the global termination expression is then re-evaluated on the next event.

**Validation:** V24 — `maxLoopCount` must be an integer ≥ 1; `exitQueueName` must reference a defined queue.

---

## 6. C-Events (Conditional Events)

C-events fire whenever their condition becomes true. They represent service start logic.

```json
{
  "id": "c_triage",
  "name": "Triage",
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
- `priority`: integer, lower value = fires first when multiple conditions are simultaneously true. ⚠ **Starvation risk:** if C-events A (priority=1) and B (priority=2) share a resource and A's queue is always non-empty, B will never fire — entities accumulate, `served=0`. Give terminal C-events (discharge, exit) priority=0 so completions are not deferred behind new arrivals.
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
| `ASSIGN` | `ASSIGN(QueueName, ServerType)` | Seizes a server of `ServerType`, starts serving the front entity from `QueueName`. Schedules `cSchedules` B-events. Both `QueueName` and `ServerType` must reference defined objects. |
| `DELAY` | `DELAY(QueueName)` | Holds the front entity from `QueueName` for the duration sampled by the `cSchedules` entry, **without seizing any server**. Use for resource-free waits (cooling period, mandatory hold, recovery, paperwork delay). `DELAY` must be the entire effect — never combine with `ASSIGN`/`RELEASE` in the same C-event. The completion B-event needs `"useEntityCtx": true` to know which entity to route, and may use `COMPLETE()` or routing-table exit, same as a normal service completion. `QueueName` must reference a defined queue (V47). See §6.2. |
| `BATCH` | `BATCH(QueueName, N)` | Accumulates N entities from `QueueName` into a parent batch entity. N ≥ 2 (V22). `QueueName` must reference a defined queue. |
| `COSEIZE` | `COSEIZE(QueueName, Srv1, Srv2, ...)` | Atomically seizes one entity and multiple server types simultaneously. Fails cleanly if any server is unavailable. All server type names must reference defined server entity types. |
| `MATCH` | `MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue)` | Pairs one entity from each of `QueueA` and `QueueB` into a combined batch in `TargetQueue`. All queue names must reference defined queues. `TypeA` and `TypeB` must match defined customer entity type names. |
| `SET` | `SET(variableName, expression)` | Sets a state variable to an arithmetic expression. |
| `SET_ATTR` | `SET_ATTR(attrName, expression)` | Sets the context entity's attribute to an arithmetic expression. |
| `COST` | `COST(expression)` | Accumulates a numeric expression to `summary.totalCost`. |
| `RENEGE_OLDEST` | `RENEGE_OLDEST(CustomerType)` | Removes the oldest entity of the given type from its queue. `CustomerType` must exactly match a defined customer entity type name (case-sensitive). Used for max-queue-length policies or timeout eviction. |
| `FILL` | `FILL(containerId, amount)` | Adds `amount` to a container's level (clamped to capacity). `containerId` must match a declared container `id` (V27). `amount` may be a numeric literal, a state variable name, or an arithmetic expression (e.g. `RefillRate * 2`) — same evaluator as `SET`. |
| `DRAIN` | `DRAIN(containerId, amount)` | Removes `amount` from a container's level. Level must be ≥ amount (no-op with error if not) (V27). `amount` accepts the same literal/state-variable/expression forms as `FILL`. |
| `SPLIT` | `SPLIT(EntityType, N, QueueName)` | Creates N−1 clones of the context entity and places them in `QueueName`. N must be ≥ 2. `QueueName` must reference a defined queue. |

### 6.2 Resource-Free Activities (`DELAY`)

Use `DELAY` instead of `ASSIGN` whenever the activity does not actually claim a piece of equipment or staff — only time passes. Examples: a mandatory cooling-off period, an unmonitored recovery wait, a paperwork hold, a fixed dwell time.

```json
{ "id": "c_recover", "name": "Recover", "priority": 1,
  "condition": "queue(Recovery Queue).length >= 1",
  "effect": ["DELAY(Recovery Queue)"],
  "cSchedules": [{ "eventId": "b_recovery_done", "useEntityCtx": true, "dist": "Exponential", "distParams": { "mean": "180" } }] }
```

Rules:
- `DELAY(QueueName)` is the **entire** effect — never pair it with `ASSIGN`, `RELEASE`, or any server macro in the same C-event.
- Never invent a `ServerType` to model a resource-free wait. If nothing is actually seized, there is no server type to declare.
- The C-event's `cSchedules` entry MUST set `"useEntityCtx": true` so the completion B-event knows which entity to route — same requirement as `ASSIGN`.
- The `cSchedules` entry's `dist` must be a sampled distribution (`Exponential`, `Fixed`, `Uniform`, …) — **never `"ServerAttr"`**. `DELAY` claims no server, so there is no server attribute to read; `ServerAttr` silently falls back to a fixed delay of `1`. Warning V47.
- The completion B-event has three valid ways to resolve the delayed entity — pick based on what actually happens when the delay ends:
  1. **`COMPLETE()`** — the entity's journey ends here. Works correctly with no server claimed: the engine explicitly checks the entity's `_isDelay` flag and skips the "no matching busy server" guard for delay completions.
  2. **A routing table (`routing[]` + `defaultQueueName`, or `probabilisticRouting[]`) with NO effect macro at all** — use this when the entity continues to another queue and no server is involved anywhere in this entity's journey. Leave `effect` empty/absent; the engine's routing logic explicitly accepts a delay-held entity (status `"serving"` with a customer context but no server context) the same way it accepts a `"waiting"` entity — no `COMPLETE()` or `RELEASE()` needed to "unlock" it first.
  3. **`RELEASE(ServerType[, TargetQueue])`** — **only** valid if a server was genuinely seized for this same entity *earlier* in its journey (e.g. a prior C-event `ASSIGN`s a server, then this `DELAY` models an unsupervised recovery/hold while that server is still considered claimed, then `RELEASE` frees it). `RELEASE` has no `_isDelay` awareness: it resolves the server by type/busy-status, not by this entity's context, so on a chain where no server was *ever* claimed it will either silently no-op (entity stuck forever, same leak as bare `ARRIVE`) or — if an unrelated busy server of that type happens to exist elsewhere in the model — incorrectly act on a *different* customer's claim. Never invent a `RELEASE` for a delay where nothing was seized; use option 1 or 2 instead.
- **The completion B-event's effect must not be a bare `ARRIVE(...)` with nothing else.** `ARRIVE` always spawns a brand-new entity and never resolves the delayed entity, which is left stuck in `"serving"` status forever. Resolve the delayed entity with one of the three options above — `ARRIVE` is fine *in addition* to `COMPLETE()`/`RELEASE()` (e.g. `["RELEASE(Clinician, Discharge Queue)", "ARRIVE(AuditRecord, Log Queue)"]` to also spawn a derived log entity), just never alone. Blocked by V47.
- `DELAY(QueueName)` counts as a valid consumer of `QueueName` for CHK-013 — do not add a redundant `ASSIGN`/`BATCH` just to silence that check.
- `QueueName` must reference a defined queue (V47, parity with the `BATCH`/`FILL`/`DRAIN` queue checks).

### 6.1 Condition Formats — Two Different Systems

**There are two condition formats in simmodlr. They are NOT interchangeable.**

#### Format A — C-event `condition` string (global state predicate)

Used **only** in `cEvents[].condition`. Written as a string expression.

| Predicate | Meaning |
|-----------|---------|
| `queue(QueueName).length > 0` | Queue has ≥ 1 entity waiting |
| `queue(QueueName).length >= N` | Queue has ≥ N entities waiting |
| `idle(ServerType).count > 0` | At least one server of type `ServerType` is idle |
| `busy(ServerType).count > 0` | At least one server of type `ServerType` is busy |
| `idle(ServerType).count >= N` | At least N servers are idle |
| `state.variableName > N` | User-defined state variable exceeds threshold. `variableName` must match a `stateVariables[].name`. Supports all comparison operators: `==`, `!=`, `<`, `>`, `<=`, `>=`. |
| `state.variableName == 1` | User-defined state variable equals a value. Useful for shift/mode flags set via `SET(variableName, ...)`. |
| `container(ContainerId).level > N` | Current level of a declared container. `ContainerId` must match a `containerTypes[].id`. |
| `container(ContainerId).capacity > N` | Declared capacity of a container (`Infinity` if unbounded). |
| `container(ContainerId).min > N` / `container(ContainerId).max > N` | Minimum / maximum level observed for that container so far this run. |

Combine with `AND`, `OR`, `NOT`. Queue and server names must match exactly (case-sensitive).

```json
"condition": "queue(Triage Queue).length > 0 AND idle(Nurse).count > 0"
```

```json
"condition": "queue(Batch Queue).length >= 5 AND state.batchingEnabled == 1"
```

```json
"condition": "container(Tank).level >= 10"
```
DRAIN-blocking is an emergent property of this: a C-event with this condition and effect `["DRAIN(Tank, 10)"]` is re-scanned every cycle and simply won't fire until the level reaches 10 — no special "blocking" syntax is needed.

> **This string format is valid ONLY for `cEvents[].condition`.** Do not use it anywhere else.

---

#### Format B — Predicate object (entity attribute or queue test)

Used for: `queues[].balkCondition`, `bEvents[].routing[].condition`, `cEvents[].cSchedules[].when`.

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
- `container(ContainerId).level` / `.capacity` / `.min` / `.max` — same parenthesis-form tokens as Format A §6.1, also valid as a `variable` value here (e.g. `{ "variable": "container(Tank).level", "operator": ">=", "value": 10 }` as a `balkCondition` or `routing[].condition`)

> **Do not use the string format (Format A) for balkCondition, routing conditions, or when predicates.** The engine calls a different evaluator for these fields; a string value will produce a pre-run error (CHK-011 or CHK-012). This restriction is about the *outer* shape — the whole condition must be a JSON object, not a string with `AND`/`OR`. A single token like `container(Tank).level` or `queue(X).length` is still valid as the *value* of the `variable` field inside that object.

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

> **Container vs state variable — when to use each:** Use a `containerType` when the resource has a physical level that is bounded, shared across entity interactions, and must be tracked continuously (e.g. a fuel tank, a blood inventory, a buffer). Use a **state variable** when you need a simple scalar counter or flag that is set/incremented by events and read in C-event conditions (e.g. a shift active flag, an entity count, a mode toggle). Containers expose `FILL`/`DRAIN` semantics with capacity clamping; state variables expose `SET()` arithmetic with no bounds enforcement.

> **UI note:** Container types are fully editable in the UI via the "Containers" tab — users can add, edit, and remove containers (`id`, `capacity`, `initialLevel`) after import.

```json
{
  "id": "ct_tank",
  "capacity": 1000,
  "initialLevel": 500
}
```

- `id` must be unique and non-empty (V26). Containers have no separate `name` field — the `id` is both the identifier and the macro argument.
- `capacity` (optional): maximum level, must be > 0 when set (V26). Omit for unbounded.
- `initialLevel` (optional, default 0): must be ≥ 0 and ≤ `capacity` (V26).
- Manipulated by `FILL(id, amount)` and `DRAIN(id, amount)` in both B-events and C-events — the first argument must match the container's `id` exactly (case-insensitive) (V27).
- `DRAIN` is a no-op (with error log) if the current level < amount — levels never go negative.

> **Reading container levels in conditions:** Use `container(Id).level`, `.capacity`, `.min`, or `.max` directly inside any `cEvents[].condition` (or routing/balk) string — see §6.1 Format A. There is no need to fall back to a raw `state` key. This is what makes a "blocking DRAIN" possible: give a C-event a condition like `"container(Tank).level >= 10"` and effect `["DRAIN(Tank, 10)"]`, and the Three-Phase engine's per-cycle C-event re-scan will simply leave it un-fired until the level condition is met — no special blocking syntax required.

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

### Scoped goals

Queue-scoped goals constrain a metric to a specific queue. When `scope` is present, the engine evaluates the metric only for that queue, not the system-wide average.

```json
{
  "metric": "summary.avgWait",
  "operator": "<",
  "target": 10,
  "label": "Triage wait under 10 min",
  "scope": { "type": "queue", "id": "q_triage", "name": "Triage Queue" }
}
```

Resource-scoped goals target a specific server/resource type. `scope` is **required** for `resource.utilisation` — there is no system-wide utilisation metric.

```json
{
  "metric": "resource.utilisation",
  "operator": "<",
  "target": 0.85,
  "label": "Nurse utilisation under 85%",
  "scope": { "type": "resource", "id": "et_nurse", "name": "Nurse" }
}
```

Container-scoped goals target a specific container. `scope` is **required** for container metrics.

```json
{
  "metric": "container.avgLevel",
  "operator": ">",
  "target": 50,
  "label": "Average tank level above 50 units",
  "scope": { "type": "container", "id": "ct_tank", "name": "tank" }
}
```

### Supported metric paths

| `metric` key | Meaning | Scopable |
|---|---|---|
| `summary.avgWait` | Weighted mean wait across served + reneged + in-progress entities. In-progress waits are half-weighted. | Queue |
| `summary.avgSvc` | Mean service time (served entities only — excludes reneged) | — |
| `summary.avgSojourn` | Mean total time in system (served + reneged entities only) | — |
| `summary.avgTimeInSystem` | Weighted mean time in system across ALL entities (served + reneged + in-progress). In-progress partial sojourns are half-weighted. | — |
| `summary.avgWIP` | Average work-in-progress (mean entities in system, Little's Law) | Queue |
| `summary.maxWIP` | Maximum work-in-progress (peak queue depth) | Queue |
| `summary.served` | Total customers served | Queue |
| `summary.servedRatio` | Service completion rate as a decimal (served / total, 0–1) | — |
| `summary.reneged` | Total customers who abandoned | Queue |
| `summary.totalCost` | Total cost (requires cost model) | — |
| `summary.costPerServed` | Cost per served entity (requires cost model) | — |
| `resource.utilisation` | Resource utilisation as a fraction (0–1) | **Resource** (required) |
| `container.minLevel` | Minimum container level during run | **Container** (required) |
| `container.avgLevel` | Average container level during run | **Container** (required) |
| `container.maxLevel` | Maximum container level during run | **Container** (required) |

`operator`: one of `<`, `<=`, `>`, `>=`

### Percentile operators (time metrics only)

For time-scoped goals (`summary.avgWait`, `summary.avgSvc`, `summary.avgSojourn`, `summary.avgTimeInSystem`), use `p50`, `p75`, `p90`, `p95`, or `p99` as the `operator` to set a target on a wait-distribution percentile rather than the mean. All percentile comparisons use `<` semantics (the percentile must be below the target).

```json
{
  "metric": "summary.avgWait",
  "operator": "p90",
  "target": 15,
  "label": "90th percentile wait under 15"
}
```

⚠ The fifteen `metric` values listed above are the **only** valid values. Do not invent other paths (`queue.avgLength`, `section.Triage.avgWait`, etc.) — the engine evaluates no other metric path and the UI will not display it. Always use the full prefix form shown in the table.

> **Batch-mode note:** For multi-replication runs, count goals (`summary.served`, `summary.reneged`) and `summary.avgWIP`/`summary.maxWIP` are evaluated against the **per-replication average** (the CI mean), not the cumulative total across all replications.

### Scope field reference

| `scope.type` | `scope.id` | `scope.name` | Used by |
|---|---|---|---|
| `"queue"` | Queue `id` | Queue `name` | `summary.avgWait`, `summary.avgWIP`, `summary.maxWIP`, `summary.served`, `summary.reneged` |
| `"resource"` | Server entity type `id` | Server entity type `name` | `resource.utilisation` (required — must select a resource) |
| `"container"` | Container `id` | Container `id` | `container.minLevel`, `container.avgLevel`, `container.maxLevel` (required — must select a container) |

When `scope` is omitted, the metric applies system-wide.

---

## 10. Validation Rules Summary

**VALIDATION CHECKLIST — Before outputting a proposedModel, the LLM MUST verify
every blocking rule below. The FATAL ERRORS in the system prompt cover common
cases; this table is exhaustive. Any model that fails a blocking rule is invalid
and will be rejected at import.**

simmodlr runs two validation layers before every simulation. Both block the run on errors.
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
| V21 | Queue `balkProbability` must be a finite number in [0, 1] |
| CHK-011 | Queue (and, for legacy hygiene, B-event) `balkCondition` **must be a predicate object** `{ variable, operator, value }` — never a string |
| CHK-012 | `routing[].condition` **must be a predicate object** `{ variable, operator, value }` — never a string |
| V22 | `BATCH` size must be an integer ≥ 2 and the referenced queue must exist |
| V23 | `UNBATCH` target queue must reference a defined queue |
| V24 | `loopConfig.maxLoopCount` must be an integer ≥ 1. `loopConfig.exitQueueName`, when set, must reference a defined queue. |
| V25 | `RENEGE` must always use `(ctx)` as its argument — never an entity type name like `RENEGE(Patient)` |
| V26 | Container `id` must be unique and non-empty; `capacity` > 0 when set; `initialLevel` ≥ 0 and ≤ `capacity`. Also: B-event `scheduledTime` must be numeric. |
| V27 | `FILL` and `DRAIN` macros must reference a declared container `id`. A bare numeric `amount` ≤ 0 is a blocking error. A bare non-numeric `amount` that doesn't match a declared state variable name is a warning (likely a typo). `amount` expressions containing operators/parens (e.g. `RefillRate * 2`) can't be statically validated and are accepted without a check. |
| V28 | `epoch`, when set, must be a valid ISO 8601 datetime string (e.g. `"2026-05-18T08:00:00"`) |
| V30 | If `probabilisticRouting` contains a `null` (exit) branch, the B-event's effect **must** include `COMPLETE()`, `RENEGE(ctx)`, or `RELEASE()` — otherwise entities routed to exit aren't counted as served. Use `RELEASE()` for mid-network events that free a server; use `COMPLETE()` for terminal events. |
| V31 | If `routing` (conditional) contains a `null` (exit) branch, the B-event's effect **must** include `COMPLETE()`, `RENEGE(ctx)`, or `RELEASE()`. |
| V39 | A B-event with an `ARRIVE()` effect **must not** have `probabilisticRouting`. ARRIVE routes entities via its effect argument `ARRIVE(Type, QueueName)` — a routing table on the same event is silently ignored and breaks the model. For arrival splitting, use separate ARRIVE B-events with proportional inter-arrival rates. |
| V32 | A B-event effect list **must not** contain more than one terminal sink (`COMPLETE` or `RENEGE`). Choose one. |
| V34 | `experimentDefaults.replications` must be a positive integer (≥ 1) |
| V35 | `warmupPeriod` must be strictly less than `maxSimTime` |
| V36 | `mtbfDist` and `mttrDist` are only valid on entity types with `role: "server"` |
| V37 | When either `mtbfDist` or `mttrDist` is set on a server entity type, **both** must be present with valid distribution parameters |
| V45 | Every declared queue must appear as a routing destination (ARRIVE, RELEASE 2-arg, `defaultQueueName`, `routing[].queueName`, `probabilisticRouting[].queueName`, `loopConfig.exitQueueName`, or `overflowDestination`). A queue not reachable by any of these is a disconnected fragment. Only enforced when at least one queue is explicitly named in routing (avoids false positives on single-arg `ARRIVE` models). |
| V46 | `overflowDestination` must not form a cycle (A → B → A). Overflow chains are followed recursively at runtime, so a cycle would otherwise loop; it is instead caught at design time. |
| V47 | `DELAY(QueueName)` must reference a defined queue (blocking error). A C-event whose effect contains `DELAY` should also set `"useEntityCtx": true` on its `cSchedules` entry, or its completion B-event will not know which entity to route (warning). Its `cSchedules` entry's `dist` must not be `"ServerAttr"` — `DELAY` claims no server, so this always falls back to a fixed delay of `1` (warning). Its completion B-event's effect must not be a *bare* `ARRIVE(...)` with nothing else — `ARRIVE` never resolves the delayed entity, leaving it stuck in `"serving"` forever; `ARRIVE` combined with `COMPLETE()`/`RELEASE()`/a routing table is fine (blocking error). |

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
| CHK-013 | A queue receives entities (via `ARRIVE`, `RELEASE`, or routing) but no C-event consumes from it — entities will accumulate indefinitely |

---

## 11. IDs and Naming Conventions

- `id` fields are for internal references only. Use a short prefix + descriptive name:
  - Entity types: `et_` prefix (e.g. `et_patient`, `et_nurse`)
  - Queues: `q_` prefix (e.g. `q_triage`, `q_treatment`)
  - B-events: `b_` prefix (e.g. `b_arrive`, `b_complete`)
  - C-events: `c_` prefix (e.g. `c_triage`, `c_assess_minor`).
    ⚠ C-event `name` must be a **verb or verb-noun — never prefixed with "Start"**.
    The effect picker automatically prepends "Start" when showing ASSIGN labels.
    Naming a C-event "Start Triage" causes the UI to display "Start Start Triage".
    Good examples: "Triage", "Assess Minor", "Treat Resus", "Check In", "Consult".
  - Entity type `name` (servers/resources) should be a role noun — "Nurse", "Doctor", "Triage Nurse".
    Queues should be noun phrases — "Triage Queue", "Waiting Room".
    Together with a correctly named C-event, the effect label reads naturally:
    "Start Triage with Nurse and Patient from Triage Queue."
  - State variables: `sv_` prefix (e.g. `sv_shift_active`)
  - Containers: `ct_` prefix (e.g. `ct_tank`)
- `name` fields are the human-readable labels shown in the UI. They are also used as references in macro arguments — **they must match exactly including case**.
- Queue `name` is referenced in: `ARRIVE(Type, QueueName)`, `RELEASE(Server, QueueName)`, `ASSIGN(QueueName, Server)`, condition predicates `queue(QueueName)`, `overflowDestination`, `defaultQueueName`, routing `queueName`. **`overflowDestination` takes the queue's `name`, not its `id`** — easy to get backwards since most other cross-queue fields are id-based (see TOP LLM MISTAKES #20).
- Entity type `name` is referenced in: `ARRIVE(EntityType, ...)`, `ASSIGN(QueueName, ServerType)`, `RELEASE(ServerType, ...)`, condition predicates `idle(ServerType)`, `busy(ServerType)`, queue `customerType`.

---

## 12. Common Patterns

### 12.1 Sections (Large-Model Organisation)

`sections[]` serves two distinct purposes:

1. **UI organisation** — groups queues, entity types, B-events, and C-events into named, coloured swimlanes and filter tabs. Always beneficial for navigation on large models.

2. **Statistical boundary tracking** — the engine computes per-section metrics that appear in the Results panel and AI exports. `count` and `avgSojourn` are computed from `memberIds` alone. Journey breakdowns (`summary.journeys`, `summary.queueJourneys`) capture full flow paths including sinks automatically.

> **For small models (< 8 queues, single stage):** sections add no value. Omit `sections: []` entirely unless the model has distinct named stages or the user explicitly requests swimlane views.

```json
"sections": [
  {
    "id": "sec_nhs24",
    "name": "NHS 24 / 111 Triage",
    "color": "#4A90D9",
    "memberIds": ["q_nhs24_call", "q_nhs24_clinical", "et_call_handler", "b_arrive_111", "c_assign_handler"]
  },
  {
    "id": "sec_miu",
    "name": "Minor Injuries Unit",
    "color": "#27AE60",
    "memberIds": ["q_miu_wait", "q_miu_treatment", "et_miu_nurse", "c_assign_miu", "b_complete_miu"]
  }
]
```


| Field | Type | Description |
|---|---|---|
| `id` | string | Unique section ID (e.g. `"sec_nhs24"`) |
| `name` | string | Human-readable label shown in filter tabs and swimlane headers |
| `color` | string | CSS hex colour used for swimlane background and filter tab indicators. Always assign a distinct colour per section — use the palette below. |
| `memberIds` | string[] | IDs of queues, entity types, B-events, and/or C-events that belong to this section. Each element may appear in at most one section. |

**Section colours:** assign a visually distinct colour to each section so swimlane headers and filter tabs are easy to tell apart. Suggested palette (use in order, then cycle):

| # | Hex | Name |
|---|---|---|
| 1 | `#4A90D9` | Blue |
| 2 | `#27AE60` | Green |
| 3 | `#E67E22` | Orange |
| 4 | `#8E44AD` | Purple |
| 5 | `#E74C3C` | Red |
| 6 | `#16A085` | Teal |
| 7 | `#F39C12` | Amber |
| 8 | `#2C3E50` | Slate |

Do not repeat the same colour across sections in the same model.

**Results contract — `summary.sections[sectionId]`:**

| Field | Meaning | Non-zero when |
|---|---|---|
| `count` | Entities that visited any queue in `memberIds` | ≥1 entity stage maps to a memberIds queue |
| `avgSojourn` | Mean time (wait + service) across all `count` entities | `count` > 0 |

The engine also produces journey breakdowns in the same summary:
- `summary.journeys` — section-level path counts, e.g. `"sec_triage→sec_ed→exit": 42`
- `summary.queueJourneys` — queue-level path counts, e.g. `"q_triage→q_ed_wait→q_discharge": 42`


**Generation checklist — run this for every section you define:**

1. **Assign `memberIds`** — include every queue, entity type, B-event, and C-event that belongs to this section.
2. **Cover all elements** — every element in the model must appear in exactly one section's `memberIds`. Elements absent from all sections are invisible to the swimlane UI.
3. **Assign distinct colours** — use a different hex colour per section so swimlane headers are easy to distinguish.

⚠ **Coverage requirement:** For any model that uses sections, every queue `id`, entity type `id`, B-event `id`, and C-event `id` in the model **must** appear in exactly one section's `memberIds`. Items absent from all `memberIds` arrays are invisible to the swimlane UI and filter tabs. When in doubt, assign supporting events and entity types to the section they are primarily associated with.

**Anti-pattern — `elementIds`:** An earlier draft used `elementIds` instead of `memberIds`. This field name is silently ignored. Always use `memberIds`.

```
✓ CORRECT:   "memberIds": ["q_triage", "et_patient"]
✗ WRONG:     "elementIds": ["q_triage", "et_patient"]
```

**Effect on the UI:**
- Each editor (Entity Types, Queues, B-Events, C-Events) shows a section filter tab strip; clicking a tab hides all rows not in that section.
- The Visual Designer shows a coloured dot on each node whose `refId` appears in a section's `memberIds`.
- A dedicated **Sections** tab in the Design area lets users create, rename, recolour, and assign members.

**When sections are appropriate:**

Sections add value when a model has distinct, named stages that an entity passes through sequentially, and when the total number of queues makes the flat list hard to navigate. Typical triggers (use ≥8 queues OR ≥3 named stages as the threshold):

| Signal | Example |
|---|---|
| ≥ 8 queues or ≥ 3 named stages | Glasgow Urgent Care Pathway (20 queues) |
| Multi-stage pathway with named handoff points | NHS 24 → MIU → A&E |
| Multiple departments or wards modelled in one file | Triage, Observation, Theatres, Recovery |
| User asks for sub-models, swimlanes, or grouped views | "Can you split this into sections?" |

Sections are **not** needed for:
- Simple single-flow models (M/M/1, M/M/c, one or two queues)
- Models with fewer than 8 queues and a single named stage
- Exploratory or template models

**Rules:**
- An element appearing in multiple sections is a modelling error (the UI will assign it to the last section that claims it).
- When generating a model JSON, you **SHOULD** populate `sections[]` if the model is clearly multi-stage (≥8 queues or ≥3 named stages). Omitting sections from a large model is a missed usability opportunity — always include them when the structure is clear. Reference the actual `id` values of the queues and events you defined earlier in the JSON — do not invent IDs.
- If you are unsure which elements belong to which stage, omit `sections` or set it to `[]` and note in your response that the user can assign sections via the Sections tab.

---

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

#### Queue-level automatic reneging (zero-wiring alternative)

Instead of hand-authoring a renege B-event and wiring its `eventId` into every event that feeds a queue, set `renegeDist`/`renegeDistParams` directly on the Queue (§3):

```json
{ "id": "q_triage", "name": "Triage Queue", "customerType": "Patient", "discipline": "FIFO",
  "renegeDist": "Exponential", "renegeDistParams": { "mean": "15" } }
```

The engine automatically schedules a patience timer the moment any entity joins this queue — via `ARRIVE`, `RELEASE`, routing, or batch/split — with no `RENEGE(ctx)` B-event or `schedules[].eventId` wiring required. This is the preferred approach when every path into a queue should share the same patience distribution. The manual `schedules[{isRenege:true}]` pattern above remains valid and can coexist on the same model — use it when only certain paths into a queue should have a renege timer, or when the trigger needs to be conditional rather than purely distribution-based.

---

### 12.2 Response Format — How to Structure Your Reply

When an LLM generates a simmodlr model, the reply must be structured as a JSON object with the following envelope:

```json
{
  "model": { ... },
  "companionCsv": null,
  "notes": ""
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `model` | object | Yes | The complete simmodlr model JSON, matching the schema in §1–§11 |
| `companionCsv` | string \| null | Yes | CSV text for planned arrival data (see §5 Format 1 / Format 2). Set to `null` when the model does not use `rows[]` or `times[]` schedules. **Always include this field** — omitting it when the model has `rows[]` will leave the user without import data. |
| `notes` | string | No | Optional human-readable notes for the user: assumptions made, recommended parameter values to adjust, UI steps to follow after import. Keep brief (3–5 bullet points max). |

**Delivery instructions:**

1. Output the JSON envelope as a single fenced code block (` ```json `).
2. If `companionCsv` is non-null, also output the CSV as a separate fenced code block (` ```csv `) immediately after, with a one-line instruction: "Import this CSV in the model editor → Schedules tab."
3. After the code blocks, write a 2–3 sentence plain-English summary of what the model does and what the user should adjust first.

**Example — model with no planned arrivals:**

```json
{
  "model": { "name": "M/M/1 Queue", "entityTypes": [...], ... },
  "companionCsv": null,
  "notes": "Set Exponential mean in the Arrival B-event to match your observed inter-arrival time. Increase replications to 30 for tighter confidence intervals."
}
```

**Example — model with planned arrivals (Format 1):**

```json
{
  "model": { "name": "Clinic Schedule", "entityTypes": [...], ... },
  "companionCsv": "time,severity,age\n08:00,3,45\n08:15,1,32\n08:30,2,28"
}
```

```csv
time,severity,age
08:00,3,45
08:15,1,32
08:30,2,28
```

Import this CSV in the model editor → Schedules tab.

---

### 12.3 Complete Reference Model — 3-Section Urgent Care Pathway

This is a canonical reference model. Use it as a template when generating multi-section models. It exercises: entity attributes, PRIORITY queue discipline, shift schedule, probabilistic routing, state variable, goals, and multi-section `memberIds` grouping.

The model represents a 3-stage urgent care pathway: **NHS 24 triage → Minor Injuries Unit → Emergency Department**. Patients arrive via phone triage and are routed probabilistically to MIU (60%) or ED (40%).

```json
{
  "name": "Urgent Care Pathway — Reference Model",
  "description": "3-stage pathway: NHS 24 triage routes patients to MIU (60%) or ED (40%). Demonstrates sections, shift schedules, PRIORITY discipline, goals, and state variables.",
  "visibility": "private",
  "timeUnit": "minutes",
  "entityTypes": [
    {
      "id": "et_patient",
      "name": "Patient",
      "role": "customer",
      "count": 0,
      "attrDefs": [
        { "name": "priority", "valueType": "number", "defaultValue": 3, "mutable": true,
          "dist": "Uniform", "distParams": { "min": "1", "max": "5" } },
        { "name": "acuity", "valueType": "string", "defaultValue": "low", "mutable": false }
      ]
    },
    {
      "id": "et_call_handler",
      "name": "Call Handler",
      "role": "server",
      "count": 4,
      "attrDefs": []
    },
    {
      "id": "et_miu_nurse",
      "name": "MIU Nurse",
      "role": "server",
      "count": 3,
      "shiftSchedule": [
        { "time": 0,   "capacity": 3 },
        { "time": 480, "capacity": 2 },
        { "time": 960, "capacity": 3 }
      ],
      "attrDefs": []
    },
    {
      "id": "et_ed_doctor",
      "name": "ED Doctor",
      "role": "server",
      "count": 5,
      "attrDefs": []
    }
  ],
  "queues": [
    { "id": "q_nhs24",   "name": "NHS 24 Queue",  "customerType": "Patient", "capacity": "", "discipline": "FIFO" },
    { "id": "q_miu",     "name": "MIU Queue",      "customerType": "Patient", "capacity": "", "discipline": "PRIORITY" },
    { "id": "q_ed_wait", "name": "ED Wait Queue",  "customerType": "Patient", "capacity": "50", "discipline": "PRIORITY", "overflowDestination": "ED Overflow Queue" },
    { "id": "q_ed_overflow", "name": "ED Overflow Queue", "customerType": "Patient", "capacity": "", "discipline": "FIFO" },
    { "id": "q_discharge", "name": "Discharge Queue", "customerType": "Patient", "capacity": "", "discipline": "FIFO" }
  ],
  "bEvents": [
    {
      "id": "b_arrive",
      "name": "Patient Arrives",
      "scheduledTime": "0",
      "effect": ["ARRIVE(Patient, NHS 24 Queue)"],
      "schedules": [{ "eventId": "b_arrive", "dist": "Exponential", "distParams": { "mean": "4" } }]
    },
    {
      "id": "b_triage_done",
      "name": "Triage Complete",
      "scheduledTime": "9999",
      "effect": ["RELEASE(Call Handler)"],
      "probabilisticRouting": [
        { "probability": 0.6, "queueName": "MIU Queue" },
        { "probability": 0.4, "queueName": "ED Wait Queue" }
      ],
      "schedules": []
    },
    {
      "id": "b_miu_done",
      "name": "MIU Treatment Complete",
      "scheduledTime": "9999",
      "effect": ["RELEASE(MIU Nurse, Discharge Queue)"],
      "schedules": []
    },
    {
      "id": "b_ed_done",
      "name": "ED Treatment Complete",
      "scheduledTime": "9999",
      "effect": ["COMPLETE()"],
      "schedules": []
    },
    {
      "id": "b_discharge_done",
      "name": "Discharge Complete",
      "scheduledTime": "9999",
      "effect": ["COMPLETE()"],
      "schedules": []
    }
  ],
  "cEvents": [
    {
      "id": "c_triage",
      "name": "Triage",
      "priority": 1,
      "condition": "queue(NHS 24 Queue).length > 0 AND idle(Call Handler).count > 0",
      "effect": ["ASSIGN(NHS 24 Queue, Call Handler)"],
      "cSchedules": [{ "eventId": "b_triage_done", "dist": "Triangular",
                       "distParams": { "min": "3", "mode": "7", "max": "15" }, "useEntityCtx": true }]
    },
    {
      "id": "c_miu_treat",
      "name": "MIU Treat",
      "priority": 1,
      "condition": "queue(MIU Queue).length > 0 AND idle(MIU Nurse).count > 0",
      "effect": ["ASSIGN(MIU Queue, MIU Nurse)"],
      "cSchedules": [{ "eventId": "b_miu_done", "dist": "Triangular",
                       "distParams": { "min": "15", "mode": "30", "max": "60" }, "useEntityCtx": true }]
    },
    {
      "id": "c_ed_treat",
      "name": "ED Treat",
      "priority": 1,
      "condition": "queue(ED Wait Queue).length > 0 AND idle(ED Doctor).count > 0",
      "effect": ["ASSIGN(ED Wait Queue, ED Doctor)"],
      "cSchedules": [{ "eventId": "b_ed_done", "dist": "Erlang",
                       "distParams": { "k": "3", "mean": "90" }, "useEntityCtx": true }]
    },
    {
      "id": "c_discharge",
      "name": "Discharge",
      "priority": 0,
      "condition": "queue(Discharge Queue).length > 0",
      "effect": ["ASSIGN(Discharge Queue, MIU Nurse)"],
      "cSchedules": [{ "eventId": "b_discharge_done", "dist": "Fixed",
                       "distParams": { "value": "5" }, "useEntityCtx": true }]
    }
  ],
  "stateVariables": [
    { "id": "sv_peak", "name": "peakConcurrent", "valueType": "number", "initialValue": 0, "resetOnWarmup": true }
  ],
  "goals": [
    { "metric": "summary.avgWait", "operator": "<", "target": 10,
      "label": "Mean triage wait under 10 min",
      "scope": { "type": "queue", "id": "q_nhs24", "name": "NHS 24 Queue" } },
    { "metric": "summary.avgWait", "operator": "p90", "target": 30,
      "label": "90th-percentile ED wait under 30 min",
      "scope": { "type": "queue", "id": "q_ed_wait", "name": "ED Wait Queue" } },
    { "metric": "resource.utilisation", "operator": "<", "target": 0.85,
      "label": "MIU Nurse utilisation under 85%",
      "scope": { "type": "resource", "id": "et_miu_nurse", "name": "MIU Nurse" } }
  ],
  "containerTypes": [],
  "experimentDefaults": {
    "maxSimTime": 720,
    "warmupPeriod": 60,
    "replications": 20,
    "liveDataMode": null,
    "terminationCondition": null
  },
  "dataSources": [],
  "sections": [
    {
      "id": "sec_nhs24",
      "name": "NHS 24 Triage",
      "color": "#4A90D9",
      "memberIds": ["q_nhs24", "et_call_handler", "b_arrive", "b_triage_done", "c_triage"]
    },
    {
      "id": "sec_miu",
      "name": "Minor Injuries Unit",
      "color": "#27AE60",
      "memberIds": ["q_miu", "et_miu_nurse", "c_miu_treat", "b_miu_done", "q_discharge", "c_discharge", "b_discharge_done"]
    },
    {
      "id": "sec_ed",
      "name": "Emergency Department",
      "color": "#E67E22",
      "memberIds": ["q_ed_wait", "q_ed_overflow", "et_ed_doctor", "c_ed_treat", "b_ed_done"]
    }
  ]
}
```

**What this model demonstrates:**

| Feature | Where |
|---|---|
| Entity attributes (`priority`, `acuity`) | `et_patient.attrDefs` |
| PRIORITY queue discipline | `q_miu`, `q_ed_wait` |
| Finite capacity + overflow destination | `q_ed_wait` → `q_ed_overflow` |
| Server shift schedule (MIU Nurse) | `et_miu_nurse.shiftSchedule` |
| Probabilistic routing at triage | `b_triage_done.probabilisticRouting` |
| Different distribution types | Triangular (triage, MIU), Erlang (ED), Fixed (discharge) |
| State variable | `sv_peak` (peakConcurrent) |
| Scoped goals (queue + resource + percentile) | `goals[]` |
| 3-section model | `sections[]` |
| C-event priority ordering (discharge = 0, treatment = 1) | `c_discharge.priority: 0` |

**Key points to note when adapting this model:**

1. `q_miu` and `q_ed_wait` use `PRIORITY` discipline — patients need a `priority` attribute (`et_patient.attrDefs[0]`).
2. `q_discharge` is in the MIU section's `memberIds` (not a separate section) because discharge is part of the MIU flow.
3. `c_discharge.priority: 0` ensures completions fire before new arrivals are seized, avoiding head-of-line starvation.

---

## 13. Patterns & Anti-Patterns

Common modelling patterns and the mistakes to avoid when generating simmodlr models.

### 13.1 Terminal Completion (V30, V38)

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Preferred: Explicit COMPLETE** | Simple terminal completion — all entities exit after this event | `"effect": ["COMPLETE()"], "schedules": []` |
| **✗ Anti-Pattern: RELEASE then COMPLETE** | **(Broken — never use)** `RELEASE` sets entity to `"waiting"` so `COMPLETE` is silently skipped; entities loop forever (validation warning V38) | `"effect": ["RELEASE(Server)", "COMPLETE()"]` |
| **✗ Anti-Pattern: Null routing with prob 1.0** | (Avoid) Redundant — adds unnecessary complexity | `"effect": ["COMPLETE()"], "probabilisticRouting": [{ "queueName": null, "probability": 1 }]` |
| **✓ Valid: Probabilistic exit** | Genuine branching — some entities exit, some continue | `"probabilisticRouting": [{ "queueName": "Next Queue", "probability": 0.7 }, { "queueName": null, "probability": 0.3 }]` |

**Rule:** `COMPLETE()` releases the server automatically. On a terminal B-event, write `"effect": ["COMPLETE()"]` alone — no preceding `RELEASE()`. If `probabilisticRouting` contains only a single route with `probability: 1` and `queueName: null`, prefer replacing it with explicit `COMPLETE()` and no routing table.

---

### 13.2 Entity Lifecycle Completeness

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Complete lifecycle** | Every entity type has ARRIVE → service → COMPLETE/RENEGE path | `ARRIVE(Patient)` → `ASSIGN(Triage Queue, Nurse)` → `COMPLETE()` |
| **✗ Missing sink** | Entities arrive but never complete — queue grows indefinitely | `ARRIVE(Patient)` → `ASSIGN(...)` → no `COMPLETE()` or `RENEGE()` |
| **✗ Orphaned release** | Server released but entity not completed — not counted as served | `RELEASE(Server)` without `COMPLETE()` on terminal event |

**Rule:** Every model must have at least one ARRIVE source and at least one COMPLETE or RENEGE sink (validation V8).

---

### 13.3 Queue-to-Activity Binding (ADR-005)

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Correct `customerType`** | Queue `customerType` field matches the entity type `name` exactly — discipline honoured | Queue: `{ "name": "Waiting Room", "customerType": "Patient" }` → discipline applied correctly |
| **✗ Wrong `customerType`** | Queue `customerType` doesn't match any entity type name — discipline behaviour undefined | Queue: `{ "customerType": "Patients" }`, Entity: `"Patient"` — case mismatch, discipline not applied |

**Rule:** It is the queue `customerType` field that binds a queue to an entity type and governs discipline application — **not** the queue name. Queue names are free-form and do not need to match entity type names. Set `customerType` to exactly match the customer entity type's `name` (case-sensitive).

---

### 13.4 C-Event Priority & Restart Rule

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Explicit priorities** | Multiple C-Events compete for same resources — order matters | `priority: 1` for urgent, `priority: 2` for routine |
| **✗ All same priority** | C-Events fire in array order — may cause priority inversion | All C-Events at `priority: 1` or no priority field |
| **✗ Condition always true** | C-Event fires every pass — wastes C-scan cycles | `condition: "true"` or no condition on high-priority C-Event |

**Rule:** Lower priority number = higher priority. When a C-Event fires, the scan restarts from priority 1 (Three-Phase restart rule).

**Starvation rule:** Terminal C-events (discharge, checkout, exit) that share a resource with entry/mid-journey C-events must have priority ≤ those C-events. If a discharge C-event has priority=2 but a consultation C-event has priority=1 on the same resource, patients can never complete when the consultation queue is continuously populated — `served=0` results. Assign priority=0 to terminal C-events to prevent this.

---

### 13.5 Distribution Parameter Types

| Pattern | When to Use | Example |
|---|---|---|
| **✓ String parameters** | All distribution parameters as strings | `"distParams": { "mean": "5", "stddev": "2" }` |
| ** Numeric parameters** | (Invalid) Numbers instead of strings | `"distParams": { "mean": 5, "stddev": 2 }` |

**Rule:** All `distParams` values must be strings (e.g., `"5"` not `5`). The engine parses them internally.

---

### 13.6 Warm-up & Termination

#### Terminating vs Steady-State simulations

Choose the right run type for the system being modelled:

| Type | When to use | Warm-up | Example |
|---|---|---|---|
| **Terminating** | System has a natural start and end (e.g. one clinic day, one production shift) | `warmupPeriod: 0` | Hospital opening 08:00–18:00; model starts empty, ends when doors close |
| **Steady-state** | Assess long-run average behaviour of a system that runs continuously | `warmupPeriod > 0` | Call centre that always has customers; model must "fill up" before statistics are meaningful |

For steady-state runs, set `warmupPeriod` to approximately the time it takes the system to reach typical occupancy. A common heuristic is 10–20× the mean sojourn time. Statistics are only collected after the warm-up ends.

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Valid warm-up** | `warmupPeriod < maxSimTime` — statistics collected after warm-up | `warmupPeriod: 50`, `maxSimTime: 500` |
| **✗ Warm-up ≥ run time** | (Invalid V35) All statistics excluded — nothing measured | `warmupPeriod: 500`, `maxSimTime: 500` |
| **✓ Time termination** | Fixed-duration runs | `maxSimTime: 500` |
| **✓ Condition termination** | Stop when entity count reached | `terminationCondition: "summary.served >= 100"` in `experimentDefaults` |
| **✗ No termination** | (Warning V16) Run executes until cycle limit | No `maxSimTime` or `terminationCondition` |

**Rule:** Set either `maxSimTime` or `terminationCondition` (or both). Warm-up must be less than run duration (V35).

---

### 13.7 State Variable Namespaces

| Pattern | When to Use | Example |
|---|---|---|
| **✓ User variables** | Custom state variables with unique names | `name: "arrival_count"`, `name: "shift_active"` |
| **✗ Reserved namespace** | (Invalid V10) Collides with `Resource.*` or `Queue.*` | `name: "Resource.Nurse"`, `name: "Queue.Triage.length"` |

**Rule:** Do not name state variables with `Resource` or `Queue` prefix — these are reserved for engine-computed values.

---

### 13.8 Replication Configuration

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Valid replications** | One or more replications for statistical confidence | `replications: 10` |
| **✗ Zero replications** | (Invalid V34) No runs executed | `replications: 0` |
| **✓ Batch mode** | Multiple replications with aggregated CI | `replications: 20`, `liveDataMode: null` |
| **✓ Rolling mode** | Live data refresh per event — single replication | `replications: 1`, `liveDataMode: "rolling"` |

**Rule:** `replications` must be a positive integer ≥ 1. Use `replications: 1` for rolling live-data mode.

**How many replications?** Each replication uses an independent random seed — results are independent samples. More replications narrow the confidence interval. Guidelines:
- 5 replications: acceptable for quick feasibility checks
- 10 replications: minimum for reporting results
- 20–30 replications: recommended for systems with high variance or rare events (e.g. reneging, failures)
- 50+ replications: needed when estimating rare outcomes with confidence

**Seeds and reproducibility:** The engine uses a seeded pseudo-random number generator (Mulberry32). Each replication uses a different derived seed so results are statistically independent, but the full run is deterministic given the same model — re-running with the same settings produces identical output. This supports debugging and regression testing.

---

### 13.9 Effect Macro Syntax

| Pattern | When to Use | Example |
|---|---|---|
| **✓ RENEGE(ctx)** | Remove entity from queue with patience timeout | `RENEGE(ctx)` — uses current entity context |
| **✗ RENEGE(TypeName)** | (Invalid V25) Silently fails — no entity matched | `RENEGE(Patient)` — missing `ctx` |
| **✓ ASSIGN(queue, server)** | Bind entity from queue to server | `ASSIGN(Triage Queue, Nurse)` |
| **✗ ASSIGN with entity type** | (Invalid) Second arg must be server type, not entity | `ASSIGN(Patient Queue, Patient)` — should be `Nurse` |

**Rule:** `RENEGE` always takes `(ctx)` argument. `ASSIGN` second argument is the **server type**, not the customer type.

---

### 13.10 Routing Table Completeness (V29)

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Fallback route** | At least one route has no `when` predicate — catches all | One unconditional route, others conditional |
| **✗ All conditional** | (Warning V29) Entities matching no condition receive no service | All routes have `when` predicates — gaps possible |

**Rule:** When using conditional routing (`cSchedules[].when`), ensure at least one route has no `when` predicate as a fallback.

---

### 13.11 ARRIVE + probabilisticRouting Anti-Pattern

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Plain ARRIVE** | ARRIVE always routes to a queue via its effect syntax | `"effect": ["ARRIVE(Patient, Waiting Room)"]` — no `probabilisticRouting` |
| **✓ Split arrival streams** | Initial arrivals must be split by probability | Two B-events: `"ARRIVE(Patient, Urgent Queue)"` with mean `baseMean / 0.3`; `"ARRIVE(Patient, Routine Queue)"` with mean `baseMean / 0.7` |
| **✗ ARRIVE with probabilisticRouting** | (Invalid) ARRIVE creates entities and places them in a queue — routing tables are for B-events that already have an entity, not arrival events | `"effect": ["ARRIVE(Patient)"], "probabilisticRouting": [{"queueName": "A", "probability": 0.5}]` |

**Rule:** Never add `probabilisticRouting` to a B-event whose effect is `ARRIVE()`. ARRIVE events route via their effect argument `ARRIVE(Type, QueueName)`. If arrivals must be split probabilistically, create one ARRIVE B-event per stream and give each stream its own queue and schedule. For Exponential arrivals, scale each stream's mean inter-arrival time as `baseMean / probability`; for planned arrivals, use separate schedule rows or a multi-event CSV so each row belongs to the correct arrival B-event.

**Attribute guidance:** If the split implies attributes such as priority, severity, route, or class, declare those attributes in `entityTypes[].attrDefs` and set them at creation time on the stream-specific ARRIVE event, for example: `"effect": ["ARRIVE(Patient, Urgent Queue)", "SET_ATTR(priority, 1)", "SET_ATTR(severity, \"urgent\")"]`. Do not create a generic arrival and then probabilistically route it just to assign the class later.

---

### 13.12 Missing `useEntityCtx` on C-Event Schedules

| Pattern | When to Use | Example |
|---|---|---|
| **✓ useEntityCtx: true** | Always include when the target B-event operates on an entity | `"cSchedules": [{ "eventId": "b_complete", "useEntityCtx": true, "dist": "Exponential", "distParams": { "mean": "10" } }]` |
| **✗ Missing useEntityCtx** | (Common error) Without this flag, the B-event has no entity context — `COMPLETE()`, `RELEASE()`, and `RENEGE(ctx)` silently do nothing | `"cSchedules": [{ "eventId": "b_complete", "dist": "Exponential", "distParams": { "mean": "10" } }]` — no `useEntityCtx` |

**Rule:** Every `cSchedules[]` entry whose target B-event uses `COMPLETE()`, `RELEASE()`, `RENEGE(ctx)`, `SPLIT()`, `SET_ATTR()`, or `COST()` must have `"useEntityCtx": true`. Omitting it is the single most common LLM error.

---

### 13.13 Predicate Objects vs. Strings

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Predicate objects** | Always encode conditions as JSON predicate objects using dot-notation variables | `"balkCondition": { "variable": "Queue.Waiting Room.length", "operator": ">", "value": 5 }` |
| **✗ String expressions** | (Invalid CHK-011, CHK-012) Strings are not parsed as conditions — silently ignored or crash | `"balkCondition": "queue(Waiting Room).length > 5"` |
| **✗ Parenthesis variable syntax** | (Invalid) `queue(Name).length` is the C-event string format — invalid in predicate objects | `{ "variable": "queue(Waiting Room).length", ... }` — must be `"Queue.Waiting Room.length"` |

**Rule:** `balkCondition` and `routing[].condition` must be predicate objects `{ "variable": "...", "operator": "...", "value": ... }`, never string expressions. The `variable` field uses **dot notation only**:
- `Queue.QueueName.length` — current queue length (not `queue(Name).length`)
- `Entity.attrName` — entity attribute value
- `Resource.ServerType.status` — server status (`"IDLE"` or `"BUSY"`)

Valid operators: `==`, `!=`, `<`, `>`, `<=`, `>=`. The `value` field type must match the attribute's `valueType` (number for queue length, string for status).

---

### 13.14 `effect` as Array vs. Bare String

| Pattern | When to Use | Example |
|---|---|---|
| **✓ effect as array** | Always use a JSON array even for a single effect | `"effect": ["COMPLETE()"]` |
| **✗ effect as bare string** | (Invalid) The engine expects an array — a bare string breaks parsing | `"effect": "COMPLETE()"` |

**Rule:** The `effect` field must always be an array of strings, even when it contains only one macro. Use `"effect": ["COMPLETE()"]`, never `"effect": "COMPLETE()"`.

---

### 13.15 Queue-to-C-Event Binding (CHK-013)

Every queue that receives entities must have at least one C-event that consumes from it. A queue populated by `ARRIVE()`, `RELEASE()`, or routing with no consuming C-event will fill indefinitely — entities never leave.

| Pattern | When to Use | Example |
|---|---|---|
| **✓ Every fed queue consumed** | Each queue receiving entities has a C-event ASSIGN/DELAY/BATCH/COSEIZE | `ARRIVE(Patient, Triage Queue)` + C-event `ASSIGN(Triage Queue, Nurse)` |
| **✓ Resource-free queue consumed** | A queue feeding a no-resource wait is consumed by `DELAY`, not `ASSIGN` | `RELEASE(Nurse, Recovery Queue)` + C-event `DELAY(Recovery Queue)` |
| **✗ Orphan queue** | Queue receives entities but no C-event drains it — entities pile up | `RELEASE(Nurse, Discharge Bay)` + no C-event referencing `Discharge Bay` |

**Rule:** For every queue in `queues[]`, trace which B-event places entities into it (via `ARRIVE`, `RELEASE`, routing, or `defaultQueueName`) and confirm there is a C-event whose `effect` contains `ASSIGN(QueueName,...)`, `DELAY(QueueName)`, `BATCH(QueueName,N)`, `COSEIZE(QueueName,...)`, or `MATCH(…,QueueName,…)`. Multi-stage pipelines are the most common source of orphan queues: a stage-1 completion event `RELEASE(Nurse, Treatment Queue)` must always be paired with a stage-2 C-event `ASSIGN(Treatment Queue, Doctor)` — or, for a resource-free stage, `DELAY(Treatment Queue)`.

---

### 13.16 `scheduledTime` as String vs. Number

| Pattern | When to Use | Example |
|---|---|---|
| **✓ scheduledTime as string** | Always use a string value | `"scheduledTime": "0"`, `"scheduledTime": "9999"` |
| **✗ scheduledTime as number** | (Invalid V26) The engine expects string-encoded numeric values | `"scheduledTime": 0`, `"scheduledTime": 9999` |

**Rule:** Every `scheduledTime` field must be a string representation of a number (e.g., `"0"`, `"10.5"`). Engine validation V26 enforces this.

---

### 13.17 Queue Stability — Traffic Intensity Check

Before finalising any model, verify that each queue stage is stable. A queue is stable only when arrival rate < service capacity. If not, the queue grows without bound and the model runs until its cycle limit rather than reaching meaningful steady-state results.

**Traffic intensity formula for a single stage:** ρ = λ / (c × μ)

- λ = arrival rate (arrivals per time unit) = 1 / mean inter-arrival time
- c = number of servers at the stage
- μ = service rate = 1 / mean service time
- **ρ must be < 1** for a stable queue. ρ ≥ 1 means queue grows forever.

| Pattern | Condition | Example |
|---|---|---|
| **✓ Stable** | ρ < 1 — queue reaches steady state | λ=0.5/min, c=1, μ=0.8/min → ρ=0.625 |
| **⚠ High utilisation** | 0.8 ≤ ρ < 1 — stable but long waits | λ=0.9/min, c=1, μ=1/min → ρ=0.9 |
| **✗ Unstable** | ρ ≥ 1 — queue grows without bound | λ=1/min, c=1, μ=0.8/min → ρ=1.25 |

**Rule:** Always verify ρ < 1 for each service stage before generating the model. If a user's parameters imply ρ ≥ 1, flag this explicitly: *"With these parameters the queue is unstable — either increase servers (c), reduce arrival rate (λ), or decrease service time to bring ρ below 1."*

For multi-stage pipelines, check each stage independently. Bottleneck identification (the stage with highest ρ) is often the most valuable insight from a DES model.

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

- `model` (required): a simmodlr model JSON object matching the schema in §1–§13
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
`https://<your-simmodlr-url>/#model/<modelId>`

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

> **Important — a 201 response does NOT guarantee the model will run without errors.** The API checks 8 structural rules. The remaining 37+ rules (V5, V11–V15, V22–V45, all CHK-* checks) run when the engine starts a simulation. A model that imports successfully may still fail to run if, for example, a distribution parameter is numeric instead of a string (V5), a shift schedule starts after `maxSimTime` (V15), or a queue feeds no C-event (CHK-013). Always verify your generated model by running it in the UI after import.

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

For full integration guidance see `docs/simmodlr_RealTime_Integration_Guide.md`.

---

## Core Principle

An LLM generating a simmodlr model is **not done** when it has written JSON —
it is done when that JSON passes every blocking rule in §10. A model with any
blocking error is incomplete work. Return only valid models. If you cannot
produce a valid model, explain what is preventing you rather than returning a
broken one.
