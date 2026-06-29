# Sprint 86 — Calendar-Aware Resource Scheduling

**Sprint:** 86
**Theme:** Recurring weekly capacity schedules with per-shift results transparency
**Status:** ⬜ Not started
**Branch:** `claude/sprint-86-calendar-scheduling`

---

## Goal

simmodlr currently models resource capacity as 24/7 always-on or via manually-entered absolute-time shift schedules (`shiftSchedule: [{ time: 480, capacity: 3 }]`). There is no concept of working days, weekly patterns, business hours, or cyclic capacity. A user modelling a clinic that operates Mon–Fri 08:00–18:00 must manually calculate every shift boundary as an absolute simulation time — 10 entries per week, repeated for the entire run duration.

Every major DES tool (AnyLogic, Simio, Arena, FlexSim) has first-class calendar and recurring schedule support. simmodlr has the foundations — `shiftSchedule`, `shiftBehavior`, `epoch`, and `clockUtils.js` — but no cyclic pattern layer.

This sprint delivers **weekly repeating capacity schedules** across the engine, UI, results, AI prompts, and documentation. The existing shift infrastructure is fully preserved — the new pattern layer expands into traditional `SHIFT_CHANGE` events at engine initialisation, reusing all existing shift machinery (`applyShiftChange`, `delay`/`preempt`/`suspend` behaviors, starvation tracking).

**What changes:** A server entity type can now declare a `schedulePattern` — a weekly grid (Monday–Sunday, 1-hour blocks) with per-block capacity, plus date-based exceptions. The engine expands this into `SHIFT_CHANGE` events using `epoch` for day-of-week alignment. Results surfaces show per-shift utilisation breakdown and schedule adherence. The LLM model builder and export bundle receive the pattern schema.

---

## Pre-Sprint Assessment

### What Already Exists

| Capability | Location | Robustness |
|---|---|---|
| Time-anchored shift schedules | `src/engine/index.js:262-272` (`getValidShiftSchedule`) | Full: `{ time, capacity }` → `SHIFT_CHANGE` events |
| Three shift-change behaviors | `src/engine/phases.js:40-141` (`applyShiftChange`) | Full: `delay`, `preempt`, `suspend` |
| Condition-triggered shifts (`when`) | `src/engine/index.js:278-340` | Full: predicate → C-event |
| Epoch ↔ wall-clock conversion | `src/engine/clockUtils.js` | Full: `simToWall`, `wallToSim`, `parseTimeInput` |
| `HH:MM` parsing | `src/engine/clockUtils.js:40-47` | Full: `clockUtils.parseTimeInput()` handles HH:MM |
| Starvation tracking per resource | `src/engine/index.js:1726-1765` | Full: cumulative & max duration |
| Per-resource utilisation | `src/engine/index.js:1726-1765` | Full: `perResource.{utilisation, starvationTime, ...}` |
| Live capacity display in UI | `src/ui/execute/BottomPanel.jsx:293-327` | Full: capacity count in stage KPIs |
| AI prompt shift awareness | `src/llm/prompts.js:70-101` (`extractResources`) | Full: windows array, shift period count |
| ADR-016 named timetable schedules | `src/db/models.js:1201-1411` | Full: separate `model_schedules` table |

### What Is Missing

| Gap | Impact | Sprint |
|---|---|---|
| No recurring/cyclic capacity schedules | Cannot model daily/weekly staffing without manual absolute-time entry | **86** |
| No day-of-week awareness in shift system | Shift times are pure abstract sim-time, not "09:00 Monday" | **86** |
| `epoch` not linked to shift system | `clockUtils.js` can convert epoch↔wall but shifts don't use it | **86** |
| No exception/override dates | Holiday schedules require manual entry for each date | **86** |
| No per-shift utilisation breakdown | Utilisation is aggregated across entire run, not segmented by shift | **86** |
| No schedule adherence metric | No insight into whether shift changes were delayed by `delay` behavior | **86** |
| Bundle export omits shift details | LLM receives incomplete capacity context | **86** |
| No weekly pattern editor UI | Flat `{ time, capacity }` list is the only way to enter shifts | **86** |
| Monthly/date-specific calendar patterns | Cannot model "first Monday" or "last Friday of month" | **87+** |
| Roster entities and crew assignment | Shareable shift plans across multiple resource types | **87+** |

---

## Scope Guardrails

- **Do not rewrite** the existing shift infrastructure. The pattern layer generates `SHIFT_CHANGE` events that feed the existing `applyShiftChange()` machinery.
- **No new dependencies.** No date-math library, no calendar widget library. All date/time logic uses `Date.prototype` and `clockUtils.js`.
- **Preserve backward compatibility.** Models without `schedulePattern` must behave identically to before.
- **All style values from `tokens.js`.** No hardcoded colours in the weekly pattern editor.
- **No direct Supabase queries in UI components.** New DB functions go through `src/db/models.js`.
- **No `Math.random()`** in schedule pattern expansion code.
- **Pure function.** `expandWeeklyPatternToEvents()` must be deterministic — same inputs always produce the same output.

---

## Architecture

### Schema Design

A new optional `schedulePattern` field on server `entityType` objects in `model_json`:

```json
{
  "entityTypes": [{
    "name": "Doctor",
    "role": "server",
    "count": "6",
    "shiftBehavior": "delay",
    "schedulePattern": {
      "type": "weekly",
      "defaultCapacity": 0,
      "periods": [
        { "dayOfWeek": 1, "start": "09:00", "end": "17:00", "capacity": 3 },
        { "dayOfWeek": 2, "start": "09:00", "end": "17:00", "capacity": 3 },
        { "dayOfWeek": 3, "start": "09:00", "end": "17:00", "capacity": 3 },
        { "dayOfWeek": 4, "start": "09:00", "end": "17:00", "capacity": 3 },
        { "dayOfWeek": 5, "start": "09:00", "end": "17:00", "capacity": 3 }
      ],
      "exceptions": [
        { "date": "2026-07-04", "label": "Independence Day", "periods": [
          { "start": "00:00", "end": "23:59", "capacity": 0 }
        ]}
      ]
    }
  }]
}
```

**Fields:**
| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Yes | Must be `"weekly"` |
| `defaultCapacity` | integer | No | Capacity when no period is active (defaults to 0) |
| `periods` | Period[] | Yes | Non-empty array of weekly time blocks |
| `exceptions` | Exception[] | No | Date-specific overrides |

**Period fields:**
| Field | Type | Description |
|---|---|---|
| `dayOfWeek` | integer | 1=Monday, 7=Sunday |
| `start` | string | HH:MM format (24-hour) |
| `end` | string | HH:MM format (24-hour, must be > start) |
| `capacity` | integer | Number of servers active during this period (0 = closed) |

**Exception fields:**
| Field | Type | Description |
|---|---|---|
| `date` | string | ISO 8601 date (`YYYY-MM-DD`) |
| `label` | string | Optional display name |
| `periods` | Period[] | Periods that apply on this date (replaces weekly pattern entirely for this date) |

### Data Flow

```
User defines weekly pattern in WeeklyPatternEditor
        ↓
schedulePattern stored in model_json.entityTypes[N].schedulePattern
        ↓
Engine init: makeShiftChangeEvents() detects schedulePattern
        ↓  calls expandWeeklyPatternToEvents(pattern, epoch, maxSimTime, timeUnit)
        ↓  uses clockUtils.simToWall(0, epoch) → Date → getDay() for day-of-week alignment
        ↓  generates SHIFT_CHANGE events for all period boundaries within [0, maxSimTime]
        ↓  merges with manually-defined shiftSchedule events (manual wins on collision)
        ↓
Existing SHIFT_CHANGE machinery handles them (phases.js, applyShiftChange)
        ↓
getSummary() adds perShiftUtil to each perResource entry
        ↓
ResultsWorkspace renders per-shift utilisation bar chart
```

### Engine Expansion Algorithm (pseudocode)

```
function expandWeeklyPatternToEvents(pattern, epoch, maxSimTime, timeUnit):
  if !epoch || !pattern?.periods?.length: return { events: [], warnings: [] }

  weekMs = 7 * 24 * 60 * 60 * 1000
  simWeek = weekMs / unitMs(timeUnit)  // e.g. 10080 minutes for minute-based sim
  epochDate = new Date(epoch)
  startDayOfWeek = epochDate.getDay()  // 0=Sun, 1=Mon, ... 6=Sat

  for each weekIndex from 0 to ceil(maxSimTime / simWeek):
    weekStart = weekIndex * simWeek
    for each period in pattern.periods:
      periodDaySim = (dayOfWeekToSimOffset(period.dayOfWeek, startDayOfWeek)) * dayDuration
      startTime = weekStart + periodDaySim + parseHHMM(period.start)
      endTime   = weekStart + periodDaySim + parseHHMM(period.end)

      if startTime > maxSimTime: continue
      events.push({ time: startTime, capacity: period.capacity })
      if endTime <= maxSimTime:
        events.push({ time: endTime, capacity: pattern.defaultCapacity ?? 0 })

  for each exception in pattern.exceptions:
    exceptionSimDay = dateToSimDay(exception.date, epoch, timeUnit)
    if exceptionSimDay == null: continue (warning)
    // Strip any events within the exception date's 24-hour window
    events = events.filter(e => e.time < exceptionSimDay || e.time >= exceptionSimDay + dayDuration)
    // Insert exception periods
    for each period in exception.periods:
      startTime = exceptionSimDay + parseHHMM(period.start)
      endTime   = exceptionSimDay + parseHHMM(period.end)
      events.push({ time: startTime, capacity: period.capacity })
      events.push({ time: endTime, capacity: pattern.defaultCapacity ?? 0 })

  // Merge consecutive events at the same time (last capacity wins)
  // Filter out events > maxSimTime
  // Sort by time
  // Convert to SHIFT_CHANGE event format
  return { events, warnings }
```

For a 30-day run with Mon–Fri 09:00–17:00, this generates ~40 `SHIFT_CHANGE` events. Negligible overhead.

---

## Feature Scope

