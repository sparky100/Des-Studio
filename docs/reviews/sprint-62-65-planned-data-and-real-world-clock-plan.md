# Sprints 62–65 — Planned Data Import and Real-World Clock

**Date planned:** 2026-05-18
**Status:** Proposed
**Prerequisite:** Sprint 61 (real-time hardening and docs) complete

---

## Overview

Sprints 57–61 delivered live parameter feeds from external REST/WebSocket sources. This plan extends that foundation into a second major operational pattern: **planned data import** — where the simulation is driven by a concrete operational schedule (a theatre list, a shift roster, a vehicle dispatch plan) rather than statistical distributions alone.

Four capabilities are needed, each building on the last:

| Sprint | Theme | Key capability unlocked |
|---|---|---|
| 62 | Real-World Clock | Simulation time ↔ calendar datetime; reports show human-readable periods |
| 63 | Planned Data Import | CSV/XLSX with real timestamps; schedule feed API; named entity instances |
| 64 | Attribute-Conditional Service Times | Service duration derived from entity attributes (e.g. surgery type) via calibrated distributions |
| 65 | Actuals Tracking and Plan Deviation | Feed real start/completion times back; measure plan vs actual; power rolling mode for ops |

### Design principle

**The plan tells the model what arrives and when. The model tells the simulation how long service takes.**

Planned duration values must never be used directly as service times. The simulation's value comes from representing variability: a planned 120-minute operation might take 90 or 160 minutes on the day. Service time distributions should be calibrated from historical actuals per entity attribute combination (e.g. procedure type, acuity class). The import workflow carries attributes; the model carries distributions; the engine samples.

---

## Sprint 62 — Real-World Clock

**Branch:** `sprint-62`
**Prerequisite:** Sprint 61 complete (or can run in parallel — engine-independent)
**Theme:** Bridge simulation time and calendar time; enable timestamp-based planned data

### Motivation

Today, simulation time is abstract: t=0 to t=480 means nothing to a clinical manager. All values in the report read as "time units". There is no way to import a CSV with real timestamps (08:30, 10:45) without manual conversion. Shift schedule entries use opaque offsets.

Adding an optional `epoch` field maps t=0 to a real calendar moment. Everything else follows from this single anchor.

### Schema addition

```json
{
  "name": "Theatre List Model",
  "timeUnit": "minutes",
  "epoch": "2026-05-18T08:00:00"
}
```

`epoch` is an ISO 8601 datetime string. It is optional — models without it behave identically to today (fully backwards-compatible). `timeUnit` (already supported) defines the unit of one clock tick.

Two utility functions underpin everything:

```js
simToWall(t, epoch, timeUnit)
  → new Date(new Date(epoch).getTime() + t * unitMs[timeUnit])

wallToSim(dt, epoch, timeUnit)
  → (new Date(dt) - new Date(epoch)) / unitMs[timeUnit]
```

### Deliverables

| ID | Deliverable | File(s) |
|---|---|---|
| F62.1 | `simToWall()` / `wallToSim()` utility functions | `src/engine/clockUtils.js` (new) |
| F62.2 | `epoch` field in model schema — optional ISO datetime string | `docs/model-schema-for-llm.md`, `src/engine/validation.js` (V28) |
| F62.3 | Settings UI — date/time picker for epoch; shows "Simulation starts at" label; shows computed end time | `src/ui/ModelDetail.jsx` |
| F62.4 | CSV importer — detect ISO (`2026-05-18T08:30`) and `HH:MM` (`08:30`) values in time column; convert to sim time via `wallToSim()` when epoch is set; error if no epoch and timestamp detected | `src/ui/shared/planCsvParser.js` |
| F62.5 | Report cover — when epoch set, show "Simulation period: Mon 18 May 08:00 – 16:00" instead of "maxSimTime: 480" | `src/reports/reportGenerator.js` |
| F62.6 | Experiment controls — run period preview: "Mon 18 May 08:00–16:00" derived from epoch + maxSimTime | `src/ui/execute/ExperimentControls.jsx` |
| F62.7 | Shift schedule editor — accept `HH:MM` real times when epoch set; display existing offsets as real times | `src/ui/editors/EntityTypeEditor.jsx` |
| F62.8 | `clockUtils` unit tests | `src/engine/__tests__/clockUtils.test.js` |
| F62.9 | CSV importer timestamp tests — ISO, HH:MM, epoch required error, no-epoch unchanged | `src/ui/shared/__tests__/planCsvParser.test.js` |

