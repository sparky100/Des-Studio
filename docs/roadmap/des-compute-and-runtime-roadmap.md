# DES Compute And Runtime Roadmap

Date: 2026-05-26  
Scope: Phased implementation roadmap only. No code changes in this task.

## Existing Benchmark Baseline

- Existing benchmark scripts found:
  - `tests/engine/mm1_benchmark.js`
  - `tests/engine/mmc_benchmark.js`
  - `tests/engine/perf_timing.js`
  - `tests/engine/benchmarks/benchmarks.test.js`
  - `tests/engine/benchmarks/performance.test.js`
  - `tests/benchmarks/golden.test.js`
- Existing benchmark fixtures/models found:
  - `tests/engine/benchmark-scenarios.js`
  - `src/engine/templates.js`
  - scenario coverage already includes:
    - `mm1-small`
    - `mm1-high-util`
    - `post-office-multi-stage`
    - `glasgow-train-plan`
    - `stadium-grouped-spectators`
    - `large-queues-stress`
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/analysis/des-benchmark-suite.md`
  - `docs/analysis/des-benchmark-inventory-and-gaps.md`
  - `docs/analysis/three-phase-engine-efficiency-review.md`
- Existing runtime metrics found:
  - `wall_clock_ms`
  - `replications`
  - `events_processed`
  - `c_event_scans`
  - `c_events_fired`
  - `entities_created`
  - `entities_completed`
  - `max_queue_length_by_queue`
  - `max_future_event_list_size`
- Existing test coverage related to performance:
  - benchmark gate coverage under `tests/engine/benchmarks/**`
  - worker/progress coverage in `tests/engine/replication-runner.test.js`
  - runtime metric assertions in engine/UI/db tests
- Gaps compared with the requested benchmark/sizing goal:
  - queue-depth scaling and payload-size sizing are still weakly benchmarked
  - browser single-run progress/cancellation is not benchmark-backed yet
  - some sizing controls exist only as docs/design notes, not enforced code

## Roadmap Principles

- Reuse the existing benchmark structure.
  - Keep `npm run bench` as the CI correctness/performance gate.
  - Keep `tests/engine/perf_timing.js` plus `tests/engine/benchmark-scenarios.js` as the local timing/sizing harness.
- Do not create a second benchmark framework.
- Separate:
  - schema validation
  - run admission
  - execution placement
  - retention/cost controls
- Prefer additive implementation slices with focused tests.

## Phase 0: Factual Architecture Map

### Objective

Lock down the current reality of where DES execution, validation, persistence, and cloud responsibilities live before enforcing new limits or moving compute.

### Current benchmark/assets baseline relevant to the phase

- Runtime location and storage reviews already exist:
  - `docs/analysis/des-runtime-execution-map.md`
  - `docs/analysis/supabase-des-compute-and-storage-review.md`
  - `docs/analysis/cloudflare-des-runtime-review.md`
  - `docs/analysis/browser-simulation-performance-review.md`
- Benchmark baseline already documents current engine performance envelope:
  - `docs/performance-envelope.md`
  - `docs/analysis/des-benchmark-inventory-and-gaps.md`

### Tasks

1. Treat the existing architecture docs as the canonical baseline.
2. Keep them current whenever execution placement changes.
3. Ensure future worker or backend changes update:
   - runtime map
   - Supabase storage review
   - Cloudflare review
   - browser-performance review

### Files likely to change

- `docs/analysis/des-runtime-execution-map.md`
- `docs/analysis/supabase-des-compute-and-storage-review.md`
- `docs/analysis/cloudflare-des-runtime-review.md`
- `docs/analysis/browser-simulation-performance-review.md`

### Risks

- Teams may start enforcing limits based on outdated assumptions.
- “Browser worker” and “Cloudflare Worker” can still be confused if docs drift.

### Test strategy

- Documentation review only.
- Spot-check code references when these docs are updated.

### Acceptance criteria

- There is one clear, current answer to:
  - where simulation runs
  - where results are stored
  - what Supabase does
  - what Cloudflare does not do

## Phase 1: Instrumentation

### Objective

Capture enough runtime cost data to make sizing, admission, and retention decisions evidence-based.

### Current benchmark/assets baseline relevant to the phase

- Design note:
  - `docs/analysis/des-runtime-instrumentation-plan.md`
- Minimal implementation already landed:
  - `docs/analysis/des-runtime-metrics-implementation.md`
- Existing runtime metrics already returned and persisted.
- Existing timing harness already reads runtime metrics:
  - `tests/engine/perf_timing.js`

### Tasks

1. Keep the current minimal runtime metrics stable.
2. Surface runtime metrics in more user-facing results views if still missing.
3. Add payload-size measurement and retention-relevant metadata later:
   - approximate `results_json` byte size
4. Add only low-overhead next metrics when benchmarked:
   - queue averages if justified
   - utilisation summaries where not already covered

### Files likely to change

- `src/engine/index.js`
- `src/ui/execute/index.jsx`
- `src/ui/results/**`
- `src/db/models.js`
- `tests/engine/perf_timing.js`
- `tests/engine/*runtime*`
- `tests/ui/execute/execute-panel.test.jsx`
- `tests/db/models.test.js`

### Risks

- Instrumentation can slow the hottest engine paths, especially Phase C.
- Result payloads can grow if too much per-run metadata is stored.

### Test strategy

- Existing engine/UI/db tests for runtime metrics
- Local timing comparison with:
  - `npm run bench:timing`
  - `node tests/engine/perf_timing.js --json`
- Ensure no material regression in benchmark envelope

### Acceptance criteria

- Single runs and batch runs both return stable `runtimeMetrics`.
- Saved runs preserve runtime metrics in `results_json`.
- The team can compare engine work across scenarios using shared field names.

## Phase 2: Validation / Admission Rules

### Objective

Block or warn on models that are invalid, structurally unsafe, or too expensive for the current execution tier before execution begins.

### Current benchmark/assets baseline relevant to the phase

- Validation review:
  - `docs/analysis/des-validation-gap-review.md`
- Lifecycle validation update:
  - `docs/analysis/des-lifecycle-validation-update.md`
- Complexity estimator:
  - `docs/analysis/des-run-complexity-estimator.md`
- Admission design:
  - `docs/architecture/des-run-admission-rules.md`
- Existing validation tests:
  - `tests/engine/validation.test.js`

### Tasks

1. Finish schema/lifecycle correctness in `validateModel()`.
2. Move Execute-only safeguards into portable validation or admission logic where appropriate.
3. Add a pure admission layer that combines:
   - validation
   - lifecycle/model-check rules
   - complexity estimate
   - plan/tier limits
4. Enforce:
   - explicit stop rules
   - replication caps
   - planned-row caps
   - run-size warnings/confirmations
   - auto-disable of expensive options like `collectTimeSeries` for large runs

### Files likely to change

- `src/engine/validation.js`
- new admission helper under `src/engine/` or `src/ui/execute/`
- `src/engine/complexity-estimator.js`
- `src/ui/execute/index.jsx`
- `tests/engine/validation.test.js`
- new `tests/engine/run-admission.test.js`
- new `tests/ui/execute/run-admission.test.jsx`

### Risks

- Overly strict rules can break legacy saved models.
- Mixing schema validation with tier policy can make code harder to reason about.

### Test strategy

- Validation regressions in `tests/engine/validation.test.js`
- New admission tests for:
  - replications over cap
  - planned rows over cap
  - complexity risk transitions
  - auto-disabled expensive options
- Reproduce-run flows should still load historical run metadata without being blocked

### Acceptance criteria

- Invalid lifecycle and schema patterns fail before execution.
- Large or expensive runs are classified consistently.
- Admission decisions are explicit: error, warning, or confirmation.

## Phase 3: Benchmark Suite

### Objective

Use the existing benchmark infrastructure to support compute-sizing, engine optimization, and admission thresholds without duplicating framework code.

### Current benchmark/assets baseline relevant to the phase

- Inventory and roles:
  - `docs/analysis/des-benchmark-inventory-and-gaps.md`
- Local timing suite:
  - `tests/engine/perf_timing.js`
  - `tests/engine/benchmark-scenarios.js`
- CI benchmark gate:
  - `npm run bench`
  - `.github/workflows/benchmark-gate.yml`
- Current envelope:
  - `docs/performance-envelope.md`

### Tasks

1. Keep the current three-layer benchmark structure.
2. Extend the local timing scenarios only where sizing evidence is still weak.
3. Add the smallest missing sizing scenarios:
   - queue-depth scaling
   - result-payload sizing
   - predicate-format comparison if needed
4. Promote only stable and fast scenarios into CI.
5. Tie benchmark evidence back into:
   - admission thresholds
   - dedicated-worker cutover policy
   - retention policy

### Files likely to change

- `tests/engine/benchmark-scenarios.js`
- `tests/engine/perf_timing.js`
- `tests/engine/benchmarks/benchmarks.test.js`
- `tests/engine/benchmarks/performance.test.js`
- `docs/performance-envelope.md`
- `docs/analysis/des-benchmark-inventory-and-gaps.md`

### Risks

- Too many heavy scenarios in CI can make the gate slow and flaky.
- Comparing wall-clock times across environments can create false conclusions.

### Test strategy

- Use:
  - `npm run bench`
  - `npm run bench:timing`
  - `npm run bench:timing:stress`
- Prefer workload counters and relative trends over absolute wall-clock claims when environments differ.

### Acceptance criteria

- The benchmark suite covers the core requested DES scenario families.
- Benchmark roles are documented clearly.
- New sizing or optimization claims cite existing benchmark outputs rather than ad hoc timing anecdotes.

## Phase 4: Browser Worker / Progress / Cancellation

### Objective

Reduce browser UI blocking for larger runs and provide trustworthy progress and cancellation semantics.

### Current benchmark/assets baseline relevant to the phase

- Browser/runtime review:
  - `docs/analysis/browser-simulation-performance-review.md`
- Progress/cancellation design:
  - `docs/architecture/des-run-progress-and-cancellation.md`
- Existing worker infrastructure:
  - `src/engine/replication-runner.js`
  - `src/engine/worker.js`
- Existing tests:
  - `tests/engine/replication-runner.test.js`
  - `tests/ui/execute/execute-panel.test.jsx`

### Tasks

1. Extend the existing worker/progress contract instead of inventing a new one.
2. Add cooperative progress/cancellation hooks for single-run execution.
3. Move large single runs off the browser main thread when practical.
4. Reuse the existing Execute batch progress UI patterns for single-run mode.
5. Define partial-result behavior for cancelled runs.

### Files likely to change

- `src/engine/index.js`
- `src/engine/worker.js`
- `src/engine/replication-runner.js`
- `src/ui/execute/index.jsx`
- `src/ui/execute/ExecutePanel`-related components
- `tests/engine/replication-runner.test.js`
- `tests/ui/execute/execute-panel.test.jsx`

### Risks

- Progress callbacks can slow the engine if too frequent.
- Cancellation can create confusing partial-result semantics if UI language is not clear.

### Test strategy

- Existing replication-runner tests
- UI tests for:
  - progress state transitions
  - cancellation state transitions
  - partial-result messaging
- Benchmark a progress-enabled run against baseline local timing

### Acceptance criteria

- Batch runs keep existing worker behavior.
- Large single runs no longer silently block the main thread.
- Progress and cancellation are visible and predictable for users.

## Phase 5: Dedicated Simulation Worker

### Objective

Move medium and large DES experiments out of browser/serverless request handlers into a dedicated execution service.

### Current benchmark/assets baseline relevant to the phase

- Worker architecture design:
  - `docs/architecture/des-dedicated-worker-architecture.md`
- Runtime placement baseline:
  - `docs/analysis/des-runtime-execution-map.md`
- Cost-control checklist:
  - `docs/operations/des-cost-control-checklist.md`
- Admission and complexity docs already identify candidate cutover conditions

### Tasks

1. Add a durable job model and worker control plane.
2. Define browser-to-job submission rules based on admission and complexity.
3. Reuse the same progress/cancellation event shape defined for browser workers.
4. Persist only compact results by default; store optional heavy artifacts separately if needed.
5. Roll out by execution tier:
   - browser for small
   - dedicated worker for medium/large

### Files likely to change

- new backend worker service repo or workspace
- Supabase job table migrations
- `src/db/models.js`
- `src/ui/execute/index.jsx`
- new job polling/realtime UI helpers
- architecture and ops docs

### Risks

- New auth and job-lifecycle complexity
- Cost can rise quickly if job sizing rules are weak
- Result-shape drift between browser and dedicated-worker runs

### Test strategy

- Contract tests for job status and result payload shape
- End-to-end tests for:
  - submit
  - progress
  - cancel
  - retry/failure
- Reuse benchmark scenarios to validate browser versus worker result parity

### Acceptance criteria

- Medium/large runs can execute outside the browser.
- Supabase and Cloudflare remain control-plane components, not heavy DES compute runtimes.
- Result semantics remain consistent across execution locations.

## Phase 6: Cost Monitoring And Retention Controls

### Objective

Control storage, API, and compute cost as run volume grows, using measured evidence rather than static guesses.

### Current benchmark/assets baseline relevant to the phase

- Storage review:
  - `docs/analysis/supabase-des-compute-and-storage-review.md`
- Results storage design:
  - `docs/architecture/des-results-storage-strategy.md`
- Cost checklist:
  - `docs/operations/des-cost-control-checklist.md`
- Existing admin/quota controls:
  - `platform_config`
  - model/run quota triggers
  - admin audit log

### Tasks

1. Add result-size telemetry and retention-facing metadata.
2. Implement summary-first persistence for larger runs.
3. Add monitoring dashboards for:
   - results growth
   - rate limits
   - quota failures
   - large payload frequency
4. Review whether immutable `results_json` policy needs a separate archival path.
5. Tie retention rules to run size and artifact class, not just age.

### Files likely to change

- `src/db/models.js`
- `src/db/local.js`
- possible new migrations for metadata columns or archival tables
- `supabase/migrations/*`
- `docs/architecture/des-results-storage-strategy.md`
- `docs/operations/des-cost-control-checklist.md`

### Risks

- Retention changes can conflict with current immutability triggers.
- Over-retention of logs/time series can dominate storage cost.
- Under-retention can remove data users still need for analysis or reproducibility.

### Test strategy

- DB tests for persistence shape and compatibility
- Run-history tests for compact versus rich payloads
- Operational verification on sample rows:
  - small run
  - large run
  - archived run

### Acceptance criteria

- Large runs do not automatically create oversized long-lived payloads.
- Monitoring exists for the primary cost surfaces.
- Retention policy is explicit and technically compatible with persistence rules.

## Recommended Delivery Order

1. Treat Phase 0 as complete baseline documentation, with updates only as reality changes.
2. Stabilize and expose Phase 1 instrumentation first.
3. Implement Phase 2 admission using the new metrics and complexity signals.
4. Use Phase 3 benchmarks to calibrate those admission thresholds and future worker cutovers.
5. Deliver Phase 4 browser progress/cancellation before Phase 5, so the user experience improves even before a dedicated worker exists.
6. Implement Phase 5 only after admission and benchmark evidence clearly define what should leave the browser.
7. Run Phase 6 in parallel with late Phase 4 / Phase 5 design, but keep schema/persistence changes conservative.

## Outcome

If delivered in this order, DES Studio keeps its current strengths:

- browser-first simplicity for small runs
- strong existing benchmark assets
- Supabase as control plane

while adding:

- measurable runtime cost
- safer run admission
- better browser behavior for long runs
- a clear path to off-browser execution
- explicit cost and retention control

## Verification

No tests were run in this task because the prompt requested a roadmap document only.
