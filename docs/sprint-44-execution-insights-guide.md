# Sprint 44 — Execution Panel Insights: Capability Guide

**Date:** 2026-05-15
**Status:** Delivered

---

## Overview

Sprint 44 upgrades the execution panel from a simple run-and-inspect workflow into a rich diagnostic workspace. Four new capabilities turn raw simulation output into immediately actionable insight:

1. **Enhanced Log Viewer** — filterable, searchable, exportable simulation event log
2. **Wait-Time Histograms** — per-queue wait-time distribution charts with percentile markers
3. **Entity Lifecycle Table** — per-entity journey audit with anomaly detection
4. **Goal-Aware KPI Cards** — aggregate results cards colour-coded against model performance goals

---

## 1 — Enhanced Log Viewer

### What changed

The inline log display (plain reversed list) has been replaced with a dedicated `LogViewer` component accessible via the **Log** button in the execution toolbar.

### Features

| Feature | Description |
|---------|-------------|
| **Phase filter chips** | One-click filtering by phase: A, B, C, INIT, WARMUP, REP, SAVE, ERROR, CANCEL, END. Only phases present in the current log are shown. Multiple filters can be active simultaneously. |
| **Text search** | Free-text search across message content and phase labels. Searches entity IDs, event names, queue names, and any message text. |
| **Entry count** | Header shows total entries and the current filtered count when a filter is active. |
| **CSV export** | Download the full log as a CSV file (phase, time, message) for post-processing in any spreadsheet tool. |
| **Clock display** | Current simulation clock shown in the header when available. |
| **Warm-up separator** | Warm-up end is visually marked with a banner row in the log. |

### When to use

- Diagnosing unexpected entity behaviour (e.g. why an entity reneged unexpectedly)
- Verifying event sequencing after model changes
- Auditing SAVE/ERROR events
- Extracting raw event data for external analysis via CSV export

---

## 2 — Wait-Time Histograms

### What changed

A new **Histograms** view is added to the execution toolbar, enabled after a run completes with wait-time distribution data.

### Features

| Feature | Description |
|---------|-------------|
| **Per-queue charts** | One histogram per queue with recorded wait times. |
| **Automatic binning** | Bins are computed from raw `waitDist` values (10 bins). If only percentile data is available, bins are approximated from p50/p90/p99 values. |
| **Percentile markers** | Vertical lines mark p50 (green), p90 (amber), and p99 (red) on each chart. |
| **Summary statistics** | Each chart shows n (sample count), mean, p90, and p99 below the bars. |
| **Queue label** | Each histogram is labelled with its queue name. |

### When to use

- Identifying queues with long tail waits (p99 >> p50 indicates high variability)
- Comparing wait distributions across queues to find the bottleneck
- Verifying that a configuration change has reduced tail latency, not just the mean
- Presenting results to stakeholders (the shape of the distribution tells the story the mean cannot)

---

## 3 — Entity Lifecycle Table

### What changed

The basic entity status table (id/type/status/queue) has been replaced by a full lifecycle audit table accessible via the **Entities** view button, enabled when entity summary data is available.

### Features

| Feature | Description |
|---------|-------------|
| **Per-entity lifecycle** | One row per entity showing: id, type, status/outcome, arrival time, wait time, service time, sojourn (end-to-end) time, and attributes. |
| **Sortable columns** | Click any column header to sort ascending; click again to sort descending. |
| **Type filter** | Dropdown to filter rows by entity type. |
| **Outcome filter** | Dropdown to filter by outcome status (e.g. served, reneged, balked). |
| **Anomaly detection** | Entities with wait > 3× the model's mean wait are flagged with an ⚠ badge and an amber row highlight. |
| **Anomaly banner** | When anomalies are present, a banner above the table reports the count: *"N entities with wait > 3× mean"*. |
| **Attribute display** | Any entity attributes (e.g. priority, customer segment) are shown in the Attrs column. |

### When to use

- Investigating individual entity journeys after a suspicious aggregate result
- Finding outlier entities that experienced unusually long waits
- Verifying entity attribute assignments (e.g. priority routing)
- Auditing reneged/balked entities to understand loss patterns

---

## 4 — Goal-Aware KPI Cards

### What changed

The aggregate results KPI cards (shown after a multi-replication batch completes) now evaluate each metric against the model's performance goals and display a visual pass/fail indicator.

### Behaviour

When performance goals are set on the model:

- **Green border + ✓** — the metric's mean satisfies the goal target
- **Red border + ✗** — the metric's mean misses the goal target
- **Default (grey border)** — no goal is defined for this metric

Goal evaluation uses the goal's operator (`<`, `<=`, `>`, `>=`) and the mean of the aggregate distribution, matching the same logic used in the sweep feasibility evaluation.

### Example

With goal `avgWait < 3`:
- If aggregate mean avgWait = 2.1 → card shows green border + ✓
- If aggregate mean avgWait = 4.7 → card shows red border + ✗

### When to use

Goals-aware KPI cards give an immediate verdict at the top of the results panel: you can see at a glance which objectives the current configuration meets and which it fails, without cross-referencing the Goals editor manually.

---

## Execution toolbar — updated button set

The execution toolbar now has five view buttons:

| Button | View | Enabled when |
|--------|------|--------------|
| **Live View** | Canvas + bottom panel | Always |
| **Analysis** | ResultsWorkspace | After run completes |
| **Log** | Enhanced LogViewer | Always (log may be empty) |
| **Histograms** | Per-queue wait histograms | After run with waitDist data |
| **Entities** | Entity lifecycle table | After run with entitySummary data |

---

## Files changed

| File | Change |
|------|--------|
| `src/ui/execute/LogViewer.jsx` | New file — `LogViewer` component with phase filters, text search, CSV export |
| `src/ui/execute/SweepViews.jsx` | Added `QueueHistogram` and `EntitySummaryTable` components |
| `src/ui/execute/index.jsx` | Imports `LogViewer`, `QueueHistogram`, `EntitySummaryTable`; adds Log/Histograms/Entities view buttons; replaces inline log and entity views; goal-aware KPI card colouring |

---

## Recommended workflow

1. **Run the model** (single run or batch of replications).
2. **Check KPI cards** — goal pass/fail badges give an instant summary verdict.
3. **Switch to Histograms** — inspect wait-time distributions for each queue. Look for long tails (p99 >> mean) that indicate high-variability queues.
4. **Switch to Log** — filter by ERROR or CANCEL to catch any simulation issues; filter by a specific queue name to trace entity flow.
5. **Switch to Entities** — look for anomaly-flagged rows (amber, ⚠). Review their arrival times and attributes to understand why they experienced long waits.
6. **Export** — use CSV export from the Log view for detailed post-processing, or use the existing Export Results / Export Results CSV buttons for summary data.

---

## What's next (Sprint 45 candidates)

- **Log in BottomPanel** — wire `LogViewer` into the BottomPanel's Step Log tab to replace the existing plain log there too.
- **Histogram per-replication** — overlay replication histograms to visualise distribution variance across runs.
- **loopConfig and balkCondition engine wiring** — the UI fields added in Sprint 42 need engine-side evaluation to generate loop guard and balk condition events.
- **AI comparison mode** — when goals are set, the comparison prompt should assess both runs against goal gaps.