### Acceptance criteria

- [ ] `simToWall(480, "2026-05-18T08:00:00", "minutes")` returns `2026-05-18T16:00:00`
- [ ] `wallToSim("2026-05-18T08:30:00", "2026-05-18T08:00:00", "minutes")` returns `30`
- [ ] CSV with `08:30` time column and model epoch imports correctly — `08:30` → t=30
- [ ] CSV with ISO timestamps and model epoch imports correctly
- [ ] CSV with timestamps and no epoch set shows a clear error on import (not silent)
- [ ] Report cover shows real period when epoch present; unchanged when absent
- [ ] Models without epoch field are identical to today — no regressions
- [ ] V28 validation: if `epoch` is set it must be a valid ISO 8601 datetime

---

## Sprint 63 — Planned Data Import

**Branch:** `sprint-63`
**Prerequisite:** Sprint 62 (epoch) complete

### Motivation

With epoch in place, the time conversion problem is solved. This sprint delivers the full planned data import workflow: richer file support (XLSX), named entity instances, and an API-based schedule feed for organisations with scheduling systems.

### Entity instance identity

A plan names specific people or cases: "Patient: Smith, J — Theatre 1 — Hip replacement". The engine works with entity *types*, not named instances. The solution is `entityId` — a reserved attribute populated from a `name` or `id` CSV/API column. It flows through the engine as a regular attribute, appears in trace output, and allows post-run matching of simulation results back to the original plan row.

`entityId` carries no special engine logic. It is convention only — stored and displayed like any other string attribute.

### Planned duration is not service time

When a CSV or API row includes a `planned_duration` or `expected_mins` column, the importer should import it as an **entity attribute**, not as a service time override. The correct model design uses attribute-conditional cSchedules (Sprint 64) to derive service time from attributes such as procedure type. A planned duration estimate carries no information about the *distribution* of outcomes, which is what the simulation needs.

### Schedule feed data source type

A new `dataSources` type, `"scheduleFeed"`, fetches an array of planned activities from a REST endpoint rather than a single scalar value. This is the integration point for hospital PAS systems, logistics scheduling APIs, and any operational planning tool that exposes a structured list.

```json
{
  "id": "ds_theatre_list",
  "label": "Theatre List — Monday",
  "type": "scheduleFeed",
  "url": "https://pas.hospital.nhs.uk/api/theatre-list/today",
  "authHeader": "Authorization",
  "authSecret": "{{env.PAS_TOKEN}}",
  "entityType": "Patient",
  "targetBEventId": "b_patient_arrives",
  "timeField": "startTime",
  "attrMap": {
    "patientName": "entityId",
    "surgeryType": "surgery_type",
    "surgeonName": "surgeon",
    "theatreRoom": "room"
  }
}
```

The adapter fetches the endpoint, converts each activity to an entry in the arrival B-event's `rows[]` (using `wallToSim()` for time conversion), and replaces the static schedule. The existing `rows[]` engine path handles execution from that point — no engine changes required.

### Deliverables

