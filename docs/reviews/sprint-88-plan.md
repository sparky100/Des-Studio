# Sprint 88 — Export Consolidation & Data Portability

**Sprint:** 88
**Theme:** One-click data export with documented schemas — get results into Excel, Python, and R without friction
**Status:** ✅ Complete
**Branch:** `claude/sprint-88-export-consolidation`
**Completed:** 2026-06-30

---

## Goal

Users had to hunt across 5+ separate export buttons in 4 locations (Execute panel, ResultsWorkspace, ModelHistoryTab, LogViewer). Per-chart CSV export required clicking each chart individually. JSON export had no documented schema. This sprint consolidates all exports behind a single **"Export ▾"** popover, adds a one-click **"Download all chart data"** button, extends the JSON payload with entity journey data, and provides a schema reference modal.

---

## Pre-Sprint Assessment

### What Already Existed

| Capability | Location | Robustness |
|---|---|---|
| JSON export (full + metrics-only) | `executeHelpers.js:473-521` | Full: schema `simmodlr.results.v1` |
| CSV export (per-replication + aggregates) | `executeHelpers.js:523-581` | Full: 14 columns + aggregate block |
| Per-chart CSV export | `ResultsWorkspace.jsx:134-150` | Full: `buildSeriesCsv`, `buildWaitValuesCsv` |
| LLM Bundle (.md) | `bundleExport.js:36-553` | Full |
| HTML/Markdown reports | `reportGenerator.js` | Full |
| Run history export | `utils.js:73-109` | Full |
| Log export (CSV) | `LogViewer.jsx:12-19` | Full |

### What Was Missing

| Gap | Impact |
|---|---|
| Export buttons scattered (4+ separate triggers) | Users hunt for the right button |
| No "Download all chart data" | Must click each chart's CSV individually |
| JSON schema not documented | External tool users guess field names |
| Entity journey data not in export | Cannot analyze per-entity behaviour externally |
| Checkbox-based export popover (multi-step) | Friction: check format → click Download |

---

## Scope Guardrails

- **No new dependencies.** All CSV/JSON generation stays pure JS.
- **No database changes.** No migrations, no new columns.
- **Preserve all existing export paths.** Backward compatible.
- **UI changes only in:** `execute/index.jsx`, `ResultsWorkspace.jsx`, `executeHelpers.js`.
- **Engine changes: none.**

---

## Architecture

### Unified Export Popover

Single "Export ▾" dropdown with clickable rows sectioned by audience:

```
┌──────────────────────────────────────┐
│ RESULTS DATA                         │
│  Full model results (.json)          │
│  Metrics only (.json)                │
│    — KPIs only, no entity data       │
│  Results table (.csv)                │
├──────────────────────────────────────┤
│ AI & REPORTS                         │
│  LLM Bundle (.md)                    │
│    — Model + results as Markdown     │
│  Create Report…                      │
├──────────────────────────────────────┤
│ REFERENCE                            │
│  Schema reference                    │
│    — Field-by-field JSON format docs │
└──────────────────────────────────────┘
```

### Download All Chart Data

Button in ResultsWorkspace header collects all chart series from `chartModel.chartSections`, concatenates into a single CSV with section headers (`# Section: name`).

### Entity Journeys

New `buildEntityJourneys(entitySummary)` normalizer flattens engine entity data into a tabular-friendly structure:

```json
[{
  "entityId": "e_42", "type": "Customer", "arrivedAt": 0, "completedAt": 12.5,
  "status": "done",
  "stages": [{ "queue": "Checkout", "wait": 3.2, "server": "Cashier", "service": 1.8 }],
  "outcome": { "routeId": "route-exit:main", "routeLabel": "Served", "status": "completed" }
}]
```

---

## Implementation Phases

### Phase 1 — Unified Export Popover
**Files:** `src/ui/execute/index.jsx`
- Replaced checkbox-based "Export Data" popover + "Create Report" button + "Export for AI tools" button with single "Export ▾" dropdown
- Added `PopoverRow` component for clickable rows with optional hint text
- Removed `exportFormats` and `exportMetricsOnly` state (replaced by direct row clicks with specific params)

### Phase 2 — Download All Chart Data
**Files:** `src/ui/results/ResultsWorkspace.jsx`
- Added `handleDownloadAllChartData()` callback — collects series/distributions from all chart sections
- Added `hasChartData` detection
- Added "⬇ Download all chart data (.csv)" and "AI tools (.md)" toolbar buttons

### Phase 3 — Schema Reference Modal
**Files:** `src/ui/execute/index.jsx`
- Added `SchemaInfoModal` component with inline copyable schema reference
- Added `SCHEMA_REFERENCE_TEXT` constant documenting the full JSON export structure
- Added "Schema reference" row in export popover → opens modal with "Copy schema" button

### Phase 4 — Entity Journeys
**Files:** `src/ui/execute/executeHelpers.js`
- Added `buildEntityJourneys(entitySummary)` normalizer
- Filters out server entities, maps stages to `{ queue, wait, server, service }`, maps outcome sub-object
- Wired into `buildResultsExportPayload` — included when `metricsOnly=false`, excluded when `metricsOnly=true`
- Exported from both `executeHelpers.js` and `index.jsx`

### Phase 5 — Tests
**Files:** `tests/ui/execute/results-export.test.jsx`
- 7 new tests: `buildEntityJourneys` (null input, server filter, field mapping, empty stages, non-finite values, included in payload, excluded when metricsOnly)
- Updated button name assertions: "Export Data" → "Export ▾"
- Updated JSON payload assertion to include `entityJourneys`

---

## Exit Gates

| Gate | Status |
|---|---|
| All export-specific tests pass | ✅ 12/12 |
| Production build succeeds | ✅ `npm run build` |
| Single "Export ▾" button replaces scattered buttons | ✅ |
| Download all chart data produces valid CSV | ✅ |
| Schema modal displays JSON schema reference | ✅ |
| Entity journeys included in JSON export | ✅ |

---

## Files Changed

| File | Change |
|---|---|
| `src/ui/execute/index.jsx` | MODIFY: unified export popover, PopoverRow, SchemaInfoModal, removed checkbox UX |
| `src/ui/execute/executeHelpers.js` | ADD: `buildEntityJourneys()`, wire into `buildResultsExportPayload()` |
| `src/ui/results/ResultsWorkspace.jsx` | ADD: `handleDownloadAllChartData()`, export toolbar buttons |
| `tests/ui/execute/results-export.test.jsx` | ADD: 7 entity journey tests, update button name assertions |
| `docs/reviews/sprint-88-plan.md` | NEW: this document |

---

## Built-With Rules

- No new dependencies
- No database changes
- No engine changes
- All styling via `tokens.js`
- Backward compatible — all existing export functions unchanged
- SPrint 66 F66.3 ("Export consolidation") absorbed into this sprint
