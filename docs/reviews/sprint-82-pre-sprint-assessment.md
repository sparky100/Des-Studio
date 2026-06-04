# Sprint 82 — Pre-Sprint Assessment: Results API & LLM Export Bundle

**Date:** 2026-06-04
**Branch:** `claude/results-api-llm-export-assessment-1KH6J`
**Scope:** Read-only. No files were created, edited, or deleted during the assessment.
**Referenced by:** `docs/reviews/sprint-82-plan.md`

---

## Step 1 — Results Persistence Layer Inventory

### 1.1 Tables That Store Run Records

Two tables are relevant. Single runs and replication-batch runs are stored in **`simulation_runs`**. Sweep/parameter-study results are stored in the separate **`sweeps`** table and are not joined to `simulation_runs`.

**`simulation_runs`** — source: `supabase/migrations/20260510090000_share_links_sweeps.sql` and eight subsequent migrations through `PR-001_run_record_integrity.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `model_id` | uuid NOT NULL | FK → `des_models(id)` |
| `run_by` | uuid NOT NULL | FK → `auth.users(id)` |
| `replications` | integer | |
| `max_simulation_time` | real | |
| `warmup_period` | real | |
| `seed` | bigint | |
| `total_arrived` | integer | denormalised from `results_json.summary.total` |
| `total_served` | integer | denormalised from `results_json.summary.served` |
| `total_reneged` | integer | denormalised from `results_json.summary.reneged` |
| `avg_wait_time` | real | denormalised |
| `avg_service_time` | real | denormalised |
| `renege_rate` | real | denormalised |
| `results_json` | jsonb | primary results payload |
| `duration_ms` | integer | wall-clock execution time |
| `ai_insights` | jsonb | nullable; `{summary, recommendation, narrativePrompt}` |
| `run_label` | text | nullable user-supplied label |
| `tags` | text[] | DEFAULT `{}` |
| `archived` | boolean | DEFAULT false |
| `version_id` | uuid | nullable FK → `model_versions(id)` |
| `ran_at` | timestamptz | DEFAULT now() |
| `model_snapshot` | jsonb | nullable; immutable after insert |
| `engine_version` | text | nullable; immutable after insert |
| `prng_algorithm` | text | DEFAULT 'mulberry32'; immutable |
| `base_seed` | bigint | nullable; immutable |
| `narrative_text` | text | nullable; settable once |
| `model_description_text` | text | nullable; settable once |

**`sweeps`** — source: `supabase/migrations/20260510090000_share_links_sweeps.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `model_id` | uuid NOT NULL | FK → `des_models(id)` — no `ON DELETE` clause |
| `run_by` | uuid NOT NULL | FK → `auth.users(id)` |
| `config` | jsonb NOT NULL | sweep configuration |
| `results` | jsonb NOT NULL | array of per-point results |
| `created_at` | timestamptz NOT NULL | |

**Key observation — no foreign key between `sweeps` and `simulation_runs`.** Sweep results are self-contained and are not linked to any row in `simulation_runs`.

### 1.2 `results_json` Column Structure

`results_json` is a single JSONB column. Its content is produced by `buildPersistedResultsJson()` (`src/db/results-persistence.js:102–264`). The default detail level is **`"minimal"`**.

**Always present in `results_json`:**

- `summary` — full statistics object (total, served, reneged, avgWait, avgSvc, avgSojourn, avgWIP, perResource, outcomes, journeys, goals-related fields)
- `snap` — final simulation snapshot (clock, byType, byQueue, scalars, containers)
- `runtimeMetrics` — {wall_clock_ms, replications, events_processed, c_event_scans, ...}
- `waitDist` — per-queue {n, mean, p50, p90, p95, p99}  (raw `.values` array omitted at minimal)
- `aggregateStats` — 95% CI per metric (present for multi-replication runs)
- `replications` — array of {replicationIndex, seed, summary, finalTime}
- `_result_detail_level`, `_engine_version`, `_prng_algorithm`, `_base_seed`, `_experiment_config`

**At `minimal` (default) — trimmed fields recorded in `_trimmed_fields`:**

