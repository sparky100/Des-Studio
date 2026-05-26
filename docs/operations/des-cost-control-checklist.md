# DES Cost-Control Checklist

Date: 2026-05-26  
Scope: Practical operations checklist for the current DES Studio codebase.

## Existing Benchmark Baseline

- Existing benchmark scripts found:
  - `tests/engine/perf_timing.js`
  - `tests/engine/mm1_benchmark.js`
  - `tests/engine/mmc_benchmark.js`
  - `tests/engine/benchmarks/benchmarks.test.js`
  - `tests/engine/benchmarks/performance.test.js`
- Existing benchmark fixtures/models found:
  - `tests/engine/benchmark-scenarios.js`
  - `src/engine/templates.js`
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/analysis/browser-simulation-performance-review.md`
  - `docs/analysis/three-phase-engine-efficiency-review.md`
  - `docs/architecture/des-run-admission-rules.md`
- Existing runtime metrics found:
  - `wall_clock_ms`
  - `replications`
  - `events_processed`
  - `c_event_scans`
  - `c_events_fired`
  - `entities_created`
  - `entities_completed`
  - `max_queue_length_by_queue`
- Existing test coverage related to performance:
  - `tests/engine/replication-runner.test.js`
  - `tests/ui/execute/execute-panel.test.jsx`
  - benchmark coverage under `tests/engine/benchmarks/`
- Gaps compared with the requested benchmark/sizing goal:
  - no production-facing cost dashboard is defined yet
  - no enforced admission layer yet blocks large planned-row or large-replication runs
  - no retained metric currently records saved `results_json` byte size

## Current Platform Split

### Browser

- DES engine execution runs in the browser today, not in Supabase Edge Functions and not in Cloudflare Workers.
- Single-run execution happens on the browser main thread in [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/ui/execute/index.jsx:602).
- Replication batches already use browser Web Workers via [src/engine/replication-runner.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/engine/replication-runner.js:69) and [src/engine/worker.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/engine/worker.js:3).

### Supabase

- Supabase handles auth, model storage, run storage, sharing, admin config, and Edge Functions.
- `simulation_runs` is the main run-history storage surface, including `results_json`.
- DB-level quota triggers already exist for:
  - max models per user
  - max runs per model
  - see [20260515000000_sprint38_user_management.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260515000000_sprint38_user_management.sql:103)

### Cloudflare

- No Cloudflare Worker runtime was found in this repo.
- Cloudflare’s practical role here is static frontend hosting and caching, not DES compute.
- See [cloudflare-des-runtime-review.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/cloudflare-des-runtime-review.md).

## Checklist

### 1. What should run in the browser

- Keep small and moderate DES runs in the browser.
  - This already matches the current architecture in [des-runtime-execution-map.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/des-runtime-execution-map.md).
- Keep single-user model editing, local validation, results exploration, exports, and report generation browser-side.
- Keep replication batches in browser Web Workers for now, not on the main thread.
- Prefer browser execution for:
  - single runs
  - small replication studies
  - local charts and result inspection
  - import preview and validation feedback

Operational rule:

- Browser execution should remain the default only while:
  - run size is within admission limits
  - `collectTimeSeries` is not producing oversized payloads
  - the model is not flagged `large` or `too_large` by the complexity estimator

### 2. What can run in Supabase Edge Functions

- Lightweight authenticated API tasks only.
- Good current uses:
  - `import-model` for auth + model normalization + validation + insert
    - [supabase/functions/import-model/index.ts](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/functions/import-model/index.ts)
  - `llm-proxy` for outbound LLM proxying and per-request rate limiting
    - [supabase/functions/llm-proxy/index.ts](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/functions/llm-proxy/index.ts)
  - email/notification tasks
    - `notify-feedback`
    - `notify-new-signup`

Operational rule:

- Edge Functions may validate, proxy, normalize, notify, and write metadata.
- Edge Functions should not run long simulation loops, large replications, or heavy result compaction jobs.

### 3. What can run in Cloudflare Workers

- Only lightweight frontend-adjacent API or cache logic, if Cloudflare Workers are introduced later.
- Safe categories:
  - request rewriting
  - header-based routing
  - cache-aware static/JSON fronting
  - tiny auth/session helpers if needed

Operational rule:

- Do not place DES engine execution, replication loops, trace compaction, or large model imports in Cloudflare Workers.
- Do not confuse browser Web Workers with Cloudflare Workers; they solve different problems.

### 4. What should move to a dedicated worker

- Medium and large DES experiments.
- Future candidates:
  - high replication studies
  - runs with large planned schedules
  - workloads with large queue growth or heavy Phase C scans
  - background recomputation or summary-building jobs

Recommended target architecture:

- follow [des-dedicated-worker-architecture.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/architecture/des-dedicated-worker-architecture.md)
- keep Supabase as auth/storage/control plane
- keep Cloudflare as frontend/static hosting
- move only the expensive compute path out of browser/serverless request handlers

### 5. Storage controls

- Treat `simulation_runs.results_json` as the primary storage-risk surface.
  - Save path: [src/db/models.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/db/models.js:351)
- Keep top-level SQL columns for history/search/filter use:
  - `replications`
  - `seed`
  - `duration_ms`
  - `run_label`
  - `archived`
  - summary KPI columns
- Keep rich payloads in `results_json` only where needed.

Checklist:

- stop persisting raw single-run `log` by default once compact trace coverage is sufficient
- keep `runtimeMetrics` by default because they are compact and high-value
- keep capped `trace`, not unlimited event-level detail
- default `collectTimeSeries` off for large runs or auto-disable it through admission policy
- measure `JSON.stringify(results_json).length` at save time in a future metadata field

Supporting references:

- [supabase-des-compute-and-storage-review.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/supabase-des-compute-and-storage-review.md)
- [des-results-storage-strategy.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/architecture/des-results-storage-strategy.md)

### 6. Result retention controls

- Keep all run rows only if payload richness is controlled.
- Use `archived` for UI-level organization now.
  - migration: [20260514000001_simulation_runs_organisation.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260514000001_simulation_runs_organisation.sql)
- Prefer a tiered retention policy:
  - recent small runs: keep richer payloads
  - large runs: summary-first persistence
  - older archived runs: retain metadata, summaries, and runtime metrics; trim optional artifacts in a future archival strategy

Important current constraint:

- `results_json` is immutable after insert under [PR-001_run_record_integrity.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/PR-001_run_record_integrity.sql:36)

Operational rule:

- Do not assume background compaction can silently rewrite historical run payloads.
- If post-save retention compaction is needed, use:
  - a policy change
  - a separate archival table
  - or artifact indirection via object storage

### 7. Run size limits

Current repo assets already point toward limit enforcement:

- global platform limits live in `platform_config`
  - seed values include:
    - `maxModelsPerUser`
    - `maxRunsPerModel`
    - `maxReplications`
    - `maxSweepPoints`
    - `maxSimTime`
  - see [20260511000002_create_platform_config.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260511000002_create_platform_config.sql:15)
- Execute currently blocks only:
  - non-positive replications
  - warm-up >= maxSimTime
  - see [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/ui/execute/index.jsx:191)

Recommended controls:

- enforce replications by tier, not just `>= 1`
- enforce planned-row limits for schedule-based arrivals
- enforce estimated scan/event ceilings from the complexity estimator
- auto-disable high-cost options like `collectTimeSeries` for large runs

Recommended policy source:

- [des-run-admission-rules.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/architecture/des-run-admission-rules.md)

### 8. Logging limits

- Keep browser logs and DB-stored traces separate conceptually.
- Raw UI log/history is useful for local explanation, but expensive as a storage default.
- Current trace is already capped at 1,000 records.
  - see [src/simulation/traceCollector.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/simulation/traceCollector.js)

Checklist:

- do not persist unbounded engine logs
- keep trace caps in place
- avoid per-event persistence entirely
- restrict server-side function logs to operational diagnostics, not request payload dumps
- sample or aggregate repetitive warnings rather than logging each event path

### 9. Import size limits

- `import-model` currently normalizes and validates a full model payload, then inserts it.
  - [supabase/functions/import-model/index.ts](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/functions/import-model/index.ts:214)
- The repo does not currently enforce a clear request-size ceiling for imports.

Recommended controls:

- reject oversized import bodies before full normalization
- define a max planned-row count per import
- define a max encoded share/import URL payload size for `#import` and `#share` flows
- reject imports with huge embedded schedules unless the model is intended for dedicated-worker execution

