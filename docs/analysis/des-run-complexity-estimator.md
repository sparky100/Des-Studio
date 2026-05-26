# DES Run Complexity Estimator

## Existing Benchmark Baseline

- Existing benchmark scripts found:
  - `tests/engine/mm1_benchmark.js`
  - `tests/engine/mmc_benchmark.js`
  - `tests/engine/perf_timing.js`
  - `tests/benchmarks/golden.test.js`
  - `tests/engine/benchmarks/benchmarks.test.js`
  - `tests/engine/benchmarks/performance.test.js`
- Existing benchmark fixtures/models found:
  - `src/engine/templates.js`
  - notable reusable templates: `mm1`, `port-berth`, `data-center`, `fast-food`, `surgical-suite`
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/reviews/sprint-72-performance-optimisation-plan.md`
  - `docs/reviews/sprint-72-performance-optimisation-closure.md`
- Existing runtime metrics found:
  - engine-side counters in `src/engine/index.js`
  - persisted `runtimeMetrics` wiring in `src/ui/execute/index.jsx` and `src/db/models.js`
- Existing test coverage related to performance:
  - analytical and timing gates in `tests/benchmarks/golden.test.js`, `tests/engine/benchmarks/benchmarks.test.js`, `tests/engine/benchmarks/performance.test.js`
  - template coverage in `tests/engine/templates.test.js`
- Gaps compared with the requested benchmark/sizing goal:
  - no pre-run estimator existed
  - no read-only workload preview existed in Execute
  - no tier-oriented thresholds were defined for model size before execution

## Decision

Implementation was practical without a broad rewrite, so this prompt was handled as a small additive feature instead of a design-only note.

- Added a pure estimator in `src/engine/complexity-estimator.js`
- Surfaced a non-blocking summary in the existing run-readiness card in `src/ui/execute/index.jsx`
- Added focused coverage in `tests/engine/complexity-estimator.test.js` and `tests/ui/execute/execute-panel.test.jsx`

No validation rule was changed and no run is blocked by the estimate.

## Estimator Formula

The shipped estimator is intentionally conservative and mean-based.

1. `planned_arrivals`
   - starts with any pre-seeded non-server entity counts
   - adds initial `ARRIVE(...)` B-events whose `scheduledTime` is within the run horizon
   - adds exact counts for `Schedule` distributions where planned times are available

2. `expected_entity_count`
   - starts from `planned_arrivals`
   - for recurring `ARRIVE` schedules with a known mean and a time-bounded run:
   - `expected_repeats = ceil((maxSimTime - scheduledTime) / mean_interarrival)`
   - adds `expected_repeats * number_of_arrive_calls`

3. `number_of_b_events`
   - `model.bEvents.length`

4. `number_of_c_events`
   - `model.cEvents.length`

5. `estimated_stage_transitions`
   - counts C-events whose effects include `ASSIGN`, `COSEIZE`, `MATCH`, `BATCH`, or `UNBATCH`
   - `estimated_stage_transitions = expected_entity_count * active_stage_count`

6. `estimated_c_event_scans`
   - approximates B-event firings as:
   - `estimated_b_event_firings = expected_entity_count + estimated_stage_transitions`
   - approximates scan volume as:
   - `estimated_c_event_scans = estimated_b_event_firings * max(1, number_of_c_events)`

7. `replications`
   - taken from Execute setup or experiment defaults

8. `risk_level`
   - based on total estimated scan volume and total estimated entities across all replications
   - `small`: scans `<= 50,000` and entities `<= 2,000`
   - `medium`: scans `<= 250,000` and entities `<= 10,000`
   - `large`: scans `<= 1,000,000` and entities `<= 50,000`
   - `too_large`: above either large threshold

9. `likely bottlenecks`
   - flags only obvious cases
   - compares external arrival rate for a queue against service capacity when the model clearly exposes:
     - `ARRIVE(queue)`
     - `ASSIGN(queue, Server)` or `COSEIZE(queue, ...)`
     - a parseable service-time mean
     - server counts
   - also flags small finite queues relative to estimated workload

## Assumptions

- The estimator uses distribution means, not sampled trajectories.
- It only produces bounded counts when the run is time-based.
- It does not attempt full graph traversal of internal routing chains.
- It assumes each active service-stage C-event can fire once per arriving entity.
- It deliberately prefers over-estimating to under-estimating when choosing repeat counts.

## Uncertainty Model

Confidence is reported as:

- `high` when the run is time-bounded and the relevant arrival/service means are parseable
- `medium` when the run is time-bounded but one or more arrival sources cannot be bounded cleanly
- `low` when the run stops on a condition instead of a fixed duration

The UI also shows short uncertainty notes when:

- the model uses condition-based termination
- a recurring arrival source cannot be bounded confidently before execution
- the horizon is not fixed

## Examples From Existing Templates

All examples below were generated with the new helper against `src/engine/templates.js` using `terminationMode: "time"`, `maxSimTime: 500`, and `replications: 1`.

### `mm1`

- planned arrivals: `1`
- expected entities: `452`
- B-events: `2`
- C-events: `1`
- estimated stage transitions: `452`
- estimated C-event scans: `904`
- risk: `small`
- likely bottleneck: `Customer` queue, because estimated incoming work is about 90% of service capacity

### `port-berth`

- planned arrivals: `1`
- expected entities: `64`
- B-events: `2`
- C-events: `1`
- estimated stage transitions: `64`
- estimated C-event scans: `128`
- risk: `small`

### `data-center`

- planned arrivals: `1`
- expected entities: `251`
- B-events: `2`
- C-events: `1`
- estimated stage transitions: `251`
- estimated C-event scans: `502`
- risk: `small`

### `fast-food`

- planned arrivals: `1`
- expected entities: `335`
- B-events: `4`
- C-events: `3`
- estimated stage transitions: `1,005`
- estimated C-event scans: `4,020`
- risk: `small`

## Proposed Free / Standard / Pro Thresholds

These are product-level suggestions only. They are not enforced by the implementation in this change.

| Tier | Suggested soft guidance | Suggested warning threshold | Suggested hard-stop candidate |
|---|---|---|---|
| Free | Best for classroom/demo runs | `medium` | `large` |
| Standard | Best for routine business models | `large` | `too_large` |
| Pro | Best for heavy replication studies | `too_large` warning only | none without backend execution support |

Recommended operational mapping:

- Free:
  - encourage `<= 25,000` estimated scans per run
  - warn at `> 50,000`
- Standard:
  - encourage `<= 150,000` estimated scans per run
  - warn at `> 250,000`
- Pro:
  - encourage `<= 750,000` estimated scans per run
  - warn at `> 1,000,000`

These numbers should be revisited after correlating estimator outputs with real `runtimeMetrics` from saved runs.

## Recommended UI Wording

Primary wording should stay plain-English first:

- section title: `Run Size Estimate`
- summary line: `Conservative preview of likely workload before execution.`
- confidence line: `Confidence: medium. This estimate uses arrival and service averages, so real runs may be smaller or larger.`
- bottleneck line example: `Customer queue: Incoming work is roughly 90% of available service capacity.`

Avoid wording that implies certainty:

- prefer `estimate`, `preview`, `likely`, `may`
- avoid `will process`, `exactly`, `guaranteed`

## Files Changed

- `src/engine/complexity-estimator.js`
- `src/ui/execute/index.jsx`
- `tests/engine/complexity-estimator.test.js`
- `tests/ui/execute/execute-panel.test.jsx`

## Tests Run

- `npm test -- complexity-estimator`
- `npm test -- execute-panel`

## Limitations

- Internal routing pressure is only estimated indirectly, not solved as a full queueing network.
- `MATCH`, `BATCH`, and complex multi-queue patterns are treated conservatively through stage counts rather than per-branch flow equations.
- Condition-based termination remains low-confidence by design.
- Tier thresholds are advisory only until the product has a real plan/entitlement enforcement path.
