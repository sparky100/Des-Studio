# DES Studio — Engineering Specification

**Version:** 1.9.0
**Date:** 2026-05-18
**Sprint baseline:** Sprint 58+
**Status:** Living document — updated at end of each sprint

---

## Version History

| Version | Date | Sprint | Changes |
|---------|------|--------|---------|
| v1.0 | 2026-05-16 | Sprint 45 | Initial specification — Sprint 45 baseline covering engine, data model, macros, AI analysis, UI workspace, validation, and non-functional requirements |
| v1.1 | 2026-05-17 | Sprint 55a | Added parseSuggestionResponse / applySuggestionPatch to Section 6; DistHelp / DistSparkline to Section 7.2; WCAG 2.1 AA compliance to Section 8.6; updated test count to 1248 |
| v1.2 | 2026-05-17 | Sprint 57 | Real-time adapter layer — RestAdapter, AdapterRegistry, nullRegistry, paramSource schema extension |
| v1.3 | 2026-05-17 | Sprint 58 | Report generation — `generateReport()`, LLM prompt builders, html2canvas canvas capture, Execute panel Export Report button |
| v1.4 | 2026-05-18 | Sprint 58+ | Time-averaged server utilisation — `_busyStart`/`_busyTime` tracking in `entities.js`; warmup reset; `getSummary()` formula updated to `busyTime / (elapsed × count)`. Markdown report export replacing docx. CSV import for Schedule distribution — `planCsvParser.js`, `ScheduleEditor` "Load from CSV" button, `distParams.rows[]` schema. |
| v1.5.0 | 2026-05-18 | Sprint 62 | Real-world clock (epoch field, clockUtils, timestamp CSV import) |
| v1.6.0 | 2026-05-18 | Sprint 63 | Planned data import — ScheduleFeedAdapter, xlsxParser, DataSourcesEditor UI, entityId convention, prefetchScheduleFeeds() |
| v1.7.0 | 2026-05-18 | Sprint 64 | Attribute-conditional service times — `when` predicate on cSchedule entries, first-match semantics, V29 validation, CEventEditor UI |
| v1.8.0 | 2026-05-18 | Sprint 65 | Actuals tracking — `_plannedTime` on entities, `updateScheduledTime()` API, `avgPlanDeviation` in getSummary(), ActualsStreamAdapter, report Plan vs Actual section |
| v1.9.0 | 2026-05-18 | Sprint 66 | Visual Designer node badge system; Execute Panel UX — Animate/Collect/Speed to Setup, Export consolidation, Share removal, Log guard, Entity Details rename, Analysis graph formatting |

---

## 1. Product Overview

DES Studio is a browser-based, no-code discrete-event simulation (DES) tool targeting operations analysts, industrial engineers, and service-design practitioners who need to model and optimise queueing systems without writing simulation code.

**Target user:** A domain expert who understands queueing concepts (arrivals, service, queues, resources) but is not a software developer. The tool must be learnable in an afternoon and must produce statistically sound results without requiring the user to configure statistical machinery by hand.

**Key differentiators:**

- **Browser-native, no install.** The entire engine runs in the user's browser using pure JavaScript (no server-side compute required for simulation execution). Models are authored, run, and analysed in a single browser tab.
- **No-code authoring.** All model logic is expressed through structured UI editors — B-event and C-event editors, queue configuration, entity type forms, and a Visual Designer canvas — rather than code. A safe declarative macro language replaces scripting.
- **Three-Phase method.** The engine implements Pidd's canonical Three-Phase DES algorithm, giving it rigorous theoretical grounding and predictable Phase C semantics (restart rule, conditional event ordering by priority).
- **AI-integrated analysis.** An AI Insights panel produces narrative summaries, structured improvement recommendations, replication sensitivity analysis, two-run comparisons, and interactive Q&A, all grounded in the full run result payload.
- **Production-grade statistics.** Warmup period removal, parallel replication workers, 95% confidence intervals (batch means), parametric sweep (1D and 2D), ANOVA with Tukey HSD post-hoc test, anomalous replication flagging, and Welch's graphical warm-up test are all built in.

---

## 2. Architecture Overview

### 2.1 Three-Phase DES Engine

The engine (`src/engine/index.js`, `src/engine/phases.js`) is a pure JavaScript module with no DOM dependencies. It can run in the main browser thread, in a Web Worker (for parallel replications), or in Node.js (for headless/CLI execution).

The engine is instantiated by calling `buildEngine(model, seed, warmupPeriod, maxSimTime, terminationCondition, maxCycles, maxCPasses, collectTimeSeries)`. The returned object exposes:
- `runAll()` — run to completion, return result object
- `step()` — advance one Phase A→B→C cycle, return trace messages
- `getSnap()` — return a real-time snapshot of entity counts, queue depths, FEL size, and event fire counts
- `getFelSize()` — return the current number of events in the Future Event List

### 2.2 React Frontend

The UI is built with React and Vite. There is no CSS framework dependency; all styling uses inline styles with design tokens from `src/ui/shared/tokens.js`. This avoids class-name conflicts and makes the styling contract explicit: colours, spacing, border radii, and font sizes are imported from a single source of truth.

The three authoring modes are:
- **Forms/Tabs editor** — the primary authoring interface, structured as a multi-tab ModelDetail panel (Entities, Queues, B-Events, C-Events, State Variables, Goals)
- **AI Generator** — the user describes their system in natural language and the LLM generates a complete model JSON
- **Visual Designer** — a canvas-based DAG editor (`src/ui/visual-designer/`) where the user drags and connects nodes representing entity types, queues, and events

### 2.3 Supabase Backend

Supabase provides PostgreSQL-backed persistence via `src/db/supabase.js`. The database stores:
- User accounts (Supabase Auth)
- Model records (`models` table: id, name, description, model JSON, owner, created_at, updated_at, is_public, tags)
- Run history (`run_results` table: model_id, run_label, summary, experiment config, tags, archived flag)
- Saved experiment configurations (`experiments` table)

An anonymous mode (no Supabase connection) uses `src/db/local.js` which persists to browser localStorage with the same interface contract.

### 2.4 LLM Integration

AI analysis is provided by `src/llm/prompts.js`, which builds structured prompt payloads, and `src/llm/apiClient.js`, which handles the API call. The AI Insights panel in the Execute workspace calls five prompt builders:
- `buildNarrativePrompt` — narrative result interpretation (150-200 words, max_tokens 450)
- `buildSuggestionPrompt` — 6-step structured improvement recommendations (max_tokens 600)
- `buildSensitivityPrompt` — replication CI uncertainty analysis (150-200 words, max_tokens 450)
- `buildComparisonPrompt` — two-run side-by-side comparison (200-250 words, max_tokens 550)
- `buildResultsQueryPrompt` — conversational Q&A against run results

