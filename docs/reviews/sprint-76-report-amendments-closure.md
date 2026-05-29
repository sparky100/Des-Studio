# Sprint 76 — Report Amendments: Closure Report

**Sprint:** 76
**Theme:** Management and technical report presentation improvements
**Status:** ✅ Complete | **Completed:** 2026-05-29
**Branch:** `claude/reports-amendments-03l7y`
**File:** `src/reports/reportGenerator.js`

---

## Goal

Improve the quality and clarity of generated HTML and Markdown reports by fixing duplicate content, generic labels, unreadable chart axes, missing methodology context, and absent performance goal references. All changes confined to a single file.

---

## Delivered Features

### 1 — Remove duplicate Model Description section

The standalone `buildModelDescription` section at the top of the report was removed. The description now appears inside the Executive Summary instead, eliminating the redundant block that previously preceded it.

---

### 2 — Entity name substitution throughout labels

Added `getEntityName(model)` helper that finds the entity type with `role === 'customer'` and returns its name (e.g. `Train`, `Patient`, `Customer`). Applied across all KPI labels, summary table rows, and Markdown output — replacing generic "entity/entities" references.

---

### 3 — Integer formatting for served/reneged counts

Added `formatInt(value)` helper returning `String(Math.round(Number(value)))`. Used everywhere `served` and `reneged` counts are formatted (KPI cards, summary table, Markdown table), preventing decimal values such as "120.3" on whole-number counts.

---

### 4 — Per-stage wait and service time breakdown (multi-stage models)

Added `computePerQueueServiceTimes(results)` that groups `stageService` values from `entitySummary` by queue name, computing `{ n, mean, p50, p90 }` per queue. When multiple queues exist, the queue wait table gains a "Mean service" column and the journey breakdown chart receives per-stage data.

---

### 5 — Angled x-axis labels in queue wait chart

`groupedBarChart` bottom margin increased from 72 → 96. X-axis labels rotated to −40° (`transform="rotate(-40, x, y)"`, `text-anchor="end"`) to prevent overlap on models with multiple queues.

---

### 6 — Wrapped resource utilisation chart labels

Added `wrapSvgLabel(text, maxLen)` that splits labels on word boundaries into up to three `<tspan>` lines. Left margin increased 110 → 140; row height increased 30 → 36 to accommodate multi-line labels. Replaces the old hard-truncation approach.

---

### 7 — Scope & Methodology section

Added `buildMethodology(model, results, experimentConfig)` and `detectArrivalMode(model, summary)`. The section appears after the Executive Summary and covers:

1. **Arrival pattern** — identifies plan-based vs stochastic models; for stochastic models shows distribution and mean
2. **Warm-up** — included when `warmupPeriod > 0`
3. **Replications** — included when `replications ≥ 2`
4. **Performance goals** — bullet-listed when `model.goals.length > 0`

For plan-based models an arrival-time histogram is generated from `entitySummary.arrivalTime` values.

**Detection logic** covers: `scheduleRef`, `distParams.rows/times`, `dist === 'Schedule'`, and `summary.avgPlanDeviation` — so Glasgow Central and similar timetable-heavy models are correctly identified as plan-based.

Equivalent Markdown block added in `buildMarkdownReport`.

---

### 8 — Intro paragraph before Simulation Results

`buildResults` now prepends a `<p class="note">` (and Markdown blockquote) that states which queues and resource types are covered and references performance goals if set. For large models the summary condenses to "X-stage process / X resource types" rather than listing every name.

---

### 9 — Goal status in Executive Summary

`buildExecutiveSummary` now calls `buildGoalGaps` and, if any goals exist, appends a one-line status badge: "**Goal status:** N of M performance targets met ✅/❌". Equivalent line added to the Markdown "Key Results" section.

---

### Back-compat: model diagram wiring

`buildModelImage` was defined but never called. Fixed:
- `generateReport` now accepts both old-style string 5th arg (back-compat) and new-style `options.modelImageDataUrl`
- `buildHtmlReport` receives and renders `modelImageDataUrl` via `buildModelImage` (placed after the Executive Summary)

---

## Tests

| Suite | Result |
|---|---|
| `src/reports/__tests__/reportGenerator.test.js` | 13/13 ✅ |

Two stale test assertions updated:
- `'Model Description'` → `'Scope &amp; Methodology'` (section was renamed)
- `not.toContain('Experiment Configuration')` → `toContain(...)` (technical report correctly includes it)

---

## Schema / Contract Changes

No schema changes. All changes are presentation-only inside `reportGenerator.js`.

---

## Exit Gate

- [x] `getEntityName`, `formatInt`, `computePerQueueServiceTimes`, `detectArrivalMode`, `wrapSvgLabel` helpers added
- [x] `groupedBarChart` — angled labels, larger bottom margin
- [x] `horizBarChart` — wrapped labels, larger left margin, taller rows
- [x] `buildExecutiveSummary` — goal status badge
- [x] `buildMethodology` — arrival mode, warm-up, replications, goals
- [x] `buildResults` — intro paragraph
- [x] `buildHtmlReport` — model image wired; methodology section added
- [x] `buildMarkdownReport` — methodology block, condensed scope
- [x] `generateReport` — back-compat string/options 5th arg handled
- [x] 13/13 report tests pass
