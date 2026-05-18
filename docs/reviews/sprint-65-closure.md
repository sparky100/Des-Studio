# Sprint 65 Closure Report — Actuals Tracking

**Sprint:** 65  
**Theme:** Actuals Tracking — plan deviation measurement and live schedule updates  
**Date closed:** 2026-05-18  
**Status:** Complete

---

## Delivered scope

| # | Item | Status |
|---|------|--------|
| 65-1 | `_plannedArrivalTime` stored on FEL entries for rows[]-based arrivals | ✅ |
| 65-2 | `entity._plannedTime` set from `felRef._plannedArrivalTime` in ARRIVE macro | ✅ |
| 65-3 | `engine.updateScheduledTime(entityId, newSimTime)` — FEL reschedule API | ✅ |
| 65-4 | `avgPlanDeviation` in `getSummary()` — average (actualTime - plannedTime) | ✅ |
| 65-5 | `ActualsStreamAdapter` — receives actual times via WebSocket or `pushUpdate()` | ✅ |
| 65-6 | `actualsStream` registered in `AdapterRegistry` | ✅ |
| 65-7 | `actualsStream` option added to `DataSourcesEditor` UI | ✅ |
| 65-8 | Report "Plan vs Actual" section (shown only when `avgPlanDeviation` is non-null) | ✅ |
| 65-9 | 10 unit tests (planned time tracking, FEL reschedule, deviation metric, adapter buffering) | ✅ |

---

## Key design decisions

### Schedule distribution returns interval, not absolute time
The Schedule sample function returns `max(0, plannedTime - clock + jitter)` — an interval relative to the current clock. `_plannedArrivalTime = clock + delay = plannedTime` (absolute). This is correct.

### _plannedTime is set at entity creation, not at scheduling time
The entity doesn't exist until the B-event fires. `_plannedTime` is copied from `felRef._plannedArrivalTime` when ARRIVE creates the entity. If `updateScheduledTime` is called before the B-event fires, the FEL entry's `_plannedArrivalTime` is frozen at the original planned time and the entity will receive the correct `_plannedTime` even after rescheduling.

### First arrival is not "planned"
The initial B-event fires at t=0 from the FEL initialisation (not from rows[]). Only subsequent arrivals (derived from rows[] sampling) receive `_plannedTime`. The first arrival's entity has `_plannedTime = undefined`.

### ActualsStreamAdapter buffers before engine attachment
If updates arrive (from WebSocket) before `attachEngine()` is called, they are buffered in `_queue` and flushed immediately when the engine is attached. This handles the case where the WebSocket connects before the simulation starts.

### avgPlanDeviation shows as null when no planned arrivals exist
Models without `rows[]` or `scheduleFeed` never set `_plannedTime` — `avgPlanDeviation` remains `null` and the "Plan vs Actual" section is omitted from the report.

---

## Files changed

| File | Change |
|------|--------|
| `src/engine/phases.js` | Added `_plannedArrivalTime` to FEL entries created from rows[] |
| `src/engine/macros.js` | Added `_plannedTime: felRef?._plannedArrivalTime` to entity creation in ARRIVE |
| `src/engine/index.js` | Added `avgPlanDeviation` to `getSummary()`; added `updateScheduledTime()` to engine API |
| `src/engine/adapters/ActualsStreamAdapter.js` | **New** — WebSocket actuals receiver with buffer + direct push |
| `src/engine/adapters/index.js` | Registered `actualsStream` type; imported `ActualsStreamAdapter` |
| `src/engine/adapters/types.js` | Added `actualsStream` to DataSource type union |
| `src/ui/ModelDetail.jsx` | Added `actualsStream` option to DataSourcesEditor type select |
| `src/reports/reportGenerator.js` | Added "Plan vs Actual" section to `buildResults()` |
| `src/engine/__tests__/actuals-tracking.test.js` | **New** — 10 tests |

---

## Test summary

```
src/engine/__tests__/actuals-tracking.test.js   10 tests  ✓
```

---

## Protocol note: actualsStream message format

```json
{ "entityId": "Alice", "actualTime": "2026-05-18T09:05:00" }
{ "entityId": "Bob",   "actualTime": 65 }
{ "type": "batch", "updates": [{ "entityId": "...", "actualTime": "..." }] }
```

`actualTime` may be a plain sim-time number, HH:MM string, or ISO 8601 datetime. ISO/HH:MM timestamps require `model.epoch` to be set (conversion via `parseTimeInput()`).

---

## Out of scope (future sprints)

- Full live-run mode: executing the engine in real-time with FEL updates mid-run (would require run loop changes)
- Actuals visualisation beyond the summary metric (e.g., per-entity deviation table in the report)
- `actualsStream` UI fields for message field mapping (currently uses fixed `entityId` / `actualTime` keys)
