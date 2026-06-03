> **SUPERSEDED** — This specification covered Sprints 1-11 and has been superseded by `AGENTS.md`
> which contains the current authoritative specification for all sprints through 35.
> Date superseded: 2026-05-15

# simmodlr — Complete Specification

**Version:** 7.0.0  
**Last updated:** 2026-05-08  
**Status:** Live specification — reflects Sprints 1–11 complete, Sprint 12 pending

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repository Architecture](#3-repository-architecture)
4. [Three-Phase Simulation Engine](#4-three-phase-simulation-engine)
5. [Entity Model & Action Vocabulary](#5-entity-model--action-vocabulary)
6. [Canonical Model JSON Schema](#6-canonical-model-json-schema)
7. [Probability Distributions](#7-probability-distributions)
8. [Condition Evaluation & Predicate Builder](#8-condition-evaluation--predicate-builder)
9. [Queue Discipline Rules](#9-queue-discipline-rules)
10. [Three Authoring Modes](#10-three-authoring-modes)
11. [Execute Panel & Live Canvas](#11-execute-panel--live-canvas)
12. [Replication Engine & Results](#12-replication-engine--results)
13. [AI Insights & LLM Integration](#13-ai-insights--llm-integration)
14. [Platform Features](#14-platform-features)
15. [Database Schema](#15-database-schema)
16. [Authentication & Multi-User Rules](#16-authentication--multi-user-rules)
17. [Pre-Run Model Validation](#17-pre-run-model-validation)
18. [Testing Strategy](#18-testing-strategy)
19. [Commands & Scripts](#19-commands--scripts)
20. [Sprint History & Roadmap](#20-sprint-history--roadmap)
21. [Deferred Features](#21-deferred-features)
22. [Architectural Decision Records](#22-architectural-decision-records)

---

## 1. Project Overview

simmodlr is a browser-based discrete-event simulation (DES) modelling tool implementing **Pidd's Three-Phase Method (A/B/C)**. Modellers define entity types, queues, B-Events, and C-Events using three authoring modes (Forms/Tabs, AI Generated Model, Visual Designer), run single or parallel replications, and view results in real time.

**Target user:** A simulation modeller who understands DES concepts. The UI must never require them to write code or logic strings — all model logic is built through structured pickers and the Predicate Builder.

**Key capabilities at v7.0.0:**
- Full Three-Phase DES engine with seeded PRNG, safe condition evaluator, and three queue disciplines
- Three authoring modes over one canonical `model_json`: Forms/Tabs, AI Generated Model, Visual Designer
- Visual Designer with `@xyflow/react` graph-first authoring, round-trip with canonical model
- Execute Canvas with topology-derived live flow view, entity token animation, configurable KPI bar, bottom panel (Step Log, Entity Table, Stage KPIs, Charts)
- Multi-replication with bounded Web Worker pool, live 95% confidence intervals
- Conditional routing (attribute-based + probabilistic), multi-server pooling (capacity > 1)
- Finite queue capacity, balking (probability + condition-based), overflow routing
- Time-series queue/resource data collection with SVG charts and waiting-time histograms
- Piecewise time-varying distributions and server shift schedules
- Warm-up period, termination conditions, reneging
- AI Insights panel with streaming LLM analysis (Anthropic via Supabase Edge Function proxy)
- Model import/export, accessibility, onboarding tour
- Multi-user auth with role-based platform access, public model sharing with fork-on-run
- Durable user settings (animation, KPI pinning, UI preferences)
- Incremental TypeScript at schema/domain boundaries

---

## 2. Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Frontend framework | React | 18.3.1 | Functional components only. No class components. |
| Build tool | Vite | 5.4.0 | ESM throughout |
| Language | JavaScript (JSX) + incremental TypeScript | — | TS at schema/domain boundaries (ADR-009). No broad TS conversion. |
| Styling | Inline style objects | — | No CSS classes. No CSS framework. Tokens in `ui/shared/tokens.js` |
| Canvas / DAG | @xyflow/react | 12.10.2 | Visual Designer authoring + Execute Canvas live flow view |
| Database / auth | Supabase JS client | 2.45.0 | PostgreSQL backend. Auth via Supabase Auth. |
| Test runner | Vitest | 1.6.0 | Dual env: node (engine) + jsdom (UI) |
| Charting | SVG (custom) | — | Time-series charts in Execute panel |
| Animation | CSS transitions | — | Entity token animation on execute canvas |
| LLM proxy | Supabase Edge Function | — | Provider-neutral routing; Anthropic deployed |
| Linting | None | — | Not yet installed (deferred) |
| TypeScript | tsc | 6.0.3 | `npm run typecheck`, incremental adoption |

---

## 3. Repository Architecture

### 3.1 Directory Structure

```
project root
├── AGENTS.md                        ← Architectural contract (the primary rulebook)
├── CLAUDE.md                        ← Sprint context file
├── docs/
│   ├── addition1_entity_model.md   ← Entity schema, macros, distributions spec
│   ├── simmodlr_Build_Plan.md    ← Sprint-by-sprint build plan (living)
│   ├── simmodlr_Specification.md ← This file
│   ├── simmodlr_User_Guide.md    ← End-user documentation
│   ├── simmodlr_Visual_Designer_Design.md ← Visual designer design doc
│   ├── decisions/                  ← ADR files (11 accepted)
│   │   ├── ADR-001-auth-model.md
│   │   ├── ...
│   │   └── ADR-011-conditional-routing-schema.md
│   └── img_*.png                   ← Architecture diagrams
├── src/
│   ├── engine/                      ← Pure JS Three-Phase DES engine. No React. No DOM.
│   │   ├── index.js                ← Public API: buildEngine(), step(), runAll()
│   │   ├── phases.js               ← fireBEvent(), fireCEvent(), applyEffect()
│   │   ├── entities.js             ← Entity pool, queue discipline (FIFO/LIFO/PRIORITY), helpers
│   │   ├── distributions.js        ← Sampler functions, registry pattern, mulberry32 PRNG
│   │   ├── conditions.js           ← Safe evaluators: evaluatePredicate(), evalCondition()
│   │   ├── macros.js               ← Macro registry: ARRIVE, ASSIGN, COMPLETE, RELEASE, RENEGE
│   │   ├── validation.js           ← Pre-run model validation (V1–V21 rules)
│   │   ├── statistics.js           ← Mean, stddev, 95% CI, t-distribution helpers
│   │   ├── replication-runner.js   ← Bounded Web Worker pool orchestration
│   │   └── worker.js               ← Single-replication worker entry point
│   ├── contracts/                   ← TypeScript type definitions (ADR-009)
│   │   ├── model.ts                ← DesModelJson, entity/queue/event interfaces
│   │   ├── run.ts                  ← SimulationResult, ReplicationResultPayload, CI types
│   │   └── user-settings.ts        ← UserSettingsJson, NormalizedUserSettings
│   ├── ui/
│   │   ├── shared/
│   │   │   ├── tokens.js           ← Design tokens (colours, spacing, typography)
│   │   │   └── components.jsx      ← Shared components (DistPicker, Btn, Empty, etc.)
│   │   ├── editors/
│   │   │   └── index.jsx           ← All tab editors: EntityType, BEvent, CEvent, Queue,
│   │   │                              StateVariable, AI Generated Model, Visual Designer
│   │   ├── execute/
│   │   │   ├── index.jsx           ← Execute panel: Run, Step Log, Entity Table, CI dashboard
│   │   │   └── ExecuteCanvas.jsx   ← Topology-derived live flow view (Sprint 9C)
│   │   ├── ModelDetail.jsx         ← Model detail shell with tab navigation
│   │   └── visual-designer/        ← Visual Designer components
│   │       ├── graph.js            ← deriveGraphFromModel(), canonical <-> graph topology
│   │       ├── FlowDiagramReactFlow.jsx ← @xyflow/react canvas setup
│   │       └── FlowValidationPanel.jsx  ← Visual validation panel
│   ├── db/
│   │   ├── models.js               ← All Supabase CRUD wrappers
│   │   └── supabase.js             ← Supabase client singleton
│   ├── llm/
│   │   ├── prompts.js              ← AI prompt builders (KPI narrative, comparison, sensitivity)
│   │   └── apiClient.js            ← LLM streaming API client with cancellation
│   └── App.jsx                     ← Auth listener + model library shell
├── supabase/
│   ├── functions/llm-proxy/        ← Supabase Edge Function for LLM proxy (Anthropic)
│   └── migrations/
│       └── 20260505073000_platform_roles_user_settings.sql ← Platform roles + user settings
├── tests/
│   ├── engine/                     ← Engine unit tests (18 test files)
│   ├── ui/                         ← UI component tests (jsdom env)
│   ├── db/                         ← DB wrapper tests (mocked Supabase)
│   ├── contracts/                  ← TypeScript contract tests
│   ├── llm/                        ← LLM prompt tests
│   └── setup.js                   ← Global test setup (jsdom, Supabase mock)
├── vite.config.js
├── tsconfig.json
└── package.json
```

### 3.2 Architecture Rules (Never Violated)

- `src/engine/` has zero React imports and zero DOM access. It is pure JavaScript.
- `src/ui/` components never import engine internals directly, except `buildEngine()` which is called only from `execute/index.jsx`.
- All Supabase access goes through `src/db/models.js` or `src/db/supabase.js`. Never query Supabase directly from a UI component.
- `tokens.js` is the single source of truth for all colours, spacing, and font sizes. Never hardcode style values.
- TypeScript is permitted incrementally for shared contracts and domain boundaries.
- The canonical `model_json` has 6 keys: `entityTypes`, `stateVariables`, `bEvents`, `cEvents`, `queues`, `graph` (optional). `graph` is layout metadata only.

---

## 4. Three-Phase Simulation Engine

### 4.1 The Required Loop Structure

```javascript
// CORRECT Three-Phase loop — the law
while (fel.length > 0 && !terminationConditionMet()) {

  // Phase A — Clock advance
  const T_now = fel[0].scheduledTime;

  // Phase B — Fire all B-Events at T_now (deterministic)
  const bEventsNow = fel.filter(e => Math.abs(e.scheduledTime - T_now) < 1e-9);
  for (const bEvent of bEventsNow) {
    removeFEL(bEvent);
    fireBEvent(bEvent, state);
  }

  // Phase C — Iterative conditional scan with restart rule
  let cFired = true;
  let passCount = 0;
  while (cFired) {
    cFired = false;
    passCount++;
    if (passCount > MAX_C_PASSES) {
      logWarning('Phase C truncated after ' + MAX_C_PASSES + ' passes');
      break;  // warning surfaced to UI, not silently discarded
    }
    for (const cEvent of sortedByPriority(cEvents)) {
      if (conditionIsTrue(cEvent, state)) {
        fireCEvent(cEvent, state);
        cFired = true;
        break;  // RESTART from top of for-loop — THREE-PHASE RESTART RULE
      }
    }
  }
}
```

### 4.2 Engine Public API (`src/engine/index.js`)

```javascript
buildEngine(model, seed, warmupPeriod, maxSimTime, terminationCondition, maxCycles, maxCPasses, collectTimeSeries)
  → { step, runAll, getSnap, getFelSize, getSummary, getTimeSeries, getWaitDist, getEntitySummary }

step()   → { done, cycleLog, snap, felSize, phaseCTruncated }
runAll() → { finalTime, log, snap, summary, entitySummary, timeSeries, waitDist, perQueue }
```

### 4.3 Key Engine Rules

- **Restart rule is non-negotiable.** When a C-Event fires, the scan must `break` and restart from Priority 1.
- **Phase C truncation must be visible.** Warning appears in UI and log entry is written. Cap is 500 passes, configurable via `maxCPasses`.
- **Phase B fires all events at `T_now`.** Use floating-point tolerance `< 1e-9` when comparing scheduled times.
- **The FEL is sorted at all times.** New B-Events are inserted in scheduled-time order.
- **The engine is stateless between calls.** `buildEngine(model, seed, ...)` constructs a fresh state object. No module-level mutable state.
- **C-Event Priority** is an explicit integer field. Lower integer = higher priority. Priority 1 fires before Priority 2.

### 4.4 Special Event Types

| Event Type | Purpose | Scheduling |
|---|---|---|
| `WARMUP` | Resets statistics at configured warm-up time | Scheduled at engine init if `warmupPeriod > 0` |
| `SHIFT_CHANGE` | Adjusts server instance count at scheduled times | Generated from `entityType.shiftSchedule` at engine init |
| `RATE_CHANGE` | Activates next piecewise distribution period | Generated from piecewise distribution definitions at engine init |

---

## 5. Entity Model & Action Vocabulary

### 5.1 Entity Classes

Each entity belongs to exactly one Entity Class defined by the modeller:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique identifier. Example: `Customer`, `Patient`. |
| `label` | string | No | Display name. Defaults to `name`. |
| `colour` | hex string | No | Entity token colour. Defaults to `#4A90D9`. |
| `attributes` | Attribute[] | Yes | Typed attributes the entity carries. |
| `arrivalSource` | string | Yes | ID of the Source node generating this class. |
| `role` | enum | Yes | `customer` for arriving entities, `server` for pre-created resources. |
| `count` | number | Server only | Static server capacity. Default 1. |
| `shiftSchedule` | ShiftPeriod[] | No | Time-varying server capacity. Overrides `count`. |

**Attribute Definition:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique within class. Used as `Entity.name` in predicates. |
| `valueType` | enum | Yes | `number` \| `string` \| `boolean` |
| `defaultValue` | any | Yes | Must match `valueType`. NaN is a hard validation error. |
| `allowedValues` | string[] | No | If present, renders as dropdown (string type only). |
| `mutable` | boolean | No | If false, ASSIGN cannot modify this attribute. Defaults to `true`. |

### 5.2 State Variables

**Built-in Resource State:**

| Variable Pattern | Type | Definition |
|---|---|---|
| `Resource.<id>.status` | enum | `IDLE` or `BUSY` (for capacity=1) |
| `Resource.<id>.busyCount` | number | Entities currently holding resource (0 to capacity) |
| `Resource.<id>.capacity` | number | Total simultaneous occupancies supported |
| `Resource.<id>.utilisation` | number | Running time-average utilisation (run-completion only) |

**Built-in Queue State:**

| Variable Pattern | Type | Definition |
|---|---|---|
| `Queue.<id>.length` | number | Entities currently waiting |
| `Queue.<id>.maxLength` | number | Observed maximum (read-only, not for conditions) |

**User-Defined State Variables:** Numeric counters defined by modeller. Available as condition tokens. May be modified by ASSIGN.

### 5.3 The Five Permitted Macros (Closed Set)

| Macro | Phase | Purpose |
|---|---|---|
| `ARRIVE` | B-Event | Creates entity, places in queue, schedules next arrival |
| `SEIZE` | C-Event (via ASSIGN) | Removes entity from queue, assigns to resource, schedules COMPLETE |
| `COMPLETE` | B-Event | Releases resource, records stats, routes entity to next node |
| `ASSIGN` | B or C | Modifies entity attribute or user-defined state variable |
| `RELEASE` | B-Event | Frees server, returns entity to waiting queue |

**These five macros are the complete and closed set.** No other macros may be added without updating the specification.

### 5.4 Extended Routing (Sprint 10)

**Conditional routing** on RELEASE B-Event:
```json
{
  "effect": "RELEASE(Triage Nurse)",
  "routing": [
    { "condition": { "variable": "Entity.outcome", "operator": "==", "value": "ICU" }, "queueName": "ICU Queue" },
    { "condition": { "variable": "Entity.outcome", "operator": "==", "value": "ward" }, "queueName": "Ward Queue" }
  ],
  "defaultQueueName": "Ward Queue"
}
```

**Probabilistic routing** (alternative to conditional):
```json
{
  "effect": "RELEASE(Doctor)",
  "probabilisticRouting": [
    { "probability": 0.7, "queueName": "Ward Queue" },
    { "probability": 0.3, "queueName": "ICU Queue" }
  ]
}
```

Rules: `routing`, `probabilisticRouting`, and a RELEASE literal queue arg are mutually exclusive. First match wins for conditional routing. Probabilities must sum to 1.0 (±0.001).

### 5.5 Finite Queues & Balking (Sprint 11)

**Queue capacity:** `Queue.capacity` (integer >= 1, default null = unlimited). ARRIVE enforces: if `Queue.length >= capacity`, entity is blocked and routed to `overflowDestination`.

**Balking:** `balkCondition` (predicate) or `balkProbability` (0–1) on ARRIVE B-Event. Evaluated before entity joins queue. Balked entity routed to `overflowDestination` or exits.

**Per-queue metrics tracked:** `blockingCount`, `balkCount`.

---

## 6. Canonical Model JSON Schema

The canonical model JSON stored in Supabase `models.model_json` has this structure:

```typescript
interface DesModelJson {
  entityTypes: EntityTypeDefinition[];
  stateVariables: StateVariableDefinition[];
  bEvents: BEventDefinition[];
  cEvents: CEventDefinition[];
  queues: QueueDefinition[];
  graph?: ModelGraphMetadata;  // optional, layout-only
}

interface ModelGraphMetadata {
  version?: number;
  nodes: Array<{ id: string; type?: string; refId?: string; x: number; y: number }>;
  edges: Array<{ id: string; source: string; target: string; label?: string; style?: string }>;
  viewport?: { x: number; y: number; zoom: number };
}
```

The `graph` field is layout metadata only — never contains simulation logic. If missing or stale, the Visual Designer regenerates it from canonical model data.

---

## 7. Probability Distributions

### 7.1 Registered Distributions

All distributions use the **registry pattern** in `distributions.js`. Adding a new type requires only `registerDistribution()` — no engine changes.

| Type | Parameters | Notes |
|---|---|---|
| `exponential` | `rate` (λ > 0) | Primary inter-arrival distribution |
| `uniform` | `min`, `max` | `max > min` enforced |
| `normal` | `mean`, `stdDev` | Negative clamped to 0 for durations |
| `triangular` | `min`, `mode`, `max` | `min ≤ mode ≤ max` |
| `fixed` | `value` | Deterministic |
| `lognormal` | `logMean`, `logStdDev` | Negative clamped to 0 |
| `empirical` | `values[]` | Inline or CSV-imported values array |
| `erlang` | `k` (shape), `mean` | Integer k >= 1, mean > 0 |
| `piecewise` | `periods[]` | Time-varying: selects period by `startTime <= clock` |

### 7.2 Seeded PRNG

```javascript
// Required — seeded PRNG passed into buildEngine()
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
```

- Every distribution sample must use the replication's seeded PRNG — never `Math.random()`.
- Different seeds produce different sequences; same seed produces bit-identical results.
- Every replication uses a unique integer seed derived from the base seed + replication index.

### 7.3 CSV Import for Empirical Distributions

- CSV parsed in browser at import time. File never stored in Supabase.
- Numeric column extracted into `values` array in `model_json`.
- Non-numeric rows skipped; >10% skipped triggers warning.
- After import, UI shows: filename, column, row count, min, max, mean. Modeller confirms.
- Engine receives only the `values` array — no CSV awareness at runtime.

---

## 8. Condition Evaluation & Predicate Builder

### 8.1 Safe Condition Evaluator

`conditions.js` provides two evaluators, neither using `new Function()` or `eval()`:

**`evaluatePredicate(predicate, state)`** — Evaluates JSON predicates (Addition 1 §4):
```javascript
// Single predicate
{ "variable": "Queue.q_main.length", "operator": ">=", "value": 1 }

// Compound
{ "operator": "AND", "clauses": [ ... ] }

// Entity filter (for filtered queue selection)
{ "entityFilter": { "variable": "Entity.type", "operator": "==", "value": "urgent" } }
```

**`evalCondition(conditionStr, helpers, state, clock)`** — Legacy string evaluator using safe token substitution + `evalAtom()` comparison. Supports tokens: `queue(Type).length`, `idle(Type).count`, `busy(Type).count`, `attr(Type, attrName)`, `served`, `reneged`, `clock`, user-defined variables, `AND`/`OR` connectives.

### 8.2 Predicate Builder UI Rules

- Variable picker: Entity attributes + Resource state vars + Queue state vars + user vars only
- Operator dropdown filtered by `valueType`: number → 6 ops, string → 2 ops, boolean → 2 ops
- Value input changes widget: number input / dropdown (if `allowedValues`) / toggle (boolean)
- Compound predicates serialise to nested JSON — never a flat string
- Entity filter predicates reference `Entity.<attr>` variables only — no Resource/Queue vars
- Free-text entry is prohibited. The `Custom...` escape hatch is removed.

---

## 9. Queue Discipline Rules

| Discipline | Entity Selection Rule | Tiebreaker |
|---|---|---|
| `FIFO` | Smallest `arrivalTime` among candidates | — |
| `LIFO` | Largest `arrivalTime` among candidates | — |
| `PRIORITY` | Smallest `Entity.priority` attribute value | FIFO on equal priority |

Queue discipline is enforced **in the engine** on every SEIZE call — not a UI-only configuration.

---

## 10. Three Authoring Modes

ADR-007 establishes three first-class authoring modes over one canonical `model_json`:

| Mode | Description | Status |
|---|---|---|
| **Forms/Tabs** | Tab-based form editors for Entity Types, B-Events, C-Events, Queues, State Variables. Precise manual control for complex conditions and distributions. | ✅ Working (original) |
| **AI Generated Model** | Natural-language model description → AI generates complete `model_json`. Diff preview and partial apply. | ✅ Working (Sprint 8) |
| **Visual Designer** | Graph-first authoring using `@xyflow/react`. Drag-to-place palette, connection edges, inspector panels. Optional `model_json.graph` for layout. | ✅ Working (Sprint 9, hardened Sprint 9B) |

All three modes read/write the same canonical `model_json`. Switching modes is seamless.

---

## 11. Execute Panel & Live Canvas

### 11.1 Execute Canvas (Sprint 9C)

The execution view uses a topology-derived live canvas (`ExecuteCanvas.jsx`) powered by `@xyflow/react`. Layout comes from `model_json.graph` — same positions set in Visual Designer.

**Execute-mode node components:**
- **Source** — inter-arrival rate, next arrival countdown, arrival pulse animation
- **Queue** — depth badge (color-coded), entity token dots (up to 8 + "+N more"), discipline badge, live sparkline (rolling 20-value depth)
- **Activity** — server pool dot-grid (■ BUSY / □ IDLE), utilisation %, busy/capacity fraction, flash on service completion
- **Sink** — total served, throughput rate, mean sojourn time

### 11.2 Entity Token Animation

- Small coloured dots (colour by entity type) animate along edges on routing events
- CSS transition over 300ms, max 5 simultaneous tokens per edge
- Toggle on/off stored in `user_settings`

### 11.3 Bottom Panel

Collapsible tabbed panel below canvas:
- **Tab 1: Step Log** — phase-tagged event log (node-filterable by clicking canvas node)
- **Tab 2: Entity Table** — entity status list
- **Tab 3: Stage KPIs** — per-queue (depth, mean/max wait, total arrivals, reneged) and per-server (capacity, busy, utilisation, mean service time, completions) live stats
- **Tab 4: Charts** — time-series plots and waiting-time histograms (Sprint 10)

### 11.4 Global KPI Bar

Configurable bar with Arrived / Served / Reneged / Waiting (default four). Each slot user-pinnable to one of: Arrived, Served, Reneged, Waiting, Sim Clock, Active Entities. Preference stored in `user_settings`.

### 11.5 Step/Speed Controls

◀ Step | ▶▶ Run | ‖ Pause | ■ Stop | Speed: [slider] 0.5×–10×

---

## 12. Replication Engine & Results

### 12.1 Architecture (ADR-006)

- Bounded Web Worker pool (max 4 workers, `navigator.hardwareConcurrency - 1`)
- Same-browser live progress via local runner callbacks (not Supabase real-time)
- One database row per replication batch; per-replication results + aggregate CI in `results_json`
- Cancellation supported: stops pending replications, terminates active workers, does not persist cancelled runs

### 12.2 Confidence Intervals

95% CI computed using t-distribution. Per-replication metrics aggregated across replications:
- Mean wait time, mean service time, mean sojourn time
- Throughput rate
- Utilisation

### 12.3 Results Object

```javascript
{
  finalTime: number,
  log: Array<{ phase, time, message, snap? }>,
  snap: { clock, served, reneged, entities, scalars, byType, nextArrivals, eventCounts },
  summary: { total, served, reneged, avgWait, avgSvc, avgSojourn, maxSojourn, warmupPeriod, excludedCount, warnings },
  entitySummary: Array<{ id, type, status, attrs, stages, ... }>,
  timeSeries?: Array<{ t, byType }>,         // if collectTimeSeries = true
  waitDist?: Record<queueName, { n, mean, p50, p90, p95, p99, values }>,
  perQueue?: Record<queueName, { blockingCount?, balkCount? }>
}
```

---

## 13. AI Insights & LLM Integration

### 13.1 Architecture (Sprint 6)

- **`src/llm/prompts.js`** — Prompt builders for KPI narrative, scenario comparison, and sensitivity commentary
- **`src/llm/apiClient.js`** — Streaming API client with cancellation, error fallback, safe plain-text rendering
- **`supabase/functions/llm-proxy/index.ts`** — Supabase Edge Function (deployed to project `znkknldzdfajcrpabtmg`)
- `ANTHROPIC_API_KEY` stored as Supabase Edge Function secret — never client-side

### 13.2 AI Generated Model Authoring (Sprint 8)

- Natural-language description → AI generates complete `model_json`
- Provider-neutral request contract (Sprint 8A): model routing handled server-side
- Diff preview before apply, partial apply support
- Follows same validation as manually-authored models

---

## 14. Platform Features

### 14.1 Roles & Settings (Sprint 7B, ADR-008)

- `profiles.role` is the platform-role source of truth: `user` or `admin`
- Model-level owner/editor/viewer access separate from platform roles
- `user_settings` table for durable user preferences (animation, KPI pinning, UI preferences)
- Supabase migration committed: `20260505073000_platform_roles_user_settings.sql`

### 14.2 Fork Model (ADR-002)

When a non-owner user initiates a run on a public model, the UI first creates a private copy (fork) for the user. All subsequent runs are associated with this forked model. Original model's run history unaffected.

### 14.3 Error Boundaries

React error boundaries at three levels: Model Library, Model Editors, Execute Panel. Each catches rendering errors and shows a recovery UI without crashing the entire app.

### 14.4 Accessibility

Skip-to-content link, keyboard navigation, ARIA labels on interactive controls, focus management in modals and tooltips.

### 14.5 Onboarding

Staged onboarding tour: first-run welcome modal, guided model creation flow, contextual hints on execute panel.

---

## 15. Database Schema

### 15.1 Tables

| Table | Key Columns | Notes |
|---|---|---|
| `models` | `id`, `name`, `owner_id`, `model_json`, `is_public`, `entity_types`, `state_variables`, `b_events`, `c_events`, `queues`, `created_at`, `updated_at` | `model_json` is JSONB. Top-level columns are denormalised for querying. |
| `profiles` | `id`, `username`, `avatar_url`, `role` | Linked to `auth.users`. Role defaults to `user`. |
| `user_settings` | `user_id`, `schema_version`, `settings_json`, `created_at`, `updated_at` | `settings_json` is JSONB with `ui`, `execute`, `ai` namespaces. |
| `runs` | `id`, `model_id`, `seed`, `replications`, `max_simulation_time`, `results_json`, `batch_id`, `created_at` | One row per replication batch. |

### 15.2 Schema Rules

- Never add columns without adding corresponding CRUD wrapper in `src/db/models.js`
- `model_json` must always conform to the canonical schema (Section 6)
- Every INSERT into `models` must set `owner_id` to `session.user.id`
- RLS policies enforce data isolation — frontend filtering is UX, not security boundary

---

## 16. Authentication & Multi-User Rules

### 16.1 Key Rules

- `src/App.jsx` manages the Supabase auth session listener — single source of truth
- `src/db/supabase.js` exports the single Supabase client instance — never create a second
- Every model belongs to exactly one user via `owner_id`
- Every LIST query must filter by `user_id` or `is_public`
- `is_public` must never be overwritten silently on patch operations
- Components read session from context/props — never call `supabase.auth.getSession()` directly

### 16.2 Prohibited Patterns

```javascript
// PROHIBITED — returns all models from all users
supabase.from('models').select('*')

// CORRECT — list only the current user's models
supabase.from('models').select('*').eq('user_id', session.user.id)

// CORRECT — list public models from all users
supabase.from('models').select('*').eq('is_public', true)
```

---

## 17. Pre-Run Model Validation

All validation runs before `buildEngine()` is called. Validation failures block the run and surface errors inline in the editor panel.

### 17.1 Blocking Errors (run prevented)

| Code | Rule                                                                                   |
| ---- | -------------------------------------------------------------------------------------- |
| V1   | Every Entity Class has a unique, non-empty name                                        |
| V2   | Every attribute name is unique within its Entity Class                                 |
| V3   | Every `defaultValue` matches its declared `valueType`                                  |
| V4   | PRIORITY queue discipline requires a numeric `priority` attribute                      |
| V5   | All distribution parameters are within valid bounds                                    |
| V6   | No B-Event schedule references a deleted or non-existent event ID                      |
| V7   | Every Activity node has at least one incoming and one outgoing edge                    |
| V8   | Model contains at least one Source node and one Sink node                              |
| V9   | No C-Event condition references an undefined variable or attribute                     |
| V10  | No attribute name collides with built-in namespaces (`Resource`, `Queue`)              |
| V12  | Piecewise distributions must have at least one period, start at time 0                 |
| V13  | Piecewise distribution periods must be sorted ascending                                |
| V14  | Server `shiftSchedule` must start at time 0, sorted, positive integer capacities       |
| V17  | Routing entries reference valid queues; mutually exclusive with literal queue arg      |
| V18  | Probabilistic routing probabilities sum to 1.0 (±0.001); valid queue references        |
| V19  | Server entity type `count` must be an integer ≥ 1                                      |
| V20  | Queue `capacity` must be integer ≥ 1; `overflowDestination` must reference valid queue |
| V21  | `balkProbability` must be 0–1                                                          |

### 17.2 Warnings (run proceeds, banner shown)

| Code | Rule |
|---|---|
| V11 | Normal distribution where `mean < 2 × stdDev` — frequent negative sample clamping |
| V15 | Shift times after configured run duration are unreachable |
| V16 | No simulation time limit or termination condition set |

---

## 18. Testing Strategy

### 18.1 Test Inventory

| Layer | Files | Tests | Environment | Status |
|---|---|---|---|---|
| Engine (Three-Phase, macros, conditions, entities, distributions, validation, replication, time-series, finite-queue, multi-server, routing) | 18 files | ~400+ | Node | ✅ Complete |
| UI components (editors, execute, visual-designer, model-export, accessibility, onboarding, delete-model, shared) | 13+ files | ~100+ | jsdom | ✅ Growing |
| DB / Supabase wrappers | 1 file | Focused | Node (mocked) | ✅ Core coverage |
| Contracts (TypeScript) | 1+ files | Focused | Node | ✅ Present |
| LLM prompts | 1+ files | Focused | Node | ✅ Present |
| M/M/1 benchmark | 1 file | Manual gate | Node | ✅ Exits 0 (< 5% error) |

### 18.2 Test Environment

```javascript
// vite.config.js — dual environment
test: {
  environment: 'node',                    // default
  environmentMatchGlobs: [
    ['tests/ui/**', 'jsdom'],            // UI tests get jsdom
  ],
  globals: true,
  setupFiles: ['tests/setup.js'],
}
```

### 18.3 Test Rules

- Every engine test must pass a fixed seed to `buildEngine()`. Tests using `Math.random()` are invalid.
- Engine tests must be deterministic — same seed, same result.
- Tests must not import from `src/ui/` or `src/db/`.
- UI tests test behaviour (queries by role/label/text), not implementation (never by CSS class or spy).
- Supabase is always mocked in UI tests.
- M/M/1 benchmark must exit 0 with < 5% error after any engine change.

---

## 19. Commands & Scripts

```bash
npm run dev                              # Vite dev server
npm run build                            # Production build
npm run preview                          # Preview production build

npm test -- --run                        # Full suite, single pass
npm test                                 # Watch mode

# Engine tests (node)
npm test -- three-phase                  # Phase A/B/C loop tests
npm test -- distributions                # Sampler + seeded RNG tests
npm test -- conditions                   # Safe evaluator tests
npm test -- entities                     # Queue discipline tests
npm test -- macros                       # Route/pool/balk tests
npm test -- validation                   # Schema validation tests

# UI tests (jsdom)
npm test -- ui                           # All UI tests
npm test -- execute-panel                # Execute panel tests
npm test -- visual-designer              # Visual Designer tests

# Other
npm test -- db                           # DB wrapper tests
npm test -- contracts                    # TypeScript contract tests
npm test -- llm                          # LLM prompt tests
npm run typecheck                        # TypeScript check (tsc --noEmit)

# Correctness gate
node tests/engine/mm1_benchmark.js       # M/M/1 benchmark
```

---

## 20. Sprint History & Roadmap

### 20.1 Completed Sprints

| Sprint | Status | Completed | Description | Tests |
|---|---|---|---|---|
| Pre-Sprint | ✅ | 2026-04-30 | Audit, setup, CLAUDE.md, .env.example | ~120 |
| Sprint 1 | ✅ | 2026-05-03 | Engine safety: XSS fix, C-scan restart, queue discipline, seeded RNG, validation, DistPicker | 182 |
| Sprint 2 | ✅ | 2026-05-03 | UI Editor completeness: ConditionBuilder, type filtering | 215 |
| Sprint 3 | ✅ | 2026-05-04 | Experiment controls: warm-up, termination, fork model | 272 |
| Sprint 4 | ✅ | 2026-05-04 | Replication: Web Workers, batches, CI dashboard | 294 |
| Sprint 5 | ✅ | 2026-05-04 | Polish: error boundaries, import/export, accessibility, onboarding, owner-only delete | 334 |
| Sprint 6 | ✅ | 2026-05-04 | LLM Integration: AI insights, Supabase Edge Function proxy | 343 |
| Sprint 7A | ✅ | 2026-05-05 | Architecture decisions: ADR-008, ADR-009 | Docs only |
| Sprint 7B | ✅ | 2026-05-05 | Platform implementation: roles, settings, TypeScript contracts | 33 focused |
| Sprint 7 | ✅ | 2026-05-05 | Dynamic DES: piecewise dists, shift schedules, RATE_CHANGE/SHIFT_CHANGE | 369 |
| Sprint 8A | ✅ | 2026-05-05 | LLM provider-neutral architecture | 22 focused |
| Sprint 8 | ✅ | 2026-05-05 | AI Generated Model authoring | 385 |
| Sprint 8B | ✅ | 2026-05-05 | Model definition coherence | Focused |
| Sprint 9A | ✅ | 2026-05-05 | Visual Designer preflight: ADR-010 | Docs only |
| Sprint 9 | ✅ | 2026-05-06 | Visual Designer authoring | 38 focused |
| Sprint 9B | ✅ | 2026-05-07 | Visual Designer UX hardening | Focused |
| Sprint 9C | ✅ | 2026-05-07 | Execute Canvas live flow view | 464 |
| Sprint 10 | ✅ | 2026-05-08 | Routing & Pooling: conditional routing, multi-server, time-series, charts, wait-dist | 508 |
| Sprint 11 | ✅ | 2026-05-08 | Capacity & Output: finite queues, balking, overflow routing | 523 |
| Sprint 12 | ⬜ | — | Assembly & Recirculation: entity batching, rework loops | — |

### 20.2 Forward Roadmap

| Sprint | Focus |
|---|---|
| 12 | Entity batching (BATCH/UNBATCH macros), controlled recirculation (back-edges with loop guards), Entity.loopCount |
| 13+ | Full staff rostering, ROUTE node type, NHPP refinement, dependency audit, SaaS tenancy planning |

### 20.3 Modelling Capability Coverage

| Capability | Status |
|---|---|
| Sequential pathways (RELEASE chain) | ✅ Supported |
| FIFO / LIFO / PRIORITY queue disciplines | ✅ Supported |
| Reneging / abandonment | ✅ Supported |
| 8 distribution types + empirical CSV | ✅ Supported |
| Time-varying arrival rates and shift schedules | ✅ Piecewise + RATE_CHANGE/SHIFT_CHANGE |
| Warm-up period and termination controls | ✅ Supported |
| Multi-replication with 95% CI | ✅ Supported |
| Conditional routing (entity-attribute branching) | ✅ Routing table on RELEASE |
| Probabilistic routing (stochastic branch probability) | ✅ probabilisticRouting |
| Multi-server resource pooling (capacity > 1) | ✅ Pool size field, entity-per-instance |
| Time-series output (queue length / utilisation over time) | ✅ collectTimeSeries flag + SVG Charts tab |
| Finite queues and capacity-limited buffers | ✅ capacity field + overflow routing |
| Balking (probabilistic + condition-based) | ✅ balkProbability + balkCondition |
| Waiting time distribution and percentiles | ✅ p50/p90/p95/p99 + histogram |
| AI-generated model authoring | ✅ Sprint 8 |
| Visual graph authoring | ✅ Sprint 9 |
| Execute canvas live flow view | ✅ Sprint 9C |
| Entity batching / assembly | ❌ Sprint 12 |
| Recirculation / rework loops | ❌ Sprint 12 |
| Full staff rostering (resource shift schedules) | ~ Partial — NHPP implemented, full rostering Sprint 13+ |

---

## 21. Deferred Features

| Feature | Deferred to | Reason |
|---|---|---|
| SaaS tenancy/workspace model | Post-Sprint 12 | Needs separate schema/RLS planning |
| Admin-selectable LLM provider/model | Future admin UI sprint | Server-side config prepared |
| Architecture health review | Post-7A | Broader than roles/settings/TypeScript |
| Apply Sprint 7B migration to remote | Before settings UI depends on it | Deployment step |
| Dependency audit remediation (Vite 8) | Future sprint | Breaks minimal dep constraint |
| Time-varying arrivals NHPP refinement | Future refinement sprint | Piecewise sampling is clock-aware |
| SimPy/FastAPI backend on Render | Post-Sprint 12 | Not required until browser engine insufficient |
| CI enhancements (CRN, antithetic variates) | Post-Sprint 12 | Not blocking modelling vocabulary |
| Full staff rostering UI | Sprint 13+ | Piecewise NHPP + SHIFT_CHANGE implemented |
| ROUTE node type (Visual Designer) | Sprint 13+ | ADR-011 Option A selected; ROUTE is future syntactic sugar |

---

## 22. Architectural Decision Records

| ADR | Title | Status | Sprint |
|---|---|---|---|
| ADR-001 | Multi-user auth model and public model rules | Accepted | Pre-Sprint 1 |
| ADR-002 | Public model run permissions (fork model) | Accepted | Sprint 3 |
| ADR-003 | Safe expression evaluator strategy | Accepted | Sprint 1 |
| ADR-004 | mulberry32 as the seeded PRNG | Accepted | Sprint 1 |
| ADR-005 | Queue discipline lookup by entity type name | Accepted — interim | Sprint 1/2 |
| ADR-006 | Replication runner architecture (bounded worker pool) | Accepted | Sprint 4 |
| ADR-007 | Three authoring modes over one canonical model | Accepted | Sprint 6 |
| ADR-008 | Platform roles and user settings | Accepted | Sprint 7A |
| ADR-009 | Incremental TypeScript adoption | Accepted | Sprint 7A |
| ADR-010 | Visual Designer canvas (`@xyflow/react`) and graph metadata | Accepted | Sprint 9A |
| ADR-011 | Conditional routing schema (routing table on RELEASE) | Accepted | Sprint 10 |
| ADR-012 | Recirculation and batching design | ⬜ Open | Sprint 12 |

---

## Appendix A: Prohibited Patterns (Never Do These)

```
SECURITY
✗  new Function(str)()         — XSS on public models. Use safe evaluator.
✗  eval(str)                   — same risk, any variant
✗  innerHTML = userContent     — XSS. Use textContent or React rendering.

AUTHENTICATION & DATA ISOLATION
✗  supabase.from('models').select('*') with no user_id or is_public filter
✗  supabase.auth.getSession() inside a component
✗  Second Supabase client instance
✗  INSERT to models without user_id = session.user.id
✗  Patch operation that overwrites is_public silently

SIMULATION CORRECTNESS
✗  Math.random()               — non-reproducible. Use seeded PRNG.
✗  C-Event scan without break  — completing full scan before restart violates Three-Phase.
✗  Silent Phase C truncation   — must log and show UI warning.

ARCHITECTURE
✗  Supabase query in UI component  — all DB access through src/db/models.js only.
✗  React import in src/engine/     — engine is pure JS. Zero framework imports.
✗  Hardcoded style values          — all values from tokens.js.
✗  Free-text condition field       — all logic via Predicate Builder. No exceptions.
✗  'Custom...' escape hatch        — removed. Do not recreate under any name.
✗  Architectural rule change without ADR — create docs/decisions/ADR-NNN.md first.

UI / UX
✗  Validation errors in console.log only — must be visible in the editor UI.
✗  Back button discards changes silently — must warn user before navigation.
✗  Component renders broken UI before auth resolves — show loading state.
```

---

## Appendix B: Key Files Reference

| Purpose | File |
|---|---|
| Engine entry point | `src/engine/index.js` |
| Macro definitions | `src/engine/macros.js` |
| Queue discipline | `src/engine/entities.js` |
| Safe condition evaluator | `src/engine/conditions.js` |
| Distribution samplers | `src/engine/distributions.js` |
| Model validation (V1–V21) | `src/engine/validation.js` |
| Three-Phase phases | `src/engine/phases.js` |
| Replication worker pool | `src/engine/replication-runner.js` |
| Worker entry point | `src/engine/worker.js` |
| Statistics (CI helpers) | `src/engine/statistics.js` |
| TypeScript model contracts | `src/contracts/model.ts` |
| TypeScript run contracts | `src/contracts/run.ts` |
| TypeScript settings contracts | `src/contracts/user-settings.ts` |
| Design tokens | `src/ui/shared/tokens.js` |
| Shared UI components | `src/ui/shared/components.jsx` |
| All tab editors | `src/ui/editors/index.jsx` |
| Execute panel | `src/ui/execute/index.jsx` |
| Execute canvas | `src/ui/execute/ExecuteCanvas.jsx` |
| Visual Designer graph helper | `src/ui/visual-designer/graph.js` |
| Visual Designer ReactFlow | `src/ui/visual-designer/FlowDiagramReactFlow.jsx` |
| App shell + auth | `src/App.jsx` |
| DB CRUD wrappers | `src/db/models.js` |
| Supabase client | `src/db/supabase.js` |
| LLM prompts | `src/llm/prompts.js` |
| LLM API client | `src/llm/apiClient.js` |
| Supabase Edge Function | `supabase/functions/llm-proxy/index.ts` |
| Platform roles + settings migration | `supabase/migrations/20260505073000_platform_roles_user_settings.sql` |
| Architecture contract (rules) | `AGENTS.md` |
| Entity model spec | `docs/addition1_entity_model.md` |
| Build plan | `docs/simmodlr_Build_Plan.md` |
| User guide | `docs/simmodlr_User_Guide.md` |
| Visual designer design | `docs/simmodlr_Visual_Designer_Design.md` |

---

*End of simmodlr Specification v7.0.0.*  
*This document is the authoritative reference for the project's current state, architecture, and rules.*  
*For sprint-by-sprint planning, refer to `docs/simmodlr_Build_Plan.md`.*  
*For the architectural contract, refer to `AGENTS.md`.*