Two additional prompt builders support the report generation workflow (§2.6):
- `buildModelDescriptionPrompt` — plain-English model narrative for non-technical readers (max_tokens 400)
- `buildReportRecommendationsPrompt` — JSON array of structured recommendations (max_tokens 700)

The non-streaming helper `callLLMOnce(prompt)` is used for report generation (report content does not need streaming).

### 2.5 Real-Time Adapter Layer (Sprint 57+)

The adapter layer allows live values from external REST sources to be substituted into distribution parameters at runtime. Key components:

- **`src/engine/adapters/types.js`** — JSDoc type definitions for `DataSource`, `ParamSource`, `SystemSnapshot`
- **`src/engine/adapters/RestAdapter.js`** — Poll-based REST with TTL cache, 3× retry with exponential backoff (2s, 4s, 8s), dot-notation field extraction
- **`src/engine/adapters/index.js`** — `nullRegistry` (zero-cost pass-through, default) and `AdapterRegistry` class
- **`buildEngine()` signature** — accepts optional `registry` parameter (9th argument, defaults to `nullRegistry`)

Live values are fetched via `prefetchAll()` before a run (`calibrated_batch` mode), keeping the FEL loop synchronous.

### 2.6 Report Generation (Sprint 58)

The report generation module produces professional Word documents (`.docx`) from completed simulation runs.

**Entry point:** `src/reports/reportGenerator.js` → `generateReport(model, results, experimentConfig, runMeta)`  
**Returns:** `Blob` with MIME type `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

**Report sections:**
1. Cover (model name, run label, date, engine version)
2. Executive Summary (top KPIs, primary recommendation headline)
3. Model Description (LLM-generated plain-English narrative)
4. Experiment Configuration (seed, warmup, duration, replications, termination mode)
5. Model Diagram (React Flow canvas capture via `html2canvas`, or placeholder)
6. Simulation Results (summary stats, per-queue wait percentiles P50/P90/P95/P99, resource utilisation, goal gaps, CI intervals)
7. Recommendations (3 LLM-generated structured blocks: headline, finding, action, expected impact, confidence)
8. Appendix (entity types, queues, B-events, C-events, state variables)

**Key design decisions:**
- `Promise.allSettled` wraps both LLM calls and canvas capture — report always completes even if LLM or canvas fails
- `html2canvas` is dynamically imported to avoid SSR/test environment crashes
- All generation is client-side — no PII leaves the browser
- Filename pattern: `<ModelName> — <RunLabel> — Report.docx`
- `docx` v9 API notes: hex colours without `#` prefix; `PageNumberElement` (not `PageNumber` constructor); `ImageRun` requires `type: 'png'`

### 2.7 Clock Utilities (Sprint 62)

`src/engine/clockUtils.js` provides real-world clock conversion helpers. These functions are stateless pure utilities that accept the model's `epoch` and `timeUnit` fields.

| Export | Signature | Description |
|--------|-----------|-------------|
| `simToWall` | `simToWall(t, epoch, timeUnit) → Date` | Converts a simulation time `t` to an absolute `Date` by adding `t` time units to `epoch`. Returns `null` if `epoch` is not set. |
| `wallToSim` | `wallToSim(dt, epoch, timeUnit) → number` | Converts a `Date` (or ISO string) `dt` back to a simulation time offset relative to `epoch`. Returns `null` if `epoch` is not set. |
| `formatWallTime` | `formatWallTime(date) → string` | Formats a `Date` as a human-readable locale string for display in the report cover and experiment controls. |
| `parseTimeInput` | `parseTimeInput(value, epoch, timeUnit) → number` | Parses a time value that may be numeric, HH:MM, or full ISO 8601. When `epoch` is set and the value looks like a timestamp, delegates to `wallToSim` to produce a simulation-time offset; otherwise falls back to `parseFloat`. |
| `looksLikeTimestamp` | `looksLikeTimestamp(value) → boolean` | Returns `true` when the string matches HH:MM or ISO 8601 patterns, signalling that `parseTimeInput` should interpret it as a calendar time rather than a numeric offset. Used by `planCsvParser.js` to decide whether an `epoch` is required for import. |

These utilities are used by `planCsvParser.js` (CSV import), the report generator (cover page period line), and the experiment controls UI (start/end wall-clock display).

### 2.8 Planned Data Import (Sprint 63)

Sprint 63 adds two new ways to feed a planned-arrival schedule into a B-event's `rows[]`:

#### `ScheduleFeedAdapter` (`src/engine/adapters/ScheduleFeedAdapter.js`)

Fetches a JSON array of planned activities from a REST endpoint and converts them to the `rows[]` format consumed by B-events.

- **Retry policy:** network failures retry 3× with 2 s / 4 s / 8 s backoff. HTTP error responses (4xx/5xx) are thrown immediately without retrying.
- **Time parsing:** delegates to `parseTimeInput()` — handles plain numbers (sim time), `HH:MM`, and ISO 8601 datetimes. Requires `model.epoch` for timestamp formats.
- **Attribute mapping:** `attrMap` maps dot-notation paths in the API response to entity attribute names. Setting `"patientName": "entityId"` names the entity instance.
- **Response envelope:** accepts bare arrays, `{ activities: [...] }`, or any object whose first value is an array.

#### `AdapterRegistry.prefetchScheduleFeeds(model)` (`src/engine/adapters/index.js`)

New method that finds all `scheduleFeed` data sources, fetches them via `ScheduleFeedAdapter`, and returns a **new model object** with `rows[]` merged and sorted into the targeted B-events. Does not mutate the input model. Call before `engine.run()`.

#### `xlsxParser` (`src/ui/shared/xlsxParser.js`)

Converts an XLSX/XLS/ODS `ArrayBuffer` to the same `{ rows, attrHeaders, skipped, error }` shape as `parsePlanCsv`. Internally converts the sheet to CSV via SheetJS then delegates to `parsePlanCsv`, keeping timestamp/epoch handling in one place.

```js
parseXlsx(buffer, { epoch, timeUnit, sheetName })
// → { rows: [{ time, attrs }], attrHeaders, skipped, error? }
```

#### `entityId` convention

When an entity attribute named `entityId` is set (via `attrMap` or CSV), it becomes the entity's display name in the simulation UI and run results. This is the standard way to import named entities (e.g. named patients from a surgical list).

#### `DataSourcesEditor` component (`src/ui/ModelDetail.jsx`)

Added inline to the Overview tab. Allows modellers to add, configure, and remove data sources without editing JSON. Exposes all `scheduleFeed`-specific fields (entityType, targetBEventId, timeField, attrMap JSON editor) when `type: "scheduleFeed"` is selected.

