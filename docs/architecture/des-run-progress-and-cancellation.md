# DES Run Progress And Cancellation

Date: 2026-05-26  
Scope: Design only. No application logic changed in this task.

## Existing Benchmark Baseline

- Existing benchmark scripts found:
  - `tests/engine/perf_timing.js`
  - `tests/engine/mm1_benchmark.js`
  - `tests/engine/mmc_benchmark.js`
  - `tests/engine/benchmarks/benchmarks.test.js`
  - `tests/engine/benchmarks/performance.test.js`
- Existing benchmark fixtures/models found:
  - `tests/engine/benchmark-scenarios.js` includes `mm1-small`, `mm1-high-util`, `post-office-multi-stage`, `glasgow-train-plan`, `stadium-grouped-spectators`, and `large-queues-stress`
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/analysis/browser-simulation-performance-review.md`
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
  - `tests/engine/replication-runner.test.js`
  - `tests/ui/execute/execute-panel.test.jsx`
  - benchmark and performance tests under `tests/engine/benchmarks/`
- Gaps compared with the requested benchmark/sizing goal:
  - No benchmark currently measures progress event overhead or cancellation latency.
  - No benchmark currently compares main-thread single-run responsiveness against worker-backed execution.
  - No tests currently verify persistence policy for cancelled or failed runs.

## Current State

### Execution paths today

- Single-run execution is synchronous on the browser main thread in [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/execute/index.jsx:602). The panel builds an engine and immediately calls `engine.runAll()`, then saves the finished result.
- Multi-replication execution already uses browser workers through [src/engine/replication-runner.js](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/replication-runner.js:69) and [src/engine/worker.js](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/worker.js:3).
- Batch progress already exists. The runner emits `{ completed, total, running, pending, cancelled, workerCount }` via `onProgress` in [src/engine/replication-runner.js](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/replication-runner.js:98) and the Execute panel renders that state from [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/execute/index.jsx:473), [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/execute/index.jsx:485), and [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/execute/index.jsx:2265).
- Batch cancellation already exists. The UI calls `runnerRef.current.cancel()` from [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/execute/index.jsx:676), and the runner terminates active workers in [src/engine/replication-runner.js](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/replication-runner.js:220).
- Cancelled batch runs are not persisted today. The current handler sets UI state to cancelled and explicitly says results were not saved in [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/execute/index.jsx:581).
- Failed replications are also not persisted as run records today. Failures surface through `onError` and return the UI to idle in [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/execute/index.jsx:575).

### Storage behaviour today

- Completed runs are stored as `simulation_runs.results_json` through [src/db/models.js](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/db/models.js:351).
- There is no explicit run status column or status enum in the current save path. The persisted row assumes a completed result payload.
- Run history fetches only the latest completed rows and does not currently distinguish cancelled, partial, or failed states in [src/db/models.js](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/db/models.js:457).

### Practical implication

- The app already has a clear extension point for batch progress and batch cancellation.
- The app does not yet have an internal checkpoint hook for single-run progress or single-run cancellation. Without that hook, a long `runAll()` call cannot report intermediate progress or stop cooperatively.

## Design Proposal

### 1. Progress model

Use one shared progress envelope across browser main-thread runs, browser-worker runs, and future dedicated-worker runs.

```ts
type RunStatus =
  | "queued"
  | "starting"
  | "running"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "completed";

