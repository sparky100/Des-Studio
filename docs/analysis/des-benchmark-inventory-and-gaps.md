# DES Benchmark Inventory And Gaps

Date: 2026-05-26  
Scope: Audit only. No benchmark code was added in this task.

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
  - analytical M/M/1 and M/M/c fixtures embedded in `mm1_benchmark.js`, `mmc_benchmark.js`, and `golden.test.js`
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/analysis/des-benchmark-suite.md`
  - `docs/analysis/three-phase-engine-efficiency-review.md`
  - `docs/analysis/browser-simulation-performance-review.md`
- Existing runtime metrics found:
  - `wall_clock_ms`
  - `events_processed`
  - `c_event_scans`
  - `c_events_fired`
  - `entities_created`
  - `entities_completed`
  - `max_queue_length_by_queue`
  - `max_future_event_list_size`
- Existing test coverage related to performance:
  - `tests/engine/benchmarks/benchmarks.test.js`
  - `tests/engine/benchmarks/performance.test.js`
  - `tests/engine/replication-ci.test.js`
  - `tests/engine/replication-runner.test.js`
  - `tests/engine/three-phase.test.js`
- Gaps compared with the requested benchmark/sizing goal:
  - no single inventory doc previously summarized both benchmark CI and the local timing runner
- the repo has strong correctness and timing assets, but queue-growth scaling remains local timing only
  - compute-sizing support is partial because some scenarios are local-only and not enforced in CI

## Summary

The repo already has a benchmark structure. It should be extended, not replaced.

Today there are three practical layers:

1. Analytical correctness scripts:
   - `tests/engine/mm1_benchmark.js`
   - `tests/engine/mmc_benchmark.js`
2. Vitest benchmark gate:
   - `tests/engine/benchmarks/benchmarks.test.js`
   - `tests/engine/benchmarks/performance.test.js`
   - `tests/benchmarks/golden.test.js`
3. Local timing/profiling runner:
   - `tests/engine/perf_timing.js`
   - `tests/engine/benchmark-scenarios.js`

That is enough structure to support future compute-sizing work without adding a second framework.

## 1. Existing Benchmark Scripts And How To Run Them

### `package.json` scripts

Defined in [package.json](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/package.json:13):

- `npm run bench`
  - runs `vitest run tests/engine/benchmarks --environment node --reporter verbose`
- `npm run bench:timing`
  - runs `node tests/engine/perf_timing.js`
- `npm run bench:timing:stress`
  - runs `node tests/engine/perf_timing.js --stress`

### Direct benchmark commands

- `node tests/engine/mm1_benchmark.js`
- `node tests/engine/mmc_benchmark.js`
- `npx vitest run tests/benchmarks/golden.test.js`
- `node tests/engine/perf_timing.js --json`
- `node tests/engine/perf_timing.js --stress --json`

### Practical use by layer

- `mm1_benchmark.js` and `mmc_benchmark.js`
  - fast analytical queueing checks
- `npm run bench`
  - main automated benchmark gate for correctness and performance-envelope regression
- `npm run bench:timing`
  - local scenario timing and workload-counter exploration
- `npm run bench:timing:stress`
  - optional large-queue pressure run

## 2. Existing Benchmark Fixtures / Models

### Analytical fixtures

- `tests/engine/mm1_benchmark.js`
  - canonical M/M/1 at high utilisation (`λ=0.9`, `μ=1.0`)
- `tests/engine/mmc_benchmark.js`
  - canonical M/M/c analytical check
- `tests/benchmarks/golden.test.js`
  - regression-lock analytical ranges

### Shared local timing scenarios

Defined in [tests/engine/benchmark-scenarios.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/tests/engine/benchmark-scenarios.js):

- `mm1-small`
- `mm1-high-util`
- `post-office-multi-stage`
- `glasgow-train-plan`
- `stadium-grouped-spectators`
- `many-c-events-mostly-false`
- `many-c-events-high-churn`
- `large-queues-stress` (stress-only)
- `queue-depth-scaling-light`
- `queue-depth-scaling-medium`
- `queue-depth-scaling-heavy`

### Template models that could become future benchmarks

From [src/engine/templates.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/engine/templates.js):

- `mm1`
- `tfl-station-plan`
- `machine-shop-failures`
- `ward-admission`
- other multi-stage clinic / transport / service templates

These are useful because they already encode realistic DES structures without needing production credentials.

## 3. Existing Runtime Metrics Captured

### Engine-side runtime metrics

Returned from [src/engine/index.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/engine/index.js:1144):

- `wall_clock_ms`
  - set to `null` in engine, then filled in UI/timing runner
- `events_processed`
- `c_event_scans`
- `c_events_fired`
- `entities_created`
- `entities_completed`
- `max_queue_length_by_queue`
- `max_future_event_list_size`

### UI/batch aggregation

- single-run `wall_clock_ms` is attached in [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/ui/execute/index.jsx:615)
- batch aggregate runtime metrics are built in [src/ui/execute/executeHelpers.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/ui/execute/executeHelpers.js:42)

### Persistence

- `runtimeMetrics` is persisted inside `results_json` in [src/db/models.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/db/models.js:387)

### Metrics directly used by the timing runner

`tests/engine/perf_timing.js` currently reports:

- `wall_clock_ms`
- `events_processed`
- `c_event_scans`
- `max_queue_length`
- `replications`
- `events_per_second`
- `max_future_event_list_size`

## 4. Existing Performance / Stress Tests

### Vitest benchmark gate

- [tests/engine/benchmarks/benchmarks.test.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/tests/engine/benchmarks/benchmarks.test.js)
  - complete benchmark register with 8 analytical and qualitative correctness gates
- [tests/engine/benchmarks/performance.test.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/tests/engine/benchmarks/performance.test.js)
  - wall-clock performance threshold on a complex multi-queue model

### Standalone analytical scripts

- [tests/engine/mm1_benchmark.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/tests/engine/mm1_benchmark.js)
- [tests/engine/mmc_benchmark.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/tests/engine/mmc_benchmark.js)

### Local timing / stress runner

- [tests/engine/perf_timing.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/tests/engine/perf_timing.js)
  - includes C-heavy scenarios and optional queue-stress scenario

### Adjacent tests with performance relevance

- `tests/engine/replication-ci.test.js`
  - statistical replication confidence-interval gate
- `tests/engine/replication-runner.test.js`
  - worker orchestration and payload compaction
- `tests/engine/time-series.test.js`
  - `collectTimeSeries` overhead-sensitive feature
- `tests/engine/complexity-estimator.test.js`
  - pre-run complexity heuristics

These are not benchmark runners, but they matter for compute-sizing safety.

## 5. Existing Docs Covering Performance

### Primary benchmark / envelope docs

- [docs/performance-envelope.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/performance-envelope.md)
  - authoritative performance ceiling and benchmark pass/fail reference
- [docs/analysis/des-benchmark-suite.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/des-benchmark-suite.md)
  - explains how the local timing runner was extended without creating a second framework

### Architecture and sizing reviews

- [docs/analysis/three-phase-engine-efficiency-review.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/three-phase-engine-efficiency-review.md)
- [docs/analysis/browser-simulation-performance-review.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/browser-simulation-performance-review.md)
- [docs/analysis/des-runtime-execution-map.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/des-runtime-execution-map.md)
- [docs/analysis/des-runtime-instrumentation-plan.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/des-runtime-instrumentation-plan.md)
- [docs/analysis/des-runtime-metrics-implementation.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/des-runtime-metrics-implementation.md)
- [docs/analysis/des-run-complexity-estimator.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/des-run-complexity-estimator.md)
- [docs/architecture/des-run-admission-rules.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/architecture/des-run-admission-rules.md)

### Sprint/performance planning docs

- `docs/reviews/sprint-72-performance-optimisation-plan.md`
- `docs/reviews/sprint-72-performance-optimisation-closure.md`

## 6. Gaps Against Desired Benchmark Coverage

### M/M/1 small

Status: covered

- directly present in `tests/engine/benchmark-scenarios.js` as `mm1-small`
- conceptually backed by the `mm1` template and analytical fixtures

### M/M/1 high utilisation

Status: covered

- directly present in `tests/engine/benchmark-scenarios.js` as `mm1-high-util`
- strongly supported by `tests/engine/mm1_benchmark.js`

### Post office

Status: covered

- present in `tests/engine/benchmark-scenarios.js` as `post-office-multi-stage`
- there are also repo references to “post office” in prompts and UI tests, but the benchmark fixture is already concrete

### Glasgow planned-arrival train model

Status: covered, but as an offline approximation

- present in `tests/engine/benchmark-scenarios.js` as `glasgow-train-plan`
- implemented as a Glasgow-style offline planned-arrival crowd-flow benchmark derived from `tfl-station-plan`

Gap:

- this is not yet a real named Glasgow Central fixture set from external data or case-study assets
- it is good for local benchmarking, but only a proxy for a future full Glasgow case study

### Stadium grouped spectator model

Status: covered

- present in `tests/engine/benchmark-scenarios.js` as `stadium-grouped-spectators`

Gap:

- current model is grouped-arrival based, not a full BATCH/UNBATCH-heavy crowd-flow stress case

### Large-queue stress case

Status: covered, but local-only by default

- present in `tests/engine/benchmark-scenarios.js` as `large-queues-stress`
- only runs through `--stress`

Gap:

- not part of default CI benchmark gates
- useful for local queue-growth study, but not yet part of enforced compute-sizing policy

### Queue-depth scaling family

Status: covered in the local timing runner

- present in `tests/engine/benchmark-scenarios.js` as:
  - `queue-depth-scaling-light`
  - `queue-depth-scaling-medium`
  - `queue-depth-scaling-heavy`
- uses one stable queue/server structure and varies arrival pressure to force controlled queue-depth growth

Gap:

- still local timing only
- not yet promoted into CI because the goal is exploratory compute-sizing rather than pass/fail regression gating

## 7. Are The Existing Benchmarks Good Enough To Support Compute Sizing?

Short answer: partially, but not completely.

### Good enough for

- analytical trust in core queueing behaviour
- broad performance-envelope claims
- Phase C hotspot diagnosis
- local comparison across representative scenario families
- basic discussion of browser versus engine workload size

### Not yet good enough for

- hard browser run-admission thresholds with confidence
- queue-depth scaling claims in Big-O or empirical curve terms
- precise storage sizing policy tied to result payload size
- worker cutover rules for single-run browser execution
- tier limits that need repeatable, machine-independent evidence

Why:

- some important scenario coverage exists only in the local timing runner, not CI
- queue-growth and result-size studies are still weakly represented
- there is no benchmark yet that explicitly maps:
  - queue depth versus runtime
  - planned rows versus runtime
  - replications versus save payload size

## 8. Recommended Next Changes

Ordered from smallest / lowest-risk to largest:

1. Consolidate benchmark documentation references.
   - Make this inventory doc and `docs/performance-envelope.md` the canonical benchmark entrypoints.

2. Keep using the existing local timing runner as the scenario-expansion surface.
   - Extend `tests/engine/benchmark-scenarios.js`, not a new framework.

3. Add one explicit queue-depth scaling scenario.
   - Reuse `tests/engine/perf_timing.js`
   - vary load or service rate to produce controlled queue-growth pressure

4. Add one result-payload sizing report to the timing runner or save-path diagnostics.
   - use existing `runtimeMetrics`
   - add approximate serialized result size for storage planning

5. Add one predicate-format comparison scenario.
   - compare legacy string conditions versus canonical predicate-object conditions in a C-heavy case

6. Promote selected local timing scenarios into CI only if they are stable and fast enough.
   - likely candidates:
     - `mm1-high-util`
     - one post-office or Glasgow-style scenario
   - keep large stress cases local-only unless a separate nightly gate is introduced

7. Add a dedicated queue-growth / compute-sizing appendix to `docs/performance-envelope.md`.
   - tie benchmark evidence to admission thresholds

## 9. Duplicate Or Obsolete Benchmark Assets To Consolidate

### Potential overlap to tidy, not delete blindly

- `tests/engine/mm1_benchmark.js`
- `tests/benchmarks/golden.test.js`
- `tests/engine/benchmarks/benchmarks.test.js`

These are not duplicates in function, but they overlap in subject matter:

- all touch M/M/1 or M/M/c analytical trust
- they serve different layers:
  - direct script
  - regression lock
  - broader benchmark register

Recommendation:

- keep them, but document their roles more explicitly to reduce confusion

### Documentation overlap

- `docs/performance-envelope.md`
- `docs/analysis/des-benchmark-suite.md`
- this new inventory doc

Recommendation:

- `performance-envelope.md` should remain the performance-claims reference
- `des-benchmark-suite.md` should remain the “how the suite was extended” implementation note
- `des-benchmark-inventory-and-gaps.md` should remain the audit/inventory reference

### No parallel framework needed

The current split is healthy:

- CI correctness/performance gate in Vitest
- direct analytical scripts
- local timing runner for exploratory scenario timing

That should be preserved.

## Recommendation

The repo already has enough benchmark infrastructure to support the next round of compute-sizing work, provided the team continues extending:

- `tests/engine/benchmark-scenarios.js`
- `tests/engine/perf_timing.js`
- `docs/performance-envelope.md`

The highest-value gap now is not “add more benchmark plumbing,” but “add a small number of sizing-focused scenarios and unify the documentation around the benchmark layers that already exist.”

## Verification

No tests were run in this task because the prompt requested an audit document only.
