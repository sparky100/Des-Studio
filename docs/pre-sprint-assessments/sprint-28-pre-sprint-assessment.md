# Sprint 28 Pre-Sprint Assessment — Inventory Report

**Date:** 2026-05-14 | **Branch:** `claude/sprint-28-inventory-BDYGg`
**Codebase base:** Sprint 27 closure complete. Sprint 28 scope not yet started.

---

## Area 1: Experiment and Run Configuration Storage

### 1a. Supabase table for named experiment configurations

**ABSENT.**

No dedicated table exists for saving named experiment configurations. The only persistence paths are:

- `model_json.experimentDefaults` (inside the `des_models` row) stores the last-used values for `warmupPeriod`, `maxSimTime`, `replications`, `terminationMode`, `terminationCondition` — written back automatically when values change in the Execute panel (`src/ui/execute/index.jsx:123-133`). This is a single unnamed slot per model, not a named/versioned config.
- `simulation_runs` stores per-run config fields (`replications`, `max_simulation_time`, `warmup_period`, `seed`) but these are run records, not reusable saved configs.

No `experiment_configs` or equivalent table exists in the migration set (`supabase/migrations/`).

### 1b. UI in Execute panel for naming or saving a run configuration

**PARTIAL.**

The Execute panel (`src/ui/execute/index.jsx:58`, rendered at ~line 880) has a free-text **Run Label** field (`runLabel` state), which is saved into `results_json.runLabel` when the run completes. This is a post-hoc label on a run record, not a pre-run named configuration.

There is no "Save this configuration" button, no configuration picker, and no way to restore a previously saved set of (seed, warmup, replications, maxSimTime, terminationMode) as a named preset.

### 1c. Existing concept of "scenarios" or "parameter sets"

**PARTIAL.**

Three related but incomplete concepts exist:

1. **`compareScenarios()`** (`src/engine/statistics.js:424`) — a pure function comparing two arrays of replication results with paired-t + Bonferroni. No associated UI data structure persists a "scenario" as a named entity.
2. **Parametric sweep** (`src/engine/sweep-params.js`, `src/engine/sweep-runner.js`) — generates sweep points over a parameter range; results saved to the `sweeps` table. These are parameter-axis explorations, not named scenario presets.
3. **Loose text references** (`src/ui/ModelDetail.jsx:499-501`) — the word "scenario" appears in UI copy only, not as a data structure.

No formal schema for a reusable named scenario (named parameter overrides + config values) exists.

---

## Area 2: Statistical Helpers

### 2a. Confidence interval calculation

**EXISTS — `src/engine/statistics.js:61` — `confidenceInterval95(values)`**

Inputs: `values[]` (flat array of numbers; non-finite values silently dropped).
Returns: `{ n, mean, lower, upper, halfWidth }`.

Half-width is returned alongside both bounds. The t-critical value is looked up from a hard-coded table for df 1–30, then defaults to 1.96 for df > 30 (`tCritical95()` at line 56).

### 2b. Relative precision (halfWidth / mean × 100)

**ABSENT.**

No function computes relative precision anywhere in `src/`. The `halfWidth` field is calculated and displayed, but no percentage-of-mean transformation is applied. The term does not appear in any source file.

### 2c. Sample-size estimation / "how many replications?" guidance

**ABSENT.**

No sample-size estimation or minimum-replications calculator exists anywhere in the codebase. The `suggestBatchSize()` function (`src/engine/statistics.js:601`) automates batch sizing for batch-means CI within a single long run, but that is not a replication-count advisor.

### 2d. IQR or outlier detection

**ABSENT (IQR not computed; percentiles only).**

`computePercentiles(values, [5,25,50,75,95])` (`src/engine/statistics.js:534`) computes p25 and p75 but does not compute IQR (p75 − p25) or apply any outlier rule (e.g., 1.5 × IQR fence). No outlier flagging function exists anywhere in the codebase.

### 2e. Cumulative mean / running mean

**ABSENT (as an exported function).**

An internal `movingAverage(points, windowSize)` function exists at `src/engine/statistics.js:145`, but it is **not exported** and is used only internally by `detectWarmupWelch()`. It computes a centred window average of a `{t, value}` time-series, not a cumulative mean. No `cumulativeMean` or `runningMean` export exists.

### 2f. Complete function inventory — `src/engine/statistics.js`

