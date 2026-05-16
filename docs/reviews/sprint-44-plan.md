# Sprint 44 — Execution Panel Insights
**Sprint:** 44 — Execution Panel Insights
**Branch:** sprint-44 (merged, PR #39)
**Date:** 2026-05-15

## Objective
The execution panel provided only a reversed log list and a simple entity status table, with no search, no filtering, no wait-time distributions, and no entity lifecycle analysis. This sprint transforms the panel into an analysis workspace by adding a filterable log viewer, per-queue wait histograms, a sortable entity summary table with anomaly detection, and goal-aware KPI cards.

## Background
After a simulation run completes, users need to diagnose bottlenecks, validate model behaviour, and compare results against goals. The existing execution panel provided raw log entries in reverse order — readable for debugging but not for analysis. The entity table (id, type, status, queue) was static with no sorting, filtering, or anomaly flagging. There were no visualisations of wait-time distributions, which are central to understanding queue behaviour in DES. Three toolbar buttons ("Log", "Histograms", "Entities") existed in the UI but had no connected functionality.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S44.1 | New LogViewer component — phase filter chips, free-text search, CSV export, clock display, warm-up separator | src/ui/execute/LogViewer.jsx (new file) |
| S44.2 | QueueHistogram component — per-queue wait distribution bar charts with percentile markers | src/ui/execute/SweepViews.jsx |
| S44.3 | EntitySummaryTable component — sortable, filterable, anomaly detection | src/ui/execute/SweepViews.jsx |
| S44.4 | Goal-aware KPI cards in index.jsx — green/red border with ✓/✗ indicator | src/ui/execute/index.jsx |
| S44.5 | Three toolbar buttons (Log, Histograms, Entities) wired to panel views in index.jsx | src/ui/execute/index.jsx |

## Acceptance Criteria
- LogViewer renders phase filter chips for A, B, C, INIT, WARMUP, REP, SAVE, ERROR, CANCEL, END; selecting a chip filters the log to that phase only
- LogViewer includes a free-text search input that filters log entries by matching entry text
- LogViewer provides a "Export CSV" button that downloads the currently-filtered log entries as a CSV file
- LogViewer shows total entry count and current simulation clock value
- A warm-up separator banner is displayed at the boundary between warm-up and steady-state entries
- QueueHistogram shows a bar chart of wait-time distribution for each queue, using 10 bins; bins are computed from raw wait values or approximated from percentile data when raw values are unavailable
- QueueHistogram renders vertical marker lines for p50 (green), p90 (amber), and p99 (red) percentiles
- A summary row below each histogram shows n, mean, p90, and p99 values
- EntitySummaryTable is sortable by clicking any column header (id, type, status, arrivalTime, wait, service, sojourn, attrs)
- EntitySummaryTable provides type and outcome (status) filter dropdowns
- Entities with wait time more than 3 times the mean wait are highlighted with an amber row background and a ⚠ badge
- An anomaly count banner at the top of the table reports the total number of anomalous entities
- KPI cards in index.jsx show a green border and ✓ when the card's metric meets its model goal; red border and ✗ when missed
- The Log, Histograms, and Entities toolbar buttons each switch the panel to the respective view

## Dependencies
- Sprint 43: model.goals available and goal evaluation logic present in prompts.js (KPI cards use goal compliance)
- Engine must produce per-entity wait, service, and sojourn times in the run result object
- Engine must produce per-queue wait value arrays or percentile summaries
- Existing toolbar button elements must be present in index.jsx (to be wired rather than created)
- SweepViews.jsx must be the established location for execution-panel visualisation components
