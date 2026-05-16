# Sprint 54 — Cost Modelling Visibility
**Date:** 2026-05-16
**Branch:** sprint-47a
**Status:** Planned

---

## Context

`docs/cost-modelling-options.md` defines four options for surfacing the existing cost modelling capability. The audit below shows what has already been delivered and what remains.

### Gap Analysis vs. the Options Document

| Option | Document status | Actual codebase state |
|--------|----------------|----------------------|
| 1 — Effect builder visibility | Listed as not done | **Already done** — `COST()` appears in `bEffectOptions` and `assignOptions` in `helpers.jsx` (Sprint 36) |
| 2a — Summary stat tiles | Not done | Not done — `totalCost`/`costPerServed` absent from `CI_METRICS` and `METRIC_LABELS`; no display in ResultsWorkspace for single runs |
| 2b — Analysis metrics | Not done | Partially done in sweep/goal keys but missing from `ANALYSIS_METRICS` dropdown in ResultsWorkspace |
| 3 — Per-entity cost | Not done | Not done — COST macro only writes to `state.__totalCost`; no per-entity accumulator |
| 4 — Cost breakdown by event | Not done | Not done — deferred as follow-on |

### Document Accuracy Issue
The options document is dated 2026-05-15 and incorrectly lists Option 1 as outstanding. It needs updating to reflect the current state.

---

## Sprint Goal

Surface the existing cost data in all results views (Options 2a + 2b), add per-entity cost tracking (Option 3), and correct the options document. Option 4 is deferred.

---

## Tasks

| ID | Task | File(s) | Effort |
|----|------|---------|--------|
| S54.1 | Update `cost-modelling-options.md` — mark Option 1 complete, correct status table | `docs/cost-modelling-options.md` | Tiny |
| S54.2 | Add `totalCost` and `costPerServed` to `CI_METRICS` and `METRIC_LABELS` | `src/ui/execute/executeHelpers.js` | Small |
| S54.3 | Add `totalCost` and `costPerServed` to `ANALYSIS_METRICS` | `src/ui/results/ResultsWorkspace.jsx` | Small |
| S54.4 | Add cost summary section in `ResultsWorkspace` (single-run display) | `src/ui/results/ResultsWorkspace.jsx` | Small |
| S54.5 | Per-entity cost: accumulate to `entity.attrs.__cost` in COST macro | `src/engine/macros.js` | Small |
| S54.6 | Per-entity cost tests | `tests/engine/sprint-36-cost-api.test.js` | Small |

---

## Acceptance Criteria

| Criterion | How to verify |
|-----------|--------------|
| `totalCost` tile appears in replication batch aggregate results | Run 2+ replications with COST macro; check aggregate tiles |
| `totalCost` row appears in CI precision table | Same as above |
| `totalCost` / `costPerServed` selectable in batch-means dropdown | Open ResultsWorkspace Analysis tab |
| Single-run ResultsWorkspace shows cost section when `totalCost > 0` | Single run with COST macro; check Analysis tab |
| COST macro accumulates `entity.attrs.__cost` | Engine test |
| `docs/cost-modelling-options.md` accurately reflects Option 1 as complete | Read the file |
| Build passes | `npx vite build --mode development` |
| Tests pass | `npm test -- --run` |

---

## Out of Scope

- Option 4 (cost breakdown by event) — medium-large engine change; scheduled as Sprint 55 candidate
- UI display of per-entity cost in the Entity Summary Table — stretch goal, not committed