| Engine field | What is stored instead |
|---|---|
| `log` (event trace) | `logSummary: {entries, finalPhase, finalTime, finalMessage}` |
| `trace` (AI debugger trace) | dropped entirely |
| `entitySummary` (full entity list) | `entitySummaryCompact: {totalEntities, byStatus, byType, byOutcome}` |
| `timeSeries` (sampled snapshots) | dropped entirely |
| `waitDist.values` (raw sample array) | dropped; only percentile summary kept |

An 800 KB payload-size guard (`PAYLOAD_SAFE_BYTES = 800_000`) force-downgrades any oversized payload to `minimal` behaviour regardless of configured level.

### 1.3 Event Log Persistence

**The event log (`result.log`) is not persisted in the default storage path.**

- At `minimal` and `compact` detail levels it is replaced by `logSummary` (4 fields).
- Only retained at the `"full"` detail level (explicitly requested). No UI control to select `"full"`.
- The UI event log export (the **↓ CSV** button in `LogViewer.jsx:63`) is a **separate, purely client-side code path** in `src/ui/execute/LogViewer.jsx:12–19`. It exports `phase,time,message` CSV from the in-memory `result.log` array currently held in component state.
- The main JSON export (`buildResultsExportPayload` in `src/ui/execute/executeHelpers.js:256–264`) also always drops `log` (line 258).

### 1.4 RLS Policies on `simulation_runs`

Source: `supabase/migrations/20260510090004_fix_rls_recursion.sql`

| Operation | Policy predicate |
|---|---|
| SELECT | `run_by = auth.uid() OR public.run_has_active_share(id)` |
| INSERT | `run_by = auth.uid()` |
| UPDATE | `run_by = auth.uid()` |
| DELETE | `run_by = auth.uid()` |

`run_has_active_share(p_run_id uuid)` checks `share_links` for an active, unexpired, unrevoked token.

### 1.5 Existing Export Code Paths

**JSON export** — `buildResultsExportPayload()` at `src/ui/execute/executeHelpers.js:246–294`:
- Schema: `"simmodlr.results.v1"` — always drops `log` (hardcoded at line 258–259)
- Includes: model metadata, experiment config, summary/snap/runtimeMetrics/waitDist/entitySummary/trace/timeSeries, aggregateStats, per-replication `{replicationIndex, seed, summary, finalTime}`

**CSV export** — `buildResultsCsv()` at `src/ui/execute/executeHelpers.js:296–349`:
- Columns per replication: `runLabel, replicationIndex, seed, served, reneged, avgWait, avgSvc, avgSojourn, finalTime`
- Second section: `metric, n, mean, lower95, upper95, halfWidth` for aggregate stats

**Event log CSV** — `buildCsvFromLog()` at `src/ui/execute/LogViewer.jsx:12–19`:
- Columns: `phase, time, message` — client-side only, not reconstructible from the database

**Fields in the database record excluded from all current exports:** `ai_insights`, `tags`, `archived`, `narrative_text`, `model_description_text`, top-level `model_snapshot`, `engine_version`, `prng_algorithm`, `base_seed` columns.

### 1.6 Existing Edge Functions

Source: `supabase/functions/`

| Function | Auth pattern | Purpose |
|---|---|---|
| `llm-proxy` | None (rate limiting only) | Proxies Anthropic/OpenAI API; streaming |
| `import-model` | **JWT Bearer** — `authClient.auth.getUser()` | Validates and imports model JSON |
| `notify-new-signup` | Webhook secret | DB-webhook email + Slack on new user signup |
| `notify-feedback` | None (infrastructure-level) | Sends feedback email via Resend |

No shared utilities. Each function is self-contained.

### 1.7 Engine Output vs. Persisted Fields

| Engine field | Minimal stored? | Compact stored? | Full stored? |
|---|---|---|---|
| `summary` | ✓ | ✓ | ✓ |
| `snap` | ✓ | ✓ | ✓ |
| `runtimeMetrics` | ✓ | ✓ | ✓ |
| `waitDist` (percentile summary) | ✓ | ✓ | ✓ |
| `waitDist.values` (raw array) | ✗ | ✓ | ✓ |
| `aggregateStats` | ✓ | ✓ | ✓ |
| `replications` (compact) | ✓ | ✓ | ✓ |
| `entitySummaryCompact` | ✓ | ✓ | ✓ |
| `entitySummary` (full) | ✗ | ✗ | ✓ |
| `timeSeries` | ✗ | ✓ (sampled to 200pt) | ✓ |
| `log` (event trace) | ✗ (→logSummary) | ✗ (→logSummary) | ✓ |
| `trace` (AI debugger) | ✗ | ✗ | ✓ |

