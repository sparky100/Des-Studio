# Sprint 87 — Parameterised Weekly Schedule Patterns

**Sprint:** 87
**Theme:** Multiplier-based capacity patterns with sweep-variable base capacity
**Status:** ✅ Complete
**Branch:** `claude/sprint-87-multiplier-schedules`
**Completed:** 2026-06-30

---

## Goal

Weekly schedule patterns currently require absolute integer capacity values in the 7×24 grid (`periods[].capacity: 3`). Varying base server capacity for parametric experiments means manually recalculating all grid cells for each scenario. This sprint adds a **multiplier mode** that decouples the schedule shape (on/off pattern) from the capacity level (staffing count), enabling natural integration with parametric sweeps.

**Example workflow after this sprint:**
1. Define a pattern: day shift Mon–Fri `[1.0]`, night shift Mon–Fri `[0.67]`, weekends `[0.33]`
2. Set `baseCapacity = 6` nurses
3. Sweep `baseCapacity ∈ {6, 7, 8}` — pattern automatically scales

---

## Pre-Sprint Assessment

### What Already Exists

| Capability | Location | Robustness |
|---|---|---|
| Weekly repeating schedule patterns | `src/engine/schedule-pattern.js` | Full: `periods[]`, `exceptions[]`, `defaultCapacity` |
| Pattern expansion into SHIFT_CHANGE events | `src/engine/schedule-pattern.js:88-198` | Full: multi-week, exceptions, merge, sort |
| Pattern → initial capacity | `src/engine/index.js:291-305` | Full: `getPatternInitialCapacity` |
| Per-shift utilisation breakdown | `src/engine/index.js:1831-1860` | Full: `perShiftUtil` array per resource type |
| Schedule adherence sampling | `src/engine/index.js:1365-1377` | Full: live matchup vs desired capacity |
| Visual 7×24 grid editor | `src/ui/editors/WeeklyPatternEditor.jsx` | Full: click-drag, apply, clear, invert, exceptions |
| Validation V50–V56 | `src/engine/validation.js:1089-1196` | Full: capacity integer >= 0, overlap check, etc |
| Parametric sweeps (1D + 2D) | `src/engine/index.js` (sweep runners) | Full: model mutation before `buildEngine()` |
| Sweep variable interpolation | `src/engine/index.js` (`applySweepValues`) | Full: `{{var}}` syntax replaced in model JSON strings |
| LLM schedule awareness | `src/llm/prompts.js:97-110` | Full: period summaries in `extractResources` |
| Bundle export schedule columns | `src/llm/bundleExport.js:295` | Full: schedule pattern summary + adherence |
| Engine tests | `tests/engine/schedule-pattern.test.js` (401 lines) | Full: 22 test cases |
| Validation tests | `tests/engine/validation.test.js` (V50-V56) | Full: 22 test cases |
| UI component tests | `tests/ui/editors/weekly-pattern-editor.test.jsx` (189 lines) | Full: rendering, interaction, merge logic |
| DB round-trip tests | `tests/db/models.test.js` (lines 2030-2083) | Full: schedulePattern survives save/norm |

### What Is Missing

| Gap | Impact | Sprint |
|---|---|---|
| No multiplier mode for schedule patterns | Sweeping capacity requires manual grid recalc for every scenario | **87** |
| No `baseCapacity` field on entity type | No way to separate schedule shape from staffing level | **87** |
| No sweep variable support for base capacity | Cannot integrate multiplier patterns with parametric sweeps | **87** |
| Validation rules for multiplier mode | Non-integer capacities, missing baseCapacity, mode mismatch not caught | **87** |
| UI toggle for absolute vs multiplier mode | User has no way to switch modes or see which mode is active | **87** |
| UI grid for multiplier input | Grid needs to accept 0.0–1.0 float input instead of only integers | **87** |
| Engine resolution of multiplier → absolute | `expandWeeklyPatternToEvents` must receive resolved absolute capacities | **87** |
| LLM prompt awareness of multiplier mode | AI must know about the new mode and baseCapacity field | **87** |
| Documentation | Schema docs, user guide, engineering spec need updates | **87** |

---

## Scope Guardrails

- **Do not rewrite** the existing weekly pattern infrastructure. Multiplier mode is a pre-processing step that converts multipliers to absolute capacities before feeding the existing expansion pipeline.
- **No breaking changes** to existing models. `mode === "absolute"` is the default and behaves identically to current behaviour. Models without `mode` or `schedulePattern` are unchanged.
- **`expandWeeklyPatternToEvents` remains pure**. The resolution step (`multiplier × baseCapacity → absolute`) happens as a separate pure function called before expansion.
- **Sweep variables work naturally**. The sweep runner mutates `model_json` before `buildEngine()`. `baseCapacity` can use `{{var}}` syntax that gets replaced by the sweep runner, then the resolution step reads the final numeric value.
- **Floating-point rounding**. `actualCapacity = Math.round(baseCapacity × multiplier)` — always rounds to nearest integer. Warn if rounding would change capacity by >1 (e.g., 1.49 → 1 vs 1.5 → 2).
- **No new dependencies**. All numeric operations are plain JS.