| ID | Deliverable | File(s) |
|---|---|---|
| F63.1 | XLSX file import — `xlsx` (SheetJS) parse; same preview/confirm flow as CSV | `src/ui/shared/planCsvParser.js` extended or `xlsxParser.js` new |
| F63.2 | `entityId` reserved attribute — documented convention; importer maps `name`/`id` column to it automatically | `src/ui/shared/planCsvParser.js`, `docs/model-schema-for-llm.md` |
| F63.3 | `ScheduleFeedAdapter` — fetch endpoint, parse activities array, convert timestamps using `wallToSim()`, build `rows[]` | `src/engine/adapters/ScheduleFeedAdapter.js` |
| F63.4 | `AdapterRegistry` — register `ScheduleFeedAdapter` for `type: "scheduleFeed"` | `src/engine/adapters/index.js` |
| F63.5 | Schedule feed data source UI — type selector exposes `scheduleFeed`; additional fields: entityType, targetBEventId, timeField, attrMap editor | `src/ui/ModelDetail.jsx` (data source form) |
| F63.6 | `attrMap` editor — key/value pairs mapping API response fields to entity attribute names | new small component |
| F63.7 | `model-schema-for-llm.md` — add `entityId` convention, `scheduleFeed` type, `attrMap`, `targetBEventId` | `docs/model-schema-for-llm.md` |
| F63.8 | User Guide — §6 planned data import: XLSX, timestamp conversion, entityId, schedule feed | `docs/simmodlr_User_Guide.md` |
| F63.9 | Vitest: `ScheduleFeedAdapter` — mock endpoint, assert rows[] shape, timestamp conversion, authSecret resolution | `src/engine/adapters/__tests__/` |
| F63.10 | Vitest: XLSX import — column mapping, header detection, entityId assignment | `src/ui/shared/__tests__/` |

### Acceptance criteria

- [ ] `.xlsx` file with `datetime`, `patient_name`, `surgery_type` columns imports correctly; timestamps converted to sim time; `patient_name` mapped to `entityId` attribute
- [ ] A model with a `scheduleFeed` data source runs in calibrated_batch mode; activities fetched from mock endpoint appear as arrivals at correct simulation times
- [ ] `attrMap` correctly remaps API field names to entity attribute names
- [ ] `planned_duration` column imported as entity attribute — never silently used as service time
- [ ] Missing epoch with timestamp data produces a clear error in the importer
- [ ] All Sprint 62 tests still pass

### Dependency

- `xlsx` (SheetJS) — `npm install xlsx` — MIT licence, browser-compatible, no native dependencies

---

## Sprint 64 — Attribute-Conditional Service Times

**Branch:** `sprint-64`
**Prerequisite:** Sprint 62 complete. Sprint 63 helpful but not required.

### Motivation

When a theatre list carries `surgery_type = "hip"`, the model needs to sample hip-replacement durations — not knee or general service times. Today, achieving this requires multiple near-identical C-Events, one per surgery type, each with its own condition and cSchedule. For ten procedure types this produces ten C-Events that differ only in one condition term and one distribution.

This sprint adds `when` conditions to individual `cSchedule` entries, allowing a single C-Event to select the correct service time distribution based on entity attributes.

### Schema extension

```json
{
  "id": "c_start_surgery",
  "name": "Start Surgery",
  "priority": 1,
  "condition": "queue(Theatre Queue).length > 0 AND idle(Surgeon).count > 0",
  "effect": "ASSIGN(Theatre Queue, Surgeon)",
  "cSchedules": [
    {
      "eventId": "b_surgery_done",
      "when": "entity.surgery_type == 'hip'",
      "dist": "Lognormal",
      "distParams": { "logMean": "4.7", "logStdDev": "0.3" }
    },
    {
      "eventId": "b_surgery_done",
      "when": "entity.surgery_type == 'knee'",
      "dist": "Lognormal",
      "distParams": { "logMean": "4.4", "logStdDev": "0.25" }
    },
    {
      "eventId": "b_surgery_done",
      "dist": "Lognormal",
      "distParams": { "logMean": "4.5", "logStdDev": "0.4" }
    }
  ]
}
```

