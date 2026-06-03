# Sprint 72 Plan — Performance Optimisation

**Sprint:** 72  
**Theme:** Faster execution through condition-path simplification, Phase C optimisation, and measurable engine benchmarks  
**Date planned:** 2026-05-25  
**Branch:** `main`

---

## Objectives

1. Reduce execution cost for models with many C-events without changing Three-Phase correctness
2. Remove the legacy condition-string execution path so the engine evaluates one canonical condition format
3. Make performance work measurable, restartable, and regression-safe through benchmarks and focused tests

---

## Scope

| # | Item | Area | Files |
|---|------|------|-------|
| 72-1 | Baseline profiling and benchmark harness refresh | Engine / Tests / Docs | `tests/engine/perf_timing.js`, `docs/performance-envelope.md`, new benchmark fixtures as needed |
| 72-2 | Canonical condition contract audit and migration design | Engine / UI / Docs | `src/engine/conditions.js`, `src/ui/editors/ConditionBuilder.jsx`, `src/ui/editors/CEventEditor.jsx`, `src/ui/editors/BEventEditor.jsx`, `src/ui/editors/AiGeneratedModelPanel.jsx`, `src/engine/validation.js` |
| 72-3 | Load-time migration from legacy string conditions to predicate JSON | Engine / DB / UI | `src/db/models.js`, `src/ui/ModelDetail.jsx`, shared migration utility (new) |
| 72-4 | Remove legacy runtime condition execution path | Engine | `src/engine/conditions.js`, `src/engine/index.js`, `src/engine/phases.js` |
| 72-5 | Precompile predicate evaluators and dependency metadata at engine build time | Engine | `src/engine/conditions.js`, `src/engine/index.js` |
| 72-6 | Cache Phase C ordering and reduce repeated helper construction | Engine | `src/engine/index.js`, `src/engine/entities.js` (only if helper API needs small support changes) |
| 72-7 | Dirty-dependency filtering for Phase C candidate scans | Engine | `src/engine/index.js`, `src/engine/phases.js`, condition dependency helpers |
| 72-8 | Focused correctness and migration coverage | Tests | `tests/engine/conditions.test.js`, `tests/engine/three-phase.test.js`, new migration/benchmark tests, relevant UI/db tests |
| 72-9 | Documentation and architecture tracking update | Docs | `AGENTS.md`, `docs/simmodlr_Build_Plan.md`, `docs/simmodlr_Engineering_Spec.md`, closure report |

---

## Design principles

| Principle | Rationale |
|---|---|
| Preserve Three-Phase semantics | The restart rule and one-event-at-a-time Phase C firing are correctness rules, not optimisation candidates |
| One canonical condition format | Performance and maintainability both improve if runtime only evaluates predicate JSON |
| Migrate before deleting | Existing models must still open and run after legacy execution code is removed |
| Measure before and after | Every optimisation step must be backed by benchmark evidence, not intuition |
| Optimise the hot path first | Phase C scan cost and repeated condition evaluation are the main targets |
| Prefer additive checkpoints | Each task should leave the repo in a valid, resumable state if the sprint pauses mid-stream |

---

## Detailed plan

### 72-1: Baseline profiling and benchmark harness refresh

**Goal:** establish a trustworthy before/after performance baseline, especially for high-C-event models.

**Required work:**
- Re-run the existing timing harness and capture current baselines in `docs/performance-envelope.md`
- Add at least two named benchmark scenarios:
  - `many-c-events-mostly-false`
  - `many-c-events-high-churn`
- Record:
  - steps/sec
  - total wall time
  - number of C-event evaluations
  - number of Phase C passes
- Add one benchmark scenario that uses the current canonical predicate-object format only, so we can compare legacy-removal wins cleanly

**Deliverables:**
- Benchmark fixture definitions committed
- Updated baseline table in `docs/performance-envelope.md`
- A clear “pre-optimisation baseline” section timestamped for Sprint 72

**Restart checkpoint:** if the sprint stops here, we still have a reliable baseline and can resume optimisation later without re-discovering the hot path.

### 72-2: Canonical condition contract audit and migration design

**Goal:** identify every producer and consumer of legacy string conditions before touching runtime code.

**Audit checklist:**
- C-event conditions
- B-event routing conditions
- balk conditions
- any AI-generated model normalisation path
- validation rules that still read legacy strings
- any import/export path that preserves or emits strings

