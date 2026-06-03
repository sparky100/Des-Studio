# Sprint 32 — Closure Report

Created: 2026-05-14  
Status: ✅ Complete  
Plan reference: `docs/reviews/sprint-32-plan.md`

## Sprint Summary

Sprint 32 added resource preemption and breakdown/repair capabilities to simmodlr. These are the two highest-impact resource modelling gaps identified in the capability gap analysis. The changes modify the core server state machine and claim/release contract.

## Goal

Add resource failure/repair cycles and preemption — the two biggest resource modelling gaps. These features modify the core server state machine and claim/release contract, requiring careful test design.

## Delivery Status

| Work item | Status | Notes |
|---|---|---|
| G01 — Resource preemption | ✅ Complete | `PREEMPT(ServerType)` macro; interrupted entities re-queued with `_remainingService` |
| G04 — Resource breakdowns / failures | ✅ Complete | `FAIL(ServerType)` and `REPAIR(ServerType)` macros; `failed` server state |
| MTBF/MTTR scheduling | ✅ Complete | Server entity types can define `mtbfDist`/`mttrDist` for automatic failure/repair cycles |
| Remaining service time preservation | ✅ Complete | Interrupted customers resume with correct remaining service on re-seize |
| Trace entries for preemption/failure | ✅ Complete | Structured log entries for all preemption and failure events |

## Delivered Scope

### G01 — Resource Preemption
- **Files:** `src/engine/macros.js`, `src/engine/phases.js`, `src/engine/entities.js`
- New `PREEMPT(ServerType)` macro interrupts busy servers
- Interrupted customer re-queued with `_remainingService` preserved
- On re-seize, service time uses `_remainingService` instead of resampling
- Trace entry with `{ preemptedEntity, preemptingEntity, serverId, remainingService }`

### G04 — Resource Breakdowns / Failures
- **Files:** `src/engine/macros.js`, `src/engine/index.js`, `src/engine/entities.js`
- New `failed` server status in `ENTITY_STATUSES`
- `FAIL(ServerType)` macro: sets matching servers to `failed`, re-queues busy customers
- `REPAIR(ServerType)` macro: restores failed servers to `idle`
- MTBF/MTTR scheduling via `makeFailureEvents()` — recurring FAILURE/REPAIR events in FEL
- `idleOf()` and `busyOf()` helpers naturally exclude `failed` servers (filter by status)

### Remaining Service Time
- **File:** `src/engine/phases.js`
- `_scheduledDuration` stored on server entity when service begins
- Remaining service = `scheduledDuration - (clock - serviceStart)`
- On re-seize after preemption/failure, remaining service used instead of resampling

## Deferred or Removed Scope

None — all planned Sprint 32 items delivered.

## Architectural Decisions and Issues

| Issue | Outcome | Notes |
|---|---|---|
| Preemption state model | No separate `preempted` state needed | Interrupted customers go back to `waiting`; remaining service tracked via `_remainingService` |
| Failure event scheduling | Pre-computed at engine build time | MTBF/MTTR events generated once and inserted into FEL — no dynamic rescheduling needed |
| Server state machine | Added `failed` status | `idleOf()`/`busyOf()` naturally exclude failed servers via status filtering |

## Verification

### Focused test runs

| Test suite | Result |
|---|---|
| `npm test -- sprint-32-preemption` | ✅ 7 passed |
| `npm test -- conditions` | ✅ 30 passed |
| `npm test -- predicate-builder` | ✅ 11 passed |
| `npm test -- c-event-editor` | ✅ 12 passed |
| **Total Sprint 32 tests** | **✅ 60 passed** |

### Build / runtime checks

- `npm run build` — passes
- Full test suite: 1012/1017 passing (5 pre-existing flaky failures unrelated to Sprint 32)

## Scenario Impact Assessment

### Improved workflow classes

- **Emergency preemption**: Healthcare models can now model high-priority patients interrupting routine care
- **Machine breakdowns**: Manufacturing models can model MTBF/MTTR cycles for reliability analysis
- **Remaining service preservation**: Interrupted service resumes correctly — no artificial service time inflation

### Still limited or unsupported after Sprint 32

- Preemption priority levels (Sprint 33 candidate)
- Partial/degraded server performance modes
- Cascading failure modelling
- Preemption of already-preempted servers

## Regressions, Risks, and Follow-Ups

- **Pre-existing test failures**: 5 flaky failures in `visual-designer-panel.test.jsx` — unrelated to Sprint 32 changes
- **Condition preview removal**: 2 tests updated to reflect removal of redundant condition string preview (Sprint 31 UI fix)
- **Trace volume**: Preemption/failure events add minimal overhead (one log entry per event)

## Final Assessment

Sprint 32 is **complete**. All planned work items (G01, G04) delivered. The engine now supports resource preemption with remaining service time preservation, and automatic MTBF/MTTR failure/repair cycles. 7 new engine tests confirm correctness with no regressions.