| Function | Exported | Description |
|---|---|---|
| `mean(values)` | ✓ | Sample mean; drops non-finite values |
| `sampleVariance(values)` | ✓ | Sample variance; n−1 denominator |
| `sampleStdDev(values)` | ✓ | Square root of sample variance |
| `tCritical95(df)` | ✓ | Two-tail t-critical value at 95% from lookup table (df 1–30), then 1.96 |
| `confidenceInterval95(values)` | ✓ | 95% t-based CI; returns {n, mean, lower, upper, halfWidth} |
| `summarizeReplicationResults(results, metricPaths)` | ✓ | Applies `confidenceInterval95` to multiple dot-path metrics across replication results |
| `pairedTConfidenceInterval(a, b)` | ✓ | Paired-t CI on differences; returns {n, meanDiff, lower, upper, halfWidth, pValue:null} |
| `detectWarmupWelch(replications, metricPath, options)` | ✓ | Welch's graphical warm-up: ensemble average → moving average → knee detection; returns {truncationPoint, explanation, series, confidence} |
| `bonferroniCI(comparisons, alpha)` | ✓ | Applies Bonferroni correction to pre-computed comparison objects; adds correctedAlpha, bonferroniHalfWidth, significant95, significant99 |
| `compareScenarios(scenarioA, scenarioB, metricPaths, options)` | ✓ | Multi-metric paired-t with Bonferroni; returns {comparisons, significant, any95, any99, labels} |
| `computeSummaryStats(values)` | ✓ | Skewness (adjusted Fisher-Pearson), excess kurtosis, isApproxNormal flag; returns {n, mean, stdDev, skewness, kurtosis, isApproxNormal} |
| `computePercentiles(values, percentiles)` | ✓ | R-7 linear interpolation; default [5,25,50,75,95]; returns {p5, p25, p50, p75, p95, n} |
| `suggestBatchSize(values, options)` | ✓ | Heuristic batch size for batch-means CI; increases until lag-1 autocorrelation < 0.1 |
| `batchMeansCI(values, batchSize)` | ✓ | Batch-means CI; returns {n, batchSize, batchCount, mean, lower, upper, halfWidth, lag1Rho} |
| `finiteValues(values)` | ✗ private | Filters non-finite values |
| `linearInterpolate(series, targetT)` | ✗ private | Linear interpolation for ensemble averaging in Welch's method |
| `movingAverage(points, windowSize)` | ✗ private | Centred moving average of {t, value} series |
| `findKnee(points)` | ✗ private | Midpoint-crossing heuristic for Welch's truncation point |
| `lag1Autocorrelation(values)` | ✗ private | Lag-1 autocorrelation for batch-means batch-size advisor |
| `tCriticalBonferroni(df, m, alpha)` | ✗ private | Approximate Bonferroni-corrected t-critical value |

---

## Area 3: Results Display and CI Presentation

### 3a. Where are CIs currently displayed in the UI?

**Two locations in `src/ui/execute/index.jsx`:**

1. **Compact aggregate card grid** (`index.jsx:1642–1683`) — appears after a replication batch completes (`batchStatus === "complete"`). Renders one card per metric in CI_METRICS, showing `mean` (large) and `±halfWidth (95% CI)` (small muted).

2. **Full CI table** (`index.jsx:1720–1750`) — rendered whenever any metric has `n >= 2`. Columns: Metric | Mean | Lower 95% | Upper 95% | Half-width | n.

**One location in the sweep comparison UI** (`index.jsx:1378`, `index.jsx:1472`) — scenario comparison rows show `[lower, upper]` bounds in bracket notation.

**One location in `src/ui/results/ResultsWorkspace.jsx`** — the Analysis section calls `batchMeansCI()`, `computeSummaryStats()`, and `computePercentiles()` and renders results in the ANALYSIS_METRICS display block.

### 3b. Fields shown alongside each CI

In the compact cards: mean, half-width label only. In the full CI table: metric label, mean, lower 95%, upper 95%, half-width, n. **Relative precision is not shown anywhere.**

### 3c. Per-replication KPI breakdown

**EXISTS — `src/ui/execute/index.jsx:1686–1718`.**

A table with one row per completed replication: Rep #, Seed, Served, Avg wait, Avg service, Avg sojourn, Status ("complete" tag). Visible during and after a replication batch. No reneged count column. No "status = warning" variant.

### 3d. Replication outlier or anomaly indicator

**ABSENT.**

No outlier flag, anomaly badge, or colour-coded deviation indicator appears in either the per-replication table or the aggregate CI cards. Extreme replication values are displayed identically to typical ones.

---

## Area 4: Warm-up and Transient Analysis

### 4a. Warm-up implementation in the engine

**EXISTS — `src/engine/index.js:225–326`.**