**Required outputs:**
- A file-by-file list of remaining legacy condition producers
- A canonical predicate shape for:
  - C-event conditions
  - routing branches
  - balk conditions
- A migration note covering:
  - load-time conversion
  - when migrated models are persisted back
  - how invalid legacy expressions are surfaced to users

**Restart checkpoint:** this task should leave a written migration map in the sprint closure notes or plan updates so we do not need to re-audit the codebase after interruption.

### 72-3: Load-time migration from legacy string conditions to predicate JSON

**Goal:** make old models safe to open before legacy execution support is removed.

**Required work:**
- Add a shared migration utility that converts supported legacy condition strings to predicate JSON
- Run migration when models are loaded into the editor/runtime
- Mark migrated models as dirty only when the canonicalized form differs materially
- Surface unsupported legacy strings as explicit validation or migration warnings, not silent fallbacks

**Important rules:**
- Do not mutate persisted rows silently in the background
- Do not attempt partial “best guess” conversion without surfacing a warning
- Keep migration deterministic and idempotent

**Acceptance notes:**
- A migrated model must run without the legacy condition evaluator
- Re-opening an already migrated model must not change it again

**Restart checkpoint:** once this lands, runtime removal can proceed safely even if the later optimisation tasks are delayed.

### 72-4: Remove legacy runtime condition execution path

**Goal:** delete the string-substitution evaluator from the hot path.

**Required work:**
- Remove runtime use of `evalCondition(conditionStr, helpers, state, clock)` for model execution
- Replace with predicate-only evaluation and compiled evaluators
- Keep a narrowly scoped parsing/migration helper only if needed for old saved models during load
- Remove now-obsolete comments, tests, and docs that describe runtime legacy string execution

**Do not do:**
- Do not leave an undocumented fallback to string execution in Phase C
- Do not keep dual execution paths indefinitely

**Restart checkpoint:** after this task, the engine should have exactly one supported runtime condition format.

### 72-5: Precompile predicate evaluators and dependency metadata at engine build time

**Goal:** shift repeated per-pass condition work into one-time engine setup.

**Required work:**
- For each condition-bearing construct, build and cache:
  - compiled evaluator function
  - dependency metadata
  - human-readable debug description if needed for trace output
- Dependencies should at minimum classify:
  - queue names
  - resource/server references
  - user state variables
  - entity attributes
  - global counters (`served`, `reneged`)
  - `clock`

**Implementation note:**
- Compiled evaluators must still use the safe predicate model; no `eval`, `Function`, or dynamic code execution

**Restart checkpoint:** if optimisation pauses here, we should already see a measurable gain from avoiding repeated interpretation.

### 72-6: Cache Phase C ordering and reduce repeated helper construction

**Goal:** remove repeated work inside the inner scan loop.

**Required work:**
- Pre-sort C-events once at engine build time if priorities are static during a run
- Move helper construction out of the per-event loop and into a pass-scoped or step-scoped cache
- Invalidate helper caches only when a B- or C-event actually changes relevant state

**Guardrail:**
- Trace output and diagnostics must remain correct
- Any cache invalidation logic must be simple enough to reason about during debugging

**Restart checkpoint:** this should be a small, independently verifiable optimisation even before dirty filtering lands.

### 72-7: Dirty-dependency filtering for Phase C candidate scans

**Goal:** avoid scanning every C-event after every state change.

**Required work:**
- Track which dependency buckets changed after a B-event or C-event fires
- Use those dirty buckets to build a candidate subset for the next restart scan
- Fall back to a full scan when:
  - dependency metadata is incomplete
  - `clock`-dependent conditions are present
  - a safety guard detects uncertainty

**Required safety checks:**
- Priority order is still respected within the candidate set
- Restart still begins at the highest-priority applicable candidate
- Full-scan fallback path remains available for debugging and correctness checks

**Restart checkpoint:** document the dependency invalidation rules in code comments and the closure report so we can reason about them later.

### 72-8: Focused correctness and migration coverage

**Goal:** ensure performance work does not quietly break simulation semantics.

**Required test coverage:**
- legacy string condition migration to predicate JSON
- predicate evaluation parity for supported legacy shapes
- Phase C restart correctness under filtered candidate scans
- trace/log behaviour unchanged where expected
- benchmark fixtures runnable locally without special setup
- one regression test with many C-events and deterministic outcome