### 1.8 LLM Prompt Builders

Source: `src/llm/prompts.js`

- `MAX_PROMPT_WORDS = 2000` (line 2)
- `truncateWords(text, maxWords)` (line 9): applied in `makeMessages()` to the **entire serialised payload** before it is sent to `llm-proxy`
- `buildKpis()` (lines 244–269): canonical field-selection for queues, resources, throughput, outcomes, journeys, costs, container levels — used by all narrative/suggestion prompts
- `buildNarrativePrompt`: max_tokens 450; includes model name/description/goals, experiment config, KPIs, waitDist (percentile summary only), perQueue, CI, shift capacity
- `buildSuggestionPrompt`: max_tokens 800; adds b-event/c-event logic
- `buildExplainResultsPrompt`: max_tokens 1600; the richest existing prompt

None of `buildKpis`, `goalsToPrompt`, or `buildGoalGaps` are currently exported from `prompts.js`.

---

## Step 2 — Option 2: Results API Assessment

### 2a — Proposed Endpoint Design

**`GET /functions/v1/results-api/runs/:runId`**

Fully serviceable from stored data. Response: wrap `results_json` with top-level DB metadata (`id`, `modelId`, `runLabel`, `ranAt`, `tags`, `archived`, `engineVersion`, `prngAlgorithm`, `baseSeed`, `replications`, `maxSimulationTime`, `warmupPeriod`, `seed`, `durationMs`, `aiInsights`).

**`GET /functions/v1/results-api/runs?modelId=:modelId`**

Fully serviceable from denormalized columns alone — no `results_json` parse needed. Response: array of `{id, runLabel, ranAt, replications, tags, archived, totalArrived, totalServed, avgWaitTime, avgServiceTime, renegeRate, durationMs}`.

**`GET /functions/v1/results-api/sweeps/:sweepId`**

Serviceable from `sweeps.config` + `sweeps.results`. Response: `{id, modelId, createdAt, config, results}`.

**Event log:** Not serviceable via API at default `"minimal"` detail level. Only `logSummary` (4 fields) is available. **Severity: Degraded** — document clearly via `_trimmed_fields` in the response.

### 2b — Authentication and Access Control

- **JWT Bearer** is the primary auth pattern, reusing `import-model` exactly.
- **Share token** (`?shareToken=<token>`) for `GET /runs/:runId` — inline token lookup in `share_links`, same logic as `run_has_active_share()`.
- No new Supabase functions or schema changes required.
- API-key pattern (stable secret for long-running scripts) explicitly deferred — JWT covers initial use case.

### 2c — Consumer Compatibility

- **Python/pandas:** `pd.json_normalize(run["results"]["replications"])` cleanly flattens the replications array. `waitDist` and `aggregateStats` require a second normalization step. Not immediately loadable as a single flat dataframe without preprocessing — inherent to the data structure.
- **R:** `jsonlite::fromJSON(url, simplifyDataFrame=TRUE)` handles the structure well. `waitDist` becomes a named list of data frames (idiomatic R). Better out-of-the-box compatibility than Python.
- **Power BI / Tableau:** Cannot work with nested JSON directly. `?format=flat` deferred — requires knowing queue names for stable column names.

### 2d — Gaps and Risks

| Gap | Severity |
|---|---|
| `log` (event trace) not stored by default | **Degraded** |
| `timeSeries` not stored by default | **Degraded** |
| `waitDist.values` (raw sample array) absent at `minimal` | **Degraded** |
| `entitySummary` (full entity list) absent at `minimal` | **Degraded** |
| Sweep results in separate `sweeps` table, not linked to `simulation_runs` | **Degraded** — requires separate endpoint |
| `perQueue` blocking/balking counts: persistence into `results_json` needs targeted confirmation | Cosmetic |
| No rate limiting in the Edge Function | Risk — add if programmatic access creates load |
| `ai_insights` not currently exported anywhere | Cosmetic — can be included as enrichment |

