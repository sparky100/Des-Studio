# Sprint 26 — Resource Semantics and Waiting Behaviour

Created: 2026-05-12  
Status: ✅ Complete  
Sprint theme: Engine depth, waiting semantics, and resource behaviour  
Builds on:

- `docs/reviews/open-source-tool-gap-analysis.md`
- `docs/reviews/sprint-26-30-roadmap-and-scenario-coverage.md`
- `docs/reviews/simpy-architecture-review.md`
- `docs/reviews/simulation-architecture-review.md`
- `docs/reviews/sprint-25-completion-report.md`

## Goal

Expand simmodlr beyond its current process-flow core with richer resource and waiting semantics, while preserving:

- the browser-native JavaScript runtime
- Pidd's Three-Phase implementation
- deterministic reproducibility
- the existing structured modelling approach

This sprint is intended to increase modelling headroom for realistic service, healthcare, logistics, and manufacturing-style resource contention scenarios.

## Sprint Theme

This is a platform-depth sprint, not a UI-polish sprint.

The work should:

- formalize resource and waiting behaviour as first-class simulation contracts
- clarify how entities block, wake, compete, and resume
- reduce ambiguity around cancellation, contention, and queue ownership
- establish an architectural foundation for later debugging and experiment-workbench improvements

## Scope Guardrails

- Build on the existing engine, queue helpers, and macro system; do not rewrite the runtime.
- Preserve the Three-Phase Method and restart rule.
- Do not migrate the runtime to Python or SimPy.
- Use SimPy concepts only as design references where they improve the JavaScript engine contract.
- Keep UI work narrow and contract-driven unless a task explicitly requires a user-facing control or explanation surface.
- Record architectural decisions and unresolved structural questions in ADR form under `docs/decisions/`.
- Add or update regression tests before or alongside behaviour changes.
- No new dependencies unless explicitly reviewed first.

## Structured Work Items

| ID | Priority | Work item | Status | Primary areas | Acceptance criteria |
|---|---:|---|---|---|---|
| F26.1 | P0 | Define the Sprint 26 resource/waiting contract | ✅ Complete | `src/engine/index.js`, `src/engine/entities.js`, docs | One explicit contract for entity waiting, resource claims, release, wake-up ordering, and cancellation. |
| F26.2 | P0 | Formalize resource claims and contention handling | ✅ Complete | `src/engine/entities.js`, `src/engine/macros.js`, tests | Resource claim/release semantics are deterministic and covered by tests. |
| F26.3 | P0 | Clarify waiting-state ownership and lifecycle | ✅ Complete | `src/engine/entities.js`, `src/engine/index.js`, tests | Entities have an unambiguous waiting/blocking state model with no hidden ownership drift. |
| F26.4 | P1 | Evaluate and resolve interruption/preemption direction | ✅ Complete | ADR + engine surface | Decision recorded in ADR: implement now, defer, or constrain explicitly. |
| F26.5 | P1 | Add regression coverage for contention, release, cancellation, and wake-up ordering | ✅ Complete | `tests/engine/*` | Resource and waiting edge cases are locked down with deterministic tests. |
| F26.6 | P1 | Surface resource/waiting semantics in validation and modelling guidance where necessary | ✅ Complete | validation/docs/UI copy | Model authors can understand the supported contract without reading engine code. |
| F26.7 | P2 | Document scenario impact and deferred gaps | ✅ Complete | sprint docs + ADRs | Sprint closeout clearly states what scenario classes improved and what remains out of scope. |
| F26.8 | P2 | Produce a capability usage guide with sample models | ✅ Complete | docs + templates/examples | A post-sprint guide explains how to use the delivered capability set, with sample models demonstrating the new behaviours where practical. |

## Recommended Implementation Order

1. Define the desired waiting/resource contract in documentation first.
2. Record any structural decision needing an ADR before implementation drifts.
3. Add or tighten regression tests for current contention behaviour.
4. Implement resource/waiting semantics changes in the engine.
5. Update validation and modelling guidance to match the final contract.
6. Record deferred issues and scenario implications in the sprint closure report.