| ID | Feature | Status | Files | Deliverable |
|---|---|---|---|---|
| F86.1 | Engine: Schedule pattern expansion | ⬜ | `src/engine/schedule-pattern.js` (new), `src/engine/index.js` (modify) | `expandWeeklyPatternToEvents()` pure function; integration into `makeShiftChangeEvents()` |
| F86.2 | Engine: Pattern-aware initial capacity | ⬜ | `src/engine/index.js` (modify) | `modelWithShiftInitialCapacity()` reads `defaultCapacity` or first period at t=0 |
| F86.3 | Engine: Exception override support | ⬜ | `src/engine/schedule-pattern.js` (new) | Date-based exceptions override weekly periods; date→sim-day via `clockUtils` |
| F86.4 | Engine: Per-shift utilisation tracking | ⬜ | `src/engine/index.js` (modify) | `getSummary()` adds `perShiftUtil` array to each `perResource` entry |
| F86.5 | Engine: Schedule adherence metric | ⬜ | `src/engine/index.js` (modify) | `scheduleAdherence` fraction in `perResource` |
| F86.6 | Validation: Cyclic schedule rules | ⬜ | `src/engine/validation.js` (modify) | V50–V56 new rules for pattern validation |
| F86.7 | UI: Weekly pattern editor | ⬜ | `src/ui/editors/WeeklyPatternEditor.jsx` (new), `src/ui/editors/index.jsx` (modify) | Visual 24×7 grid, block selection, capacity per block, exception date management |
| F86.8 | UI: Pattern vs manual toggle | ⬜ | `src/ui/editors/index.jsx` (modify) | "Use recurring schedule" checkbox; disables flat shift list when enabled |
| F86.9 | UI: Pattern disabled when no epoch | ⬜ | `src/ui/editors/index.jsx` (modify) | Toggle disabled with tooltip: "Requires Real-world start date (Epoch) to be set in experiment config" |
| F86.10 | Results: Per-shift utilisation chart | ⬜ | `src/ui/results/resultsViewModel.js` (modify), `src/ui/results/ResultsWorkspace.jsx` (modify) | New `buildShiftUtilizationSeries()`; bar chart section in Results |
| F86.11 | Results: Schedule adherence display | ⬜ | `src/ui/results/ResultsWorkspace.jsx` (modify), `src/ui/execute/BottomPanel.jsx` (modify) | Show adherence % in resource summary cards and live KPIs |
| F86.12 | LLM: Schema and prompt updates | ⬜ | `src/llm/prompts.js` (modify), `src/llm/bundleExport.js` (modify), `docs/model-schema-for-llm.md` (modify) | `extractResources()` includes pattern; system prompt references weekly patterns; bundle includes pattern summary |
| F86.13 | Tests | ⬜ | Multiple files (see Test Coverage) | ~36 new tests across engine, UI, and DB |
| F86.14 | Documentation | ⬜ | 6 doc files (see below) | User guide, engineering spec, product spec, model schema, help reference, ADR-017 |

---

## Detailed Technical Sections

### F86.1 — Schedule Pattern Expansion

**New file:** `src/engine/schedule-pattern.js`

```javascript
import { wallToSim, simToWall } from './clockUtils.js';

const DAY_OF_WEEK_MAP = { 1:0, 2:1, 3:2, 4:3, 5:4, 6:5, 7:6 }; // Mon=0, Sun=6 (JS-compatible)
const MS_PER_DAY = 86400000;
const MS_PER_WEEK = 604800000;

/**
 * Expand a weekly schedule pattern into an array of SHIFT_CHANGE events.
 * Pure function — deterministic, no side effects.
 * @param {object} pattern — schedulePattern from entityType
 * @param {string|null} epoch — ISO 8601 datetime string
 * @param {number} maxSimTime — simulation time limit
 * @param {string} timeUnit — 'minutes' | 'seconds' | 'hours'
 * @returns {{ events: Array<{scheduledTime, serverTypeName, newCapacity}>, warnings: string[] }}
 */
export function expandWeeklyPatternToEvents(pattern, epoch, maxSimTime, timeUnit = 'minutes') {
  // ... see algorithm above
}

/** Parse HH:MM string to minutes from midnight */
export function parseHHMM(str) {
  const parts = String(str).match(/^(\d{1,2}):(\d{2})$/);
  if (!parts) return NaN;
  return Number(parts[1]) * 60 + Number(parts[2]);
}

/** Convert a calendar date string to simulation day offset from epoch */
export function dateToSimDay(dateStr, epoch, timeUnit) {
  // ...
}
```

**Integration in `src/engine/index.js`:**

`makeShiftChangeEvents()` (currently at line ~302) gains a new block after the existing `shiftSchedule` processing:

```javascript
// If schedulePattern exists, expand it into SHIFT_CHANGE events
if (entityType.schedulePattern && entityType.schedulePattern.type === 'weekly') {
  const patternEvents = expandWeeklyPatternToEvents(
    entityType.schedulePattern,
    model.epoch,
    maxSimTime ?? Infinity,
    model.timeUnit ?? 'minutes'
  );
  for (const pe of patternEvents.events) {
    events.push({
      id: `pattern:${entityType.id || entityType.name}:${pe.scheduledTime}`,
      type: 'SHIFT_CHANGE',
      name: `Scheduled: ${entityType.name}`,
      scheduledTime: pe.scheduledTime,
      serverTypeName: entityType.name,
      newCapacity: pe.newCapacity,
    });
  }
  warnings.push(...patternEvents.warnings);
}
```

### F86.2 — Pattern-Aware Initial Capacity

`modelWithShiftInitialCapacity()` currently overrides `count` with `shiftSchedule[0].capacity`. When a `schedulePattern` exists:

