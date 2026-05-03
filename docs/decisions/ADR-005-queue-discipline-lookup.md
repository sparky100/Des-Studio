# ADR-005: Queue discipline lookup by entity type name in SEIZE macro

**Date:** 2026-05-03
**Status:** Accepted — pending formalisation in Sprint 2
**Sprint:** Sprint 1 (decision made); Sprint 2 (formalise with explicit queue ID binding)

## Context

The SEIZE macro (`macros.js`) must read the queue discipline (FIFO / LIFO / PRIORITY) from the model definition when selecting the next customer to serve. The model stores discipline on `Queue` objects in `model.queues`, but neither C-Events nor the SEIZE action carry an explicit reference to a queue ID.

Sprint 1 implemented LIFO and PRIORITY in `waitingOf()` (C2 fix). A lookup strategy was needed immediately to wire discipline into the SEIZE path without a model schema change.

## Decision

In Sprint 1, the SEIZE macro resolves the queue discipline by searching `model.queues` for a queue whose `name` matches the customer entity type name (case-insensitive). If found, the queue's `discipline` is passed to `waitingOf()`. If not found, FIFO is used as the default.

This is a **pragmatic interim decision**, not the target architecture. It was chosen because:
- Changing the model schema to add a `queueId` field to C-Event action objects was out of Sprint 1 scope (Sprint 1 is engine safety only).
- The heuristic works for standard single-queue models where the queue name matches the entity type name.
- It unblocks queue discipline testing without a schema migration.

## Alternatives Considered

**Explicit `queueId` reference on C-Event action:** The correct long-term design. Each SEIZE action would carry a `queueId` pointing to a specific queue node. This requires: (a) UI changes to the C-Event editor to add a queue picker, (b) model schema migration, (c) validation rule V4 update. This is the Sprint 2 target.

**Discipline on the entity type, not the queue:** Treating discipline as a property of the entity class rather than the queue. Rejected because a single entity type could theoretically join different queues with different disciplines in a more complex model. Queue is the correct owner.

## Consequences

### Positive
- Sprint 1 shipped working LIFO and PRIORITY without a schema change.
- FIFO fallback ensures no existing model breaks.

### Negative
- **G1 (MEDIUM):** If a queue's `name` does not match its entity type name exactly, SEIZE silently falls back to FIFO — the configured discipline is ignored with no error or warning. This is documented in the Known Issues register.
- **G2 (MEDIUM):** `evalCondition()` and the RENEGE macro call `waitingOf()` without a discipline parameter, always using FIFO for queue length counting and entity selection regardless of configured discipline. This affects condition token evaluation and renege target selection.
- The interim design must not persist beyond Sprint 2 — once explicit queue ID binding is implemented, the name-match heuristic must be removed.

### Rules added to CLAUDE.md
- G1 and G2 added to the Known Issues register (§10) to ensure they are not lost between sprints.
- Sprint 2 Task 1 is explicitly to formalise queue-to-event binding with an explicit `queueId` reference.

## Open Questions

Sprint 2 must resolve:
- Should the C-Event editor show a queue picker per action step, or should the queue be inferred from the entity type at runtime?
- If a model has no explicit queue nodes defined (uses the implicit default), what queue discipline applies? (Currently: FIFO by default — this is correct and should be preserved.)
