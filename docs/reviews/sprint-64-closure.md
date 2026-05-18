# Sprint 64 Closure Report — Attribute-Conditional Service Times

**Sprint:** 64  
**Theme:** Attribute-Conditional Service Times via `when` on cSchedule entries  
**Date closed:** 2026-05-18  
**Status:** Complete

---

## Delivered scope

| # | Item | Status |
|---|------|--------|
| 64-1 | First-match `when` predicate semantics in `fireCEvent()` (phases.js) | ✅ |
| 64-2 | Legacy behaviour preserved — no `when` entries → all cSchedules fire as before | ✅ |
| 64-3 | V29 validation warning: all cSchedules have `when` but no fallback | ✅ |
| 64-4 | `when` field UI in `CEventEditor` — per-cSchedule toggle + `EntityFilterBuilder` | ✅ |
| 64-5 | Fallback label shown when some entries have `when` and one does not | ✅ |
| 64-6 | 7 engine unit tests for first-match semantics (attribute, numeric, compound AND) | ✅ |
| 64-7 | 2 validation unit tests for V29 | ✅ |

---

## Key design decisions

### First-match semantics, not parallel firing
When ANY cSchedule entry in the list has a `when` predicate, the engine uses first-match semantics: iterate the list in order, use the first entry whose predicate evaluates to `true` (or that has no `when`), ignore the rest. When NO entries have `when`, all entries fire — preserving the existing behaviour for models that don't use this feature.

### Last entry without `when` = fallback
By convention, placing an entry without `when` at the end of the list acts as the default case (equivalent to `else`). V29 warns if the entire list consists of conditional entries with no such fallback, since entities that don't match any condition would receive no service (silent miss).

### `evaluatePredicate` for `when` conditions
The `when` field uses the same predicate JSON format as entity routing (Addition 1 §4). The predicate evaluator operates on `Entity.<attrName>` variables resolved from the entity's current `attrs` object at the moment the C-event fires. This gives full attribute-based branching without dynamic code evaluation.

### Planned duration still not used
The plan (CSV, XLSX, scheduleFeed) provides arrival time and entity attributes. This sprint completes the loop: the `when` predicate matches entity attributes (e.g. `surgery_type == "hip"`) to a calibrated distribution (e.g. Lognormal mean=120). The model always derives service time from distributions — never from the plan.

---

## Files changed

| File | Change |
|------|--------|
| `src/engine/phases.js` | Added `when`-predicate resolution block before cSchedule processing loop |
| `src/engine/validation.js` | Added V29 warning (all cSchedules conditional, no fallback) |
| `src/ui/editors/CEventEditor.jsx` | Added `when` toggle + `EntityFilterBuilder` per cSchedule |
| `src/engine/__tests__/cschedule-when.test.js` | **New** — 9 tests |

---

## Test summary

```
src/engine/__tests__/cschedule-when.test.js   9 tests  ✓
All engine tests                             267 tests  ✓
```

---

## Validation codes added

| Code | Level | Message |
|------|-------|---------|
| V29 | Warning | C-event '...' has attribute-conditional cSchedules but no fallback entry |

---

## Example model pattern

```json
"cSchedules": [
  {
    "id": "cs1",
    "eventId": "b_hip_complete",
    "dist": "Lognormal",
    "distParams": { "mean": "120", "sd": "20" },
    "useEntityCtx": true,
    "when": { "variable": "Entity.surgery_type", "operator": "==", "value": "hip" }
  },
  {
    "id": "cs2",
    "eventId": "b_knee_complete",
    "dist": "Lognormal",
    "distParams": { "mean": "90", "sd": "15" },
    "useEntityCtx": true,
    "when": { "variable": "Entity.surgery_type", "operator": "==", "value": "knee" }
  },
  {
    "id": "cs3",
    "eventId": "b_generic_complete",
    "dist": "Exponential",
    "distParams": { "mean": "60" },
    "useEntityCtx": true
  }
]
```

The entity's `surgery_type` attribute — set by the schedule feed or CSV import — determines which B-event is scheduled and with which distribution.
