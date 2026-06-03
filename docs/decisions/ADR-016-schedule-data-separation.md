# ADR-016: Separate Timetable Schedule Data from Core Model JSON

**Date:** 2026-05-27
**Status:** Accepted
**Sprint:** Sprint 73 (2026-05-27)
**Decided by:** Architecture review

---

## Context

### The problem

simmodlr models that represent real operational systems embed full
timetable data directly inside `model_json`. For Glasgow Central station
the breakdown is:

| Section | Size | Share |
|---|---|---|
| 5 × arrival bEvent timetables (`bEvent.schedules[].rows[]`) | 278 KB | 96.5% |
| Core DES logic (entityTypes, cEvents, queues, graph, completion bEvents) | 14 KB | 3.5% |
| **Total `model_json`** | **289 KB** | |

The timetable consists of 1,100 individual train-movement rows across
five routes, each row carrying absolute simulation time plus per-arrival
attributes (`train_id`, `route_group`, `platform_group`, etc.).

This has cascading effects throughout the application:

1. **Save performance.** Every `simulation_runs` INSERT carries
   `results_json._model_snapshot` which embeds the full model. A
   Supabase INSERT of ~300 KB pushed save times above 30 s and triggered
   unhealthy-warming alerts. (Partially mitigated in the glasgow-supabase-
   save-perf branch by guarding snapshot behind `detailLevel === "full"`,
   but the root cause remains in `des_models.model_json`.)

2. **Model library load time.** `fetchModels` transfers the full
   `model_json` for every model in the library, even though the timetable
   is never displayed in the model card.

3. **Snapshot bloat.** A version snapshot or run-record snapshot embeds
   278 KB of timetable that changes independently of the DES logic.

4. **Timetable rigidity.** One model can only hold one timetable. Running
   the same station model under a weekend, Bank Holiday, or engineering-
   works timetable requires duplicating the entire 289 KB model.

5. **Write amplification.** Saving, versioning, or sharing a model with
   only a logic change re-stores the full timetable payload.

6. **No first-class editing.** The timetable rows are buried inside the
   bEvent editor alongside the DES logic. There is no dedicated view for
   reading or editing a schedule as a coherent object — a modeller cannot
   see "what trains run today" without navigating the raw event list.

### What the data looks like

An arrival bEvent currently stores its timetable inline:

```json
{
  "id": "b_wcml_train_arrives",
  "name": "WCML Motherwell Train Arrives",
  "effect": ["ARRIVE(Train, WCML Motherwell Approach Queue)"],
  "scheduledTime": "0",
  "schedules": [
    {
      "eventId": "b_wcml_train_arrives",
      "rows": [
        { "time": 321, "attrs": { "train_id": "HL0001", "route_group": "wcml_motherwell", "platform_group": "long_distance", ... } },
        { "time": 329, "attrs": { "train_id": "HL0002", ... } }
        // ... 218 more rows
      ]
    }
  ]
}
```

The engine processes `rows[]` in `phases.js` via the `topLevelData`
merge path (line 272), treating the Schedule distribution as a
deterministic time-series. This mechanism is sound and is kept unchanged.

### What is NOT timetable data

Not all `bEvent.schedules[]` entries contain `rows[]`. Completion and
reneging schedules carry `{ dist, distParams }` only and are part of
the service-process logic, not the timetable. These stay in `model_json`.

Similarly, `cEvent.cSchedules[]` (service time distributions) are pure
model logic and are unaffected.

---

## Decision

**Extract `rows[]`-based timetable entries from `bEvent.schedules[]` into
a separate `model_schedules` Supabase table. The bEvent retains a
`scheduleRef` UUID that the engine resolves at run initialisation. Plans
are first-class objects that users can view, name, and edit independently
of the DES model logic. All other bEvent fields remain in `model_json`.**

### Scope boundary

