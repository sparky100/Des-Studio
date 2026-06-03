# Sprint 25 Completion Report

Completed: 2026-05-12  
Sprint: Simulation Contract Consolidation

## Executive Summary

Sprint 25 is complete.

The sprint closed the remaining contract ambiguity that Sprint 24 surfaced:

- the `V8` source/sink validation rule is now explicit and consistent
- warm-up behavior for in-flight entities is defined, implemented, and tested
- queue/entity arbitration now flows through one shared engine selection path
- SimPy-informed guidance is recorded as architecture guidance, not runtime migration

No new dependencies were introduced. The browser runtime remains JavaScript and preserves the existing Three-Phase engine structure.

## Delivered Scope

| Work item | Status | Outcome |
|---|---|---|
| F25.1 V8 validation contract | ✅ Complete | Missing both source and sink is a blocking validation error; exactly one missing side is a warning. |
| F25.2 Warm-up semantics for in-flight entities | ✅ Complete | Active entities survive warm-up; scheduled completions remain valid; wait/service/sojourn metrics are truncated at the warm-up boundary. |
| F25.3 Queue/entity arbitration service | ✅ Complete | `ASSIGN`, `BATCH`, and `RENEGE_OLDEST` now share one helper-led arbitration path. |
| F25.4 Contract-level regression coverage | ✅ Complete | Focused tests cover V8 policy, warm-up truncation, in-flight completions, and arbitration equivalence. |
| F25.5 SimPy-style documentation follow-through | ✅ Complete | Project docs now describe the JavaScript equivalents of the SimPy-inspired patterns used in Sprint 25. |

## Code Changes

### Engine contract updates

- [src/engine/validation.js](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/validation.js)
  - Encodes the final `V8` rule:
    - both source and sink missing: blocking error
    - source-only or sink-only: warning

- [src/engine/index.js](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/index.js)
  - Tracks a warm-up statistics reset boundary
  - Truncates wait, service, sojourn, and wait-distribution metrics at warm-up
  - Preserves in-flight entity/event context while resetting statistical counting

- [src/engine/macros.js](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/macros.js)
  - Records stage timing fields needed for post-warm-up truncation
  - Routes selection-sensitive macros through shared helper-led arbitration

- [src/engine/entities.js](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/entities.js)
  - Adds centralized arbitration helpers for:
    - queue lookup
    - queue discipline comparators
    - waiting selection by type
    - waiting selection by queue

### Regression coverage

- [tests/engine/validation.test.js](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/tests/engine/validation.test.js)
  - Covers the resolved `V8` contract

- [src/engine/__tests__/warmup.test.js](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/__tests__/warmup.test.js)
  - Covers waiting across warm-up
  - Covers in-service completion across warm-up
  - Covers truncated post-warm-up summary metrics

- [src/engine/__tests__/macros.test.js](/C:/Users/parki/OneDrive/Documents/Projects/simmodlr/src/engine/__tests__/macros.test.js)
  - Covers centralized arbitration behavior for `RENEGE_OLDEST` and `BATCH`

## SimPy-Informed Outcome

Sprint 25 followed the SimPy architecture review recommendation for partial migration guidance only:

- no move to Python or direct SimPy runtime adoption
- explicit JavaScript equivalents for:
  - validation contract enforcement
  - timeout/context preservation through warm-up
  - `Resource` / `PriorityResource`-like arbitration behavior

The result is a more idiomatic internal contract without giving up browser-local execution or Pidd Three-Phase semantics.

## Verification

The following focused verification passed:

```text
npm test -- warmup validation statistics replication-runner termination time-series entities macros batch-unbatch execute-panel
```

Result:

- 11 test files passed
- 235 tests passed

## Deferred / Not in Scope

- No full-suite cleanup beyond Sprint 25 scope
- No migration to a Python/SimPy backend
- No broader refactor of the Three-Phase engine structure

## Final Assessment

Sprint 25 successfully converted three ambiguous areas into explicit contracts:

- validation behavior
- warm-up statistical semantics
- queue/resource arbitration ownership

This leaves the engine easier to reason about, safer to extend, and better aligned with the SimPy-informed review direction established after Sprint 24.
