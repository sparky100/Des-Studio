# DES Results Storage Strategy

## Goal

The storage strategy should preserve useful analysis while avoiding large default `results_json` blobs for every run.

The main design principle is:

- keep small, queryable run metadata and compact summaries in Supabase Postgres
- move bulky optional artifacts to Supabase Storage
- make trace-heavy persistence opt-in rather than default

## Current State

### Current persistence path

- `src/ui/execute/index.jsx:635-645` saves single-run results through `saveSimulationRun()`
- `src/ui/execute/index.jsx:526-547` saves batch results through the same path
- `src/db/models.js:351-416` builds the current `simulation_runs` insert payload

### Current storage shape

Today, `simulation_runs` stores:

- queryable summary columns such as:
  - `total_arrived`
  - `total_served`
  - `total_reneged`
  - `avg_wait_time`
  - `avg_service_time`
  - `replications`
  - `seed`
  - `max_simulation_time`
  - `duration_ms`
  - `run_label`
  - `archived`
  - `version_id`
- one large `results_json` blob that can include:
  - `summary`
  - `log`
  - `warnings`
  - `trace`
  - `traceTruncated`
  - `entitySummary`
  - `timeSeries`
  - `waitDist`
  - `runtimeMetrics`
  - batch metadata such as `aggregateStats` and per-replication summaries

### Existing provenance support

The schema already has separate provenance columns:

- `model_snapshot`
- `engine_version`
- `prng_algorithm`
- `base_seed`
- `version_id`

Evidence:

- `src/db/runRecord.js:10-31`
- `supabase/migrations/PR-001_run_record_integrity.sql:7-13`
- `supabase/migrations/20260520000000_add_model_versions.sql:20-22`

### Current design debt

Two important issues exist today:

1. the rich result payload is still stored by default in `results_json`
2. some consumers still read provenance from `results_json._model_snapshot` / `_base_seed` rather than the dedicated columns:
   - `src/db/models.js:521-544`

That means storage is larger than necessary and provenance is duplicated.

## Recommended Storage Model

Use a two-tier model:

1. `simulation_runs` row for compact metadata and summaries
2. optional artifact objects for large payloads

### Tier 1: Postgres default row

Store only compact, queryable, and commonly needed data in Postgres by default.

Recommended row responsibilities:

- run identity and ownership
- model/version provenance
- compact run summary
- compact per-replication summary
- compact sampled time series
- resource utilisation summary
- warnings/errors
- artifact manifest for any bulky optional payloads stored outside Postgres

### Tier 2: Supabase Storage artifacts

Store larger optional payloads in Storage:

- debug event trace
- entity trace
- full-resolution time series
- large per-replication detail
- large debug logs

This keeps normal run-history rows small while preserving debuggability when the user explicitly asks for more detail.

## Recommended Postgres Shape

Keep `simulation_runs` as the primary run table, but reshape what is stored inside it.

### Recommended top-level columns

Keep or continue using:

- `id`
- `model_id`
- `run_by`
- `ran_at`
- `replications`
- `seed`
- `base_seed`
- `max_simulation_time`
- `warmup_period`
- `duration_ms`
- `total_arrived`
- `total_served`
- `total_reneged`
- `avg_wait_time`
- `avg_service_time`
- `renege_rate`
- `run_label`
- `tags`
- `archived`
- `version_id`
- `model_snapshot`
- `engine_version`
- `prng_algorithm`
- `narrative_text`
- `model_description_text`
- `ai_insights`

Recommended additions:

- `results_schema_version integer`
- `result_size_bytes integer`
- `result_detail_level text`
  - example values: `compact`, `analysis`, `debug`
- `artifact_manifest jsonb`
- `error_count integer`
- `warning_count integer`

### Recommended `results_json` shape

Recommended compact structure:

```json
{
  "summary": {
    "total": 542,
    "served": 531,
    "reneged": 11,
    "avgWait": 2.84,
    "avgSvc": 1.97,
    "avgSojourn": 4.92,
    "phaseCTruncated": false
  },
  "runtimeMetrics": {
    "wall_clock_ms": 887,
    "replications": 1,
    "events_processed": 1608,
    "c_event_scans": 1608,
    "c_events_fired": 538,
    "entities_created": 543,
    "entities_completed": 531,
    "max_queue_length_by_queue": {
      "Customer": 29
    },
    "max_future_event_list_size": 3
  },
  "perReplicationSummary": [
    {
      "replicationIndex": 0,
      "seed": 42,
      "summary": {
        "served": 531,
        "avgWait": 2.84,
        "avgSvc": 1.97
      },
      "runtimeMetrics": {
        "wall_clock_ms": 887,
        "events_processed": 1608,
        "c_event_scans": 1608,
        "max_queue_length_by_queue": {
          "Customer": 29
        }
      }
    }
  ],
  "queueTimeSeries": {
    "samplingMinutes": 5,
    "series": [
      {
        "queue": "Customer",
        "points": [
          { "t": 0, "waiting": 0 },
          { "t": 5, "waiting": 3 }
        ]
      }
    ]
  },
  "resourceUtilisationSummary": [
    {
      "resource": "Server",
      "capacity": 4,
      "meanUtilisation": 0.73,
      "peakUtilisation": 1.0
    }
  ],
  "waitSummary": {
    "Customer": {
      "n": 531,
      "mean": 2.84,
      "p50": 2.12,
      "p90": 5.91,
      "p95": 7.33,
      "p99": 10.04
    }
  },
  "warnings": [
    {
      "code": "PHASE_C_TRUNCATED",
      "message": "Phase C truncated after 500 passes at t=32.000"
    }
  ],
  "errors": [],
  "artifacts": {
    "debugTrace": null,
    "entityTrace": null,
    "fullTimeSeries": null,
    "debugLog": null
  }
}
```

## What Belongs In Postgres Vs Supabase Storage

### Store in Postgres

- compact `summary`
- compact `runtimeMetrics`
- per-replication summary rows
- sampled queue time series
- resource utilisation summary
- wait percentiles / compact histograms
- warnings and compact error log
- provenance metadata
- artifact manifest / pointers

Reason:

- these support run history, search, comparison, sharing, and reopening results without large payload cost

### Store in Supabase Storage

- optional debug event trace
- optional entity trace
- optional full event log
- optional full-resolution time series
- optional full per-replication raw payloads for large batches

Reason:

- these are bulky
- they are rarely needed for run-history browsing
- they do not need row-level SQL filtering for the common UX path

## Recommended Artifact Object Layout

Suggested storage paths:

- `run-artifacts/{model_id}/{run_id}/debug-trace.json.gz`
- `run-artifacts/{model_id}/{run_id}/entity-trace.json.gz`
- `run-artifacts/{model_id}/{run_id}/time-series-full.json.gz`
- `run-artifacts/{model_id}/{run_id}/debug-log.json.gz`

Suggested manifest shape in Postgres:

```json
{
  "debugTrace": {
    "bucket": "run-artifacts",
    "path": "run-artifacts/model-123/run-456/debug-trace.json.gz",
    "contentType": "application/json",
    "compression": "gzip",
    "bytes": 182340
  },
  "entityTrace": null,
  "fullTimeSeries": null,
  "debugLog": null
}
```

## Retention Policy

Use detail-tier retention rather than row-count-only retention.

### Recommended defaults

- compact Postgres summary rows: retain indefinitely
- sampled queue time series: retain indefinitely for saved runs
- Storage debug artifacts: retain by age and access frequency

### Suggested policy by detail level

#### `compact`

- default for routine runs
- keep indefinitely
- no Storage artifacts created

#### `analysis`

- keep compact summary and sampled time series indefinitely
- keep optional full-resolution time series for 30–90 days

#### `debug`

- keep compact summary indefinitely
- keep trace/entity/debug artifacts for 14–30 days by default
- allow manual pinning for runs the user wants to preserve

### Important current constraint

`results_json` is currently immutable after insert:

- `supabase/migrations/PR-001_run_record_integrity.sql:36-39`

So retention should not depend on mutating an existing row in place unless that trigger contract changes. A safer plan is:

- keep row metadata stable
- let Storage artifacts expire independently
- optionally mark expired artifacts in `artifact_manifest`

## Indexing And Search Needs

### Keep or add indexes for run history

- `(model_id, archived, ran_at DESC)`
- `(model_id, version_id, ran_at DESC)`
- `(run_by, ran_at DESC)` if per-user run dashboards expand
- `(run_label)` if label search remains common

### Search should operate on row metadata, not large JSON

Primary search/filter dimensions:

- `model_id`
- `ran_at`
- `archived`
- `run_label`
- `tags`
- `version_id`
- detail level

Avoid JSONB search over traces/logs in the default path.

## Result Size Estimates

These are design estimates, not measured production samples.