| Data | Location after change |
|---|---|
| `bEvent.schedules[*].rows[]` (timetable) | `model_schedules.schedule_json` |
| `bEvent.schedules[*].{ dist, distParams }` (probabilistic) | stays in `model_json` |
| `cEvent.cSchedules[]` | stays in `model_json` (unchanged) |
| Entity types, queues, graph, state variables | stays in `model_json` (unchanged) |

### The new bEvent shape (after migration)

```json
{
  "id": "b_wcml_train_arrives",
  "name": "WCML Motherwell Train Arrives",
  "effect": ["ARRIVE(Train, WCML Motherwell Approach Queue)"],
  "scheduledTime": "0",
  "schedules": [
    {
      "eventId": "b_wcml_train_arrives",
      "scheduleRef": "3f2a9b1c-...",
      "rows": []
    }
  ]
}
```

`scheduleRef` is a UUID pointing to a `model_schedules` row. `rows` is
set to `[]` in the stored model; the engine populates it from the
resolved schedule before running. This preserves backward compatibility
with models that have no `scheduleRef` — the engine falls back to inline
`rows` as it does today.

### `model_schedules` table schema

```sql
CREATE TABLE public.model_schedules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        uuid        NOT NULL REFERENCES public.des_models(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (char_length(name) <= 200),
  description     text        CHECK (char_length(description) <= 2000),
  -- Array of { eventId, rows[] } — one entry per bEvent that uses this schedule.
  schedule_json   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_default      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);
```

### Multiple schedules per model

A model may have multiple schedules (weekday, weekend, engineering
blockade). The `is_default` flag identifies the schedule used when no
explicit choice is made. The user selects the active schedule in the
Execute panel before running; the engine receives the resolved schedule
map alongside the model.

---

## UI Design — Schedule as a First-Class Object

### The core principle

A schedule/plan is a named, standalone entity that a modeller can read and
edit without touching the DES logic. It is linked *to* a bEvent, not
embedded *inside* it.

### Schedule Manager panel

A dedicated **Schedules** tab in the model editor shows all schedules for
the current model:

```
┌─────────────────────────────────────────────────────────┐
│  Schedules                                [+ New Schedule]│
├────────────────────────┬──────────┬──────────────────────┤
│  Name                  │  Rows    │  Used by             │
├────────────────────────┼──────────┼──────────────────────┤
│  ★ Weekday May 2026    │  1,100   │  5 arrival events    │
│    Weekend May 2026    │    480   │  5 arrival events    │
│    Engineering 14 Jun  │    220   │  2 arrival events    │
└────────────────────────┴──────────┴──────────────────────┘
```

- **★** marks the default schedule (used when none is selected at run time)
- "Used by" shows which bEvents hold a `scheduleRef` pointing to this schedule
- Clicking a schedule opens the Schedule Detail view

### Schedule Detail view

Shows the schedule as a readable table, not raw JSON:

```
Schedule: Weekday May 2026
Description: Standard Mon–Fri timetable, Network Rail May 2026 timetable

 Route            │ Time  │ Train ID │ Platform group   │ Operation
──────────────────┼───────┼──────────┼──────────────────┼───────────
 WCML Motherwell  │ 05:21 │ HL0001   │ long_distance    │ arrival
 WCML Motherwell  │ 05:29 │ HL0002   │ long_distance    │ departure
 Cathcart         │ 05:35 │ CN0001   │ suburban         │ arrival
 ...              │  ...  │  ...     │  ...             │  ...

                                          Showing 1–50 of 1,100 rows
[↑ Export CSV]  [↑ Import CSV]  [✎ Edit]  [⧉ Duplicate]  [✕ Delete]
```

- Times displayed in human-readable HH:MM format (converted from simulation minutes)
- Sortable and filterable by route, time window, or train ID
- CSV import/export for bulk editing in a spreadsheet

### bEvent editor — link picker

The arrival bEvent editor replaces the raw `rows[]` editor with a compact
link picker:

```
Schedule (plan):  [Weekday May 2026 ▾]  [View]  [Manage schedules →]
                  1,100 rows · 5 routes · 05:21 – 23:48
```

- **[View]** opens Schedule Detail in a side panel (read-only inline preview)
- **[Manage schedules →]** navigates to the Schedules tab
- The dropdown lists all schedules for this model; selecting one updates `scheduleRef`
- A bEvent with no `scheduleRef` and empty `rows[]` shows a warning

### Execute panel — schedule selector

A schedule dropdown appears alongside the run controls when the model has
more than one schedule:

```
Timetable:  [Weekday May 2026 ▾]
```

The selected schedule is loaded and passed to the engine as `schedulesMap`.
The default schedule is pre-selected. Changing the schedule is reflected
immediately in the run label suggestion.

---

## Engine interface

`buildEngine` gains an optional `schedulesMap` parameter:

```js
buildEngine(model, seed, warmupPeriod, maxTime, ..., schedulesMap)
```

`schedulesMap` is a plain object keyed by `scheduleRef` UUID. Each value
is the full schedule entry `{ eventId, rows[] }` from `schedule_json`:

```js
{
  "3f2a9b1c-...": { eventId: "b_wcml_train_arrives", rows: [...] },
  "9a4d2e7f-...": { eventId: "b_south_western_arrives", rows: [...] }
}
```

Before the main loop starts, the engine merges schedule data into each
bEvent:

```js
export function resolveInlineSchedules(model, schedulesMap = {}) {
  if (!schedulesMap || Object.keys(schedulesMap).length === 0) return model;
  return {
    ...model,
    bEvents: (model.bEvents || []).map(be => ({
      ...be,
      schedules: (be.schedules || []).map(s => {
        if (!s.scheduleRef) return s;                        // no ref — leave as-is
        if (Array.isArray(s.rows) && s.rows.length > 0) return s; // already resolved
        const resolved = schedulesMap[s.scheduleRef];
        if (!resolved) return s;                             // ref not found — 0 arrivals
        return { ...s, rows: resolved.rows ?? [] };
      }),
    })),
  };
}
```

This function is pure (no side-effects, no mutations). Backward-compatible:
`schedulesMap` defaults to `{}` and all existing callers continue to work.

---

## Related decision — reproduce/diff version fallback (Q2)

### Context

`ModelHistoryTab` previously required an embedded `_model_snapshot` in
`results_json` to enable reproduce-run and model-diff. The glasgow-
supabase-save-perf fix removed the snapshot from non-full saves, which
broke both features for default saves.

### Decision

`getRun()` now joins `model_versions` via the `version_id` foreign key
on `simulation_runs`. The reproduce and diff handlers use:

```js
const modelForReproduce = run.model_snapshot ?? run.version_model;
```

Priority order:
1. `_model_snapshot` from `results_json` (present only in "full" detail saves)
2. `model_json` from the linked `model_versions` row (present when the
   run was recorded against a named version milestone)
3. Neither available → user-facing message: "Tag a version before running
   to enable reproducibility checking"

This approach means modellers who tag a version before running (the
recommended workflow per ADR-015) automatically get working reproduce/diff
with no extra overhead. The snapshot is only needed when a run is made
without a version tag and exact reproduce fidelity is required.

---

## Alternatives Considered

### A — Keep inline, compress client-side

Compress `model_json` with LZ-string or similar before storing. Reduces
transfer size but adds CPU overhead, requires migration, complicates
debugging, and leaves the timetable coupled to the model. **Rejected.**

### B — Normalise individual row entries into a `schedule_rows` table

One database row per train movement (~1,100 rows for Glasgow). Enables
per-row queries, filtering, and editing but adds join complexity to every
model fetch and run initialisation. The timetable is always consumed as a
whole — partial reads have no use case. **Rejected.**