When `warmupPeriod > 0`, a synthetic `{ type: "WARMUP", name: "Warm-up complete", scheduledTime: warmupPeriod }` event is inserted into the FEL before the sort. When Phase B processes this event:

- `_warmupComplete = true`, `_statsResetTime = clock`
- `state.__served` and `state.__reneged` are zeroed
- State variables with `resetOnWarmup: true` are reset to `initialValue`
- Entities with `status === "done"` or `status === "reneged"` are **purged** from the entity pool; in-flight (waiting, serving) entities are **retained**
- Metric calculations use `truncateInterval(start, end)` (`index.js:521–524`) which clamps to `max(start, _statsResetTime)` — so wait/service times before warm-up are excluded from aggregates

**What is excluded:** finalised-entity counts (served, reneged) and timed KPIs (avgWait, avgSvc, avgSojourn) accumulated before `_statsResetTime`. In-flight entities at warm-up boundary keep their in-progress service; their wait time is truncated.

### 4b. Per-observation KPI values stored in the result object

**EXISTS — partial.**

Individual entity wait observations are stored in the `waitDist` object returned from `computeWaitDist()` (`index.js:547–578`). Each queue key maps to `{ n, mean, p50, p90, p95, p99, values: [...sorted wait times] }` — so the full sorted array of individual wait times is stored in the result object.

The `entitySummary` field (`index.js:514`) contains the full entity pool snapshot including per-entity `stages[]` records with `waitStartedAt`, `serviceStartedAt`, `serviceEndedAt` per stage — so per-entity wait and service times are reconstructable from the result.

Time-series snapshots (`timeSeries`, opt-in via `collectTimeSeries`) store per-clock-tick queue depths and entity counts by type (`{ t, byType, byQueue }`), not individual entity positions.

### 4c. Existing visualisation of results over simulation time

**EXISTS — partial.**

- **Warm-up chart** (`src/ui/execute/SweepViews.jsx` — `WarmupChart`) renders the smoothed ensemble series from `detectWarmupWelch()` as an SVG line with a truncation point marker. Accessible via the "Detect warm-up" button in the Execute panel (`index.jsx:843`).
- **Charts tab in BottomPanel** — queue-length and utilisation time-series SVG lines from the `timeSeries` data collected per run.
- **Wait-time histogram** (`src/ui/results/ResultsWorkspace.jsx` — `WaitHistogram`) shows 16-bin distribution of individual wait times from `waitDist.values`.