1. If `shiftSchedule` also exists (manual overrides), `shiftSchedule[0].capacity` takes precedence
2. If no `shiftSchedule` but pattern exists: initial capacity = `pattern.defaultCapacity ?? 0`
3. If pattern has a period at day-of-week at t=0 (e.g., Monday 00:00 falls within a period), that period's capacity takes precedence over `defaultCapacity`

```javascript
function modelWithShiftInitialCapacity(model) {
  return {
    ...model,
    entityTypes: (model.entityTypes || []).map(entityType => {
      if (entityType.role !== "server") return entityType;
      const schedule = getValidShiftSchedule(entityType);
      if (schedule.length) return { ...entityType, count: schedule[0].capacity };
      if (entityType.schedulePattern?.type === 'weekly') {
        const initCap = getPatternInitialCapacity(entityType.schedulePattern, model.epoch, model.timeUnit);
        return { ...entityType, count: initCap };
      }
      return entityType;
    }),
  };
}
```

### F86.3 — Exception Override Support

Exception overrides flow through `expandWeeklyPatternToEvents()`:

1. Generate base weekly events for entire run duration
2. For each exception, compute the simulation day number from the exception date using `dateToSimDay(date, epoch, timeUnit)`
3. Strip any generated events that fall within `[exceptionDay, exceptionDay + dayDuration)`
4. Insert exception's own periods at the correct sim times
5. Re-sort and merge

**Edge cases:**
- Exception date before epoch: warning and skip
- Exception date after `maxSimTime`: skip (no effect)
- Multiple exceptions on the same date: processed in array order, last wins
- Exception that spans midnight (e.g., `23:00` → `01:00`): periods must not span past 23:59 — require `start > end` to be treated as multi-day (deferred — V54 rejects these for now with a clear message)

### F86.4 — Per-Shift Utilisation Tracking

**Tracking mechanism:**

Each server entity gets a `_currentShiftLabel` string field, set at the start of each shift period by `applyShiftChange()`. When a server becomes busy (SEIZE/ASSIGN), the current shift label is captured. At `getSummary()`, busy time is attributed to the shift period that was active when service started.

**Schema added to `perResource`:**

```javascript
// Inside perResource for each resource type:
perShiftUtil: [
  {
    label: "Mon 09:00-17:00",  // human-readable period label
    dayOfWeek: 1,
    start: "09:00",
    end: "17:00",
    plannedCapacity: 3,
    busyTimeSum: 1420,          // minutes across all servers of this type
    elapsed: 1440,              // minutes this shift was active
    utilisation: 0.49,          // busyTimeSum / (elapsed * plannedCapacity)
    completions: 12             // entities served during this shift
  }
]
```

**Implementation approach:**
- `applyShiftChange()` tags event with a `_shiftPeriodLabel` in `ctx.state` per server type
- When a server becomes busy (`seizeEntity` in `entities.js`), read current shift period and label from `ctx.state.__currentShift[serverTypeName]`
- Store on server object: `srv._shiftLabel`, `srv._shiftStart`
- At `getSummary()`, iterate all servers, aggregate busy time by `_shiftLabel`

**When no pattern is active (24/7 or manual shiftSchedule):** `perShiftUtil` is empty/omitted. Backward compat.

### F86.5 — Schedule Adherence

```javascript
scheduleAdherence: 0.95  // fraction of time actual capacity === planned capacity
```

**Computation:**
- Engine tracks `__desiredServerCapacity` (planned) vs actual entity count per server type
- At each time-series sample point, compare `actualCount` vs `__desiredServerCapacity`
- `adherence = sum(1 when equal) / totalSamples`
- Only computed when `schedulePattern` is set

### F86.6 — Validation Rules

Add to `src/engine/validation.js`:

| Code | Rule | Severity | Message |
|---|---|---|---|
| V50 | `schedulePattern.periods` must be non-empty when pattern exists | Blocking | `Server '{name}' schedulePattern must have at least one period.` |
| V51 | All `start` and `end` must be valid HH:MM with start < end, no overlapping periods per dayOfWeek | Blocking | `Server '{name}' schedulePattern has overlapping or invalid periods on day {n}.` |
| V52 | All `period.capacity` must be integer ≥ 0 | Blocking | `Server '{name}' period capacity must be integer ≥ 0, got {v}.` |
| V53 | `dayOfWeek` must be integer 1–7 | Blocking | `Server '{name}' dayOfWeek must be 1-7, got {v}.` |
| V54 | Exception `date` must be valid ISO 8601 date string | Blocking | `Server '{name}' exception date '{d}' is not a valid ISO date.` |
| V55 | `schedulePattern` requires `model.epoch` to be set | Blocking | `Server '{name}' defines a schedulePattern but no epoch is configured. Set a Real-world start date in experiment settings.` |
| V56 | Initial capacity is 0 — no servers will be created at simulation start | Warning | `Server '{name}' has initial capacity 0. No servers will exist at time 0. Use shiftBehavior 'preempt' or 'suspend' to handle work starting on shift arrival.` |

### F86.7 — Weekly Pattern Editor UI

**New component:** `src/ui/editors/WeeklyPatternEditor.jsx`

**State model:**

```javascript
const [pattern, setPattern] = useState({
  type: 'weekly',
  defaultCapacity: 0,
  periods: [],        // Array of { dayOfWeek, start, end, capacity }
  exceptions: []      // Array of { date, label, periods }
});
```

**Visual layout (conceptual):**

