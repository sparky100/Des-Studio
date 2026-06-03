# Sprint 24 — Simulation Correctness & SimPy-Informed Remediation

Created: 2026-05-12  
Source reviews:
- `docs/reviews/simulation-architecture-review.md`
- `docs/reviews/simpy-architecture-review.md`

## Goal

Harden simmodlr's simulation correctness after the architecture reviews by fixing the urgent Phase C, event-context, entity lifecycle, event scheduling, and persistence-contract defects, then adding SimPy-informed JavaScript abstractions for cancellation, resource arbitration, queue selection, and lifecycle transitions where they reduce correctness risk.

## Sprint Theme

This is a remediation sprint, not a feature sprint. The intent is to preserve the existing working application and make targeted fixes to correctness boundaries:

- Make unstable C-event scans visible and durable.
- Prevent impossible entity lifecycle transitions.
- Bind scheduled events to the correct entity/server context.
- Preserve all canonical model data across persistence.
- Remove silent event scheduling loss.
- Strengthen tests around DES invariants.
- Use SimPy idioms as design guidance without adopting Python/SimPy as the primary runtime.

## Scope Guardrails

- Do not rewrite the engine loop, macro registry, Execute panel, or persistence layer from scratch.
- Preserve Pidd's Three-Phase A/B/C loop and the C-scan restart rule.
- Keep `src/engine/` free of React and DOM dependencies.
- Keep Supabase access inside `src/db/models.js` and `src/db/supabase.js`.
- Do not introduce new dependencies.
- Do not migrate the engine to Python/SimPy in this sprint.
- Use SimPy concepts such as `AnyOf(request, timeout)`, `Resource`, `PriorityResource`, `Store`, and process-local lifecycle as architectural references for JavaScript fixes.
- Add regression tests before or alongside each fix.
- Treat existing user/local changes as protected; do not revert unrelated files.

## Work Items

| ID | Priority | Review refs | Work item | Primary files | Acceptance criteria |
|---|---:|---|---|---|---|
| F24.1 | P0 | H1, M6 | Propagate Phase C truncation metadata end to end. | `src/engine/index.js`, `src/engine/replication-runner.js`, `src/engine/worker.js`, `src/ui/execute/index.jsx`, `src/db/models.js` | `runAll()` returns durable truncation metadata; replication compaction preserves it; Execute shows a warning with the actual cap; saved `results_json` includes the warning/flag. |
| F24.2 | P0 | H2 | Bind reneging schedules to the current entity context. | `src/engine/phases.js`, tests | `sched.isRenege` uses the entity created/selected by the firing event when available; missing context is logged or warned, not guessed from global newest waiting entity. |
| F24.3 | P0 | H3, H4 | Fix lifecycle invariants and service-time math. | `src/engine/macros.js`, `src/engine/index.js`, tests | `COMPLETE()` cannot mark a merely waiting entity as served; stale completions are skipped; `serviceStart = 0` is handled correctly; average service time divides by the contributing served count. |
| F24.4 | P1 | H5 | Remove or validate the initial FEL t=900 cap. | `src/engine/index.js`, `src/engine/validation.js`, tests | Valid initial B-events after t=900 are not silently dropped; invalid/non-finite scheduled times are surfaced by validation or explicit warnings. |
| F24.5 | P1 | H6 | Align model persistence with canonical `model_json`. | `src/db/models.js`, Supabase migration, `src/ui/ModelDetail.jsx`, `src/App.jsx`, tests | `graph` and `experimentDefaults` round trip through remote persistence; existing denormalized columns remain compatible; imports/exports and DB wrappers agree on canonical keys. |
| F24.6 | P1 | M1 | Reconcile shift target capacity after busy excess servers finish. | `src/engine/phases.js`, `src/engine/macros.js`, tests | When a shift reduces capacity below busy server count, excess idle servers are retired after completion/release until actual count matches target. |
| F24.7 | P2 | M4 | Centralize queue/entity selection. | `src/engine/entities.js`, `src/engine/macros.js`, tests | Queue-name and entity-type selection share one helper for FIFO/LIFO/PRIORITY behavior; `ASSIGN()`, `BATCH()`, and `RENEGE_OLDEST()` remain behaviorally equivalent except for fixed bugs. |
| F24.8 | P2 | M3 | Resolve V8 validation contract mismatch. | `src/engine/validation.js`, UI validation surfaces, tests, docs | Decide and encode whether missing source/sink is blocking or warning; documentation, tests, and Execute UI agree. |
| F24.9 | P2 | M2 | Define warm-up context semantics. | `src/engine/index.js`, tests, docs | Active/queued/context-carrying entities at warm-up have documented behavior; tests cover pre-warm-up service that completes after warm-up. |
| F24.10 | P3 | L2, L4 | Add lower-priority hardening follow-through. | `src/ui/execute/*`, `src/ui/results/*`, Supabase schema docs | Large-snapshot rendering has a selector/index plan or implementation; baseline DB schema evidence is added or explicitly deferred with owner. |
| F24.11 | P2 | SimPy review | SimPy-style validation harness plan. | docs/tests prototype if scoped | Decide whether to add a later optional SimPy exporter/cross-check harness for M/M/1 and reneging templates; no runtime migration in Sprint 24. |

