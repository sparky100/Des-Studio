# Cost Modelling — Options & Assessment

**Date:** 2026-05-15
**Updated:** 2026-05-16 (post-Sprint 54 implementation)
**Status:** Options 1, 2a, 2b, 3 delivered. Option 4 deferred.

## Current State

The engine has a working `COST(expr)` macro that accumulates to `state.__totalCost` and `entity.attrs.__cost`. After a simulation run, `result.summary.totalCost`, `result.summary.costPerServed`, and per-entity `result.entitySummary[i].attrs.__cost` are all available.

Sprint 54 delivery summary:
- ✓ Option 1 — COST in effect builder (delivered Sprint 36, predates this document)
- ✓ Option 2a — totalCost/costPerServed in aggregate result tiles and CI table
- ✓ Option 2b — totalCost/costPerServed in ANALYSIS_METRICS / batch-means dropdown
- ✓ Option 3 — per-entity cost accumulation in entity.attrs.__cost
- ◷ Option 4 — cost breakdown by event (deferred, see below)

The four options below are ordered by effort, smallest first.

---

## Option 1 — Effect builder visibility ✅ Complete (Sprint 36)

**What:** Add `COST()` options to the B-event and C-event effect builder dropdowns.

**Status:** Done. `COST(1) — flat rate` and `COST(Entity.<attr>)` options appear in `bEffectOptions` and `assignOptions` in `src/ui/editors/helpers.jsx`.

**Files:** `src/ui/editors/helpers.jsx`

---

## Option 2 — Results display ✅ Complete (Sprint 54)

**What:** Surface `totalCost` and `costPerServed` in the results canvas.

### 2a — Summary stat tiles ✅

`totalCost` and `costPerServed` added to `CI_METRICS` and `METRIC_LABELS` in `executeHelpers.js`. They now appear in:
- The aggregate results tile grid after a replication batch completes
- The CI precision table (mean, lower/upper 95%, relative precision %)
- A dedicated cost section in `ResultsWorkspace` when `totalCost > 0` on a single run

**Files:** `src/ui/execute/executeHelpers.js`, `src/ui/results/ResultsWorkspace.jsx`

### 2b — Analysis metrics integration ✅

`totalCost` and `costPerServed` added to `ANALYSIS_METRICS` in `ResultsWorkspace.jsx`. They are now selectable in the batch-means confidence interval dropdown.

**Files:** `src/ui/results/ResultsWorkspace.jsx`

---

## Option 3 — Per-entity cost accumulation ✅ Complete (Sprint 54)

**What:** Track cumulative cost on each entity (`entity.attrs.__cost`) in addition to the global accumulator.

**Status:** Done. The COST macro now writes `entity.attrs.__cost = (entity.attrs.__cost || 0) + amount` for the context entity (same as `sojournTime` pattern). Available in `result.entitySummary[i].attrs.__cost`.

**Files:** `src/engine/macros.js`, `tests/engine/sprint-36-cost-api.test.js`

---

## Option 4 — Cost breakdown by event ◷ Deferred

**What:** A `costBreakdown: { [eventName]: number }` field in the summary, showing how much cost was accumulated by each COST-bearing event.

**Why:** Models with multiple cost sources produce a single aggregate that is hard to decompose. A breakdown makes it easy to see which events dominate total cost.

**How:** The COST macro would record the event name alongside the amount, accumulating into `state.__costByEvent[eventName]`. `getSummary()` copies this into `summary.costBreakdown`.

**Files:** `src/engine/macros.js`, `src/engine/index.js`, `tests/engine/`

**Effort:** Medium–Large.

**Status:** Deferred. Recommended as Sprint 55 candidate once the basic reporting (Options 2a/2b) is used in practice.

---

## Summary

| Option | Scope | Effort | Status |
|--------|-------|--------|--------|
| 1 — Effect builder helpers | UI only | Small | ✅ Sprint 36 |
| 2a — Summary stat tiles | UI only | Small | ✅ Sprint 54 |
| 2b — Analysis metrics integration | UI only | Small | ✅ Sprint 54 |
| 3 — Per-entity cost | Engine + tests | Small | ✅ Sprint 54 |
| 4 — Cost breakdown by event | Engine + UI | Medium–Large | ◷ Deferred |

