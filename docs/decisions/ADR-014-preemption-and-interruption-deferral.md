# ADR-014: Defer First-Class Preemption and Interruption Beyond Sprint 26

**Date:** 2026-05-12  
**Status:** Accepted  
**Sprint:** Sprint 26

## Context

Sprint 26 is focused on resource semantics and waiting behaviour. During the sprint kickoff and early engine work, one of the main open architectural questions was whether DES Studio should introduce first-class preemption or interruption semantics immediately.

There is clear product value in this area:

- emergency and escalation scenarios
- higher-priority service takeover
- more realistic healthcare and operational models
- future parity with richer simulation engines

However, the current Sprint 26 work is still establishing a firmer contract for:

- active service ownership
- explicit waiting ownership
- claim/release consistency
- stale or contradictory state protection
- deterministic contention handling

Introducing interruption/preemption before those contracts are fully settled would increase implementation risk and make the engine harder to reason about.

## Decision

DES Studio will **not** implement first-class preemption or interruption semantics in Sprint 26.

Sprint 26 will instead focus on:

- deterministic contention and wake-up ordering
- impossible-state protection
- explicit ownership contracts for waiting and active claims
- regression coverage around claim/release/lifecycle integrity

Preemption/interruption remains a tracked requirement and should be revisited in a later sprint once the resource/waiting contract is more mature.

## Alternatives Considered

### Implement limited preemption now

Rejected for Sprint 26. Even a constrained version would require new decisions about:

- ordering and fairness
- metric treatment when service is interrupted
- customer/server lifecycle transitions
- scheduled completion invalidation or rebinding
- explainability and debugging surfaces

Those changes would compound the risk of a contract-hardening sprint.

### Ignore the requirement entirely

Rejected. The requirement is valuable and should remain visible in both roadmap and architectural records.

## Consequences

### Positive

- keeps Sprint 26 tightly focused
- reduces risk while the engine contract is still being clarified
- ensures contention and ownership semantics are stabilized first
- preserves room for a cleaner future design

### Negative

- DES Studio still cannot model interruption-heavy scenarios as a first-class capability
- some higher-value operational scenarios remain partially supported rather than fully credible
- users may still need to approximate escalation behaviour using indirect patterns

## Requirement Tracking

This requirement is **deferred, not dropped**.

It should remain visible in:

- Sprint 26 closure reporting
- the forward sprint roadmap
- scenario coverage analysis for unsupported or partially supported models

## Follow-On Recommendation

Revisit first-class preemption/interruption only after:

1. waiting and claim ownership contracts are stable
2. contention and wake-up ordering are explicit and tested
3. debugging/explainability work is further along

That suggests a future sprint after the core Sprint 26 engine contract work has landed, rather than within the current sprint.
