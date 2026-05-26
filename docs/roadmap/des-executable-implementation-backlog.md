# DES Executable Implementation Backlog

Date: 2026-05-26  
Scope: Implementation backlog derived from existing DES runtime, benchmark, validation, storage, and roadmap docs. This backlog prioritizes code-delivering work over further analysis.

## Prioritization Notes

- The first five items are intentionally small enough for Codex to implement one at a time.
- Existing benchmark infrastructure must be reused:
  - `npm run bench`
  - `npm run bench:timing`
  - `tests/engine/perf_timing.js`
  - `tests/engine/benchmark-scenarios.js`
- Do not create a second benchmark framework.

## Item 1: Surface Runtime Metrics In Results UI

- Epic: Runtime Instrumentation
- Priority: P0
- Goal: Show the existing `runtimeMetrics` block in the results experience so users can inspect runtime cost without opening raw JSON.
- Files likely involved:
  - `src/ui/results/ResultsWorkspace.jsx`
  - `src/ui/results/resultsViewModel.js`
  - `src/ui/execute/index.jsx`
  - `tests/ui/results/results-workspace.test.jsx`
  - `tests/ui/execute/execute-panel.test.jsx`
- Implementation steps:
  1. Read the saved/runtime result shape already returned from `runAll()` and batch results.
  2. Add a compact Runtime Metrics panel or card group to the results workspace.
  3. Show at minimum:
     - `wall_clock_ms`
     - `replications`
     - `events_processed`
     - `c_event_scans`
     - `c_events_fired`
     - `entities_created`
     - `entities_completed`
     - `max_queue_length_by_queue`
  4. Handle missing metrics gracefully for older runs.
- Tests required:
  - results workspace renders runtime metrics when present
  - older runs with no `runtimeMetrics` do not crash and show fallback UI
  - single-run and batch result shapes both render correctly
- Acceptance criteria:
  - users can see runtime metrics in the UI for new runs
  - older stored runs remain readable
  - no changes to simulation semantics
- Dependencies:
  - existing runtime metrics implementation in `src/engine/index.js` and save path
- Out of scope:
  - adding new runtime metrics
  - promoting metrics to SQL columns

## Item 2: Move Execute-Only Replication And Warm-Up Checks Into Shared Validation

- Epic: Validation / Admission
- Priority: P0
- Goal: Remove the current split where `replications >= 1` and `warmupPeriod < maxSimTime` are enforced only in Execute UI logic.
- Files likely involved:
  - `src/engine/validation.js`
  - `src/ui/execute/index.jsx`
  - `tests/engine/validation.test.js`
  - `tests/ui/execute/execute-panel.test.jsx`
- Implementation steps:
  1. Add explicit validation rules for:
     - replication count must be a positive integer
     - warm-up period must be less than the run duration in time mode
  2. Stop pushing these checks ad hoc inside `src/ui/execute/index.jsx`.
  3. Keep message wording plain-English and aligned with existing validator issue shapes.
  4. Avoid reusing overloaded rule codes if they currently map to unrelated checks.
- Tests required:
  - new engine validation tests for both failures
  - Execute panel continues to block runs through shared validation output
  - valid runs are unaffected
- Acceptance criteria:
  - the same validation outcome is available outside Execute
  - Execute no longer owns these checks privately
  - error messages appear through the normal validation path
- Dependencies:
  - existing `validateModel()` integration in Execute
- Out of scope:
  - tier-based replication limits
  - planned-row limits

## Item 3: Add Numeric Priority-Type Enforcement For PRIORITY Queues

- Epic: Validation / Lifecycle Safety
- Priority: P0
- Goal: Tighten `V4` so a PRIORITY queue requires a numeric `priority` attribute, not just a same-named attribute.
- Files likely involved:
  - `src/engine/validation.js`
  - `tests/engine/validation.test.js`
  - optional documentation touch in `docs/analysis/des-validation-gap-review.md`
- Implementation steps:
  1. Update the `V4` validation logic to require `valueType === "number"` for `priority`.
  2. Preserve the current missing-entity-type and missing-attribute checks.
  3. Keep the validation message specific about numeric requirement.
- Tests required:
  - PRIORITY queue with numeric `priority` passes
  - PRIORITY queue with string `priority` fails
  - PRIORITY queue with missing `priority` still fails
