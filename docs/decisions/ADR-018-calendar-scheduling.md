# ADR-018: Calendar-Aware Recurring Resource Scheduling

**Date:** 2026-06-29
**Status:** Proposed
**Sprint:** 86

---

## Context

simmodlr currently models resource capacity as 24/7 always-on or via manually-entered absolute-time shift schedules (`shiftSchedule: [{ time: 480, capacity: 3 }]`). There is no concept of working days, weekly patterns, business hours, or cyclic capacity. A user modelling a clinic that operates Mon–Fri 08:00–18:00 must manually calculate every shift boundary as an absolute simulation time — 10 entries per week, repeated for the entire run duration.

The foundations exist:
- `shiftSchedule` on server entity types with `SHIFT_CHANGE` B-events
- `shiftBehavior` (delay/preempt/suspend) for capacity transitions
- `clockUtils.js` for epoch↔wall-clock conversion
- `epoch` field on model for real-world start time

What is missing is the **recurring pattern layer** — the bridge between "absolute sim-time shift change at t=540" and "open Monday to Friday, 9am to 5pm, repeat every week."

## Decision

We will add a `schedulePattern` field to server entity types that defines recurring weekly capacity schedules. The engine will **expand** the pattern into traditional `SHIFT_CHANGE` events at initialisation time using the model's `epoch` for day-of-week alignment.

### Core Design

1. **Schema**: A new optional `schedulePattern` object on server entity types with `type: "weekly"`, a `periods` array (day of week, start HH:MM, end HH:MM, capacity), `defaultCapacity` for off-hours, and an optional `exceptions` array for date-specific overrides.

2. **Engine expansion**: A pure function `expandWeeklyPatternToEvents(pattern, epoch, maxSimTime, timeUnit)` generates `SHIFT_CHANGE` events for each period boundary within `[0, maxSimTime]`. These feed into the existing `makeShiftChangeEvents()` pipeline and are handled by the unchanged `applyShiftChange()` machinery.

3. **UI**: A visual 24-row × 7-column grid editor (1-hour blocks per cell) for defining the weekly pattern, plus an exception date manager.

4. **Results**: Per-shift utilisation tracking segments busy time by the shift period that was active when service started.

### Schema

```json
{
  "schedulePattern": {
    "type": "weekly",
    "defaultCapacity": 0,
    "periods": [
      { "dayOfWeek": 1, "start": "09:00", "end": "17:00", "capacity": 3 }
    ],
    "exceptions": [
      { "date": "2026-07-04", "label": "Holiday", "periods": [
        { "start": "00:00", "end": "23:59", "capacity": 0 }
      ]}
    ]
  }
}
```

## Alternatives Considered

### A1. Runtime capacity function (evaluate `capacity(t)` on demand)

Instead of expanding patterns to events at init time, evaluate a function `capacity(t)` = `pattern[dayOfWeek(t)][timeOfDay(t)]` dynamically whenever a SEIZE or ASSIGN macro runs.

| Pro | Con |
|---|---|
| No event generation overhead | Requires changes to every macro that reads capacity |
| Supports arbitrarily long runs with zero memory cost | Breaks the existing shift-change event pipeline entirely |
| More flexible for real-time queries | Makes the trace log opaque — no SHIFT_CHANGE events to inspect |
| | Cannot reuse existing `delay`/`preempt`/`suspend` behavior machinery |
| | Harder to validate — capacity changes are implicit rather than explicit events |

**Rejected** because it rewrites the existing shift infrastructure rather than extending it, introduces risk to the SEIZE/ASSIGN hot path, and removes the auditability of explicit capacity change events.

### A2. Store expanded events at model edit time (pre-compute in UI)

Instead of expanding at engine init, pre-compute the SHIFT_CHANGE events in the UI when the user saves the pattern, storing them directly in `shiftSchedule`.

