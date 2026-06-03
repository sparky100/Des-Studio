# DES Runtime Instrumentation Plan

Date: 2026-05-26

## Existing Benchmark Baseline

- Existing benchmark scripts found:
  - `tests/engine/mm1_benchmark.js`
  - `tests/engine/mmc_benchmark.js`
  - `tests/engine/perf_timing.js`
  - `package.json` script: `npm run bench` -> `vitest run tests/engine/benchmarks --environment node --reporter verbose`
- Existing benchmark fixtures/models found:
  - `tests/benchmarks/golden.test.js`
  - Engine templates in `src/engine/templates.js`
  - Example models and sample assets in `docs/examples/` and repo-root CSV samples
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/reviews/sprint-72-performance-optimisation-plan.md`
  - `docs/reviews/sprint-72-performance-optimisation-closure.md`
  - `docs/analysis/des-runtime-execution-map.md`
- Existing runtime metrics found:
  - Per-resource utilisation in `src/engine/index.js:1037-1055`
  - Time-series snapshots in `src/engine/index.js:891-893`
  - Per-queue counters in `src/engine/index.js:351-356`
  - Event fire counts in `src/engine/index.js:358-362`
  - Persisted run duration field `duration_ms` in `src/db/models.js:402`
  - Existing benchmark-only C-event counters derived from `cycleLog` in `tests/engine/perf_timing.js:156-233`
- Existing test coverage related to performance:
  - Analytical correctness gates: `tests/engine/mm1_benchmark.js`, `tests/engine/mmc_benchmark.js`
  - Benchmark fixtures: `tests/benchmarks/golden.test.js`
  - Replication gate: `tests/engine/replication-ci.test.js`
  - Worker orchestration coverage: `tests/engine/replication-runner.test.js`
- Gaps compared with the requested benchmark/sizing goal:
  - Runtime-cost metrics are not yet first-class engine outputs
  - `duration_ms` exists in persistence, but the single-run and batch UI paths do not appear to populate it today
  - C-event workload counters currently exist only inside the perf harness, not in engine results
  - Queue and FEL maxima are not persisted as formal run metrics

## Goal

Add a lightweight, explicit runtime instrumentation layer so simmodlr can answer two questions for any run:

1. How much simulation work did the engine perform?
2. What did that work cost in browser time, memory-adjacent payload size, and persistence size?

This document proposes a design only. It does not implement code.

## Design Summary

The instrumentation should be added in three layers:

1. **Engine runtime metrics**
   - Cheap counters and maxima captured inside `src/engine/index.js`
2. **Run payload metrics**
   - JSON size and wall-clock timing captured at the point where results are composed and saved in `src/ui/execute/index.jsx`
3. **Persistence and UI surfaces**
   - Store a compact metrics object in `results_json`
   - Display a small “Runtime” card in the Execute/results UI

The design should prefer:

- constant-time counter increments
- reuse of existing state and snapshots
- feature flags or optional collection for higher-cost metrics
- no duplicate computation if the same value already exists in summary or time-series outputs

## 1. Where Each Metric Should Be Collected

### `wall_clock_ms`

Where:

- Single run:
  - Around `buildEngine(...).runAll()` in `src/ui/execute/index.jsx:571-580`
- Step mode completion:
  - Around the stepped session from `initEngine()` / repeated `step()` through final save in `src/ui/execute/index.jsx:216-350`
- Replication batches:
  - Around `runReplications(...)` lifecycle in `src/ui/execute/index.jsx:452-540`
- Node perf harness:
  - Already measured with `performance.now()` in `tests/engine/perf_timing.js:189-204`

Why there:

- Wall-clock time is a host/runtime concern, not a pure simulation-state concern
- Capturing it outside the engine preserves engine purity and keeps Node/browser measurement consistent

### `replications`

Where:

- Already known from experiment config in `src/ui/execute/index.jsx`
- Persist through `saveSimulationRun(...)` in `src/db/models.js:391`

Why there:

- This is a run configuration field, not derived instrumentation

### `events_processed`

Definition:

- Total number of events actually fired by the engine
- Recommended formula: `b_events_processed + c_events_fired`

Where:

- Maintain a runtime counter object inside `src/engine/index.js`
- Increment:
  - once per fired B-event in the Phase B loop near `src/engine/index.js:659-779`
  - once per fired C-event in the Phase C loop near `src/engine/index.js:788-860`

Why there:

- This avoids reconstructing event counts from `log` after the run

### `b_events_processed`

Where:

- Increment in the Phase B loop only when a B-event is actually fired
- Hook immediately before or after `fireBEvent(ev, ctx)` in `src/engine/index.js:749-778`
- Exclude synthetic control entries only if product wants “business events only”

Recommendation:

- Store both:
  - `b_events_processed`
  - `system_b_events_processed` optional later if synthetic events need separating

### `c_event_scans`

Definition:

- Count every C-event evaluation attempt, whether true or false

Where:

- Increment inside the Phase C `for` loop before evaluating the compiled predicate in `src/engine/index.js:788-794`

Why there:

- This is the cleanest measure of Phase C workload
- The perf harness already reconstructs a similar concept from `cycleLog`, which is more expensive and indirect

### `c_events_fired`

Where:

- Increment only when `condTrue` and the C-event actually fires in `src/engine/index.js:810-860`

Why there:

- Allows false/true scan ratio and restart pressure analysis

### `entities_created`

Definition:

- Count all customer and server entities created during the run

Where:

- Preferred hook: wrap or centralize `nextId()`-driven creation bookkeeping in the engine context
- Practical first implementation points:
  - server creation in `src/engine/index.js:411-424`
  - macro-driven customer/entity creation inside `src/engine/macros.js`, especially `ARRIVE` and cloning/splitting/batching paths around lines called out by search hits:
    - `src/engine/macros.js:237`
    - `src/engine/macros.js:256`
    - `src/engine/macros.js:282`
    - `src/engine/macros.js:298`
    - `src/engine/macros.js:578`
    - `src/engine/macros.js:884`
    - `src/engine/macros.js:1008`

Recommendation:

- Add `ctx.metrics?.incEntitiesCreated(kind)` to macro context so creation sites stay explicit and low-risk

### `entities_completed`

Definition:

- Count entities that leave the system as completed, not reneged

Where:

- Reuse the existing served counter source of truth:
  - `state.__served` updates in `src/engine/phases.js:183`
  - `src/engine/phases.js:253`
  - `src/engine/macros.js:423`

Recommendation:

- For MVP, set `entities_completed = summary.served`
- No extra counter required unless you need “completed during run before warm-up reset” detail

### `max_queue_length_by_queue`

Where:

- Engine runtime state in `src/engine/index.js`
- Update whenever queue membership changes

Practical collection options:

1. **Preferred**
   - Update at mutation points where entities enter/leave waiting state
   - Use queue helpers in `markEntityWaiting` / `clearWaitingState` related paths
2. **Fallback**
   - Recompute from current entities once per `step()` after Phase C stabilizes using the same queue counts already produced by `snap()`

Recommendation:

- MVP: update once per completed step from `stepSnap.byQueue`
- This is slightly delayed but correct for per-step maxima and much simpler than instrumenting every queue mutation path immediately

### `avg_queue_length_by_queue`

Definition:

- Time-weighted average queue depth by queue over simulated time

Where:

- Same place as WIP integration already used in `src/engine/index.js:895-900`

Recommendation:

- Maintain per-queue integrals:
  - `queueDepthIntegral[queueName] += currentDepth * dt`
  - `queueDepthPrevTime = clock`
- Update once per completed step after Phase C stabilizes, reusing `stepSnap.byQueue`

Why this approach:

- Time-weighted averages are more meaningful than arithmetic average of snapshots
- Reuses the engine’s existing “integrate over dt” pattern

### `server_utilisation_by_resource`

Where:

- Already available from `getSummary()` in `src/engine/index.js:1037-1055`

Recommendation:

- Do not duplicate this metric
- Copy it into the runtime metrics block as a convenience alias for consumers

### `max_future_event_list_size`

Where:

- Update inside engine whenever FEL changes:
  - initial FEL construction in `src/engine/index.js:534-579`
  - after Phase B additions in `src/engine/index.js:763-764`
  - after Phase C additions in `src/engine/index.js:822-823`
  - any pruning paths such as warm-up cleanup can leave max unchanged

Recommendation:

- Maintain a simple `maxFelSize = Math.max(maxFelSize, fel.length)` after each mutation/sort point

### `run_result_size_bytes`

Where:

- After final run result object is composed but before persistence
- Single run and step completion:
  - `src/ui/execute/index.jsx:301-315`
  - `src/ui/execute/index.jsx:595-604`
- Batch result:
  - `src/ui/execute/index.jsx:487-516`
- Local storage mirror:
  - `src/db/local.js:57-68`

How:

- Compute `new TextEncoder().encode(JSON.stringify(resultsJson)).length`

Why there:

- This measures the payload that is actually saved and transported, not only the raw engine object

### `errors/warnings encountered during run`

Where:

- Validation warnings are already separate and pre-run:
  - `src/engine/validation.js:14-689`
- Runtime warnings already accumulate in engine:
  - `src/engine/index.js:349`
  - `src/engine/index.js:874`
  - `src/engine/phases.js:64`, `212`, `283`

Recommendation:

- Persist:
  - `runtime_warning_count`
  - `runtime_warning_codes` when structured codes exist
  - `runtime_warning_messages_sample` optional, capped
- Keep validation warnings separate from runtime warnings

## Proposed Collection Matrix

| Metric | Engine | UI host | Persistence assembly | Notes |
|---|---|---|---|---|
| `wall_clock_ms` |  | Yes | Yes | Use `performance.now()` / equivalent |
| `replications` |  | Yes | Yes | Already known |
| `events_processed` | Yes |  | Yes | Derived from B + fired C |
| `b_events_processed` | Yes |  | Yes | Increment in Phase B |
| `c_event_scans` | Yes |  | Yes | Increment per evaluation |
| `c_events_fired` | Yes |  | Yes | Increment on true fire |
| `entities_created` | Yes |  | Yes | Prefer explicit macro hooks |
| `entities_completed` | Reuse summary |  | Yes | Alias to served |
| `max_queue_length_by_queue` | Yes |  | Yes | Prefer step-level update first |
| `avg_queue_length_by_queue` | Yes |  | Yes | Time-weighted, optional MVP+ |
| `server_utilisation_by_resource` | Already in summary |  | Yes | Reuse existing summary |
| `max_future_event_list_size` | Yes |  | Yes | Track after FEL mutations |
| `run_result_size_bytes` |  | Yes | Yes | Measure serialized saved payload |
| `errors/warnings encountered during run` | Yes | Yes | Yes | Distinguish validation vs runtime |

## 2. Expected Overhead

### Very low overhead

- `b_events_processed`
- `c_event_scans`
- `c_events_fired`
- `events_processed`
- `max_future_event_list_size`
- `runtime_warning_count`
- `replications`

Expected cost:

- one integer increment or `Math.max` per event/scan
- effectively negligible compared with predicate evaluation and entity mutation

### Low overhead

- `wall_clock_ms`
- `run_result_size_bytes`
- `entities_completed`
- `server_utilisation_by_resource` reuse

Expected cost:

- one or two host-timer calls per run
- one payload serialization for byte size at save time

### Moderate overhead

- `max_queue_length_by_queue`
- `avg_queue_length_by_queue`
- `entities_created`

Expected cost:

- moderate only if implemented by scanning all queues or many mutation points

Recommendation:

- For queue metrics, prefer per-step updates based on `stepSnap.byQueue` to avoid invasive macro-level instrumentation in MVP

### Higher overhead / optional

- per-replication `run_result_size_bytes` in large batches
- detailed warning message arrays
- any instrumentation that serializes or clones large logs during execution

Recommendation:

- Only compute sizes at final composition time
- Do not stringify intermediate worker payloads repeatedly

## 3. Proposed TypeScript Interfaces / JSON Shapes

These are proposed contracts only. The codebase is still mostly JS, but typed shapes at this boundary would be valuable.

```ts
export interface RuntimeMetrics {
  wall_clock_ms: number | null;
  replications: number;
  events_processed: number;
  b_events_processed: number;
  c_event_scans: number;
  c_events_fired: number;
  entities_created: number;
  entities_completed: number;
  max_queue_length_by_queue?: Record<string, number>;
  avg_queue_length_by_queue?: Record<string, number>;
  server_utilisation_by_resource?: Record<string, number>;
  max_future_event_list_size: number;
  run_result_size_bytes: number | null;
  runtime_warning_count: number;
  runtime_warning_codes?: string[];
  runtime_error_count?: number;
}
```

```ts
export interface ReplicationRuntimeMetrics extends RuntimeMetrics {
  replication_index: number;
  seed: number;
}
```

```ts
export interface BatchRuntimeMetrics {
  wall_clock_ms: number | null;
  replications: number;
  worker_count?: number;
  completed_replications: number;
  cancelled?: boolean;
  aggregate: RuntimeMetrics;
  per_replication?: ReplicationRuntimeMetrics[];
}
```

Recommended embedding in saved results:

```ts
export interface InstrumentedResultsJson {
  summary: Record<string, unknown>;
  aggregateStats?: Record<string, unknown>;
  replications?: Array<Record<string, unknown>>;
  warnings?: string[];
  phaseCTruncated?: boolean;
  runtimeMetrics?: RuntimeMetrics | BatchRuntimeMetrics;
}
```

Engine-internal mutable collector shape:

```ts
export interface RuntimeMetricsCollector {
  b_events_processed: number;
  c_event_scans: number;
  c_events_fired: number;
  entities_created: number;
  max_future_event_list_size: number;
  max_queue_length_by_queue: Record<string, number>;
  queue_depth_integral_by_queue: Record<string, number>;
  queue_depth_prev_time: number;
}
```

## 4. Where Metrics Should Be Displayed In The UI

### Execute panel

Primary surface:

- Add a compact **Runtime** card in `src/ui/execute/index.jsx`
- Show after single-run completion and batch completion
- Suggested fields:
  - wall clock
  - events processed
  - B-events
  - C-scans
  - C-events fired
  - entities created/completed
  - max FEL size
  - result size

Why here:

- This is where users already watch progress and save state

### Results workspace

Secondary surface:

- Add a “Runtime cost” section in `src/ui/results/ResultsWorkspace.jsx`
- Keep it below summary cards and above detailed analysis
- For batches, show both:
  - aggregate runtime metrics
  - optional per-replication min/mean/max

### Run history

Tertiary surface:

- Add only a few summary fields to history rows or detail preview:
  - wall clock
  - replications
  - result size
- Avoid overloading the main history list with many technical counters

### Share dashboard

Recommendation:

- Do not expose full runtime instrumentation on public share links by default
- Optional later: small “Run metadata” widget with replications, seed, and wall-clock only

## 5. Where Metrics Should Be Persisted

### Primary recommendation

Persist under `results_json.runtimeMetrics`.

Why:

- Keeps schema change small
- Works for both Supabase and local-storage backends
- Fits existing pattern where rich run details live in `results_json`

### Optional relational promotion later

If filtering or admin analytics need it, promote a few fields to top-level columns later:

- `duration_ms` already exists and should be populated
- possible future columns:
  - `events_processed`
  - `c_event_scans`
  - `run_result_size_bytes`

Recommendation:

- MVP should avoid a migration unless product immediately needs SQL querying on these metrics

### Save-path touchpoints

- Supabase:
  - `src/db/models.js:351-413`
- Local mode:
  - `src/db/local.js:57-68`
  - `src/db/local.js:113-133`

## 6. Minimum Viable Version

The minimum useful version should capture the cheapest, highest-signal metrics first.

### MVP scope

- `wall_clock_ms`
- `replications`
- `events_processed`
- `b_events_processed`
- `c_event_scans`
- `c_events_fired`
- `entities_completed`
- `max_future_event_list_size`
- `run_result_size_bytes`
- `runtime_warning_count`
- `server_utilisation_by_resource` reused from existing summary

### MVP implementation style

- Add one internal metrics collector in `src/engine/index.js`
- Add host timing around run execution in `src/ui/execute/index.jsx`
- Attach `runtimeMetrics` to the result before save/export
- Populate existing `duration_ms`
- Show a small runtime panel in Execute/results UI

### Why this is the right MVP

- It answers runtime sizing questions quickly
- It is mostly constant-time instrumentation
- It avoids invasive queue-mutation instrumentation until there is a proven need

## 7. Nice-To-Have Version

### Phase 2 additions

- `entities_created`
- `max_queue_length_by_queue`
- `avg_queue_length_by_queue`
- per-replication runtime metrics in batch results
- min/mean/max batch summaries for runtime metrics
- warning code buckets
- separate counts for synthetic vs model-defined B-events

### Phase 3 additions

- `runtimeMetrics` export in report generation
- charts for queue max/avg depth by queue
- comparison tooling in Results Workspace for runtime-cost deltas across experiments
- admin or operator reporting on typical result size and runtime by model

## 8. Risks Around Slowing The Engine Down

### Risk 1: Instrumentation inside the Phase C hot path

`c_event_scans` and `c_events_fired` live in the hottest loop. Even simple code here should stay minimal.

Mitigation:

- use plain numeric increments only
- avoid function calls in the hot path unless inlined or proven cheap
- avoid building strings, arrays, or objects per scan

### Risk 2: Queue metrics implemented too expensively

If `max_queue_length_by_queue` or average depth are computed by repeatedly filtering `entities` for each queue at every mutation point, performance could degrade noticeably on large models.

Mitigation:

- MVP should update queue max/avg from the existing `stepSnap.byQueue` output once per step
- move to mutation-based exact tracking only if needed later

### Risk 3: Payload-size measurement repeated too often

Repeated `JSON.stringify` on large batch payloads would be expensive.

Mitigation:

- compute `run_result_size_bytes` once, immediately before save/export

### Risk 4: Too much per-replication detail in saved runs

Storing full runtime metrics for every replication could bloat `results_json`, especially when replications are high.

Mitigation:

- MVP stores only aggregate batch runtime metrics
- per-replication metrics are optional and should be capped or feature-flagged

### Risk 5: Duplicate sources of truth

If summary fields and runtime metrics disagree, trust in the output will drop.

Mitigation:

- derive `entities_completed` from `summary.served`
- reuse `summary.perResource` instead of recomputing utilisation elsewhere

## Recommended Rollout Order

1. Add engine collector for event counters, max FEL size, and warning count.
2. Add host timing and payload-size measurement in `src/ui/execute/index.jsx`.
3. Persist `runtimeMetrics` in both Supabase and local mode.
4. Display a small runtime panel in Execute/results UI.
5. Add queue max/avg depth instrumentation only after MVP metrics are working and benchmarked.
6. Extend `tests/engine/perf_timing.js` to print the same runtime metric names used by production results, so benchmark output and runtime output speak the same language.

## Recommended Acceptance Criteria

- Single runs return and save a `runtimeMetrics` block
- Batch runs return and save an aggregate `runtimeMetrics` block
- `duration_ms` is populated from the same host timing source
- Metrics names match this document and remain stable
- The added instrumentation does not materially regress `tests/engine/perf_timing.js` baseline results

## Supporting Evidence

- Engine summary and per-resource utilisation:
  - `src/engine/index.js:1011-1101`
- Time-series collection:
  - `src/engine/index.js:891-893`
- Existing event and queue counters:
  - `src/engine/index.js:351-362`
- Run result shape:
  - `src/engine/index.js:934-947`
- Worker result compaction:
  - `src/engine/replication-runner.js:49-65`
- Save path:
  - `src/db/models.js:351-413`
  - `src/db/local.js:57-68`
  - `src/db/local.js:113-133`
- Existing perf harness counters:
  - `tests/engine/perf_timing.js:156-233`
