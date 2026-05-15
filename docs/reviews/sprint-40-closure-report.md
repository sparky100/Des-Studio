# Sprint 40 — Closure Report

**Sprint:** 40 — Entity-Driven Service Times & Scheduled Arrival Attributes
**Completed:** 2026-05-15
**Branch:** `claude/review-sprints-31-33-0R5Mx`

## Delivered Scope

| Item | Description | Result |
|------|-------------|--------|
| S40.1 | `EntityAttr` cSchedule distribution — service time from customer entity attribute | ✅ Done |
| S40.2 | Schedule `rows[]` — per-arrival attribute overrides | ✅ Done |

## Detail

### S40.1 — EntityAttr service time

**Problem**: `ServerAttr` already read service time from the matched server entity's attributes, but there was no equivalent for the customer entity. Models where service time varies by customer (job shops, patient pathways, order processing) had no native way to express that dependency.

**Engine — `distributions.js`**:
- Added `EntityAttr` to `DIST_ALIASES` under three normalisation keys (`entityattr`, `entity-attr`, `entity_attr`)
- Added `EntityAttr` entry to `DISTRIBUTIONS` registry:
  - `params: ["attr"]` — DistPicker renders an "attr" text field
  - `sample: () => 0` — actual value is resolved in `phases.js` where the customer entity is in scope
  - `label`/`hint` copied from the ServerAttr pattern

**Engine — `phases.js` `fireCEvent`**:
- Added `EntityAttr` branch alongside the existing `ServerAttr` branch in the cSchedule delay resolver
- Reads `effectCtx._lastCustId` → locates the customer entity → reads `attrs[attrName]`
- If the attribute is missing, logs `EntityAttr: entity #N has no attribute '<name>' — delay = 0` and uses delay 0
- Emits `Scheduled "<name>" @ t=... [entity.<attrName>=<delay>]` on success

**Validation — `validation.js`**:
- `checkDist()` already skips `ServerAttr`; extended guard to also skip `EntityAttr`
- No V5 error emitted for EntityAttr regardless of distParams contents

**UI — `CEventEditor.jsx`**:
- Preview row updated: `EntityAttr` case shows `entity.<attrName>` alongside the existing `server.<attrName>` for ServerAttr

**UI — `DistPicker` in `components.jsx`**:
- `EntityAttr` appears automatically in the dropdown because DistPicker reads `DISTRIBUTIONS`
- No new UI code required beyond the `distributions.js` registration

---

### S40.2 — Schedule rows[] per-arrival attributes

**Problem**: The Schedule distribution supported `times[]` for planned absolute arrival times but had no mechanism to attach attribute values to each row. Capacity/demand plans need both timing and per-arrival data (e.g. `size`, `priority`, `serviceTime`).

**Engine — `distributions.js` Schedule sampler**:
- When `distParams.rows` is present, `rows[idx].time` is used for timing (same arithmetic as `times[]`)
- `rows[idx].attrs` is written to `state[__schedRowAttrs_<schedKey>]` before returning; `null` when row has no `attrs`
- `times[]` path remains completely unchanged — no regressions

**Engine — `phases.js` `fireBEvent`**:
- After `sample()` for a Schedule distribution, reads `ctx.state[__schedRowAttrs_<schedKey>]`
- Attaches it as `_scheduleRowAttrs` on the FEL entry (undefined when null, preserving backward compat)

**Engine — `macros.js` ARRIVE**:
- Normal join path reads `felRef?._scheduleRowAttrs` (from the FEL entry that fired ARRIVE)
- Merges over sampled attrs: `{ ...sampledAttrs, ...rowAttrs }` — row values override defaults
- Balk and overflow-routing paths continue to use `sampleAttrs` only (row attrs not needed there)

**UI — `ScheduleEditor` in `components.jsx`**:
- Accepts optional `attrDefs` prop (default `[]`)
- When `attrDefs` has named entries, shows a mode toggle: "Times list" ↔ "Arrival attributes"
- In rows mode: renders a table — one row per planned arrival — with a `Time` column plus one column per attr from `attrDefs`
- "Add row" / "×" controls per row
- Switching from rows → times mode recovers the flat times list; switching back initialises from existing times
- Without attrDefs (the default), the editor is identical to the old behaviour

**UI — `DistPicker` in `components.jsx`**:
- Accepts optional `attrDefs=[]` prop and forwards it to `ScheduleEditor`

**UI — `BEventEditor.jsx`**:
- Infers the arriving entity type from the B-event's ARRIVE effect string (regex match)
- Passes the matching entity type's `attrDefs` to DistPicker when rendering schedule rows

## Files changed

| File | Change |
|------|--------|
| `src/engine/distributions.js` | EntityAttr aliases + DISTRIBUTIONS entry; Schedule rows[] timing + attrs storage |
| `src/engine/phases.js` | `fireCEvent` EntityAttr branch; `fireBEvent` `_scheduleRowAttrs` attach |
| `src/engine/macros.js` | ARRIVE normal join merges `felRef._scheduleRowAttrs` over sampled attrs |
| `src/engine/validation.js` | `checkDist` skips EntityAttr (same as ServerAttr) |
| `src/ui/editors/CEventEditor.jsx` | Preview shows `entity.<attrName>` for EntityAttr |
| `src/ui/shared/components.jsx` | ScheduleEditor rows table mode; DistPicker `attrDefs` prop |
| `src/ui/editors/BEventEditor.jsx` | Pass entity attrDefs to DistPicker for schedule rows |
| `tests/engine/distributions.test.js` | EntityAttr alias/registry tests; Schedule rows timing + attrs tests (10 new) |
| `tests/engine/entity-attr-service.test.js` | Integration: EntityAttr service time; rows attr merge; combined end-to-end (NEW, 9 tests) |
| `tests/engine/validation.test.js` | EntityAttr skips V5 validation (3 new) |
| `docs/reviews/sprint-40-plan.md` | Sprint 40 plan |
| `docs/reviews/sprint-40-closure-report.md` | This document |

## Test results

```
tests/engine/distributions.test.js         +10 new tests (19 total)
tests/engine/entity-attr-service.test.js    9/9   pass  (NEW)
tests/engine/validation.test.js            +3  new tests (32 total)
Full suite: 1234/1234 pass (94 test files)
```

## Acceptance criteria — final status

- [x] C-event with `dist: "EntityAttr"` uses the customer entity's named attribute as service time
- [x] If the attribute is missing on the entity, delay falls back to 0 with a log message
- [x] `EntityAttr` visible in C-event schedule `DistPicker` dropdown; preview shows `entity.<attr>`
- [x] Validation skips EntityAttr distribution parameter checks (V5)
- [x] Schedule with `rows[]` delivers each arrival at the planned time with the row's attrs merged
- [x] Rows mode is backward-compatible — models using `times[]` continue to work unchanged
- [x] Schedule editor shows a rows table when attrDefs are provided and rows mode is toggled on
- [x] Combined: schedule rows supply `serviceTime`; C-event uses EntityAttr → fully plan-driven model
- [x] All existing tests pass; 22 new tests cover each change