No cumulative-mean-over-time chart (the key Welch's graphical diagnostic) is rendered for the individual replication trace; the Welch chart operates on the ensemble average across replications.

---

## Area 5: Results Workspace Organisation

### 5a. `simulation_runs` table columns

Derived from `saveSimulationRun` insert (`src/db/models.js:355–370`) and `fetchRunHistory` select (`models.js:394–401`) plus migration files:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Supabase auto |
| `model_id` | uuid FK | — |
| `run_by` | uuid FK | userId |
| `replications` | int | — |
| `max_simulation_time` | real | — |
| `warmup_period` | real | Added migration `20260510090000` |
| `seed` | bigint/numeric | — |
| `total_arrived` | int | — |
| `total_served` | int | — |
| `total_reneged` | int | — |
| `avg_wait_time` | numeric | — |
| `avg_service_time` | numeric | — |
| `renege_rate` | numeric | Computed: reneged / total |
| `results_json` | jsonb | Full result payload incl. runLabel, aggregateStats, replications array, timeSeries, waitDist |
| `duration_ms` | int | Added migration `20260510090000` |
| `ai_insights` | text/jsonb | Added migration `20260511000001` |
| `ran_at` | timestamptz | Supabase default now() |

The `run_label` is embedded inside `results_json.runLabel` (JSONB), not a real column. No dedicated `tags` column on `simulation_runs` (tags exist only on `des_models`).

### 5b. Tagging, labelling, or categorisation of results

**PARTIAL — run label only, no tags.**

A free-text run label is stored in `results_json.runLabel` and surfaced via `normalizeRunHistoryRow()` (`models.js:384–391`) as `run_label`. It is entered in the Execute panel before a run and displayed in the run history. No tag array, no category field, no colour label on runs.

### 5c. Search or filter on the results list

**ABSENT.**

`fetchRunHistory()` returns the last 20 runs ordered by `ran_at DESC` with no filter parameters. No search input, no filter dropdown, and no client-side filter exists in the run history UI.

### 5d. Archive or soft-delete mechanism

**ABSENT.**

No `archived` flag, no `deleted_at` timestamp, no soft-delete pattern exists on `simulation_runs`. Runs can only be hard-deleted as a cascade from model deletion (`deleteModel`). There is no explicit run-delete feature.

---

## Area 6: Test Coverage

### 6a. Test files covering statistical functions

| File | Tests | Coverage |
|---|---|---|
| `tests/engine/statistics.test.js` | 37 | All exported functions: mean, sampleVariance, sampleStdDev, tCritical95, confidenceInterval95, pairedTCI, summarizeReplicationResults, detectWarmupWelch, batchMeansCI, suggestBatchSize, bonferroniCI, compareScenarios, computeSummaryStats, computePercentiles |
| `tests/engine/replication-ci.test.js` | 1 | End-to-end: M/M/1 multi-replication CI contains expected mean wait |

No other test files directly import from `statistics.js`. The `ResultsWorkspace` tests in `tests/ui/results/results-workspace.test.jsx` indirectly exercise the statistics layer through the component.

### 6b. Current test count and pass rate

**906 passed / 924 total across 79 test files. Pass rate: 98.1%.**
(Run: `npm test -- --run`, duration ~53s)

### 6c. Failing or skipped tests

**18 failing tests across 8 files. 0 skipped.**

| File | Failures | Category |
|---|---|---|
| `tests/engine/time-varying.test.js` | 1 | Shift validation warning assertion |
| `tests/llm/proxy-contract.test.js` | 2 | LLM provider routing contract |
| `tests/ui/delete-model.test.jsx` | 1 | Delete model UI assertion |
| `tests/ui/model-import.test.jsx` | 3 | Import modal (saveModel path, model_json, graph key) |
| `tests/ui/run-history.test.jsx` | 2 | Run labels and export actions |
| `tests/ui/editors/ai-model-apply-save.test.jsx` | 1 | AI model apply/save flow |
| `tests/ui/execute/sweep-2d.test.jsx` | 6 | 2D sweep UI (mode toggle, grid validation, result table, cell stats, run button, progress text) |
| `tests/ui/share/DashboardView.test.jsx` | 2 | DashboardView QUEUES/SERVERS rendering |

All 37 statistics engine tests pass. None of the 18 failures are in the statistics or results-workspace modules.

---

## Summary Table

| Feature prompt | Pre-condition met? | Action needed |
|---|---|---|
| **F28.1 — Saved experiments** | **NO** | Create `experiment_configs` table (name, model_id, replication_count, seed, warmup_duration, run_duration, parameter_overrides jsonb, created_at). Add save/load UI in Execute Setup section. Wire `experimentDefaults` as the starting point for a new named config. |
| **F28.2 — Scenario comparison** | **PARTIAL** | `compareScenarios()` and sweep infrastructure exist. Missing: named scenario schema, DB table, and a comparison workspace that persists saved scenario pairs. Define scenario as {name, experiment_config_id, run_ids[]}. Add comparison view. |
| **F28.3 — CI presentation** | **PARTIAL** | CI table (mean, lower, upper, halfWidth, n) already rendered at `execute/index.jsx:1720`. Missing: (a) relative precision = halfWidth/mean×100 — add to statistics.js and display; (b) precision-achieved threshold indicator (e.g., green badge if relative precision < 5%); (c) batch-means CI in the multi-replication view (currently only in ResultsWorkspace Analysis tab). |
| **F28.4 — Transient analysis** | **PARTIAL** | Welch's method implemented; warm-up truncation logic complete; individual wait-time values stored in `waitDist.values[]`. Missing: (a) interactive warm-up recommendation that applies detected truncation as a new warmupPeriod; (b) per-replication cumulative-mean-over-time chart; (c) exported `cumulativeMean()` helper. |
| **F28.5 — Replication diagnostics** | **PARTIAL** | Per-replication table exists (Rep#, Seed, Served, Avg wait, Avg service, Avg sojourn). Missing: (a) IQR-based outlier detection (`computePercentiles` exists but IQR fence not computed); (b) visual anomaly flag on outlier rows; (c) min/max columns; (d) reneged count in per-rep table. |
| **F28.6 — Result organisation** | **PARTIAL** | `simulation_runs` has 17 columns including `run_label` (embedded in JSON). Missing: (a) real `run_label` column (migration needed); (b) `tags` array column on simulation_runs; (c) `archived` boolean column; (d) search/filter UI on run history list; (e) run-delete feature. |
| **F28.7 — Vitest coverage** | **PARTIAL** | Statistics module: 37/37 tests pass. Full suite: 906/924 pass (18 failures). Fix 18 pre-existing UI test failures before writing Sprint 28 tests. All failures are in UI integration tests (sweep-2d, import, run-history, dashboard); none are in the statistics or results layers. |