**Recommended test groups:**
- `conditions.test.js`
- `three-phase.test.js`
- new `condition-migration.test.js`
- any focused UI/db tests needed for model-load migration

**Exit rule:** no optimisation task is considered complete without matching correctness coverage.

### 72-9: Documentation and architecture tracking update

**Goal:** keep the performance architecture understandable after the sprint.

**Required updates:**
- `AGENTS.md`
  - current sprint tracking
  - condition-runtime contract
  - any new architectural rule around predicate-only execution
- `docs/simmodlr_Build_Plan.md`
  - Sprint 72 entry
  - roadmap/history update
- `docs/simmodlr_Engineering_Spec.md`
  - canonical condition format
  - Phase C optimisation notes
- Sprint 72 closure report with:
  - before/after metrics
  - delivered tasks
  - deferred items
  - rollback notes if needed

---

## Sequence and dependency order

1. 72-1 Baseline profiling
2. 72-2 Contract audit
3. 72-3 Load-time migration
4. 72-4 Remove legacy runtime path
5. 72-5 Precompile evaluators
6. 72-6 Cache ordering/helpers
7. 72-7 Dirty filtering
8. 72-8 Correctness + benchmarks
9. 72-9 Documentation + closure

**Important:** 72-3 must complete before 72-4.  
**Important:** 72-8 runs throughout, but final verification must happen after 72-7.

---

## Acceptance criteria

| # | Criterion |
|---|-----------|
| AC-1 | Engine runtime no longer depends on legacy condition-string evaluation |
| AC-2 | Existing supported legacy condition models open and run through deterministic migration to predicate JSON |
| AC-3 | Phase C restart-rule correctness is preserved under all optimisation changes |
| AC-4 | Benchmark evidence shows a measurable improvement on high-C-event models |
| AC-5 | Helper caching and candidate filtering do not break trace, warnings, or termination behaviour |
| AC-6 | Focused regression tests cover migration, predicate execution, and filtered Phase C scans |
| AC-7 | Performance documentation records both pre- and post-optimisation baselines |
| AC-8 | The sprint can be resumed from any completed checkpoint without needing a fresh architecture rediscovery |

---

## Files likely to change

| File | Change |
|------|--------|
| `src/engine/conditions.js` | Remove legacy runtime execution path; add compiled predicate helpers and dependency extraction |
| `src/engine/index.js` | Cache sorted C-events; integrate compiled evaluators, helper caching, dirty filtering |
| `src/engine/phases.js` | Expose enough mutation/dependency information for dirty-set invalidation if needed |
| `src/engine/validation.js` | Canonical condition validation and migration warnings |
| `src/db/models.js` | Model-load normalization / migration support if persistence wrappers own that responsibility |
| `src/ui/ModelDetail.jsx` | Load migrated models safely into the editor |
| `src/ui/editors/ConditionBuilder.jsx` | Ensure emitted format is canonical predicate JSON only |
| `src/ui/editors/CEventEditor.jsx` | Remove legacy assumptions about condition strings |
| `src/ui/editors/BEventEditor.jsx` | Canonicalize routing and balk condition shapes |
| `src/ui/editors/AiGeneratedModelPanel.jsx` | Stop converting canonical conditions back into runtime legacy strings |
| `tests/engine/perf_timing.js` | Add Sprint 72 benchmark scenarios and reporting |
| `tests/engine/*.test.js` | Migration, correctness, and performance-focused regression coverage |
| `docs/performance-envelope.md` | Sprint 72 before/after benchmark record |

---

## Out of scope

- Changing Three-Phase semantics or the Phase C restart rule
- New modelling capabilities unrelated to execution performance
- Moving the engine off-browser or introducing a server runtime
- New dependencies for profiling or expression evaluation
- Broad UI redesign work unrelated to condition migration

---

## Exit gate

- Focused engine and migration tests pass
- Performance benchmark scenarios run successfully and record before/after data
- `npm run build` passes
- Legacy runtime condition execution path is removed
- Documentation is updated to the predicate-only contract
- Closure report records delivered work, deferred items, and measurable gains

---

## Current checkpoint

- Sprint 72 is planned only; no optimisation code is marked delivered yet
- Initial architectural direction is established:
  - remove legacy runtime condition execution
  - migrate old models on load
  - optimise Phase C through compilation, caching, and dependency filtering
- This plan is intended to be used as the restart document if work pauses mid-sprint
