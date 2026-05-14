# Sprint 32 — Resource Reliability

**Status:** Proposed | **Started:** TBD | **Completed:** TBD

## Goal

Add resource failure/repair cycles and preemption — the two biggest resource modelling gaps. These features modify the core server state machine and claim/release contract, requiring careful test design.

## Features

| Feature | Gap # | Priority | Approach | Effort |
|---------|-------|----------|----------|--------|
| **Resource preemption** | G01 | **High** | New server state `preempted`; `PREEMPT(ServerType)` macro; interrupted entity re-queues with `_remainingService`; schedule resume B-event. | High |
| **Resource breakdowns / failures** | G04 | **High** | `failed` server state; `FAIL(ServerType)` and `REPAIR(ServerType)` macros; MTBF/MTTR as recurring B-events; failed server excluded from `idle().count`. | High |

## Implementation Details

### G01 — Resource Preemption

**Files:** `src/engine/entities.js`, `src/engine/macros.js`, `src/engine/phases.js`

- Add `preempted` to `ENTITY_STATUSES` in `entities.js`.
- New `PREEMPT(ServerType)` macro in `macros.js`:
  - Find busy server of matching type.
  - If found, interrupt current customer: compute `_remainingService = serviceStart + scheduledDuration - clock`.
  - Release server claim, set server to `preempted` briefly, then `busy` with new customer.
  - Interrupted customer re-queues with `_remainingService` preserved.
  - When re-seized, service time = `_remainingService` (or resample if not set).
- Trace entry for preemption event with `{ preemptedEntity, preemptingEntity, serverId, remainingService }`.

**Tests:**
- Preemption: high-priority entity preempts low-priority in-service entity.
- Interrupted entity resumes with correct remaining service time.
- No preemption when no busy server available.
- Preemption + warm-up: remaining service truncated correctly.
- Regression: existing ASSIGN/COMPLETE tests unchanged.

### G04 — Resource Breakdowns / Failures

**Files:** `src/engine/entities.js`, `src/engine/macros.js`, `src/engine/phases.js`, `src/engine/index.js`

- Add `failed` to `ENTITY_STATUSES` in `entities.js`.
- New `FAIL(ServerType)` and `REPAIR(ServerType)` macros in `macros.js`:
  - `FAIL`: set matching idle/busy servers to `failed`. Busy servers' customers re-queue with `_remainingService`.
  - `REPAIR`: set failed servers back to `idle`.
- MTBF/MTTR scheduling: server entity type gains `mtbf` and `mttr` distribution fields. Engine schedules recurring FAIL/REPAIR B-events.
- `idleOf()` and `busyOf()` helpers exclude `failed` servers.
- Execute canvas: failed node state visual (red overlay, failure count badge).

**Tests:**
- Server failure during service: customer re-queues with remaining service.
- MTBF/MTTR scheduling: failures occur at correct intervals.
- Failed server excluded from idle count.
- Repair restores server to idle pool.
- Regression: existing shift change tests unchanged.

## Exit Gate

- All features tested with fixed seeds.
- No regressions in existing 1000+ test suite.
- 2 new templates: hospital emergency (preemption) and manufacturing (breakdown/repair).
- `npm test -- --run` passes.
- `npm run build` passes.

## Sprint History Update

Add to AGENTS.md §20:

| Sprint | Status | Completed | Description |
|--------|--------|-----------|-------------|
| Sprint 32 | Proposed | TBD | Resource Reliability: preemption, breakdowns/failures with MTBF/MTTR |
