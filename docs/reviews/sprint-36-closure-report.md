# Sprint 36 — Closure Report

**Sprint:** 36 — Correctness Verification, Cost Modelling & Public API
**Completed:** 2026-05-15
**Branch:** `claude/review-sprints-31-33-0R5Mx`

## Delivered Scope

| Item | Description | Result |
|------|-------------|--------|
| Pre-implementation audit | Code inspection of all architecture review findings before writing any fixes | ✅ Done |
| H4 fix | `serviceStart || clock` → `serviceStart ?? clock` in FAILURE/PREEMPT remaining-service | ✅ Done |
| H2/H3/H5/M1 verification tests | Regression tests confirming prior-sprint fixes held | ✅ Done |
| G17 — COST macro | `COST(expr)` macro; `totalCost`/`costPerServed` in `getSummary()` | ✅ Done |
| G24 — Public API | `src/engine/public-api.js` module; `docs/engine-api-reference.md` | ✅ Done |

## Pre-implementation audit results

The architecture review was conducted on 2026-05-12, before Sprints 31–35. Most findings were already resolved by the time Sprint 36 started:

| Finding | Code evidence of resolution | Sprint |
|---------|----------------------------|--------|
| H2 — Reneging binding | `phases.js:269` uses `effectCtx._lastCustId` directly; fires via `_contextCustId` | Pre-review (Sprint 32) |
| H3 — COMPLETE on waiting | `macros.js:405` rejects non-batch waiting entities with "COMPLETE skipped" | Pre-review |
| H5 — FEL t=900 cap | No cap in `index.js:257-264`; all bEvents enter FEL; maxSimTime truncates | Pre-review |
| H6 — graph/experimentDefaults | `models.js:116-117` includes both in `modelJsonFromModel()`; `norm():98-99` reads back | Sprint 31–35 |
| M1 — Shift-capacity reconciliation | `retireIdleExcessServers()` called after COMPLETE/RELEASE; `__desiredServerCapacity` tracked | Sprint 31–35 |

**Only H4 had a confirmed remaining bug** in the current codebase.

## H4 fix detail

**Bug:** In two places in `macros.js`, the PREEMPT and FAIL handlers computed remaining service time using `cust.serviceStart || clock`. The `||` operator treats `0` (falsy) as missing, so a customer who started service at `t=0` got `clock - clock = 0` elapsed time, giving a remaining service equal to the full scheduled duration. The customer would then re-enter service for a second full duration after the interruption.

**Fix:** Changed both sites to `cust.serviceStart ?? clock` (nullish coalescing). The `buildStageRecord` function at line 168 already used `??` correctly — this aligns the PREEMPT/FAIL handlers with that pattern.

**Impact:** Only affects models where service starts at exactly `t=0` AND a PREEMPT or FAIL fires during that service. In practice, this most commonly affects the first customer in a model with an immediate arrival (scheduledTime=0).

## G17 — Cost modelling

**Design:** Event-driven accumulation via `COST(expr)` macro. Uses the same `evalEntityExpr` safe evaluator as `SET`/`SET_ATTR`, supporting Entity attributes, state variables, `clock`, arithmetic, and math functions.

**Usage patterns:**
```
ASSIGN(Queue, Server); COST(5)                  // flat cost per service
ASSIGN(Queue, Server); COST(Entity.rate * 50)   // attribute-based cost
COMPLETE(); COST(Entity.sojournTime * 2.50)      // time-based cost (if SET_ATTR used)
```

**Summary fields added:**
- `summary.totalCost` — accumulated total (0 if no COST macro used)
- `summary.costPerServed` — `totalCost / served` (0 if served=0 or no cost used)

**Note:** Time-integral resource costing (busyTime × costRate per server type) is deferred. It requires per-server busy-time integration and is a separate sprint.

## G24 — Public engine API

**Module:** `src/engine/public-api.js` — thin re-export of stable public surface.

**Exports:** `buildEngine`, `validateModel`, `runReplications`, `summarizeReplicationResults`, `confidenceInterval95`, `compareScenarios`, `batchMeansCI`, `oneWayANOVA`, `tukeyHSD`, `fitDistribution`, `mulberry32`.

**Reference:** `docs/engine-api-reference.md` — covers all exported functions, `RunResult`/`Summary` shapes, model JSON schema, and macro vocabulary.

## Files changed

| File | Change |
|------|--------|
| `src/engine/macros.js` | H4: two `\|\|` → `??` fixes; COST macro added |
| `src/engine/index.js` | `totalCost`/`costPerServed` added to `getSummary()` |
| `src/engine/public-api.js` | Public API re-export module (NEW) |
| `docs/engine-api-reference.md` | Full API reference documentation (NEW) |
| `tests/engine/sprint-36-correctness.test.js` | 9 verification tests for H2/H3/H4/H5/M1 (NEW) |
| `tests/engine/sprint-36-cost-api.test.js` | 11 tests for G17 and G24 (NEW) |
| `docs/reviews/sprint-36-plan.md` | Sprint plan (NEW) |
| `docs/reviews/sprint-36-closure-report.md` | This document (NEW) |

## Test results

```
tests/engine/sprint-36-correctness.test.js   9/9  pass
tests/engine/sprint-36-cost-api.test.js     11/11 pass
Full suite: 1121/1121 pass
```

## Architecture review status after Sprint 36

All H-severity and M1 findings from `simulation-architecture-review.md` are now closed:

| Finding | Closed | Sprint |
|---------|--------|--------|
| H1 — phaseCTruncated propagation | ✅ | Sprint 31–35 |
| H2 — Reneging timer binding | ✅ | Pre-review (confirmed Sprint 36) |
| H3 — COMPLETE on waiting entities | ✅ | Pre-review (confirmed Sprint 36) |
| H4 — serviceStart=0 bias | ✅ | Sprint 36 |
| H5 — FEL t=900 cap | ✅ | Pre-review (confirmed Sprint 36) |
| H6 — Persistence canonical model | ✅ | Sprint 31–35 |
| M1 — Shift-capacity reconciliation | ✅ | Pre-review (confirmed Sprint 36) |
| M2 — Warmup FEL context | ✅ | Sprint 35 |
| M3 — V8 validation contract | ✅ | Sprint 35 |
| M6 — Replication compaction phaseCTruncated | ✅ | Sprint 31–35 |
| L1 — Dead summary block | ✅ | Sprint 35 |

**Remaining open (medium/low, not addressed this sprint):** M4 (queue discipline duplication), M5 (legacy string conditions), L2 (rendering filters), L4 (DB schema baseline).