```
┌──────────────────────────────────────────────────────────────────┐
│ Recurring Weekly Schedule     [Use recurring schedule ✔]          │
├──────────────────────────────────────────────────────────────────┤
│ Default capacity when off-shift: [0 ▼]                           │
│                                                                  │
│     │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │ Sun │                  │
│─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤                  │
│ 00  │     │     │     │     │     │     │     │  ← click-drag    │
│ 01  │     │     │     │     │     │     │     │    to select     │
│ ... │     │     │     │     │     │     │     │                  │
│ 08  │ ███ │ ███ │ ███ │ ███ │ ███ │     │     │  ← capacity=3   │
│ 09  │ ███ │ ███ │ ███ │ ███ │ ███ │     │     │                  │
│ ... │     │     │     │     │     │     │     │                  │
│ 17  │ ███ │ ███ │ ███ │ ███ │ ███ │     │     │                  │
│ 18  │     │     │     │     │     │     │     │                  │
│ ... │     │     │     │     │     │     │     │                  │
│ 23  │     │     │     │     │     │     │     │                  │
│─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘                  │
│                                                                  │
│ Capacity for selected block: [3 ▲ ▼]    All selected: Mon-Fri    │
│                                       09:00-17:00 (3 servers)   │
│ [Clear All] [Invert Selection]                                   │
│                                                                  │
│ Exceptions: [+ Add Exception Date]                               │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ Jul 4 — Independence Day   Capacity: 0              [✕]      │ │
│ │ Feb 16 — Training Day      Capacity: 2  09:00-12:00 [✕]      │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Generate Preview] → Show next 7 days of shift events            │
└──────────────────────────────────────────────────────────────────┘
```

**Interactions:**
- Click-drag across cells to select a rectangular block of hour × day cells
- Selected cells get a capacity value (default `3`, can be changed via counter)
- Gray cells = off-shift (capacity=0), colored cells = active (color intensity = capacity level)
- Exception dates shown as overlays (hashed pattern for the affected day)
- "Generate Preview" button shows a panel with the generated SHIFT_CHANGE events for the first week, confirming what the engine will produce

### F86.8 — Pattern vs Manual Toggle

In `EntityTypeEditor.jsx`, the existing shift schedule section gets:

```jsx
<label>
  <input type="checkbox" checked={!!entityType.schedulePattern} onChange={...} />
  Use recurring weekly schedule
</label>
```

When checked:
- Pattern editor (`WeeklyPatternEditor`) renders
- Flat `shiftSchedule` time/capacity list is hidden
- A small read-only summary shows "Derived from weekly pattern"

When unchecked:
- Existing `shiftSchedule` editor renders (unchanged current behavior)
- Pattern is cleared or set to `undefined`

### F86.9 — Epoch Dependency Guard

The epoch requirement is validated at two levels:

1. **Editor**: When pattern checkbox is clicked but `model.epoch` is not set, show toast error: "A schedule pattern requires a Real-world start date. Go to Experiment Settings to set one." and check it remains off.

2. **Save time**: Validate V55 before save. Show inline error in editor if model tries to save with pattern but no epoch.

### F86.10 — Per-Shift Utilisation Results

**`resultsViewModel.js` — new builder:**

```javascript
export function buildShiftUtilizationSeries(summary, modelSnapshot) {
  if (!summary?.perResource) return [];
  const series = [];
  for (const [resourceType, data] of Object.entries(summary.perResource)) {
    if (!data.perShiftUtil || !data.perShiftUtil.length) continue;
    series.push({
      resourceType,
      shifts: data.perShiftUtil.map(s => ({
        label: s.label,
        utilisation: s.utilisation,
        plannedCapacity: s.plannedCapacity,
        busyTimeSum: s.busyTimeSum,
        elapsed: s.elapsed,
        completions: s.completions,
      })),
      adherence: data.scheduleAdherence,
    });
  }
  return series;
}
```

**`ResultsWorkspace.jsx` — new section:**

A "Per-Shift Utilisation" section appears in the Results workspace when `schedulePattern` data is present. It renders as a grouped bar chart — one bar per shift period per resource type, colour-coded by utilisation level.

Falls back to "Per-shift data is not available for this run" when no per-shift tracking exists (runs without patterns, or old results before this sprint).

### F86.11 — Schedule Adherence Display

**ResultsWorkspace:** Each resource summary card shows:
```
Doctor  ┌──────────────────────────────┐
        │ Utilisation:  78%            │
        │ Capacity pattern: weekly      │
        │ Schedule adherence: 95%   ✓   │
        └──────────────────────────────┘
```

**BottomPanel live view:** Resource rows include a small adherence indicator when pattern is active:
```
Doctor    Cap: 3  Use: 67%  Adh: 95%  Avg svc: 8.2m
```

### F86.12 — LLM Prompt Updates

**`prompts.js` — `extractResources()`:**

```javascript
if (server.schedulePattern?.type === 'weekly') {
  result.schedulePattern = {
    type: 'weekly',
    periodCount: server.schedulePattern.periods.length,
    summary: summarizePattern(server.schedulePattern),
    // e.g. "Mon-Fri 09:00-17:00 (3 staff), Sat-Sun closed"
  };
}
```

**`prompts.js` — `buildModelBuilderSystemPrompt()`:**

