# DES Validation Gap Review

Date: 2026-05-26  
Scope: Review only. No code changes in this task.

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
  - `docs/analysis/three-phase-engine-efficiency-review.md`
  - `docs/analysis/des-run-complexity-estimator.md`
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
  - `tests/engine/validation.test.js`
  - `tests/engine/templates.test.js`
  - `tests/engine/replication-ci.test.js`
  - benchmark suites under `tests/engine/benchmarks/`
- Gaps compared with the requested benchmark/sizing goal:
  - validation coverage does not currently include planned-row ceilings, replication ceilings, or structural loop-risk sizing checks
  - no benchmark currently proves that validation catches expensive but still syntactically valid models before execution

## Summary

Current validation is strongest in `src/engine/validation.js` for:

- distribution parameter correctness
- queue existence checks in C-event conditions and routing
- basic lifecycle heuristics such as source/sink presence
- probabilistic-routing consistency
- queue capacity, loop-guard shape, and container references

The biggest gaps against the latest LLM/schema-oriented safety requirements are:

- several checks live only in the Execute UI, not in `validateModel()`
- lifecycle validation is still heuristic rather than path-aware
- string-based routing and condition formats are still accepted
- `cSchedules` context requirements are not validated
- failure/repair specifications are not validated at all
- “slow model” controls such as planned-row caps and replication caps are not in validation yet

## Current Validation Entry Points

### Engine-level validation

- `validateModel(model)` in [src/engine/validation.js](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:14)
- returns `{ errors, warnings }`
- reused by tests and by the Execute workspace

### Execute-only checks

- Execute adds two extra blockers in [src/ui/execute/index.jsx](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/execute/index.jsx:191):
  - warm-up must be less than run duration
  - `replications` must be a positive integer

This means some safeguards are not part of the portable schema validator today.

## Rules Checked Today

| Area | Status today | Evidence | Notes |
|---|---|---|---|
| Missing `maxSimTime` / stop rule | Partially checked | [validation.js:542](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:542) | `V16` warns when there are arrivals and neither positive `maxSimTime` nor termination condition is set. It is warning-only, not a blocker. |
| Missing sinks | Partially checked | [validation.js:296](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:296) | `V8` blocks only when both source and sink are missing; source-only or sink-only cases are warnings. |
| Probabilistic routing to `null` must terminate entity | Checked | [validation.js:451](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:451) | `V30` blocks null probabilistic exit without `COMPLETE()` or `RENEGE()`. |
| Routing combined with `RELEASE(Server, Queue)` | Checked for routing tables | [validation.js:367](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:367), [validation.js:418](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:418) | `V17` and `V18` catch `routing`/`probabilisticRouting` combined with a literal RELEASE target queue. |
| Priority queue without `priority` attribute | Partially checked | [validation.js:96](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:96) | `V4` checks for presence of `priority`, but not that its `valueType` is numeric. |
| Loop guard shape | Checked narrowly | [validation.js:527](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:527) | `V24` validates `loopConfig.maxLoopCount` and `exitQueueName`, not whether explosive loops exist without a guard. |
| C-event condition references unknown queues | Checked | [validation.js:338](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:338) | `V9` handles queue-name references only. |
| Probabilistic routing probabilities and queue names | Checked | [validation.js:418](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:418) | `V18` validates sum and queue references. |
| Conditional routing queue references | Checked | [validation.js:367](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:367) | `V17` validates queue targets and `defaultQueueName`. |
| `RENEGE(ctx)` guidance | Checked as warning | [validation.js:553](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:553) | `V25` warns on non-`ctx` usage. |
| `cSchedules` all-conditional with no fallback | Checked as warning | [validation.js:638](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:638) | `V29` warns when all rows have `when` and no fallback exists. |
| Positive integer replications | Checked in Execute only | [index.jsx:201](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/execute/index.jsx:201) | Not part of `validateModel()`. |
| Warm-up less than maxSimTime | Checked in Execute only | [index.jsx:198](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/execute/index.jsx:198) | Uses ad hoc `V14` code in Execute, which collides semantically with engine `V14` shift-schedule validation. |

## Rules Missing Today