**Selection rules:**
1. Evaluate `when` conditions in array order against the entity being served
2. Use the first entry whose `when` condition evaluates to `true`
3. The last entry (no `when`) is the fallback — used when no condition matches
4. If all entries have `when` and none match, the fallback distribution from `experimentDefaults` (or a model-level default) is used; a warning is emitted

`when` uses the same predicate evaluator as C-Event conditions. `entity.attrName` reads the attribute of the entity currently being served.

The absence of `when` on all entries (existing behaviour) is unchanged — the first and only entry is always used.

### Deliverables

| ID | Deliverable | File(s) |
|---|---|---|
| F64.1 | Engine: `when` condition evaluation in Phase C cSchedule sampling — select first matching entry | `src/engine/macros.js` (COSEIZE/ASSIGN macro) |
| F64.2 | Engine: fallback to last `when`-less entry; emit warning on no match | `src/engine/macros.js` |
| F64.3 | C-Event editor UI — per-cSchedule "Condition (when)" field; "(fallback)" label on last entry with no when | `src/ui/editors/CEventEditor.jsx` |
| F64.4 | "Add condition variant" button — inserts new cSchedule entry above the fallback | `src/ui/editors/CEventEditor.jsx` |
| F64.5 | Validation V29 — warn if all cSchedule entries have `when` (no fallback defined) | `src/engine/validation.js` |
| F64.6 | `model-schema-for-llm.md` — document `when` on cSchedule; update §6 C-Events with attribute-conditional example | `docs/model-schema-for-llm.md` |
| F64.7 | Vitest: `when` selection — correct distribution chosen for each attribute value; fallback used on no match; no-when unchanged | `src/engine/__tests__/` |
| F64.8 | Vitest: `when` with `paramSource` — `when` condition evaluation and live param fetch compose correctly | `src/engine/__tests__/` |

### Acceptance criteria

- [ ] Entity with `surgery_type = "hip"` uses the `when: "entity.surgery_type == 'hip'"` distribution
- [ ] Entity with `surgery_type = "appendix"` (no matching `when`) uses the fallback distribution
- [ ] Model with no `when` conditions on any cSchedule behaves identically to today — no regressions
- [ ] C-Event editor shows per-cSchedule when field; fallback entry is clearly labelled
- [ ] V29 warning fires when all cSchedule entries have `when` and no fallback is defined
- [ ] All Sprint 63 tests still pass

---

## Sprint 65 — Actuals Tracking and Plan Deviation

**Branch:** `sprint-65`
**Prerequisite:** Sprint 62 (epoch) and Sprint 59 (rolling mode) complete

### Motivation

With epoch in place and a schedule driving arrivals, the simulation can now be compared to reality in real time. When an operating theatre list is live, activities deviate from plan: a patient arrives late, a surgery overruns, a surgeon is called away. These actuals can be fed back to the simulation via WebSocket to:

1. Update the FEL — cancel or reschedule events that haven't fired yet when actual times are known
2. Track deviation — measure the difference between planned arrival time and actual arrival time
3. Power a rolling operations view — the simulation always runs slightly ahead of the real system, showing predicted queue build-up

### Actuals event contract

The actuals WebSocket feed sends messages of this shape:

```json
{
  "eventType": "actual_start",
  "entityId": "Smith_J_Hip",
  "actualTime": "2026-05-18T09:12:00",
  "attributes": {
    "delay_reason": "theatre_prep"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `eventType` | `"actual_start"` \| `"actual_complete"` | Whether the entity started service or completed |
| `entityId` | string | Must match the `entityId` attribute on an entity in the FEL |
| `actualTime` | ISO datetime | Converted to sim time via `wallToSim()`; used to update the FEL event time |
| `attributes` | object | Optional additional attributes merged onto the entity (e.g. delay reason) |

### Plan deviation metric

A new summary statistic `avgPlanDeviation` measures mean difference (in model time units) between a planned arrival time (from `rows[]`) and the actual arrival time (from actuals feed). Positive = later than planned; negative = earlier.

```js
avgPlanDeviation = mean(actualArrivalTime[i] - plannedArrivalTime[i])
```

Only entities with both a planned time and a recorded actual are included. This appears in the results summary and the HTML report.

### Deliverables

| ID | Deliverable | File(s) |
|---|---|---|
| F65.1 | Actuals WebSocket message handler — receives actual_start/actual_complete; resolves entityId to FEL entry; updates scheduled time | `src/engine/adapters/WebSocketAdapter.js` extended |
| F65.2 | FEL update API — `engine.updateScheduledTime(entityId, newSimTime)` — moves a B-event in the FEL without disrupting other events | `src/engine/index.js` |
| F65.3 | Planned time tracking — engine stores `_plannedTime` on entities with `rows[]` arrival; populated at ARRIVE | `src/engine/macros.js` |
| F65.4 | `avgPlanDeviation` in `getSummary()` — computed from entities with both `_plannedTime` and `_actualArrivalTime` | `src/engine/index.js` |
| F65.5 | Actuals data source config — `dataSources` entry with `type: "actualsStream"` pointing to the actuals WebSocket | `src/engine/adapters/types.js` |
| F65.6 | Report section — "Plan vs Actual" in the HTML report; shown only when `avgPlanDeviation` present; bar chart of planned vs actual per queue | `src/reports/reportGenerator.js` |
| F65.7 | Live run banner — shows actuals received count and current `avgPlanDeviation` | `src/ui/execute/` |
| F65.8 | `model-schema-for-llm.md` — document `actualsStream` source type; `avgPlanDeviation` in results summary | `docs/model-schema-for-llm.md` |
| F65.9 | Vitest: `updateScheduledTime()` — FEL reordered correctly; entity gets updated time | `src/engine/__tests__/` |
| F65.10 | Vitest: `avgPlanDeviation` — calculated correctly for a mix of on-time, late, and early entities | `src/engine/__tests__/` |

### Acceptance criteria

- [ ] Actuals WebSocket message with `entityId = "Smith_J_Hip"` and `actualTime = "09:12"` moves that entity's FEL arrival event to t=72 (given epoch 08:00)
- [ ] `avgPlanDeviation` correctly computed for a run with known planned and actual times
- [ ] `avgPlanDeviation` absent from summary when no actuals received (no nulls in report)
- [ ] Report shows "Plan vs Actual" section only when deviation data present
- [ ] Models without actuals feed behave identically to today — no regressions

---

## Cross-Sprint Dependencies

```
Sprint 62 (epoch)
   └─ Sprint 63 (planned import) — timestamp conversion requires epoch
   └─ Sprint 65 (actuals) — wallToSim for actual times requires epoch

Sprint 59 (rolling mode — existing plan)
   └─ Sprint 65 (actuals) — actuals update loop requires async FEL stepping

Sprint 57 (adapter layer — complete)
   └─ Sprint 63 (scheduleFeed adapter) — builds on AdapterRegistry pattern
   └─ Sprint 64 (when conditions) — independent; engine only

Sprint 64 (attribute-conditional cSchedules)
   — Can begin after Sprint 62; does not require Sprint 63
   — Becomes most useful when planned import delivers attribute-rich entities
