# Sprint 24 Completion Report

Created: 2026-05-12  
Sprint: 24  
Theme: Simulation Correctness & SimPy-Informed Remediation

## Executive Summary

Sprint 24 is complete for the planned remediation scope.

The sprint delivered the targeted engine, persistence, and Execute-surface fixes needed to close the highest-risk simulation correctness issues identified in the architecture reviews. The work stayed within the intended guardrails: no engine rewrite, no new dependencies, no Python/SimPy migration, and only minimal UI touch points.

The sprint also incorporated SimPy-informed design guidance by tightening event context binding, lifecycle transitions, resource-capacity reconciliation, and cancellation-like behavior in the existing JavaScript engine rather than duplicating more scheduler machinery.

## Scope Delivered

| Work item | Status | Notes |
|---|---|---|
| F24.1 Phase C truncation metadata propagation | Complete | Flag and warnings now flow through engine, replication compaction, Execute UI, and persisted run results. |
| F24.2 Context-bound reneging | Complete | Reneging schedules now bind to the scheduling entity context instead of guessing from global queue state. |
| F24.3 Lifecycle invariants and service-time math | Complete | Stale customer completions are skipped; batch completion remains supported; `serviceStart = 0` is handled correctly. |
| F24.4 Initial FEL scheduling cap removal/validation | Complete | Arbitrary initial `t < 900` event dropping removed; malformed scheduled times are now validated. |
| F24.5 Canonical model persistence alignment | Complete | `graph` and `experimentDefaults` now round trip through `model_json`. |
| F24.6 Shift capacity reconciliation | Complete | Busy excess servers retained at downshift are retired after later completion/release when idle. |
| F24.7 Queue/entity selection centralization | Deferred | Behavior is regression-covered; structural consolidation was left out to keep the sprint narrow. |
| F24.8 V8 validation contract alignment | Deferred | No Sprint 24 change made; current validation behavior remains as-is. |
| F24.9 Warm-up semantics clarification | Deferred | No Sprint 24 behavior change made; requires a separate policy decision. |
| F24.10 Render/schema hardening follow-through | Deferred | Not required to close the primary correctness defects. |
| F24.11 SimPy validation/export backlog | Deferred | SimPy guidance was applied architecturally; no exporter/harness added in this sprint. |

## Implemented Changes

### Engine correctness

- Removed hidden loss of valid initial B-events scheduled after `t=900`.
- Propagated durable `phaseCTruncated` state from `step()` and `runAll()` into summaries and saved result payloads.
- Bound reneging timers to the correct entity context.
- Prevented `COMPLETE()` from falsely serving ordinary waiting customers while preserving batch lifecycle behavior.
- Corrected service duration calculations when service starts at `t=0`.
- Added post-completion reconciliation for downshifted busy server pools.
- Reduced `runAll()` snapshot cloning so long stochastic runs no longer degrade catastrophically.

### Persistence and result contracts

- Preserved canonical `model_json.graph`.
- Preserved canonical `model_json.experimentDefaults`.
- Persisted Phase C truncation metadata and warnings in `results_json`.
- Preserved truncation metadata through replication result compaction.

### Execute surface

- Execute warning banner now appears when Phase C truncation occurs even if the model does not explicitly store a cap.
- Single-run and replication-run paths both recognize top-level and summary-level truncation metadata.

## Files Changed

- `src/engine/index.js`
- `src/engine/macros.js`
- `src/engine/phases.js`
- `src/engine/replication-runner.js`
- `src/engine/validation.js`
- `src/db/models.js`
- `src/ui/execute/index.jsx`
- `tests/engine/sprint-24-correctness.test.js`
- `tests/engine/validation.test.js`
- `tests/db/models.test.js`
- `src/engine/__tests__/distributions.test.js`
- `AGENTS.md`
- `docs/DES_Studio_Build_Plan.md`

## Verification

### Sprint-targeted verification

The following suites passed after implementation:

- `npm test -- sprint-24-correctness validation db`
- `npm test -- execute-panel replication-runner`
- `npm test -- three-phase time-varying finite-queue conditional-routing multi-stage-queue multi-server-pooling recirculation`
- `npm test -- probabilistic-routing queue-name-spaces batch-unbatch termination`
- `npm test -- distributions conditions entities statistics time-series`

### Full-suite status

`npm test` no longer fails because of the Sprint 24 engine changes. The remaining failures observed in the full suite are outside Sprint 24 scope:

- `tests/llm/proxy-contract.test.js`
- `tests/ui/visual-designer/visual-designer-panel.test.jsx`
- `src/engine/__tests__/engine.test.js` currently reports zero collected tests

These failures appear unrelated to the simulation-correctness remediation completed in this sprint.

## SimPy-Informed Assessment

Sprint 24 followed the recommendation for partial SimPy-style alignment without major migration:

- Event context is now treated more like process-local state instead of being rediscovered from global queue snapshots.
- Reneging behavior is closer to SimPy's `AnyOf(request, timeout)` mental model.
- Resource-capacity reconciliation behaves more like a managed resource pool than a one-shot structural mutation.
- Lifecycle guards reduce impossible states that generator-driven SimPy processes would normally make harder to express.

No Python runtime or direct SimPy API adoption was introduced.

## Deferred Follow-Up

Recommended Sprint 25 candidates:

- Centralize queue/entity arbitration into a single selection service.
- Resolve the V8 validation contract mismatch explicitly.
- Define and test warm-up semantics for in-flight entities.
- Decide whether to add a SimPy-backed validation harness for benchmark models.

## Final Assessment

Sprint 24 met its primary objective: the simulation engine is materially safer, more deterministic, and more explicit about unstable conditions than at sprint start, while remaining compatible with the existing DES Studio architecture.
