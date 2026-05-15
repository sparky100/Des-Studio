# Sprint 40 — Plan

**Sprint:** 40 — Entity-Driven Service Times & Scheduled Arrival Attributes
**Branch:** `sprint-40`
**Date:** 2026-05-15

## Objective

Two connected gaps in the model authoring experience:

- **S40.1** — Service time that depends on an entity attribute (e.g. each Job arrives carrying its own `serviceTime`; the C-event should use that value rather than a fixed distribution).
- **S40.2** — When a plan (schedule distribution) drives arrivals, allow each planned arrival to carry specific attribute values (e.g. row 1 arrives with `size=5`, row 2 with `size=10`). Combines naturally with S40.1 so the whole model is driven by the plan data.

## Background

`ServerAttr` already exists as a cSchedule distribution type that reads a service time from the **server** entity's attributes. There is no equivalent for the **customer** entity. This means models where service time varies by customer (job shops, patient pathways, order processing) cannot express that dependency without a workaround.

The Schedule distribution supports a `times[]` array for planned absolute arrival times. There is no mechanism to attach attribute values to each row. Any simulation driven by a capacity/demand plan needs to supply both timing and demand size per row.

## Scope

| ID | Item | File(s) |
|----|------|---------|
| S40.1 | `EntityAttr` cSchedule distribution — read service time from customer entity attribute | `distributions.js`, `phases.js`, `validation.js`, `components.jsx`, `CEventEditor.jsx` |
| S40.2 | Schedule `rows[]` — per-arrival attribute overrides | `distributions.js`, `phases.js`, `macros.js`, `components.jsx`, `EntityTypeEditor.jsx` |

---

### S40.1 — EntityAttr service time

**Model JSON** (cSchedule on a C-event):
```json
{
  "cSchedules": [{
    "eventId": "complete",
    "dist": "EntityAttr",
    "distParams": { "attr": "serviceTime" },
    "useEntityCtx": true
  }]
}
```

**Engine**: `phases.js` `fireCEvent` already has a special-cased branch for `ServerAttr` that bypasses the generic `sample()` path and reads directly from the server entity. An identical branch for `EntityAttr` reads from the customer entity (`effectCtx._lastCustId`).

**`distributions.js`**: Add `EntityAttr` to normalizer aliases and `DISTRIBUTIONS` registry (with `params: ["attr"]` so the DistPicker renders a text field for the attribute name).

**Validation**: `validation.js` already skips distribution validation for `ServerAttr`; extend to also skip `EntityAttr`.

**UI**: `DistPicker` renders `EntityAttr` automatically since it reads `DISTRIBUTIONS`. `CEventEditor` preview text updated to show `entity.<attrName>`.

---

### S40.2 — Schedule rows with per-arrival attributes

**Model JSON** (B-event schedule):
```json
{
  "schedules": [{
    "eventId": "arrive",
    "dist": "Schedule",
    "distParams": {
      "rows": [
        { "time": 10, "attrs": { "size": 5,  "priority": 2 } },
        { "time": 30, "attrs": { "size": 12, "priority": 1 } },
        { "time": 60, "attrs": { "size": 3,  "priority": 3 } }
      ]
    }
  }]
}
```

Backward-compatible: if `rows` is absent, the existing `times[]` path is used unchanged.

**`distributions.js`** Schedule sampler: when `distParams.rows` is present, use `rows[idx].time` for timing and write `rows[idx].attrs` to `context.state[__schedRowAttrs_<schedKey>]` before returning the delay.

**`phases.js`** `fireBEvent`: after computing the schedule delay, read `ctx.state[__schedRowAttrs_<schedKey>]` and attach it as `_scheduleRowAttrs` on the FEL entry.

**`macros.js`** ARRIVE: merge `ctx.felRef?._scheduleRowAttrs` over the entity's sampled attrs.

**UI**: Extend `ScheduleEditor` (in `components.jsx`) with a "Arrival attributes" toggle. When enabled, replaces the textarea with a table — one row per planned arrival — with a time column plus one column per entity attribute. `DistPicker` accepts an optional `attrDefs` prop and passes it to `ScheduleEditor`. `EntityTypeEditor` passes `et.attrDefs` to `DistPicker`.

## Acceptance Criteria

- [ ] C-event with `dist: "EntityAttr"` uses the customer entity's named attribute as service time
- [ ] If the attribute is missing on the entity, delay falls back to 0 with a log message
- [ ] `EntityAttr` visible in C-event schedule `DistPicker` dropdown; preview shows `entity.<attr>`
- [ ] Validation skips EntityAttr distribution parameter checks
- [ ] Schedule with `rows[]` delivers each arrival at the planned time with the row's attrs merged
- [ ] Rows mode is backward-compatible — models using `times[]` continue to work
- [ ] Schedule editor shows a rows table when attrDefs are provided and rows mode is toggled on
- [ ] Combined: schedule rows supply `serviceTime`; C-event uses EntityAttr → fully plan-driven model
- [ ] All existing tests pass; new tests cover each change

## Test Plan

| Test file | Coverage |
|-----------|---------|
| `tests/engine/distributions.test.js` | EntityAttr sample, Schedule rows time + attrs storage |
| `tests/engine/entity-attr-service.test.js` | Integration: EntityAttr service time; Schedule rows attr merge; combined end-to-end |
| `tests/engine/validation.test.js` | EntityAttr skips dist validation |
