# Sprint 27 Capability Guide — Simulation Debugging and Explainability

Created: 2026-05-13  
Sprint: Sprint 27  
Status: 🟡 Draft

## Purpose

This guide will explain the debugging and explainability capabilities delivered in Sprint 27 in modeller-facing terms.

It is intended to answer:

- what the product can now explain during a run
- how to inspect a waiting, blocked, or surprising entity
- how to understand queue/server selection decisions
- how to diagnose conditional-event behaviour
- what still remains out of scope

## Planned coverage

The completed guide should include:

- a practical “how to debug a difficult model” workflow
- explanation of event provenance and causal traces
- explanation of entity lifecycle inspection
- explanation of queue/resource arbitration reasoning
- explanation of C-event evaluation reasoning
- example scenarios showing how to use the new tools
- explicit boundaries where explainability is still partial

## Expected scenario walkthroughs

The completed guide should demonstrate at least:

1. a waiting-entity diagnosis example
2. a routing or unexpected exit-path example
3. a queue/resource contention explanation example
4. a C-event condition or restart-rule explanation example
5. a Phase C warning interpretation example where relevant

## Out-of-scope boundaries to document

The completed guide should also state clearly if any of the following remain limited after Sprint 27:

- very high-volume trace retention
- explainability across large replication batches
- fully persistent trace replay from saved runs
- deep historical browsing of all C-event evaluations
- explainability for still-deferred interruption/preemption semantics

## Completion note

Update this document at sprint close with:

- the actual delivered debugging surfaces
- the sample scenarios or models used to demonstrate them
- remaining limitations and follow-on recommendations for Sprint 28
