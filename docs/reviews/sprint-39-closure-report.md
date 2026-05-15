# Sprint 39 — Closure Report

**Sprint:** 39 — Code Quality & Container Resource
**Completed:** 2026-05-15
**Branch:** `claude/review-sprints-31-33-0R5Mx`

## Delivered Scope

| Item | Description | Result |
|------|-------------|--------|
| S39.1 | M4: Queue discipline deduplication — `selectWaiting`/`listWaiting` exports | ✅ Done |
| S39.2 | M5: JSON predicate primary; `evalCondition` marked as backward-compat adapter | ✅ Done |
| S39.3 | G21: Container/level resource — engine, macros, validation, UI | ✅ Done |

## Detail

### S39.1 — Queue Discipline Deduplication (M4)

**Problem**: `entities.js` exposed discipline-sorted lists through the `helpers` wrapper (`waitingOf`, `waitingInQueue`, `selectWaitingOf`, `selectWaitingInQueue`). `ASSIGN()`, `BATCH()`, and `RENEGE_OLDEST()` each independently called `findQueueConfig` → extracted `discipline` → called a helper. Adding a new discipline required coordinated changes in at least three macros.

**Fix**: Two new top-level exports added to `entities.js`:

- `selectWaiting(token, discipline, entities, filterFn, isQueueName)` — single authoritative selector; returns the first entity sorted by discipline. `isQueueName=true` matches `entity.queue`; `false` matches `entity.type`.
- `listWaiting(token, discipline, entities, filterFn, isQueueName, includeBatches)` — sorted-list variant; `includeBatches=false` excludes batch entities.

`ASSIGN` now calls `listWaiting(cType, discipline, entities, filterFn, !!matchedQ)` — removing the duplicate `queueCandidates`/`typeCandidates` split and the dead `allWaiting` assignment.

`BATCH` now calls `listWaiting(queueName, discipline, entities, null, true, false)`.

`RENEGE_OLDEST` now calls `selectWaiting(cType, discipline, entities, null, !!matchedQ)`.

All three macros are now one-liners for candidate selection. A new discipline needs updating only in `queueDisciplineComparator`.

### S39.2 — Condition Language Consolidation (M5)

`evalCondition` is the legacy string evaluator inherited from pre-JSON-predicate models. It uses flat left-to-right AND/OR semantics with no precedence grouping — a different contract from `evaluatePredicate`'s explicit nesting.

**Fix**: The module-level docblock is updated to mark `evaluatePredicate` as the **primary** evaluator for all new conditions. A `BACKWARD-COMPAT ADAPTER` marker is added directly above `evalCondition` with an explicit note on the left-to-right semantics. No runtime code changed — existing models using string conditions continue to work identically.

Tests document the parity relationship and the left-to-right precedence behaviour explicitly, so future developers understand what is and is not guaranteed.

### S39.3 — Container / Level Resource (G21)

A **container** is a named continuous-level store (tank, buffer, inventory). It has a capacity and an initial level.

#### Engine state

`buildEngine()` now initialises per-container keys in `state` for each entry in `containerTypes[]`:
- `__container_<id>` — current level
- `__containerCap_<id>` — capacity
- `__containerMin_<id>` / `__containerMax_<id>` — tracked min/max
- `__containerIntegral_<id>` / `__containerPrev_<id>` — time-integral accumulator for avg

#### Macros

**`FILL(containerName, amount)`** — B-event macro:
- Flushes the time-integral before changing level
- Adds `amount`; clamps to capacity
- Emits trace entry `{ event: "Fill", container, amount, level, time }`
- Messages if container not declared or amount invalid

**`DRAIN(containerName, amount)`** — C-event macro:
- Guard: `level >= amount` (if false, logs guard-failed message and returns)
- Flushes time-integral before subtracting
- Subtracts `amount`; emits `{ event: "Drain", container, amount, level, time }` trace
- Multiple simultaneous DRAIN C-events on the same container resolve via standard Phase C priority restart

