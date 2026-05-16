# Sprint 54 — Closure Report
**Sprint:** 54 — Cost Modelling Visibility
**Branch:** sprint-47a
**Date:** 2026-05-16
**Status:** Delivered ✓

---

## Delivered Scope

| ID | Item | Status | Notes |
|----|------|--------|-------|
| S54.1 | Update `cost-modelling-options.md` | ✓ Done | Option 1 marked complete (Sprint 36); status table updated to reflect Sprint 54 delivery |
| S54.2 | Add `totalCost`/`costPerServed` to `CI_METRICS` + `METRIC_LABELS` | ✓ Done | Both metrics appear in replication aggregate tile grid and CI precision table automatically |
| S54.3 | Add `totalCost`/`costPerServed` to `ANALYSIS_METRICS` | ✓ Done | Available in batch-means metric selector dropdown |
| S54.4 | Cost summary section in `ResultsWorkspace` (single-run) | ✓ Done | `COST SUMMARY` section renders when `results.summary.totalCost > 0`; shows total cost, cost/served, and served count via `MetricStrip` |
| S54.5 | Per-entity cost: COST macro accumulates `entity.attrs.__cost` | ✓ Done | One-line addition in COST macro `apply()`; uses same pattern as `sojournTime` |
| S54.6 | Per-entity cost tests (2 new tests) | ✓ Done | `G17` describe block in `sprint-36-cost-api.test.js`; 13/13 tests pass |

---

## Files Changed

| File | Change |
|------|--------|
| `src/ui/execute/executeHelpers.js` | Added `"summary.totalCost"`, `"summary.costPerServed"` to `CI_METRICS` and `METRIC_LABELS` |
| `src/ui/results/ResultsWorkspace.jsx` | Added to `ANALYSIS_METRICS`; added `COST SUMMARY` section in `ResultsWorkspace` |
| `src/engine/macros.js` | COST macro: added `entity.attrs.__cost` accumulation |
| `tests/engine/sprint-36-cost-api.test.js` | 2 new per-entity cost tests added to G17 suite |
| `docs/cost-modelling-options.md` | Updated to reflect actual delivery state |
| `docs/reviews/sprint-54-plan.md` | Sprint plan created |

---

## Acceptance Criteria Outcomes

| Criterion | Outcome |
|-----------|---------|
| `totalCost` tile in replication aggregate results | ✓ — added to `CI_METRICS`; auto-renders in tile grid (line 1983 execute/index.jsx) |
| `totalCost` in CI precision table | ✓ — same `CI_METRICS` drives both |
| `totalCost`/`costPerServed` in batch-means dropdown | ✓ — added to `ANALYSIS_METRICS` |
| Single-run cost section in ResultsWorkspace | ✓ — renders when `totalCost > 0` |
| COST macro writes `entity.attrs.__cost` | ✓ — engine test confirms |
| Options document corrected | ✓ |
| Build passes | ✓ — `npx vite build --mode development` clean |
| Tests pass | ✓ — 13/13 sprint-36 cost tests pass |

---

## Implementation Notes

**`CI_METRICS` cascade effect**: Adding `totalCost` and `costPerServed` to `CI_METRICS` in `executeHelpers.js` automatically surfaces them in three places in `execute/index.jsx` that loop over `CI_METRICS`: the aggregate tile grid (line 1983), the CI precision table (line 2112), and the sample-size guidance section. No additional changes needed in those sections.

**Zero-suppression for cost section**: The `ResultsWorkspace` cost section only renders when `results.summary.totalCost > 0` — models that don't use the COST macro are unaffected and see no change to the UI.

**Per-entity cost key `__cost`**: The double-underscore prefix matches the existing internal engine convention (`__totalCost`, `__costByEvent` when added) and signals to the UI that this is an engine-managed attribute rather than a user-defined attribute.

---

## Gap Still Open

**Option 4 — Cost breakdown by event**: `state.__costByEvent[eventName]` accumulation and `summary.costBreakdown` are not yet implemented. Recommended Sprint 55 candidate.

**Entity Summary Table display**: `result.entitySummary[i].attrs.__cost` is now available but not yet shown in the EntitySummaryTable UI component. Low priority since per-entity data is available via export.

---

## Next Sprint

Sprint 55 candidate: Option 4 cost breakdown by event — `state.__costByEvent`, `summary.costBreakdown`, results panel breakdown table.