### C — Store schedule as a separate top-level JSONB column on `des_models`

Simple — no new table. But couples schedule lifecycle to model lifecycle
(delete model → delete schedule), prevents multiple schedules per model,
and does not solve the model library transfer weight (the column is still
fetched). **Rejected.**

### D — Only apply to models above a size threshold

Threshold logic adds complexity, creates two code paths, and doesn't help
future models that grow to the same size. All models with timetable data
should use the normalised form. **Rejected.**

### E — This decision (selected)

New table, UUID reference, backward-compatible engine fallback. Clean
separation of concerns, enables multiple schedules, first-class UI for
viewing and editing plans, reduces `model_json` by ~96% for timetable-
heavy models. **Accepted.**

---

## Consequences

### Positive

- `model_json` for Glasgow Central: 289 KB → ~14 KB
- `fetchModels` no longer transfers timetable data when loading the model library
- Model snapshot (for reproduce/diff) becomes trivially small — snapshot embedding
  can be re-enabled for all detail levels
- Multiple timetables per model (weekday, weekend, engineering blockade)
- Timetable and DES logic are versioned independently
- Supabase INSERT payload for simulation runs returns to a normal size
- Schedules are first-class objects with their own editor, name, description,
  and CSV import/export — modellers do not need to understand bEvent schema
  to read or change a timetable
- reproduce/diff now works via version fallback without snapshot overhead

### Negative

- `buildEngine` callers must supply a `schedulesMap` (or accept that schedule-
  less runs work — fallback is inline rows)
- Model export (JSON download) must inline the schedule back or bundle it separately
- `model_versions` snapshots of `model_json` no longer capture the timetable —
  schedule versions are tracked separately
- Share-link dashboards that load both model and results need to fetch the
  schedule too
- Additional Supabase RLS policies required for `model_schedules`
- reproduce/diff now requires either a full-detail save OR a version tag;
  untagged minimal-detail saves cannot be reproduced exactly

### Rules added to AGENTS.md

- `model_json.bEvents[*].schedules[*].rows` MAY be empty `[]` when a
  `scheduleRef` is present; treat this as valid
- `buildEngine` MUST call `resolveInlineSchedules(model, schedulesMap)` before
  processing events when a schedulesMap is provided
- Do not embed timetable `rows[]` in `model_json` for new models when
  `model_schedules` is available
- `model_schedules` rows are owned by the model owner; RLS mirrors
  `des_models` ownership rules
- Schedule export must reconstruct inline `rows[]` in the exported JSON so
  exports are self-contained and portable
- `getRun()` always joins `model_versions`; callers resolve
  `model_snapshot ?? version_model` to get the model for reproduce/diff

### Schema contract (per CLAUDE.md)

Any change to `bEvent.schedules[*].rows` handling in `db/models.js`
serialisation must include a Vitest round-trip assertion in `tests/db/`
confirming that `scheduleRef` is preserved on save and that inline rows
are not duplicated when a ref is present.

---

## Open Questions

1. **Schedule versioning.** `model_versions` snapshots of `model_json`
   will no longer include timetable data. Should schedule changes be
   captured as numbered revisions alongside model versions, or is a
   simple `updated_at` + `created_by` audit trail sufficient? For now:
   `updated_at` trail is sufficient; full versioning deferred.

2. **Export format.** The JSON export of a model should be self-contained.
   The exporter inlines `rows[]` back into the bEvent and omits
   `scheduleRef` so the export is portable to another instance without
   needing the `model_schedules` table.

3. **Validation.** When a `scheduleRef` is present but cannot be resolved
   (schedule deleted, foreign key broken), the engine produces 0 arrivals
   for that event and emits a log warning. It does not fail to run. A
   model validator warning (not an error) is added.

4. **Multi-user schedules.** If a model is shared (visibility = public),
   its schedules are readable by anyone (mirroring model visibility). Only
   the owner may edit or delete schedules.
