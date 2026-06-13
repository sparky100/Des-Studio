# simmodlr — Engineering Specification

**Version:** 7.4.0  
**Date:** 2026-06-11  
**Note:** package.json version is 0.9.0-Beta; this document uses an internal engineering version number.  
**Sprint baseline:** Sprint 85  
**Status:** Living document — updated at end of each sprint  
**Audience:** Engineering team, technical contributors, platform integrators

---

## Contents

1. [System Architecture](#1-system-architecture)
2. [Data Models and Schema](#2-data-models-and-schema)
3. [API and Interface Design](#3-api-and-interface-design)
4. [Security and Performance](#4-security-and-performance)
5. [Development Workflow](#5-development-workflow)
6. [Architectural Decision Records](#6-architectural-decision-records)
7. [Non-Negotiable Invariants](#7-non-negotiable-invariants)

---

## 1. System Architecture

### 1.1 Overview

simmodlr is a single-page application with a pure-JavaScript simulation engine, a React frontend, and a Supabase (PostgreSQL) backend. The engine has zero runtime dependencies on React or the DOM: it can execute in the browser main thread, a Web Worker, or Node.js without modification.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   React UI (Vite/ESM)                 │  │
│  │  ModelLibrary → ModelDetail (Describe/Design/Run/     │  │
│  │  Results) → Visual Designer → Execute Canvas          │  │
│  │  → Results Workspace → Reports → Sharing              │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │ buildEngine()                │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │              src/engine/ (pure JS)                    │  │
│  │  index.js → phases.js → macros.js → entities.js      │  │
│  │  conditions.js → distributions.js → validation.js    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │    Web Workers (persistent replication pool)          │  │
│  │  INIT_RUN: model sent once per worker                │  │
│  │  RUN_REPLICATION: {seed, replicationIndex} only      │  │
│  │  buildEngine() → runAll() → compact result           │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS / Supabase JS client
┌───────────────▼─────────────────────────────────────────────┐
│                    Supabase (PostgreSQL)                     │
│  des_models  simulation_runs  model_schedules               │
│  model_versions  user_settings  platform_config             │
│  feedback  profiles  share_links  sweeps  experiments       │
│                                                             │
│  Auth: Supabase Auth (JWT, magic link, email+password)      │
│  RLS: row_level_security on all tables (owner_id filter)    │
│  Edge Functions: llm-proxy  notify-new-signup               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Technology stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Build tool | Vite | 5.4.0 | ESM throughout |
| Frontend framework | React | 18.3.1 | Functional components only |
| Language | JavaScript/JSX + incremental TypeScript | — | ADR-009: TypeScript at schema/domain boundaries only |
| Styling | Inline style objects | — | Tokens in `src/ui/shared/tokens.js`; no CSS framework |
| Visual canvas | @xyflow/react | 12.10.2 | Visual Designer and Execute canvas |
| DAG layout | @dagrejs/dagre | 3.0.0 | Sugiyama/network-simplex |
| Database / auth | Supabase JS | 2.45.0 | PostgreSQL backend |
| Test runner | Vitest | 1.6.0 | Node environment (engine) + jsdom (UI) |
| Report generation | html2canvas, xlsx | — | HTML/Markdown dual-format output |

**Dependency constraint.** The dependency list is intentional and minimal. No new packages may be added without an ADR. Four moderate CVEs in Vite/Vitest are tracked but deferred pending Vite 8 readiness.

### 1.3 Three-layer separation

All code lives in one of three layers. Cross-layer calls must follow the rules below.

```
src/engine/   ← Pure JavaScript. No React import. No DOM access. No Supabase.
src/ui/       ← React components. Calls engine via buildEngine() only.
              ← Calls database via src/db/ only. No direct Supabase queries.
src/db/       ← Supabase CRUD wrappers. User-scoped queries. RLS enforced.
```

**src/engine/ modules:**

| File | Responsibility |
|------|---------------|
| `index.js` | `buildEngine()` factory, FEL management, run orchestration; module-level WeakMap caches resolved `runtimeModel` across reps |
| `phases.js` | Phase A (clock advance), Phase B (B-Event fire), Phase C (C-scan with restart rule) |
| `macros.js` | 19 effect macros: ARRIVE, ASSIGN, BATCH, COMPLETE, COSEIZE, COST, DRAIN, FAIL, FILL, MATCH, PREEMPT, RELEASE, RENEGE, RENEGE_OLDEST, REPAIR, SET, SET_ATTR, SPLIT, UNBATCH |
| `entities.js` | Entity lifecycle, queue discipline sort functions, server pool management, `_busyStart`/`_busyTime` utilisation tracking |
| `distributions.js` | Sampler registry, seeded RNG (mulberry32), all 11 distribution types |
| `conditions.js` | Safe predicate evaluator — no `eval`, no `new Function` |
| `validation.js` | V1–V39 (V7 unused); 38 distinct rules, pre-run gate |
| `statistics.js` | CI, batch means, ANOVA, Tukey HSD, Welch test; exports `summarizeEntitySummary` used by engine and persistence |
| `replication-runner.js` | Persistent worker pool (`createReplicationPool`), INIT_RUN protocol, compact per-rep payload |
| `worker.js` | Web Worker entry point — receives INIT_RUN once, then RUN_REPLICATION per rep |
| `run-admission.js` | Tier-based run limits (Free/Standard/Pro) enforced before any run |
| `adaptive-batch.js` | Adaptive replication logic for Explore panel |
| `sweep-runner.js` | Parametric sweep execution |
| `sweep-params.js` | Sweep parameter space |
| `complexity-estimator.js` | Pre-run complexity estimate |
| `public-api.js` | Public engine API |
| `clockUtils.js` | Clock utilities |
| `queue-refs.js` | Queue reference helpers |
| `progress-contract.js` | Progress reporting contract |
| `distribution-fitting.js` | Distribution fitting utilities |
| `templates.js` | Model templates |
| `adapters/` | Real-time data sources: RestAdapter, ScheduleFeedAdapter, ActualsStreamAdapter |
| `adapters/OpenSkyAdapter.js` | OpenSky real-time flight data adapter |
| `adapters/mockAdapter.js` | Mock adapter for testing |
| `simpy-export.js` | Pure-function SimPy Python export (Sprint 80). No React, no DOM, no Supabase. Generates `RUN_MODE`-aware scripts with enriched `Stats` class (Sprint 85). See §3.7 for API and design. |
| `simpy-runner-worker.js` | Pyodide Web Worker entry point (Sprint 85). Loads CPython-in-WASM from CDN, installs SimPy via `micropip`, captures JSONL stdout, streams `{type:"rep"}` / `{type:"summary"}` messages back via `postMessage`. Module worker (`type:"module"`). |

### 1.4 Three-Phase execution loop

```javascript
// Pseudocode — see src/engine/phases.js for authoritative implementation
while (fel.length > 0 && !terminationMet(state)) {

  // Phase A: advance clock
  T_now = fel[0].scheduledTime;
  state.clock = T_now;

  // Phase B: fire all B-Events due at T_now (deterministic, ordered)
  const due = fel.filter(e => Math.abs(e.scheduledTime - T_now) < EPSILON);
  for (const ev of due) {
    fireBEvent(ev, state);          // applies macro sequence, re-schedules
    collectTimeSeries(state, T_now);
  }

  // Phase C: iterative conditional scan with restart rule
  let anyFired = true;
  while (anyFired) {
    anyFired = false;
    for (const ce of sortByPriority(model.cEvents)) {   // ascending priority
      if (evaluateCondition(ce.predicate, state)) {
        fireCEvent(ce, state);
        anyFired = true;
        break;                      // ← RESTART from Priority 1 — non-negotiable
      }
    }
    if (++cPasses > MAX_C_PASSES) { warnTruncation(); break; }
  }
}
```

**Critical invariants enforced in code:**

| Invariant | Location |
|-----------|---------|
| C-scan restarts from highest priority after any C-Event fires | `phases.js:firePhaseC()` |
| Phase B completes fully before Phase C begins | `phases.js:runCycle()` |
| All sampling uses `state.rng` (mulberry32), never `Math.random()` | `distributions.js` sampler registry |
| Predicates are evaluated by a safe parser, not `eval` | `conditions.js:evaluateCondition()` |
| V38: RELEASE before COMPLETE in same B-Event → warning | `validation.js:checkV38()` |

---

## 2. Data Models and Schema

### 2.1 model_json (canonical model representation)

All three authoring modes write to the same `model_json` object. It is stored as JSONB in the `models` table and passed directly to `buildEngine()`.

```typescript
interface ModelJson {
  model_json_version: "4";
  timeUnit: "minutes" | "hours" | "seconds" | "days";
  epoch?: string;                       // ISO 8601 real-world anchor for schedule-based models

  entityTypes: EntityType[];
  queues: Queue[];
  bEvents: BEvent[];
  cEvents: CEvent[];
  stateVariables: StateVariable[];
  containerTypes: ContainerType[];
  dataSources: DataSource[];
  sections?: Section[];                 // named groupings for authoring/visualisation (engine-agnostic)

  experimentDefaults: {
    replications: number;
    warmupPeriod: number;
    maxSimTime: number;
    terminationCondition?: string;      // predicate expression string
  };

  graph?: GraphMetadata;                // @xyflow/react layout (ADR-010)
  performanceGoals?: PerformanceGoal[];
}

interface Section {
  id: string;
  name: string;
  color: string;                        // CSS hex colour
  memberIds: string[];                  // queue/entityType/bEvent/cEvent IDs
  entryQueues: string[];                // subset of memberIds — queues where entities arrive from other sections
  exitQueues: string[];                 // subset of memberIds — queues where entities leave to other sections
}
```

#### EntityType

```typescript
interface EntityType {
  id: string;                           // UUID
  name: string;                         // must be unique (V1)
  role: "customer" | "resource" | "document" | string;
  arrivalSource?: string;               // B-Event id that creates this entity
  attributes: Attribute[];
}

interface Attribute {
  name: string;
  valueType: "number" | "string" | "boolean";
  defaultValue: number | string | boolean;  // must match valueType (V3)
  mutable: boolean;
}
```

#### Queue

```typescript
interface Queue {
  id: string;
  name: string;
  discipline: "FIFO" | "LIFO" | "PRIORITY" | "SPT" | "EDD" | `PRIORITY(${string})`;
  capacity?: number;                    // undefined = infinite
  balkProbability?: number;             // ∈ [0, 1] (V21)
  balkCondition?: PredicateNode;
}
```

#### BEvent

```typescript
interface BEvent {
  id: string;
  name: string;
  effects: Effect[];                    // ordered macro sequence
  schedules: ScheduleRef[];             // references to model_schedules rows (ADR-016)
}

interface ScheduleRef {
  scheduleRef: string;                  // UUID → model_schedules.id
  entityType?: string;
  distribution?: DistributionSpec;
}
```

#### CEvent

```typescript
interface CEvent {
  id: string;
  name: string;
  priority: number;                     // lower = higher priority; scan order
  predicate: PredicateNode;             // evaluated by conditions.js safe evaluator
  effects: Effect[];
  cSchedules?: ConditionalSchedule[];   // attribute-conditional service times (ADR-007)
}
```

#### Distribution types

| Type | Parameters | Notes |
|------|-----------|-------|
| `Exponential` | `mean` | Memoryless inter-arrival |
| `Uniform` | `min`, `max` | |
| `Normal` | `mean`, `std` | Clamped to ≥ 0 |
| `Triangular` | `min`, `mode`, `max` | |
| `Fixed` | `value` | Deterministic |
| `Erlang` | `k`, `mean` | k-stage exponential |
| `Empirical` | `values[]` | Inline or CSV-imported |
| `Piecewise` | `periods[]` | Time-varying; clock-aware selection |
| `ServerAttr` | `attributeName` | Reads attribute from the serving resource |
| `EntityAttr` | `attributeName` | Reads attribute from the arriving entity |
| `Schedule` | `scheduleRef` | Planned absolute times from `model_schedules` |

All distributions sample via `state.rng` (mulberry32 seeded PRNG). No distribution calls `Math.random()`.

### 2.2 Supabase schema

The authoritative source of truth for schema details is the migration files under `supabase/migrations/`.

```sql
-- User models (actual table name: des_models)
CREATE TABLE des_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  owner_id        UUID REFERENCES auth.users NOT NULL,
  visibility      TEXT DEFAULT 'private',   -- 'private' | 'public' (replaces is_public BOOLEAN)
  access          JSONB DEFAULT '{}',        -- per-user access grants: { "<userId>": "viewer"|"editor" }
  entity_types    JSONB NOT NULL DEFAULT '[]',
  state_variables JSONB NOT NULL DEFAULT '[]',
  b_events        JSONB NOT NULL DEFAULT '[]',
  c_events        JSONB NOT NULL DEFAULT '[]',
  queues          JSONB NOT NULL DEFAULT '[]',
  goals           JSONB NOT NULL DEFAULT '[]',
  tags            TEXT[],                    -- user-defined tags; surfaced as filterable chips in the Model Library
  model_json      JSONB,                     -- supplementary fields: graph, experimentDefaults, dataSources
  latest_version  INTEGER DEFAULT 0,
  parent_model_id UUID REFERENCES des_models(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Simulation run results (actual table name: simulation_runs, uses flat denormalised columns)
CREATE TABLE simulation_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id             UUID REFERENCES des_models NOT NULL,
  run_by               UUID REFERENCES auth.users NOT NULL,
  ran_at               TIMESTAMPTZ DEFAULT now(),
  replications         INTEGER,
  max_simulation_time  REAL,
  warmup_period        REAL,
  seed                 BIGINT,
  total_arrived        INTEGER DEFAULT 0,
  total_served         INTEGER DEFAULT 0,
  total_reneged        INTEGER DEFAULT 0,
  avg_wait_time        REAL,
  avg_service_time     REAL,
  renege_rate          REAL DEFAULT 0,
  duration_ms          INTEGER,
  run_label            TEXT,
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  archived             BOOLEAN NOT NULL DEFAULT false,
  results_json         JSONB,               -- aggregated KPIs, CI, replication summaries
  ai_insights          JSONB,
  version_id           UUID REFERENCES model_versions(id),
  -- Provenance columns (immutable after insert — enforced by trigger)
  model_snapshot       JSONB,
  engine_version       TEXT,
  prng_algorithm       TEXT DEFAULT 'mulberry32',
  base_seed            BIGINT,
  narrative_text       TEXT,
  model_description_text TEXT
);

-- Timetable data (ADR-016 — separated from model_json)
CREATE TABLE model_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID REFERENCES des_models NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  schedule_json JSONB NOT NULL,  -- entries: [{ eventId, rows: [{time, entityType, attributes}] }]
  is_default    BOOLEAN DEFAULT FALSE,
  created_by    UUID REFERENCES auth.users,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Explicit model version milestones (ADR-015)
CREATE TABLE model_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID REFERENCES des_models NOT NULL,
  version       INTEGER NOT NULL,            -- sequential integer (not version_label)
  name          TEXT,
  notes         TEXT,
  model_json    JSONB NOT NULL,              -- snapshot (not model_snapshot)
  is_structural BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  created_by    UUID REFERENCES auth.users,
  UNIQUE(model_id, version)
);

-- User feedback
CREATE TABLE feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users,  -- nullable (anonymous)
  category      TEXT NOT NULL,
  message       TEXT NOT NULL,
  app_version   TEXT,
  page_context  TEXT,
  user_agent    TEXT,
  account_email TEXT,
  reply_email   TEXT,
  status        TEXT DEFAULT 'new',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Additional tables: share_links, sweeps, experiments, user_settings,
--   platform_config, profiles, admin_audit_log (see supabase/migrations/).
```

Row-Level Security is enabled on all tables. Models filter by `owner_id = auth.uid()`. Access-controlled models use the `access` JSONB column. Public models are exposed via a read-only view.

### 2.3 State variables (runtime)

During a simulation run, the engine maintains an in-memory state object (not persisted). Key state paths:

| Path | Type | Description |
|------|------|-------------|
| `state.clock` | number | Current simulation time |
| `state.rng` | function | Seeded PRNG (mulberry32) |
| `state.entities` | Map | All active entity instances |
| `state.queues[id].items` | Entity[] | Ordered queue contents (discipline-sorted) |
| `state.resources[id].status` | "IDLE" \| "BUSY" \| "FAILED" | Resource status |
| `state.resources[id].busyCount` | number | Count of entities being served |
| `state.resources[id]._busyTime` | number | Cumulative busy time (for utilisation) |
| `state.resources[id].starvationTime` | number | Cumulative post-warmup time the server was idle with entities waiting upstream |
| `state.variables[name]` | number | User-defined state variable counters |
| `state.containers[id]` | number | Container resource level |
| `state.timeSeries` | object | Sampled time-series data per queue/resource |

---

## 3. API and Interface Design

### 3.1 buildEngine() — core engine factory

```typescript
function buildEngine(
  model: ModelJson,
  seed: number,
  warmupPeriod: number,
  maxSimTime: number,
  terminationCondition: string | null,
  maxCycles: number,
  maxCPasses: number,
  collectTimeSeries: boolean,
  options?: {
    schedulesMap?: Record<string, ScheduleRow[]>;  // ADR-016
    dataSourceValues?: Record<string, number>;     // real-time adapter bindings
    collectTrace?: boolean;     // default true; false skips trace construction in batch paths
    entityDetail?: boolean;     // default true; false returns entitySummaryCompact (aggregate only)
  }
): Engine
```

The returned `Engine` object exposes:

| Method | Returns | Description |
|--------|---------|-------------|
| `runAll()` | `RunResult` | Execute to completion. Returns full result object. |
| `step()` | `TraceEntry[]` | Advance one A→B→C cycle. Returns trace messages for step log. |
| `getSnap()` | `Snapshot` | Real-time snapshot: entity counts, queue depths, FEL size, event fires. |
| `getFelSize()` | `number` | Current Future Event List size. |

**`buildEngine()` is the only engine import allowed in UI code.** No UI component may import from `src/engine/macros.js`, `src/engine/phases.js`, or any other engine sub-module directly.

#### 3.1.1 Wait time computation (Sprint 83)

The engine's `getSummary()` computes `avgWait` as a weighted average across three entity pools:

| Pool | Entities | Weight | Description |
|------|----------|--------|-------------|
| `served` | `status === "done"` | 1.0 | Full wait from all completed stages |
| `reneged` | `status === "reneged"` | 1.0 | Wait until renege (Sprint 83: now captured via `buildStageRecord()` in RENEGE macro) |
| `inProgress` | `status === "waiting"` at termination | 0.5 | Partial wait from `lastStageStart ?? arrivalTime` to termination clock. Half-weighted per standard DES practice. |

`avgWait = (sumServed + sumRenege + 0.5 * sumInProgress) / (nServed + nRenege + 0.5 * nInProgress)`

The summary also includes:
- `avgWaitByLittle`: Little's Law estimate (`avgWIP / arrivalRate`) for validation
- `waitDiscrepancy`: percentage difference between `avgWait` and `avgWaitByLittle`; >5% suggests the run may be too short
- `waitSamplesBreakdown`: `{ served, reneged, inProgress }` counts for UI transparency

The `RENEGE` macro now calls `buildStageRecord(entity, null, clock)` before clearing the entity's waiting state, so reneged entities contribute wait samples to both `avgWait` and `waitDist`.

### 3.2 Visual Designer interaction contract

The Visual Designer is an authoring surface over the canonical `model_json`; it does not maintain a separate graph model. `deriveGraphFromModel(model)` derives nodes and edges from queues, B-Events, C-Events, and `model_json.graph` layout metadata.

| Interaction | Implementation contract |
|-------------|-------------------------|
| Single selection | `selectedNodeIds` contains one node id; the inspector edits that canonical element. |
| Multi-selection | `selectedNodeIds` contains multiple node ids; the toolbar shows count and bulk actions while the inspector remains single-node only. |
| Mouse selection | Shift/Ctrl/Meta click toggles node selection. React Flow box selection feeds `onNodeSelectionChange(ids)`. |
| Touch selection | The `Pan / Select` segmented control switches from canvas panning to tap-to-toggle selection without requiring keyboard modifiers. |
| Group move | React Flow drag stop emits all moved nodes; `updateGraphLayout(model, graph, { nodes })` persists only non-normative layout coordinates. |
| Bulk delete | `deleteVisualNodes(model, nodes)` repeatedly resolves current derived nodes and delegates to `deleteVisualNode()`, preserving canonical cascade behavior for queues, B-Events, C-Events, and routing references. |

The only persisted data produced by selection or movement is `model_json.graph.nodes[]` layout metadata. Selection state is UI-only and must never be written to `model_json`, Supabase, or run records.

### 3.3 src/db/ — database layer

The `src/db/` layer consists of four modules. Direct Supabase client calls from UI components are forbidden.

| Module | Responsibility |
|--------|---------------|
| `models.js` | All model, run history, schedule, version, and admin CRUD operations |
| `supabase.js` | Supabase client singleton; `submitFeedback()`; `touchLastActive()` |
| `results-persistence.js` | Payload trimming and size-guard before `simulation_runs` insert |
| `runRecord.js` | Run record construction (`buildRunRecord()`); narrative update (`updateRunNarrative()`) |

Key exported functions from `models.js`:

```typescript
// Model CRUD
fetchModels(userId): Promise<Model[]>
fetchModel(modelId): Promise<Model>
saveModel(model): Promise<Model>
deleteModel(modelId): Promise<void>
duplicateModel(modelId): Promise<Model>

// Run history
saveSimulationRun(modelId, runData, options): Promise<RunResult>
fetchRunResults(modelId): Promise<RunResult[]>
fetchRunResult(runId): Promise<RunResult>

// Schedule management (ADR-016)
fetchModelSchedules(modelId): Promise<Schedule[]>
fetchModelSchedule(scheduleId): Promise<Schedule>
saveModelSchedule(modelId, schedule): Promise<Schedule>
deleteModelSchedule(scheduleId): Promise<void>
setDefaultSchedule(modelId, scheduleId): Promise<void>
buildSchedulesMap(modelId): Promise<Record<string, ScheduleRow[]>>
extractInlineSchedule(bEvent): ScheduleRow[]

// Model versions (ADR-015)
fetchModelVersions(modelId): Promise<ModelVersion[]>
createModelVersion(modelId, label, notes): Promise<ModelVersion>
restoreModelVersion(versionId): Promise<Model>

// Feedback
submitFeedback(category, message, context): Promise<void>
```

### 3.4 Supabase Edge Functions

| Function | Trigger | Description |
|----------|---------|-------------|
| `llm-proxy` | HTTP POST from `src/llm/` | Provider-neutral LLM routing. Accepts a prompt payload, routes to the configured provider (OpenAI, Anthropic, or other), returns a structured response. Credentials never exposed to the browser. |
| `notify-new-signup` | `auth.users` INSERT trigger | Sends email and Slack notification to the platform admin on new user registration. |
| `results-api` | HTTP GET from external clients | Read-only programmatic access to saved run and sweep results. JWT Bearer auth or `?shareToken=` for publicly shared runs. Three routes: `GET /runs/:runId`, `GET /runs?modelId=`, `GET /sweeps/:sweepId`. See §4.6 for full spec. |

### 3.5 LLM prompt builders (src/llm/)

All LLM calls go through `src/llm/prompts.js`. Prompts are built as structured objects; the raw model JSON and run results are injected as context. No UI component constructs LLM prompts directly.

| Builder function | Purpose |
|-----------------|---------|
| `buildNarrativePrompt(model, experimentConfig, results)` | Generates narrative for Results → Explain (replaces `buildModelGenerationPrompt`) |
| `buildExplainResultsPrompt(model, experimentConfig, results, ciResults)` | Generates narrative for Results → Explain tab |
| `buildComparisonPrompt(modelName, runA, runB, modelA, modelB)` | Structured comparison of two run results (actual name; not `buildCompareRunsPrompt`) |
| `buildPlanRefinementPrompt(model, experimentConfig, results)` | Patches `model_json` based on user feedback |
| `buildResultsQueryPrompt(question, model, results, conversationHistory)` | Context-aware results Q&A for Model Assistant sidebar |
| `buildModelDescriptionPrompt(model, results)` | Plain-English description for Senior Management report |
| `buildCiResults(aggregateStats)` | Formats CI data for report narrative |
| `buildSuggestionPrompt(model, experimentConfig, results)` | Generates improvement suggestions |
| `buildSensitivityPrompt(modelName, experimentConfig, ciResults)` | Sensitivity analysis narrative |
| `buildModelQueryPrompt(question, model, history, context)` | Design- and run-mode model Q&A. Receives structured model digest (entity attributes, queue configs, C-event summaries, sections, goals) plus current tab context. |
| `buildBatchAnalysisPrompt(model, combinedResult, aggregateStats, ciSummary, tier)` | Explore/Adaptive Batch analysis narrative |
| `buildReportRecommendationsPrompt(model, results)` | Report recommendations section |

### 3.6 Report generation (src/reports/)

```typescript
function generateReport(
  model: ModelJson,
  results: RunResult,
  experimentConfig: ExperimentConfig,
  runMeta: RunMeta,
  options: {
    type: "senior" | "technical";
    format: "html" | "markdown";
    modelImage?: string;             // base64 canvas screenshot
  }
): Promise<string>
```

The report pipeline:
1. Computes derived metrics (`formatN`, `formatInt`, `formatCurrency`, `resolveValue`).
2. Detects arrival mode (`detectArrivalMode`): exponential, schedule-based, or piecewise.
3. Builds Scope & Methodology section (`buildMethodology`).
4. Calls `llm-proxy` for AI-written narrative sections (executive summary, interpretation, recommendations).
5. Assembles final HTML or Markdown string.

### 3.7 SimPy Python export (src/engine/simpy-export.js)

Added in Sprint 80. Enriched in Sprint 85 (RUN_MODE, Stats.resource_busy, wait percentiles, per-resource utilisation). Pure JavaScript function — no React, no DOM, no Supabase dependency. May be called from the engine layer, a Web Worker, or a UI component.

#### Public API

```typescript
function exportToSimPy(model: ModelJson): {
  script: string;        // complete Python source
  category: 1 | 2;      // 1 = fully runnable; 2 = contains TODO stubs
  todoMacros: string[];  // sorted list of macros requiring manual completion
}
```

#### Category rules

| Category | Condition | Action |
|----------|-----------|--------|
| 1 | No macro in `TODO_MACRO_SET` detected in any effect field | Script is complete and runs as-is after `pip install simpy` |
| 2 | One or more macros from `TODO_MACRO_SET` found | Each unsupported macro is replaced with an annotated `# TODO` stub; the rest of the script is complete |

`TODO_MACRO_SET = { RENEGE, BATCH, RENEGE_OLDEST, MATCH, FAIL, REPAIR, PREEMPT }`

Note: all macros in `TODO_MACRO_SET` are fully implemented in the JS Three-Phase engine. They appear as stubs only because their Python translation is non-trivial to auto-generate.

Every model produces a script — there is no "cannot export" path.

#### Generated script structure

```
docstring           (model name, date, category, TODO list)
imports             (simpy, random, math, statistics, json, dataclasses, Dict)
configuration       (MAX_SIM_TIME, WARMUP_PERIOD, REPLICATIONS, BASE_SEED, RUN_MODE)
distribution fns    (_exp, _uniform, _normal, _triangular, _fixed, _erlang, _lognormal)
state variables     (module-level Python vars from model.stateVariables)
entity @dataclasses (one per customer entity type; fields: arrival_time, sojourn_time,
                     service_start_time, wait_time)
Stats class         (served[], reneged[], total_cost, resource_busy: Dict[str,float])
arrival generators  (one per B-event containing ARRIVE)
service pairs       (monitor fn + serve fn per C-event with ASSIGN or COSEIZE;
                     both track entity.service_start_time and stats.resource_busy)
shift managers      (one per server entity type with shiftSchedule)
TODO stubs          (category 2 only — pattern comments for each unsupported macro)
run_replication()   (wires env, stores, resources, containers, processes;
                     returns 10-field dict — see below)
__main__ block      (branches on RUN_MODE: "text" → human-readable table,
                     "json" → one JSON object per line / JSONL)
```

#### RUN_MODE output control

The generated script contains `RUN_MODE = "text"` in the configuration block. Setting it to `"json"` switches the `__main__` block to JSONL output (one JSON object per line): one `{"type":"rep",...}` record per replication followed by a `{"type":"summary",...}` record. `simpy-runner-worker.js` switches to `"json"` by string-replacing this constant before execution.

#### run_replication() return dict

```python
{
  "total":      int,           # post-warmup arrival count
  "served":     int,
  "reneged":    int,
  "avg_sojourn": float,
  "total_cost": float,
  "wait_mean":  float,
  "wait_p50":   float,
  "wait_p90":   float,
  "wait_p99":   float,
  "svc_mean":   float,
  "util":       dict[str, float]   # {server_name: utilisation_fraction}
}
```

#### Distribution support

The standard 7 distributions (Exponential, Uniform, Normal, Triangular, Fixed, Erlang, Lognormal) map directly to Python equivalents. Three additional distributions are fully Category 1:

- **Piecewise** — generates a `_piecewise_NAME(t)` time-varying helper function; the arrival process calls the helper to obtain the current-period mean.
- **Schedule** — generates a `for`-loop over `rows[]` with per-row attribute injection; used by the Appointment Clinic template.
- **Empirical** — generates `random.choice([values])`.

All 22 built-in templates produce valid Category 1 Python.

#### C-event → B-event routing resolution

Service routing is resolved by reading `cEvent.cSchedules[0].eventId` to find the completion B-event by ID. If that lookup fails, a heuristic fallback finds the single B-event with `COMPLETE()` in its effect and no `schedules`. The completion B-event's `routing`, `probabilisticRouting`, and `defaultQueueName` fields generate the post-service routing block.

#### COSEIZE translation

`COSEIZE(queue, resA, resB, ...)` translates to `simpy.AllOf(env, [reqA, reqB, ...])` — simultaneous multi-resource seize. Resources are released in a `finally` block.

#### DRAIN semantic note

DES Studio `DRAIN` fails immediately if container level < amount (guard). SimPy `Container.get()` blocks until sufficient level is available. The generated script includes an inline comment noting this divergence. `DRAIN` is not in `TODO_MACRO_SET` because the script remains runnable; the comment directs users to add an explicit level check if fail-fast behaviour is required.

#### UI integration

- `src/ui/editors/SimPyExportModal.jsx` — calls `exportToSimPy(model)` on mount; shows category badge, TODO macro list, filename, Download button, and **Run in Browser** button (Category 1 only). Progress bar streams per-replication updates; on completion calls `onResultsReady(results)` to push into ResultsWorkspace and `saveSimulationRun` to persist the run to history with label `SimPy  DD/MM/YYYY HH:mm`.
- `src/ui/hooks/useSimPyRunner.js` — React hook managing `simpy-runner-worker.js` lifecycle. Exposes `{ run, cancel, reset, status, progress, total, results, error }`. Normalises JSONL results to ResultsWorkspace shape (`{ replications, summary, _source: "simpy" }`).
- `src/ui/ModelDetailHeader.jsx` — `onExportSimPy` prop; renders ⬇ SimPy button (no `canEdit` guard — export is read-only).
- `src/ui/ModelDetail.jsx` — `showSimPyExport` state; Export SimPy row in Access tab → Export section.

#### Test coverage

`tests/engine/simpy-export.test.js` — 53 Vitest assertions covering: category classification, TODO macro detection, header docstring, configuration constants, arrival/service/COSEIZE generation, entity dataclasses, resources, stores, containers, state variables, run_replication, main block, TODO stubs, multi-stage routing, empty model edge case.

---

## 4. Security and Performance

### 4.1 Security model

| Risk | Mitigation |
|------|-----------|
| **Dynamic code execution** | No `eval()`, no `new Function()`, no `Function()` constructor anywhere in the engine or condition evaluator. Predicates are parsed JSON trees evaluated by `conditions.js:evaluateCondition()`. |
| **Injection via model fields** | All model fields are consumed as data, never concatenated into code strings. Distribution parameters are numbers; predicate nodes are typed JSON objects. |
| **Database access control** | Supabase RLS enforces `owner_id = auth.uid()` on `des_models` and `run_by = auth.uid()` on `simulation_runs`. No shared-state tables. Public models are exposed via a read-only view. |
| **LLM prompt injection** | LLM responses are parsed and validated against the model JSON schema before `Apply` is offered. Malformed or schema-violating responses are rejected with a user-visible error. |
| **Credential exposure** | LLM API keys are held exclusively in Supabase Edge Function environment variables. The `llm-proxy` function proxies all LLM calls server-side. No AI provider key is ever sent to or stored in the browser. |
| **WCAG 2.1 AA** | All interactive elements have ARIA labels. Colour contrast meets AA minimums. Keyboard navigation supported throughout. |

### 4.2 Performance envelope

| Scenario | Target | Notes |
|---------|--------|-------|
| Single replication, 10,000 events | < 2 seconds | Main thread or Web Worker |
| 30 replications, 100,000 events each | < 60 seconds | Persistent worker pool, `hardwareConcurrency − 1` workers |
| M/M/1 analytical accuracy | Within 5% of formula | Benchmark gate in CI (`mm1_benchmark.js`) |
| M/M/c analytical accuracy | Within 5% of formula | Benchmark gate in CI (`mmc_benchmark.js`) |
| model_json parse + validate | < 100 ms | V1–V39 (V7 unused); 38 distinct rules |
| Visual Designer canvas: 50 nodes | 60 fps | @xyflow/react default render loop |

Worker pool size defaults to `navigator.hardwareConcurrency - 1` (minimum 1, no upper cap). Workers are **persistent** — spawned once per batch run via `createReplicationPool()` and reused across all rounds (adaptive batch, sweep points). The model and run configuration are sent to each worker exactly once via an `INIT_RUN` message; subsequent `RUN_REPLICATION` messages carry only `{ replicationIndex, seed, entityDetail }`, avoiding a `structuredClone` of the full model per job.

### 4.3 Results persistence limits

`src/db/results-persistence.js` enforces payload size limits before saving to Supabase:

- **Detailed results** (entity-level trace, full time-series): stored at full fidelity when `resultDetailLevel = "full"`.
- **Summary results** (KPI cards, CI tables): always stored (`resultDetailLevel = "minimal"`).
- **Compact time-series**: downsampled to `COMPACT_TIME_SERIES_MAX_POINTS = 200` points per series when `resultDetailLevel = "compact"`.
- **Payload guard**: if the JSON payload exceeds `PAYLOAD_SAFE_BYTES = 800,000` bytes after detail-level trimming, the same stripping applied by `"minimal"` is forced automatically to prevent INSERT timeouts.

### 4.4 MAX_C_PASSES guard

The Phase C loop has a hard limit of `MAX_C_PASSES = 500` iterations per clock tick. Exceeding this limit triggers:
1. A warning banner in the Execute panel.
2. A `TRUNCATION` trace entry in the Step Log.
3. Continuation of the simulation (the run is not aborted).

Models consistently triggering this guard should be reviewed: the most common cause is a circular C-Event dependency or a condition that becomes true immediately after its effects fire.

### 4.5 Additional subsystems

#### Run Admission (`src/engine/run-admission.js`)

Tier-based run limits enforced before any run starts. `getRunAdmission(model, options)` returns an admission decision based on the user's plan tier (Free/Standard/Pro), model complexity, and estimated event count. Prevents oversized runs from reaching the engine.

#### Explore / Adaptive Batch (`src/engine/adaptive-batch.js`)

AI-driven adaptive replication orchestration used by the Explore panel. `runAdaptiveBatch(options)` runs successive batches of replications, stopping when the confidence interval half-width meets the target precision threshold or a maximum replication count is reached.

#### Confidence Interval method

The primary CI method is **between-replication t-CI**: `confidenceInterval95()` in `src/engine/statistics.js` computes a 95% t-CI across replication-level means. `batchMeansCI()` is also available for single-replication within-run analysis but is not the default CI reported in the Results panel.

#### Batch performance architecture

Four layers work together to reduce per-replication cost in any multi-rep path (adaptive batch, sweep, plain replication batch):

| Mechanism | Where | Effect |
|---|---|---|
| **Persistent worker pool** (`createReplicationPool`) | `replication-runner.js` | Workers spawned once, reused across rounds. No worker start-up cost after the first round. |
| **INIT_RUN protocol** | `worker.js` + `replication-runner.js` | Model + config sent once per worker via `INIT_RUN`; each job carries only `{replicationIndex, seed, entityDetail}`. Eliminates `structuredClone` of model per job. |
| **`collectTrace: false`** | `buildEngine` option | Skips all per-cycle trace-entry construction and the final `buildTraceFromLog` call. Batch consumers never read `log` or `trace`. ~7–26% per-replication speedup on C-heavy models. |
| **`entityDetail: false`** | `buildEngine` option | Reps ≥ 1 return `entitySummaryCompact` (pre-aggregated counts built inside the worker) instead of cloning every entity object. Rep 0 keeps the full `entitySummary` for the AI-explore verify flow, report generation, and `EntitySummaryTable`. |
| **`runtimeModel` WeakMap cache** | `index.js` (module-level) | `resolveInlineSchedules` + `modelWithShiftInitialCapacity` computed once per model object; all reps in a persistent worker hit the cache from rep 2 onwards. The engine must never mutate its model argument — enforced by `tests/engine/model-immutability.test.js`. |

The determinism contract is maintained across all these optimisations: the same `model_json` + `seed` always produces byte-identical summary fields. This is enforced by fixed-seed inline snapshots in `tests/engine/determinism-parity.test.js`.

#### Voice Input

Web Speech API voice input is available in three components: `HelpAssistant.jsx`, `AiGeneratedModelPanel.jsx`, and `DiagnosticsTab.jsx`. Each uses `webkitSpeechRecognition`/`SpeechRecognition` to transcribe spoken input into the relevant text field.

#### src/simulation/ — Model Checker and Trace Collector

`src/simulation/modelChecker.js` — static model analysis run before execution to detect structural issues beyond the validation rule set.  
`src/simulation/traceCollector.js` — collects per-entity trace events during step-mode execution for the Step Log panel.

### 4.6 Results API and LLM Export Bundle

#### Results API (`supabase/functions/results-api/index.ts`)

A Deno-based Supabase Edge Function providing read-only programmatic access to saved simulation results. Auth pattern mirrors `import-model/index.ts` (JWT Bearer via `authClient.auth.getUser()`).

**Routes:**

| Route | Auth | Response |
|-------|------|---------|
| `GET /runs/:runId` | JWT Bearer **or** `?shareToken=<token>` | DB metadata + full `results_json` |
| `GET /runs?modelId=:modelId` | JWT Bearer | Array of run summaries (denormalised columns only) |
| `GET /sweeps/:sweepId` | JWT Bearer | `{id, modelId, createdAt, config, results}` |

**Share token path** (`GET /runs/:runId?shareToken=`): The function looks up the token in `share_links`, validates `revoked_at` and `expires_at`, then fetches the run via `serviceClient` (bypassing RLS). Mirrors the logic of `run_has_active_share()` without a DB function call.

**Error codes:** `401` (missing/invalid JWT or expired share token), `403` (share link revoked or expired), `404` (run/sweep not found or not owned by caller).

**CORS:** `Access-Control-Allow-Origin: *` for read-only GET routes; OPTIONS preflight handled inline.

**Known limitation:** At the default `"minimal"` persistence level, `result.log` is not retained. The response surfaces `logSummary` (4 fields) and records the omission in `_trimmed_fields`. There is currently no UI control to select `"full"` detail level.

**Test file:** `supabase/functions/results-api/index.test.ts` — 8 auth-path tests (valid JWT, missing JWT, expired share token, revoked share token, not-found run, wrong owner, sweep route, modelId list route).

**Deferred:** `?format=flat` CSV-compatible output, API-key pattern, in-function rate limiting, pagination beyond 100 runs.

**Reference:** `docs/architecture/results-api-design.md`

#### LLM Export Bundle (`src/llm/bundleExport.js`)

A pure-JS serialiser that builds a self-contained, uncapped Markdown document combining model definition and run results. Intended for paste-into-LLM analysis.

**Key function:**

```javascript
export function buildLLMBundle(model = {}, results = {}, config = {}) {
  // config: { runLabel, ranAt, engineVersion, prngAlgorithm, baseSeed,
  //           replications, maxSimTime, warmupPeriod, seed }
  // Returns: UTF-8 Markdown string. No truncation applied.
}
```

**Dependencies on `src/llm/prompts.js`:** `buildKpis()`, `goalsToPrompt()`, and `buildGoalGaps()` are the canonical field-selection layer. `buildLLMBundle` imports these three functions to avoid diverging from the in-product AI context. These three functions must be exported from `prompts.js` (Sprint 82 task F82.1 adds the `export` keyword to each).

**`truncateWords()` must not be called** inside `buildLLMBundle`. The 2,000-word cap in `prompts.js` is a hosted-API cost/latency optimisation and is inappropriate for file export.

**Bundle sections:**

| Section | Source |
|---------|--------|
| Preamble (~150 words) | Hardcoded DES + Three-Phase context |
| Model definition | `model.entityTypes`, `model.queues`, `model.bEvents`, `model.cEvents`, `model.performanceGoals` |
| Experiment configuration | `config` parameter |
| Headline KPIs | `buildKpis(results.summary)` |
| Per-queue wait table | `results.summary.waitDist` (percentile summary) |
| Per-resource utilisation | `results.summary.perResource` |
| Confidence intervals | `results.aggregateStats` (omitted when absent — single-replication runs) |
| Goals pass/fail | `goalsToPrompt()` + `buildGoalGaps()` |
| Replication summary | `results.replications` (omitted when `replications.length === 1`) |

**UI placement:** New `"LLM Bundle (.md)"` option in the Export… popover (`src/ui/execute/index.jsx`). Disabled when no run result is held in component state.

**Test file:** `tests/llm/bundle-export.test.js` — 6 unit tests (basic structure, CI section omitted for single rep, goals table present, no truncation artefacts, preamble present, well-formed Markdown tables).

---

## 5. Development Workflow

### 5.1 Local setup

```bash
git clone git@github.com:sparky100/simmodlr.git
cd simmodlr
npm install
cp .env.example .env.local        # fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev                        # Vite dev server → http://localhost:5173
```

### 5.2 Testing

```bash
npm test                           # Vitest watch mode
npm test -- --run                 # Single pass (CI mode)
npm test -- engine                # Engine layer only
npm test -- ui                    # UI layer only
npm test -- db                    # Database layer only
node tests/engine/mm1_benchmark.js   # M/M/1 analytical gate (must exit 0)
node tests/engine/mmc_benchmark.js   # M/M/c analytical gate (must exit 0)
npm run build                     # Production build verification
```

**Test environment configuration:**

| Layer | Environment | Framework |
|-------|------------|-----------|
| `tests/engine/` | Node | Vitest |
| `tests/ui/` | jsdom | Vitest + React Testing Library |
| `tests/db/` | Node (mocked Supabase) | Vitest |

**Test patterns:**
- Engine tests: pass a fixed seed, assert deterministic output values.
- UI tests: query by ARIA role/label/text, never by CSS class. Test user workflows, not implementation details.
- DB tests: mock the Supabase client at module boundary; assert that `user_id` is always in the query filter.

**Schema contract (CLAUDE.md):** Any change that adds a field to `model_json`, `db/models.js` serialisation, or the Supabase schema *must* include a corresponding Vitest round-trip assertion in `tests/db/`. PRs without this are incomplete.

### 5.3 Branch and review strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable, deployed. All tests must pass before merge. |
| `sprint-XX` | Sprint feature branch. Merged to main at sprint close. |
| `claude/...` | AI-assisted development branch (automated tooling). |

**PR requirements:**
1. `npm test -- --run` exits 0.
2. Both benchmark scripts exit 0.
3. `npm run build` exits 0.
4. Any new `model_json` field has a round-trip test in `tests/db/`.
5. Any new engine feature has a corresponding UI exposure (no engine-only features — UI-Capability Parity rule).

### 5.4 CI/CD pipeline

GitHub Actions runs on every push to `main` and every PR:

```yaml
jobs:
  test:
    - npm ci
    - npm test -- --run
    - node tests/engine/mm1_benchmark.js
    - node tests/engine/mmc_benchmark.js
  build:
    - npm run build
```

Production deployment is a static Vite build (`dist/`) deployed to the hosting provider configured in the repository. Supabase Edge Functions are deployed separately via the Supabase CLI.

### 5.5 Coding conventions

| Convention | Rule |
|-----------|------|
| Component naming | PascalCase (`ModelDetail`, `BEventEditor`) |
| File naming | kebab-case folders, `index.jsx` entry points |
| Function naming | camelCase (`buildEngine`, `fireBEvent`) |
| Constants | UPPER_SNAKE_CASE (`MAX_C_PASSES`) |
| Styling | Inline style objects using `tokens.js`; no hardcoded hex or pixel values |
| Comments | Only when the WHY is non-obvious. No what-comments. No task references. |
| TypeScript | Allowed at schema/domain boundaries (ADR-009). No broad conversion. |
| React | Functional components only. No class components. |
| State management | Local `useState`/`useReducer`. No Redux or Zustand. |

---

## 6. Architectural Decision Records

Full records in `docs/decisions/`. Key decisions affecting day-to-day development:

| ADR | Decision | Impact |
|-----|---------|--------|
| ADR-003 | Safe evaluator strategy — no `eval` or `new Function` for condition evaluation | `conditions.js` owns all predicate evaluation. No dynamic JS in model logic. |
| ADR-004 | mulberry32 PRNG — seeded deterministic PRNG for all engine sampling | `distributions.js` never calls `Math.random()`. Seeds are stored with run records. |
| ADR-007 | Three authoring modes — all write to same `model_json` | Switching mode never loses data. All modes must stay in sync. |
| ADR-009 | TypeScript at boundaries only — no broad codebase conversion | TypeScript for schema types and public interfaces. Engine and UI remain JS/JSX. |
| ADR-010 | @xyflow/react for Visual Designer and Execute canvas | Graph metadata stored in `model_json.graph`. Layout is non-normative. |
| ADR-011 | Conditional routing schema — routing table with predicate nodes | Routing logic expressed as data, not code. Safe evaluator handles routing decisions. |
| ADR-015 | Explicit version milestones — user-initiated snapshots, not auto-versioning | `model_versions` table. Structural change detection flags when a version is stale. |
| ADR-016 | Schedule data separation — timetable rows extracted to `model_schedules` | `model_json` holds `scheduleRef` UUIDs. `resolveInlineSchedules()` merges before engine call. |

---

## 7. Non-Negotiable Invariants

These rules are enforced in code and must not be violated by any PR. They are repeated here because violation typically produces subtle, hard-to-diagnose simulation errors.

1. **Engine purity.** `src/engine/` contains no React import, no DOM API call, no Supabase client call. Any file in `src/engine/` that imports from `react`, `@supabase`, or any browser-only API is a build error.

2. **Single engine entry point.** UI code calls `buildEngine()` from `src/engine/index.js` only. No UI component imports from `src/engine/phases.js`, `src/engine/macros.js`, or other engine internals.

3. **Centralised DB access.** No UI component queries Supabase directly. All DB calls go through `src/db/models.js`, `src/db/supabase.js`, `src/db/results-persistence.js`, or `src/db/runRecord.js`.

4. **Seeded RNG everywhere.** No `Math.random()` call exists in `src/engine/`. All random sampling uses `state.rng` (the run's mulberry32 instance). This ensures reproducibility.

5. **No dynamic code execution.** No `eval()`, `new Function()`, or `Function()` constructor exists anywhere in the codebase. Conditions and routing predicates are JSON trees evaluated by `conditions.js`.

6. **Type safety via Predicate Builder.** Operator sets are constrained by `valueType`. The Predicate Builder prevents operators that do not apply to the attribute type. No free-text logic field is ever added to the model editors.

7. **C-scan restart rule.** When any C-Event fires, the Phase C loop breaks and restarts from the highest-priority C-Event. This is not "reset to the top of the sorted list" — it restarts the *entire* while loop. Any optimisation that skips this restart changes simulation semantics.

8. **UI-Capability Parity.** Every engine feature is exposed in the UI editors. No engine capability may be exercised only by `model_json` hand-editing or by direct API calls. The UI is the authoritative interface.

9. **One canonical model_json.** All three authoring modes (Define editors, Describe / AI Generator, Draw / Visual Designer) write to the same `model_json` object. A change made in one mode is immediately visible in the others. No per-mode model shadow state.

10. **Schema contract.** Any field added to `model_json`, to the DB serialisation in `models.js`, or to the Supabase schema requires a Vitest round-trip test in `tests/db/`. This is a PR gate, not a suggestion.

11. **Engine never mutates its model argument.** `buildEngine()` must not modify the `model` object it receives. This invariant is required for the module-level `WeakMap` runtimeModel cache to be safe (multiple reps share the same object reference). Enforced by `tests/engine/model-immutability.test.js`, which deep-freezes the model before calling `buildEngine()`.

12. **Determinism contract.** The same `model_json` + `seed` must produce byte-identical summary fields (`served`, `reneged`, `avgWait`, `avgSojourn`, `avgWIP`, `finalTime`, `events_processed`) across any two runs, regardless of batch optimisation flags (`collectTrace`, `entityDetail`). Fixed-seed inline snapshots in `tests/engine/determinism-parity.test.js` are the enforcement gate.