interface RunProgressEvent {
  runId?: string | null;
  mode: "single" | "batch" | "worker-job";
  status: RunStatus;
  wallClockMs: number;
  replicationsCompleted: number;
  replicationsTotal: number;
  activeWorkers?: number | null;
  currentReplicationIndex?: number | null;
  currentSeed?: number | null;
  currentSimTime?: number | null;
  maxSimTime?: number | null;
  percent?: number | null;
  percentBasis?: "time" | "replications" | "unknown";
  eventsProcessed?: number | null;
  cEventScans?: number | null;
  cEventsFired?: number | null;
  entitiesCreated?: number | null;
  entitiesCompleted?: number | null;
  maxFutureEventListSize?: number | null;
  warnings?: string[];
  message?: string | null;
}
```

### 2. Progress metrics to show

- Always show:
  - status
  - elapsed wall-clock time
  - completed/total replications
  - active workers and pending count for batch mode
- Show when available at low cost:
  - `currentSimTime`
  - `maxSimTime`
  - `eventsProcessed`
  - `cEventScans`
  - `cEventsFired`
  - `entitiesCreated`
  - `entitiesCompleted`
  - `maxFutureEventListSize`
- Percent rules:
  - If `maxSimTime` is present and the run is time-bounded, percent may be estimated from `currentSimTime / maxSimTime`.
  - For batch mode, percent should be based on `replicationsCompleted / replicationsTotal`.
  - For condition-based termination or structurally unstable models, percent should be `null` and the UI should show “Progress available, finish time unknown.”

### 3. Progress event frequency

Emit progress on a throttle, not every event.

- Browser worker or dedicated worker:
  - emit every 150 to 250 ms, whichever cadence proves cheapest
  - also emit immediately on replication completion, cancellation, failure, and final completion
- Main-thread cooperative single-run mode:
  - emit at phase-boundary checkpoints
  - do not update React state more often than every 250 ms
- Additional guard:
  - also emit when at least 1,000 `events_processed` have been added since the last event, whichever comes first

This keeps the design responsive without turning progress itself into the bottleneck.

### 4. Cancellation mechanism

#### Batch runs

Keep the current `runner.cancel()` contract and extend it slightly:

- UI status moves to `cancelling` immediately.
- Active browser workers terminate immediately as they do today.
- Completed replications already in memory are retained as partial in-memory results.

#### Single runs

Add a small additive engine observer/cancellation hook rather than changing simulation semantics.

Recommended additive contract:

```ts
interface EngineRunObserver {
  shouldCancel?: () => boolean;
  onProgress?: (event: RunProgressEvent) => void;
  progressThrottleMs?: number;
}
```

Recommended checkpoint locations inside the engine:

- after each Phase A clock advance
- after each B-event completion
- after each Phase C pass
- before any expensive repeated C-scan restart loop

Cancellation should be cooperative:

- `shouldCancel()` returns `true`
- engine stops at the next checkpoint
- engine returns a `cancelled` result shape instead of a normal completed summary

This is safer than trying to interrupt arbitrary synchronous work mid-macro.

### 5. Partial result handling

Use explicit partial-result semantics.

#### Cancelled single run

- Keep:
  - latest snapshot
  - partial runtime metrics
  - warnings
  - partial log
  - cancellation reason
- Mark result as incomplete:
  - `status: "cancelled"`
  - `partial: true`
- Do not present final KPI language such as “average wait” as if the run finished normally unless the UI labels it clearly as partial.

#### Cancelled batch

- Keep completed replications in memory.
- Show:
  - “2 of 5 replications completed before cancellation”
  - aggregate stats only if based on completed replications and clearly labeled partial
- Default persistence recommendation:
  - do not auto-save cancelled partial batches in the first implementation
  - allow a later explicit “Save partial results” action if users find the retained subset useful

#### Failed run

- Keep lightweight failure metadata:
  - status
  - message
  - stack if available
  - elapsed time
  - replication index and seed if batch-related
- Do not persist bulky partial traces by default.

### 6. Persistence design

Short term, use additive JSON fields inside `results_json` before any schema migration.

Recommended JSON additions:

```ts
interface RunExecutionMetadata {
  status: RunStatus;
  partial?: boolean;
  cancelledAt?: string | null;
  failedAt?: string | null;
  finishedAt?: string | null;
  failureMessage?: string | null;
  cancellationReason?: string | null;
  completedReplications?: number | null;
  totalReplications?: number | null;
}
```

Recommended policy:

- Completed runs:
  - persist as today
- Cancelled single runs:
  - optional in MVP
  - if persisted, store only compact metadata plus partial `runtimeMetrics`, not full event trace
- Cancelled batch runs:
  - do not auto-persist in MVP
- Failed runs:
  - persist only if a lightweight operational history is needed later

Longer term, if run operations become first-class, add explicit columns:

- `run_status`
- `started_at`
- `finished_at`
- `cancelled_at`
- `failure_message`

That would make run-history filtering and support diagnostics easier than relying only on JSON.

### 7. UI behaviour

#### Single run

- Replace silent blocking with a visible progress card.
- Show:
  - status
  - elapsed time
  - events processed
  - current simulation time when known
  - cancel button
- If percent is unknown, show an indeterminate progress bar and plain-English wording:
  - “The simulation is still running. We can show live workload, but we cannot predict the finish time yet.”

#### Batch run

- Keep the existing replication batch panel.
- Extend it with:
  - elapsed wall-clock time
  - per-replication completion count
  - cancellation-in-progress state
  - partial-results summary after cancellation

#### After cancellation

- Show a non-error informational state, not the same styling as an engine failure.
- Offer:
  - discard partial result
  - inspect partial snapshot/log
  - later, save partial result if the product decides to support it

### 8. Worker and browser compatibility

#### Browser today

- Batch runs already fit the worker model well.
- Single runs should move to the same message-based contract when practical, because that solves both responsiveness and cancellation together.

#### Future dedicated worker

The same progress envelope can be reused for the architecture proposed in [des-dedicated-worker-architecture.md](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/architecture/des-dedicated-worker-architecture.md).

- Browser worker:
  - `postMessage({ type: "RUN_PROGRESS", payload })`
  - `postMessage({ type: "RUN_COMPLETE", payload })`
  - `postMessage({ type: "RUN_FAILED", payload })`
- Dedicated worker:
  - identical payloads over websocket, SSE, or Supabase realtime

This keeps the UI contract stable even if the execution location changes.

## Risks

- Main risk: adding too many checkpoints can slow the engine down, especially inside heavy Phase C loops.
- Single-run cancellation requires engine cooperation. Without careful checkpoint placement, cancellation latency may still feel poor on very dense workloads.
- Partial summaries can mislead users if the UI presents incomplete KPIs as final analysis.
- Persisting failed or cancelled runs too aggressively could bloat `simulation_runs` with low-value operational noise.
- Message-schema drift is possible if batch workers, browser single-run mode, and future dedicated workers each invent different progress payloads.

## Test Plan

### Unit tests

- Engine observer hook:
  - progress callback receives throttled updates
  - cancellation stops at a checkpoint without corrupting engine state
  - completed runs still return identical final summaries when observer is absent
- Replication runner:
  - progress events include elapsed time and status transitions
  - cancelling retains finished replication payloads in memory
  - failure emits `failed` status exactly once

### UI tests

- Single-run panel shows indeterminate progress for a long-running run.
- Batch panel updates counts and switches to `cancelling` immediately on click.
- Cancelled state renders partial-results wording, not generic error wording.
- Completed runs still save as before.
- Cancelled runs follow the chosen persistence policy.

### Performance and benchmark checks

- Extend `tests/engine/perf_timing.js` or `tests/engine/benchmark-scenarios.js` rather than adding a new framework.
- Add one benchmark with progress disabled and one with progress enabled.
- Measure:
  - total wall-clock delta
  - progress callback count
  - cancellation latency under large queue / heavy C-scan scenarios

## Minimal Implementation Plan

1. Extend the existing progress shape in `src/engine/replication-runner.js` with elapsed time and explicit status transitions.
2. Introduce a small shared `RunProgressEvent` shape in a low-risk shared module.
3. Add an additive observer/cancellation hook to the engine without changing default `runAll()` behaviour when no observer is provided.
4. Use that hook first for single-run browser execution in `src/ui/execute/index.jsx`.
5. Keep cancelled and failed runs non-persistent in the first release unless a compact metadata-only save path is clearly needed.
6. Add focused tests around progress throttling, cancellation latency, and UI state transitions.

## Recommendation

The codebase already has a clear extension point for batch progress and cancellation, so that part should be evolved in place. The larger design decision is single-run execution: if simmodlr wants trustworthy progress and cancellation for long runs, the safest path is to add cooperative engine checkpoints and then move single-run execution onto the same worker-style messaging contract already used for replication batches.

## Verification

No tests were run in this task because the prompt requested a design document only.
