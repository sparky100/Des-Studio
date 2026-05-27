# Schedule Data Separation — Migration Plan

**ADR:** ADR-016  
**Status:** Draft  
**Date:** 2026-05-27  
**Author:** Architecture review

---

## Overview

This plan breaks the ADR-016 schedule separation into discrete,
independently-deployable phases. Each phase can be shipped, tested, and
verified before the next begins. The system remains fully operational
throughout — no flag-day migration required.

**Total effort estimate:** 3–4 sprints across ~6 weeks

---

## Phase 0 — Groundwork (pre-flight, no user-visible change)

**Goal:** Understand exactly what needs migrating; confirm engine fallback
is robust; agree on the open questions from ADR-016 before writing schema.

### 0.1 Audit existing models for schedule data

Run a query against `des_models` to find every model with inline
timetable rows:

```sql
SELECT id, name,
       jsonb_array_length(model_json->'bEvents') AS bevent_count,
       (
         SELECT COUNT(*)
         FROM jsonb_array_elements(model_json->'bEvents') be,
              jsonb_array_elements(be->'schedules') sched
         WHERE sched ? 'rows'
           AND jsonb_array_length(sched->'rows') > 0
       ) AS schedule_events_with_rows,
       length(model_json::text) AS model_json_bytes
FROM des_models
ORDER BY model_json_bytes DESC;
```

This tells us: how many models need migrating, how large they are, and
which users own them.

### 0.2 Confirm engine fallback coverage

Verify that the existing engine handles a bEvent whose `schedules[*].rows`
is `[]` (empty) but `scheduleRef` is set (new shape) by checking the
`topLevelData` merge path in `phases.js:272`. Add a Vitest engine test:

```js
it("engine treats empty rows[] gracefully when scheduleRef is present", () => {
  const model = makeMinimalModel({
    bEvents: [{
      id: "b_arrive", name: "Arrive", scheduledTime: "0",
      effect: ["ARRIVE(Customer, Queue)"],
      schedules: [{
        eventId: "b_arrive",
        scheduleRef: "test-ref-uuid",
        rows: []             // empty — schedule not yet resolved
      }]
    }]
  });
  const engine = buildEngine(model, 42, 0, 100);
  const result = engine.runAll();
  // No arrivals because rows is empty, but no crash
  expect(result.summary.total).toBe(0);
});
```

### 0.3 Resolve open questions

Before writing schema, decide:
- **Schedule versioning:** `updated_at` audit trail is sufficient for now
- **Schedule visibility:** follows model visibility (schedule is readable iff model is readable)
- **Export format:** export envelope gains a top-level `schedules` array; the importer inlines rows back before saving
- **Multi-schedule UI:** dropdown on Execute panel (simplest); full Schedule tab is Phase 4
- **Validation:** `scheduleRef` with no resolvable schedule is a **warning** (run proceeds with 0 arrivals), not an error

---

## Phase 1 — Supabase schema + read path (non-breaking)

**Goal:** New table exists; engine can read from it; existing models
continue to work with inline rows. No data is moved yet.

### 1.1 Migration — create `model_schedules` table

File: `supabase/migrations/YYYYMMDD000000_create_model_schedules.sql`

```sql
-- ADR-016: Schedule data separation from model_json
-- Phase 1: create table and RLS; no data moved yet.

CREATE TABLE IF NOT EXISTS public.model_schedules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        uuid        NOT NULL
                    REFERENCES public.des_models(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (char_length(name) <= 200),
  description     text        CHECK (char_length(description) <= 2000),
  -- Array of { eventId, rows[] } — one entry per bEvent that uses this schedule.
  -- Mirrors the inline bEvent.schedules[*] format so the engine can consume it
  -- directly after resolveInlineSchedules().
  schedule_json   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_default      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enforce at most one default schedule per model
CREATE UNIQUE INDEX IF NOT EXISTS model_schedules_one_default_idx
  ON public.model_schedules(model_id)
  WHERE is_default = true;

-- Fast lookups by model
CREATE INDEX IF NOT EXISTS model_schedules_model_id_idx
  ON public.model_schedules(model_id);

ALTER TABLE public.model_schedules ENABLE ROW LEVEL SECURITY;

-- Owner: full CRUD
CREATE POLICY "Owners can manage their schedules"
  ON public.model_schedules
  FOR ALL TO authenticated
  USING  (model_id IN (SELECT id FROM des_models WHERE owner_id = auth.uid()))
  WITH CHECK (model_id IN (SELECT id FROM des_models WHERE owner_id = auth.uid()));

-- Public read — schedule is readable when the parent model is public
CREATE POLICY "Public model schedules are readable"
  ON public.model_schedules
  FOR SELECT TO public
  USING (model_id IN (SELECT id FROM des_models WHERE visibility = 'public'));

-- Share-link read — readable when an active share link references a run on the model
CREATE POLICY "Schedule readable via share link"
  ON public.model_schedules
  FOR SELECT TO public
  USING (
    model_id IN (
      SELECT sr.model_id
      FROM simulation_runs sr
      JOIN share_links sl ON sl.run_id = sr.id
      WHERE sl.revoked_at IS NULL
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_model_schedules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER model_schedules_updated_at
  BEFORE UPDATE ON public.model_schedules
  FOR EACH ROW EXECUTE FUNCTION update_model_schedules_updated_at();
```