- Acceptance criteria:
  - priority queues cannot validate unless the bound entity type has numeric priority
  - existing FIFO/LIFO models are unaffected
- Dependencies:
  - existing `V4` rule
- Out of scope:
  - priority-discipline engine optimization
  - UI editor guidance changes beyond current validation surfacing

## Item 4: Add Failure-Model Validation For Server MTBF / MTTR

- Epic: Validation / Admission
- Priority: P0
- Goal: Validate server failure-model completeness before runtime.
- Files likely involved:
  - `src/engine/validation.js`
  - `src/ui/editors/EntityTypeEditor.jsx`
  - `tests/engine/validation.test.js`
- Implementation steps:
  1. Add validation that only server entity types may define failure-model fields.
  2. Require both sides of the failure model together:
     - `mtbfDist` + params
     - `mttrDist` + params
  3. Reuse existing distribution validation helpers for the MTBF/MTTR distributions.
  4. Keep messages specific about incomplete or invalid failure models.
- Tests required:
  - valid server failure model passes
  - MTBF without MTTR fails
  - MTTR without MTBF fails
  - non-server entity with failure fields fails
- Acceptance criteria:
  - incomplete server failure specs are blocked before execution
  - valid server failure models still run as before
- Dependencies:
  - existing distribution validation helper in `validation.js`
  - runtime use of MTBF/MTTR in `src/engine/index.js`
- Out of scope:
  - failure-model UI redesign
  - failure/repair runtime behavior changes

## Item 5: Add Compact Results-Payload Sizing At Save Time

- Epic: Cost Monitoring / Retention
- Priority: P0
- Goal: Measure approximate saved results payload size so storage and retention policy can be driven by data.
- Files likely involved:
  - `src/db/models.js`
  - `src/db/local.js`
  - `tests/db/models.test.js`
  - optional `src/ui/results/ResultsWorkspace.jsx`
- Implementation steps:
  1. Compute `JSON.stringify(resultsJson).length` at save time.
  2. Store the byte count inside `results_json` metadata for now, rather than adding schema.
  3. Preserve backward compatibility for old runs.
  4. Optionally surface the value in the runtime/results UI if trivial.
- Tests required:
  - persisted run includes results payload size metadata
  - local save path includes the same metadata
  - save still succeeds for older result shapes
- Acceptance criteria:
  - each newly saved run has an approximate payload-size measurement
  - no schema migration required
- Dependencies:
  - existing save path in `src/db/models.js`
- Out of scope:
  - retention compaction
  - object-storage artifact split

## Item 6: Add `runAdmission` Helper For Tier And Sizing Decisions

- Epic: Validation / Admission
- Priority: P1
- Goal: Introduce a pure admission-decision helper that combines validation, complexity estimate, and platform/tier policy without changing execution semantics yet.
- Files likely involved:
  - new `src/engine/run-admission.js` or similar
  - `src/engine/complexity-estimator.js`
  - `src/ui/execute/index.jsx`
  - `tests/engine/run-admission.test.js`
  - `tests/ui/execute/run-admission.test.jsx`
- Implementation steps:
  1. Define a pure output contract with:
     - hard errors
     - warnings
     - confirmations
     - effective execution flags such as `collectTimeSeries = false`
  2. Read complexity estimate and selected run settings.
  3. Start with policy already documented in `des-run-admission-rules.md`.
  4. Wire the helper into Execute before run launch.
- Tests required:
  - over-limit replications blocked
  - planned-row and scan thresholds classified correctly
  - expensive options auto-disabled for large runs
- Acceptance criteria:
  - run admission decisions are centralized and testable
  - Execute no longer contains scattered sizing policy logic
- Dependencies:
  - complexity estimator
  - validation output
  - platform/tier policy source
- Out of scope:
  - backend enforcement
  - dedicated worker routing

## Item 7: Enforce Planned-Row Counting In Admission

- Epic: Validation / Admission
- Priority: P1
- Goal: Count planned schedule rows (`rows` / `times`) before execution and use them in admission decisions.
- Files likely involved:
  - `src/engine/complexity-estimator.js`
  - new `src/engine/run-admission.js`
  - `tests/engine/complexity-estimator.test.js`
  - `tests/engine/run-admission.test.js`
