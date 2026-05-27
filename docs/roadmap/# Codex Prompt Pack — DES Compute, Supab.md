# Codex Prompt Pack — DES Compute, Supabase, and Cloudflare Sizing

These prompts are intended to be run one at a time in Codex against the DES Studio codebase. They are written to produce concrete markdown findings and, where appropriate, small, reviewable code changes.

## Suggested Codex Operating Rules

Before using any of the prompts below, paste this instruction at the top of the Codex task or include it in the repo guidance:

```markdown
Work in small, reviewable steps. Do not make broad rewrites unless the prompt explicitly asks for them. Prefer evidence from the codebase over assumptions. Run relevant tests or explain why they cannot be run. Record findings in markdown with file paths, line references where possible, risks, and recommended changes.
```

OpenAI’s Codex guidance recommends keeping long-running or task-specific instructions in markdown rather than overloading a single general guidance file, so this prompt pack is designed as a task-specific reference document.

---

## Benchmark Baseline Requirement

For any prompt that touches performance, runtime sizing, engine efficiency, queue growth, validation cost, or simulation execution, Codex must first check what has already been built.

Codex should search the repository for existing benchmark-related assets before proposing or adding anything new, including:

```text
benchmark
benchmarks
perf
performance
stress
fixtures
sample models
engine tests
simulation tests
runtime metrics
events_processed
c_event_scans
queue length
Glasgow
post office
stadium
```

Codex should explicitly report:

```markdown
## Existing Benchmark Baseline

- Existing benchmark scripts found:
- Existing benchmark fixtures/models found:
- Existing performance docs found:
- Existing runtime metrics found:
- Existing test coverage related to performance:
- Gaps compared with the requested benchmark/sizing goal:
```

If benchmarks already exist, Codex should extend or reuse them rather than creating a parallel benchmark framework. If no benchmarks exist, Codex should say that clearly and then propose the smallest useful benchmark suite.

---

## Prompt 1 — Map Where Simulation Work Actually Runs

```markdown
Review the codebase to determine where DES simulation work is currently executed.

I want a factual architecture note, not changes yet.

Questions to answer:
1. Is the simulation engine running in the browser, Supabase Edge Functions, Cloudflare Workers, or elsewhere?
2. Which files/classes/functions start a simulation run?
3. Which code paths execute replications?
4. Which code paths save run results?
5. Which code paths validate/import models?
6. Are any long-running CPU-heavy operations inside Supabase Edge Functions or Cloudflare Workers?
7. Are there any implicit assumptions that a simulation run is small or quick?

Please produce a markdown file at:

`docs/analysis/des-runtime-execution-map.md`

Include:
- high-level architecture diagram in Mermaid
- key files and responsibilities
- entry points
- risks
- unknowns
- recommended next investigation steps

Do not change application logic.
```

---

## Prompt 2 — Add Runtime Instrumentation Plan

```markdown
Review the DES engine and propose instrumentation for measuring simulation workload and runtime cost.

I want a markdown design first, not implementation.

The metrics I want to capture are:
- wall_clock_ms
- replications
- events_processed
- b_events_processed
- c_event_scans
- c_events_fired
- entities_created
- entities_completed
- max_queue_length_by_queue
- avg_queue_length_by_queue if feasible
- server_utilisation_by_resource if feasible
- max_future_event_list_size if applicable
- run_result_size_bytes if applicable
- errors/warnings encountered during run

Please produce:

`docs/analysis/des-runtime-instrumentation-plan.md`

Include:
1. where each metric should be collected
2. expected overhead
3. proposed TypeScript interfaces or JSON shapes
4. where metrics should be displayed in the UI
5. where metrics should be persisted
6. minimum viable version
7. nice-to-have version
8. risks around slowing the engine down

Do not implement yet.
```

---

## Prompt 3 — Implement Minimal Runtime Metrics

```markdown
Implement minimal DES runtime instrumentation.

Scope:
- Add a lightweight metrics object for a simulation run.
- Capture:
  - wall_clock_ms
  - replications
  - events_processed
  - c_event_scans
  - c_events_fired
  - entities_created
  - entities_completed
  - max_queue_length_by_queue
- Avoid expensive per-event persistence.
- Do not change simulation semantics.
- Preserve existing public APIs unless a small additive change is necessary.

Add or update tests where appropriate.

Also create or update:

`docs/analysis/des-runtime-metrics-implementation.md`

The markdown should explain:
- files changed
- metrics captured
- how to interpret them
- any tests run
- any limitations

Keep the diff small and reviewable.
```

