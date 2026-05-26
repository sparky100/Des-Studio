# DES Run Admission Rules

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
  - benchmark-style templates include `mm1`, `port-berth`, `data-center`, `fast-food`, `surgical-suite`
- Existing performance docs found:
  - `docs/performance-envelope.md`
  - `docs/analysis/des-run-complexity-estimator.md`
  - `docs/reviews/sprint-72-performance-optimisation-plan.md`
  - `docs/reviews/sprint-72-performance-optimisation-closure.md`
- Existing runtime metrics found:
  - engine runtime counters in `src/engine/index.js`
  - saved `runtimeMetrics` in run records via `src/ui/execute/index.jsx` and `src/db/models.js`
- Existing test coverage related to performance:
  - benchmark gates in `tests/engine/benchmarks/benchmarks.test.js`
  - timing gate in `tests/engine/benchmarks/performance.test.js`
  - complexity estimator coverage in `tests/engine/complexity-estimator.test.js`
- Gaps compared with the requested benchmark/sizing goal:
  - no formal run-admission policy yet
  - plan limits exist in admin config but are not hard-enforced for simulation runs
  - no unified preflight layer combines schema validity, structural safety, sizing, and persistence risk

## Current State

Current checks are split across several places:

- `src/engine/validation.js`
  - blocking schema/data-shape validation
  - already checks model structure, distribution bounds, missing event references, and basic source/sink heuristics
- `src/simulation/modelChecker.js`
  - structural model-health checks
  - currently blocks only when the Execute panel sees `error` severity items
- `src/ui/execute/index.jsx`
  - run entry point for single and batch runs
  - already blocks on validation errors and model-checker errors
  - now computes a non-blocking complexity estimate
- `src/ui/execute/ExperimentControls.jsx`
  - exposes `replications`, `maxSimTime`, and `collectTimeSeries`
  - time-series capture is manual, not automatically governed by run size
- `src/ui/AdminPanel.jsx` and `platform_config`
  - stores `maxReplications`, `maxSweepPoints`, and `maxSimTime`
  - currently described as informational only
- `src/db/models.js`
  - persists full `results_json`
  - does not perform run-admission enforcement itself

## Goal

Admission rules should protect four things at once:

- the browser from memory/CPU spikes
- Supabase from oversized `results_json` writes and unnecessary run volume
- Cloudflare/Supabase edge paths from being used for work they are not sized to run
- the user from launching runs that are ambiguous, misleading, or obviously explosive

## Proposed Admission Pipeline

Run admission should happen in this order:

1. Schema validity
2. Structural/lifecycle safety
3. Sizing and tier limits
4. Trace/time-series policy
5. User confirmation for borderline runs
6. Save-path policy for oversized result payload risk

Recommended output contract:

```ts
type RunAdmissionDecision = {
  hardErrors: Array<{ code: string; message: string; source: "validation" | "model-check" | "admission" }>;
  warnings: Array<{ code: string; message: string }>;
  confirmations: Array<{ code: string; message: string; defaultChoice: "cancel" | "continue" }>;
  effectiveSettings: {
    collectTimeSeries: boolean;
    allowRun: boolean;
  };
};
```

## Proposed Limits By Tier

The product currently has `free` and `pro` in profile data, while admin limits are global. To support the requested `Free / Standard / Pro` framing without forcing an immediate plan migration, use these as target policy tiers:

| Tier | Replications | Estimated C-event scans per run | Planned rows (`Schedule.rows` / `times`) | Max sim time | Time-series default |
|---|---:|---:|---:|---:|---|
| Free | 10 | 50,000 | 2,000 | 10,000 | on for small, off for large |
| Standard | 30 | 250,000 | 10,000 | 50,000 | on for small/medium, off for large |
| Pro | 100 | 1,000,000 | 50,000 | 200,000 | on unless `too_large` |

Conservative rationale:

- `docs/performance-envelope.md` only validates bounded scenarios up to modest queue/event sizes
- the existing automated timing gate is a 6-B / 4-C / `maxSimTime=2000` model under 3 seconds
- larger runs may still be valid, but are not yet validated broadly enough to make them default-safe

Suggested compatibility mapping until a `standard` plan exists:

