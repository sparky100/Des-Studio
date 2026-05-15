# Sprint 36 — Correctness Verification, Cost Modelling & Public API

**Status:** 🔄 In progress | **Started:** 2026-05-15

## Goal

Address the remaining open findings from the simulation architecture review and close two capability gaps. A pre-implementation code audit revealed that most H-severity and M1 findings were already resolved by prior sprints — the architecture review was conducted on 2026-05-12, before Sprints 31–35 delivered significant engine work. This sprint formalises that closure with regression tests, fixes the one confirmed remaining bug (H4), and delivers two new features (G17 cost modelling, G24 public API).

## Pre-implementation audit findings

| Finding | Expected | Actual code state | Action |
|---------|----------|-------------------|--------|
| H2 — Reneging timer binding | Binds to newest global entity | `phases.js:269` uses `effectCtx._lastCustId` directly; fires via `_contextCustId` | Already fixed — write regression test |
| H3 — COMPLETE on waiting entities | Accepts waiting entities | `macros.js:405` rejects waiting non-batch entities; batch exception is intentional | Already fixed — write regression test |
| H4 — serviceStart=0 bias | `|| clock` treats 0 as falsy | `macros.js:695,740`: FAILURE/PREEMPT remaining-service uses `cust.serviceStart \|\| clock` — confirmed bug | Fix: change `\|\|` to `??` |
| H5 — FEL t=900 cap | Silent exclusion of late events | No cap exists in current code; all bEvents enter FEL, maxSimTime truncates | Already fixed — write regression test |
| H6 — Persistence omits graph/experimentDefaults | Lost on save/load | `models.js:116-117`: both included in `modelJsonFromModel`; `norm():98-99` reads them back | Already fixed — note in closure |
| M1 — Shift-capacity busy-server reconciliation | No post-completion retirement | `retireIdleExcessServers()` called after every COMPLETE/RELEASE; `__desiredServerCapacity` tracked by `applyShiftChange` | Already fixed — write regression test |

## Scope

| Item | Type | Priority | Effort | Status |
|------|------|----------|--------|--------|
| H4 — serviceStart=0 in FAILURE/PREEMPT remaining-service | Engine bug fix | P0 | XS | 🔄 |
| H2/H3/H5/M1 — regression tests confirming prior fixes | Verification | P0 | S | 🔄 |
| G17 — Cost modelling (`COST` macro + summary) | Feature | P1 | M | 🔄 |
| G24 — Public engine API module + reference doc | Feature | P2 | S | 🔄 |

### Out of scope

Time-integral resource costing (busyTime × costRate per server type) — deferred; requires server-level busy-time integration. H6 and M1 confirmed resolved by prior work; no code changes needed.

## Implementation

### H4 — serviceStart=0 fix

**Problem:** In two places in `macros.js`, the remaining-service calculation for FAILURE and PREEMPT events uses `(cust.serviceStart || clock)`. The `||` operator treats `0` as falsy, so if a customer entered service at `t=0`, the remaining service is calculated as `scheduledDuration - (clock - clock) = scheduledDuration` instead of the correct `scheduledDuration - (clock - 0) = scheduledDuration - clock`.

This means a preempted or failed customer who started service at t=0 gets their full service duration as "remaining" rather than the correctly elapsed-time-reduced remainder.

**Fix:** Change `||` to `??` (nullish coalescing) at both sites:
- `macros.js:695` — FAILURE handler remaining service
- `macros.js:740` — PREEMPT handler remaining service

`buildStageRecord` at line 168 already correctly uses `??`: `const serviceStartedAt = cust.serviceStart ?? clock;` — this is the model to follow.

### G17 — Cost modelling

**Design:** Event-driven cost accumulation via a `COST(expr)` macro.

- `COST(expr)` evaluates `expr` using the same `evalEntityExpr` safe evaluator as `SET`/`SET_ATTR`, then adds the result to `state.__totalCost`.
- `getSummary()` exposes `totalCost: state.__totalCost || 0` and `costPerServed: served > 0 ? totalCost / served : null`.
- Typical use: in a C-event effect after ASSIGN: `ASSIGN(Queue, Server); COST(Entity.rate * 50)`.

**What this covers:**
- Flat cost per service event: `COST(25)`
- Entity-attribute-based cost: `COST(Entity.jobValue * 0.08)`
- State-variable-based cost: `COST(currentRate)`
- Clock-based cost (set up with SET_ATTR): `COST(Entity.serviceTime * hourlyRate)`

**What this does NOT cover (deferred):**
- Time-integral server resource cost (busyTime × costRate) — requires per-server busy-time tracking
- Revenue vs cost difference (net margin) — expressible as two COST() calls with sign

### G24 — Public engine API

**Design:** A thin re-export module at `src/engine/public-api.js` that identifies and documents the stable public surface. Accompanied by `docs/engine-api-reference.md`.

**Public API surface:**
- `buildEngine(model, seed, warmupPeriod, maxSimTime, terminationCondition, maxCycles, maxCPasses, collectTimeSeries)` → engine instance
- `validateModel(model)` → `{ errors, warnings }`
- `runReplications(options)` → async, calls `onComplete(results)`
- `summarizeReplicationResults(results, metricPaths)` → CI objects
- `confidenceInterval95(values)` → `{ n, mean, lower, upper, halfWidth }`

## Test plan

| Group | Tests | Target file |
|-------|-------|-------------|
| H4 — serviceStart=0 remaining service | 2 | sprint-36-correctness.test.js |
| H2 — Reneging binds to correct entity | 2 | sprint-36-correctness.test.js |
| H3 — COMPLETE rejects waiting non-batch entities | 2 | sprint-36-correctness.test.js |
| H5 — Events past t=900 fire correctly | 1 | sprint-36-correctness.test.js |
| M1 — Excess busy servers retired after completion | 2 | sprint-36-correctness.test.js |
| G17 — COST macro accumulation | 4 | sprint-36-cost-api.test.js |
| G17 — getSummary exposes totalCost/costPerServed | 2 | sprint-36-cost-api.test.js |
| G24 — Public API exports are callable | 3 | sprint-36-cost-api.test.js |

## Exit gate

- [ ] All new tests passing
- [ ] Full suite passing (no regressions)
- [ ] H4: preempted customer starting service at t=0 has correct remaining service
- [ ] G17: `COST(10)` in a C-event effect accumulates to `summary.totalCost`
- [ ] G24: `public-api.js` exports `buildEngine`, `validateModel`, `runReplications`
- [ ] Architecture review updated: H2, H3, H4, H5, H6, M1 all marked closed with correct sprint
- [ ] Capability gap analysis updated: G17 ❌→✅, G24 ❌→✅
