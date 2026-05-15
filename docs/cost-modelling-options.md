# Cost Modelling — Options & Assessment

**Date:** 2026-05-15
**Status:** For review

## Current State

The engine already has a working `COST(expr)` macro that accumulates to `state.__totalCost`. After a simulation run, `result.summary.totalCost` and `result.summary.costPerServed` are available. However, the feature is largely invisible:

- `COST()` does not appear in any effect builder dropdown
- `totalCost` / `costPerServed` are not displayed anywhere in the UI
- There is no per-entity cost tracking, only a global aggregate
- There is no cost breakdown by event or queue

The four options below are ordered by effort, smallest first.

---

## Option 1 — Effect builder visibility

**What:** Add `COST()` options to the B-event and C-event effect builder dropdowns.

**Why:** The feature exists but is invisible to modellers who have not read the documentation.  Adding it to the dropdown menus (the same pattern used for `FILL`/`DRAIN` in Sprint 39) makes it discoverable without any engine changes.

**How:** Extend `bEffectOptions` and `assignOptions` in `src/ui/editors/helpers.jsx`.  When an entity type is selected, pre-populate the expression with `Entity.<attrName>` choices drawn from the entity type's `attrDefs`.

**Files:** `src/ui/editors/helpers.jsx` (one function each)

**Effort:** Small — follows an established pattern, no engine changes needed.

**Outcome:** Modellers can add cost effects via the UI without knowing the macro syntax.

---

## Option 2 — Results display

**What:** Surface `totalCost` and `costPerServed` in the results canvas.

**Why:** The numbers are computed but never shown. Closing this gap completes the basic cost reporting loop.

**Two sub-options:**

### 2a — Summary stat tiles (simplest)
Add `totalCost` and `costPerServed` as stat tiles on the existing results summary panel alongside avgWait and served. Requires a small change to the results canvas component.

**Files:** Results canvas/summary component

**Effort:** Small.

### 2b — Analysis metrics integration (richer)
Add `totalCost` and `costPerServed` to the `ANALYSIS_METRICS` array used by the results workspace. This makes them available in charts, sweep outputs, and replication confidence intervals automatically.

**Files:** Results workspace / analysis metrics definition

**Effort:** Small–Medium (depends on how `ANALYSIS_METRICS` is structured).

---

## Option 3 — Per-entity cost accumulation

**What:** Track cumulative cost on each entity (e.g. `entity.totalCost`) in addition to the global accumulator.

**Why:** The global `totalCost` tells you the aggregate but nothing about the distribution. Per-entity cost enables:
- Cost histograms and percentiles
- Identifying high-cost entities / outliers
- Cost breakdown by entity type or priority class

**How:** The `COST(expr)` macro would also write to `entity.attrs.totalCost` for the context entity (using `_lastCustId`, the same mechanism as `sojournTime`). This flows through automatically to `entitySummary` in `runAll()`.

**Files:** `src/engine/macros.js` (COST macro), `tests/engine/`

**Effort:** Medium.

**Outcome:** `result.entitySummary[i].attrs.totalCost` available per entity; cost distribution analysis becomes possible.

---

## Option 4 — Cost breakdown by event or queue

**What:** A `costBreakdown: { [eventName]: number }` field in the summary, showing how much cost was accumulated by each COST-bearing event.

**Why:** Models with multiple cost sources (e.g. labour cost in C-event, material cost in B-event, penalty cost on reneging) produce a single aggregate that is hard to decompose. A breakdown makes it easy to see which events dominate total cost.

**How:** The COST macro records the event name alongside the amount, accumulating into `state.__costByEvent[eventName]`. `getSummary()` copies this into `summary.costBreakdown`.  Could optionally be extended to break down by queue.

**Files:** `src/engine/macros.js`, `src/engine/index.js`, `tests/engine/`

**Effort:** Medium–Large.

**Outcome:** `result.summary.costBreakdown` shows per-event cost contributions; visible in results panel if option 2 is also implemented.

---

## Summary

| Option | Scope | Effort | Value | Dependencies |
|--------|-------|--------|-------|--------------|
| 1 — Effect builder helpers | UI only | Small | High — makes feature discoverable | None |
| 2a — Summary stat tiles | UI only | Small | High — closes basic reporting loop | None |
| 2b — Analysis metrics integration | UI only | Small–Medium | Medium–High — enables sweep/replication cost analysis | None |
| 3 — Per-entity cost | Engine + tests | Medium | Medium–High — enables cost distribution | None |
| 4 — Cost breakdown by event | Engine + UI | Medium–Large | Medium — useful for complex multi-source models | Options 2a/2b recommended first |

**Recommended sequence:** Options 1 and 2a are independent quick wins that surface existing functionality. Option 3 adds analytical depth. Option 4 is worth considering only once the basics are visible and used in practice.