## Suggested Implementation Order

1. **Test scaffolding first:** add focused failing tests for F24.1-F24.4.
2. **Engine metadata path:** fix Phase C truncation propagation and replication compaction.
3. **Lifecycle fixes:** bind reneging context using a SimPy `AnyOf(request, timeout)`-style mental model, reject stale/waiting completions, correct service-time calculations.
4. **Scheduling fix:** remove/replace the initial FEL t=900 cap.
5. **Persistence fix:** round trip `graph` and `experimentDefaults`.
6. **Shift reconciliation:** implement target-capacity cleanup after completions/releases.
7. **Refactor safely:** centralize queue selection after behavior is locked by tests, using SimPy `Resource`/`PriorityResource`/`Store` concepts as design references.
8. **Policy/docs alignment:** resolve V8 and warm-up semantics.
9. **Performance/schema follow-through:** handle F24.10 if sprint capacity remains.

## Regression Test Plan

| Area | Required tests |
|---|---|
| Phase C truncation | Engine `runAll()` returns truncation flag; replication compaction preserves it; Execute UI renders warning for default cap. |
| Reneging context | Same-clock multi-queue model proves a reneging timer targets the entity created by the event that scheduled it. |
| Stale completion | Entity reneges before completion; later `COMPLETE()` is skipped and served count does not increment. |
| Service metrics | Service starting at t=0 records non-zero service duration; mixed direct exits do not dilute `avgSvc`. |
| Initial FEL | B-event scheduled at t=1000 with `maxSimTime=1200` fires; malformed scheduled time is validated. |
| Persistence | Remote DB wrapper round trip preserves `graph` and `experimentDefaults`; saved result metadata includes truncation warnings. |
| Shift capacity | Shift 2 -> 1 while both servers are busy eventually retires excess server after completion. |
| Queue selection | Integration tests through `ASSIGN(QueueName, ServerType)` cover FIFO/LIFO/PRIORITY, not only `waitingOf()`. |
| Warm-up | In-service pre-warm-up entity completing after warm-up follows the documented counting policy. |
| SimPy-informed design | Tests or docs show cancellation and resource-selection behavior mapped to JS equivalents of SimPy `AnyOf`, `Resource`, `PriorityResource`, and `Store` semantics. |

## Exit Gate

Sprint 24 is complete only when:

- F24.1-F24.6 are implemented and tested.
- F24.7-F24.9 are implemented or explicitly split with written defer notes.
- `npm test -- three-phase replication-runner distributions entities validation termination time-varying execute-panel db` passes, adjusted to exact test filters present after implementation.
- `npm run build` passes.
- `docs/reviews/simulation-architecture-review.md` is updated with resolved/deferred status notes.
- `docs/reviews/simpy-architecture-review.md` is updated with resolved/deferred status notes or a follow-up SimPy validation backlog item.
- `AGENTS.md` and `docs/simmodlr_Build_Plan.md` are updated with Sprint 24 closure details.

## Defer Criteria

The following may move to Sprint 25 only if P0/P1 remediation consumes the sprint:

- F24.7 queue-selection centralization, provided all behavior is already regression-tested.
- F24.9 warm-up semantic refactor, provided the current behavior is documented and no new data-corrupting case is confirmed.
- F24.10 large-snapshot render indexing and baseline schema evidence.

Do not defer F24.1-F24.4. Those are correctness issues that can make simulation outputs misleading.
