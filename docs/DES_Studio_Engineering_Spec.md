# DES Studio — Engineering Specification

**Version:** 7.0.0  
**Date:** 2026-06-01  
**Sprint baseline:** Sprint 79  
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

DES Studio is a single-page application with a pure-JavaScript simulation engine, a React frontend, and a Supabase (PostgreSQL) backend. The engine has zero runtime dependencies on React or the DOM: it can execute in the browser main thread, a Web Worker, or Node.js without modification.

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
│  │         Web Workers (replication pool)                │  │
│  │  Each worker receives model_json + seed, runs        │  │
│  │  buildEngine(), returns result object                 │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS / Supabase JS client
┌───────────────▼─────────────────────────────────────────────┐
│                    Supabase (PostgreSQL)                     │
│  models  run_results  model_schedules  model_versions       │
│  user_settings  platform_config  feedback  profiles         │
│                                                             │
│  Auth: Supabase Auth (JWT, magic link, email+password)      │
│  RLS: row_level_security on all tables (user_id filter)     │
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
| `index.js` | `buildEngine()` factory, FEL management, run orchestration |
| `phases.js` | Phase A (clock advance), Phase B (B-Event fire), Phase C (C-scan with restart rule) |
| `macros.js` | 15 effect macros: ARRIVE, ASSIGN, COMPLETE, RELEASE, RENEGE, BATCH, UNBATCH, PREEMPT, FAIL, REPAIR, SPLIT, COSEIZE, MATCH, SET, COST |
| `entities.js` | Entity lifecycle, queue discipline sort functions, server pool management, `_busyStart`/`_busyTime` utilisation tracking |
| `distributions.js` | Sampler registry, seeded RNG (mulberry32), all 11 distribution types |
| `conditions.js` | Safe predicate evaluator — no `eval`, no `new Function` |
| `validation.js` | 38 validation rules (V1–V38), pre-run gate |
| `adapters/` | Real-time data sources: RestAdapter, ScheduleFeedAdapter, ActualsStreamAdapter |

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

  experimentDefaults: {
    replications: number;
    warmupPeriod: number;
    maxSimTime: number;
    terminationCondition?: string;      // predicate expression string
  };

  graph?: GraphMetadata;                // @xyflow/react layout (ADR-010)
  performanceGoals?: PerformanceGoal[];
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