---

## Architecture

### Schema Design

New optional fields on `schedulePattern`:

```json
{
  "entityTypes": [{
    "name": "Nurse",
    "role": "server",
    "schedulePattern": {
      "type": "weekly",
      "mode": "multiplier",
      "defaultCapacity": 0,
      "baseCapacity": 6,
      "periods": [
        { "dayOfWeek": 1, "start": "07:00", "end": "19:00", "capacity": 1.0 },
        { "dayOfWeek": 1, "start": "19:00", "end": "07:00", "capacity": 0.67 },
        { "dayOfWeek": 6, "start": "07:00", "end": "19:00", "capacity": 0.5 },
        { "dayOfWeek": 6, "start": "19:00", "end": "07:00", "capacity": 0.33 }
      ]
    }
  }]
}
```

**Fields:**
| Field | Type | Default | Description |
|---|---|---|---|
| `mode` | `"absolute"` \| `"multiplier"` | `"absolute"` | Whether `periods[].capacity` and `defaultCapacity` are absolute integers or 0–1 multipliers |
| `baseCapacity` | `number` \| `string` | `null` | Base capacity integer (or `{{var}}` sweep reference). Required when `mode === "multiplier"`. Ignored in `"absolute"` mode. |

### Engine Flow

```
model_json.entityTypes[].schedulePattern
    │
    ▼
resolveSchedulePattern(pattern)     ← NEW pure function in schedule-pattern.js
    │  if mode === "multiplier":
    │    resolve baseCapacity (number literal or sweep-interpolated)
    │    multiply each period.capacity by baseCapacity, round to integer
    │    set mode → "absolute" on the resolved copy
    │  if mode === "absolute" or absent:
    │    return pattern unchanged
    ▼
expandWeeklyPatternToEvents(resolvedPattern, epoch, ...)
    │  (existing code, unchanged)
    ▼
SHIFT_CHANGE events with absolute capacities
```

This two-phase design keeps `expandWeeklyPatternToEvents` pure and unchanged. The resolution function is called once during engine initialisation, after sweep variable substitution has already happened.

### Sweep Variable Integration

The existing sweep runner (`applySweepValues` in `index.js`) replaces `{{var}}` patterns in model JSON strings. `baseCapacity` accepts either:
- A number literal: `"baseCapacity": 6`
- A sweep variable reference: `"baseCapacity": "{{nurseCount}}"`

After sweep substitution, `baseCapacity` is always a number before `resolveSchedulePattern` sees it. If `baseCapacity` is still a string after sweep processing, validation V-NEW-1 blocks the run.

### UI Flow

```
WeeklyPatternEditor
    │  NEW: mode toggle (absolute/multiplier)
    │  NEW: baseCapacity input (number or {{var}})
    │
    ├── multiplier mode:
    │     grid cells accept float 0.0–1.0
    │     defaultCapacity accepts float 0.0–1.0
    │     cell display shows percentage (e.g., "100%", "67%")
    │     
    └── absolute mode:
          grid cells accept integer >= 0 (unchanged)
```

---

## Implementation Phases

### Phase 1 — Engine: `resolveSchedulePattern` (+ tests)
**Files:** `src/engine/schedule-pattern.js`, `tests/engine/schedule-pattern.test.js`

- Add `resolveSchedulePattern(pattern)` pure function
- If `mode === "multiplier"`:
  - Validate `baseCapacity` is a positive number (not a string — sweep already resolved it)
  - Multiply each `period.capacity` and `defaultCapacity` by `baseCapacity`, round to nearest integer
  - Return a new pattern object with `mode: "absolute"` and resolved capacities (immutable — never mutate the input)
- If `mode` is absent or `"absolute"`: return pattern unchanged (identity function)
- Write tests: multiplier resolves correctly, 0.5 rounds up, `baseCapacity=0` returns 0, preserves exceptions, immutable input, empty periods edge case

### Phase 2 — Engine: Integrate into `buildEngine` (+ tests)
**Files:** `src/engine/index.js`, `tests/engine/schedule-pattern.test.js`

- In the engine initialisation phase (before FEL setup), call `resolveSchedulePattern` on each entity type's `schedulePattern`
- The resolved pattern is used for all downstream operations (`expandWeeklyPatternToEvents`, `getPatternInitialCapacity`)
- Integration point: alongside `modelWithShiftInitialCapacity()` or in the model preparation step before `buildEngine`
- Write integration test: model with multiplier pattern → engine produces correct SHIFT_CHANGE events → server pool sizes match expected

### Phase 3 — Validation: New rules for multiplier mode (+ tests)
**Files:** `src/engine/validation.js`, `tests/engine/validation.test.js`