| Gap | Severity | Current state | Proposed validation message |
|---|---|---|---|
| Time-mode run must have explicit `maxSimTime` | High | `validateModel()` falls back to `500` via `DEFAULT_MAX_SIM_TIME` in [validation.js:12](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:12) and [validation.js:236](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:236), so missing duration is silently accepted in many cases. | `Run duration is missing. Set maxSimTime or choose a condition-based stop rule before running.` |
| Lifecycle sink must be unambiguous | High | Validation checks sink presence heuristically, but does not inspect whether a terminal completion mixes conflicting sink patterns. | `Terminal path is ambiguous. Choose one clear lifecycle sink: COMPLETE(), RENEGE(ctx), or a guarded explicit exit route.` |
| Conditional routing to `null` used as simple sink | High | `V30` exists only for `probabilisticRouting`, not `routing: [{ condition, queueName: null }]`. | `B-Event '{name}' routes to exit through a null queue but does not explicitly complete or renege the entity.` |
| String routing conditions where predicate objects are required | High | `routing.condition` is only checked for “has some content” in [validation.js:37](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:37). No shape enforcement exists. | `Routing condition must be a predicate object from the Predicate Builder, not a free-text string.` |
| String C-event conditions accepted as normal | Medium | `V9` still parses legacy `queue(...)` strings in [validation.js:324](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:324). | `C-Event condition uses legacy text format. Convert it to a structured predicate before running.` |
| `cSchedules` with entity-dependent `when` but missing `useEntityCtx` | High | No check ensures entity context is carried when `when` references `Entity.*`. Engine tests show `when` can exist with `useEntityCtx: false`. | `C-schedule row uses an Entity-based condition but does not carry entity context. Enable useEntityCtx for this row.` |
| `EntityAttr` cSchedule without `useEntityCtx` | High | Validation explicitly skips `EntityAttr` parameter checks in [validation.js:119](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:119) and does not require context transport. | `EntityAttr service time requires useEntityCtx so the scheduled B-Event can target the correct entity.` |
| Partial server failure specs | High | Engine uses `mtbfDist`, `mtbfDistParams`, `mttrDist`, `mttrDistParams` in [index.js:305](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/index.js:305), but validation has no rule for missing repair side, invalid dist params, or server-role mismatch. | `Server failure model is incomplete. Provide both MTBF and MTTR distributions with valid parameters, or remove the failure model.` |
| Priority queue requires numeric `priority` attribute | High | `V4` checks only attribute presence, not `valueType === "number"`. | `Queue '{name}' uses PRIORITY discipline but entity class '{class}' does not have a numeric priority attribute.` |
| Unguarded loops / explosive recirculation | High | `loopConfig` shape is validated, but there is no structural check for back-edges, null-exit absence, or recirculation without any guard. | `Possible unbounded recirculation detected. Add a loop guard, a finite stop rule, or an explicit exit path.` |
| Excessive planned rows | High | No validator counts `Schedule.rows` / `times`, even though the complexity estimator and admission design already discuss this. | `Planned schedule size exceeds the supported limit for this run tier. Reduce imported rows or move the run to a higher-capacity execution path.` |
| Excessive replications by tier/policy | High | Execute only checks `replications >= 1`; no tier/policy cap exists in validation. | `Requested replications exceed the current run limit for this tier.` |
| Routing combined with `RELEASE(Server, Queue)` in non-table edge cases | Medium | Current regex catches obvious literal queue targets, but validation does not reason about mixed effect arrays or multi-step terminal semantics beyond the regex. | `RELEASE target queue cannot be combined with separate routing logic on the same B-Event.` |
| Model must have at least one arrival source and one sink as a hard rule | Medium | Current product decision intentionally leaves one-sided cases as warnings only. | `Model must include at least one arrival source and one lifecycle sink before running.` |

## Detailed Gap Notes

### 1. `maxSimTime` is still a soft/defaulted concept

The latest safety-oriented prompts assume explicit run-sizing intent. Current validation instead treats missing `maxSimTime` as `500` by default unless the user explicitly clears it to `0`, which weakens the distinction between “the user chose 500” and “the user did not specify a stop horizon.”

Relevant code:

- [src/engine/validation.js:12](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:12)
- [src/engine/validation.js:236](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:236)
- [tests/engine/validation.test.js:237](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/tests/engine/validation.test.js:237)

### 2. Lifecycle validation is presence-based, not path-based

`V8` and `V30` prove the project already values lifecycle clarity, but the current validator still does not answer questions like:

- does a terminal service completion have exactly one clear sink?
- does a null exit rely on implicit disappearance?
- does a route mix `RELEASE(Server, Queue)` with another termination mechanism that creates ambiguity?

Those are the core gaps behind the lifecycle prompts.

### 3. The validator still tolerates legacy string conditions

This is the biggest schema drift risk. The current validator intentionally supports both:

- structured predicates
- legacy condition strings

That is compatible with older stored models, but it also means the validator cannot yet enforce “predicate object required” rules for routing and condition logic.

Relevant code:

- [src/engine/validation.js:37](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:37)
- [src/engine/validation.js:324](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js:324)

### 4. `useEntityCtx` is a real runtime contract but not a validated one

