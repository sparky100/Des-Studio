# DES Runtime Metrics Implementation

Date: 2026-05-26

## Summary

Minimal runtime metrics were added to DES run results with a small additive contract:

- engine runs now return a `runtimeMetrics` object
- single-run, stepped-run, and batch-run save paths now attach wall-clock duration
- batch runs aggregate the per-replication runtime metrics into one run-level metrics block
- saved `results_json` now preserves `runtimeMetrics`

No simulation semantics were intentionally changed.

## Files Changed

- `src/engine/index.js`
  - Added lightweight runtime counters to the engine
  - Added `getRuntimeMetrics()` accessor
  - Included `runtimeMetrics` in `runAll()` results
- `src/engine/phases.js`
  - Threaded queue-depth and entity-creation callbacks through macro execution context
- `src/engine/macros.js`
  - Marked entity creation and queue re-entry points so metrics update when entities are created or re-queued
- `src/engine/replication-runner.js`
  - Preserved `runtimeMetrics` when compacting worker payloads
- `src/ui/execute/executeHelpers.js`
  - Added batch runtime metrics aggregation helper
- `src/ui/execute/index.jsx`
  - Captured `wall_clock_ms` in stepped, single-run, and batch execution paths
  - Passed `durationMs` into persistence config
  - Added aggregate `runtimeMetrics` to batch results
- `src/db/models.js`
  - Ensured `runtimeMetrics` is written into `results_json`
- `tests/engine/three-phase.test.js`
  - Added engine-level runtime metrics assertion
- `tests/engine/replication-runner.test.js`
  - Added compaction coverage for `runtimeMetrics`
- `tests/db/models.test.js`
  - Added persistence assertion for `runtimeMetrics` and `duration_ms`
- `tests/ui/execute/execute-panel.test.jsx`
  - Added save-path assertions for runtime metrics and duration config

## Metrics Captured

The new minimal metrics block currently captures:

- `wall_clock_ms`
  - Host-side elapsed time for the whole run or replication batch
- `replications`
  - `1` for single runs, `N` for aggregated batch runs
- `events_processed`
  - Total processed events in the run
  - Current implementation counts processed Phase B FEL events plus fired C-events
- `c_event_scans`
  - Number of C-event condition evaluations attempted
- `c_events_fired`
  - Number of C-events whose condition evaluated true and then fired
- `entities_created`
  - Total entities created during the run, including pre-created server entities at engine initialisation
- `entities_completed`
  - Number of completed entities, aligned with served count
- `max_queue_length_by_queue`
  - Maximum observed waiting depth by queue

The engine also tracks `max_future_event_list_size` internally and returns it in `runtimeMetrics`, even though it was not part of the required minimal scope list. It is additive and low-cost.

## How To Interpret The Metrics

### `events_processed`

Use this as the broadest “how much work happened?” counter.

Important detail:

- it includes processed FEL B-events
- it also includes fired C-events
- in fixtures that seed placeholder B-events into the FEL, those placeholder events are counted if processed

### `c_event_scans` vs `c_events_fired`

These two numbers together tell you how expensive Phase C was:

- high `c_event_scans` with low `c_events_fired` means many false condition checks
- high `c_events_fired` means a lot of actual conditional activity

### `entities_created`

This currently includes:

- pre-created server entities at engine startup
- customers created by `ARRIVE`
- runtime-created entities from macros such as `BATCH`, `SPLIT`, `MATCH`, and dynamic server creation

### `max_queue_length_by_queue`

This records the largest waiting depth reached for each queue name during the run. It is useful for capacity and congestion checks.

## Tests Run

Passing:

- `npm test -- three-phase replication-runner`
- `npm test -- execute-panel`

Partially verified with an unrelated existing failure in the same file:

- `npm test -- models.test.js`

The `models.test.js` run still contains a pre-existing failure unrelated to this runtime metrics change:

- `tests/db/models.test.js`
- failing test: `norm() — deserialises stored DB record into a structurally valid model`
- observed mismatch: expected `cEvents` item `{ id: 'ce' }`, received `{ id: 'ce', condition: null }`

The new runtime-metrics persistence assertions were added in that file, but the file is not fully green because of that separate existing failure.

## Limitations

- `events_processed` currently counts all processed FEL B-events, including synthetic or placeholder B-events in a scenario fixture if they are processed.
- `entities_created` includes pre-created servers, so it is not “customers created only.”
- `max_queue_length_by_queue` is keyed by queue name exactly as used at runtime.
- Batch persistence stores aggregate runtime metrics for the whole batch result, not a detailed per-replication runtime metrics array.
- The metrics are saved inside `results_json.runtimeMetrics`; they are not promoted to dedicated SQL columns yet.

## Result Shape

Single runs now return and save a shape like:

```json
{
  "summary": { "...": "..." },
  "runtimeMetrics": {
    "wall_clock_ms": 42,
    "replications": 1,
    "events_processed": 9,
    "c_event_scans": 5,
    "c_events_fired": 2,
    "entities_created": 3,
    "entities_completed": 2,
    "max_queue_length_by_queue": {
      "Main": 2
    },
    "max_future_event_list_size": 3
  }
}
```

## Next Small Follow-Ups

- Surface `runtimeMetrics` in the results UI so users can inspect them without opening raw JSON
- Populate or expose the same metrics in export/report paths if needed
- If SQL filtering becomes important, promote selected fields such as `duration_ms` and `events_processed` to dedicated columns later
