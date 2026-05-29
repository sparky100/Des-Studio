# Sprint 74 — UI Improvements: Editors, Navigation & Import/Export

**Sprint:** 74  
**Theme:** Editor usability, bidirectional navigation, and model import/export parity  
**Status:** ✅ Complete | **Completed:** 2026-05-29  
**Branch:** `claude/ui-improvements-may26`

---

## Goal

A collection of targeted UI improvements identified during real-model usage (Glasgow Central model import, mobile use, schedule authoring). Focused on three areas: editor UX consistency, navigation between linked model elements, and closing silent data-loss gaps in model import/export.

---

## Delivered Features

### Editor collapse/search (all four editors)

All four structured editors — B-Events, C-Events, Entity Types, Queues — now follow a consistent collapsed-card pattern:

- Cards collapsed by default; chevron (▸/▾) expands/collapses each card
- Filter bar appears when ≥ 2 items exist; filters by name with instant results
- Filtering auto-expands matching cards
- "Expand all / Collapse all" controls
- New item auto-expands on creation
- Collapsed card shows a summary chip (effects, condition, role/attrs, discipline)

**Files:** `src/ui/editors/BEventEditor.jsx`, `CEventEditor.jsx`, `EntityTypeEditor.jsx`, `QueueEditor.jsx`

---

### Bidirectional navigation: B-Events ↔ Named Schedules

Clicking the green schedule badge on a B-event schedule entry navigates to the Schedules tab and focuses that schedule. Clicking a B-event name in a schedule's "Event Links" list navigates to the B-Events tab and focuses that card.

- New state in `ModelDetail`: `focusBEventId`, `focusScheduleId`
- Both editors implement `cardRefs` + `useEffect` scroll-into-view on focus
- `onGoToSchedule` / `onGoToBEvent` props wired through ModelDetail

**Files:** `src/ui/ModelDetail.jsx`, `BEventEditor.jsx`, `src/ui/editors/ScheduleManager.jsx`

---

### Bidirectional navigation: B-Events ↔ C-Events

Expanded B-event cards show a "TRIGGERED BY" row listing every C-event that schedules them. Each name is a clickable chip that switches to the C-Events tab and scrolls to that card.

In a C-event's cSchedule row, the B-event name is a clickable `→` button that navigates to that B-event.

- New state in `ModelDetail`: `focusCEventId`
- `CEventEditor` gains `cardRefs`, `useEffect` scroll effect, `onGoToBEvent` prop
- `BEventEditor` gains `onGoToCEvent` prop

**Files:** `src/ui/ModelDetail.jsx`, `BEventEditor.jsx`, `CEventEditor.jsx`

---

### Jitter controls for named-schedule entries

When a B-event schedule entry uses a named schedule (`scheduleRef`), jitter was silently unavailable (the green badge replaced DistPicker). Now:

- A JITTER row appears below the green badge: None / Normal / Uniform select
- Normal exposes mean + σ; Uniform exposes min + max
- Stored as `jitterDist` / `jitterParams` directly on the schedule entry
- `phases.js` merges these into `baseParams` alongside resolved `rows[]`

**Files:** `src/ui/editors/BEventEditor.jsx`, `src/engine/phases.js`

---

### Multi-event CSV import format

`planCsvParser.js` now supports a second CSV format where the first column is the event name (header: `event`, `eventId`, `event_id`, `b_event`, `bevent`, or `b-event`):

```
event,time,attr1,attr2
WCML,321,HL0001,wcml
Caledonian,20,CN0001,cal
```

Returns `{ format:'multi', groups:[{eventId,rows}], attrHeaders, skipped }`.

`ScheduleManager` detects `format:'multi'`, shows a per-group preview table (✓ matched / ⚠ unmatched), and optionally creates stub B-events for unmatched event names.

**Files:** `src/ui/shared/planCsvParser.js`, `src/ui/editors/ScheduleManager.jsx`

---

### Import/export parity fixes

Three silent data-loss gaps closed:

1. **`goals` and `containerTypes` missing from export** — `ModelDetail.jsx` `MODEL_JSON_KEYS` now matches `utils.js` (`goals` and `containerTypes` added).
2. **`containerTypes` not passed to `BEventEditor`** — FILL/DRAIN effects now available in the editor when the model has containers.
3. **Orphan `scheduleRef` on import** — `extractImportedModelPayload()` now strips `scheduleRef` from any schedule entry that has no inline `rows[]`, preventing the green badge appearing with no accessible data.

**Files:** `src/ui/ModelDetail.jsx`, `src/ui/editors/BEventEditor.jsx`, `src/ui/shared/utils.js`

---

### Mobile: visual designer hidden

The "Draw" tab is excluded from the mobile `DISPLAY_MODES` (viewport < 720px). The visual designer canvas is unusable on small screens. Design mode on mobile now defaults to the B-Events tab.

**File:** `src/ui/ModelDetail.jsx`

---

### Inline → named schedule migration shortcut

When a B-event schedule entry has inline `rows[]` but no `dist` (legacy format), a "Move to named schedule →" button appears. Clicking it navigates to the Schedules tab, where the user can import or create a named schedule. The inline data is synthesised into a Schedule dist so DistPicker renders correctly rather than falling back to Exponential.

**Files:** `src/ui/editors/BEventEditor.jsx`

---

## Tests

All 317 existing tests pass. No new tests added (UI-only changes; existing engine and parser tests cover the modified code paths).

---

## Schema / Contract Changes

| Field | Location | Notes |
|---|---|---|
| `sched.jitterDist` | `model_json.bEvents[].schedules[]` | Optional. `"Normal"` or `"Uniform"`. Merged into `baseParams` by `phases.js`. |
| `sched.jitterParams` | `model_json.bEvents[].schedules[]` | `{ mean, stddev }` for Normal; `{ min, max }` for Uniform. |
| `MODEL_JSON_KEYS` | `ModelDetail.jsx` + `utils.js` | Must stay in sync. Canonical list: `["entityTypes","stateVariables","bEvents","cEvents","queues","graph","experimentDefaults","goals","containerTypes"]` |

---

## Exit Gate

- [x] All four editors show collapse/search with consistent behaviour
- [x] B-event → Schedule navigation and return navigation both work
- [x] B-event → C-event navigation and return navigation both work
- [x] Jitter controls appear and save correctly for named-schedule entries
- [x] Multi-event CSV import works with match/stub flow
- [x] `goals` and `containerTypes` survive a full export → import cycle
- [x] Mobile viewport does not show Draw tab
- [x] `npx vitest run` — 317/317 pass