---

## Prompt 4 — Estimate Run Complexity Before Execution

```markdown
Add or design a pre-run complexity estimator for DES models.

The estimator should inspect a model before execution and estimate:
- planned arrivals / entity count
- expected entity count from recurring arrivals where possible
- number of B-events
- number of C-events
- estimated stage transitions
- estimated C-event scans
- replications
- approximate risk level: small, medium, large, too_large
- likely bottleneck queues/resources if obvious from capacity assumptions

The estimator must be conservative and explain uncertainty. It should not block runs yet unless there is already a suitable validation mechanism.

Please first inspect the codebase and then either:
A. implement a small estimator if the integration point is obvious, or
B. produce a design note if implementation would require broader architectural decisions.

Output/update:

`docs/analysis/des-run-complexity-estimator.md`

Include:
- estimator formula
- assumptions
- examples using any existing sample models
- proposed thresholds for Free/Standard/Pro tiers
- recommended UI wording
```

---

## Prompt 5 — Define Run Admission / Entry Requirements

```markdown
Review the application and propose run admission rules for DES simulations.

I want to protect Supabase, Cloudflare, the browser, and the user experience.

Define entry requirements for a simulation run:
- schema must validate
- maxSimTime present
- replications within tier limit
- estimated events within tier limit
- planned rows within tier limit
- result trace disabled by default for large runs
- model must have at least one arrival source and one sink
- lifecycle must be unambiguous
- no obviously explosive loop/recirculation without a guard

Please produce:

`docs/architecture/des-run-admission-rules.md`

Include:
1. proposed limits by tier
2. which checks should be hard errors
3. which checks should be warnings
4. which checks should be UI confirmations
5. where checks should be implemented
6. how to test them
7. migration concerns for existing saved models

Do not implement unless it is trivial and low risk.
```

---

## Prompt 6 — Supabase Usage Review

```markdown
Review the codebase for Supabase usage related to DES models and simulation runs.

Focus on:
- model storage
- run storage
- result storage
- Edge Functions
- database tables
- row sizes
- whether event-level traces are persisted
- whether large JSON blobs are stored in Postgres
- whether Supabase Edge Functions perform CPU-heavy simulations
- whether pagination/indexing is sufficient for run history

Produce:

`docs/analysis/supabase-des-compute-and-storage-review.md`

Include:
- current Supabase responsibilities
- tables/functions used
- estimated storage growth risks
- any Edge Function compute risks
- recommendations for storing summaries vs traces
- recommended indexes if applicable
- recommended retention strategy for run outputs
- concrete follow-up tasks

Do not change production schema unless explicitly necessary. If migration is recommended, provide it separately as a proposed migration.
```

---

## Prompt 7 — Cloudflare Usage Review

```markdown
Review the codebase for Cloudflare usage related to DES Studio.

Focus on:
- Cloudflare Pages/static hosting
- Cloudflare Workers
- API routes/proxies
- caching
- request/response size
- CPU-heavy code paths
- model import links
- whether any simulation execution happens in Workers
- whether long-running operations could exceed Worker CPU/request expectations

Produce:

`docs/analysis/cloudflare-des-runtime-review.md`

Include:
- current Cloudflare responsibilities
- any CPU-heavy or long-running risks
- request-size risks for model import/export
- caching opportunities
- recommendations on what should and should not run in Workers
- recommended architecture changes if needed

Do not implement changes unless the fix is small and safe.
```

---

## Prompt 8 — Browser Simulation Performance Review

```markdown
Review the DES simulation runtime from the browser-performance perspective.

Questions:
1. Does the simulation block the main UI thread?
2. Is a Web Worker used?
3. Are progress updates available for long runs?
4. Can runs be cancelled?
5. Are large result objects causing memory pressure?
6. Are queue time series sampled or stored at every event?
7. Are charts rendering too much raw data?

Produce:

`docs/analysis/browser-simulation-performance-review.md`

Include:
- current behaviour
- likely bottlenecks
- recommended Web Worker strategy if not already used
- progress/cancellation design
- result downsampling recommendations
- tests/benchmarks to add

Do not implement unless the codebase already has a clear worker pattern.
```

