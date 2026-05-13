# Sprint 26-30 Roadmap — Codex Assessment

Created: 2026-05-12  
Source documents: `sprint-26-30-roadmap-and-scenario-coverage.md`, `sprint-26-resource-semantics-and-waiting-behaviour-plan.md`

## Summary

The planned sprints represent a credible path from a capable process-flow modeller toward a study-grade discrete-event simulation platform. The sequence is well-justified and the prioritisation logic is sound.

## What works about the plan

**The ordering compounds correctly.** Each sprint depends on the output of the previous one:
- Richer semantics (Sprint 26) are useless without explainability (Sprint 27) — modellers cannot trust what they cannot trace.
- Explainability without experiment tooling (Sprint 28) limits the tool to teaching demonstrations rather than serious analysis.
- Experiments without benchmarks (Sprint 29) risk unsupported performance claims.
- Reusable model libraries (Sprint 30) are most valuable when the underlying engine is broad enough to make them worthwhile.

**The scenario coverage assessment is honest.** It correctly identifies where DES Studio is strong (queueing, multi-step flows, batching, sweeps) and where it is weak (preemption, store/container semantics, reliability modelling, synchronisation). Calling out "risky positioning" areas explicitly is a useful guard against overreach.

**The product positioning recommendation is sensible.** Becoming excellent at structured operational DES (service systems, healthcare flows, logistics, manufacturing process flow with contention) before expanding into general-simulation breadth is the right strategy for a browser-native tool with a small dependency footprint.

## What deserves scrutiny

**Sprint 26 scope vs. delivery risk.** The sprint targets formal resource/waiting contracts and contention handling, which is the most technically ambitious of the five. The current progress shows good momentum (ADR-013, ADR-014, shared helpers wired), but the remaining validation guidance (F26.6) and capability guide (F26.8) packages are essential for Sprint 26 to deliver usable value — not just engine internals. If those slip, the sprint effectively ships invisible infrastructure.

**Interruption/preemption deferral.** ADR-014 defers first-class preemption explicitly. This is the correct call for Sprint 26 (the engine needs cleaner foundations first), but it means a significant class of realistic scenarios — emergency department triage escalation, manufacturing line preemption, priority call handling — remain awkward to model for at least two more sprints. The plan should surface this trade-off more clearly to modellers.

**F26.8 (capability guide) is critical, not optional.** It is listed as P2 and the exit gate allows deferring it with justification. I would argue it should be a hard requirement. Engine semantics that cannot be explained to a modeller in concrete terms are semantics that will not be used. Without the guide and sample models, the investment in Sprint 26 engine work yields less product differentiation.

**Sprint 30 library expansion depends on unknowns.** Reusable scenario packs are high-value, but their quality depends directly on the maturity of Sprints 27-29. If debugging, experiments, or benchmarks are incomplete going into Sprint 30, the library will be built on uncertain ground. The plan should define a go/no-go gate at the end of Sprint 29 before committing to library expansion.

## What is missing

| Gap | Why it matters |
|---|---|
| **Performance envelope commitment** | Sprint 29 targets benchmarks, but there is no stated target for model scale (entities, events, replications) that the engine should support. Without this, "performance hardening" is unbounded. |
| **Export/interop story** | There is no sprint dedicated to SimPy export, CSV trace export, or integration with external analysis tools. For many users, the ability to export and validate externally is a trust prerequisite. |
| **Multi-user collaboration on models** | After Sprint 21's platform work, collaborative editing and shared experiments remain unaddressed. This limits the teaching and consulting use cases. |
| **Modeller onboarding funnel** | Templates exist, but there is no structured onboarding progression (tutorial -> guided example -> blank model) planned. For a teaching-oriented tool, this is a notable omission. |

## Overall view

The Sprint 26-30 roadmap is the strongest-looking plan in the project's history. It shows a clear understanding of where the product is versus where mature simulation tools sit, and it picks the right battles:

1. Fix the semantic floor (contention, waiting, ownership)
2. Make behaviour explainable
3. Make analysis serious
4. Measure and build confidence
5. Package into reusable value

If the team executes these five sprints without scope creep, DES Studio will have closed the largest gaps relative to established open-source tools while preserving its browser-native differentiation. The main risk is not the direction — it is whether each sprint is given enough room to deliver its full value chain (engine + guidance + examples) rather than cutting the user-facing piece to meet a deadline.