## Detailed Task Breakdown

## Authoritative Contract Snapshot

This section captures the Sprint 26 resource/waiting contract in one place. It is the working reference for engine, tests, and modeller-facing guidance.

### Waiting-state entry

- An entity enters an explicit waiting state when it is:
  - created by `ARRIVE`
  - returned to a queue by `RELEASE`
  - restored by `UNBATCH`
  - rerouted to a queue by conditional routing, probabilistic routing, overflow routing, or loop recirculation
- Entering the waiting state must go through `markEntityWaiting(...)`, not direct raw `status` / `queue` mutation.
- A waiting entity carries:
  - `status === "waiting"`
  - `queue`
  - `waitingSince`
  - `waitingFor = { kind: "queue", queueName, enteredAt }`

### Waiting-state exit

- An entity leaves the explicit waiting state when it:
  - is claimed by a server
  - reneges
  - exits the system directly from a routed or guarded path
  - is converted into another lifecycle form such as a completed batch parent
- Leaving the waiting state must clear `waitingSince` and `waitingFor`.

### Active resource claims

- Active service ownership is mirrored on both sides:
  - `customer.resourceClaim`
  - `server.resourceClaim`
- A valid active claim also aligns with:
  - `customer.status === "serving"`
  - `customer.serverId === server.id`
  - `server.status === "busy"`
  - `server.currentCustId === customer.id`
- Claim creation is centralized in `claimServerForEntity(...)`.
- Claim release is centralized in `releaseServerClaim(...)`.

### Resource release and wake-up ordering

- `COMPLETE()` and `RELEASE()` reject contradictory customer/server ownership rather than mutating into an impossible state.
- When a server becomes free, downstream wake-up ordering is determined by:
  1. Three-Phase C-event priority
  2. queue discipline for waiting-entity selection within an eligible queue
  3. deterministic idle-server ordering when several idle servers are eligible

### Cancellation semantics

- Sprint 26 treats reneging and direct route-to-exit outcomes as lifecycle cancellation/termination paths.
- `RENEGE(ctx)` only applies to an entity that is still waiting.
- If a reneging timer fires after the entity has already left the waiting state, the event is skipped and does not mutate the entity.
- Route-to-exit and loop-guard exit paths must:
  - clear explicit waiting ownership
  - mark the entity `done`
  - record `completionTime` and `sojournTime`
- Sprint 26 does not implement first-class interruption/preemption or scheduled-completion invalidation beyond the current claim-consistency guards. That remains deferred in `ADR-014`.

## F26.1 — Define the resource/waiting contract

### Tasks

- [x] Document current observed waiting and resource behaviour
- [x] Identify ambiguities in claim, release, wake-up, and cancellation order
- [ ] Define the authoritative contract for:
  - [x] waiting-state entry
  - [x] waiting-state exit
  - [x] claim ownership
  - [x] resource release
  - [x] wake-up ordering
  - [x] cancellation semantics
- [x] Record unresolved structural questions in the Architectural Issues Register below

### Progress notes

- Initial engine audit completed across `entities.js`, `macros.js`, `phases.js`, and the current engine test suite.
- Current observed contract: active service ownership was implied through `status`, `serverId`, and `currentCustId`, but not mirrored explicitly.
- ADR-013 records the accepted Sprint 26 direction for active resource claims and ownership tracking.
- Wake-up ordering is now tighter in practice:
  - C-event priority governs which eligible assignment fires first after release/completion
  - queue discipline governs waiting-entity selection within a queue
  - deterministic idle-server ordering now governs which idle server is claimed when several are eligible

### Risks / issues

- None yet

## F26.2 — Formalize resource claims and contention handling

### Tasks

- [x] Audit current claim/release behaviour in macros and helpers
- [x] Consolidate claim semantics into one authoritative path where feasible
- [x] Ensure release always produces deterministic downstream selection
- [x] Verify contention behaviour under FIFO/LIFO/PRIORITY policies where applicable
- [x] Add targeted regression tests before broadening semantics

### Progress notes

- Added centralized claim/release helpers in `src/engine/entities.js`:
  - `claimServerForEntity()`
  - `releaseServerClaim()`