### 2.9 Attribute-Conditional Service Times (Sprint 64)

#### `when` predicate on `cSchedule` entries

Each entry in a C-event's `cSchedules` list may carry an optional `when` predicate (same JSON format as entity routing predicates — Addition 1 §4). When present, it acts as a guard:

**Algorithm:**
1. If **no** entries have `when` → all entries fire as before (legacy behaviour unchanged)
2. If **any** entry has `when` → first-match semantics apply:
   - Evaluate each entry's `when` predicate against the current entity's attributes at the moment the C-event fires
   - The **first** entry whose predicate is `true` (or that has no `when` — the fallback) is scheduled
   - All remaining entries are skipped

**Intent:** The plan provides *what* (entity type and attributes like `surgery_type`). The model provides *how long* (calibrated distributions). The `when` predicate connects entity attributes to the right distribution. For example:

```json
"cSchedules": [
  { "when": { "variable": "Entity.surgery_type", "operator": "==", "value": "hip" },
    "dist": "Lognormal", "distParams": { "mean": "120", "sd": "20" }, ... },
  { "when": { "variable": "Entity.surgery_type", "operator": "==", "value": "knee" },
    "dist": "Lognormal", "distParams": { "mean": "90",  "sd": "15" }, ... },
  { "dist": "Exponential", "distParams": { "mean": "60" }, ... }
]
```

#### V29 validation

`validateModel` emits a **V29 warning** when all entries in a `cSchedules` list have `when` and no fallback is present. An entity not matching any condition would receive no service — a silent miss that is almost never the intended behaviour.

#### UI

`CEventEditor` shows a checkbox per cSchedule entry to enable the `when` condition. When checked, an `EntityFilterBuilder` widget appears, producing the predicate JSON. Entries without `when` display a "(no condition — this entry is the fallback)" label when other entries in the list are conditional.

---

## 3. Data Model

A DES Studio model is a JSON object stored in the `models` table. All fields below are at the top level of this object unless noted.

### 3.1 Model JSON Structure

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Supabase-assigned unique identifier |
| `name` | string | Human-readable model name |
| `description` | string | Freeform model description, included in AI prompts |
| `entityTypes` | EntityType[] | Array of entity class definitions (customers and servers) |
| `queues` | Queue[] | Array of queue definitions |
| `bEvents` | BEvent[] | Array of B-event (bound/scheduled event) definitions |
| `cEvents` | CEvent[] | Array of C-event (conditional event) definitions |
| `stateVariables` | StateVariable[] | Array of global scalar state variable definitions |
| `goals` | Goal[] | Array of performance goal definitions used for AI gap analysis and sweep colouring |
| `containerTypes` | ContainerType[] | Array of container (level resource) definitions |
| `graph` | object | Visual Designer layout (nodes, edges, viewport) — persisted by `src/ui/visual-designer/graph.js` |
| `experimentDefaults` | object | Default execution parameters: `maxSimTime`, `warmupPeriod`, `replications`, `seed`, `terminationMode`, `terminationCondition` |
| `timeUnit` | string | The label for one simulation time unit (e.g. `"minutes"`, `"hours"`); used in UI display and AI prompts |
| `epoch` | string (ISO 8601) or null | Optional. When set, maps t=0 to this calendar moment (e.g. `"2026-05-18T08:00:00"`). Drives `simToWall`/`wallToSim` conversions in `src/engine/clockUtils.js`. Shown on the report cover and in experiment controls. Required for CSV planned-arrival files that use real timestamps (HH:MM or full ISO 8601) in the time column rather than numeric offsets. |
| `dataSources` | DataSource[] | Optional array of external data source definitions. Type `"rest"` binds live values to distribution parameters via `paramSource`. Type `"scheduleFeed"` populates a B-event's `rows[]` from a planned-arrival REST feed. See §2.5 and §2.8. |

### 3.2 Entity Type Schema

Entity types are defined in the `entityTypes` array. Each entry has `role: "customer"` or `role: "server"`. Batch roles are modelled as customer entities with special macro handling.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique within the model |
| `name` | string | Display name; used as the type identifier in macro calls (e.g. `ARRIVE(Customer)`) |
| `role` | `"customer"` or `"server"` | Determines engine treatment |
| `count` | number (integer >= 1) | Initial number of server instances; not meaningful for customer types |
| `attrDefs` | AttrDef[] | Attribute definitions: `{name, valueType, dist, distParams, defaultValue, mutable}` |
| `mtbfDist` | string | Distribution name for mean-time-between-failures (server only) |
| `mtbfDistParams` | object | Distribution parameters for MTBF sampling |
| `mttrDist` | string | Distribution name for mean-time-to-repair (server only) |
| `mttrDistParams` | object | Distribution parameters for MTTR sampling |
| `shiftSchedule` | ShiftPeriod[] | Capacity schedule: `[{time, capacity}, ...]` sorted ascending by time; must start at time 0 |

### 3.3 Queue Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique within the model |
| `name` | string | Display name; referenced in macro calls and conditions |
| `discipline` | `"FIFO"` / `"LIFO"` / `"PRIORITY"` / `"SPT"` / `"EDD"` | Queue service discipline; defaults to `"FIFO"` |
| `capacity` | integer >= 1 or null | Maximum waiting entities; `null` means unlimited |
| `customerType` | string | Name of the entity type expected to wait in this queue |
| `overflowDestination` | string or null | Queue name to route blocked/balked entities to; `null` means exit system |
| `balkProbability` | number [0,1] or null | Probability that an arriving entity balks (defined on the B-event, propagated here for reference) |
| `balkCondition` | object or null | Predicate Builder condition object evaluated at arrival to determine balking |

### 3.4 B-Event Schema

B-events (bound events) are pre-scheduled occurrences on the Future Event List. They represent arrivals, service completions, failures, repairs, and any other time-triggered logic.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique within the model |
| `name` | string | Display name |
| `scheduledTime` | number | Initial scheduled time for the event in the FEL |
| `effect` | string[] | Array of macro call strings, executed in order when the event fires |
| `schedules` | Schedule[] | Re-scheduling rules: `[{dist, distParams, isRenege}]`; each fires a new instance of this B-event after the sampled inter-event time. When `dist === "Schedule"`, `distParams` may carry either `times: number[]` (flat absolute clock times) or `rows: [{time: number, attrs: {}}]` (per-arrival times with entity attributes injected at arrival via ARRIVE). |
| `routing` | RoutingBranch[] | Conditional routing table: `[{condition, queueName}]`; mutually exclusive with `probabilisticRouting` |
| `probabilisticRouting` | ProbBranch[] | Probabilistic routing: `[{probability, queueName}]`; probabilities must sum to 1.0 +/- 0.001 |
| `defaultQueueName` | string or null | Fallback queue name when no routing branch matches |
| `loopConfig` | object or null | Loop guard: `{maxLoopCount: integer >= 1, exitQueueName: string or null}` — caps recirculation to prevent infinite loops |
| `balkProbability` | number [0,1] or null | Probability-based balking applied at arrival before entity joins the queue |
| `balkCondition` | object or null | Predicate Builder condition object evaluated at arrival; overrides balkProbability if both set |
| `description` | string | Freeform description shown in editors |

