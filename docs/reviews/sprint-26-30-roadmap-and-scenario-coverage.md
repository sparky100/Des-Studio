# DES Studio — Sprint 26-31 Roadmap and Modelling Scenario Coverage

Last updated: 2026-05-14

## Purpose

This document turns the open-source gap analysis into a concrete next-sprint roadmap and pairs it with a modelling-scenario coverage view:

- what DES Studio can model well today
- what it can model only partially or awkwardly
- what it cannot currently support in a credible way
- which missing scenarios appear to offer the highest product value

This is a planning document, not an implementation record.

## Executive Summary

After Sprint 31, DES Studio has a strong correctness baseline, comprehensive debugging/explainability support, and live observability features. The next challenge is to deepen resource reliability modelling (preemption, breakdowns) and expand entity composition capabilities (splitting, co-seize, matching).

The recommended next sequence is:

1. **Sprint 26 — Resource Semantics and Waiting Behaviour** ✅ Complete
2. **Sprint 27 — Simulation Debugging and Explainability** ✅ Complete
3. **Sprint 28 — Experiments and Statistical Workbench** ✅ Complete
4. **Sprint 29 — Reference Models, Benchmarks, and Performance Envelope** ✅ Complete
5. **Sprint 30 — Reusable Modelling Library and Scenario Packs** ✅ Complete
6. **Sprint 31 — Expressiveness & Observability** ✅ Complete
7. **Sprint 32 — Resource Reliability** (next)

This sequence is intentional:

- semantic depth before feature breadth
- explainability before major expansion
- analytics before broader scenario claims
- benchmarks before large-scale positioning
- reusable model assets after the engine is better able to support them
- quick-win expressiveness gaps before complex resource semantics

---

## Proposed Sprint Roadmap

## Sprint 26 — Resource Semantics and Waiting Behaviour

**Goal:** Expand the engine beyond the current process-flow core with richer resource and waiting semantics inspired by mature simulation frameworks, while preserving the browser-native JavaScript engine.

### Why this sprint comes next

This is the biggest structural gap relative to mature tools. Many higher-value modelling scenarios depend on richer waiting, request, coordination, and interruption semantics.

### Proposed scope

- formalize resource claims and releases as a first-class engine concept
- add clearer waiting-state ownership and causality
- support richer queue/resource arbitration policies
- assess and implement preemption or interrupt-like semantics where they fit the current engine model
- define engine-level behaviour for contention, cancellation, and wake-up ordering

### Likely deliverables

- explicit resource arbitration contract
- clearer entity waiting-state model
- interruption/preemption design decision
- regression coverage for resource contention edge cases
- updated modelling guidance and validation rules where needed

### Main value

- increases modelling expressiveness
- unlocks more realistic service and contention scenarios
- reduces custom workaround pressure in model design

### Exit gate

- one authoritative waiting/resource contract
- deterministic tests for contention, release, cancellation, and arbitration
- no ambiguity about how blocked entities resume

---

## Sprint 27 — Simulation Debugging and Explainability

**Goal:** Make DES Studio easier to trust when models become difficult.

### Why this sprint follows Sprint 26

Once semantics get richer, modellers need better visibility into why the engine behaved the way it did.

### Proposed scope

- event provenance and causal trace view
- “why is this entity waiting?” inspector
- queue selection reasoning
- condition evaluation trace for C-events
- richer run-log filtering and linking between visual canvas and execution trace

### Likely deliverables

- entity lifecycle drill-down
- queue/resource arbitration explanation surface
- C-event truth/failure explanation panel
- traceable links between logs, entities, and live nodes

### Main value

- improves modeller confidence
- reduces time spent interpreting unexpected behaviour
- strengthens teaching and onboarding workflows

### Exit gate

- a modeller can explain why a given entity is waiting, moving, blocked, or served using first-class UI support
- trace tooling works without changing run semantics

---

## Sprint 28 — Experiments and Statistical Workbench

**Goal:** Promote DES Studio from “can run experiments” to “can support a serious study workflow.”

### Why this sprint follows debugging

Statistical work is much more valuable once the modeller can trust and explain the underlying run behaviour.

### Proposed scope

- saved experiment definitions
- scenario sets and reusable experiment presets
- stronger replication comparison views
- confidence interval and transient-analysis improvements
- experiment result organization and naming discipline

### Likely deliverables

- first-class experiments workspace
- saved scenario comparison sets
- improved KPI analysis and uncertainty presentation
- better warm-up and replication diagnostics

### Main value

