# Supabase DES Compute And Storage Review

## Current Supabase Responsibilities

Supabase is currently responsible for storage, auth, sharing, admin/config, and a small number of Edge Functions. It is not the DES compute runtime.

### What Supabase does today

- stores DES models
- stores simulation run history
- stores rich run results in `results_json`
- stores experiments, model versions, sweeps, share links, feedback, user settings, and platform config
- enforces auth and row-level access
- hosts Edge Functions for model import, LLM proxying, and notifications

### What Supabase does not do today

- it does not run the DES engine
- it does not execute replications
- it does not run CPU-heavy simulation work inside Edge Functions

That matches the current runtime architecture documented in [des-runtime-execution-map.md](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/analysis/des-runtime-execution-map.md).

## Tables And Functions Used

### Core model and run storage

- `des_models`
  - read/write wrapper: [models.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/db/models.js)
  - stores both legacy top-level arrays and newer `model_json`
  - includes metadata such as `visibility`, `access`, `tags`, `goals`, `latest_version`, `parent_model_id`

- `simulation_runs`
  - write path: `saveSimulationRun(...)` in [models.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/db/models.js)
  - read paths: `fetchRunHistory(...)`, `getRun(...)`, share-link lookup
  - stores both summary columns and a rich `results_json` blob

- `model_versions`
  - migration: [20260520000000_add_model_versions.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260520000000_add_model_versions.sql)
  - stores full `model_json` snapshots per version

- `experiments`
  - created in [20260514000000_create_experiments.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260514000000_create_experiments.sql)
  - stores saved run-config definitions

- `sweeps`
  - migration: [20260510090000_share_links_sweeps.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260510090000_share_links_sweeps.sql)
  - stores sweep config and results as JSONB

- `share_links`
  - migration: [20260510090000_share_links_sweeps.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260510090000_share_links_sweeps.sql)
  - exposes saved run outputs publicly by token

### Admin and support tables

- `platform_config`
- `profiles`
- `user_settings`
- `admin_audit_log`
- `feedback`

### Security-definer / helper functions found

- `model_has_active_share(...)`
- `run_has_active_share(...)`
- `is_platform_admin()`
- `is_user_suspended(...)`
- `log_admin_action(...)`
- `get_platform_limit(...)`
- `get_admin_user_stats(...)`
- `get_platform_stats(...)`
- `get_signup_counts(...)`

These are created across:

- [20260505073000_platform_roles_user_settings.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260505073000_platform_roles_user_settings.sql)
- [20260510090004_fix_rls_recursion.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260510090004_fix_rls_recursion.sql)
- [20260515000000_sprint38_user_management.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260515000000_sprint38_user_management.sql)
- [20260524060000_sprint71_saas_operator.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/migrations/20260524060000_sprint71_saas_operator.sql)

## Edge Functions

Functions present under `supabase/functions/`:

- `import-model`
  - normalizes and validates a posted model, then inserts into `des_models`
  - file: [import-model/index.ts](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/functions/import-model/index.ts)

- `llm-proxy`
  - reads config, applies in-memory rate limiting, and proxies LLM requests upstream
  - file: [llm-proxy/index.ts](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/functions/llm-proxy/index.ts)

- `notify-feedback`
  - sends support notifications
  - file: [notify-feedback/index.ts](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/functions/notify-feedback/index.ts)

- `notify-new-signup`
  - sends signup notifications
  - file: [notify-new-signup/index.ts](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/supabase/functions/notify-new-signup/index.ts)

### Edge Function compute risk

I found no Supabase Edge Function that runs the DES engine or performs CPU-heavy replications.

Risk level by function:

- `import-model`: low to medium
  - JSON parsing and validation cost grows with model size, but it is not simulation compute
- `llm-proxy`: network-bound, not DES CPU-bound
- notification functions: low compute

Conclusion:

- Supabase Edge Functions are not currently the DES compute bottleneck
- the browser and Postgres row growth are the bigger operational risks

## Model Storage Review

Models are stored in two overlapping ways:

- denormalized top-level columns such as `entity_types`, `b_events`, `c_events`, `queues`
- `model_json`, which now carries the canonical richer shape including `graph`, `experimentDefaults`, `goals`, `timeUnit`, `epoch`, and `dataSources`

Implications:

- model rows can become large as graph metadata and imported schedule-related config grow
- versioning multiplies this because `model_versions.model_json` stores full snapshots
- import paths write the same model content into both top-level columns and nested `model_json`, which increases storage duplication

## Run Storage And Result Storage Review

### How runs are stored

`simulation_runs` stores a hybrid shape:

- top-level relational summary columns:
  - `total_arrived`
  - `total_served`
  - `total_reneged`
  - `avg_wait_time`
  - `avg_service_time`
  - `renege_rate`
  - `replications`
  - `max_simulation_time`
  - `warmup_period`
  - `duration_ms`
  - `run_label`
  - `tags`
  - `archived`
  - `version_id`

- nested JSONB payload:
  - `results_json`

### What goes into `results_json`

Single-run saves can include a large payload assembled from engine output:

- `summary`
- `log`
- `snap`
- `entitySummary`
- `trace`
- `traceTruncated`
- `timeSeries` when enabled
- `waitDist`
- `runtimeMetrics`
- warnings and Phase C truncation flags
- run provenance fields such as `_model_snapshot`, `_engine_version`, `_prng_algorithm`, `_base_seed`

Evidence:

- engine returns these fields in [index.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/engine/index.js)
- save path copies the full result into `results_json` in [models.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/db/models.js)

### Are event-level traces persisted?

Yes.

- `trace` is derived from the engine log via [traceCollector.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/simulation/traceCollector.js)
- it is capped at 1,000 trace records and sets `traceTruncated` when over cap
- that trace is included in engine results and therefore saved in `results_json` for single runs

Important nuance:

- trace volume is bounded better than raw log volume
- raw `log` is still saved for single runs and is not similarly capped in the persistence layer

### Are large JSON blobs stored in Postgres?

Yes, clearly.

The main large-blob tables are:

- `simulation_runs.results_json`
- `des_models.model_json`
- `model_versions.model_json`
- `sweeps.results`
- `experiments.config`

The biggest concern is `simulation_runs.results_json`, because it can combine:

- full single-run step log
- entity summary array
- trace array
- time series array
- wait distribution
- runtime metrics
- AI narrative and description stored in sibling text columns

### Batch run behavior

Batch run saves are materially safer than single-run saves.

- replication worker results are compacted in [replication-runner.js](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/src/engine/replication-runner.js)
- persisted batch metadata stores:
  - aggregate stats
  - aggregate runtime metrics
  - a compact per-replication summary list
- it does not save the full per-replication logs or full traces for all replications

That is already a good pattern and should be preserved.

## Estimated Storage Growth Risks

### Highest-risk growth path: single-run `results_json`

Storage growth risk is highest for long single runs with:

- `collectTimeSeries = true`
- many entities in `entitySummary`
- long `log`
- non-trivial `trace`

This is the biggest current risk because:

- the single-run path is browser-main-thread execution
- the save path persists the full result object rather than a compact summary projection

### Medium-risk growth path: versioned models

Each saved version stores a full `model_json` snapshot. This is reasonable for auditability, but larger graph-heavy models and imported schedule-rich models will multiply storage over time.

### Medium-risk growth path: sweeps

`sweeps.results` is JSONB and can also grow quickly if parameter sweeps are frequent or high-dimensional.

### Lower-risk but relevant growth path: AI text columns

`narrative_text` and `model_description_text` are not the largest payloads compared with traces or time series, but they still increase long-term row size.

## Pagination And Indexing Review

### Current run-history query shape

`fetchRunHistory(modelId, filters)` currently does:

- `WHERE model_id = ?`
- `AND archived = ?`
- `ORDER BY ran_at DESC`
- `LIMIT 20`

That is a sensible page size, but the index support is only partial.

### Existing indexes found

- `simulation_runs_model_id_idx` on `(model_id)`
- `simulation_runs_ran_at_idx` on `(ran_at DESC)`
- `simulation_runs_run_label_idx` on `(run_label)`
- `simulation_runs_archived_idx` on `(archived)`
- `idx_simulation_runs_version` on `(version_id)`

### Indexing assessment

Pagination is acceptable at small to moderate scale because history is limited to 20 rows, but the index pattern is not ideal for the exact query.

Recommended index:

- composite run-history index on `(model_id, archived, ran_at DESC)`

Why:

- it matches the dominant filter + sort path exactly
- it should outperform separate single-column indexes as run counts grow

Possible secondary index:

- `(model_id, run_label)`

Only if label search is expected to be used frequently at scale. Right now the search is applied client-side after fetching 20 rows, so it is not urgent.

### Share-link lookup assessment

`listShareLinks(modelId)` first fetches all run IDs for a model and then issues an `IN (...)` query to `share_links`. That is workable at low scale, but it will get less efficient as run counts rise.

A future optimization would be:

- a join-based RPC or view for share links by `model_id`
- or a supporting index on `share_links(run_id, created_at DESC)` if not already present

## Recommendations For Summaries Vs Traces