---

## Prompt 9 — Three-Phase DES Engine Efficiency Review

```markdown
Review the DES engine implementation with a focus on three-phase simulation performance.

Before proposing improvements, first identify what benchmark scripts, benchmark fixtures, performance tests, or runtime metrics already exist in the repository. Compare any performance claims against that existing benchmark baseline.

Investigate:
- how B-events are processed
- how C-events are scanned
- whether every B-event triggers a full C-event scan
- whether C-event scans repeat unnecessarily
- whether queue length checks are efficient
- whether ASSIGN/RELEASE causes repeated scans
- whether large queues cause O(n) operations
- whether priority queues are implemented efficiently
- whether condition parsing/evaluation is cached or repeated
- whether route predicates are re-parsed repeatedly

Produce:

`docs/analysis/three-phase-engine-efficiency-review.md`

Include:
- existing benchmark baseline discovered in the repo
- whether current benchmarks are sufficient to support conclusions
- complexity analysis in Big-O terms where possible
- hotspots
- likely causes of slow runs
- low-risk optimisations
- higher-risk architectural optimisations
- benchmark scenarios to prove improvements

Do not make behavioural changes. This is a review task.
```

---

## Prompt 10 — Audit, Extend, or Add Benchmark Models and Benchmark Runner

```markdown
Audit the benchmark coverage that already exists, then extend or add a benchmark suite for the DES engine only where needed.

First search the repository for existing:
- benchmark scripts
- performance tests
- stress tests
- sample model fixtures
- Glasgow/post-office/stadium models
- runtime metrics or profiling utilities
- CI tasks that run performance checks

Do not create a second benchmark framework if one already exists. Reuse or extend the existing approach unless there is a clear reason not to.

Benchmark scenarios to check for or add:
1. M/M/1 small
2. M/M/1 high utilisation
3. multi-stage post office
4. Glasgow-style train model with planned arrivals
5. stadium-style grouped spectators
6. stress case with large queues

For each benchmark, measure:
- wall_clock_ms
- events_processed
- c_event_scans
- max_queue_length
- replications
- events_per_second

Please inspect the repo first and choose the most appropriate test/benchmark location.

Produce or update:

`docs/analysis/des-benchmark-suite.md`

Include:
- existing benchmark baseline found in the repo
- what was reused
- what was extended
- what was newly added
- why any new benchmark structure was necessary
- benchmark commands
- expected output shape
- how benchmarks should be interpreted
- which scenarios are still missing

Add code only after the audit:
- benchmark model fixtures if appropriate
- a benchmark runner script if none exists or if the existing one is insufficient
- integration with existing test/package scripts if safe

The benchmark runner should be easy to run locally and should not require production credentials.

Avoid huge runtime by default; include a flag or separate mode for stress benchmarks.
```

---

## Prompt 11 — Simulation Results Storage Design

```markdown
Design a simulation results storage strategy.

Goal:
Avoid storing excessive event-level data by default while preserving useful analysis.

Review current run-result persistence and propose a structure for:
- run summary
- per-replication summary
- queue time series sampled every N simulation minutes
- resource utilisation summary
- optional debug event trace
- optional entity trace
- error/warning log
- model version/hash used for the run

Produce:

`docs/architecture/des-results-storage-strategy.md`

Include:
- recommended Postgres table shapes or JSON structures
- what belongs in Supabase Postgres vs Supabase Storage
- retention policy
- indexing/search needs
- result-size estimates for small/medium/large runs
- migration plan from current storage
- UI implications

Do not implement schema changes yet.
```

---

## Prompt 12 — Dedicated Simulation Worker Architecture

```markdown
Design an architecture for running larger DES experiments outside Supabase Edge Functions and Cloudflare Workers.

Assume:
- Cloudflare hosts the frontend and lightweight APIs.
- Supabase handles auth, model library, and persisted results.
- Small runs may continue to run in the browser.
- Medium/large runs should go to a dedicated simulation worker.

Produce:

`docs/architecture/des-dedicated-worker-architecture.md`

Include:
1. proposed components
2. run lifecycle
3. job table/state machine
4. authentication/authorization
5. how the worker fetches model JSON
6. how the worker writes results
7. progress updates
8. cancellation
9. retries/failures
10. cost controls
11. deployment options such as Cloud Run, Fly.io, Render worker, or similar
12. what remains in Supabase/Cloudflare

No implementation in this task.
```