- moves DES Studio toward study-grade output
- improves repeatability and collaboration
- increases value for teaching, consulting, and decision support

### Exit gate

- experiments are saved, comparable, and reusable
- key uncertainty outputs are visible without manual interpretation

---

## Sprint 29 — Reference Models, Benchmarks, and Performance Envelope

**Goal:** Establish trust through benchmarked behaviour and a clearer scaling story.

### Why this sprint follows experiments

Once semantics and analytics mature, the product needs published confidence signals.

### Proposed scope

- canonical benchmark models
- golden-result regression fixtures
- reproducibility and replay checks
- engine-vs-UI performance measurement
- published performance envelope for typical workloads

### Likely deliverables

- benchmark suite covering key model classes
- reproducibility harness and reference outputs
- documented scaling observations
- targeted render/performance hardening where needed

### Main value

- makes product claims more credible
- supports future architecture choices with evidence
- reduces regression risk as the engine expands

### Exit gate

- benchmark suite is part of normal validation practice
- performance/scaling claims are evidence-backed

---

## Sprint 30 — Reusable Modelling Library and Scenario Packs

**Goal:** Turn deeper engine capability into reusable value for real modellers.

### Why this sprint comes after trust and semantics

Templates and scenario packs become much more useful once the underlying semantics are broader and more reliable.

### Proposed scope

- richer template model library
- reusable component patterns
- domain-specific starter packs
- “how to model X” examples tied to real scenarios
- scenario classification and recommendation guidance

### Likely deliverables

- expanded model library beyond the current starter set
- domain packs for healthcare, service systems, logistics, and manufacturing
- capability-aware onboarding guidance
- documentation that maps user intent to modelling patterns

### Main value

- increases time-to-first-value
- makes the product easier to adopt in teaching and real projects
- turns engine gains into visible product differentiation

### Exit gate

- users can start common real-world models from robust exemplars rather than blank-canvas invention

---

## Cross-Sprint Prioritization Logic

| Priority driver | Why it matters |
|---|---|
| **Semantic depth first** | Without richer engine behaviour, the product remains narrower than mature tools. |
| **Explainability second** | More expressive behaviour without better tracing makes trust worse, not better. |
| **Experiment maturity third** | Serious study workflows depend on both correct semantics and understandable runs. |
| **Benchmarks before scale claims** | Product positioning should follow measured evidence. |
| **Library expansion last** | Reusable packs are highest value after the underlying platform is strong enough to support them well. |

---

## Modelling Scenario Coverage

This section is based on the current documented capability set after Sprints 10-25:

- structured entity types, queues, B-events, and C-events
- queue disciplines and centralized arbitration
- routing, pooling, finite queues, balking, batching, and recirculation
- time-varying arrivals and capacity schedules
- replications, sweeps, results workspaces, and warm-up handling

It does **not** assume support for behaviours that are not clearly represented in the current model vocabulary or completed sprint record.

## Scenarios DES Studio can model well today

| Scenario class | Coverage | Why it fits well |
|---|---|---|
| Basic queueing systems | Strong | Arrivals, waiting, service, completion, and results workflows are directly supported. |
| Multi-step service flows | Strong | Queues, C-events, routing, and multi-stage process flow are now established patterns. |
| Pooled-server service systems | Strong | Sprint 10 added pooling and routing improvements. |
| Finite-capacity queues and balking | Strong | Explicitly added in Sprint 11. |
| Batch/assembly-lite process flows | Strong | Sprint 12 added BATCH/UNBATCH and recirculation support. |
| Time-varying arrivals and staffing levels | Strong | Sprint 7 introduced piecewise arrival rates and resource schedules. |
| Scenario comparison and parameter exploration | Strong | Replications, 1D sweeps, 2D sweeps, and comparison tooling exist. |
| Teaching/demo DES models | Strong | The UI, templates, and workflow shell are well-suited to guided modelling. |

## Scenarios DES Studio can support, but only partially or awkwardly

| Scenario class | Coverage | Current limitation | Value if improved |
|---|---|---|---|
| Priority-sensitive service systems | Partial | Basic arbitration exists, but richer service semantics and debugging are still limited | High |
| Healthcare pathway models with nuanced waiting logic | Partial | Many flow patterns are possible, but nuanced interruption/escalation/wake-up behaviour is limited | High |
| Manufacturing lines with richer resource contention | Partial | Batching and recirculation exist, but deeper shared-resource semantics are not yet mature | High |
| Call center / contact center models with abandonment nuance | Partial | Core queue/renege patterns exist, but more detailed waiting-state diagnostics and policies are needed | Medium-High |
| Logistics flows with capacity and staging constraints | Partial | Process-flow modelling is possible, but movement/storage semantics are relatively shallow | Medium-High |
| Analytical experimentation studies | Partial | Experiments exist, but saved study management and deeper statistical tooling are still limited | High |

