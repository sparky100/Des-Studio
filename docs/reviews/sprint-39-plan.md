# Sprint 39 — Plan

**Sprint:** 39 — Code Quality & Container Resource
**Branch:** `claude/review-sprints-31-33-0R5Mx`
**Date:** 2026-05-15

## Objective

Close two medium-severity code quality findings from the architecture review (M4, M5) and deliver the highest-value remaining capability gap (G21 — Container/level resource), bringing the engine architecture closer to the recommended single-responsibility model.

## Background

Two medium findings from the architecture review (v3.0) remain open:

- **M4** — Queue discipline selection logic is duplicated between `entities.js` (`waitingOf()`) and `macros.js` (`ASSIGN()`). Adding a new discipline or fixing a sorting bug requires two coordinated changes, creating inconsistency risk.
- **M5** — Two parallel condition languages coexist: the legacy flat string evaluator in `conditions.js:145–205` (`evalCondition`) and the JSON predicate evaluator (`evaluatePredicate`). They have different operator precedence semantics, making conditions authored in one incompatible with the other's model.

One capability gap is the highest-value remaining item:

- **G21** — Container/level resource (SimPy `Container`). Implementable as a named continuous-level state variable with `FILL` (B-event macro, always fires) and `DRAIN` (C-event with a level guard). Covers inventory systems, fuel tanks, buffer pools, and fluid queues.

## Scope

| ID | Item | File(s) |
|----|------|---------|
| S39.1 | M4: Unify queue discipline selection | `src/engine/entities.js`, `src/engine/macros.js` |
| S39.2 | M5: JSON predicate primary; string as adapter | `src/engine/conditions.js` |
| S39.3 | G21: Container resource — model, engine, macros, UI | `src/engine/distributions.js` (no change), `src/engine/macros.js`, `src/engine/index.js`, `src/engine/validation.js`, `src/ui/shared/components.jsx`, `src/ui/editors/` |

---

### S39.1 — Queue Discipline Deduplication (M4)

**Problem**: `entities.js:95–112` implements discipline-sorted entity selection in `waitingOf()`. `macros.js:221–236` repeats the same sort logic inline inside `ASSIGN()`. `BATCH()` has a third variant. If a discipline is added or a bug is fixed, all three must change.

**Fix**: Extract `selectWaiting(queueName, discipline, entities)` as the single, exported helper in `entities.js`. Rewrite `ASSIGN()`, `BATCH()`, and `RENEGE_OLDEST()` to delegate to it.

```javascript
// entities.js — single authoritative selector
export function selectWaiting(queueName, discipline, entities) {
  const waiting = entities.filter(e => e.status === "waiting" && e.waitingFor === queueName);
  // ... existing sort logic (FIFO/LIFO/PRIORITY/SPT/EDD) ...
  return waiting[0] ?? null;
}
```

All callers in `macros.js` become one-liners: `const cust = selectWaiting(queueName, discipline, ctx.entities)`.

**Tests**: One integration test per discipline (FIFO, LIFO, PRIORITY, SPT, EDD) routed through `ASSIGN()` — not just `waitingOf()` — to assert selection correctness end-to-end.

---

### S39.2 — Condition Language Consolidation (M5)

**Problem**: `evalCondition(condition, ctx)` at `conditions.js:145–205` handles string conditions with flat left-to-right `AND`/`OR` semantics. `evaluatePredicate(pred, ctx)` at `conditions.js:114–123` handles JSON predicates with explicit nesting. Models authored in either format behave differently under mixed precedence.

**Fix**:
1. Make `evaluatePredicate` the primary runtime evaluator for all new conditions.
2. Wrap `evalCondition` as a backward-compatibility adapter: detect string input, parse it into an equivalent JSON predicate, then delegate to `evaluatePredicate`.
3. The parser covers the common patterns: `A AND B`, `A OR B`, `A AND B OR C` (left-to-right flat, matching current behaviour to avoid breaking existing models), and direct comparisons.
4. Add a module-level comment to `evalCondition` marking it as the compatibility adapter — not for new authoring.