The engine clearly uses `useEntityCtx` when scheduling follow-up B-events:

- [src/engine/phases.js:387](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/phases.js:387)

But validation does not currently enforce:

- `EntityAttr` rows should carry entity context
- `when` clauses on `Entity.*` predicates should carry entity context when the later B-event needs the same entity

This is a subtle correctness gap because the model can be syntactically valid while runtime targeting becomes misleading.

### 5. Failure-model schema is effectively unvalidated

The engine supports server breakdown/repair scheduling from entity-type fields:

- [src/engine/index.js:305](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/index.js:305)

The UI exposes those fields in:

- [src/ui/editors/EntityTypeEditor.jsx:125](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/ui/editors/EntityTypeEditor.jsx:125)

But `validateModel()` has no rule that:

- both MTBF and MTTR must exist together
- failure distributions must be valid
- only server entity types can define failure models

That is a clear gap between supported schema and pre-run safety.

### 6. Slow-model controls are mostly outside validation

The repo already has:

- a complexity estimator in [src/engine/complexity-estimator.js](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/complexity-estimator.js:210)
- an admission-rules design in [des-run-admission-rules.md](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/architecture/des-run-admission-rules.md)

But the validator still does not block or warn on:

- excessive planned schedule rows
- excessive replications
- structurally dangerous recirculation

Those are the main “slow or invalid model” gaps from an operational perspective.

## Suggested Test Cases

### Highest-priority new tests

1. Time-mode run with missing `maxSimTime` and no condition stop
   - expect blocker, not only warning/default fallback
2. `routing: [{ condition: predicate, queueName: null }]` without `COMPLETE()` or `RENEGE(ctx)`
   - expect blocker
3. `routing` branch with `condition: "Entity.priority < 2"`
   - expect blocker or migration warning if string predicates are being phased out
4. `EntityAttr` cSchedule with `useEntityCtx: false`
   - expect blocker
5. Server entity type with `mtbfDist` present but no `mttrDist`
   - expect blocker
6. PRIORITY queue whose entity class has `priority` attribute of type `string`
   - expect blocker
7. Model with obvious loop route and no `loopConfig`, no sink, and no finite stop rule
   - expect warning or blocker depending on final policy
8. Model with `Schedule.rows` above threshold
   - expect warning or blocker depending on policy layer
9. Model with replications above threshold
   - expect warning or blocker depending on policy layer

### Backward-compatibility tests

1. Legacy saved model with string C-event condition still loads and surfaces a migration warning rather than crashing
2. Empty `routing: []` and placeholder rows remain ignored as they are today
3. Existing `V30` probabilistic-null exit behaviour remains unchanged

## Recommended Implementation Order

1. Formalize lifecycle safety first.
   - Add conditional-null-exit validation alongside existing `V30`
   - Add explicit terminal-sink ambiguity checks
   - Keep messages plain-English and modeler-facing

2. Validate context-sensitive scheduling.
   - `EntityAttr` requires entity context
   - `Entity.*`-driven `when` rows should be checked for missing `useEntityCtx`

3. Tighten schema-shape enforcement.
   - enforce predicate-object routing conditions
   - downgrade legacy string conditions into migration warnings first, then later blockers

4. Add failure-model validation.
   - ensure MTBF/MTTR are paired and distribution params are valid
   - restrict failure models to server entity types

5. Fix correctness gaps in existing rules.
   - make `V4` require numeric `priority`
   - move replications/warm-up checks out of Execute-only logic into a portable validation/admission layer

6. Layer in run-sizing controls.
   - planned-row counts
   - replication caps
   - loop-risk heuristics
   - these may belong in a separate admission layer rather than pure schema validation, but they should still surface before execution

## Recommended Rule Placement

### Keep in `validateModel()`

- schema shape
- lifecycle sink clarity
- context requirements such as `useEntityCtx`
- server failure-model completeness
- numeric `priority` requirement

### Better placed in a run-admission layer

- tier-based replication limits
- planned-row ceilings
- “too large” complexity blocking
- some structural loop-risk warnings when they depend on chosen run settings

That split matches the existing direction in [des-run-admission-rules.md](C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/architecture/des-run-admission-rules.md).

## Bottom Line

The current validator is no longer “minimal”; it already enforces a useful set of lifecycle and routing rules, including the newer `V30` null-exit check. The main gaps are not in basic syntax but in portability and operational safety:

- some important checks still live only in Execute
- legacy string predicates remain accepted
- context-sensitive scheduling is under-validated
- server failure schema is under-validated
- slow-model controls have been designed elsewhere but not yet enforced before execution

## Verification

No tests were run in this task because the prompt requested a review document only.
