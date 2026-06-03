# Sprint 26 — Closure Report

Created: 2026-05-12  
Status: ✅ Complete  
Plan reference:

- `docs/reviews/sprint-26-resource-semantics-and-waiting-behaviour-plan.md`

## Sprint Summary

Sprint 26 strengthened simmodlr's engine-level waiting and resource semantics without rewriting the runtime. The sprint made active service claims explicit and mirrored, introduced an explicit waiting-ownership contract, tightened stale-claim and stale-waiting protections, documented the deferred interruption/preemption boundary, and added focused regression coverage for contention, routing, recirculation, and lifecycle cleanup.

## Goal

Expand simmodlr's resource and waiting semantics while preserving deterministic Three-Phase behaviour and the browser-native JavaScript runtime.

## Delivery Status

| Work item | Status | Notes |
|---|---|---|
| F26.1 — Define the Sprint 26 resource/waiting contract | ✅ Complete | The plan now contains an authoritative contract snapshot covering waiting entry/exit, active claims, wake-up ordering, and cancellation semantics. |
| F26.2 — Formalize resource claims and contention handling | ✅ Complete | Shared claim/release helpers landed; stale contradictory claims are rejected; idle-server selection is deterministic; release-triggered wake-up ordering is covered by tests. |
| F26.3 — Clarify waiting-state ownership and lifecycle | ✅ Complete | Explicit waiting ownership helpers landed; arrival, reroute, release, routing, recirculation, batch, and renege paths now use the same lifecycle contract. |
| F26.4 — Evaluate and resolve interruption/preemption direction | ✅ Complete | Deferred explicitly in `ADR-014`; requirement preserved for a later sprint. |
| F26.5 — Add regression coverage | ✅ Complete | Focused engine coverage added for claim metadata, waiting ownership transitions, stale-claim protection, deterministic idle-server selection, release-triggered wake-up ordering, and routing/recirculation lifecycle cleanup. |
| F26.6 — Surface semantics in validation and modelling guidance | ✅ Complete | Contract guidance now exists in sprint docs and the user guide; no new validation rule was required in this slice. |
| F26.7 — Document scenario impact and deferred gaps | ✅ Complete | Scenario classes and deferred capability boundaries are recorded in the capability guide and this closure report. |
| F26.8 — Produce a capability usage guide with sample models | ✅ Complete | Capability guide completed, with two focused sample import models and references to broader templates. |

## Delivered Scope

- Added explicit waiting ownership helpers in `src/engine/entities.js`:
  - `markEntityWaiting()`
  - `clearWaitingState()`
- Added explicit mirrored claim helpers in `src/engine/entities.js`:
  - `claimServerForEntity()`
  - `releaseServerClaim()`
- Added deterministic idle-server arbitration helpers so multiple idle resources no longer depend on incidental array order.
- Routed `ARRIVE`, `ASSIGN`, `RELEASE`, `COMPLETE`, `RENEGE`, `BATCH`, and `UNBATCH` through the stronger ownership contract where applicable.
- Tightened B-event routing and loop-guard exit cleanup in `src/engine/phases.js` so route-to-queue and route-to-exit paths participate in the same waiting lifecycle rules.
- Added ADRs for:
  - explicit claim/waiting ownership direction (`ADR-013`)
  - explicit preemption/interruption deferral (`ADR-014`)
- Added modeller-facing guidance in `docs/simmodlr_User_Guide.md`.
- Added Sprint 26 capability guidance in [sprint-26-capability-guide.md](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/reviews/sprint-26-capability-guide.md).
- Added sample models:
  - [priority-handoff-demo.json](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/examples/sprint-26/priority-handoff-demo.json)
  - [recirculation-exit-demo.json](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/docs/examples/sprint-26/recirculation-exit-demo.json)

## Deferred or Removed Scope

- First-class preemption/interruption remains deferred by design under `ADR-014`.
- Scheduled completion invalidation/rebinding, paused-service resume semantics, and richer request-object/resource abstractions remain out of scope for Sprint 26.
- No major UI/editor expansion was included beyond narrow guidance/documentation follow-through.

## Architectural Decisions and Issues

Record the ADRs and key structural decisions associated with this sprint.

| Issue | Outcome | ADR / reference | Notes |
|---|---|---|---|
| A26.1 — Interruption/preemption direction | Deferred explicitly | `ADR-014` | Requirement preserved; not implemented in Sprint 26. |
| A26.2 — Resource abstraction direction | Accepted (interim) | `ADR-013` | Keep the entity/server lifecycle model, but make active claims explicit and mirrored. |
| A26.3 — Waiting ownership model | Accepted for Sprint 26 scope | `ADR-013` | Waiting ownership is now explicit through helper-led lifecycle transitions plus `waitingFor` / `waitingSince` metadata. |

## Verification

### Focused test runs

- `npm test -- three-phase entities macros conditional-routing probabilistic-routing recirculation warmup`
  - 192 passed

### Build / runtime checks

- `npm run build`
  - passed locally

## Scenario Impact Assessment

Document which modelling scenarios improved materially and which still remain limited.

### Improved scenario classes

- Multi-stage handoff and release-to-next-queue models
- Healthcare triage/referral flows with downstream priority handoff
- Waiting abandonment models using reneging
- Finite-capacity overflow and reroute flows
- Recirculation/rework flows with explicit loop-guard cleanup
- Batch/unbatch flows that need clearer waiting ownership across lifecycle transitions

### Still limited or unsupported after Sprint 26

- First-class interruption/preemption
- Mid-service priority takeover
- Pause/resume semantics for partially completed service
- Rich request-object/resource abstractions
- More general synchronization or wait-for-many coordination patterns

## Capability Guide Deliverables

Record the modeller-facing guidance and example models created to explain Sprint 26 outcomes.

### Documentation

- Completed:
  - authoritative waiting/resource/cancellation contract snapshot added to the Sprint 26 plan
  - user-facing waiting/resource ownership guidance added to `docs/simmodlr_User_Guide.md`
  - capability guide added at `docs/reviews/sprint-26-capability-guide.md`

### Sample models / examples

- Completed:
  - `docs/examples/sprint-26/priority-handoff-demo.json`
  - `docs/examples/sprint-26/recirculation-exit-demo.json`
  - guide also references existing templates with relevant coverage

## Regressions, Risks, and Follow-Ups

- The committed repo must land the engine helper changes, phases/macros integration, tests, ADRs, and docs together; partial commits produce import/contract mismatches.
- The main follow-on architectural requirement remains first-class interruption/preemption.
- A likely next sprint should focus on debugging/explainability so richer ownership semantics are easier to inspect in the UI.

## Final Assessment

Sprint 26 is complete. It delivered a stronger and more explicit lifecycle contract for waiting entities and active resource claims, preserved deterministic Three-Phase behaviour, and deferred preemption cleanly instead of leaving it as an ambiguous half-feature. The engine is now better positioned for later explainability and richer operational modelling without taking on a destabilizing rewrite.
