# Sprint 26 Capability Guide — Resource Semantics and Waiting Behaviour

Created: 2026-05-13  
Sprint: Sprint 26

## Purpose

This guide explains the resource and waiting capabilities hardened in Sprint 26 in modeller-facing terms.

It is intentionally practical:

- what the engine now supports reliably
- how to model with it
- which existing templates demonstrate it
- which focused sample models to import if you want a smaller proof case
- what is still out of scope

## What Sprint 26 changed

Sprint 26 did not add a new visual editor or a brand-new macro. It made the existing modelling contract more explicit and more trustworthy.

The main outcomes are:

- waiting ownership is explicit rather than implied only by `status`
- customer/server service claims are mirrored on both sides
- stale release/completion paths are rejected instead of mutating into impossible states
- idle-server selection is deterministic
- release-triggered wake-up ordering is now better defined and covered by tests
- routing, recirculation, and queue return paths follow the same lifecycle rules as arrivals and releases

## Supported modelling patterns

### 1. Single-stage queue and service

Use when:

- one queue feeds one server pool
- an entity waits, is served, and exits

Pattern:

- `ARRIVE(Type, QueueName)`
- C-event condition checks queue non-empty and server idle
- `ASSIGN(QueueName, ServerType)`
- service completion schedules `COMPLETE()`

Reference models:

- `M/M/1 Queue` template
- `Data Center` template

### 2. Multi-stage handoff with explicit release to the next queue

Use when:

- an entity completes one stage but remains in the system
- the same entity must be routed to a downstream queue

Pattern:

- stage 1 C-event assigns to a resource
- stage 1 completion B-event uses `RELEASE(ResourceType, NextQueue)`
- downstream C-event claims from `NextQueue`
- final stage uses `COMPLETE()`

What Sprint 26 adds:

- returned-to-queue entities now re-enter an explicit waiting state consistently
- release does not leave stale mirrored ownership behind

Reference models:

- `Construction Logistics` template
- `Outpatient Clinic` template
- sample import: [priority-handoff-demo.json](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/examples/sprint-26/priority-handoff-demo.json)

### 3. Priority downstream queue after an upstream stage

Use when:

- entities are first processed in a neutral/FIFO queue
- then compete for a downstream priority queue

Pattern:

- upstream release routes into a PRIORITY queue
- downstream C-event uses `ASSIGN(PriorityQueue, ResourceType)`

What Sprint 26 adds:

- wake-up ordering after release is better defined
- queue discipline and C-event priority are now cleaner parts of the same contract

Reference models:

- `ER Triage` template
- sample import: [priority-handoff-demo.json](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/examples/sprint-26/priority-handoff-demo.json)

### 4. Waiting cancellation through reneging

Use when:

- an entity may abandon a queue after a patience time

Pattern:

- arrival schedules a bound reneging B-event
- reneging uses `RENEGE(ctx)`

What Sprint 26 adds:

- reneging now cleanly clears explicit waiting ownership
- stale reneging timers are skipped if the entity is no longer waiting

Reference model:

- `Call Center` template

### 5. Conditional or probabilistic routing after service

Use when:

- an entity’s next queue depends on an attribute or a branch probability

Pattern:

- service completion B-event uses `RELEASE(ResourceType)`
- routing or `probabilisticRouting` determines destination queue or exit

What Sprint 26 adds:

- route-to-queue paths now go through explicit waiting ownership
- route-to-exit paths now clear waiting ownership before marking the entity done

Best use cases:

- triage disposition
- routing to fast-track vs detailed processing
- overflow to alternate queue vs exit

### 6. Finite capacity, overflow, and balking

Use when:

- entities may be blocked from joining a full queue
- entities may refuse to join based on probability or a queue-length condition

Pattern:

- queue defines `capacity`
- queue optionally defines `overflowDestination`
- arrival B-event optionally defines `balkProbability` or `balkCondition`

What Sprint 26 adds:

- overflow/reroute paths participate in the same waiting-state contract as ordinary arrivals

Reference model:

- `Airport Security` conceptually demonstrates this area
- engine-focused tests currently give a more trustworthy proof than the current template definition

