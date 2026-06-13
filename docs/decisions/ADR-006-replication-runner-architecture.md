# ADR-006: Sprint 4 replication runner architecture

**Date:** 2026-05-04
**Status:** Accepted
**Sprint:** Sprint 4

## Context

Sprint 4 adds multi-replication execution, Web Workers, live confidence intervals, and results persistence. The build plan left several architecture questions open:

- Whether "30 replications concurrently" means 30 browser workers or a bounded worker pool.
- Whether same-browser live progress should use Supabase real-time or local runner callbacks.
- Whether persisted run data should be one row per batch, one row per replication, or both.
- Whether users can cancel an active replication batch.

The existing app is browser-based, uses a minimal dependency set, and keeps engine code pure JavaScript with no React or DOM access. The engine returns full result objects, so replication orchestration must avoid UI freezes and unnecessary memory pressure.

## Decision

Sprint 4 will use a bounded Web Worker pool rather than spawning one worker per replication. Replications are scheduled through the pool until all N complete.

Live progress in the same browser session will use local runner callbacks from `replication-runner.js` to `execute/index.jsx`. Supabase is used for final persistence, not as the primary live progress bus for the initiating browser session.

The database persistence model is one run row per replication batch. That row stores:

- `seed` as the base seed.
- `replications` as the requested replication count.
- `results_json` containing per-replication results plus aggregate CI summaries.
- `batch_id` as a stable identifier for the batch if the schema supports it or is migrated in Sprint 4.

Sprint 4 will include cancellation for active replication batches. Cancelling stops pending replications, terminates active workers, marks the local run state as cancelled, and does not persist a successful final result. A future sprint may persist cancelled/partial batches if product requirements need auditability for abandoned runs.

## Alternatives Considered

**Spawn one worker per replication.** Rejected because 30 simultaneous workers can overload browser resources, increase memory pressure, and make responsiveness worse on modest machines. A bounded pool still keeps the UI responsive while respecting device capacity.

**Use Supabase real-time for same-browser live progress.** Rejected for the initial Sprint 4 implementation because the browser already owns the worker results and can update the dashboard directly. Routing local progress through the network/database path adds latency, schema requirements, and failure modes without improving the initiating user's experience.

**Store one row per replication.** Rejected for now because it complicates run history, ownership checks, and cleanup. The current UI concept treats one experiment run as one item in history; a batch row with structured `results_json` preserves that model.

**No cancellation.** Rejected because long-running worker batches need an escape hatch. Once work is off-main-thread, terminating workers is straightforward and aligns with user expectations.

## Consequences

### Positive

- UI remains responsive without oversubscribing the browser with too many workers.
- The Execute panel can show immediate live progress without depending on Supabase real-time availability.
- Run history stays simple: one experiment batch appears as one saved run.
- Cancellation is supported from the first worker-based implementation.

### Negative

- Other clients will not see live in-progress updates for a run started in this browser.
- A single batch row can make querying individual replication rows harder in SQL; consumers must read `results_json`.
- Cancelled/partial batches are not persisted as successful runs, so abandoned run auditing is deferred.

## Rules added to CLAUDE.md

- Sprint 4 uses a bounded worker pool, not one worker per replication.
- Same-browser live progress uses local runner callbacks; Supabase real-time is optional/deferred for cross-client observation.
- Persist one run row per replication batch with per-replication results and aggregate CI in `results_json`.
- Active replication batches must be cancellable.

## Amendment — Sprint 79 batch performance optimisations

The following changes were made after this ADR was originally accepted:

**Persistent worker pool (`createReplicationPool`).**  Workers are now spawned once per batch run and reused across all rounds (adaptive batch, sweep points). The pool is created by the caller (`adaptive-batch.js`, `sweep-runner.js`) and passed into `runReplications()` via the `pool` option. Workers are terminated only on cancellation, error, or explicit `pool.destroy()` — not after each `runReplications` call.

**INIT_RUN message protocol.**  The model, schedules, and run configuration are sent to each worker exactly once via an `INIT_RUN` message before any replications begin. Subsequent `RUN_REPLICATION` messages carry only `{ replicationIndex, seed, entityDetail }`, avoiding a `structuredClone` of the entire model per job.

**Worker cap lifted.**  The original conservative cap of 4 workers has been removed. The pool size is now `min(replications, navigator.hardwareConcurrency - 1)` with a minimum of 1 and no upper cap beyond the replication count.

**Batch-mode engine options.**  Two `buildEngine` options reduce per-replication cost in batch paths:
- `collectTrace: false` — skips all per-cycle trace-entry construction and the final `buildTraceFromLog` call. Batch consumers do not read `log` or `trace`.
- `entityDetail: false` — returns `entitySummaryCompact` (pre-aggregated counts) instead of cloning every entity object. Rep 0 always uses `entityDetail: true` to keep full entity data for the AI-explore verify flow and report generation.

**`runtimeModel` cache.**  A module-level `WeakMap` in `src/engine/index.js` caches the result of `resolveInlineSchedules` + `modelWithShiftInitialCapacity` keyed by the raw model object. All reps in a persistent worker share the same model reference, so reps 2–N skip model resolution entirely.

## Open Questions

- Should a future sprint persist cancelled/partial batches for auditability?