- Implementation steps:
  1. Add explicit planned-row counting helper if not already isolated.
  2. Feed the count into admission policy.
  3. Produce user-facing messages when planned-row limits or warnings are hit.
- Tests required:
  - exact planned-row counting from schedule rows
  - limits trigger expected error/warning levels
- Acceptance criteria:
  - planned-row size is a first-class admission input
  - large imported schedules can be warned or blocked before run
- Dependencies:
  - Item 6
- Out of scope:
  - changing import transport format

## Item 8: Auto-Disable `collectTimeSeries` For Large Runs

- Epic: Cost Monitoring / Admission
- Priority: P1
- Goal: Prevent expensive time-series persistence on large runs while preserving smaller-run analysis.
- Files likely involved:
  - new `src/engine/run-admission.js`
  - `src/ui/execute/index.jsx`
  - `tests/ui/execute/execute-panel.test.jsx`
  - `tests/engine/run-admission.test.js`
- Implementation steps:
  1. Use admission output to disable `collectTimeSeries` when run size/risk requires it.
  2. Show clear UI messaging that the option was disabled for this run.
  3. Persist the effective setting in saved run metadata.
- Tests required:
  - large run auto-disables time series
  - small run leaves user choice unchanged
  - saved run metadata reflects the effective setting
- Acceptance criteria:
  - large runs no longer persist time-series data by default
  - users are informed when the system overrides the setting
- Dependencies:
  - Item 6
- Out of scope:
  - time-series downsampling
  - chart redesign

## Item 9: Add Queue-Depth Scaling Benchmark Scenario

- Epic: Benchmark Suite
- Priority: P1
- Goal: Add one explicit queue-depth-scaling scenario to the existing local timing runner to support compute-sizing decisions.
- Files likely involved:
  - `tests/engine/benchmark-scenarios.js`
  - `tests/engine/perf_timing.js`
  - `docs/performance-envelope.md`
  - `docs/analysis/des-benchmark-inventory-and-gaps.md`
- Implementation steps:
  1. Add a scenario family that varies load or service rate to force controlled queue-depth growth.
  2. Keep it local timing only unless it proves stable and fast enough for CI.
  3. Report the same metrics already used by the current timing runner.
- Tests required:
  - timing runner executes the new scenario
  - output shape remains stable
- Acceptance criteria:
  - the repo can compare runtime against queue-growth pressure using the existing runner
  - no new benchmark framework is introduced
- Dependencies:
  - existing benchmark runner
- Out of scope:
  - CI promotion unless justified later

## Item 10: Add Legacy-String Vs Predicate-Object Benchmark Pair

- Epic: Benchmark Suite
- Priority: P2
- Goal: Quantify the runtime cost difference between legacy string conditions and canonical predicate-object conditions in C-heavy scenarios.
- Files likely involved:
  - `tests/engine/benchmark-scenarios.js`
  - `tests/engine/perf_timing.js`
  - `docs/performance-envelope.md`
  - `docs/analysis/three-phase-engine-efficiency-review.md`
- Implementation steps:
  1. Clone one existing C-heavy scenario in two formats:
     - legacy string condition
     - structured predicate object
  2. Run both through the existing timing runner.
  3. Document comparative evidence in the performance envelope.
- Tests required:
  - scenario creation works in both forms
  - timing runner output stays stable
- Acceptance criteria:
  - the team has benchmark evidence for future legacy-format migration work
- Dependencies:
  - existing benchmark runner
- Out of scope:
  - automatic migration tooling

## Item 11: Add Single-Run Worker Progress Contract

- Epic: Browser Runtime
- Priority: P2
- Goal: Reuse the existing worker/progress pattern so large single runs can emit progress events without immediately redesigning all execution paths.
- Files likely involved:
  - `src/engine/index.js`
  - `src/engine/worker.js`
  - `src/engine/replication-runner.js`
  - `src/ui/execute/index.jsx`
  - `tests/engine/replication-runner.test.js`
  - `tests/ui/execute/execute-panel.test.jsx`
- Implementation steps:
  1. Add an additive observer/progress hook to the engine.
  2. Define shared progress event shape for batch and single-run modes.
  3. Use the existing Execute progress UI patterns where possible.
- Tests required:
  - progress callback emits expected shape
  - final result remains identical when no observer is provided
  - Execute renders single-run progress state
- Acceptance criteria:
  - a large single run can report progress without blocking all UX feedback