### 1.2 Engine — `resolveInlineSchedules()`

Add to `src/engine/index.js` (exported, pure function):

```js
/**
 * Merges external schedule data into the model's bEvents before running.
 * Called once at engine initialisation when a schedulesMap is provided.
 *
 * schedulesMap: { [scheduleRef: string]: { eventId: string, rows: Row[] } }
 *
 * Does NOT mutate the model — returns a new object.
 * Models without scheduleRef fields pass through unchanged (backward compat).
 */
export function resolveInlineSchedules(model, schedulesMap = {}) {
  if (!schedulesMap || Object.keys(schedulesMap).length === 0) return model;
  return {
    ...model,
    bEvents: (model.bEvents || []).map(be => ({
      ...be,
      schedules: (be.schedules || []).map(s => {
        if (!s.scheduleRef) return s;                       // no ref — leave as-is
        if (Array.isArray(s.rows) && s.rows.length > 0) return s;  // already resolved
        const resolved = schedulesMap[s.scheduleRef];
        if (!resolved) return s;                            // ref not found — 0 arrivals
        return { ...s, rows: resolved.rows ?? [] };
      }),
    })),
  };
}
```

Update `buildEngine` signature:

```js
export function buildEngine(model, seed, warmupPeriod, maxTime, ..., schedulesMap = {}) {
  const resolvedModel = resolveInlineSchedules(model, schedulesMap);
  // ... rest unchanged, use resolvedModel throughout
}
```

**Backward compatibility:** `schedulesMap` defaults to `{}`. All existing
callers pass nothing and continue to work with inline rows.

### 1.3 DB layer — `fetchModelSchedules` / `saveModelSchedule`

Add to `src/db/models.js`:

```js
export async function fetchModelSchedules(modelId) {
  const { data, error } = await supabase
    .from("model_schedules")
    .select("id, name, description, schedule_json, is_default, created_at, updated_at")
    .eq("model_id", modelId)
    .order("is_default", { ascending: false })  // default first
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveModelSchedule(modelId, userId, { id, name, description, scheduleJson, isDefault }) {
  const payload = {
    model_id:      modelId,
    name:          name.trim(),
    description:   description?.trim() ?? null,
    schedule_json: scheduleJson,
    is_default:    !!isDefault,
    created_by:    userId,
  };
  if (id) {
    // Update
    const { data, error } = await supabase
      .from("model_schedules")
      .update(payload)
      .eq("id", id)
      .eq("model_id", modelId)   // RLS already checks ownership; belt-and-braces
      .select("id")
      .single();
    if (error) throw error;
    return data?.id;
  } else {
    // Insert
    const { data, error } = await supabase
      .from("model_schedules")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return data?.id;
  }
}

export async function deleteModelSchedule(scheduleId, modelId) {
  const { error } = await supabase
    .from("model_schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("model_id", modelId);
  if (error) throw error;
}
```

### 1.4 Tests for Phase 1

- `tests/db/model-schedules.test.js`: round-trip tests for the three DB functions using the existing Supabase mock pattern
- `tests/engine/resolve-schedules.test.js`: unit tests for `resolveInlineSchedules()`:
  - empty schedulesMap → model unchanged
  - scheduleRef present + resolved → rows populated
  - scheduleRef present + NOT in map → rows stay empty (no crash)
  - no scheduleRef on sched entry → entry unchanged
  - model has mix of refs and inline rows → each handled correctly

**Acceptance criteria for Phase 1:**
- All existing tests pass
- `model_schedules` table exists in Supabase
- `resolveInlineSchedules` is exported and tested
- No visible change to any UI