- Wired `ASSIGN`, `RELEASE`, and `COMPLETE` through the shared helpers to reduce ad hoc ownership mutation.
- Added stale-claim protection in `COMPLETE()` and `RELEASE()` so contradictory customer/server ownership does not mutate the engine into an impossible state.
- Added explicit deterministic idle-server selection:
  - `sortResourceEntities()`
  - `selectIdleOf()`
- `ASSIGN` now uses a helper-backed idle-server selection rule instead of incidental array order.
- Added release-triggered wake-up coverage proving that higher-priority eligible C-events claim newly freed servers before lower-priority competitors.

### Risks / issues

- None yet

## F26.3 — Clarify waiting-state ownership and lifecycle

### Tasks

- [x] Define what it means for an entity to be waiting, serving, blocked, cancelled, or resumable
- [x] Remove or reduce hidden coupling between queue membership and active waiting semantics
- [x] Ensure lifecycle transitions cannot leave impossible mixed states
- [x] Add tests covering stale or double-owned waiting cases

### Progress notes

- Added explicit waiting-state helpers in `src/engine/entities.js`:
  - `markEntityWaiting()`
  - `clearWaitingState()`
- `ARRIVE`, `RELEASE`, `RENEGE`, `BATCH`, and `UNBATCH` now establish or clear waiting ownership more deliberately.
- `ASSIGN` clears explicit waiting ownership when service begins.
- Overflow and reroute-style `ARRIVE` branches now also establish waiting ownership explicitly instead of relying on raw `status: "waiting"` writes.
- `fireBEvent()` routing and loop-guard exit paths now use waiting helpers too, so conditional routing, probabilistic routing, and recirculation no longer bypass the Sprint 26 ownership contract.

### Risks / issues

- None yet

## F26.4 — Evaluate interruption/preemption direction

### Tasks

- [ ] Assess whether preemption/interruption should be:
  - [ ] implemented in Sprint 26
  - [ ] explicitly deferred
  - [ ] constrained to a narrower supported pattern
- [ ] Capture the decision in ADR form
- [ ] If implemented, define deterministic ordering and metric behaviour
- [ ] If deferred, document scenario impact and user-facing boundaries

### Progress notes

- Added initial regression coverage for mirrored claim metadata and claim cleanup on release and complete.
- Added regression coverage for explicit waiting ownership on arrival, assign, release, and renege transitions.
- Added stale-release / contradictory-claim regression coverage for `COMPLETE()` and `RELEASE()`.
- Added regression coverage for deterministic idle-server selection when multiple servers are idle.

### Risks / issues

- None yet

## F26.5 — Add regression coverage

### Tasks

- [x] Add tests for deterministic claim ordering
- [x] Add tests for release-triggered wake-up behaviour
- [x] Add tests for cancellation/removal while waiting
- [x] Add tests for double-release / stale-release protection
- [x] Add tests for impossible state prevention

### Progress notes

- Recorded explicit deferral in `ADR-014`.
- Sprint 26 will not implement first-class preemption/interruption.
- The requirement remains tracked for a later sprint after contention, wake-up ordering, and ownership contracts are more mature.
- Added focused regression coverage for:
  - release-triggered wake-up ordering
  - conditional/probabilistic routing preserving waiting ownership
  - loop-guard reroute and exit-to-system lifecycle cleanup

### Risks / issues

- None yet

## F26.6 — Validation and modelling guidance follow-through

### Tasks

- [x] Identify any validation rule updates implied by the new contract
- [x] Update relevant Execute/editor guidance where needed
- [x] Document modelling boundaries clearly for unsupported patterns

### Progress notes

- Audited the validation layer and found no immediate missing blocking rule specific to the Sprint 26 contract.
- Added an authoritative contract snapshot to this sprint plan so waiting/resource/cancellation semantics are no longer only implied by code and tests.
- Added modeller-facing guidance to `docs/simmodlr_User_Guide.md`, including the explicit note that first-class preemption/interruption is still unsupported.

### Risks / issues

- None yet

## F26.7 — Scenario impact and deferred gaps

