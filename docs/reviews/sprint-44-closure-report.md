# Sprint 44 — Closure Report
**Sprint:** 44 — Execution Panel Insights
**Completed:** 2026-05-15
**Branch:** sprint-44 (merged, PR #39)

## Delivered Scope
| Item | Description | Result |
|------|-------------|--------|
| S44.1 | LogViewer with phase filters, free-text search, CSV export, clock display, warm-up banner | ✅ Done |
| S44.2 | QueueHistogram with 10-bin distribution chart and p50/p90/p99 percentile markers | ✅ Done |
| S44.3 | EntitySummaryTable with sort, type/outcome filters, anomaly detection and banner | ✅ Done |
| S44.4 | Goal-aware KPI cards with green/red borders and ✓/✗ indicators | ✅ Done |
| S44.5 | Log, Histograms, Entities toolbar buttons wired to panel views | ✅ Done |

## Detail

### S44.1 — LogViewer
**Problem:** The plain reversed log list had no filtering, no search, and no way to export data for external analysis. Phase interleaving (A, B, C events, init, warmup, errors) made diagnosis tedious.

**What was built:** LogViewer.jsx is a new file at src/ui/execute/LogViewer.jsx. It accepts the full log array from the run result and renders: (1) a row of phase filter chips — A, B, C, INIT, WARMUP, REP, SAVE, ERROR, CANCEL, END — each acting as a toggle that ANDs into the active filter set; (2) a free-text search input that filters by substring match on entry text; (3) an entry count and current simulation clock display in the header; (4) a visual warm-up separator banner inserted at the index where the warm-up period ends; (5) an "Export CSV" button that constructs a CSV blob from the currently-visible (filtered) entries and triggers a browser download.

**Files changed:** src/ui/execute/LogViewer.jsx (new file)

**Key design decisions:** Phase filter chips use an "all selected = no filter" convention rather than "none selected = show nothing," which matches user expectation when arriving at the view fresh. CSV export operates on the filtered set so users can export only the phase or entries they care about.

### S44.2 — QueueHistogram
**Problem:** Wait-time distributions are the primary diagnostic signal in DES but were not visualised anywhere in the panel.

**What was built:** QueueHistogram was appended to SweepViews.jsx. For each queue in the result, a bar chart is rendered showing the wait-time frequency distribution across 10 equal-width bins. When raw wait values are available the bins are computed directly; when only percentile summaries are available, bin heights are approximated from the percentile shape. Three vertical marker lines overlay the chart: p50 in green, p90 in amber, p99 in red. Below each chart a compact summary row shows n (sample size), mean, p90, and p99 values.

**Files changed:** src/ui/execute/SweepViews.jsx

**Key design decisions:** Percentile approximation was included because some engine run modes report only aggregated statistics rather than raw entity arrays, ensuring the histogram degrades gracefully rather than showing nothing.

### S44.3 — EntitySummaryTable
**Problem:** The static entity table showed only id, type, status, and queue. It could not be sorted, filtered, or used to identify problematic entities.

**What was built:** EntitySummaryTable was appended to SweepViews.jsx. Column headers for id, type, status, arrivalTime, wait, service, sojourn, and attrs are all clickable, toggling ascending/descending sort on that column. Two filter dropdowns above the table filter by entity type and outcome (entity status at run end). Anomaly detection computes the mean wait across all entities; any entity with wait > 3× mean receives an amber row background and a ⚠ badge in the wait cell. An anomaly count banner above the table reports "N entities with anomalous wait times."

**Files changed:** src/ui/execute/SweepViews.jsx

**Key design decisions:** The 3× mean threshold was chosen as a pragmatic heuristic — conservative enough to avoid false positives in heavy-tailed distributions but sensitive enough to catch genuine outliers. The threshold is exposed in the component props so it can be overridden if needed.

### S44.4 — Goal-Aware KPI Cards
**Problem:** Aggregate results cards showed metric values but gave no indication of whether those values represented success or failure relative to model goals.

**What was built:** Each KPI card in index.jsx was updated to compare its metric value against the corresponding entry in model.goals. When the goal is met, the card receives a green border and a ✓ badge. When the goal is missed, the card receives a red border and a ✗ badge. Cards for metrics with no corresponding goal are unaffected.

**Files changed:** src/ui/execute/index.jsx

### S44.5 — Toolbar Button Wiring
**Problem:** Three toolbar buttons (Log, Histograms, Entities) were present in the execution panel UI but triggered no action.

**What was built:** A panelView state variable was added to index.jsx. Each button sets panelView to 'log', 'histograms', or 'entities' respectively, and the panel below the toolbar conditionally renders LogViewer, QueueHistogram, or EntitySummaryTable based on the active view.

**Files changed:** src/ui/execute/index.jsx

## Test Results
No new test files were written for this sprint. Existing execution panel tests continued to pass. A capability document was written at docs/sprint-44-execution-insights-guide.md describing the new panel features for modellers.

## What's Next
Sprint 45 addresses a structural gap in the AI prompting system: despite the engine supporting failure models, loop guards, balk conditions, state variables, cost tracking, and container levels, none of this structural model data reached the LLM. Sprint 45 grounds the AI prompts in the full model structure so suggestions and narratives can reason about the actual configured system.