**Tests**:
- String conditions with `AND`/`OR` produce the same boolean result as equivalent JSON predicates
- Mixed precedence test documenting left-to-right vs explicit-nesting semantics
- Import/round-trip test: a saved string condition is correctly evaluated after adapter wrapping

---

### S39.3 — Container / Level Resource (G21)

A Container is a named continuous-level store with a capacity. Entities `FILL` it (always succeeds, fires immediately as a B-event); entities `DRAIN` it (only when level ≥ requested amount, fires as a C-event).

#### Model JSON

```jsonc
{
  "containerTypes": [
    {
      "id": "Fuel",
      "capacity": 1000,
      "initialLevel": 500
    }
  ]
}
```

#### Engine State

`buildEngine()` initialises `state.__container_<id>` to `initialLevel` for each container type.

#### Macros

**`FILL(containerName, amount)`** — B-event macro:
- Adds `amount` to `state.__container_<containerName>`
- Clamps to container capacity
- Emits `{ event: "Fill", container: containerName, amount, level: newLevel }` trace entry

**`DRAIN(containerName, amount)`** — C-event macro:
- Guard: `state.__container_<containerName> >= amount`
- On fire: subtracts `amount`, emits `{ event: "Drain", container: containerName, amount, level: newLevel }` trace entry
- If multiple DRAIN C-events share the same container, they fire in priority order (standard Phase C restart)

#### Validation

- V-rule: container referenced by FILL/DRAIN must be declared in `containerTypes[]`
- V-rule: `initialLevel` must be ≥ 0 and ≤ `capacity`
- V-rule: `amount` in FILL/DRAIN must be a positive number expression

#### UI

- **Container Types panel** (new section in the model editor): add/remove containers, set id/capacity/initialLevel
- **FILL macro** in B-event action picker: `containerName` dropdown + `amount` expression field
- **DRAIN macro** in C-event action picker (C-event condition implicitly becomes `level >= amount`; user fills in amount)
- Execute canvas: container level displayed as a labelled gauge (fill bar) on the canvas, updated per step

#### Summary Output

`summary.containerLevels`: map of `containerName → { min, max, avg, final }` — time-integral average level using the same pattern as WIP.

## Acceptance Criteria

- [ ] `selectWaiting()` is the single queue discipline selector; `ASSIGN()`, `BATCH()`, and `RENEGE_OLDEST()` all delegate to it; no duplicate sort logic remains in `macros.js`
- [ ] Integration tests for all 5 disciplines pass through `ASSIGN()` path
- [ ] String conditions continue to evaluate identically after M5 adapter wrapping; all existing condition tests pass
- [ ] New JSON predicate tests cover mixed `AND`/`OR` precedence documentation
- [ ] `containerTypes[]` round-trips through save/load without corruption
- [ ] `FILL` macro adds to container level; clamps at capacity; emits trace entry
- [ ] `DRAIN` C-event fires only when level ≥ amount; subtracts correctly; emits trace entry
- [ ] Two simultaneous DRAIN events on the same container resolve in priority order
- [ ] `summary.containerLevels` reports min/max/avg/final for each declared container
- [ ] Container gauge visible on execute canvas; updates per step
- [ ] Validation blocks FILL/DRAIN referencing undeclared containers
- [ ] All existing tests pass; new tests cover each item above

## Test Plan

| Test file | Coverage |
|-----------|---------|
| `tests/engine/entities.test.js` | `selectWaiting()` for all 5 disciplines; ASSIGN delegation |
| `tests/engine/conditions.test.js` | String adapter parity with JSON predicate; mixed precedence doc test |
| `tests/engine/container.test.js` | FILL/DRAIN mechanics, clamping, level tracking, simultaneous drains, C-event guard |
| `tests/engine/validation.test.js` | Undeclared container reference, invalid capacity/initialLevel |
| `tests/ui/editors/container-editor.test.jsx` | Add/remove container, round-trip save |
