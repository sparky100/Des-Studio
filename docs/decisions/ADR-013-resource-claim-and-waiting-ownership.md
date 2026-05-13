# ADR-013: Resource Claim and Waiting Ownership Contract

**Date:** 2026-05-12  
**Status:** Accepted  
**Sprint:** Sprint 26

## Context

Sprint 26 focuses on resource semantics and waiting behaviour. The current engine already supports queue-to-server assignment, release, completion, and reneging, but the ownership contract is mostly implicit:

- a waiting customer is identified by `status === "waiting"` and often `queue`
- a serving customer is identified by `status === "serving"` and `serverId`
- a busy server is identified by `status === "busy"` and `currentCustId`

This works, but the claim relationship is spread across multiple fields and not always mirrored explicitly. As DES Studio moves toward richer contention, explainability, and possible interruption semantics, the runtime needs a clearer ownership contract without a full engine rewrite.

## Decision

Sprint 26 adopts an **explicit mirrored claim metadata contract** while preserving the current entity/server lifecycle model.

### Decision 1 — Keep the entity/server lifecycle model

The engine will continue to represent service ownership through customer and server entities rather than introducing a new request object or process object abstraction in Sprint 26.

This means:

- customers still move through `waiting -> serving -> done/reneged/waiting`
- servers still move through `idle -> busy -> idle`
- Three-Phase scheduling and macro-driven behaviour remain intact

### Decision 2 — Make active claims explicit and mirrored

When a customer is assigned to a server, both entities record the active claim in mirrored metadata:

- `customer.resourceClaim`
- `server.resourceClaim`

The claim stores:

- `customerId`
- `customerType`
- `serverId`
- `serverType`
- `queueName`
- `claimedAt`

This metadata is cleared on release or completion.

### Decision 3 — Centralize claim/release transitions in helper functions

Resource claim and release transitions are handled through shared helpers rather than re-encoding ownership mutation inline in multiple macros.

This allows:

- one place to enforce assignment preconditions
- one place to clear mirrored claim state
- a clearer base for future tracing and contention semantics

### Decision 4 — Defer full preemption/request-object semantics

Sprint 26 does **not** introduce:

- a new request object model
- full preemption/interruption semantics
- multi-stage resource reservation objects

Those remain follow-on decisions once claim ownership, release, and waiting semantics are more stable.

## Alternatives Considered

### Introduce a full request object abstraction now

Rejected for Sprint 26. While a request object model could be attractive long term, it would be a much larger architectural shift and would increase the risk of destabilizing the Three-Phase engine during a contract-hardening sprint.

### Leave ownership fully implicit

Rejected. The existing approach is adequate for basic flows but too weak for future explainability, deterministic contention reasoning, and richer resource semantics.

## Consequences

### Positive

- Makes active service ownership explicit
- Reduces hidden coupling across macros
- Provides a better base for debugging and causal tracing
- Keeps the Sprint 26 change set compatible with the current engine architecture

### Negative

- Does not by itself deliver preemption or interruption semantics
- Still relies on entity lifecycle states rather than a more expressive process/request abstraction
- Requires careful maintenance so mirrored claim metadata cannot drift

## Rules Added

- All active customer-to-server claims must be reflected on both sides of the relationship.
- Claim metadata must be cleared on release and completion.
- Resource ownership transitions should use centralized helpers rather than ad hoc field mutation where feasible.
- Any later move to preemption or request objects must be captured in a new ADR rather than introduced incrementally without a decision record.

## Open Questions

- Should future waiting semantics include an explicit `waitingFor` contract beyond queue membership?
- Should preemption be introduced as a first-class engine concept or constrained to narrower supported patterns?
- Should resource claims eventually be exposed directly in execution/debug UI surfaces?