---

## Phase 2 — Write path + extraction tool (data migration)

**Goal:** New models write schedule data to `model_schedules`. Existing
models are migrated to use references. The engine still works with both
forms during the transition.

### 2.1 Extract-and-reference on model save

Update `saveModel` in `src/db/models.js` to detect inline `rows[]` and
extract them:

```js
async function extractAndSaveSchedules(modelId, userId, model) {
  // Find bEvents with non-empty inline rows
  const toExtract = [];
  for (const be of model.bEvents || []) {
    for (const sched of be.schedules || []) {
      if (Array.isArray(sched.rows) && sched.rows.length > 0 && !sched.scheduleRef) {
        toExtract.push({ bEventId: be.id, sched });
      }
    }
  }
  if (toExtract.length === 0) return model;

  // Group all extractable schedules into one default schedule record per model
  // (all routes share a single schedule for simplicity; can be split later)
  const scheduleJson = toExtract.map(({ bEventId, sched }) => ({
    eventId: sched.eventId || bEventId,
    rows:    sched.rows,
  }));

  const scheduleId = await saveModelSchedule(modelId, userId, {
    name:         "Default Timetable",
    scheduleJson,
    isDefault:    true,
  });

  // Rewrite the model: replace inline rows with scheduleRef, clear rows
  return {
    ...model,
    bEvents: (model.bEvents || []).map(be => ({
      ...be,
      schedules: (be.schedules || []).map(sched => {
        const match = toExtract.find(e => e.sched === sched);
        if (!match) return sched;
        return { ...sched, scheduleRef: scheduleId, rows: [] };
      }),
    })),
  };
}
```

`saveModel` calls `extractAndSaveSchedules` before writing `model_json`:

```js
export async function saveModel(modelId, userId, model) {
  const modelWithRefs = await extractAndSaveSchedules(modelId, userId, model);
  // ... existing save logic using modelWithRefs instead of model
}
```

### 2.2 Batch migration of existing models

A one-off script run after Phase 2 is deployed to production:

```js
// scripts/migrate-schedules.js
// Run once: node scripts/migrate-schedules.js
// Requires SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function migrateModel(model) {
  const bevents = model.model_json?.bEvents ?? [];
  const toExtract = [];

  for (const be of bevents) {
    for (const sched of be.schedules ?? []) {
      if (Array.isArray(sched.rows) && sched.rows.length > 0 && !sched.scheduleRef) {
        toExtract.push({ bEventId: be.id, sched });
      }
    }
  }

  if (toExtract.length === 0) return { id: model.id, skipped: true };

  const scheduleJson = toExtract.map(({ bEventId, sched }) => ({
    eventId: sched.eventId || bEventId,
    rows:    sched.rows,
  }));

  // Insert schedule record
  const { data: schedData, error: schedErr } = await supabase
    .from("model_schedules")
    .insert({
      model_id:      model.id,
      name:          "Default Timetable (migrated)",
      schedule_json: scheduleJson,
      is_default:    true,
      created_by:    model.owner_id,
    })
    .select("id")
    .single();

  if (schedErr) throw new Error(`Schedule insert failed for model ${model.id}: ${schedErr.message}`);

  // Rewrite model_json with refs replacing inline rows
  const newBEvents = (model.model_json?.bEvents ?? []).map(be => ({
    ...be,
    schedules: (be.schedules ?? []).map(sched => {
      const match = toExtract.find(e => e.sched === sched);
      if (!match) return sched;
      return { ...sched, scheduleRef: schedData.id, rows: [] };
    }),
  }));

  const newModelJson = { ...model.model_json, bEvents: newBEvents };

  const { error: updateErr } = await supabase
    .from("des_models")
    .update({ model_json: newModelJson })
    .eq("id", model.id);

  if (updateErr) throw new Error(`Model update failed for ${model.id}: ${updateErr.message}`);

  const savedBytes  = JSON.stringify(scheduleJson).length;
  const beforeBytes = JSON.stringify(model.model_json).length;
  const afterBytes  = JSON.stringify(newModelJson).length;

  return { id: model.id, name: model.name, scheduleId: schedData.id,
           beforeBytes, afterBytes, savedBytes, skipped: false };
}

async function run() {
  console.log("Fetching models with inline schedule data…");

  // Fetch in batches of 50 to avoid timeout
  let offset = 0;
  const BATCH = 50;
  let totalMigrated = 0, totalSkipped = 0, totalErrors = 0;

  while (true) {
    const { data: models, error } = await supabase
      .from("des_models")
      .select("id, name, owner_id, model_json")
      .range(offset, offset + BATCH - 1);

    if (error) { console.error("Fetch error:", error); process.exit(1); }
    if (!models.length) break;

    for (const model of models) {
      try {
        const result = await migrateModel(model);
        if (result.skipped) {
          totalSkipped++;
        } else {
          totalMigrated++;
          const pct = (100 * (result.beforeBytes - result.afterBytes) / result.beforeBytes).toFixed(0);
          console.log(`✓ ${result.name} (${result.id}): ${result.beforeBytes.toLocaleString()} → ${result.afterBytes.toLocaleString()} bytes (-${pct}%)`);
        }
      } catch (e) {
        totalErrors++;
        console.error(`✗ ${model.name} (${model.id}): ${e.message}`);
      }
    }

    offset += BATCH;
    if (models.length < BATCH) break;
  }

  console.log(`\nDone. Migrated: ${totalMigrated}  Skipped: ${totalSkipped}  Errors: ${totalErrors}`);
}

run().catch(e => { console.error(e); process.exit(1); });
```