- current `free` users -> Free tier policy
- current `pro` users -> Standard tier policy by default
- reserve Pro tier policy for a future enterprise/pro-plus plan or admin override

## Entry Requirements

### Hard Errors

These should block the run immediately.

1. Schema must validate
   - source: `validateModel()`
   - keep current behavior

2. `maxSimTime` must be present for time-based runs
   - hard error when termination mode is `time` and `maxSimTime <= 0` or missing
   - condition-based stop rules may still be allowed, but should not bypass all other guards

3. Replications must be within tier limit
   - compare requested replications against resolved plan/tier

4. Estimated event/scan volume must be within tier hard ceiling
   - use the pre-run complexity estimator
   - block `too_large` runs for Free and Standard

5. Planned rows must be within tier hard ceiling
   - count all `Schedule.distParams.rows` and `times`
   - block if over tier cap

6. Model must have at least one arrival source and one sink
   - promote the current source/sink heuristic from warning-only into a run-admission hard error
   - this is stricter than current `V8`, intentionally

7. Lifecycle must be unambiguous
   - block if model-checker indicates:
     - entities never created
     - created entities never exit
     - missing queue/server references
     - empty schedule distributions
     - schedule entries with no `eventId`

8. No obviously explosive loop/recirculation without a guard
   - block when a follow-on chain or routing cycle is detected and there is no bounding mechanism
   - acceptable guards:
     - finite `maxSimTime`
     - finite planned schedule rows
     - explicit sink path
     - finite-capacity bounded queue combined with exit path

### Warnings

These should allow the run but show visible caution in the readiness panel.

1. Condition-based stop rule
   - warn that the estimate confidence is low

2. Missing or weak confidence in estimator inputs
   - recurring arrivals with unknown mean
   - heavily piecewise/live-fed schedule assumptions

3. Large but still allowed run
   - `large` risk for Pro-tier or admin-override scenarios

4. Finite queue likely to saturate
   - from bottleneck detection in the complexity estimator

5. No time-series/charts will be available
   - when the admission layer auto-disables `collectTimeSeries`

6. Trace likely to be truncated
   - when expected event count is high enough that the user should not assume a complete diagnostic trace

### UI Confirmations

These should require an explicit user decision but not fail validation.

1. Large allowed run
   - example: Pro-tier run with `riskLevel = "large"`
   - wording: “This run is likely to be heavy and may take longer or save fewer visuals.”

2. Auto-disabled chart data
   - if time-series capture is turned off for size reasons, ask once before run start

3. Condition-based stop with high replication count
   - ask for confirmation because both runtime and stored result size are less predictable

4. Near-limit planned schedule import
   - example: `rows` within 80–100% of the tier limit

5. Model health warnings that imply poor result trustworthiness
   - not blockers, but should be acknowledged before running

## Recommended Check Classification

| Rule | Hard error | Warning | Confirmation |
|---|---|---|---|
| Schema invalid | yes | no | no |
| `maxSimTime` missing/invalid for time mode | yes | no | no |
| Replications over tier cap | yes | no | no |
| Estimated scans over hard cap | yes | no | no |
| Estimated scans near cap | no | yes | yes |
| Planned rows over hard cap | yes | no | no |
| Planned rows near cap | no | yes | yes |
| No arrival source | yes | no | no |
| No sink | yes | no | no |
| Entity lifecycle ambiguous | yes | no | no |
| Explosive recirculation without guard | yes | no | no |
| Condition-based termination | no | yes | yes |
| Time-series disabled automatically | no | yes | yes |
| Likely bottleneck | no | yes | no |

## Where Checks Should Be Implemented

Use a layered approach rather than pushing everything into `validateModel()`.

### 1. `src/engine/validation.js`

Keep for:

- pure schema/data-shape checks
- deterministic structural field validation

Do not overload it with:

- tier policy
- user-plan lookup
- UI confirmation semantics

### 2. `src/simulation/modelChecker.js`

Extend for:

- lifecycle ambiguity checks
- explosive-loop heuristics
- guard detection around recirculation

This is the right home for model-logic safety that is not strictly schema validation.

### 3. New admission layer

Recommended new module:

- `src/engine/runAdmission.js`

