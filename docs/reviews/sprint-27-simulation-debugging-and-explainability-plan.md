# Sprint 27 — Simulation Debugging and Explainability

Created: 2026-05-13  
Status: 🟡 Planned  
Sprint theme: Trust, traceability, and modeller explainability  
Builds on:

- `docs/reviews/sprint-26-closure-report.md`
- `docs/reviews/sprint-26-capability-guide.md`
- `docs/reviews/sprint-26-30-roadmap-and-scenario-coverage.md`
- `docs/reviews/open-source-tool-gap-analysis.md`
- `docs/reviews/simulation-architecture-review.md`

## Goal

Make DES Studio easier to trust when a model behaves unexpectedly.

Sprint 27 is intended to add first-class debugging and explainability support around the existing engine, so a modeller can answer questions like:

- Why is this entity still waiting?
- Why did this C-event fire?
- Why did this queue or server get selected?
- Why did the model stop, loop, or trigger a warning?

## Sprint Theme

This is a traceability and modeller-trust sprint, not a semantics-rewrite sprint.

The work should:

- expose engine decisions without changing run semantics
- preserve deterministic reproducibility
- make rich engine behaviour inspectable through stable UI surfaces
- improve diagnosis of invalid or surprising models
- create a foundation for stronger experiment workflows in Sprint 28

## Scope Guardrails

- Build on the existing engine, run log, execute canvas, and bottom-panel surfaces; do not rewrite the runtime.
- Preserve Pidd's Three-Phase Method and the Sprint 26 waiting/resource contract.
- Treat explainability as an observational layer first; do not smuggle in behavioural changes unless a trace gap reveals a correctness bug.
- Keep new data structures explicit and documented. Avoid hidden ad hoc debug fields.
- Keep UI work focused on modeller diagnosis, not broad visual redesign.
- Record structural decisions and deferred items in ADR form where needed.
- Add or update regression tests before or alongside explainability behaviour changes.
- No new dependencies unless explicitly reviewed first.

## Structured Work Items

| ID | Priority | Work item | Status | Primary areas | Acceptance criteria |
|---|---:|---|---|---|---|
| F27.1 | P0 | Define the Sprint 27 explainability contract | ☐ Not started | docs, `src/engine`, `src/ui/execute` | One explicit contract describes what trace data exists, when it is emitted, and which UI surfaces consume it. |
| F27.2 | P0 | Add event provenance and causal trace records | ☐ Not started | `src/engine/index.js`, `src/engine/phases.js`, `src/engine/macros.js` | A modeller can inspect why a B-event or C-event fired, what it changed, and what it scheduled or routed next. |
| F27.3 | P0 | Add entity lifecycle and waiting inspection | ☐ Not started | `src/engine/entities.js`, `src/ui/execute/*` | A modeller can inspect an entity and see status, queue/resource ownership, last transition, and current waiting reason. |
| F27.4 | P1 | Explain queue/resource arbitration and C-event evaluation | ☐ Not started | engine trace + execute UI | The product can show why a queue entity or server was selected and why C-events were true, false, skipped, or restarted. |
| F27.5 | P1 | Link visual canvas, logs, entities, and trace panels | ☐ Not started | `src/ui/execute`, `src/ui/visual-designer` | Selecting a node, entity, or log item can drive the related inspection surface without losing run context. |
| F27.6 | P1 | Add explainability regression coverage and performance guardrails | ☐ Not started | `tests/engine/*`, `tests/ui/*` | Trace output is deterministic, stable, and does not materially degrade normal runs. |
| F27.7 | P2 | Update modeller-facing guidance and debugging workflow docs | ☐ Not started | user docs + sprint docs | A modeller can follow a documented workflow to diagnose waiting, starvation, routing, and unstable-condition issues. |
| F27.8 | P2 | Produce a capability guide with sample debug scenarios | ☐ Not started | docs + examples | A post-sprint guide explains how to use the new explainability tooling, with small sample models or run scenarios demonstrating it. |