Practical rule:

- keep imports small enough for browser parsing, Edge Function JSON parsing, and Postgres row storage to remain predictable

### 10. API rate limits

- LLM proxy already has an in-memory per-hour rate limit keyed by auth header or forwarded IP.
  - [supabase/functions/llm-proxy/index.ts](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/functions/llm-proxy/index.ts:21)
  - default is 25 per hour if not configured otherwise
  - config can be read from `platform_config`

Checklist:

- keep LLM proxy rate limiting enabled
- move from in-memory-only limits to a shared durable limiter if multi-instance traffic grows
- add explicit import endpoint throttling
- add rate limits for share-link creation and feedback submission if abuse appears
- keep admin RPCs behind RLS/admin checks only

### 11. Abuse prevention

Already present:

- RLS on `des_models` and `simulation_runs`
- owner/admin checks in migrations and RPCs
- model/run quota triggers
- admin audit logging

References:

- quota triggers: [20260515000000_sprint38_user_management.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260515000000_sprint38_user_management.sql:117)
- admin audit log + RPC: [20260515000000_sprint38_user_management.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260515000000_sprint38_user_management.sql:14), [20260515000000_sprint38_user_management.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260515000000_sprint38_user_management.sql:56)
- RLS fixes: `20260510090003_fix_des_models_rls.sql`, `20260510090004_fix_rls_recursion.sql`