Responsibilities:

- merge outputs from `validateModel`, `checkModel`, and `estimateRunComplexity`
- apply tier limits
- decide hard error vs warning vs confirmation
- decide effective settings such as `collectTimeSeries = false`

### 4. `src/ui/execute/index.jsx`

Use for:

- invoking the admission layer before `buildEngine()` or `runReplications()`
- rendering warnings and confirmations
- applying effective settings returned by the admission decision

### 5. Supabase / backend

Future hardening should exist outside the browser too:

- enforce run-rate / run-count quotas in DB or edge functions
- optionally reject oversized persisted results
- log admission denials for operational visibility

Browser-only admission is helpful, but not sufficient as a final control plane.

## Trace And Time-Series Policy

For large runs, result payload size matters as much as CPU cost.

Recommended policy:

- `small`: keep chart data on by default
- `medium`: keep chart data on by default, but show memory hint
- `large`: default chart data off
- `too_large`: block for Free/Standard; for Pro/admin override, force chart data off and require confirmation

Also recommended:

- keep the engine’s lightweight summary/runtime metrics on for all runs
- treat time-series as optional
- avoid persisting full step logs or large traces when the model size is clearly high

This fits the current architecture because `collectTimeSeries` is already plumbed through `buildEngine`, workers, and sweep runners.

## How To Test Them

### Unit tests

Add unit coverage for the admission combiner:

- valid small run passes cleanly
- invalid schema returns hard errors
- replications over tier cap are blocked
- estimated scans over tier cap are blocked
- planned rows over limit are blocked
- condition-based stop produces warning + confirmation
- large run disables time-series in effective settings
- lifecycle ambiguity from model checker blocks the run
- obvious follow-on cycle without guard blocks the run

Suggested file:

- `tests/engine/run-admission.test.js`

### UI tests

Add Execute-panel coverage for:

- blocked run shows clear blocker message
- confirmation modal appears for borderline heavy runs
- auto-disabled chart-data toggle is reflected in UI before run launch
- model-check warnings remain visible alongside admission warnings

Suggested file:

- `tests/ui/execute/run-admission.test.jsx`

### Integration tests

Cover the real entry path:

- single run path blocks before `buildEngine()`
- batch run path blocks before `runReplications()`
- sweep path reuses the same admission policy

### Regression tests

Use existing templates plus synthetic stress models:

- `mm1` should pass Free
- `fast-food` should pass Free or Standard depending on chosen horizon
- a very large `Schedule.rows` model should hit planned-row limits
- a cycle/no-sink synthetic model should be blocked

## Migration Concerns For Existing Saved Models

This change is policy-sensitive because saved models may have been valid under older, looser rules.

Recommended rollout:

1. Phase 1: observe only
   - compute admission results
   - show warnings and confirmations
   - do not hard-block newly failing legacy models yet

2. Phase 2: hard-block only severe safety cases
   - invalid schema
   - no source/sink
   - obvious explosive loop without guard
   - over hard caps by large margin

3. Phase 3: full tier enforcement
   - after plan mapping and backend support are in place

Specific migration risks:

- legacy models may omit explicit `experimentDefaults.maxSimTime`
- legacy models may rely on condition-based termination with no bounded estimate
- imported schedule models may contain large `rows` payloads that were previously accepted
- historical run reproduction flows should remain readable even if the current model would now fail admission

Important rule:

- admission applies to launching a new run, not viewing or reproducing historical stored results metadata

## Recommended Next Steps

1. Introduce `runAdmission.js` as a pure decision layer with no UI code.
2. Reuse current complexity-estimator output instead of adding a second sizing mechanism.
3. Promote the most severe lifecycle hazards from informational model-check issues into formal admission blockers.
4. Add a plan-resolution helper so current `free` / `pro` users can be mapped consistently.
5. Delay strict backend enforcement until the browser policy and tests have stabilized.

## Recommendation

Do not implement the full policy in this prompt.

The safe next implementation slice is:

- add a pure admission-decision helper
- wire it into Execute as warnings/blockers
- auto-disable `collectTimeSeries` for large runs

That is small enough to review and test, while avoiding a premature rewrite of validation, tiering, or persistence logic.