Add to the resource section:
> "For resources with recurring capacity patterns (e.g., Mon-Fri 09:00-17:00), use the `schedulePattern` field with type `weekly`. This defines capacity by day of week and time of day and repeats for the entire run duration. Use it instead of manual `shiftSchedule` entries for repeating patterns."

**`bundleExport.js`:**

Add a "Schedule" column to the entity types table in the resources section:
```
| Resource | Count | Utilisation | Capacity | Schedule             |
|----------|-------|-------------|----------|----------------------|
| Doctor   | 3 avg | 78%         | Weekly   | Mon-Fri 09:00-17:00  |
```

### F86.13 — Tests

#### Engine Tests (`tests/engine/schedule-pattern.test.js`, ~18 tests)

```
✓ expandWeeklyPattern generates correct SHIFT_CHANGE events for Mon-Fri 9-5 pattern
✓ events are generated within [0, maxSimTime] only; no events beyond limit
✓ consecutive events at the same time are merged (last capacity wins)
✓ exception date overrides correct day's events
✓ exception with capacity=0 generates no IN events for that day
✓ exception with extended hours generates correct events
✓ multiple exceptions on different dates all apply independently
✓ pattern without epoch returns empty events + warning
✓ initial capacity reads defaultCapacity when no period at t=0
✓ initial capacity reads first period's capacity when period covers t=0
✓ pattern with epoch offset (e.g., epoch is a Wednesday) correctly aligns days of week
✓ manual shiftSchedule override takes precedence over pattern at same time
✓ per-shift utilisation aggregates correctly across multiple servers of same type
✓ per-shift utilisation handles midnight-crossing shifts (deferred — validation rejects)
✓ schedule adherence = 1.0 when actual capacity matches planned always
✓ schedule adherence < 1.0 when delay behavior retains busy servers past shift boundary
✓ model without schedulePattern is unchanged (backward compat assertion)
✓ deterministic: same pattern + epoch produces identical events every time
```

#### Validation Tests (`tests/engine/validation.test.js`, ~10 additions)

```
✓ V50: empty periods → blocking error
✓ V51: overlapping periods on same day → blocking error
✓ V51: invalid HH:MM → blocking error
✓ V52: negative capacity → blocking error
✓ V53: dayOfWeek out of range → blocking error
✓ V54: invalid exception date → blocking error
✓ V55: pattern without epoch → blocking error
✓ V56: initial capacity 0 → warning (non-blocking)
✓ V51: valid non-overlapping Mon-Fri 9-5 passes validation
✓ exceptions with valid ISO dates pass validation
```

#### UI Tests (`tests/ui/editors/weekly-pattern-editor.test.jsx`, ~10 tests)

```
✓ renders weekly grid with 7 columns and 24 rows
✓ clicking and dragging cells creates a selected block
✓ changing capacity for selected block updates the period state
✓ "Add exception" shows exception date picker
✓ exception renders in the list with delete button
✓ pattern checkbox disabled when epoch not set (with explanation tooltip)
✓ "Clear All" resets all periods to empty
✓ "Invert Selection" toggles all cells (on→off, off→on)
✓ Generate Preview shows expected event count for first week
✓ pattern toggle saves correctly to model state
```

#### DB Round-Trip Tests (`tests/db/schedule-pattern-roundtrip.test.js`, ~3 tests)

```
✓ schedulePattern survives model save → load round-trip
✓ schedulePattern with exceptions survives round-trip
✓ schedulePattern null when not configured (backward compat)
```

### F86.14 — Documentation Updates

| Document | Action | Updates |
|---|---|---|
| `docs/simmodlr_User_Guide.md` | Modify | New "Recurring Weekly Schedules" section: screenshots of grid editor, how to set epoch, how exceptions work, how results display per-shift utilisation |
| `docs/simmodlr_Engineering_Spec.md` | Modify | `schedulePattern` schema table, expansion algorithm, per-shift tracking design, V50-V56 rule specs |
| `docs/simmodlr_Product_Spec.md` | Modify | Update "Full multi-shift rostering" from ❌ to partially addressed (weekly patterns complete; full rostering deferred) |
| `docs/addition1_entity_model.md` | Modify | Add `schedulePattern` to Entity Class schema table (Section 2), full sub-schema and examples |
| `docs/model-schema-for-llm.md` | Modify | Add `schedulePattern` type definition with examples and usage guidance |
| `docs/help-reference.md` | Modify | "Recurring Weekly Schedules" help entry |
| `docs/decisions/ADR-017-calendar-scheduling.md` | Create | Architectural record of key decisions |

---

## UI Change Details

### Entity Type Editor (EntityTypeEditor.jsx)

**Current:** "Use shift schedule" checkbox → flat list of `{ time, capacity }` rows.

**After:**
- "Use shift schedule" checkbox remains for manual entries (unchanged)
- New "Use recurring weekly schedule" checkbox below it
- When weekly pattern is active:
  - Flat shift list hidden (with note "Derived from weekly pattern")
  - WeeklyPatternEditor component renders in its place
  - Epoch missing indicator: if no `model.epoch`, pattern checkbox is disabled with tooltip
- Pattern checkbox and manual shift checkbox are mutually exclusive (turning one on clears the other)

### Model Detail — Experiment Settings

- No visible change needed — epoch field already exists
- May add a hint near the epoch field: "Required for recurring weekly schedules"

### Results Workspace

