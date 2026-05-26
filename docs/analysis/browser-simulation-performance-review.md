# Browser Simulation Performance Review

## Existing Benchmark Baseline

- Existing benchmark scripts found:
  - `tests/engine/mm1_benchmark.js`
  - `tests/engine/mmc_benchmark.js`
  - `tests/engine/perf_timing.js`
  - `tests/benchmarks/golden.test.js`
  - `tests/engine/benchmarks/benchmarks.test.js`
  - `tests/engine/benchmarks/performance.test.js`
  - `package.json` benchmark script referenced in prior repo analysis: `npm run bench`
- Existing benchmark fixtures/models found:
  - canonical queueing fixtures in `tests/engine/mm1_benchmark.js` and `tests/engine/mmc_benchmark.js`
  - benchmark-style templates referenced elsewhere in repo docs include `mm1`, `port-berth`, `data-center`, `fast-food`, and `surgical-suite`
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/reviews/sprint-72-performance-optimisation-plan.md`
  - `docs/reviews/sprint-72-performance-optimisation-closure.md`
  - `docs/analysis/des-runtime-execution-map.md`
  - `docs/analysis/des-runtime-instrumentation-plan.md`
- Existing runtime metrics found:
  - engine counters returned from `src/engine/index.js`
  - saved run/runtime metrics persistence in `src/db/models.js`
  - batch aggregation helpers in `src/ui/execute/executeHelpers.js`
- Existing test coverage related to performance:
  - engine benchmark/timing coverage in `tests/engine/benchmarks/` and `tests/engine/perf_timing.js`
  - time-series collection coverage in `tests/engine/time-series.test.js`
  - replication worker/progress/cancel coverage in `tests/engine/replication-runner.test.js`
  - execute-panel batch progress coverage in `tests/ui/execute/execute-panel.test.jsx`
- Gaps compared with the requested benchmark/sizing goal:
  - no browser-focused benchmark currently measures main-thread blocking during a single `runAll()`
  - no current benchmark captures chart rendering cost as `timeSeries` and `waitDist.values` grow
  - no memory-budget test currently checks large single-run result payload size in the browser path
  - no benchmark currently compares single-run main-thread execution against a workerised single-run path

## Scope

This note reviews DES execution from the browser-performance perspective only. It focuses on the current browser runtime, worker usage, result shaping, and UI responsiveness boundaries. It does not propose cloud execution changes.

## Current Behaviour

### 1. Does the simulation block the main UI thread?

Yes for a normal single run.

- `src/ui/execute/index.jsx:602-611` builds the engine in the React UI path and immediately calls `engine.runAll()`
- `src/engine/index.js:944-960` shows `runAll()` is a synchronous loop over `step()` until completion or a cycle limit

That means a large single run can freeze:

- React rendering
- button interactions
- cancellation inputs
- progress updates
- animation

Step-by-step execution is different: it advances one cycle at a time and can yield back to the browser between steps, but that is not how the normal single-run path behaves.

### 2. Is a Web Worker used?

Yes, but only for replication batches and sweep-style orchestration that reuses the replication runner.

- `src/engine/replication-runner.js:10-15` creates a browser `Worker`
- `src/engine/worker.js:16-30` runs `buildEngine(...).runAll()` inside the worker
- `src/engine/replication-runner.js:69-217` coordinates a worker pool and emits completion/progress callbacks

Important boundary:

- batch replications are workerised
- a single ordinary run is not workerised

So the codebase already has a clear worker pattern, but it is applied only to multi-replication execution.

### 3. Are progress updates available for long runs?

Partially.

For replication batches, yes:

- `src/engine/replication-runner.js:98-107` computes `{ completed, total, running, pending, cancelled, workerCount }`
- `src/ui/execute/index.jsx:477-485` wires `onProgress` into React state
- `src/ui/execute/index.jsx:2263-2269` renders that progress in the UI

For a single `runAll()`, no:

- there is no progress callback exposed from `buildEngine().runAll()`
- the synchronous main-thread call in `src/ui/execute/index.jsx:611` means the UI cannot repaint intermediate status anyway

So long single runs currently behave like “busy until done.”

### 4. Can runs be cancelled?

Partially.

Batch runs can be cancelled:

- `src/ui/execute/index.jsx:676-680` calls `runnerRef.current.cancel()`
- `src/engine/replication-runner.js:219-229` terminates active workers and emits cancellation status

Single `runAll()` runs cannot be cancelled once started:

- no cancellation token is passed into the engine
- no cooperative yield points exist in the synchronous single-run path

Auto-step can be stopped, but that is not equivalent to cancelling a currently executing `runAll()`.

### 5. Are large result objects causing memory pressure?

Likely yes, especially for large single runs.

`src/engine/index.js:971-984` returns a result object containing:

- `log`
- `snap`
- `summary`
- `runtimeMetrics`
- `warnings`
- `entitySummary`
- `timeSeries`
- `waitDist`
- `perQueue`
- `trace`

Key pressure points:

- `log` is returned in full for single runs
- `entitySummary` clones every entity: `src/engine/index.js:979`
- `timeSeries` can grow by one entry per completed cycle: `src/engine/index.js:928-930`
- `waitDist` keeps raw `values` arrays for queues: `src/ui/results/resultsViewModel.js:66-80` consumes them directly
- `trace` is bounded, but only trace is capped; `src/simulation/traceCollector.js:5` sets `TRACE_CAP = 1000`

The batch path is somewhat safer:

- `src/engine/replication-runner.js:49-66` strips batch result `log`

But even compacted replication payloads still preserve:

- `snap`
- `summary`
- `runtimeMetrics`
- `entitySummary`
- `timeSeries`
- `waitDist`

So memory pressure is reduced for batches, not eliminated.

### 6. Are queue time series sampled or stored at every event?

They are not sampled or downsampled. They are stored once per completed simulation cycle after Phase C stabilises.

- `src/engine/index.js:556` creates `_timeSeries` only when enabled
- `src/engine/index.js:928-930` pushes `{ t, byType, byQueue }` after each `step()`

That is cheaper than recording every internal event transition, but still potentially large for long runs with many clock advances.

The UI already hints that this has a cost:

- `src/ui/execute/ExperimentControls.jsx:265-273` labels `collectTimeSeries` with “Disable to reduce memory on long runs”

### 7. Are charts rendering too much raw data?

Likely yes for large runs.

The chart view-model currently forwards raw arrays without downsampling:

- `src/ui/results/resultsViewModel.js:20-45` maps every `timeSeries` point into queue-depth series
- `src/ui/results/resultsViewModel.js:47-64` maps every `timeSeries` point into utilisation series
- `src/ui/results/resultsViewModel.js:66-80` copies and sorts full `waitDist.values` arrays

This creates two browser costs:

1. large in-memory arrays in React-facing view models
2. rendering cost proportional to the raw point count

For long runs, chart cost may become material even after the engine finishes.

## Likely Bottlenecks

### Main-thread execution bottlenecks

- single-run `engine.runAll()` in `src/ui/execute/index.jsx:602-611`
- no intermediate yielding during `src/engine/index.js:944-960`

### Result assembly and retention bottlenecks

- full `log` retention
- full `entitySummary` cloning
- full `waitDist.values` retention
- optional but potentially dense `timeSeries`

### Post-run UI bottlenecks

- raw point mapping in `src/ui/results/resultsViewModel.js`
- chart rendering over full unsampled arrays

## Recommended Worker Strategy

The repo already has a clear worker pattern. The safest path is to extend the existing browser worker contract rather than invent a new runtime model.

### Recommended direction

1. Reuse `src/engine/worker.js` and `src/engine/replication-runner.js` patterns for large single runs.
2. Keep small runs on the main thread for simplicity and lower orchestration overhead.
3. Route medium/large single runs through one worker using the same message protocol style already used by replication batches.

### Why this is the lowest-risk strategy

- worker creation and messaging already exist
- cancellation semantics already exist for worker-backed runs
- error propagation already exists
- progress UI patterns already exist in Execute

### Recommended admission heuristic for workerising single runs

Use the existing complexity-estimate/runtime-admission work as the trigger:

- `small`: main thread allowed
- `medium`: main thread allowed, worker preferred when chart data is enabled
- `large` / `too_large`: run in worker by default

## Progress and Cancellation Design

### Minimum viable design

For worker-backed single runs:

1. Add a worker message type for periodic progress snapshots.
2. Run the engine in chunked batches of `step()` calls rather than one monolithic `runAll()`.
3. After each chunk, post:
   - current clock
   - cycles completed
   - current FEL size if cheap
   - current runtime metrics snapshot
4. Honour a cancel flag checked between chunks.

### Important constraint

True progress for DES is approximate. The engine usually does not know total future work in advance, so percentage complete must be framed conservatively.

Recommended UI wording:

- “Running simulation…”
- “Processed 48,200 events so far”
- “Simulation clock: 182.5”
- “This estimate may change as the model generates more future events”

Avoid claiming exact completion percentages unless the model has a bounded planned workload.

### Cancellation recommendation

- worker-backed runs: cooperative cancellation between chunks plus worker termination as a hard stop
- main-thread single runs: no safe cancellation until they are workerised or chunked

## Result Downsampling Recommendations

### Time-series data

Recommended staged approach:

1. Keep raw time series only for small runs.
2. For larger runs, downsample before storing in React state and before persistence.
3. Prefer bucketed min/max sampling or stride-based decimation first because it is simple and deterministic.

Suggested policy:

- up to `2,000` points: keep raw
- `2,001` to `20,000` points: downsample to a chart budget such as `1,000` to `2,000` points
- above `20,000` points: store summary/downsampled series only unless the user explicitly asks for full detail

### Wait distributions

For large runs, do not keep full `values` arrays by default.

Prefer:

- `n`
- `mean`
- `p50`
- `p90`
- `p95`
- `p99`
- optional histogram bins

Keep raw values only when:

- sample counts are small, or
- the user explicitly requests detailed export/debug output

### Logs and entity detail

For large runs:

- cap visible logs in memory
- persist compact diagnostics rather than the full event log
- keep full `entitySummary` only when explicitly needed for debugging/export

## Recommended Architecture Boundaries

### What should run in the browser main thread

- model editing
- validation
- light single runs
- rendering compact summaries/charts

### What should run in browser workers

- replication batches
- large single runs
- sweeps and other multi-run orchestration
- any future chunked progress-aware execution

### What should not be added to the main-thread path

- heavier per-event UI updates
- unbounded chart point accumulation
- unbounded event-log retention for routine runs

## Risks

- workerising single runs changes execution plumbing and will need careful parity testing against current `runAll()`
- chunked progress reporting can accidentally slow the engine if progress messages are too frequent
- aggressive downsampling can hide spikes if bucket policies are naive
- if persistence keeps full raw `timeSeries` and `waitDist.values`, browser improvements alone will not solve storage and reload cost

## Tests And Benchmarks To Add

### Browser/runtime tests

- execute-panel test proving single-run main-thread mode shows no progress UI today, to lock the current behaviour before refactor
- worker-backed single-run test once introduced: progress messages update UI and final result matches direct `runAll()`
- cancellation test for worker-backed single run

### Result-size and chart-shaping tests

- view-model test that large `timeSeries` is downsampled to a fixed point budget
- wait-distribution test that large runs can switch from raw `values` to compact bins/percentiles without breaking charts
- persistence-shaping test ensuring large-run saves do not include full event logs by default

### Benchmarks to add

- browser-oriented benchmark comparing:
  - main-thread single run
  - one-worker single run
  - replication pool run
- chart benchmark measuring time to shape/render:
  - `1k`
  - `10k`
  - `50k`
  time-series points
- payload-size benchmark capturing serialized result size for:
  - summary-only
  - summary + timeSeries
  - summary + timeSeries + waitDist raw values

## Recommended Next Steps

1. Add a browser-focused benchmark scenario using the existing performance fixture set plus one intentionally long single-run model.
2. Introduce a worker-backed single-run execution path behind a conservative threshold rather than rewriting the engine.
3. Add point-budget downsampling in the result view-model layer before changing engine collection semantics.
4. Add a compact large-run persistence policy so browser and storage improvements reinforce each other.

## Tests Run

No tests were run for this task because the prompt requested a factual review note rather than an implementation change.