| Code | Rule | Severity |
|---|---|---|
| V-NEW-1 | `mode === "multiplier"` requires `baseCapacity` to be a positive number (not a string, not null, not undefined) | Blocking |
| V-NEW-2 | `mode === "multiplier"`: `periods[].capacity` must be a number 0.0–1.0 (inclusive) | Blocking |
| V-NEW-3 | `mode === "multiplier"`: `defaultCapacity` must be a number 0.0–1.0 (inclusive) | Blocking |
| V-NEW-4 | `mode` must be `"absolute"` or `"multiplier"` when present | Blocking |
| W-NEW-1 | Rounded capacity change > 1 (rounding warning — e.g., 0.33 × 6 = 1.98 → 2) | Warning |

### Phase 4 — UI: WeeklyPatternEditor multiplier mode
**Files:** `src/ui/editors/WeeklyPatternEditor.jsx`, `tests/ui/editors/weekly-pattern-editor.test.jsx`

- Add mode toggle (`"absolute"` / `"multiplier"`) above the grid
- When mode === `"multiplier"`:
  - Show `baseCapacity` input field (number type, plus {{var}} helper)
  - Change capacity input to accept float 0.0–1.0 with step 0.01
  - Display grid cell values as percentages (e.g., `67%` instead of `0.67`)
  - Display defaultCapacity input as percentage
- When mode === `"absolute"`:
  - Existing behaviour (integer >= 0, unchanged)
- Update `applySelection` to write correct capacity values based on mode
- Update `clearAllPeriods` to reset based on mode
- Write tests: toggle between modes, multiplier input validation, percentage display

### Phase 5 — UI: baseCapacity field in EntityTypeEditor
**Files:** `src/ui/editors/EntityTypeEditor.jsx`

- When `schedulePattern.mode === "multiplier"`, render a "Base capacity" input in the schedule section
- Accept number or `{{var}}` sweep variable reference
- `{{var}}` helper button inserts variable reference (reuses existing pattern from other sweep fields)
- Store value in `schedulePattern.baseCapacity`

### Phase 6 — LLM: Prompt and schema updates
**Files:** `src/llm/prompts.js`, `docs/model-schema-for-llm.md`

- Update `extractResources` in prompts.js to detect multiplier mode and include `baseCapacity` in the summary
- Update `model-schema-for-llm.md`:
  - Add `mode` and `baseCapacity` fields to SchedulePattern schema
  - Add multiplier usage examples
  - Add validation rules to §10

### Phase 7 — Documentation
**Files:** Various docs

- Update `docs/DES_Studio_Engineering_Spec.md` with multiplier resolution architecture
- Update `docs/DES_Studio_User_Guide.md` with multiplier mode workflow and screenshots
- Update `docs/help-reference.md` if it references capacity constraints
- Update `docs/decisions/ADR-018-calendar-scheduling.md` to note the mode extension

---

## Exit Gates

| Gate | How to verify |
|---|---|
| All 87-specific tests pass | `npm test -- schedule-pattern validation weekly-pattern-editor` (zero failures) |
| Full test suite passes | `npm test -- --run` |
| Production build succeeds | `npm run build` |
| Existing models unchanged | Load pre-Sprint-87 model with absolute pattern → runs identically |
| Multiplier model runs correctly | Create model with multiplier pattern, run → servers appear at expected capacity |
| Sweep integration works | Parametric sweep over `baseCapacity` → different server counts per run |
| Backward compatibility | Model without `schedulePattern` → no regression |
| UI renders correctly | Toggle modes, enter multipliers, apply, confirm grid displays percentages |

---

## Files Changed

| File | Change |
|---|---|
| `src/engine/schedule-pattern.js` | NEW: `resolveSchedulePattern()` function |
| `src/engine/index.js` | CALL: `resolveSchedulePattern` in engine init |
| `src/engine/validation.js` | NEW: V-NEW-1 through W-NEW-1 validation rules |
| `src/ui/editors/WeeklyPatternEditor.jsx` | MODIFY: mode toggle, float capacity, percentage display, baseCapacity input |
| `src/ui/editors/EntityTypeEditor.jsx` | MODIFY: baseCapacity field in schedule section |
| `src/contracts/model.ts` | MODIFY: add `mode`, `baseCapacity` to schedulePattern type |
| `src/llm/prompts.js` | MODIFY: multiplier/baseCapacity in extractResources |
| `docs/model-schema-for-llm.md` | MODIFY: add multiplier schema, examples, validation |
| `docs/DES_Studio_Engineering_Spec.md` | MODIFY: multiplier resolution architecture |
| `docs/DES_Studio_User_Guide.md` | MODIFY: multiplier workflow |
| `docs/decisions/ADR-018-calendar-scheduling.md` | MODIFY: note mode extension |
| `tests/engine/schedule-pattern.test.js` | ADD: resolveSchedulePattern tests |
| `tests/engine/validation.test.js` | ADD: V-NEW rules tests |
| `tests/ui/editors/weekly-pattern-editor.test.jsx` | ADD: multiplier mode tests |