- New "Per-Shift Utilisation" section card, between "How busy are resources?" and "Where Are the Bottlenecks?"
- Shows grouped bar chart when data available
- Falls back to "Per-shift data is not available" when absent
- Each resource summary card gains "Schedule adherence: XX%" line

### Bottom Panel (Live View)

- KPI table rows for resources gain "Adh: XX%" next to utilisation

### Execute Activity Node

- No visible change for basic weekly pattern (capacity displayed as count)
- Node tooltip may show shift period label if available

---

## Export Format Strategy

Per the design decision:

```json
{
  "entityTypes": [{
    "schedulePattern": {
      "type": "weekly",
      "defaultCapacity": 0,
      "periods": [
        { "dayOfWeek": 1, "start": "09:00", "end": "17:00", "capacity": 3 }
      ]
    },
    "shiftSchedule": [
      { "time": 540, "capacity": 3 },
      { "time": 1020, "capacity": 0 }
    ]
  }]
}
```

On export: preserve `schedulePattern` as structured source of truth. Also include a computed `shiftSchedule` array (expanded for the full simulation duration) for backward compatibility and inspection.

On import: `schedulePattern` takes precedence if present. If only `shiftSchedule` exists (legacy model), it is used as-is with no pattern — existing behavior preserved.

---

## Deferred Scope

| Item | Reason | Target Sprint |
|---|---|---|
| Monthly/date-specific calendar patterns ("first Monday", "last Friday") | Requires date math beyond weekly cycle; weekly covers 80%+ of use cases | 87+ |
| Roster entities and crew assignment | New entity type concept — scope and ADR needed | 87+ |
| Capacity-as-function runtime evaluator | Event-based expansion is simple and correct; performance not yet a bottleneck | 87+ |
| Multi-resource coordinated shift plans | Reusable schedules across entity types; can be copy-pasted for now | 87+ |
| Queue drain on off-hours ("reject arrivals when capacity = 0") | Edge case; potential C-event pattern via `when Queue.X.length > N` | 87+ |
| Bi-weekly patterns (repeatEvery=2) | Weekly only for Sprint 86; schema supports `repeatEvery` as future extension | 87+ |
| DST transition handling | Requires tz-aware date handling; warn on DST dates in validation for now | 87+ |
| Overtime/dynamic capacity triggers via state | Already partially supported by `when` condition-triggered shift entries | 87+ |

---

## Acceptance Criteria

### F86.1 — Engine Expansion
- [ ] `expandWeeklyPatternToEvents()` returns correct `SHIFT_CHANGE` events for a Mon–Fri 09:00–17:00 pattern
- [ ] Events are bounded by `maxSimTime` — no events beyond
- [ ] Coincident events merged correctly (last capacity wins)
- [ ] Deterministic: identical inputs produce identical outputs

### F86.2 — Initial Capacity
- [ ] Server entity type with pattern and `defaultCapacity: 3` starts with 3 servers
- [ ] Server entity type with period covering t=0 uses that period's capacity (overrides default)
- [ ] Server entity type with `defaultCapacity: 0` starts with 0 servers (V56 warns)

### F86.3 — Exceptions
- [ ] Exception date overrides all events for that day
- [ ] Exception with `capacity: 0` generates no capacity events for that day
- [ ] Multiple exceptions handled correctly
- [ ] Exception before epoch → warning + skipped
- [ ] Exception after `maxSimTime` → skipped silently

### F86.4 — Per-Shift Utilisation
- [ ] `getSummary()` includes `perShiftUtil` array for resource types with patterns
- [ ] Each entry has `label`, `dayOfWeek`, `start`, `end`, `plannedCapacity`, `busyTimeSum`, `elapsed`, `utilisation`, `completions`
- [ ] `perShiftUtil` is omitted for resource types without patterns (backward compat)

### F86.5 — Schedule Adherence
- [ ] `scheduleAdherence` fraction is computed when pattern is active
- [ ] `scheduleAdherence` is omitted for resources without patterns

### F86.6 — Validation
- [ ] V50–V56 all implemented as blocking errors or warnings as specified
- [ ] Valid pattern passes with zero errors
- [ ] Each invalid pattern triggers the correct error code

### F86.7 — Weekly Pattern Editor
- [ ] Grid renders 24 rows × 7 columns
- [ ] Click-drag selects rectangular blocks
- [ ] Capacity input updates selected blocks
- [ ] Exception date management works (add, edit, delete)
- [ ] "Generate Preview" shows first week's events

### F86.8 — Pattern vs Manual Toggle
- [ ] Pattern checkbox and manual shift checkbox are mutually exclusive
- [ ] Pattern active → shift list hidden with note
- [ ] Manual active → pattern editor hidden

### F86.9 — Epoch Dependency
- [ ] Pattern checkbox disabled when model has no epoch
- [ ] V55 blocks save when pattern exists but no epoch

### F86.10 — Per-Shift Chart
- [ ] Results section appears when perShiftUtil data exists
- [ ] Section is absent/hidden when no per-shift data
- [ ] Bar chart renders shift period labels correctly

### F86.11 — Schedule Adherence Display
- [ ] Results resource cards show adherence %
- [ ] BottomPanel live KPIs show adherence for active pattern resources

### F86.12 — LLM Updates
- [ ] `extractResources()` surfaces pattern summary in prompt context
- [ ] System prompt references `schedulePattern` as a modelling option
- [ ] Bundle export includes schedule column in resources table