Recommended additions:

- admission limits before run launch, not only DB quotas after save
- suspend/flag abusive accounts earlier in the request path
- cap share-link creation frequency
- rate-limit model imports and AI calls separately
- monitor repeated oversized run attempts as abuse or misconfiguration signals

### 12. Monitoring dashboards and alerts to add

#### Supabase / database

Add dashboards for:

- `simulation_runs` row count growth by day
- average and p95 `results_json` size
- insert failures by code
  - especially `quota_exceeded`
- run-history query latency
- storage growth split by:
  - `simulation_runs`
  - `des_models`
  - optional future object-storage artifacts

Add alerts for:

- unusual spike in `simulation_runs` inserts
- repeated quota-trigger failures
- rapid growth in archived runs with large payloads
- repeated `results_json` rows above a size threshold

#### Edge Functions

Add dashboards for:

- `llm-proxy` request count, 429 count, upstream error rate, upstream token/request size
- `import-model` request count, 4xx/5xx rate, validation rejection rate, median body size
- notification function error rates

Add alerts for:

- sustained `llm-proxy` 429s
- sustained `llm-proxy` 5xx or upstream failures
- spikes in import failures or oversized import attempts

#### Browser / application

Add telemetry for:

- `wall_clock_ms`
- `events_processed`
- `c_event_scans`
- `replications`
- `collectTimeSeries` usage rate
- estimated complexity risk level
- save payload byte size

Use the existing runtime metrics block as the base for that future telemetry path:

- [des-runtime-metrics-implementation.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/des-runtime-metrics-implementation.md)

## Recommended Immediate Actions

1. Treat browser DES execution as the default only for small runs; use the planned admission layer to gate larger ones.
2. Keep Supabase Edge Functions limited to validation, proxying, and notifications; do not move heavy DES compute there.
3. Keep Cloudflare limited to static hosting/cache concerns; do not introduce Worker-based DES execution.
4. Enforce or surface platform limits from `platform_config` in the run-launch path, not only through DB quotas after persistence.
5. Reduce default stored payload size by de-emphasizing raw `log` and large `timeSeries` persistence for bigger runs.
6. Add monitoring for `results_json` growth, LLM proxy 429/5xx rates, and quota-trigger failures.

## Verification

No tests were run in this task because the prompt requested a documentation artifact only.
