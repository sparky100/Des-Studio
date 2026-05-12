# SimPy Architecture Review

Review date: 2026-05-12  
Related review: `docs/reviews/simulation-architecture-review.md`

## Executive Summary

DES Studio currently implements a custom JavaScript discrete-event simulation engine. That engine manually manages simulation time, a future event list, B-event/C-event execution, entity state, queues, resources, cancellation-like behavior, and replications. Many of those mechanisms overlap with concepts provided by SimPy, especially `Environment`, `Process`, `Timeout`, `Event`, `Resource`, `PriorityResource`, `Store`, `FilterStore`, and interrupts.

However, a major migration to idiomatic SimPy is not currently justified. The product is a browser-based React/Vite application with no Python runtime dependency (`package.json` contains React, Supabase, React Flow, Vite/Vitest, and TypeScript; no Python/SimPy integration). The engine is also intentionally shaped around Pidd's Three-Phase Method with explicit B-events and C-events. Idiomatic SimPy is process-oriented and generator-based, while DES Studio is modeller-facing and declarative: users define structured events, queues, resources, and predicates without writing code.

The strongest recommendation is **B) partial migration recommended**:

- Do not replace the engine wholesale with SimPy in Sprint 24.
- Use SimPy as an architectural reference for event lifecycle, waiting/cancellation, resources, stores, and interruption semantics.
- Consider adding a future optional SimPy export or Python-side validation harness for benchmark models.
- Refactor the JavaScript engine toward SimPy-like abstractions where it reduces correctness risk, without adopting Python as the primary browser runtime.

## Architecture Overview

Observed DES Studio execution model:

| Concern | Current implementation |
|---|---|
| Clock and scheduler | `buildEngine()` owns `clock` and `fel` in `src/engine/index.js`; `step()` advances to `fel[0].scheduledTime`. |
| Bound events | `fireBEvent()` in `src/engine/phases.js` executes B-event effects and schedules future B-events. |
| Conditional events | `step()` scans sorted C-events with restart rule; `fireCEvent()` applies effects and schedules B-events. |
| Entity lifecycle | Macros in `src/engine/macros.js` mutate entity status: `waiting`, `serving`, `done`, `reneged`, `idle`, `busy`. |
| Queues/resources | `makeHelpers()` in `src/engine/entities.js` and `ASSIGN()` in `macros.js` select waiting entities and idle servers. |
| Cancellation/reneging | Scheduled B-events carry `_isRenege` and `_contextCustId`; `fireBEvent()` skips reneging when the context entity is no longer waiting. |
| Replications | `src/engine/replication-runner.js` uses browser workers or inline fallback to run multiple independent engine instances. |
| UI boundary | `src/ui/execute/index.jsx` imports `buildEngine()`, `runReplications()`, validation, distributions, and statistics helpers. |

Official SimPy comparison baseline:

- SimPy exposes an `Environment` for event-based simulation, plus `Event`, `Timeout`, `Process`, `AllOf`, `AnyOf`, and `Interrupt` primitives in the main API reference: [SimPy API Reference](https://simpy.readthedocs.io/en/stable/api_reference/simpy.html).
- SimPy basics describe the environment as the event-list owner that tracks simulation time, and process functions as Python generators yielding events: [SimPy basics](https://simpy.readthedocs.io/en/4.0.2/topical_guides/simpy_basics.html).
- SimPy resources cover congestion primitives such as `Resource`, `PriorityResource`, `PreemptiveResource`, `Container`, `Store`, `PriorityStore`, and `FilterStore`: [SimPy API Reference](https://simpy.readthedocs.io/en/stable/api_reference/simpy.html).

## SimPy API Comparison Table

| Current DES Studio mechanism | Current files/functions | SimPy mechanism | Classification | Notes |
|---|---|---|---|---|
| Manual `clock` and sorted `fel` | `src/engine/index.js:197-207`, `src/engine/index.js:228-355` | `simpy.Environment`, `env.run()`, event queue | Questionable duplication | SimPy would provide scheduler ordering and event loop semantics, but DES Studio's explicit Three-Phase B/C scan is custom domain behavior. |
| Scheduling future B-events with `scheduledTime` | `src/engine/phases.js:238-256`, `src/engine/phases.js:270-295` | `yield env.timeout(delay)`, `env.process()` | Questionable duplication | SimPy would express delays as process suspension. Current design is declarative and table-driven. |
| C-event priority restart loop | `src/engine/index.js:305-333` | No direct equivalent; can be modelled with events/process coordination | Appropriate custom implementation | Pidd's C-scan restart rule is central to the product and not a native SimPy concept. |
| Entity lifecycle macros | `src/engine/macros.js:85-495` | Generator processes representing entity flow | Questionable duplication | SimPy processes naturally encode entity lifecycles, but DES Studio intentionally hides code from modellers. |
| Server/resource acquisition | `src/engine/macros.js:193-263`, `src/engine/entities.js:93-112` | `Resource`, `PriorityResource`, `PreemptiveResource` | Questionable duplication | SimPy resource queues would reduce custom arbitration bugs, especially priority and future preemption. |
| Queue/customer storage | `entities` array with `queue` field; `waitingOf()` | `Store`, `FilterStore`, `PriorityStore` | Questionable duplication | SimPy stores map well to filtered entity queues and batching. |
| Finite queue capacity and blocking/balking | `src/engine/macros.js:101-169` | `Store(capacity)`, resource request queues, events | Questionable duplication | SimPy capacity primitives would give clearer blocking semantics, but balking policies remain custom. |
| Reneging timers | `src/engine/phases.js:135-143`, `src/engine/phases.js:238-251`, `src/engine/macros.js:344-360` | `AnyOf(request, timeout)`, interrupts | Likely architectural mistake in current shape | Current context binding is fragile. SimPy has established patterns for waiting for whichever happens first. |
| Batch/unbatch | `src/engine/macros.js:365-473` | `Store.get()`, `AllOf`, custom process coordination | Appropriate custom / questionable duplication | SimPy can coordinate grouped gets, but DES Studio's macro vocabulary is product-specific. |
| Shift capacity changes | `src/engine/index.js:43-54`, `src/engine/phases.js:13-53` | Resource capacity patterns/custom resource wrapper | Questionable duplication | SimPy core resource capacity is not usually mutated directly as a complete scheduling policy; custom handling would still be needed. |
| Replications | `src/engine/replication-runner.js:66-225` | Multiple independent environments | Appropriate custom implementation | Browser worker orchestration is a JS product concern; SimPy would not replace UI worker orchestration. |
| Validation before run | `src/engine/validation.js` | No direct SimPy equivalent | Appropriate custom implementation | Model validation belongs to DES Studio's structured authoring layer. |
| Execute canvas snapshots | `src/engine/index.js:137-184`, `src/ui/execute/ExecuteCanvas.jsx` | No direct SimPy equivalent | Appropriate custom implementation | Live visual state is product-specific. |

## Findings By Severity

### Critical

No Critical finding supports an immediate major rewrite to SimPy. The current engine has correctness issues, but they can be remediated in the JavaScript architecture without replacing the runtime.

### High

| ID | Finding | Evidence | SimPy comparison | Classification | Migration benefits | Migration risks |
|---|---|---|---|---|---|---|
| H-S1 | Reneging/cancellation is reinvented in a fragile way. | `src/engine/phases.js:135-143` skips a renege only if context entity is no longer waiting. `src/engine/phases.js:238-251` chooses the newest waiting entity globally for `sched.isRenege`. `src/engine/macros.js:344-360` mutates waiting entity to `reneged`. | Idiomatic SimPy commonly models abandonment with a resource request racing a timeout via `AnyOf`, or with process interrupts. | Likely architectural mistake | SimPy-style `request | timeout` semantics would make cancellation explicit and entity-local. | Direct SimPy adoption requires Python runtime/backend; translating current macro DSL to generator processes is non-trivial. |
| H-S2 | Resource arbitration duplicates SimPy resources but lacks equivalent request objects and cancellation semantics. | `src/engine/macros.js:193-263` manually selects a customer and server; `src/engine/entities.js:93-112` sorts waiting entities. | `Resource`, `PriorityResource`, and `PreemptiveResource` provide request queues, priority ordering, and optional preemption. | Questionable duplication | Resource requests could encode waiting, acquisition, priority, and release consistently. | SimPy's default process/resource model does not directly express Pidd's C-event priority scan; a wrapper would still be custom. |
| H-S3 | Manual event queue and clock duplicate SimPy's environment but are tied to Three-Phase semantics. | `src/engine/index.js:197-207` builds and sorts the FEL; `src/engine/index.js:241-270` advances `clock` and removes due events; `src/engine/index.js:295-320` pushes/sorts generated FEL entries. | `Environment` owns the event list and current time; `Timeout` schedules delayed events. | Questionable duplication, but defensible | SimPy would reduce scheduler edge-case risk and provide mature event ordering. | Replacing this would risk breaking the explicit B-events-at-T-now then C-scan-restart behavior. |
| H-S4 | Entity lifecycle is encoded as mutable status fields rather than process control flow. | `src/engine/macros.js:248-255`, `src/engine/macros.js:279-298`, `src/engine/macros.js:330-337`, `src/engine/macros.js:354-356` directly mutate status/server/queue fields. | SimPy entities are often generator processes whose lifecycle is the code path through `yield`s. | Questionable duplication | Process-local lifecycle reduces impossible transitions and stale-context bugs. | DES Studio intentionally forbids user-written code; generated Python processes would be an internal compilation target, not a direct UI model. |

### Medium

| ID | Finding | Evidence | SimPy comparison | Classification | Migration benefits | Migration risks |
|---|---|---|---|---|---|---|
| M-S1 | Queue storage duplicates `Store`/`FilterStore` patterns. | Entities remain in one global array and queue membership is an entity field; `waitingOf()` filters/sorts the global array. | `Store`, `FilterStore`, and `PriorityStore` model objects waiting in queues with optional filtering/priority. | Questionable duplication | Queue-local stores would reduce cross-queue selection mistakes and make batching/filtering clearer. | Existing snapshots and UI expect a global entity pool. A full store migration would need compatibility adapters. |
| M-S2 | Batch/unbatch could be modelled through store coordination but also represents a product-specific macro. | `src/engine/macros.js:365-473` removes entities from the global pool, creates a parent batch, then restores children. | `AllOf` can coordinate multiple events; `Store.get()` can retrieve queued objects. | Appropriate custom implementation with duplicated mechanics | SimPy patterns could clarify waiting for N entities. | The parent batch entity and visual DES vocabulary are DES Studio-specific. |
| M-S3 | Shift/resource capacity logic duplicates dynamic resource management without a clear resource abstraction. | `src/engine/index.js:43-54` creates shift events; `src/engine/phases.js:13-53` adds/removes server entities. | SimPy resources represent capacity-constrained access; custom wrappers can model schedule-driven capacity. | Questionable duplication | A resource abstraction would make desired capacity and actual server instances explicit. | SimPy's standard `Resource` does not automatically solve schedule-driven downshifts with busy users; custom policy remains required. |
| M-S4 | Conditional C-events are not idiomatic SimPy, but are central to the product. | `src/engine/index.js:305-333` sorts C-events by priority and restarts after each fire. | SimPy supports process coordination through events and conditions but not Pidd C-event scanning as a first-class primitive. | Appropriate custom implementation | SimPy can inspire event signalling, but not replace C-scan semantics cleanly. | A process-only migration could obscure the Three-Phase method that DES Studio explicitly teaches/implements. |
| M-S5 | Browser workers duplicate only the orchestration pattern, not SimPy. | `src/engine/replication-runner.js:66-225` controls worker pool, cancellation, progress, and ordering. | Multiple SimPy `Environment` instances can run independent replications. | Appropriate custom implementation | A Python backend could run many SimPy environments server-side. | Browser-local worker execution is valuable for responsiveness and offline/local mode. |

### Low

| ID | Finding | Evidence | SimPy comparison | Classification | Notes |
|---|---|---|---|---|---|
| L-S1 | The dependency stack is browser-first JavaScript, not Python. | `package.json` lists React, Supabase, React Flow, Vite, Vitest, TypeScript; no SimPy or Python bridge. | SimPy is Python. | Appropriate custom constraint | Direct adoption implies backend, Pyodide, or a separate execution service. |
| L-S2 | Validation and UI visualization have no direct SimPy replacement. | `src/engine/validation.js`, `src/ui/execute/ExecuteCanvas.jsx`, `src/ui/visual-designer/graph.js`. | SimPy does not provide model-authoring validation or React visualization. | Appropriate custom implementation | These should remain custom even if a SimPy execution backend is added. |

## Evidence With File References

- `src/engine/index.js:84` defines `buildEngine()`, the custom engine constructor.
- `src/engine/index.js:197-207` builds and sorts the initial future event list.
- `src/engine/index.js:228-355` implements one Phase A/B/C step.
- `src/engine/index.js:269-270` fires all B-events due at the current clock.
- `src/engine/index.js:305-333` implements the C-event priority scan with restart.
- `src/engine/phases.js:114-259` fires B-events, applies effects, and schedules new FEL entries.
- `src/engine/phases.js:238-251` handles reneging schedule target selection.
- `src/engine/phases.js:261-298` fires C-events and schedules completion events.
- `src/engine/macros.js:193-263` implements `ASSIGN()` resource/customer matching.
- `src/engine/macros.js:268-298` implements `COMPLETE()`.
- `src/engine/macros.js:303-339` implements `RELEASE()`.
- `src/engine/macros.js:344-360` implements `RENEGE()`.
- `src/engine/macros.js:365-473` implements `BATCH()` and `UNBATCH()`.
- `src/engine/entities.js:93-112` implements queue discipline sorting in `waitingOf()`.
- `src/engine/replication-runner.js:66-225` implements browser worker replication orchestration.
- `src/ui/execute/index.jsx:8-17` imports the engine, replication runner, statistics, persistence, and validation into the Execute panel.
- `package.json` confirms the project runtime is JavaScript/Vite/React, not Python/SimPy.

## Migration Opportunities

### Opportunity 1: SimPy-Inspired Cancellation Model

Current issue: reneging and stale completions are encoded as scheduled B-events with context IDs.

SimPy pattern: a customer waits on `request | timeout`; whichever event happens first determines whether the customer gets service or reneges.

Recommended action:

- Keep JavaScript runtime.
- Introduce an internal event-wait abstraction modelled on `AnyOf`.
- Make reneging timers entity-local and cancel/ignore completion events through explicit lifecycle tokens.

### Opportunity 2: SimPy-Like Resource Abstraction

Current issue: resource availability and customer selection are split between `ASSIGN()`, `waitingOf()`, server entities, and queue definitions.

SimPy pattern: resources own request queues; priority resources arbitrate by priority.

Recommended action:

- Add an engine-level resource/queue service, not a direct SimPy dependency.
- Represent requests explicitly: `{ entityId, queueName, resourceType, priority, requestedAt, status }`.
- Route `ASSIGN()`, `BATCH()`, and `RENEGE_OLDEST()` through shared selection APIs.

### Opportunity 3: SimPy Export / Cross-Check Harness

Current issue: custom scheduler correctness requires bespoke tests.

SimPy opportunity:

- Generate a SimPy model for a supported subset: arrivals, fixed/exponential/uniform service, FIFO/Priority resources, reneging, simple routing.
- Run it as a benchmark outside the browser to compare DES Studio output for canonical templates.

Recommended action:

- Treat this as a future validation/export feature, not a replacement runtime.
- Keep browser execution as primary.

### Opportunity 4: Process-Oriented Internal IR

Current issue: string macros and mutable status transitions spread lifecycle logic across files.

SimPy pattern: process functions encode entity flow linearly.

Recommended action:

- Introduce a structured intermediate representation for actions and lifecycle transitions.
- Avoid generating Python in the primary path, but design the IR so it could compile to either the JS engine or SimPy later.

## Risks of Migration

| Risk | Description | Severity |
|---|---|---|
| Runtime mismatch | SimPy is Python; DES Studio is browser-first JavaScript with local execution and workers. | High |
| Product model mismatch | DES Studio implements Pidd's Three-Phase Method; SimPy is process-oriented rather than B/C scan oriented. | High |
| UI contract breakage | Execute canvas, snapshots, run history, and ResultsWorkspace depend on current engine-shaped results. | High |
| Authoring mismatch | Users build structured models without writing code; idiomatic SimPy examples are generator functions. | Medium |
| Migration size | Full migration would touch engine, validation, templates, tests, persistence, UI snapshots, workers, local mode, and possibly deployment. | High |
| Determinism drift | SimPy has its own event ordering and process scheduling rules; outputs may differ from current Three-Phase semantics. | Medium |
| Backend requirement | Direct SimPy adoption likely requires server-side execution or Pyodide, adding security/performance/deployment concerns. | Medium |

## Final Recommendation

**Recommendation: B) partial migration recommended.**

Do not perform a major architectural refactor to SimPy as the primary runtime now. The current architecture is appropriately custom in the areas that define DES Studio's product identity:

- Pidd's Three-Phase Method.
- Structured no-code modelling.
- Browser-local execution.
- Live React/React Flow visualization.
- Supabase/local persistence.

But the current implementation is reinventing several SimPy-proven mechanisms in fragile ways:

- cancellation/reneging,
- resource request queues,
- priority arbitration,
- queue-local stores,
- process/entity lifecycle state.

The right move is to remediate the JavaScript engine using SimPy idioms as design guidance, then consider a later optional SimPy export or validation harness.

## Prioritized Action Plan

| Priority | Action | Rationale |
|---|---|---|
| P0 | Keep Sprint 24 focused on JavaScript remediation, not SimPy migration. | The urgent correctness issues can be fixed without a runtime rewrite. |
| P0 | Redesign reneging/cancellation using a SimPy `AnyOf(request, timeout)` equivalent in JS. | This directly addresses the most SimPy-relevant correctness gap. |
| P0 | Add lifecycle transition helpers so status changes behave like controlled process transitions. | Reduces impossible states currently caused by mutable status fields. |
| P1 | Centralize resource/queue arbitration behind a SimPy-like resource service. | Captures benefits of `Resource`/`PriorityResource` without changing runtime. |
| P1 | Add regression tests comparing queue/resource behavior to SimPy-style expectations. | Locks down semantics before any future migration. |
| P2 | Define a structured action/process IR that could compile to JS engine or SimPy. | Keeps a future SimPy backend/export feasible. |
| P2 | Build a small proof-of-concept SimPy exporter for M/M/1 and call-center reneging templates. | Tests whether SimPy can serve as a validation oracle. |
| P3 | Reassess major migration only after the proof of concept covers C-event priority scans, routing, batching, warm-up, and visualization snapshots. | Avoids committing to a migration before proving semantic fit. |

## Bottom Line

DES Studio is duplicating several mechanisms that SimPy already models well, but the duplication is not automatically a mistake because the app is a browser-based, Pidd Three-Phase, no-code simulation modeller. A major SimPy rewrite would add significant runtime and product risk. A SimPy-informed JavaScript refactor plus optional SimPy validation/export path gives the project most of the correctness benefit with far less disruption.
