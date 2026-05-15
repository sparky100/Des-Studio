# Sprint 35 — Architecture Review Correctness Fixes

**Status:** ✅ Complete | **Started:** 2026-05-15 | **Completed:** 2026-05-15

## Goal

Address three actionable findings from the simulation-architecture-review.md that could be closed without a large-scale refactor: the warmup FEL pruning gap (M2), the V8 validation contract mismatch (M3), and dead summary code in `runAll()` (L1). The sprint also serves as a formal tracking pass over all review findings to record open/closed status in the architecture document.

## Scope

| Finding | Action | Status |
|---------|--------|--------|
| M2 — Warmup FEL context pruning | Prune only context-dependent FEL entries at warmup boundary | ✅ Done |
| M3 — V8 validation contract | Document product decision: both-missing=error, individual-missing=warning | ✅ Done |
| L1 — Dead summary block in `runAll()` | Remove unused local summary calculation block | ✅ Done |

### Out of scope

H2 (reneging target binding), H3 (COMPLETE on waiting entities), H4 (serviceStart=0 bias), H5 (FEL t=900 cap), H6 (persistence canonical model), M1 (shift-capacity reconciliation), M4 (queue discipline duplication), M5 (legacy string conditions), L2 (rendering filters), L3 (Math.random), L4 (DB schema baseline) — all deferred to future sprints or accepted as low priority.

## Implementation

### M2 — Warmup FEL pruning

**Problem:** The original M2 fix pruned ALL FEL entries whose `_contextCustId` pointed to a removed entity. This was too broad: regular B-event self-schedules (e.g. next ARRIVE) carry `_contextCustId` as metadata from the creating entity but do not require that entity to be alive to function. At warmup, the creating entity may be 'done' and removed, causing the next ARRIVE event to be incorrectly pruned and halting all future arrivals in that replication.

**Root cause:** In `phases.js`, B-event self-schedules set `_contextCustId = effectCtx._lastCustId` (the just-created customer). ARRIVE creates the customer and schedules the next ARRIVE with that customer's ID. If that customer is done by warmup, the pruning kills the arrival process.

**Fix:**
1. `src/engine/phases.js`: Added `_requiresCtxEntity: true` to cSchedule FEL entries that set `useEntityCtx: true`. These are the events (typically COMPLETE) that genuinely need their context entity.
2. `src/engine/index.js`: Updated warmup FEL filter to only prune entries flagged `_isRenege` or `_requiresCtxEntity`:
   ```javascript
   fel = fel.filter(ev => {
     if (ev._contextCustId == null) return true;
     if (!ev._isRenege && !ev._requiresCtxEntity) return true;
     return activeIds.has(ev._contextCustId);
   });
   ```

This correctly prunes stale COMPLETE and RENEGE events for removed entities while preserving arrival and other B-event chains.

### M3 — V8 validation product decision

**Problem:** Making individual missing-source or missing-sink a hard blocker would break ~20 UI tests whose fixture models use simplified one-sided structures, and would prevent valid one-way flows (generators, sinks-only).

**Decision:** Both ARRIVE and COMPLETE missing = hard error (V8 blocking). Individual missing = warning. This is intentional and documented in `src/engine/validation.js` with a product-decision comment.

**Fix:** Confirmed and documented in `src/engine/validation.js` — no behaviour change, comment added explaining the product decision.

### L1 — Dead summary block removal

**Problem:** `runAll()` computed `customers`, `served`, `avgWait`, `avgSvc`, etc. in a local block that was never used — the return statement used `summary: getSummary()` instead. These dead calculations added cognitive load and could silently diverge from real output logic.

**Fix:** Removed the unused block from `src/engine/index.js`. All summary construction now routes through `getSummary()`.

## Tests

New test file: `tests/engine/sprint-35-architecture-review.test.js` — 11 tests:

| Group | Tests | Result |
|-------|-------|--------|
| M3 — V8 product decision | 5 | ✅ All pass |
| M2 — Warmup FEL pruning | 3 | ✅ All pass |
| L1 — `runAll()` summary correctness | 3 | ✅ All pass |

Regression gate: `tests/engine/replication-ci.test.js` — 2 CI tests (30 M/M/1 replications, 20 M/M/c replications with warmup=200) — both pass after corrected FEL pruning logic.

Full suite: 1101 tests, 1 unrelated pre-existing flaky failure in `distribution-fitting.test.js` (statistical RNG sensitivity, not introduced by this sprint).

## Acceptance Criteria

- [x] No "COMPLETE skipped — not found" log entries in post-warmup simulation runs
- [x] Entities in service at warmup boundary complete correctly post-warmup
- [x] `phaseCTruncated` and `summary` survive warmup correctly (regression guard)
- [x] V8 product decision tested: both-missing blocks, individual warns
- [x] `runAll()` returns correct `summary`, `served`, `avgWait`, `avgWIP`, `avgSojourn`
- [x] All 30 M/M/1 and 20 M/M/c replications with warmup produce valid `avgWait` (ci.n matches replications)
- [x] Architecture review updated with finding status table