### Keep in relational columns

Continue storing the high-value summary fields in first-class SQL columns:

- counts
- averages
- replications
- duration
- max simulation time
- warmup period
- archived flag
- run label

These are exactly the fields needed for history tables, admin aggregates, and coarse filtering.

### Keep in `results_json`

Keep compact structured detail that is expensive to normalize but useful to reopen:

- `summary`
- `runtimeMetrics`
- `waitDist`
- compact aggregate stats for batches
- compact per-replication summaries
- provenance snapshot fields

### Do not persist by default for large runs

For large runs, do not persist full:

- `log`
- `entitySummary`
- `trace`
- `timeSeries`

Recommended rule:

- small runs: persist as today
- medium runs: persist `trace` and `timeSeries`, but consider trimming `log`
- large runs: persist summary + runtime metrics + compact diagnostics only
- too-large runs: persist summary-only unless user explicitly opts in and plan/tier allows it

### Specific recommendation on traces

If diagnostics need a trace:

- keep the capped `trace`
- drop or heavily trim raw `log`

`trace` is already a bounded, purpose-built representation. `log` is the riskier storage choice.

## Recommended Retention Strategy For Run Outputs

### Default retention posture

Use a tiered retention model for `simulation_runs` payload richness, not just row count.

Recommended approach:

- retain all run rows, but vary how much detail is retained
- archive old rows in the UI as now
- optionally prune heavy JSON subfields for old large runs in a later maintenance process

### Suggested policy

- keep summary columns indefinitely
- keep full `results_json` for recent small runs
- keep compact `results_json` for large runs
- for archived runs older than a retention threshold:
  - preserve `summary`
  - preserve `runtimeMetrics`
  - preserve batch aggregates
  - remove `log`, `entitySummary`, and `timeSeries` if they are no longer needed

Suggested thresholds to evaluate:

- full rich payload for 30-90 days
- compact payload afterward for archived runs

Because current immutability triggers prevent rewriting `results_json` after insert, this retention strategy would require a policy change or a separate archival table rather than a silent background mutation.

## Edge Function Compute Risks

### Import function

The main edge risk is oversized model-import payloads, not DES compute.

Risk factors:

- very large pasted/imported models
- duplicated payload shape written into both top-level columns and `model_json`

### LLM proxy

The LLM proxy’s main risks are:

- rate limiting
- external API latency
- cost control

It is not a DES compute risk.

### Notification functions

These are operationally low-risk from a compute standpoint.

## Recommended Indexes

Recommended but not applied:

- `simulation_runs (model_id, archived, ran_at DESC)`
- `share_links (run_id, created_at DESC)`
- optionally `simulation_runs (model_id, version_id, ran_at DESC)` if version-filtered history becomes common

A proposed migration file has been provided separately:

- [2026-05-26-supabase-run-history-indexes.sql](C:/Users/parki/OneDrive/Documents/Projects/Des-Studio/docs/architecture/proposed-migrations/2026-05-26-supabase-run-history-indexes.sql)

## Recommendations

1. Treat `simulation_runs.results_json` as the primary storage-risk surface.
2. Stop persisting raw single-run `log` by default once a compact trace/summary path is in place.
3. Auto-disable `collectTimeSeries` for large runs and persist that decision with the run admission layer.
4. Keep the current compact batch-save strategy; it is materially safer than the single-run path.
5. Add the composite run-history index before run volume grows much further.
6. Consider an explicit “summary-only save mode” for large runs.
7. Revisit the immutability trigger if long-term retention requires payload compaction after insert.
8. Consider measuring `JSON.stringify(results_json).length` at save time and storing the byte count in a dedicated metadata column later.

## Concrete Follow-Up Tasks

1. Add a run-result payload sizer in the browser save path and record approximate bytes for telemetry.
2. Introduce a summary-only persistence mode for large single runs.
3. Split diagnostic trace retention policy from UI step-log retention policy.
4. Add the proposed composite indexes for run history and share-link lookup.
5. Review whether `entitySummary` is needed for all persisted runs or only for immediately reopened results.
6. Review whether `model_snapshot` should remain inside `results_json` or move fully to the dedicated `model_snapshot` column that already exists in schema.
7. Add explicit size-oriented tests around large run payload construction.
8. Decide whether sweeps need their own retention or summarization policy separate from `simulation_runs`.

## Proposed Migration Note

I do recommend schema follow-up, but only as a proposed migration, not an applied change in this task.

The separate proposal file only covers indexing, which is low-risk and directly supported by the current query patterns. More invasive storage-shape changes should wait until the team decides how much trace/time-series data must remain queryable after save.
