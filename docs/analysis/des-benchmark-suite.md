# DES Benchmark Suite

## Existing Benchmark Baseline

- Existing benchmark scripts found:
  - `tests/engine/mm1_benchmark.js`
  - `tests/engine/mmc_benchmark.js`
  - `tests/engine/perf_timing.js`
  - `npm run bench` in `package.json`
- Existing benchmark fixtures/models found:
  - analytical M/M/1 and M/M/c fixtures in `tests/engine/mm1_benchmark.js`, `tests/engine/mmc_benchmark.js`, and `tests/benchmarks/golden.test.js`
  - stress/timing fixtures in the prior `tests/engine/perf_timing.js`
  - reusable template models in `src/engine/templates.js`, including:
    - `mm1`
    - `tfl-station-plan`
    - several multi-stage queue templates that are useful as benchmark seeds
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/reviews/sprint-72-performance-optimisation-plan.md`
  - `docs/reviews/sprint-72-performance-optimisation-closure.md`
- Existing runtime metrics found:
  - `runtimeMetrics` from `src/engine/index.js`
  - persisted runtime metrics in `src/db/models.js`
  - aggregate runtime metric helpers in `src/ui/execute/executeHelpers.js`
- Existing test coverage related to performance:
  - `tests/engine/benchmarks/benchmarks.test.js`
  - `tests/engine/benchmarks/performance.test.js`
  - `tests/benchmarks/golden.test.js`
  - runtime metric assertions in `tests/engine/three-phase.test.js`
- Existing CI tasks that run performance checks:
  - `.github/workflows/benchmark-gate.yml` runs `npm run bench`
  - `.github/workflows/ci.yml` runs `node tests/engine/mm1_benchmark.js` and `node tests/engine/mmc_benchmark.js`
- Gaps compared with the requested benchmark/sizing goal:
  - the repo already had a manual timing harness, but it did not cover all requested DES scenarios
  - the old timing harness did not emit the requested runtime-metric shape directly
  - there was no single local runner that covered M/M/1 small, post-office, planned-train, grouped-spectator, and optional large-queue stress in one place

## Summary

I did not create a second benchmark framework.

The repo already had two benchmark layers:

1. `npm run bench` for analytical and correctness-oriented Vitest benchmark gates
2. `tests/engine/perf_timing.js` as a local timing/profiling runner

The most appropriate change was to extend the existing local timing runner, keep the existing CI gates intact, and add reusable scenario fixtures for missing DES benchmark models.

## What Was Reused

- `tests/engine/perf_timing.js` remained the local timing runner entrypoint
- `npm run bench` remained the analytical/correctness benchmark command
- `src/engine/templates.js` was reused as the source for:
  - `mm1`
  - the offline benchmark seed for the train-plan scenario via `tfl-station-plan`
- engine-provided `runtimeMetrics` were reused instead of building a separate profiling layer

## What Was Extended

### Local timing runner

`tests/engine/perf_timing.js` now:

- uses the engine’s `runtimeMetrics` output directly
- reports:
  - `wall_clock_ms`
  - `events_processed`
  - `c_event_scans`
  - `max_queue_length`
  - `replications`
  - `events_per_second`
- supports:
  - `--stress` to include the large-queue stress scenario
  - `--json` for machine-readable output

### Local commands

`package.json` now includes:

- `npm run bench:timing`
- `npm run bench:timing:stress`

These are local-only timing commands and do not require production credentials.

## What Was Newly Added

### Shared scenario registry

New file:

- `tests/engine/benchmark-scenarios.js`

This centralises the local timing scenarios so the runner logic and scenario definitions do not get mixed together.

### Added or completed benchmark scenarios

The local timing suite now covers:

1. `mm1-small`
2. `mm1-high-util`
3. `post-office-multi-stage`
4. `glasgow-train-plan`
5. `stadium-grouped-spectators`
6. `large-queues-stress` via `--stress`

It also preserves the existing Phase C-heavy timing scenarios:

- `many-c-events-mostly-false`
- `many-c-events-high-churn`

## Why No New Benchmark Structure Was Necessary

The repo already had the right split:

- correctness gates in Vitest/CI
- timing exploration in a direct Node runner

Creating another benchmark framework would have duplicated:

- commands
- output formats
- scenario storage
- maintenance burden

The safer move was to keep the existing benchmark architecture and make the local timing runner more complete and more useful.

## Benchmark Commands

### Existing analytical/correctness gates

```bash
npm run bench
node tests/engine/mm1_benchmark.js
node tests/engine/mmc_benchmark.js
```

### Local timing runner

```bash
npm run bench:timing
npm run bench:timing:stress
node tests/engine/perf_timing.js --json
node tests/engine/perf_timing.js --stress --json
```

## Expected Output Shape

The local timing runner now emits a per-scenario record with this shape:

```json
{
  "generated_at": "2026-05-26T12:34:56.000Z",
  "include_stress": false,
  "scenario_count": 7,
  "scenarios": [
    {
      "key": "mm1-small",
      "label": "M/M/1 small",
      "category": "core",
      "replications": 1,
      "wall_clock_ms": 12,
      "events_processed": 184,
      "c_event_scans": 126,
      "max_queue_length": 4,
      "events_per_second": 15333,
      "final_time": 120,
      "served": 88,
      "total_entities": 89,
      "max_future_event_list_size": 3
    }
  ]
}
```

Human-readable console output prints the same metrics scenario by scenario.

## How Benchmarks Should Be Interpreted

### `npm run bench`

Use this for:

- correctness regression gates
- analytical trust
- CI enforcement

Do not use it to compare small local speed deltas. Its job is “is the engine still right?”

### `npm run bench:timing`

Use this for:

- local runtime comparison
- hot-path review
- broad scenario coverage

Interpretation guidance:

- `wall_clock_ms` is environment-sensitive and should be compared on the same machine when possible
- `events_processed` and `c_event_scans` are better for comparing engine work across code changes
- `events_per_second` is useful for trend comparison but not for CI hard thresholds
- `max_queue_length` helps explain whether a scenario’s cost is driven by queue growth

### `npm run bench:timing:stress`

Use this when you specifically want queue-growth pressure. It is intentionally not part of the default timing run so local runs stay quick.

## Scenario Coverage Notes

### Reused directly

- `mm1-small`
- `mm1-high-util`

These reuse the existing `mm1` template model.

### Reused then adapted

- `glasgow-train-plan`

This reuses `tfl-station-plan` as the structural base, but replaces live-data dependence with deterministic planned-arrival rows so it is safe for offline local benchmarking.

### New benchmark-only fixtures

- `post-office-multi-stage`
- `stadium-grouped-spectators`
- `large-queues-stress`

These were added as benchmark fixtures because no equivalent existing benchmark model was present in the repo.

## Which Scenarios Are Still Missing

The suite is better aligned with the requested coverage now, but a few useful benchmark classes are still absent:

- explicit queue-depth sweep benchmarks
- FEL-pressure benchmarks with many same-time scheduled B-events
- legacy-string versus canonical-predicate benchmark pairs
- priority-discipline scaling benchmarks on very large waiting sets
- batch/unbatch-heavy grouped-flow benchmarks if stadium crowd modelling needs true batching rather than grouped arrivals

## Files Changed

- `tests/engine/benchmark-scenarios.js`
- `tests/engine/perf_timing.js`
- `package.json`
- `docs/analysis/des-benchmark-suite.md`

## Tests Run

Recommended verification for this change:

```bash
npm run bench
npm run bench:timing
node tests/engine/perf_timing.js --json
```

See the final task notes for what was actually run in this session.