**Run the script in dry-run mode first** (log only, no writes) by
commenting out the two `supabase` mutation calls.

### 2.3 Fetch path — supply schedulesMap to engine

Update the Execute panel's run flow to load schedules before building
the engine:

```js
// In execute/index.jsx — before buildEngine()
const schedules = await fetchModelSchedules(modelId);
const defaultSchedule = schedules.find(s => s.is_default) ?? schedules[0] ?? null;

const schedulesMap = {};
if (defaultSchedule) {
  for (const entry of defaultSchedule.schedule_json ?? []) {
    // Map by eventId so the engine can look up by eventId too (convenience)
    schedulesMap[defaultSchedule.id] = entry;
  }
}
// Or, more precisely: build a lookup keyed by schedule UUID
// so resolveInlineSchedules can find it by scheduleRef
const schedulesById = {};
for (const sched of schedules) {
  schedulesById[sched.id] = sched.schedule_json;
}
// schedulesById is the schedulesMap passed to buildEngine
const engine = buildEngine(resolvedModel, seed, warmupPeriod, maxTime, ..., schedulesById);
```

> **Note:** The exact map shape must align with `resolveInlineSchedules`.
> The resolved schedule_json from the DB is `[{ eventId, rows[] }]` — the
> engine function needs to find the right entry. Finalise the exact lookup
> key during implementation.

### 2.4 Model export — inline rows back

Update `src/db/local.js` or the export handler to reconstruct inline rows
before exporting:

```js
export async function buildExportPayload(model, schedules) {
  const defaultSched = schedules.find(s => s.is_default) ?? schedules[0] ?? null;
  if (!defaultSched) return model;   // no external schedules — export as-is

  const rowsByEventId = Object.fromEntries(
    (defaultSched.schedule_json ?? []).map(e => [e.eventId, e.rows])
  );

  return {
    ...model,
    bEvents: (model.bEvents ?? []).map(be => ({
      ...be,
      schedules: (be.schedules ?? []).map(s => {
        if (!s.scheduleRef) return s;
        const rows = rowsByEventId[s.eventId] ?? [];
        return { ...s, rows, scheduleRef: undefined };   // inline, drop ref
      }),
    })),
  };
}
```

### 2.5 Tests for Phase 2

- `tests/engine/resolve-schedules.test.js`: extend with real Glasgow-scale row counts
- `tests/db/model-schedules.test.js`: round-trip for save-with-extract path
- `scripts/migrate-schedules.dry-run.test.js`: unit test the migration logic on a fixture model
- Schema contract: add assertions in `tests/db/` confirming `scheduleRef` is preserved on `saveModel` round-trip and that inline `rows[]` are no longer present after save

**Acceptance criteria for Phase 2:**
- Saving any model with inline rows → schedule extracted, model_json shrunk
- Existing models without inline rows → unaffected
- Engine runs correctly when supplied schedulesMap
- Engine runs correctly with inline rows (no schedulesMap) — backward compat confirmed
- Export produces a self-contained JSON with inlined rows

---

## Phase 3 — Model library + snapshot cleanup

**Goal:** `fetchModels` stops returning timetable data in the model card
list; `_model_snapshot` can optionally be re-enabled for all detail levels
now that the core model is tiny.

### 3.1 Strip `model_json` from model list query