- Dependencies:
  - runtime metrics baseline
  - progress/cancellation design
- Out of scope:
  - full dedicated worker execution

## Item 12: Add Cooperative Cancellation For Single Runs

- Epic: Browser Runtime
- Priority: P2
- Goal: Allow single runs to stop at safe engine checkpoints and return a clearly marked partial result.
- Files likely involved:
  - `src/engine/index.js`
  - `src/ui/execute/index.jsx`
  - `tests/ui/execute/execute-panel.test.jsx`
  - new engine cancellation tests
- Implementation steps:
  1. Add `shouldCancel()` checkpoint support in the engine.
  2. Stop only at safe boundaries.
  3. Return a partial/cancelled result shape and display it clearly in the UI.
- Tests required:
  - cancelled run stops at checkpoint
  - partial result is labeled correctly
  - normal completed runs are unchanged
- Acceptance criteria:
  - single-run cancellation works without corrupting state
  - cancelled runs are distinguishable from failures
- Dependencies:
  - Item 11
- Out of scope:
  - persistence of cancelled partial runs

## Item 13: Introduce Compact-First Large-Run Persistence

- Epic: Storage / Retention
- Priority: P2
- Goal: For large runs, persist compact summaries by default and avoid storing the riskiest bulky fields automatically.
- Files likely involved:
  - `src/db/models.js`
  - `src/db/local.js`
  - `tests/db/models.test.js`
  - `docs/architecture/des-results-storage-strategy.md`
- Implementation steps:
  1. Define a compact large-run persistence path.
  2. Exclude or trim heavy fields such as:
     - raw log
     - large time series
     - oversized entity detail
  3. Preserve runtime metrics and summary fields.
- Tests required:
  - compact large-run save shape is persisted correctly
  - small-run save path remains backward compatible
- Acceptance criteria:
  - large runs no longer save the full richest payload by default
  - run history and result loading still work
- Dependencies:
  - Item 5
  - admission/risk classification
- Out of scope:
  - Supabase Storage artifact split
  - immutable-row policy redesign

## Item 14: Add Composite Run-History Index Migration

- Epic: Storage / Retention
- Priority: P2
- Goal: Improve run-history query efficiency using the query pattern already documented in storage review.
- Files likely involved:
  - new migration under `supabase/migrations/`
  - optional `docs/analysis/supabase-des-compute-and-storage-review.md`
- Implementation steps:
  1. Add composite index on `(model_id, archived, ran_at DESC)`.
  2. Keep the migration narrowly scoped and low risk.
  3. Document the new index in the storage review if needed.
- Tests required:
  - migration smoke validation if migration tests exist
  - no application logic regression tests required beyond existing run-history reads
- Acceptance criteria:
  - migration is safe and aligns with current query shape
- Dependencies:
  - existing run-history query pattern
- Out of scope:
  - payload-shape changes

## Item 15: Add Dedicated Worker Submission Skeleton

- Epic: Dedicated Simulation Worker
- Priority: P3
- Goal: Create the smallest control-plane slice needed to submit and track off-browser jobs without moving all execution at once.
- Files likely involved:
  - new Supabase migration for job table
  - `src/db/models.js`
  - `src/ui/execute/index.jsx`
  - new job-status tests
- Implementation steps:
  1. Add job table/state skeleton.
  2. Add browser submission path for runs classified as non-browser candidates.
  3. Keep execution backend stubbed or minimal at first.
- Tests required:
  - job row creation
  - UI reflects queued/running state
  - auth/ownership checks on job reads
- Acceptance criteria:
  - the app can create a job envelope for future dedicated execution
- Dependencies:
  - admission layer
  - dedicated-worker architecture
- Out of scope:
  - full worker service implementation
  - retry and autoscaling

## Suggested Execution Order

1. Item 1
2. Item 2
3. Item 3
4. Item 4
5. Item 5
6. Item 6
7. Item 7
8. Item 8
9. Item 9
10. Item 10
11. Item 11
12. Item 12
13. Item 13
14. Item 14
15. Item 15

## Recommendation

If Codex is executing this backlog one item at a time, start with the first five in order. They are the best combination of:

- small reviewable diffs
- direct code delivery
- strong leverage for the later admission, retention, and worker work

## Verification

No tests were run in this task because the prompt requested a backlog document only.