```

Sprint 64 can begin in parallel with Sprint 63 if capacity allows — they touch different parts of the engine.

---

## Model JSON Example — Complete Planned Theatre List

This shows how all four sprint capabilities compose into a working model:

```json
{
  "name": "Operating Theatre — Monday List",
  "description": "Simulates the Monday theatre list to predict overrun risk and resource contention.",
  "timeUnit": "minutes",
  "epoch": "2026-05-18T08:00:00",
  "entityTypes": [
    {
      "id": "et_patient", "name": "Patient", "role": "customer", "count": 0,
      "attrDefs": [
        { "name": "entityId",    "valueType": "string",  "defaultValue": "" },
        { "name": "surgery_type","valueType": "string",  "defaultValue": "general" },
        { "name": "surgeon",     "valueType": "string",  "defaultValue": "" }
      ]
    },
    { "id": "et_surgeon", "name": "Surgeon", "role": "server", "count": 2, "attrDefs": [] }
  ],
  "queues": [
    { "id": "q_theatre", "name": "Theatre Queue", "customerType": "Patient", "discipline": "FIFO" }
  ],
  "bEvents": [
    {
      "id": "b_patient_arrives", "name": "Patient Arrives",
      "scheduledTime": "0", "effect": "ARRIVE(Patient, Theatre Queue)",
      "schedules": [
        {
          "eventId": "b_patient_arrives",
          "rows": [
            { "time": 30,  "attrs": { "entityId": "Smith_J",  "surgery_type": "hip",   "surgeon": "Jones"  } },
            { "time": 165, "attrs": { "entityId": "Patel_A",  "surgery_type": "knee",  "surgeon": "Jones"  } },
            { "time": 285, "attrs": { "entityId": "Brown_K",  "surgery_type": "general","surgeon": "Smith" } }
          ]
        }
      ]
    },
    { "id": "b_surgery_done", "name": "Surgery Complete", "scheduledTime": "9999", "effect": "COMPLETE()", "schedules": [] }
  ],
  "cEvents": [
    {
      "id": "c_start_surgery", "name": "Start Surgery", "priority": 1,
      "condition": "queue(Theatre Queue).length > 0 AND idle(Surgeon).count > 0",
      "effect": "ASSIGN(Theatre Queue, Surgeon)",
      "cSchedules": [
        { "eventId": "b_surgery_done", "when": "entity.surgery_type == 'hip'",
          "dist": "Lognormal", "distParams": { "logMean": "4.7", "logStdDev": "0.3" } },
        { "eventId": "b_surgery_done", "when": "entity.surgery_type == 'knee'",
          "dist": "Lognormal", "distParams": { "logMean": "4.4", "logStdDev": "0.25" } },
        { "eventId": "b_surgery_done",
          "dist": "Lognormal", "distParams": { "logMean": "4.5", "logStdDev": "0.4" } }
      ]
    }
  ],
  "dataSources": [
    {
      "id": "ds_theatre_list",
      "label": "PAS Theatre Feed",
      "type": "scheduleFeed",
      "url": "https://pas.hospital.nhs.uk/api/theatre-list/today",
      "authHeader": "Authorization",
      "authSecret": "{{env.PAS_TOKEN}}",
      "entityType": "Patient",
      "targetBEventId": "b_patient_arrives",
      "timeField": "startTime",
      "attrMap": {
        "patientName": "entityId",
        "surgeryType": "surgery_type",
        "surgeonName": "surgeon"
      }
    }
  ],
  "experimentDefaults": {
    "maxSimTime": 600,
    "warmupPeriod": 0,
    "replications": 20,
    "liveDataMode": "calibrated_batch"
  },
  "goals": [
    { "metric": "summary.avgWait", "operator": "<", "target": 15, "label": "Average wait under 15 minutes" }
  ]
}
```

---

## Summary

| Sprint | Focus | Engine changes | UI changes | New tests |
|---|---|---|---|---|
| 62 | Real-world clock | `clockUtils.js` (new) | Settings epoch picker, report cover, shift editor | ~12 |
| 63 | Planned data import | `ScheduleFeedAdapter` | XLSX upload, attrMap editor | ~15 |
| 64 | Attribute-conditional service times | `when` on cSchedules in macros.js | cSchedule when field, fallback label | ~10 |
| 65 | Actuals tracking | FEL update, `avgPlanDeviation` | Live banner, report section | ~12 |