### 7. Recirculation with a hard loop guard

Use when:

- an entity may repeat a process stage for rework
- the model needs a hard cap on repeats

Pattern:

- a B-event uses `loopConfig`
- the entity returns to a queue until `maxLoopCount` is reached
- once the limit is hit, it routes to an exit queue or exits the system

What Sprint 26 adds:

- recirculated-to-queue entities regain explicit waiting ownership consistently
- loop-guard exit-to-system paths clear waiting ownership cleanly

Reference:

- sample import: [recirculation-exit-demo.json](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/examples/sprint-26/recirculation-exit-demo.json)

### 8. Batch and unbatch flows

Use when:

- multiple queued entities must be combined into one batch unit
- later restored individually

Pattern:

- `BATCH(QueueName, N)` in a C-event
- downstream processing
- `UNBATCH(TargetQueue)` in a B-event

What Sprint 26 contributes indirectly:

- batch parents and restored children now participate in the same waiting ownership rules as the rest of the engine

Reference models:

- `Factory Assembly`
- `Warehouse Picking`

## Scenario classes improved by Sprint 26

These are the modelling scenarios that improved materially, even if the UI looks mostly the same.

| Scenario class | Improvement from Sprint 26 | Relative value |
|---|---|---:|
| Multi-stage service systems | Cleaner release-to-next-queue lifecycle, less hidden state drift | High |
| Healthcare triage / referral flows | Better downstream queue ownership and priority handoff semantics | High |
| Call-center abandonment | Waiting cancellation is more explicit and less fragile | High |
| Finite-capacity / overflow systems | Overflow and reroute paths now align with the same waiting contract | High |
| Rework / recirculation systems | Loop recirculation and exit cleanup are more consistent | Medium-High |
| Batch-based assembly or consolidation | Batch/unbatch transitions fit the explicit waiting model better | Medium |

## What is still out of scope

Sprint 26 improves lifecycle integrity. It does not turn simmodlr into a full preemptive resource simulator.

### Not yet supported as first-class capabilities

| Capability | State after Sprint 26 | Relative value if added later |
|---|---|---:|
| Preemption / interruption | Deferred explicitly | High |
| Mid-service priority takeover | Not supported | High |
| Scheduled completion invalidation / rebinding as a first-class concept | Not supported beyond stale-claim guards | High |
| General explicit request objects for resources | Not supported | Medium-High |
| Pause/resume semantics for partially served work | Not supported | High |
| Rich blocking semantics beyond queue waiting | Partial only | Medium |

### Practical meaning

You can model:

- wait for queue
- seize available resource
- serve
- release to another queue
- complete
- renege
- batch
- unbatch
- recirculate with a hard limit

You should not yet model:

- “doctor interrupts current patient for a trauma case”
- “machine preempts low-priority job and resumes it later”
- “resume partially completed service with retained remaining time”

## Which examples to use

If you want the smallest examples that isolate Sprint 26 outcomes:

1. [priority-handoff-demo.json](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/examples/sprint-26/priority-handoff-demo.json)
2. [recirculation-exit-demo.json](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/examples/sprint-26/recirculation-exit-demo.json)

If you want richer scenario context:

1. `Construction Logistics`
2. `Outpatient Clinic`
3. `ER Triage`
4. `Call Center`

## Recommended modeller guidance

When building models against the Sprint 26 engine:

- use `RELEASE(ResourceType, NextQueue)` for intermediate stages
- use `COMPLETE()` only for terminal completion
- use `RENEGE(ctx)` for waiting abandonment
- use queue discipline deliberately, especially with downstream priority queues
- treat preemption as unsupported unless and until a later sprint adds it explicitly
- prefer simple, explicit queue names because waiting ownership is queue-based

## Verification basis

The Sprint 26 contract is backed by focused regression coverage, including:

- claim/release ownership tests
- waiting ownership transition tests
- wake-up ordering tests
- conditional routing tests
- probabilistic routing tests
- recirculation lifecycle cleanup tests

Latest focused run during this guide:

- `npm test -- three-phase entities macros conditional-routing probabilistic-routing recirculation warmup`
- `189 passed`