## Scenarios DES Studio cannot currently support well

| Scenario class | Why not currently credible | Relative value |
|---|---|---|
| Rich interruption/preemption systems | No first-class interruption/preemption semantics yet | High |
| Inventory / container / store-driven process interaction | No clearly documented first-class store/container abstraction | High |
| Transport-network or mover-heavy models | Current vocabulary is stronger for process flow than spatial transport behaviour | Medium-High |
| Reliability / breakdown / maintenance-rich systems | Capacity scheduling exists, but equipment failure/repair behaviour is not a first-class documented capability | High |
| Complex synchronization / wait-for-many patterns | No direct equivalent of composite event coordination is documented | High |
| Detailed human-behaviour or agent-based models | Tool is DES-focused, not a general ABM environment | Medium |
| Continuous + discrete hybrid systems | Current architecture is DES-oriented, not hybrid simulation oriented | Medium |

---

## Highest-Value Missing Scenario Classes

These appear to offer the best product return if addressed, balancing likely user demand and architectural leverage.

### Tier 1 missing scenario value

| Scenario | Why it matters | Recommended sprint anchor |
|---|---|---|
| Rich service-resource contention | Common across healthcare, service ops, manufacturing, and logistics | Sprint 26 |
| Interruption / preemption / escalation | Important for emergency, priority, and operationally realistic systems | Sprint 26 |
| Strong experiment-study workflows | Needed for serious decision-support use, not just demonstration runs | Sprint 28 |
| Better debugging for difficult models | Raises trust across every scenario class | Sprint 27 |

### Tier 2 missing scenario value

| Scenario | Why it matters | Recommended sprint anchor |
|---|---|---|
| Reliability / failure / repair modelling | High practical value in manufacturing and service infrastructure | Sprint 26 follow-on or post-30 |
| Inventory/store/container interaction | Broad operational relevance | Sprint 26 follow-on or post-30 |
| Scaled benchmarked model libraries | Important for adoption and trust | Sprint 29 / Sprint 30 |

### Tier 3 missing scenario value

| Scenario | Why it matters | Recommended timing |
|---|---|---|
| Transport-network spatial modelling | Valuable, but likely a larger semantic and visual expansion | Later |
| Hybrid continuous-discrete modelling | Interesting, but outside the strongest current product identity | Later |
| Agent-based modelling | Likely off-strategy unless product positioning changes significantly | Later or never |

---

## Product Positioning Implications

### Strongest current positioning

DES Studio is currently strongest as:

- a browser-native structured DES modeller
- a teaching and onboarding tool for process-flow simulation
- a guided modeller for queues, services, routing, and experiments
- a collaborative product candidate for lightweight-to-moderate operational simulation

### Risky positioning today

DES Studio should be cautious about claiming parity with broader simulation environments for:

- interruption-heavy systems
- reliability/maintenance-rich industrial systems
- transport-network simulation
- highly specialized shared-resource coordination models

### Best near-term positioning move

The best next move is to become excellent at **structured operational DES** before trying to cover every simulation family. That means going deeper on:

- service systems
- healthcare flows
- logistics process flow
- manufacturing process flow with resource contention
- study-grade experimentation and results trust

---

## Recommended Decisions for the Team

1. Treat **resource semantics, waiting behaviour, and debugging** as platform work, not optional polish.
2. Keep the product centered on **structured DES**, not general simulation breadth.
3. Invest in **serious experiment and analysis workflows** before chasing wide scenario marketing.
4. Use **benchmarks and reference models** to decide when broader claims are justified.
5. Expand scenario coverage in areas that reinforce the current product identity rather than dilute it.

---

## Final Recommendation

The recommended Sprint 26-30 sequence is sound because it compounds:

- deeper engine semantics
- better modeller trust
- stronger analysis workflows
- evidence-backed product confidence
- reusable scenario assets

The scenario assessment suggests DES Studio already has a strong foundation for queueing, service, routing, batching, and experimental exploration. The highest-value missing capabilities are not random extras; they cluster around richer resource semantics, interruptions, causal debugging, and serious study workflows.

That is where the next roadmap should stay focused.