### 3.5 C-Event Schema

C-events (conditional events) are tested in Phase C of each engine cycle. They fire whenever their condition evaluates to true and an eligible entity is present.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique within the model |
| `name` | string | Display name |
| `condition` | object | Predicate Builder condition object (clauses of tokens evaluated against state and queue depths) |
| `effect` | string[] | Array of macro call strings, executed when the condition is satisfied |
| `cSchedules` | Schedule[] | Optional re-scheduling rules triggered when this C-event fires |
| `entityFilter` | string or null | Entity type name to restrict which entities are eligible; `null` means any |
| `priority` | number or null | Phase C ordering priority; lower values fire first; null defaults to 0 |

### 3.6 State Variable Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique within the model |
| `name` | string | Variable name; referenced in macro expressions as `varName` and in conditions as a token |
| `initialValue` | string | Serialised initial value (parsed as JSON; falls back to string if parse fails) |

### 3.7 Goal Schema

Goals define performance targets used by `buildGoalGaps()` for AI prompt grounding, and by `evaluateSweepPointGoals()` for feasibility colouring in SweepChart and Sweep2DGrid.

| Field | Type | Description |
|-------|------|-------------|
| `metric` | `"avgWait"` / `"avgSvc"` / `"avgSojourn"` / `"served"` / `"reneged"` / `"totalCost"` | KPI to evaluate |
| `operator` | `"<"` / `"<="` / `">"` / `">="` | Comparison operator |
| `target` | number | Target threshold value |
| `label` | string | Human-readable label shown in UI and AI prompts |

### 3.8 Run Result Schema

A completed run returns the following structure from `engine.runAll()`:

| Field | Type | Description |
|-------|------|-------------|
| `summary.served` | number | Count of entities that completed service |
| `summary.reneged` | number | Count of entities that reneged (abandoned) |
| `summary.avgWait` | number | Mean wait time across all queues (post-warmup) |
| `summary.avgSvc` | number | Mean service time |
| `summary.avgSojourn` | number | Mean end-to-end sojourn time (wait + service) |
| `summary.maxSojourn` | number | Maximum sojourn time observed |
| `summary.avgWIP` | number | Time-average work-in-progress (Little's Law integral: WIP integral / post-warmup elapsed time) |
| `summary.totalCost` | number | Cumulative cost accumulated via COST() macro |
| `summary.costPerServed` | number | `totalCost / served` |
| `summary.perResource` | object | Per-server-type: `{utilisation, busyCount, idleCount, total}` |
| `summary.containerLevels` | object | Per-container: `{current, min, max, mean}` |
| `summary.warnings` | string[] | Non-fatal engine warnings emitted during the run |
| `summary.phaseCTruncated` | boolean | True if Phase C hit `maxCPasses` in any cycle |
| `waitDist` | object | Per-queue wait-time distribution: `{mean, p50, p90, p95, p99, n}` |
| `perQueue` | object | Per-queue operational counts: `{blockingCount, balkCount}` |
| `entitySummary` | object[] | Per-entity record: `{id, type, arrivalTime, stages[], waitTime, serviceTime, sojournTime, status}` |
| `timeSeries` | object | Time-series snapshots of queue depths and server states (collected when `collectTimeSeries=true`) |
| `aggregateStats` | object | Replication confidence intervals: per `summary.*` key, `{mean, lower, upper, n}` at 95% CI |

---

## 4. Engine Specification (Three-Phase Method)

The engine implements Pidd's Three-Phase DES algorithm exactly:

### Phase A — Clock Advance

Advance the simulation clock to the time of the next event in the Future Event List (FEL). If the FEL is empty, the run terminates. If a termination condition is configured and evaluates to true at this point, the run terminates.

### Phase B — Fire Bound Events

Execute all bound events (B-events) whose scheduled time equals the current clock. Events are processed in FEL order (by scheduled time, with ties broken by insertion order). Each B-event fires its `effect` array of macros in sequence. A B-event may reschedule itself by emitting a new FEL entry through its `schedules` configuration.

### Phase C — Conditional Event Scan

Scan all C-events in priority order (ascending `priority` field). For each C-event whose condition evaluates to true and whose entity filter is satisfied, fire it. After any C-event fires, restart the scan from the beginning (the restart rule). Continue until a complete scan pass finds no fireable C-events. If the pass count exceeds `maxCPasses` (default 500), set `phaseCTruncated = true` and proceed to Phase A.

### Warmup Period

The `warmupPeriod` parameter specifies a time at which the statistical accumulators are reset. At the warmup boundary, `_wipIntegral`, `_statsResetTime`, and per-entity wait/service accumulation are all reset. FEL events that do not depend on simulation context are pruned at the warmup boundary; context-dependent events (those with `_requiresCtxEntity = true`) are retained.

### Termination

Two termination modes are supported:
- **Time-based:** the run ends when `clock >= maxSimTime`.
- **Condition-based:** the run ends when `terminationCondition` evaluates to true at the start of Phase A.

### Replications

Replications run in parallel Web Workers via `src/engine/replication-runner.js`. Each replication uses a different seed derived from the base seed (via `mulberry32`). Results are aggregated using `confidenceInterval95()` to produce 95% CIs for all summary statistics. `aggregateStats` keys follow the pattern `"summary.<field>"`.

---

## 5. Effect Macro Specification

Macros are strings in the `effect` array of B-events and C-events. They are parsed by the registry in `src/engine/macros.js`. No `eval()` or `new Function()` is used; each macro is matched by a regex pattern and dispatched to a pure apply function.

| Macro | Syntax | Description | Key side effects |
|-------|--------|-------------|-----------------|
| `ARRIVE` | `ARRIVE(Type)` or `ARRIVE(Type, QueueName)` | Creates a new entity of the given type and places it in the named queue. Applies balking (condition or probability) and finite capacity checks first. | Increments queue depth; emits FEL entry for any reneging schedule |
| `SEIZE` | `SEIZE(Queue, ServerType)` | C-event macro: claims one idle server of ServerType for the first waiting entity in Queue. | Sets server status to `busy`; sets entity status to `inService` |
| `RELEASE` | `RELEASE(Queue)` or `RELEASE(Queue, TargetQueue)` | Releases the server serving the context entity and optionally routes the entity to a target queue. | Sets server to `idle`; updates service time stats |
| `COMPLETE` | `COMPLETE()` | Marks the context entity as `done` and releases its server. Final stage in a typical entity lifecycle. | Increments `__served`; records sojourn time |
| `RENEGE` | `RENEGE(ctx)` | Marks the context entity (identified by `ctx`) as `reneged` and removes it from its queue. | Increments `__reneged` |
| `PREEMPT` | `PREEMPT(ServerType)` | Interrupts the in-service entity on the lowest-priority server of the given type. The interrupted entity re-queues with `_remainingService` preserved. | Sets interrupted entity to `waiting`; emits trace entry |
| `FAIL` | `FAIL(ServerType)` | Fails a currently idle server of the given type; sets its status to `failed`. MTBF/MTTR events are auto-scheduled from entity type config. | Sets server to `failed`; records `_failedAt` timestamp |
| `REPAIR` | `REPAIR(ServerType)` | Repairs the first failed server of the given type; returns it to `idle`. | Records downtime in `_downtime`; sets server to `idle` |
| `SPLIT` | `SPLIT(EntityType, N, TargetQueue)` | Creates N-1 clone entities from the context entity. Clones are placed in TargetQueue with parent-child tracking: `_splitParent`, `_splitChildren`, `_splitFrom`, `_splitIndex`. | N-1 new entities added to entity pool |
| `BATCH` | `BATCH(Queue, N)` or `BATCH(Queue, Entity.attrName)` | Collects N waiting entities from Queue and merges them into a single batch entity. Batch size can be a literal integer or read from the first waiting entity's attribute. | N-1 originals marked `done`; one batch entity replaces them |
| `UNBATCH` | `UNBATCH(Queue)` | Splits a batch entity back into its constituent entities, placing each in Queue. | Original batch entity marked `done`; constituent entities restored |
| `MATCH` | `MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue)` | Pairs one entity from QueueA with one from QueueB into a combined batch entity, placed in TargetQueue. | Originals marked with `_matchedInto` |
| `COSEIZE` | `COSEIZE(Queue, ServerType1, ServerType2[, ...])` | Atomically seizes one entity from Queue and one server of each listed type. Fails cleanly (no partial seize) if any type has no idle server. | All named server types set to `busy` |
| `SET` | `SET(varName, expr)` | Evaluates the arithmetic expression `expr` and writes the result to state variable `varName`. | Mutates `state[varName]` |
| `SET_ATTR` | `SET_ATTR(attrName, expr)` | Evaluates `expr` and writes the result to the context entity's attribute `attrName`. | Mutates `entity.attrs[attrName]` |
| `COST` | `COST(expr)` | Evaluates `expr` and adds the result to `summary.totalCost`. | Increments `summary.totalCost` |
| `FILL` | `FILL(containerId, expr)` | Adds the value of `expr` to the named container, clamped to the container's capacity. | Updates `state[__container_<id>]` |
| `DRAIN` | `DRAIN(containerId, expr)` | Subtracts the value of `expr` from the named container, clamped to zero. | Updates `state[__container_<id>]` |

**Safe expression evaluator:** The expression parser in `macros.js` is a hand-written recursive-descent parser supporting: numeric literals, `+`, `-`, `*`, `/`, parentheses, `Entity.<attrName>`, `<stateVarName>`, `clock`, and math functions `min(a,b)`, `max(a,b)`, `abs(a)`, `round(a)`, `floor(a)`, `ceil(a)`. No `eval()` or `new Function()` is used at any point in the engine.

---

## 6. AI Analysis Specification

All prompt builders are in `src/llm/prompts.js`. The word count of each assembled payload is capped at `MAX_PROMPT_WORDS = 2000` via the `truncateWords()` helper before the API call.

### 6.1 buildNarrativePrompt

**Inputs:** `model`, `experimentConfig`, `results`

**Grounded data:** per-queue wait percentiles (p50/p90/p95/p99), per-resource utilisation and idle counts, per-queue blocking and balking counts, cost metrics (`totalCost`, `costPerServed`), `avgWIP`, `maxSojourn`, container levels, engine warnings, `phaseCTruncated` flag, goals (via `goalsToPrompt()`), goal gap analysis (via `buildGoalGaps()`), state variables, `aggregateStats` (replication CIs).

**Output format:** Plain English narrative, 150-200 words. If goals are set, each goal is reported using the format: "[goal label]: current = [value], target [op] [target] → MET / MISSED (gap: [gap])".

**max_tokens:** 450

### 6.2 buildSuggestionPrompt

**Inputs:** `model`, `experimentConfig`, `results`

**Grounded data:** All narrative data plus B-event structure digest (effect types, routing type, loop guard, balk mode, arrival streams, fire counts from `_eventCounts`), C-event digest (effect types, priority), entity type failure/repair model, shift schedule flags, queue overflow destinations, entity anomaly digest (anomaly count, rate, worst wait, by-type breakdown, threshold — entities with wait > 3x mean wait), `confidenceIntervals` from `aggregateStats`.

**6-step output schema:**
1. Identify the binding constraint (bottleneck queue or resource)
2. Quantify the gap from goals (if goals are set)
3. Propose a specific change with exact parameter values
4. Estimate expected improvement
5. Identify risks or side effects
6. Suggest a next experiment to validate

**max_tokens:** 600

### 6.3 buildSensitivityPrompt

**Inputs:** `modelName`, `experimentConfig`, `ciResults` (pre-computed CI array)

**Output format:** 150-200 words explaining CI width, which KPIs are uncertain, and which conclusions are robust enough to act on.

**max_tokens:** 450

### 6.4 buildResultsQueryPrompt

**Inputs:** `model`, `results`, `userQuestion` (string)

Conversational Q&A. The payload is the same KPI structure as `buildNarrativePrompt`. The user's question is appended as the instruction. The LLM answers factually from the provided data.

### 6.5 buildComparisonPrompt

**Inputs:** `modelName`, `runA` (result object), `runB` (result object)

Compares two named runs side by side in an Option A / Option B frame. Identifies meaningful differences, likely tradeoffs, and uncertain results.

**max_tokens:** 550

### 6.6 parseSuggestionResponse

**Signature:** `parseSuggestionResponse(text) → { analysis: string, suggestions: SuggestionCard[] }`

Extracts structured suggestion output from the LLM response. Looks for a fenced ` ```json ` block containing an array of suggestion cards. If the block is absent or cannot be parsed, falls back to `{ analysis: text, suggestions: [] }` so the UI still renders something useful.

Each `SuggestionCard` returned has: `rank` (integer), `constraint`, `rootCause`, `change` (proposed model change), `effect` (predicted outcome), `goalImpact`, and `target` (optional: `{ field: dotPath, value: number, type: string }` — present only when the change is auto-applicable).

### 6.7 applySuggestionPatch

**Signature:** `applySuggestionPatch(model, change) → model`

Creates a deep clone of `model` (`JSON.parse(JSON.stringify(model))`) and applies the change described by `change.target`. Supported `change.type` values:

| type | field path | effect |
|------|-----------|--------|
| `entityTypeCount` | `entityTypes[name].count` | Sets the server count to `change.value` |
| `queueCapacity` | `queues[name].capacity` | Sets the queue capacity to `change.value` |
| `stateVariable` | `stateVariables[name].initialValue` | Sets the variable's initial value |

Unknown `change.type` values return the original (unmodified) clone; the function never mutates the input model.

### 6.8 evaluateSweepPointGoals

**Signature:** `evaluateSweepPointGoals(goals, aggregateStats) → {feasible: boolean, gaps: [{metric, met, current, target, operator, label}]}`

Called for each point in a 1D sweep or 2D sweep grid to determine whether the point satisfies all model goals. Results drive feasibility colouring in SweepChart (green/red markers) and Sweep2DGrid (heatmap cell tinting).

`feasible` is `true` only when every goal's `met` field is `true`. If any goal's current value cannot be read from `aggregateStats`, `met` is `null` and `feasible` is `false`.

### 6.9 buildGoalGaps

**Signature:** `buildGoalGaps(model, results) → GoalGap[] | null`

Pre-computes goal gap data for inclusion in both the narrative and suggestion prompts. For each goal, returns: `metric`, `label`, `operator`, `target`, `current` (actual value from `aggregateStats` CI mean or `summary` for single runs), `gap` (`current - target`), and `met` (boolean result of applying the operator).

---

## 7. UI Workspace Specification

### 7.1 Model Library

The Model Library is the root view of the application. It shows all saved models (user's own and public models) as cards with name, description, creation date, and tags. Actions: create new model, clone (fork) a model, open a model, delete a model. Public models can be forked to the user's account. A search/filter bar supports text search and tag filtering.

### 7.2 Forms/Tabs Editors

The primary model authoring interface. Organised as a multi-tab panel:

- **Entities tab** — `EntityTypeEditor`: create/edit entity types; configure role, count, attribute definitions (name, type, distribution, mutable flag); configure MTBF/MTTR distributions for server types; configure shift schedules.
- **Queues tab** — `QueueEditor`: create/edit queues; configure discipline, capacity, customerType, overflowDestination, balkProbability, balkCondition (Predicate Builder inline).
- **B-Events tab** — `BEventEditor`: create/edit B-events; configure scheduledTime, effect array (EffectPicker component), schedules, routing tables, probabilistic routing, loopConfig (Loop Guard UI), balkProbability, balkCondition.
- **C-Events tab** — `CEventEditor`: create/edit C-events; configure condition (Predicate Builder), effect array, cSchedules, entityFilter, priority.
- **State Variables tab** — create/edit state variables; configure name and initialValue.
- **Goals tab** — `GoalsEditor`: create/edit performance goals; configure metric, operator, target, label.

**EffectPicker:** A structured editor for the `effect` array. Presents each macro as a guided form with labelled argument fields rather than requiring the user to type raw macro strings. Available macros are presented from the MACROS registry.

**SectionPanel:** A collapsible panel wrapper used consistently across all editor tabs to group related configuration fields.

**Predicate Builder:** A visual condition builder that produces the `condition` object used by C-events and balkCondition. Supports clauses connected by AND/OR; each clause is a token-based expression comparing queue depths, state variables, entity attributes, clock, or numeric literals using comparison operators.

**DistPicker:** The distribution selection component. Distributions are grouped into three families — Parametric (classical distributions with numeric parameters), Time-varying (piecewise arrival rate schedules), and From data (EntityAttr / ServerAttr). The family selector filters the distribution dropdown. `DistHelp.js` (`DIST_GROUPS` and `DIST_HELP` map) provides summary text and per-parameter help for all 11 distribution types. `DistSparkline.jsx` renders an SVG shape preview (120×40 px) for the currently selected distribution; the preview updates reactively as parameters change. Parameters validate on blur with inline error messages using `role="alert"`.

**ScheduleEditor** (rendered by DistPicker when `dist === "Schedule"`): Provides two manual entry modes (times list textarea; per-row arrival attributes table) and a **CSV import** path. The "↑ Load from CSV" button opens a file picker; the selected file is parsed by `src/ui/shared/planCsvParser.js` (RFC-4180, header auto-detection, numeric/string attr inference). A preview panel shows the first 5 rows, total count, and a skip count for rows with non-numeric time. On confirm, `distParams.rows` is populated with `[{ time: number, attrs: {} }]` objects; if the file contains no attribute columns, `distParams.times` (flat array) is used instead. The rows table derives its column headers from `attrDefs` when defined, or from the keys of the first imported row when not — so CSV-only imports render correctly without requiring entity attribute definitions to be pre-configured.

### 7.3 Execute Panel

The Execute panel is the primary result-viewing workspace. It has five views:

- **Live View** — real-time execution animation. The canvas shows entity tokens moving through the model. Per-node entity count overlays update on each engine step.
- **Log** — `LogViewer`: structured trace log showing every macro firing with phase, time, entity ID, type, and message. Filterable by phase and event type. The Log menu button is **disabled while a run is active** (grayed out, tooltip "Available after run completes") — the bottom-panel log remains accessible during execution. The button re-enables when the run completes.
- **Histograms** — `QueueHistogram`: wait-time frequency distributions per queue, displayed as bar charts with Freedman-Diaconis automatic bin sizing. Axis labels include model time units. Charts include titles, light horizontal grid lines, and consistent accent colour.
- **Entity Details** — `EntitySummaryTable`: per-entity table showing arrival time, stages, wait time, service time, sojourn time, and final status. Sortable and filterable.
- **Analysis** — KPI cards (goal-aware: green/red border based on goal met/missed), AI Insights panel (narrative, suggestions, sensitivity, comparison, Q&A), sweep configuration and results (SweepChart 1D, Sweep2DGrid 2D), replication configuration and CI results, ANOVA panel. All charts include axis labels with time units, chart titles, grid lines, and consistent accent colour.

**Execute menu controls (Sprint 66):**

The Animate toggle, Collect time-series checkbox, and Speed slider are located in the **Setup tab** (`ExperimentControls.jsx`), not the Execute menu. These configure how a run executes and are set before starting; they are not mid-run controls.

The Execute menu contains: Live View, Log (guarded), Histograms, Entity Details, Analysis, AI Insights, and Export.

**Export (Sprint 66):** A single **Export…** button replaces the former separate Export JSON / Export CSV / Export HTML buttons. Clicking opens an inline popover with format checkboxes (JSON, CSV, HTML) and a Download button. Multiple formats may be selected simultaneously.

**Sweep execution:** The user configures a parameter (any numeric field in the model JSON, selected by dot-path), a range, and step count. `src/engine/sweep-runner.js` runs one set of replications per parameter value. Each point's `aggregateStats` is passed to `evaluateSweepPointGoals()` to determine feasibility colouring.

### 7.4 Visual Designer

The Visual Designer (`src/ui/visual-designer/`) is a canvas-based DAG editor. Nodes represent sources, queues, activities, and sinks. Edges represent flow relationships derived from the canonical model. The designer reads and writes the `graph` field of the model JSON. Changes in the Visual Designer are reflected in the Forms/Tabs editors and vice versa (bidirectional sync via the shared model state).

Node types: SOURCE (green), QUEUE (cyan), ACTIVITY (purple), SINK (red). Connections are drawn as directed arrows. The palette allows dragging new nodes onto the canvas or using the toolbar to add and auto-link a node to the currently selected SOURCE or ACTIVITY. Clicking a node opens the node inspector panel.

**Auto-link behaviour:** When a node is added while a SOURCE or ACTIVITY is selected, the new node is auto-connected. Auto-linking is suppressed when a QUEUE or SINK is selected — overflow connections must be made deliberately via drag.

**Node badge system (Sprint 66):** Visual Designer node cards display small read-only badge chips when advanced configuration is present (see §2.11). Badges are derived from the model; they are never stored in `model.graph`. Clicking a badge selects the node and opens the node inspector.

### 7.5 AI Insights Panel

Located in the Execute panel's Analysis view. Contains five sub-panels:
- **Narrative** — calls `buildNarrativePrompt`; displays the resulting 150-200 word plain-English interpretation.
- **Suggestions** — calls `buildSuggestionPrompt`; displays the 6-step structured recommendations.
- **Sensitivity** — calls `buildSensitivityPrompt`; displays CI uncertainty analysis (available only after replications).
- **Compare** — calls `buildComparisonPrompt`; the user selects two saved runs to compare.
- **Ask** — conversational Q&A input; calls `buildResultsQueryPrompt` on each submission.

---

## 8. Non-Functional Requirements

### 8.1 Performance

- The engine must handle 10,000+ events in a single run without UI lag. Achieved through the pure-JS engine with no DOM interaction during execution.
- Replication workers run in parallel Web Workers, one per CPU core up to the configured replication count, using `navigator.hardwareConcurrency`.
- Sweep runs use the same worker pool architecture as replications.
- The Visual Designer canvas must remain interactive at 60 fps with up to 100 nodes.

### 8.2 Browser Support

- Modern Chromium (Chrome 110+, Edge 110+), Firefox 110+, Safari 16+.
- Web Workers and `structuredClone` are required; these are available in all supported browsers.
- No IE11 support; no polyfill budget for legacy browsers.

### 8.3 Storage

- **Authenticated mode:** Supabase PostgreSQL via `src/db/supabase.js`. Model JSON stored in a `jsonb` column. Run results stored as compressed JSON.
- **Anonymous mode:** `src/db/local.js` provides the same interface contract backed by `localStorage`. Models and results are persisted across page reloads but not across devices.
- Model JSON should remain under 500 KB for comfortable browser storage and Supabase column limits.

### 8.4 Security

- No `eval()` or `new Function()` anywhere in the engine or UI. The safe arithmetic evaluator in `macros.js` is a hand-written recursive-descent parser.
- The condition evaluator in `src/engine/conditions.js` uses token matching, not code execution.
- Supabase Row Level Security (RLS) ensures users can only read/write their own models. Public models are read-only to non-owners.
- LLM API keys are stored server-side; the frontend calls the LLM through a Supabase Edge Function or a thin proxy, never exposing keys to the browser.

### 8.5 Accessibility

DES Studio targets WCAG 2.1 AA compliance. Implemented requirements:

- **Focus visible:** Global `*:focus-visible` rule — 2 px cyan outline, 2 px offset — on all interactive elements.
- **Minimum text size:** All label, field, and table header text is ≥ 11 px.
- **Live regions:** AI streaming response container carries `aria-live="polite"` so screen readers announce new content.
- **Table semantics:** All `<th>` elements carry `scope="col"` or `scope="row"`.
- **Modal semantics:** All modal dialogs carry `aria-labelledby` pointing to their heading.
- **Icon-only buttons:** All icon-only buttons carry an `aria-label`.
- **Colour contrast:** Muted text colour is ≥ 4.5:1 against the panel background.

### 8.6 Test Coverage

- Unit tests use Vitest. All engine functions (phases, macros, conditions, distributions, statistics, validation) have dedicated test files in `src/engine/__tests__/`.
- UI component tests cover all editor forms, the execute panel views, sweep configuration, and the Visual Designer.
- Minimum passing test count: 1248 tests.
- Test suite must pass before any sprint delivery is marked complete.

---

## 9. Validation Rules

`validateModel(model)` in `src/engine/validation.js` returns `{errors, warnings}`. Errors are blocking (run is prevented); warnings are non-blocking (run proceeds with a visible banner). Each issue carries `{code, message, tab}` where `tab` maps to the editor tab that should highlight the error.

| Code | Severity | Rule |
|------|----------|------|
| V1 | Error | Every entity type must have a unique, non-empty name |
| V2 | Error | Attribute names must be unique within each entity type |
| V3 | Error | Every `defaultValue` must match its declared `valueType` (number/boolean/string) |
| V4 | Error | A queue with `discipline: "PRIORITY"` requires the entity type to have an attribute named `priority` |
| V5 | Error | Distribution parameters must be within valid bounds (e.g. Exponential mean > 0, Uniform max > min, Triangular min <= mode <= max) |
| V6 | Error | Every `schedules[].eventId` and `cSchedules[].eventId` must reference an existing B-event ID |
| V8 | Error (both missing) / Warning (one missing) | Model must have at least one ARRIVE source or at least one COMPLETE/RENEGE sink; absence of both is a blocking error; absence of one is a warning |
| V9 | Error | C-event conditions must reference only defined queue names |
| V10 | Error | Attribute names must not start with the reserved namespace prefixes `Resource` or `Queue` |
| V11 | Warning | Normal distribution where mean < 2 x stddev — negative samples likely (engine clamps to 0) |
| V12 | Error | Piecewise distribution must have at least one period; must start at time 0; nested piecewise not supported |
| V13 | Error | Piecewise periods must be sorted ascending by `startTime` |
| V14 | Error | Shift schedule must have a numeric time at each period; must start at time 0; times must be ascending; capacity must be integer >= 1 |
| V15 | Warning | A shift change time is after the configured run duration (the shift will never fire) |
| V16 | Warning | No `maxSimTime` or `terminationCondition` configured — run may execute until cycle limit |
| V17 | Error | Routing table entries must reference defined queues; `defaultQueueName` must be a defined queue; routing and RELEASE target are mutually exclusive |
| V18 | Error | Probabilistic routing probabilities must sum to 1.0 +/- 0.001; probabilistic routing and conditional routing are mutually exclusive |
| V19 | Error | Server entity type `count` must be an integer >= 1 when specified |
| V20 | Error | Queue `capacity` must be integer >= 1 when specified; `overflowDestination` must reference a defined queue |
| V21 | Error | `balkProbability` must be in [0, 1] |
| V22 | Error | BATCH `batchSize` must be integer >= 2; referenced queue must exist |
| V23 | Error | UNBATCH referenced queue must exist |
| V24 | Error | `loopConfig.maxLoopCount` must be integer >= 1; `loopConfig.exitQueueName` must be a defined queue when specified |
| V25 | Warning | `RENEGE(TypeName)` silently fails; the correct form is `RENEGE(ctx)` |
| V26 | Error | Container `id` must be unique and non-empty; `capacity` must be > 0; `initialLevel` must be >= 0 and <= capacity |
| V27 | Error | FILL/DRAIN macro must reference a declared container ID |
| V28 | Warning | `epoch` must be a valid ISO 8601 datetime string when set (e.g. `"2026-05-18T08:00:00"`); an invalid value is ignored and real-world clock conversions are disabled |
| V29 | Warning | A C-event's `cSchedules` list has conditional entries (all with `when`) but no fallback (entry without `when`). Entities not matching any condition will receive no service. |

### 2.10 Actuals Tracking (Sprint 65)

#### `_plannedTime` on entity objects

When an entity is created via the ARRIVE macro from a B-event that used a Schedule (rows[]) distribution, its FEL entry carries `_plannedArrivalTime` (the absolute planned simulation time). At entity-creation time, `entity._plannedTime = felRef._plannedArrivalTime` is set. Entities created from statistical distributions have `_plannedTime = undefined`.

#### `engine.updateScheduledTime(entityId, newSimTime)` (FEL update API)

```js
engine.updateScheduledTime("Alice", 65)  // → true/false
```

Finds FEL entries where `_scheduleRowAttrs.entityId === entityId`, preserves the original `_plannedArrivalTime`, and updates `scheduledTime` to `newSimTime`. Re-sorts the FEL. Returns `true` if at least one entry was updated.

When the B-event subsequently fires at the new time, the entity is created with `arrivalTime = newSimTime` and `_plannedTime = original planned time` — enabling plan-vs-actual deviation measurement.

#### `getSummary().avgPlanDeviation`

```js
{ avgPlanDeviation: 5.0 }  // average deviation in model time units; null when no planned entities
```

Average of `(entity.arrivalTime - entity._plannedTime)` across all customer entities that have `_plannedTime` set. Positive = late on average; negative = early; null = no planned arrivals.

#### `ActualsStreamAdapter` (`src/engine/adapters/ActualsStreamAdapter.js`)

Receives actual start-time updates from an external system. Supports:
- WebSocket connection (`connect()`)
- Direct push (`pushUpdate(entityId, actualTime)`)
- Pre-connection buffering (updates queued until `attachEngine()` is called)

Message formats accepted: plain sim-time numbers, HH:MM strings, ISO 8601 datetimes (requires `model.epoch`).

#### Report: Plan vs Actual section

`buildResults()` in `reportGenerator.js` includes a "Plan vs Actual" section only when `summary.avgPlanDeviation` is non-null. Shows average deviation and direction (early / on time / late).

### 2.11 Visual Designer Badge System (Sprint 66)

`deriveGraphFromModel(model)` in `src/ui/visual-designer/graph.js` populates a `badges: string[]` field on each visual node. Badges are read-only indicators; they never modify the model.

| Badge key | Node type | Trigger |
|-----------|-----------|---------|
| `"conditional"` | ACTIVITY | `cEvent.cSchedules.some(cs => cs.when)` — at least one cSchedule has a `when` predicate (attribute-conditional service time from Sprint 64) |
| `"feed"` | SOURCE | `model.dataSources` contains a `scheduleFeed` source where `source.targetBEventId === bEvent.id` |

`DesNode` in `FlowDiagramReactFlow.jsx` renders badge chips beneath the node sublabel. Badge click calls `onNodeSelect(node.id)`, opening the node inspector (which shows the full element config). No new external callbacks are required.

Badges are purely derived state — they are never stored in `model.graph` or any persisted field.

---

## 10. Configuration and Settings

### 10.1 Experiment Defaults

Stored in `model.experimentDefaults`. These are the defaults pre-populated in the Execute panel; the user can override them per-run.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxSimTime` | number | 500 | Simulation end time (time-based termination) |
| `warmupPeriod` | number | 0 | Warmup duration; stats collection begins after this time |
| `replications` | integer | 1 | Number of independent replications per experiment |
| `seed` | integer | random | Base PRNG seed for reproducibility; each replication derives its seed from this base via `mulberry32` |
| `terminationMode` | `"time"` or `"condition"` | `"time"` | Determines whether the run ends at `maxSimTime` or when `terminationCondition` evaluates to true |
| `terminationCondition` | object or null | null | Predicate Builder condition object evaluated at Phase A to trigger termination |

### 10.2 User Settings

Per-user settings (stored in Supabase user profile or localStorage in anonymous mode):

| Setting | Type | Description |
|---------|------|-------------|
| `executionSpeed` | integer (steps/tick) | Controls the rate at which engine steps fire during live animated execution |
| `kpiSlots` | string[] | Which KPI cards to display in the Execute panel Analysis view; user-configurable up to 8 slots |
| `animationEnabled` | boolean | Whether the Live View token animation is enabled; disabling it improves execution throughput for large models |
| `collectTimeSeries` | boolean | Whether queue-depth time-series snapshots are collected during execution; required for the Charts tab time-plot; adds memory overhead for long runs |

### 10.3 Engine Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_MAX_SIM_TIME` | 500 | Default run duration in simulation time units |
| `maxCycles` | 5000 | Maximum number of Phase A→B→C cycles before the run is force-terminated |
| `maxCPasses` | 500 | Maximum Phase C scan passes per cycle before `phaseCTruncated` is set |
| `MAX_PROMPT_WORDS` | 2000 | Maximum words in any assembled AI prompt payload before truncation |