### Tasks

- [x] Record which modelling scenarios improved materially
- [x] Record which scenarios remain partial after Sprint 26
- [x] Link deferred structural issues to ADRs or follow-on sprint candidates

### Progress notes

- Scenario classes improved by Sprint 26 are now being documented in the capability guide, with emphasis on multi-stage handoff, downstream priority routing, reneging, overflow/reroute, and recirculation flows.
- Deferred gaps are now being captured explicitly rather than left implicit, especially first-class preemption/interruption and pause/resume semantics.

### Risks / issues

- None yet

## F26.8 — Capability usage guide and sample models

### Tasks

- [x] Write a Sprint 26 capability guide explaining the delivered resource/waiting semantics in modeller-facing language
- [x] Include concrete modelling patterns showing when to use the new semantics
- [x] Create sample models, or extend existing templates, to demonstrate delivered capabilities where practical
- [x] Link the guide to the sample models so the examples are easy to run and inspect
- [x] Record any capability that remains engine-only or not yet surfaced well in the UI

### Progress notes

- Added as an explicit sprint-close deliverable at user request.
- Created [sprint-26-capability-guide.md](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/reviews/sprint-26-capability-guide.md).
- Added focused sample import models:
  - [priority-handoff-demo.json](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/examples/sprint-26/priority-handoff-demo.json)
  - [recirculation-exit-demo.json](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/examples/sprint-26/recirculation-exit-demo.json)
- The guide also points to broader existing templates that already demonstrate Sprint 26-relevant patterns.

### Risks / issues

- Sample models should demonstrate delivered capabilities only; they should not imply support for deferred features such as first-class preemption.

## Architectural Issues Register

Architectural issues must be recorded in ADR form if they change or may change long-lived contracts, data shapes, engine semantics, or public modelling behaviour.

| ID | Status | Issue | ADR | Notes |
|---|---|---|---|---|
| A26.1 | ✅ Deferred | Should simmodlr support interruption/preemption as a first-class engine concept now, or defer it explicitly? | `ADR-014` | Deferred explicitly so the requirement is preserved without destabilizing Sprint 26. |
| A26.2 | ✅ Recorded | Should resource claims remain macro-driven only, or evolve toward a more explicit engine-level abstraction? | `ADR-013` | Accepted interim answer: keep the entity/server lifecycle model, but make active claims explicit and mirrored. |
| A26.3 | ✅ Recorded | What is the canonical ownership model for waiting entities across queue membership, arbitration, and lifecycle state? | `ADR-013` | Waiting ownership is now explicit through `waitingFor`, `waitingSince`, and helper-led lifecycle transitions. |

## Issue Log

Use this section to record non-architectural sprint issues as they emerge.

| ID | Severity | Status | Summary | Action / owner |
|---|---|---|---|---|
| None at sprint close | — | — | — | — |

## Test and Verification Plan

| Area | Required verification |
|---|---|
| Resource claims | Deterministic tests for claim order and release order |
| Waiting lifecycle | Tests covering entry, exit, cancellation, and stale ownership prevention |
| Queue/resource contention | Tests for supported policies and wake-up ordering |
| Impossible states | Tests proving no double-owned or contradictory lifecycle states |
| Regression safety | Focused engine suites plus any affected Execute/validation tests |

### Verification completed so far

- `npm test -- three-phase entities macros conditional-routing probabilistic-routing recirculation warmup`
  - 192 passed

## Exit Gate

Sprint 26 is complete only when:

- F26.1-F26.5 are complete
- F26.8 is complete or explicitly deferred with justification
- any architectural decisions have been recorded in ADR form
- resource/waiting behaviour is documented, not implied
- deterministic regression tests cover the new contract
- the closure report records delivered scope, deferred scope, and scenario impact

## Definition of Done

- one explicit waiting/resource contract
- one recorded answer for each open architectural issue: accepted, rejected, or deferred
- regression coverage for contention and lifecycle edge cases
- project docs updated to reflect the sprint state
- a modeller-facing capability guide exists for the delivered Sprint 26 semantics, with examples where practical