```sql
-- User models
CREATE TABLE models (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  model_json   JSONB NOT NULL,
  user_id      UUID REFERENCES auth.users NOT NULL,
  is_public    BOOLEAN DEFAULT FALSE,
  tags         TEXT[],
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Simulation run results
CREATE TABLE run_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        UUID REFERENCES models NOT NULL,
  run_label       TEXT,
  summary         JSONB,              -- KPIs, CI, replication count
  experiment_config JSONB,            -- seed, warmup, maxSimTime, replications
  model_snapshot  JSONB,             -- full model_json at time of run (for Reproduce)
  schedules_map   JSONB,             -- resolved schedule rows (ADR-016)
  tags            TEXT[],
  archived        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Timetable data (ADR-016 — separated from model_json)
CREATE TABLE model_schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     UUID REFERENCES models NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  schedule_json JSONB NOT NULL,       -- rows: [{time, entityType, attributes}]
  is_default   BOOLEAN DEFAULT FALSE,
  created_by   UUID REFERENCES auth.users,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT one_default_per_model UNIQUE NULLS NOT DISTINCT (model_id, is_default)
    WHERE (is_default = TRUE)
);

-- Explicit model version milestones (ADR-015)
CREATE TABLE model_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     UUID REFERENCES models NOT NULL,
  version_label TEXT NOT NULL,
  notes        TEXT,
  model_snapshot JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  created_by   UUID REFERENCES auth.users
);

-- User feedback
CREATE TABLE feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users,  -- nullable (anonymous)
  category     TEXT,
  message      TEXT NOT NULL,
  app_version  TEXT,
  page_context TEXT,
  user_agent   TEXT,
  status       TEXT DEFAULT 'new',
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

Row-Level Security is enabled on all tables. All queries filter by `user_id = auth.uid()`. Public models expose only non-sensitive fields via a separate `public_models` view.

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

### 3.2 src/db/models.js — database interface

All database access from UI components goes through this module. Direct Supabase client calls from components are forbidden.

Key exported functions:

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

### 3.3 Supabase Edge Functions

| Function | Trigger | Description |
|----------|---------|-------------|
| `llm-proxy` | HTTP POST from `src/llm/` | Provider-neutral LLM routing. Accepts a prompt payload, routes to the configured provider (OpenAI, Anthropic, or other), returns a structured response. Credentials never exposed to the browser. |
| `notify-new-signup` | `auth.users` INSERT trigger | Sends email and Slack notification to the platform admin on new user registration. |

### 3.4 LLM prompt builders (src/llm/)

All LLM calls go through `src/llm/prompts.js`. Prompts are built as structured objects; the raw model JSON and run results are injected as context. No UI component constructs LLM prompts directly.

| Builder function | Purpose |
|-----------------|---------|
| `buildModelGenerationPrompt(description)` | Converts natural-language description to `model_json` |
| `buildExplainResultsPrompt(model, results)` | Generates narrative for Results → Explain |
| `buildCompareRunsPrompt(runA, runB)` | Structured comparison of two run results |
| `buildPlanRefinementPrompt(model, feedback)` | Patches `model_json` based on user feedback |
| `buildModelQueryPrompt(model, results, question)` | Context-aware Q&A for Model Assistant sidebar |
| `buildModelDescriptionPrompt(model)` | Plain-English description for Senior Management report |
| `buildCiResults(results)` | Formats CI data for report narrative |

### 3.5 Report generation (src/reports/)

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

---

## 4. Security and Performance

### 4.1 Security model

| Risk | Mitigation |
|------|-----------|
| **Dynamic code execution** | No `eval()`, no `new Function()`, no `Function()` constructor anywhere in the engine or condition evaluator. Predicates are parsed JSON trees evaluated by `conditions.js:evaluateCondition()`. |
| **Injection via model fields** | All model fields are consumed as data, never concatenated into code strings. Distribution parameters are numbers; predicate nodes are typed JSON objects. |
| **Database access control** | Supabase RLS enforces `user_id = auth.uid()` on every table. No shared-state tables. Public models are exposed via a read-only view. |
| **LLM prompt injection** | LLM responses are parsed and validated against the model JSON schema before `Apply` is offered. Malformed or schema-violating responses are rejected with a user-visible error. |
| **Credential exposure** | LLM API keys are held exclusively in Supabase Edge Function environment variables. The `llm-proxy` function proxies all LLM calls server-side. No AI provider key is ever sent to or stored in the browser. |
| **WCAG 2.1 AA** | All interactive elements have ARIA labels. Colour contrast meets AA minimums. Keyboard navigation supported throughout. |

### 4.2 Performance envelope

| Scenario | Target | Notes |
|---------|--------|-------|
| Single replication, 10,000 events | < 2 seconds | Main thread or Web Worker |
| 30 replications, 100,000 events each | < 60 seconds | Worker pool, 4 workers |
| M/M/1 analytical accuracy | Within 5% of formula | Benchmark gate in CI (`mm1_benchmark.js`) |
| M/M/c analytical accuracy | Within 5% of formula | Benchmark gate in CI (`mmc_benchmark.js`) |
| model_json parse + validate | < 100 ms | All 38 validation rules |
| Visual Designer canvas: 50 nodes | 60 fps | @xyflow/react default render loop |

Worker pool size defaults to `navigator.hardwareConcurrency - 1` (minimum 2). The replication runner distributes seeds sequentially to workers; each worker is stateless and receives the full `model_json` on each call.

### 4.3 Results persistence limits

`src/db/results-persistence.js` enforces payload size limits before saving to Supabase:

- **Detailed results** (entity-level trace, full time-series): stored at full fidelity for the most recent run per model.
- **Summary results** (KPI cards, CI tables): always stored.
- **Time-series resolution**: downsampled to 500 points per series if raw count exceeds 2,000.

### 4.4 MAX_C_PASSES guard

The Phase C loop has a hard limit of `MAX_C_PASSES = 500` iterations per clock tick. Exceeding this limit triggers:
1. A warning banner in the Execute panel.
2. A `TRUNCATION` trace entry in the Step Log.
3. Continuation of the simulation (the run is not aborted).

Models consistently triggering this guard should be reviewed: the most common cause is a circular C-Event dependency or a condition that becomes true immediately after its effects fire.

---

## 5. Development Workflow

### 5.1 Local setup

```bash
git clone git@github.com:sparky100/des-studio.git
cd des-studio
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

3. **Centralised DB access.** No UI component queries Supabase directly. All DB calls go through `src/db/models.js` or `src/db/supabase.js`.

4. **Seeded RNG everywhere.** No `Math.random()` call exists in `src/engine/`. All random sampling uses `state.rng` (the run's mulberry32 instance). This ensures reproducibility.

5. **No dynamic code execution.** No `eval()`, `new Function()`, or `Function()` constructor exists anywhere in the codebase. Conditions and routing predicates are JSON trees evaluated by `conditions.js`.

6. **Type safety via Predicate Builder.** Operator sets are constrained by `valueType`. The Predicate Builder prevents operators that do not apply to the attribute type. No free-text logic field is ever added to the model editors.

7. **C-scan restart rule.** When any C-Event fires, the Phase C loop breaks and restarts from the highest-priority C-Event. This is not "reset to the top of the sorted list" — it restarts the *entire* while loop. Any optimisation that skips this restart changes simulation semantics.

8. **UI-Capability Parity.** Every engine feature is exposed in the UI editors. No engine capability may be exercised only by `model_json` hand-editing or by direct API calls. The UI is the authoritative interface.

9. **One canonical model_json.** All three authoring modes (Forms/Tabs, AI Generator, Visual Designer) write to the same `model_json` object. A change made in one mode is immediately visible in the others. No per-mode model shadow state.

10. **Schema contract.** Any field added to `model_json`, to the DB serialisation in `models.js`, or to the Supabase schema requires a Vitest round-trip test in `tests/db/`. This is a PR gate, not a suggestion.
