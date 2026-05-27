# ADR-016: Separate Timetable Schedule Data from Core Model JSON

**Date:** 2026-05-27
**Status:** Proposed
**Sprint:** TBD (see Migration Plan)
**Decided by:** Architecture review

---

## Context

### The problem

DES Studio models that represent real operational systems embed full
timetable data directly inside `model_json`. For Glasgow Central station
the breakdown is:

| Section | Size | Share |
|---|---|---|
| 5 × arrival bEvent timetables (`schedules[].rows[]`) | 278 KB | 96.5% |
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
deterministic time-series. This mechanism is sound and is kept.

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
`scheduleRef` UUID that the engine resolves at run initialisation. All
other bEvent fields remain in `model_json`.**

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
with models that have no `scheduleRef` — the engine falls back to
inline `rows` as it does today.

### `model_schedules` table schema

```sql
CREATE TABLE public.model_schedules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        uuid        NOT NULL REFERENCES public.des_models(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  description     text,
  schedule_json   jsonb       NOT NULL DEFAULT '[]',
  -- schedule_json stores: [{ "eventId": "b_wcml_train_arrives", "rows": [...] }]
  -- one entry per bEvent that uses this schedule; a schedule may serve multiple events
  is_default      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);
```

### Multiple schedules per model

A model may have multiple schedules (weekday, weekend, engineering
blockade). The `is_default` flag identifies the schedule used when no
explicit choice is made. The UI selects the active schedule before
running; the engine receives the resolved schedule map alongside the
model.

### Engine interface

`buildEngine` gains an optional `schedulesMap` parameter:

```js
buildEngine(model, seed, warmupPeriod, maxTime, ..., schedulesMap)
```

`schedulesMap` is a plain object keyed by `scheduleRef` UUID:

```js
{
  "3f2a9b1c-...": { eventId: "b_wcml_train_arrives", rows: [...] },
  "9a4d2e7f-...": { eventId: "b_south_western_arrives", rows: [...] }
}
```

Before the main loop starts, the engine merges schedule data into each
bEvent:

```js
function resolveInlineSchedules(model, schedulesMap = {}) {
  return {
    ...model,
    bEvents: (model.bEvents || []).map(be => ({
      ...be,
      schedules: (be.schedules || []).map(s => {
        if (!s.scheduleRef || s.rows?.length) return s;  // already resolved or no ref
        const resolved = schedulesMap[s.scheduleRef];
        return resolved ? { ...s, rows: resolved.rows ?? [] } : s;
      }),
    })),
  };
}
```

This function is called once at engine initialisation and is pure
(no side-effects). The original model object is not mutated.

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
separation of concerns, enables multiple schedules, reduces `model_json`
by ~96% for timetable-heavy models. **Accepted.**

---

## Consequences

### Positive

- `model_json` for Glasgow Central: 289 KB → ~14 KB
- `fetchModels` no longer transfers timetable data when loading the model library
- Model snapshot (for reproduce/diff) becomes trivially small — snapshot embedding can be re-enabled for all detail levels
- Multiple timetables per model (weekday, weekend, engineering blockade)
- Timetable and DES logic are versioned independently
- Supabase INSERT payload for simulation runs returns to a normal size
- Schedule editor can load/save without touching the core model

### Negative

- `buildEngine` callers must supply a `schedulesMap` (or accept that schedule-less runs work — fallback is inline rows)
- Model export (JSON download) must either inline the schedule back or bundle schedule separately
- `model_versions` snapshots of `model_json` no longer capture the timetable — a separate schedule version mechanism may be needed
- Share-link dashboards that load both model and results need to fetch the schedule too
- Additional Supabase RLS policies required for `model_schedules`

### Rules added to AGENTS.md

- `model_json.bEvents[*].schedules[*].rows` MAY be empty `[]` when a `scheduleRef` is present; treat this as valid
- `buildEngine` MUST call `resolveInlineSchedules(model, schedulesMap)` before processing events when a schedulesMap is provided
- Do not embed timetable `rows[]` in `model_json` for new models when `model_schedules` is available
- `model_schedules` rows are owned by the model owner; RLS mirrors `des_models` ownership rules
- Schedule export must reconstruct inline `rows[]` in the exported JSON so exports are self-contained and portable

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
   simple `updated_at` + `created_by` audit trail sufficient?

2. **Schedule sharing.** If a model is made public, should its schedules
   be readable by anyone (mirroring model visibility) or only by the
   owner? The simplest rule: schedule visibility follows model visibility.

3. **Export format.** The JSON export of a model should be self-contained
   (portable to another instance). Should the exporter inline `rows[]`
   back into the bEvent, or export a separate `schedules` section at the
   top level of the export envelope?

4. **Multi-schedule selection UI.** When a model has multiple schedules,
   where does the user select which one to run? Options: a dropdown on the
   Execute panel, a separate "Schedule" tab in the model editor, or a
   run-configuration dialog.

5. **Validation.** Should the model validator warn when a `scheduleRef`
   is present but the referenced schedule cannot be found, or is this an
   error that prevents running?
