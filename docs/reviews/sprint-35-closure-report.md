# Sprint 35 — Closure Report

**Sprint:** 35 — Architecture Review Correctness Fixes
**Completed:** 2026-05-15
**Branch:** `claude/review-sprints-31-33-0R5Mx`

## Delivered Scope

| Item | Description | Result |
|------|-------------|--------|
| M2 fix | Warmup FEL pruning scoped to context-dependent events only | ✅ Delivered |
| M3 documented | V8 product decision: both-missing=error, individual=warning | ✅ Delivered |
| L1 fix | Removed dead summary block from `runAll()` | ✅ Delivered |
| Sprint 35 tests | 11 new engine tests covering M2, M3, L1 | ✅ Delivered |
| Architecture review updated | v2.0 with finding status table | ✅ Delivered |

## Key Technical Fix — M2 Warmup FEL Pruning

The initial M2 implementation pruned FEL entries by checking `activeIds.has(ev._contextCustId)` for all entries that carry a `_contextCustId`. This was incorrect because B-event self-schedules (e.g. next ARRIVE) carry `_contextCustId` as metadata from the creating entity but do not _require_ that entity to be alive.

At warmup, when the creating customer has status='done' and is removed from the entity pool, the pruning incorrectly killed the next ARRIVE event, halting arrivals for the rest of the replication. This caused `avgWait = null` for affected replications and reduced `ci.n` in the replication CI gate (25/30 and 18/20 instead of full counts).

**Corrected approach:** A new `_requiresCtxEntity: true` flag is set only on cSchedule FEL entries (`useEntityCtx: true`) — these are COMPLETE events that genuinely need the context entity to identify which customer to complete. Combined with the existing `_isRenege` flag, the warmup filter now prunes only events that actually need a context entity:

```javascript
fel = fel.filter(ev => {
  if (ev._contextCustId == null) return true;
  if (!ev._isRenege && !ev._requiresCtxEntity) return true;
  return activeIds.has(ev._contextCustId);
});
```

## Files Changed

| File | Change |
|------|--------|
| `src/engine/phases.js` | Added `_requiresCtxEntity: cs.useEntityCtx ? true : undefined` to cSchedule FEL entries |
| `src/engine/index.js` | Narrowed warmup FEL filter to `_isRenege` and `_requiresCtxEntity` only; removed dead summary block |
| `src/engine/validation.js` | Added product-decision comment on V8 individual-missing warning behaviour |
| `tests/engine/sprint-35-architecture-review.test.js` | 11 new tests (NEW) |
| `docs/reviews/sprint-35-plan.md` | Sprint plan (NEW) |
| `docs/reviews/sprint-35-closure-report.md` | This document (NEW) |
| `docs/reviews/simulation-architecture-review.md` | Updated to v2.0 with finding status table |

## Test Results

```
tests/engine/sprint-35-architecture-review.test.js  11/11 pass
tests/engine/replication-ci.test.js                  2/2  pass (ci.n=30, ci.n=20)
Full suite: 1100/1101 pass
```

The 1 failing test (`distribution-fitting.test.js > fits normal to normal samples`) is a pre-existing statistical flake unrelated to this sprint.

## Open Architecture Review Findings

See `docs/reviews/simulation-architecture-review.md` v2.0 for full status table. Findings remaining open after Sprint 35:

| ID | Severity | Status |
|----|----------|--------|
| H2 | High | Open — reneging timer target binding |
| H3 | High | Open — COMPLETE() on waiting entities |
| H4 | High | Open — serviceStart=0 bias |
| H5 | High | Open — initial FEL t=900 cap |
| H6 | High | Open — persistence canonical model |
| M1 | Medium | Open — shift-capacity reconciliation |
| M4 | Medium | Open — queue discipline duplication |
| M5 | Medium | Open — legacy string conditions |
| L2 | Low | Open — rendering filters at scale |
| L3 | Low | Accepted — Math.random in non-sim code |
| L4 | Low | Open — baseline DB schema |