---

## Prompt 13 — Run Progress and Cancellation Design

```markdown
Design progress reporting and cancellation for DES runs.

Review current execution flow and propose:
- progress metrics
- progress event frequency
- cancellation mechanism
- partial result handling
- UI behaviour
- persistence of failed/cancelled runs
- worker/browser compatibility

Produce:

`docs/architecture/des-run-progress-and-cancellation.md`

Include:
- current state
- design proposal
- risks
- test plan
- minimal implementation plan

Do not implement unless the code already has a clear extension point.
```

---

## Prompt 14 — DES Model Validation Gap Review

```markdown
Review the current model validation logic against the latest DES Studio LLM schema.

Focus on gaps that could allow slow or invalid models:
- missing maxSimTime
- missing sinks
- ambiguous lifecycle
- probabilisticRouting to null used as a simple sink
- routing combined with RELEASE(Server, Queue)
- cSchedules missing useEntityCtx
- string routing conditions where predicate objects are required
- partial server failure specs
- priority queues without priority attributes
- unguarded loops
- excessive planned rows
- excessive replications

Produce:

`docs/analysis/des-validation-gap-review.md`

Include:
- each rule checked today
- each rule missing today
- severity
- proposed validation message
- suggested test cases
- recommended implementation order

Do not implement in this task.
```

---

## Prompt 15 — Implement Lifecycle Validation Improvements

```markdown
Implement validation improvements for DES event lifecycle handling.

Add checks for:
1. `probabilisticRouting` with `queueName: null` must include `COMPLETE()` or `RENEGE(ctx)`.
2. If `probabilisticRouting` contains only one route with `probability: 1` and `queueName: null`, warn that explicit `COMPLETE()` without routing is preferred.
3. Do not allow `routing` together with `RELEASE(Server, Queue)`.
4. Terminal service completions should have a single clear lifecycle sink.
5. `RENEGE` must be exactly `RENEGE(ctx)`.

Add tests for these cases.

Update:

`docs/analysis/des-lifecycle-validation-update.md`

Include:
- files changed
- validation messages added
- tests added
- any migration/backward compatibility concerns
```

---

## Prompt 16 — Queue Growth Diagnostic Feature

```markdown
Design a queue growth diagnostic for DES models.

Goal:
When a run has very large queues or runs slowly, the system should explain likely causes.

Review current metrics/results and propose how to identify:
- queues with largest peak
- queues with sustained growth
- resources with highest utilisation
- arrival bursts exceeding capacity
- C-event priority starvation
- routes sharing a bottleneck resource
- models that are structurally unstable

Produce:

`docs/architecture/des-queue-growth-diagnostics.md`

Include:
- diagnostic rules
- required metrics
- example messages
- UI placement
- test models
- limitations

Do not implement unless straightforward.
```

---

## Prompt 17 — Glasgow Model Performance Case Study

```markdown
Use the existing Glasgow Central train model files in the repo, if present, as a performance case study.

Before analysing the Glasgow model, check what benchmarks or performance tests already exist and whether any already use Glasgow-like planned-arrival models. Reuse those results or extend those benchmarks rather than inventing separate measurements.

Investigate:
- planned arrival volumes through the day
- morning/evening peak representation
- high-level approach bottlenecks
- departure queue growth
- whether the route-refined model reduces artificial queueing
- whether large queues slow the three-phase engine

Produce:

`docs/case-studies/glasgow-central-des-performance.md`

Include:
- existing benchmark baseline related to Glasgow/planned-arrival models
- model files inspected
- assumptions
- timetable/plan summary
- queueing hypotheses
- recommended model refinements
- recommended engine instrumentation
- any benchmark commands run

If the Glasgow files are not in the repo, state that clearly and provide instructions for adding them as fixtures.
```

---

## Prompt 18 — Supabase and Cloudflare Cost-Control Checklist

