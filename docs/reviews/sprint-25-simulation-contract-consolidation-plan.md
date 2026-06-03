# Sprint 25 — Simulation Contract Consolidation

Created: 2026-05-12  
Builds on:
- `docs/reviews/sprint-24-completion-report.md`
- `docs/reviews/simulation-architecture-review.md`
- `docs/reviews/simpy-architecture-review.md`

## Goal

Consolidate the simulation contract after Sprint 24 by making validation policy explicit, defining warm-up semantics for in-flight entities, and centralizing queue/entity arbitration behind one engine selection service.

## Sprint Theme

This is a contract-clarification and engine-hardening sprint, not a feature sprint.

The work should:

- remove ambiguity in pre-run validation policy
- define statistically defensible warm-up behavior
- reduce hidden selection-rule duplication across engine macros
- preserve existing simulation behavior except where the contract is intentionally clarified

## Scope Guardrails

- Build on the existing Three-Phase engine; do not rewrite `buildEngine()` or the macro registry.
- Do not introduce new dependencies.
- Do not migrate the runtime to Python/SimPy.
- Use SimPy idioms as design references only:
  `Resource`, `PriorityResource`, `Store`, process-local waiting, and explicit timeout/request races.
- Lock behavior with regression tests before structural refactors.
- Keep UI changes narrow and contract-driven.

## Work Items

| ID | Priority | Work item | Status | Primary files | Acceptance criteria |
|---|---:|---|---|---|---|
| F25.1 | P0 | Resolve the V8 validation contract explicitly | ✅ Complete | `src/engine/validation.js`, `src/ui/execute/index.jsx`, editor validation surfaces, docs | Source/sink policy is either blocking or warning by design; docs, validation output, and Execute behavior all agree. |
| F25.2 | P0 | Define warm-up semantics for in-flight entities | ✅ Complete | `src/engine/index.js`, `src/engine/macros.js`, tests, docs | Waiting, serving, scheduled-completion, and post-warm-up counting behavior is documented and covered by tests. |
| F25.3 | P1 | Centralize queue/entity arbitration into one selection service | ✅ Complete | `src/engine/entities.js`, `src/engine/macros.js`, tests | FIFO/LIFO/PRIORITY arbitration is routed through one helper/service for `ASSIGN`, `BATCH`, and `RENEGE_OLDEST` without behavior drift. |
| F25.4 | P1 | Add contract-level regression coverage | ✅ Complete | `tests/engine/*`, `tests/ui/execute/*` | New tests prove V8 policy, warm-up semantics, and arbitration equivalence. |
| F25.5 | P2 | SimPy-style documentation follow-through | ✅ Complete | `AGENTS.md`, `docs/simmodlr_Build_Plan.md`, review docs | Architecture docs explain the JS equivalents of SimPy-style validation, waiting, and arbitration patterns. |

## Recommended Implementation Order

1. Decide the V8 contract and encode it in docs and tests.
2. Implement warm-up behavior with explicit coverage for in-flight entities.
3. Refactor arbitration only after current behavior is pinned by tests.
4. Update plan/review docs with resolved policy language and any deferred edge cases.

## Key Design Decisions Needed

### V8 policy

Pick one and make it consistent everywhere:

- `Blocking`: no source and/or sink means the model cannot run.
- `Warning`: model may run, but the user is explicitly warned that arrivals or exits are missing.

Recommendation: make V8 `blocking` when both are absent, and `warning` when exactly one side is missing.

### Warm-up policy

Define how to treat:

- entities already waiting when warm-up ends
- entities already in service when warm-up ends
- completions scheduled before warm-up that fire after warm-up
- queue and service metrics that span the warm-up boundary

Implemented policy: preserve entity state, reset counters at warm-up, keep scheduled completions that were already issued, and truncate wait/service/sojourn metrics at the warm-up boundary so only post-warm-up portions contribute to summary statistics.

## Regression Test Plan

| Area | Required tests |
|---|---|
| V8 validation | No-source/no-sink, source-only, sink-only, and valid-model cases all match the chosen blocking/warning policy. |
| Warm-up waiting entities | Pre-warm-up waiting entities survive the reset and follow the documented counting policy after warm-up. |
| Warm-up in-service entities | Entities already serving at warm-up end complete according to the documented service/wait accounting policy. |
| Warm-up scheduled completions | A completion event scheduled before warm-up but firing after warm-up behaves deterministically and matches the contract. |
| Arbitration equivalence | FIFO/LIFO/PRIORITY selection remains equivalent before and after centralization for `ASSIGN`, `BATCH`, and `RENEGE_OLDEST`. |
| Execute validation UX | Execute surfaces the chosen V8 contract consistently and does not drift from engine validation. |

## Exit Gate

Sprint 25 is complete only when:

- F25.1-F25.4 are implemented and tested.
- warm-up behavior is documented, not implied
- arbitration logic has a single authoritative selection path
- focused tests pass for validation, warm-up, queue disciplines, batching, and Execute validation
- docs reflect the final contract decisions

## Proposed Definition of Done

- one explicit source/sink validation rule
- one explicit warm-up semantics rule set
- one selection service for queue/resource arbitration
- no behavior drift in existing routing, batching, pooling, or reneging flows

## Verification Snapshot

- `npm test -- warmup validation`
- `npm test -- statistics replication-runner termination time-series`
- `npm test -- entities macros batch-unbatch`
- `npm test -- execute-panel`