### Small run

- one replication
- no debug artifacts
- sampled time series <= 100 points

Estimated size:

- Postgres row + compact `results_json`: `5 KB` to `30 KB`

### Medium run

- 10–30 replications
- per-replication summary
- sampled time series across a few queues
- no full trace

Estimated size:

- Postgres row + compact `results_json`: `30 KB` to `200 KB`
- optional Storage artifact total: `0 KB` to `500 KB`

### Large run

- many events
- many entities
- many replications
- full trace or full-resolution time series requested

Estimated size:

- Postgres compact row: `100 KB` to `400 KB`
- Storage artifacts: `500 KB` to many MB depending on trace depth

### Current risk to avoid

The strategy should avoid routine Postgres rows that grow into multi-MB payloads just because:

- `log`
- `entitySummary`
- `trace`
- full-resolution `timeSeries`

were all persisted by default.

## Migration Plan From Current Storage

### Phase 1: Read compatibility first

1. Add support in readers for:
   - dedicated provenance columns first
   - compact `results_json`
   - optional artifact manifest
2. Keep legacy `results_json` support for old rows

### Phase 2: Write compact new rows

1. Stop writing duplicate provenance into `results_json`
2. Write:
   - compact summary
   - runtime metrics
   - sampled queue time series
   - resource utilisation summary
   - warnings/errors
3. Only create Storage artifacts when the user chooses debug-level detail

### Phase 3: Backfill selectively

Backfill should be conservative:

- do not rewrite old `results_json` rows in place if immutability is kept
- instead:
  - add new columns
  - update readers
  - treat old rows as legacy format

Optional later migration:

- create a new table such as `run_artifacts` if artifact lifecycle becomes more complex than a JSON manifest

## Recommended Table / JSON Shapes

### Option A: Keep one run table plus artifact manifest

This is the recommended minimum-change approach.

Tables:

- `simulation_runs`

JSON:

- compact `results_json`
- `artifact_manifest`

Why:

- smallest migration
- preserves existing run-history model
- keeps most query patterns unchanged

### Option B: Add child table for per-replication summaries later

Possible future table:

- `simulation_run_replications`

Suggested columns:

- `id`
- `run_id`
- `replication_index`
- `seed`
- `served`
- `reneged`
- `avg_wait`
- `avg_service`
- `wall_clock_ms`
- `events_processed`
- `c_event_scans`
- `max_queue_length`

Why:

- better SQL access for batch analysis
- avoids very large per-replication arrays inside `results_json`

Recommendation:

- not required for first migration
- useful if multi-replication analytics or leaderboard-style comparisons grow

## UI Implications

### Run history

Run history should stay fast because it only needs:

- summary columns
- labels/tags
- provenance/version markers
- warning/error indicators

It should not need to load full traces or large time series just to render the table.

### Results workspace

Results UI should assume compact persisted analysis data exists:

- sampled queue time series
- resource utilisation summary
- wait percentiles / histogram-ready summaries

If full-resolution artifacts exist, the UI can offer:

- “Load full debug trace”
- “Load full time series”

### Reproduce / diff

Current reproduce uses stored model snapshot and base seed:

- `src/ui/ModelHistoryTab.jsx:128-160`

Recommendation:

- read `model_snapshot`, `base_seed`, and `engine_version` from dedicated columns first
- keep fallback support for legacy rows during migration

### Sharing

Shared dashboards should use compact persisted data only by default.

Debug artifacts should not automatically load on public share views.

## Recommended Write Policy By Default

### Default saved run

Persist:

- summary
- runtime metrics
- sampled queue time series
- resource utilisation summary
- wait summary
- warnings/errors
- provenance metadata

Do not persist by default:

- raw step log
- full event trace
- full entity trace
- full entity summary
- full-resolution time series

### Debug save mode

Persist default compact row plus selected artifacts:

- debug event trace
- entity trace
- full time series

This can be exposed in UI as a run-detail toggle rather than a permanent always-on behaviour.

## Recommended Next Steps

1. Update the save/read contract to stop duplicating provenance into `results_json`.
2. Define the compact `results_json` schema version and artifact manifest format.
3. Decide whether per-replication summaries stay in JSON first or get their own child table.
4. Add result-size measurement at save time and store `result_size_bytes`.
5. Add UI detail-level controls for normal vs debug persistence.

## Tests Run

No tests were run for this task because the prompt requested a storage design note rather than an implementation change.