## Recommended Implementation Order

1. Define the explainability contract and data model before adding UI surfaces.
2. Add engine-level trace emission for the smallest useful decision set first.
3. Surface one coherent entity/debug inspector before broadening UI reach.
4. Add arbitration and condition-evaluation reasoning once provenance is stable.
5. Link logs, canvas, and entity inspection once the underlying trace contract is trustworthy.
6. Update guidance and produce example-driven capability documentation at the end of the sprint.

## Detailed Task Breakdown

## Authoritative Contract Snapshot

This section captures the intended Sprint 27 explainability contract in one place. It is the working reference for engine, UI, tests, and modeller-facing guidance.

### Trace principles

- Trace output is observational, not behavioural.
- Trace ordering must remain deterministic for a given seed and model.
- Trace records must be structured objects, not free-text strings only.
- The UI may render a human-readable explanation, but raw structured trace data must remain available for testing and future tooling.

### Minimum trace categories

- clock advancement and phase boundaries
- B-event execution
- C-event evaluation attempts
- C-event firing and restart behaviour
- queue selection reasoning
- resource/server selection reasoning
- entity lifecycle transitions
- routing / exit / reneging outcomes
- warning or truncation events that materially affect interpretation

### Entity-debug contract

For an inspectable entity, the runtime should be able to explain:

- current lifecycle state
- current queue or server/resource ownership
- last significant state transition
- why it is waiting, serving, done, or removed
- relevant timestamps such as arrival, waitingSince, serviceStart, completionTime

### Arbitration-debug contract

For a queue/resource selection decision, the runtime should be able to explain:

- which candidates were eligible
- which ordering rule was used
- which candidate won and why
- whether any candidate was skipped and why

### Condition-debug contract

For a C-event evaluation pass, the runtime should be able to explain:

- whether the condition evaluated true or false
- which predicate clause failed or passed
- whether the event fired, was skipped, or was revisited after restart
- whether the Phase C pass cap warning affected interpretation

## F27.1 — Define the explainability contract

### Tasks

- [ ] Audit the current run log, snapshot structure, and execution UI surfaces
- [ ] Identify the minimum structured trace fields needed for diagnosis
- [ ] Define authoritative contracts for:
  - [ ] event provenance
  - [ ] entity lifecycle inspection
  - [ ] arbitration reasoning
  - [ ] condition evaluation reasoning
  - [ ] warning and truncation traceability
- [ ] Record unresolved structural questions in the Architectural Issues Register below

### Progress notes

- Not started

### Expected outcome

- One documented trace contract that all Sprint 27 implementation work builds against

### Risks / issues

- None yet

## F27.2 — Add event provenance and causal trace records

### Tasks

- [ ] Add structured trace records for:
  - [ ] Phase A clock advance
  - [ ] B-event execution
  - [ ] C-event evaluation and firing
  - [ ] macro-side effects that materially change entity or queue state
- [ ] Record what new B-events are scheduled and why
- [ ] Record route-to-queue vs route-to-exit outcomes explicitly
- [ ] Ensure trace order is deterministic under fixed seed replay

### Progress notes

- Not started

### Expected outcome

- The engine emits enough causal trace to explain what happened in a run without reading raw code

### Risks / issues

- Trace volume could become too noisy without careful scope control

## F27.3 — Add entity lifecycle and waiting inspection

### Tasks

- [ ] Define the minimum inspectable entity-debug view model
- [ ] Surface entity lifecycle details in Execute UI
- [ ] Show waiting/resource ownership fields introduced in Sprint 26 where relevant
- [ ] Show last transition and current blocking reason where available
- [ ] Ensure entity inspection stays stable during auto-run and stepping

### Progress notes

- Not started

### Expected outcome

- A modeller can click or select an entity and understand its current state and most recent path through the model

### Risks / issues

- Overloading the entity table without a clearer detail surface

## F27.4 — Explain queue/resource arbitration and C-event evaluation

### Tasks