### F86.13 — Tests
- [ ] All ~36 new tests pass
- [ ] Full test suite passes with zero failures
- [ ] M/M/1 and M/M/c benchmarks exit 0

### F86.14 — Documentation
- [ ] User guide has weekly schedule section with screenshots
- [ ] Engineering spec has `schedulePattern` schema and algorithm
- [ ] ADR-017 recorded
- [ ] Product spec updated

---

## Implementation Order

```
Week 1                              Week 2
┌─────────────────────────┐         ┌─────────────────────────────┐
│ F86.1 Engine expansion   │         │ F86.7 Weekly grid UI        │
│ F86.6 Validation         │────┬───→│ F86.8 Pattern toggle        │
│ F86.2 Initial capacity   │    │    │ F86.9 Epoch guard           │
│ F86.3 Exceptions         │    │    └─────────────────────────────┘
│ F86.4 Per-shift tracking │    │    ┌─────────────────────────────┐
│ F86.5 Schedule adherence │    │    │ F86.10 Per-shift chart      │
└─────────────────────────┘    │    │ F86.11 Adherence display    │
                               │    └─────────────────────────────┘
                               │    ┌─────────────────────────────┐
                               │    │ F86.12 LLM prompts          │
                               │    │ F86.13 Tests (alongside)    │
                               │    │ F86.14 Documentation        │
                               │    └─────────────────────────────┘
                               │
                               └──── Write tests alongside every feature
```

**Recommended execution order (parallelisable batches):**

1. **Batch A** (F86.1 + F86.6): Engine core + validation — foundation. Test first.
2. **Batch B** (F86.2 + F86.3): Initial capacity + exceptions — builds on F86.1.
3. **Batch C** (F86.7 + F86.8 + F86.9): UI editor — enables user interaction.
4. **Batch D** (F86.4 + F86.5 + F86.10 + F86.11): Per-shift tracking + results — can run in parallel with Batch C.
5. **Batch E** (F86.12): LLM prompts — last, reads all new schema fields.
6. **Batch F** (F86.13): Write tests alongside each batch, not after. Final test sweep and doc review (F86.14) at end.

---

## Files Created / Modified Summary

| File | Action | Notes |
|---|---|---|
| `src/engine/schedule-pattern.js` | **Create** | `expandWeeklyPatternToEvents()`, `parseHHMM()`, `dateToSimDay()`, `summarizePattern()` |
| `src/engine/index.js` | Modify | Integrate expansion into `makeShiftChangeEvents()`, `modelWithShiftInitialCapacity()`, `getSummary()` per-shift tracking |
| `src/engine/validation.js` | Modify | Add V50–V56 validation rules |
| `src/engine/entities.js` | Modify | Optional: server `_shiftLabel` tag during seize |
| `src/engine/phases.js` | Modify | Optional: `applyShiftChange()` passes shift label for tracking |
| `src/ui/editors/WeeklyPatternEditor.jsx` | **Create** | Visual weekly grid editor component |
| `src/ui/editors/index.jsx` | Modify | Add pattern toggle checkbox; conditionally render WeeklyPatternEditor |
| `src/ui/results/resultsViewModel.js` | Modify | Add `buildShiftUtilizationSeries()` |
| `src/ui/results/ResultsWorkspace.jsx` | Modify | Add per-shift utilisation chart section and adherence display |
| `src/ui/execute/BottomPanel.jsx` | Modify | Add adherence % to resource KPI rows |
| `src/llm/prompts.js` | Modify | `extractResources()` pattern summary; system prompt references |
| `src/llm/bundleExport.js` | Modify | Schedule column in resources table |
| `tests/engine/schedule-pattern.test.js` | **Create** | ~18 engine tests |
| `tests/engine/validation.test.js` | Modify | Add V50–V56 test cases (~10) |
| `tests/ui/editors/weekly-pattern-editor.test.jsx` | **Create** | ~10 UI tests |
| `tests/db/schedule-pattern-roundtrip.test.js` | **Create** | ~3 DB round-trip tests |
| `docs/decisions/ADR-017-calendar-scheduling.md` | **Create** | Architectural record |
| `docs/simmodlr_User_Guide.md` | Modify | Weekly schedules section |
| `docs/simmodlr_Engineering_Spec.md` | Modify | Schema + algorithm |
| `docs/simmodlr_Product_Spec.md` | Modify | Capability gap status |
| `docs/addition1_entity_model.md` | Modify | Entity Class schema |
| `docs/model-schema-for-llm.md` | Modify | `schedulePattern` type |
| `docs/help-reference.md` | Modify | Help entry |
| `docs/DES_Studio_Build_Plan.md` | Modify | Sprint 86 entry |

---

## Architectural Decision — ADR-017

A new ADR will record:

- **Why expand-on-init** rather than runtime capacity function: simpler, reuses existing machinery, deterministic, no event explosion risk for realistic run durations
- **Why weekly patterns only** for Sprint 86: covers 80%+ of use cases, natural foundation for monthly/annual extensions
- **Why 1-hour grid blocks** rather than arbitrary minute resolution: simpler UI, sufficient granularity for shift planning, avoids time-entry complexity
- **Why export preserves both pattern + expanded events**: pattern preserves semantic intent for re-import; expanded events provide backward compat and inspection
- **No new dependencies**: all date/time logic uses `Date.prototype` and existing `clockUtils.js`