---

## Step 3 — Option 3: LLM Export Bundle Assessment

### 3a — What Already Exists

`buildNarrativePrompt` assembles: model name/description/goals, experiment config, KPIs (`buildKpis()` output — queues with percentiles, resources with utilisation, throughput, outcomes, journeys, costs), `waitDist` (percentile summary), `perQueue`, confidence intervals, shift capacity, goal gaps.

The 2000-word `truncateWords` cap is applied to the **entire serialised payload** before transmission. For a well-populated model the payload routinely exceeds 2000 words. **The export bundle must not apply this truncation.**

No existing function produces a self-contained Markdown document. The closest is `buildExplainResultsPrompt` (max_tokens 1600) but it is a `{messages}` object targeting the LLM proxy, not a file export.

### 3b — Proposed Bundle Structure

The bundle should contain: preamble (~150 words, DES Studio + Three-Phase context), model definition (entity types, queues, events, goals), experiment configuration, results (headline KPIs, per-queue wait table, per-resource utilisation, CI table, outcomes, goals pass/fail, warnings), and replication summary (when replications > 1). Formatted as GitHub-Flavored Markdown pipe tables.

**Token estimate:** 1,500–2,500 words (2,000–3,300 tokens) for a fully populated model. Fits within any current LLM context limit.

### 3c — Relationship to Existing Prompt Builders

**Recommendation: a separate `buildLLMBundle()` function in `src/llm/bundleExport.js` that calls `buildKpis()`, `goalsToPrompt()`, and `buildGoalGaps()` from `prompts.js` — but targets Markdown output, not `{messages}` format.**

- `buildKpis()`, `goalsToPrompt()`, `buildGoalGaps()` must be exported from `prompts.js` (currently private).
- These three functions are the canonical field-selection layer — both the in-product AI and the export bundle must use the same code to avoid divergence.
- `truncateWords()` must not be called inside `buildLLMBundle`.

### 3d — Delivery Format and UI Placement

- **Recommended format:** `.md` file download (readable, renders in LLM interfaces that support Markdown, falls back to plain text gracefully).
- **UI placement:** new option in the existing Export… popover, labelled "LLM Bundle (.md)".
- Disabled when no run has completed (same gating as JSON/CSV options).

---

## Step 4 — Recommended Sprint Scope

### Option 2: Results API

**Files to create:** `supabase/functions/results-api/index.ts`, `supabase/functions/results-api/index.test.ts`

**Files to modify:** None (no schema changes needed)

**Key dependencies:** Supabase JS SDK (`@supabase/supabase-js@2`) — already in `import-model`. No new dependencies.

**Deferred:** `?format=flat`, API key pattern, in-function rate limiting, pagination beyond 100 runs.

**Completion gate:** 8 auth-path tests pass; TypeScript compiles; `curl` with valid JWT returns parseable JSON; Python `pd.json_normalize` snippet produces flat dataframe.

### Option 3: LLM Export Bundle

**Files to create:** `src/llm/bundleExport.js`, `tests/llm/bundle-export.test.js`

**Files to modify:** `src/llm/prompts.js` (export 3 functions), `src/ui/execute/index.jsx` (Export… popover)

**Key dependencies:** `buildKpis`, `goalsToPrompt`, `buildGoalGaps` from `prompts.js` — only dependency change is adding `export` to existing functions.

**Deferred:** Multi-run comparison bundle, sweep bundle, clipboard-only mode.

**Completion gate:** 6 unit tests pass; output contains no `truncateWords` artefacts; paste into Claude.ai answers "which queue has the longest mean wait?" without additional context.

### Combined Sprint Assessment

**Recommendation: combine into Sprint 82.** The options are genuinely independent (Option 2 is backend-only; Option 3 is client-side only). Total new code is approximately 350 lines across four files with three small modifications to existing files. The options can be developed in parallel. The only shared preparation step is confirming the export status of `buildKpis` in `prompts.js`.