```markdown
Create a practical cost-control checklist for DES Studio running on Supabase and Cloudflare.

Review the codebase and produce:

`docs/operations/des-cost-control-checklist.md`

Include:
- what should run in the browser
- what can run in Supabase Edge Functions
- what can run in Cloudflare Workers
- what should move to a dedicated worker
- storage controls
- result retention controls
- run size limits
- logging limits
- import size limits
- API rate limits
- abuse prevention
- monitoring dashboards/alerts to add

Where possible, reference existing files/config in the repo.
```

---

## Prompt 19 — AGENTS.md Update for DES Runtime Safety

```markdown
Review the repo guidance files, especially `AGENTS.md` if present.

Add or propose a concise section about DES runtime safety.

The guidance should tell future agents:
- do not put heavy simulation loops in edge/serverless request handlers
- instrument simulation changes
- avoid event-level persistence by default
- preserve simulation semantics when optimising
- add benchmarks for engine changes
- validate lifecycle sinks clearly
- prefer explicit `COMPLETE()` for simple terminal events
- avoid `probabilisticRouting` to `null` as a simple sink anti-pattern

If editing AGENTS.md directly is appropriate, make a small patch.
If not, create:

`docs/agent-guidance/des-runtime-safety.md`

and explain how it should be referenced.
```

---

## Prompt 20 — Implementation Roadmap

```markdown
Based on the codebase review, existing docs, and existing benchmark assets, create a phased implementation roadmap for DES compute sizing and runtime safety.

The roadmap must explicitly account for what benchmark infrastructure already exists and avoid duplicating it.

Produce:

`docs/roadmap/des-compute-and-runtime-roadmap.md`

Structure:
- Phase 0: factual architecture map
- Phase 1: instrumentation
- Phase 2: validation/admission rules
- Phase 3: benchmark suite
- Phase 4: browser worker/progress/cancellation
- Phase 5: dedicated simulation worker
- Phase 6: cost monitoring and retention controls

For each phase include:
- objective
- current benchmark/assets baseline relevant to the phase
- tasks
- files likely to change
- risks
- test strategy
- acceptance criteria

Do not implement code in this task.
```

---


---

## Prompt 21 — Benchmark Inventory and Gap Report

```markdown
Create a benchmark inventory and gap report for the DES engine.

This is an audit task first. Do not add new benchmark code unless the repo has no benchmark structure at all and a minimal inventory script is clearly useful.

Search the repository for:
- benchmark scripts
- package.json scripts related to benchmarks/performance
- test files that measure runtime or stress behaviour
- fixture models used for performance testing
- sample models that could become benchmarks
- docs that mention performance, runtime, queue growth, or engine scaling
- runtime metric fields such as events_processed, c_event_scans, wall_clock_ms, max_queue_length
- CI jobs related to performance

Produce:

`docs/analysis/des-benchmark-inventory-and-gaps.md`

Include:
1. Existing benchmark scripts and how to run them.
2. Existing benchmark fixtures/models.
3. Existing runtime metrics captured.
4. Existing performance/stress tests.
5. Existing docs covering performance.
6. Gaps against the desired benchmark coverage:
   - M/M/1 small
   - M/M/1 high utilisation
   - post office
   - Glasgow planned-arrival train model
   - stadium grouped spectator model
   - large-queue stress case
7. Whether the existing benchmarks are good enough to support compute sizing.
8. Recommended next changes, ordered from smallest/lowest-risk to largest.
9. Any duplicate or obsolete benchmark assets that should be consolidated.

Do not create a parallel benchmark framework. If benchmarks already exist, recommend how to extend them.
```


## Recommended Order

Use the prompts in this order:

```text
1. Prompt 1 — Runtime execution map
2. Prompt 21 — Benchmark inventory and gap report
3. Prompt 2 — Instrumentation plan
4. Prompt 3 — Minimal metrics implementation
5. Prompt 9 — Three-phase engine efficiency review
6. Prompt 10 — Audit, extend, or add benchmark suite
7. Prompt 5 — Run admission rules
8. Prompt 14 — Validation gap review
9. Prompt 15 — Lifecycle validation improvements
10. Prompt 6 — Supabase review
11. Prompt 7 — Cloudflare review
12. Prompt 12 — Dedicated worker architecture
13. Prompt 20 — Roadmap
```

This order avoids premature architecture changes and builds evidence first.