- [ ] Expose queue selection reasoning
- [ ] Expose idle-server/resource selection reasoning
- [ ] Show why a C-event condition is currently true or false
- [ ] Show when a lower-priority eligible C-event was not reached because of restart order
- [ ] Surface skipped stale events or contradictory contexts in a readable way

### Progress notes

- Not started

### Expected outcome

- A modeller can explain why a selection or condition result occurred using first-class product support

### Risks / issues

- Condition traces may become too verbose unless the UI groups or summarizes them well

## F27.5 — Link visual canvas, logs, entities, and trace panels

### Tasks

- [ ] Tighten selection linking between live canvas nodes and filtered logs
- [ ] Add trace-to-entity and entity-to-trace navigation
- [ ] Add trace-to-node or event navigation where practical
- [ ] Preserve stepping/auto-run usability while inspection is open
- [ ] Avoid distracting layout thrash during live updates

### Progress notes

- Not started

### Expected outcome

- The user can move across the visual view, log, entity state, and debug explanation without losing context

### Risks / issues

- Live updates could still destabilize the inspection panel if not carefully isolated

## F27.6 — Add explainability regression coverage and performance guardrails

### Tasks

- [ ] Add engine tests for trace determinism and completeness of critical events
- [ ] Add UI tests for entity inspection, trace panels, and linked selection flows
- [ ] Verify trace data does not mutate engine behaviour
- [ ] Add practical guardrails for trace volume and performance
- [ ] Record any intentionally truncated trace behaviour explicitly

### Progress notes

- Not started

### Expected outcome

- Trace tooling is testable, replayable, and safe to keep on by default or under a predictable mode

### Risks / issues

- Trace generation may increase memory pressure on long or replicated runs

## F27.7 — Update modeller-facing guidance and debugging workflow docs

### Tasks

- [ ] Add a documented debugging workflow for difficult models
- [ ] Explain how to diagnose:
  - [ ] waiting/blocking surprises
  - [ ] queue starvation or fairness concerns
  - [ ] routing mistakes
  - [ ] unstable C-event conditions
  - [ ] run-time warnings such as Phase C pass-cap events
- [ ] Align UI wording and help text with the final Sprint 27 surfaces

### Progress notes

- Not started

### Expected outcome

- Modellers can use the debugging tooling without reverse-engineering the engine

### Risks / issues

- None yet

## F27.8 — Produce a capability guide with sample debug scenarios

### Tasks

- [ ] Write a modeller-facing capability guide in the same style as Sprint 26
- [ ] Add small sample scenarios or example runs covering:
  - [ ] waiting diagnosis
  - [ ] routing explanation
  - [ ] C-event evaluation explanation
  - [ ] contention/arbitration explanation
  - [ ] Phase C warning interpretation example where relevant
- [ ] Record remaining unsupported explainability gaps

### Progress notes

- Not started

### Expected outcome

- A practical guide and examples demonstrate how the new debugging/explainability tooling is meant to be used

### Risks / issues

- None yet

## Architectural Issues Register

Use this section to record structural issues discovered during the sprint in a standard form.

| ID | Topic | Status | Summary | Action / reference |
|---|---|---|---|---|
| A27.1 | Explainability data model | Open | Need one stable structured trace contract rather than scattered ad hoc log metadata. | Resolve in F27.1 |
| A27.2 | Trace volume and retention | Open | Need a policy for how much trace data to keep in-memory for long or replicated runs. | Evaluate in F27.6 |
| A27.3 | Cross-surface linking | Open | Need a clear ownership model between log selection, node selection, and entity inspection to avoid stale UI state. | Evaluate in F27.5 |

## Acceptance Summary

Sprint 27 is complete when:

- a modeller can inspect why a specific entity is waiting, serving, done, or removed
- a modeller can inspect why a queue or server selection occurred
- a modeller can inspect why a C-event fired or did not fire
- logs, canvas, and entity inspection are linked coherently
- trace output is deterministic and covered by focused tests
- modeller-facing guidance and examples explain how to use the new tooling