| Pro | Con |
|---|---|
| Engine unchanged — sees plain shiftSchedule | Pattern intent lost on export/re-import |
| Simpler engine integration | Changing maxSimTime requires re-expansion |
| | User cannot see the pattern structure when inspecting JSON |
| | Hard to debug — pattern is opaque after save |

**Rejected** because it discards the semantic meaning of the pattern. The pattern is the source of truth; the expanded events are a derived artefact.

### A3. AnyLogic-style calendar with date-math library

Full calendar with month/day/year awareness, DST handling, locale-specific week start days.

| Pro | Con |
|---|---|
| Maximum expressive power | Requires third-party date-math dependency |
| Handles real-world edge cases | Overkill for 80%+ of use cases |
| Locale-aware week start | Major UI complexity |

**Deferred** to Sprint 87+. Weekly patterns cover the common case. Monthly/date-specific patterns can be added as a `type: "monthly"` extension to the same `schedulePattern` schema.

### A4. Collapsed time blocks (arbitrary duration per cell)

Allow users to draw blocks of any duration (e.g., a single cell spanning 09:00–17:00) instead of 1-hour grid cells.

| Pro | Con |
|---|---|
| Less clicking for simple patterns | More complex drag interaction |
| Matches how shifts are conceptually described | Conflicts with validation — overlapping blocks harder to check |

**Deferred.** The 1-hour grid is simpler to implement and sufficient for shift planning. Future sprints can add arbitrary-duration cell merging as a UI convenience layer over the same underlying schema.

## Consequences

### Positive

- **Backward compatible**: models without `schedulePattern` behave identically. The existing `shiftSchedule` array continues to work as before.
- **No new dependencies**: all date/time logic uses `Date.prototype` and existing `clockUtils.js`.
- **Reuses existing shift infrastructure**: `applyShiftChange()`, `delay`/`preempt`/`suspend` behaviors, starvation tracking — all unchanged.
- **Deterministic**: same pattern + epoch + maxSimTime produces identical events every time.
- **Auditable**: expanded `SHIFT_CHANGE` events appear in the engine trace log alongside any other event.
- **Export preserves intent**: `schedulePattern` is stored as structured data in model JSON. An expanded `shiftSchedule` is also included for backward compat on import.

### Negative

- **Event count scales with run duration**: a 6-month run with daily patterns generates ~1,040 events (26 weeks × 10 boundaries × 4 periods/day). For very long run durations this could approach event queue pressure. The current event model handles hundreds of thousands of events without issue — this is not expected to be a bottleneck.
- **Requires epoch**: the user must set a real-world start date for day-of-week alignment. The UI enforces this by disabling the pattern checkbox when epoch is not set.
- **DST ambiguity**: clocks changing forward/backward is not handled. Validation warns if an exception date falls on a DST transition day. Full DST support is deferred.

### Rules Added to AGENTS.md

- `schedulePattern` on server entity types defines recurring weekly capacity. When present, the engine expands it into SHIFT_CHANGE events at init time.
- `schedulePattern.type` must be `"weekly"` for Sprint 86. Future sprints may add `"monthly"` or `"custom"`.
- The model's `epoch` field is required when `schedulePattern` is set (enforced by V55).
- The export format preserves both `schedulePattern` (structured intent) and `shiftSchedule` (expanded events for backward compat).
- Per-shift utilisation tracking (`perShiftUtil`) is only computed when `schedulePattern` is present.

## Open Questions

- Should bi-weekly patterns (repeatEvery=2) be expressible? The current schema has no `repeatEvery` field — it assumes weekly. This could be added later as an optional numeric field on `schedulePattern`.
- Should overnight shifts (start > end, meaning "spans midnight") be supported? Currently rejected by validation. Could be added as a future extension with multi-day period support.
- Should the weekly grid support half-hour granularity? 1-hour blocks were chosen for the initial UI; the underlying schema supports arbitrary HH:MM so half-hour blocks could be unlocked in a future UI iteration.