Update `fetchModels` to NOT return `model_json` (it never needed it for
the library view — the model is fetched in full when opened):

```js
// BEFORE
.select("id, name, owner_id, visibility, ...")

// Confirm model_json is NOT in the select list — it shouldn't be,
// but audit to ensure no accidental widening crept in.
```

If `model_json` is currently returned by `fetchModels`, remove it. The
model editor already fetches the full model on open via a separate call.

### 3.2 Re-enable snapshot for reproduce/diff

Now that `model_json` is ~14 KB for Glasgow, the `_model_snapshot`
overhead is acceptable. Update `results-persistence.js` to include
the snapshot for all detail levels, not only "full":

```js
// BEFORE (ADR-016 workaround — Phase 3 removes this guard)
if (config.runRecord.model_snapshot && detailLevel === "full") {

// AFTER (core model is small; snapshot is useful for reproduce/diff)
if (config.runRecord.model_snapshot) {
```

The snapshot will be ~14 KB (core model only, no timetable), well within
normal JSONB bounds.

### 3.3 Tests for Phase 3

- Verify that `_model_snapshot` in a saved run is <= 20 KB for Glasgow
- Verify `reproduce run` works end-to-end for a migrated Glasgow run
- Verify `view diff` works end-to-end for a migrated Glasgow run

---

## Phase 4 — Schedule management UI (optional, later sprint)

**Goal:** Modellers can create, name, and switch between multiple
schedules in the UI. This phase is independent of the correctness of
Phases 1–3 and can be deferred.

### 4.1 Schedule selector on Execute panel

A dropdown alongside the run controls:

```
Timetable: [Default Timetable ▾]   [+ New]
```

Selected schedule is passed to `buildEngine` as `schedulesMap`.

### 4.2 Schedule editor tab

A new "Schedules" tab in the model editor showing:
- List of schedules for this model (name, row count, last updated)
- Ability to rename, duplicate, delete
- CSV import/export of schedule rows
- "Set as default" toggle

### 4.3 Multiple-timetable workflow

- Duplicate Glasgow weekday timetable → "Weekend Timetable"
- Edit arrival times for Saturday service patterns
- Run both and compare in the results workspace

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration script corrupts a model | Low | High | Run in dry-run first; take a full DB backup before live run; script is idempotent (skips models already migrated) |
| Engine receives `schedulesMap` with wrong key shape | Medium | Medium | Phase 1 tests cover all key-miss cases; fallback is 0 arrivals with a log warning (not a crash) |
| Export tool produces un-importable files | Low | Medium | Phase 2 has a test asserting the export round-trips cleanly |
| `fetchModels` query change breaks model cards | Low | Low | Model cards only use `name`, `id`, `stats`, `visibility`; `model_json` was never displayed there |
| Supabase migration fails in production | Low | High | Test against a Supabase branch first; migration is additive (new table) so rollback = drop table |
| Phase 3 re-enables snapshot but model_json is not yet small | Medium | Medium | Gate Phase 3 on confirming > 90% of models are migrated (query Phase 2 audit) |

---

## Rollback Plan

| Phase | Rollback action |
|---|---|
| Phase 1 | Drop `model_schedules` table; remove `resolveInlineSchedules` from engine (backward compat means nothing is broken) |
| Phase 2 (schema) | Re-run with inline rows restored; `scheduleRef` fields in model_json are ignored by the legacy code path |
| Phase 2 (migration script) | Restore `des_models.model_json` from the pre-migration backup; drop `model_schedules` rows for the batch |
| Phase 3 | Re-add the `detailLevel === "full"` guard in `results-persistence.js` |

---

## Acceptance Criteria (full migration)

- [ ] Glasgow Central `model_json` is ≤ 20 KB in `des_models`
- [ ] At least one `model_schedules` row exists for Glasgow Central with `is_default = true` and all 1,100 schedule rows
- [ ] Engine produces identical results for Glasgow Central before and after migration (same seed, same max time)
- [ ] Reproduce-run works for a post-migration Glasgow run
- [ ] Model diff view works for a post-migration Glasgow run
- [ ] JSON export of Glasgow Central is self-contained (inline rows present, no `scheduleRef`)
- [ ] Importing the exported JSON produces a working model
- [ ] `fetchModels` response size is ≤ 10 KB for Glasgow Central
- [ ] Supabase INSERT for a Glasgow simulation run is ≤ 30 KB
- [ ] All Vitest tests pass
- [ ] No regressions on models without schedule data