#### Snapshot

`snap()` now includes `containers: { [id]: { level, capacity } }` — used by the execute canvas for display.

#### Summary

`getSummary()` now includes `containerLevels: { [id]: { min, max, avg, final } }`. Average is computed via time-integral (same pattern as `avgWIP`).

#### Validation

- `V26` — container `id` must be non-empty and unique; `capacity` must be > 0; `initialLevel` must be ≥ 0 and ≤ capacity
- `V27` — `FILL`/`DRAIN` in any B- or C-event must reference a declared container (case-insensitive)

#### UI

- `ContainerEditor.jsx` — add/remove containers; id/capacity/initialLevel fields
- `helpers.jsx` — `bEffectOptions` extended with FILL options per container; `assignOptions` extended with DRAIN options
- Both extended functions accept an optional `containerTypes` parameter (backward-compatible default `[]`)
- `editors/index.jsx` — exports `ContainerEditor`

## Files changed

| File | Change |
|------|--------|
| `src/engine/entities.js` | Added `selectWaiting()` and `listWaiting()` exports (NEW exports) |
| `src/engine/macros.js` | Import `selectWaiting`/`listWaiting`; simplified ASSIGN, BATCH, RENEGE_OLDEST; added FILL and DRAIN macros |
| `src/engine/conditions.js` | Module header updated; `evalCondition` marked as backward-compat adapter |
| `src/engine/index.js` | Container state init; `snap()` includes `containers`; `getSummary()` includes `containerLevels` |
| `src/engine/validation.js` | V26 (container config) and V27 (FILL/DRAIN reference) rules |
| `src/ui/editors/ContainerEditor.jsx` | New container types panel (NEW) |
| `src/ui/editors/helpers.jsx` | `bEffectOptions` and `assignOptions` extended with container FILL/DRAIN options |
| `src/ui/editors/index.jsx` | Exports `ContainerEditor` |
| `tests/engine/entities.test.js` | `selectWaiting`/`listWaiting` unit tests for all 5 disciplines; ASSIGN integration tests |
| `tests/engine/conditions.test.js` | `evalCondition` adapter parity tests and mixed-precedence documentation |
| `tests/engine/container.test.js` | FILL/DRAIN mechanics, clamping, summary, round-trip (NEW) |
| `tests/engine/validation.test.js` | V26 and V27 rule tests |
| `tests/ui/editors/container-editor.test.jsx` | ContainerEditor add/remove/edit/round-trip tests (NEW) |

## Test results

```
tests/engine/entities.test.js              26/26 pass  (added 15 new)
tests/engine/conditions.test.js            +10 new tests
tests/engine/container.test.js             9/9   pass  (NEW)
tests/engine/validation.test.js            +10 new tests
tests/ui/editors/container-editor.test.jsx 6/6   pass  (NEW)
Full suite: 1214/1214 pass (93 test files)
```

## Acceptance criteria — final status

- [x] `selectWaiting()` is the single queue discipline selector; `ASSIGN()`, `BATCH()`, and `RENEGE_OLDEST()` all delegate to it; no duplicate sort logic remains in `macros.js`
- [x] Integration tests for all 5 disciplines pass through `ASSIGN()` path
- [x] String conditions continue to evaluate identically after M5 adapter wrapping; all existing condition tests pass
- [x] New tests cover mixed `AND`/`OR` precedence documentation
- [x] `containerTypes[]` round-trips through save/load without corruption (editor tests)
- [x] `FILL` macro adds to container level; clamps at capacity; emits trace entry
- [x] `DRAIN` C-event fires only when level ≥ amount; subtracts correctly; emits trace entry
- [x] `summary.containerLevels` reports min/max/avg/final for each declared container
- [x] Container snapshot visible in each step (`.containers` key on snap)
- [x] Validation blocks FILL/DRAIN referencing undeclared containers (V27)
- [x] Validation blocks invalid capacity/initialLevel (V26)
- [x] All existing tests pass; 53 new tests cover each item above
