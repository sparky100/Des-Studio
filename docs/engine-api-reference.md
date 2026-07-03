# simmodlr — Engine Public API Reference

**Version:** 1.2 (Sprint 58+)
**Entry point:** `src/engine/public-api.js`

The public API is the stable, documented surface for embedding and extending the simmodlr simulation engine. Internal modules (`phases.js`, `macros.js`, `entities.js`, `conditions.js`) are not part of this surface and may change without notice.

---

## Quick start

```javascript
import {
  buildEngine,
  validateModel,
  runReplications,
  summarizeReplicationResults,
} from './src/engine/public-api.js';

// 1. Validate before running
const { errors, warnings } = validateModel(model);
if (errors.length) throw new Error(errors.map(e => e.message).join('; '));

// 2. Single run
const engine = buildEngine(model, seed, warmupPeriod, maxSimTime);
const result  = engine.runAll();
console.log(result.summary.avgWait, result.summary.totalCost);

// 3. Replications with confidence intervals
runReplications({
  model,
  replications: 30,
  baseSeed:     100,
  warmupPeriod: 50,
  maxSimTime:   500,
  workerCount:  4,
  onComplete: (results) => {
    const ci = summarizeReplicationResults(results, ['summary.avgWait']);
    console.log(ci['summary.avgWait']); // { n, mean, lower, upper, halfWidth }
  },
  onError: console.error,
});
```

---

## `buildEngine(model, seed, warmupPeriod, maxSimTime, terminationCondition, maxCycles, maxCPasses, collectTimeSeries, registry)`

Builds and returns a simulation engine instance.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | `Object` | required | Canonical model JSON (see Model Schema below) |
| `seed` | `number` | required | Integer seed for `mulberry32` PRNG — same seed reproduces identical results |
| `warmupPeriod` | `number` | `0` | Simulation time before statistics reset; entities that completed pre-warmup are removed |
| `maxSimTime` | `number \| null` | `null` | Clock time at which simulation terminates; `null` runs until FEL is empty |
| `terminationCondition` | `Object \| null` | `null` | JSON predicate evaluated after each step; stops simulation when true |
| `maxCycles` | `number` | `5000` | Maximum Phase A/B/C cycles before forced termination |
| `maxCPasses` | `number` | `500` | Maximum Phase C scans per cycle before truncation |
| `collectTimeSeries` | `boolean` | `false` | Whether to collect per-step entity snapshots (expensive for large models) |
| `registry` | `AdapterRegistry \| nullRegistry` | `nullRegistry` | Live-data adapter registry (Sprint 57+). Pass `nullRegistry` (default) for static runs. See [Live-data registry](#live-data-registry-sprint-57) below. |

### Returns: engine instance

| Method | Returns | Description |
|--------|---------|-------------|
| `runAll()` | `RunResult` | Run simulation to completion and return full result |
| `step()` | `StepResult` | Advance one cycle (Phase A+B+C) for interactive stepping |
| `getSummary()` | `Summary` | Compute summary statistics from current entity state |
| `getSnap()` | `Snapshot` | Current entity/server/queue snapshot |
| `getFelSize()` | `number` | Number of pending FEL entries |
| `getEntitySummary()` | `Entity[]` | Copy of current entity pool with attrs |
| `getTimeSeries()` | `TimeSeries \| undefined` | Collected time-series data (if `collectTimeSeries: true`) |
| `getWaitDist()` | `Object` | Wait-time distribution by queue |

### `RunResult` shape

```javascript
{
  finalTime:       number,         // Clock at simulation end
  log:             LogEntry[],     // Full structured event log
  summary:         Summary,        // Aggregated statistics
  entitySummary:   Entity[],       // Final entity pool state
  snap:            Snapshot,       // Final visual snapshot
  phaseCTruncated: boolean,        // True if Phase C hit maxCPasses in any cycle
  warnings:        string[],       // Runtime warnings
  perQueue:        Object,         // Per-queue throughput metrics (if available)
  waitDist:        Object,         // Wait-time distributions by queue name
}
```

### `Summary` shape

```javascript
{
  total:         number,           // Total entities in pool at simulation end
  served:        number,           // Entities that completed service
  reneged:       number,           // Entities that abandoned
  avgWait:       number | null,    // Mean post-warmup wait time
  avgSvc:        number | null,    // Mean post-warmup service time
  avgSojourn:    number | null,    // Mean post-warmup sojourn (served + reneged only)
  avgTimeInSystem: number | null,  // Weighted mean time in system (all entities, incl. in-progress at 0.5 weight)
  maxSojourn:    number | null,    // Maximum sojourn time
  servedRatio:   number | null,    // Service completion rate (served / total, 0–1)
  avgWIP:        number,           // Time-average WIP = ∫ WIP dt / post-warmup elapsed
  totalCost:     number,           // Accumulated COST() macro total (0 if unused)
  costPerServed: number | null,    // totalCost / served (null if served = 0)
  perResource:   Object | undefined,
  // Per-server-type time-averaged utilisation (post-warmup).
  // Key = entity type name. Value shape:
  //   { total: number,        — count of server instances of this type
  //     utilisation: number } — busyTime / (elapsed × total), range [0,1]
  // Absent when no server entity types are defined.
  warmupPeriod:  number,
  excludedCount: number,           // Entities removed at warmup boundary
  phaseCTruncated: boolean,
}
```

---

## `validateModel(model)`

Validates model structure before execution. Returns immediately — does not run the simulation.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | `Object` | Canonical model JSON |

### Returns

```javascript
{
  errors:   ValidationFinding[],  // Blocking issues — prevent execution
  warnings: ValidationFinding[],  // Non-blocking — model will still run
}
```

```javascript
// ValidationFinding shape
{
  code:    string,   // e.g. "V8", "V9", "V26"
  message: string,
  tab:     string,   // Which editor tab the issue belongs to
}
```

**Key validation codes:**

| Code | Description |
|------|-------------|
| V8 | Missing entity source (ARRIVE) or sink (COMPLETE/RENEGE) |
| V9 | Unknown queue referenced in condition |
| V16 | No run-stop condition (maxSimTime=0, no termination condition) |
| V26 | Non-numeric B-event scheduled time |

---

## `runReplications(options)`

Runs multiple independent replications and aggregates results. Uses Web Workers when available, falls back to inline execution.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `Object` | required | Model to replicate |
| `replications` | `number` | required | Number of replications to run |
| `baseSeed` | `number` | required | First replication uses `baseSeed`, second `baseSeed+1`, etc. |
| `warmupPeriod` | `number` | `0` | Warmup period for each replication |
| `maxSimTime` | `number` | required | Run time per replication |
| `workerCount` | `number` | `4` | Parallel workers (capped by `navigator.hardwareConcurrency`) |
| `maxCycles` | `number` | `5000` | Max cycles per replication |
| `onComplete` | `function` | required | Called with `results[]` when all replications finish |
| `onError` | `function` | required | Called if any replication fails |
| `onProgress` | `function \| null` | `null` | Called after each replication with `{ completed, total }` |

---

## `summarizeReplicationResults(results, metricPaths)`

Computes 95% confidence intervals for metrics across replications.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `results` | `Object[]` | Array of replication result objects (or `{ result: ... }` wrappers) |
| `metricPaths` | `string[]` | Dot-paths to metrics, e.g. `["summary.avgWait", "summary.totalCost"]` |

### Returns

```javascript
{
  "summary.avgWait": {
    n:         number,   // Replications with a finite value for this metric
    mean:      number,
    lower:     number,   // 95% CI lower bound
    upper:     number,   // 95% CI upper bound
    halfWidth: number,
  },
  // ...one entry per metricPath
}
```

---

## `confidenceInterval95(values)`

Computes a 95% t-distribution confidence interval from a raw array of numbers.

```javascript
const ci = confidenceInterval95([8.2, 9.1, 7.8, 10.3, 8.9]);
// { n: 5, mean: 8.86, lower: 7.74, upper: 9.98, halfWidth: 1.12 }
```

---

## `compareScenarios(scenarioA, scenarioB, metricPaths, options)`

Paired t-test comparison between two scenario result arrays. Returns Bonferroni-corrected CIs.

---

## `oneWayANOVA(groups)` / `tukeyHSD(groups, anovaMSE)`

One-way ANOVA with F-test and Tukey HSD post-hoc comparison across multiple scenario groups.

---

## `fitDistribution(values)`

Fits a theoretical distribution to empirical data by scoring `fixed`, `exponential`, `normal`,
`lognormal`, `uniform`, and `triangular` candidates (KS-statistic) and returning the best-fit
`{ type, params, score }`. `lognormal` params map directly onto the engine's `Lognormal`
distribution (`{ logMean, logStdDev }`) — every type `fitDistribution` can return is sampleable
by `sample()`/`DISTRIBUTIONS`, so a fit result can always be applied directly to a model's
`dist`/`distParams` without translation.

---

## `mulberry32(seed)`

Returns a seeded pseudo-random number generator function. The engine uses this internally for all sampling — passing the same seed to `buildEngine` guarantees identical results.

```javascript
const rng = mulberry32(42);
rng(); // → number in [0, 1)
```

---

## Model JSON schema (minimal)

```javascript
{
  entityTypes: [
    {
      id:           string,          // Unique within model
      name:         string,
      role:         'customer' | 'server',
      count:        string | number, // Servers: initial count
      attrDefs: [
        { name: string, valueType: 'number'|'string'|'boolean',
          defaultValue: string, mutable: boolean }
      ],
      shiftSchedule: [               // Optional: [{ time, capacity }]
        { time: number, capacity: number }
      ],
      mtbf: string | null,           // Optional: mean time between failures
      mttr: string | null,           // Optional: mean time to repair
    }
  ],
  stateVariables: [
    { id: string, name: string, initialValue: string, resetOnWarmup: boolean }
  ],
  queues: [
    { id: string, name: string, customerType: string,
      discipline: 'FIFO'|'LIFO'|'PRIORITY'|'SPT'|'EDD',
      capacity: string | null,
      overflowDestination?: string,     // queue name for blocked/balked entities; recursed and re-checked at the destination
      balkProbability?: number,         // ∈ [0,1] (V21); checked on every join — ARRIVE, RELEASE, routing, batch/split, preemption
      balkCondition?: object,           // predicate { variable, operator, value }, same scope as balkProbability
      renegeDist?: string,              // auto-schedules a patience timer on join; no RENEGE(ctx) B-event needed
      renegeDistParams?: Object }
  ],
  bEvents: [
    {
      id:            string,
      name:          string,
      scheduledTime: string,         // Numeric string; '9999' = never auto-fires
      effect:        string,         // Semicolon-separated macro calls
      schedules: [
        { eventId: string, dist: string, distParams: Object, isRenege?: boolean }
      ],
    }
  ],
  cEvents: [
    {
      id:        string,
      name:      string,
      priority:  number,             // Lower fires first
      condition: string | Object,    // String DSL or JSON predicate
      effect:    string,
      cSchedules: [
        { eventId: string, dist: string, distParams: Object, useEntityCtx?: boolean }
      ],
    }
  ],
}
```

---

## Effect macro vocabulary

| Macro | Description |
|-------|-------------|
| `ARRIVE(Type[, Queue])` | Create entity of Type, place in Queue |
| `ASSIGN(Queue, Server)` | Seize idle Server for first waiting entity in Queue |
| `ASSIGN(Queue, Server, "Skill")` | Same, filtered to idle servers with the named skill. Prefers higher `skillProfiles[].priority` when multiple match; ties resolve FIFO by idle-since time. |
| `ASSIGN(Queue, ANY, "Skill")` | Same skill filter, but pools idle servers across every server type instead of one fixed type. Reserved token `ANY`; requires a skill argument. |
| `ASSIGN(Queue, Server, ContainerId:amount)` | Gates the assignment on a declared container having level ≥ `amount`; server claim and container deduction commit atomically (no partial seizure). Combine with a skill by putting the container clause last. |
| `COMPLETE()` | End service for context entity; release server; increment served count |
| `RELEASE(Server[, Queue])` | Release server without completing; re-queue entity if Queue given |
| `RENEGE(ctx)` | Remove context entity from queue (abandonment) |
| `RENEGE_OLDEST(Queue)` | Remove oldest waiting entity from Queue |
| `PREEMPT(Server)` | Interrupt mid-service; entity re-queues with remaining service |
| `FAIL(Server)` | Mark Server as failed; interrupt any in-progress service |
| `REPAIR(Server)` | Restore failed Server to idle; trigger C-scan |
| `FINISH(Server)` | End the in-progress service of whichever entity a busy Server is currently serving, right now — for condition-triggered completion ("activity of unknown duration") instead of a scheduled delay. No busy server of that type → no-op. |
| `SPLIT(Type, N, Queue)` | Clone context entity N-1 times; place clones in Queue. Requires exactly 3 args — a 2-arg `SPLIT(N, Queue)` is invalid and silently does nothing. Trigger from a one-shot context (a cSchedule-fired B-event), never a recurring C-event condition on the entity's own queue: SPLIT doesn't change the context entity's status, so a condition that stays true refires it unboundedly. |
| `BATCH(Queue[, Size\|Entity.attr])` | Accumulate N entities from Queue into one batch entity |
| `UNBATCH(Queue)` | Release batch members back as individual entities |
| `MATCH(TypeA, QueueA, TypeB, QueueB, Target)` | Pair one entity from each queue into a batch. Merged attrs = `{...entityFromQueueA.attrs, ...entityFromQueueB.attrs}` — QueueB's value wins on any name collision with QueueA. |
| `MATCH(TypeA, QueueA, TypeB, QueueB, Target, "predicate")` | Same, but scans both queues for the first pair satisfying the quoted predicate instead of always taking the front of each. `Entity.<attr>` = the QueueA candidate, `Other.<attr>` = the QueueB candidate. No compatible pair → no-op. |
| `COSEIZE(Queue, Srv1[, Srv2, ...])` | Atomically seize one customer and multiple server types |
| `RELEASE_COSEIZED([Srv1, Srv2, ...][, Queue])` | Atomically release all servers claimed by a COSEIZE for the context entity; re-queue to Queue if given. Never stack separate `RELEASE(Srv)` calls per co-seized type — use this instead. |
| `SET(varName, expr)` | Set state variable to arithmetic expression result |
| `SET_ATTR(attr, expr)` | Set context entity attribute to expression result |
| `COST(expr)` | Accumulate expression result to `summary.totalCost` |
| `CANCEL(EventName)` | Remove the pending FEL entry named EventName scheduled for the context entity only (not a global cancel-all) |
| `ROUND_ROBIN(varName, N)` | Advance a state variable through a 0..N-1 rotation; pair with `routing[]` branches keyed on the variable to cycle destinations |

**Expression syntax** (for `SET`, `SET_ATTR`, `COST`):
- Entity attribute: `Entity.attrName`
- State variable: `varName`
- Clock: `clock`
- Operators: `+`, `-`, `*`, `/`, `()`
- Functions: `min(a,b)`, `max(a,b)`, `abs(a)`, `round(a)`, `floor(a)`, `ceil(a)`

**C-event/B-event `condition` string syntax** — `queue(Name).length`, `idle(Type).count`,
`busy(Type).count`, `container(Id).level`, `attr(Type, attrName)`, `state.varName`, combined with
`AND`/`OR`/`NOT` and a comparison operator. The right-hand side resolves dynamically only when it
is itself one of those five function-call-style tokens — e.g. `queue(A).length < queue(B).length`
works correctly (shortest-queue routing), in any condition (C-event, `routing[]`, `balkCondition`,
`cSchedules[].when`). A bare state-variable name or `Entity.<attr>` on the right-hand side is still
always parsed as a **literal constant** at model-load time, never re-resolved. A clause such as
`queue(Q).length > someStateVar` treats `someStateVar` as a literal (NaN) and is always false, with
no error. To gate on a state-variable's dynamic value, compare it to a literal in its own `AND`
clause instead (e.g. `queue(Q).length > 0 AND someStateVar == 0`).

---

## Live-data registry (Sprint 57+)

The `registry` parameter connects `buildEngine` to real-time data sources. It is entirely optional — omit it (or pass `nullRegistry`) for standard static runs.

```javascript
import { buildEngine }      from './src/engine/public-api.js';
import { AdapterRegistry }  from './src/engine/adapters/index.js';
import { RestAdapter }      from './src/engine/adapters/RestAdapter.js';

const registry = new AdapterRegistry(model.dataSources || [], envSecrets);
await registry.prefetchAll();          // fetch all sources before run

const engine = buildEngine(
  model, seed, warmupPeriod, maxSimTime,
  null, 5000, 500, false,
  registry,                            // 9th argument
);
const result = engine.runAll();
registry.dispose();
```

### `new AdapterRegistry(dataSources, envSecrets)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `dataSources` | `DataSource[]` | Array from `model.dataSources`; each entry has `id`, `type`, `url`, `authHeader`, `authSecret`, `refreshSecs` |
| `envSecrets` | `Record<string, string>` | Map of `{{env.VAR}}` placeholder names to resolved credential values (from `sessionStorage`) |

| Method | Description |
|--------|-------------|
| `async prefetchAll()` | Fetch all REST sources before the run; non-fatal on individual failure |
| `resolve(distParams, paramSource)` | Synchronously return `distParams` with any live value merged in; used per FEL event |
| `registerMock(sourceId, adapter)` | Inject a test adapter for a source (testing only) |
| `dispose()` | Release timers and connections |

### `nullRegistry`

A zero-cost singleton that passes all `distParams` through unchanged. Equivalent to having no live data configured.

```javascript
import { nullRegistry } from './src/engine/adapters/index.js';
// nullRegistry.resolve(params, source) === params  (always)
```

### `paramSource` schema

Attach to any `schedules[]` or `cSchedules[]` entry to bind a parameter to a live field:

```json
{
  "dist": "Exponential",
  "distParams": { "mean": "1.5" },
  "paramSource": {
    "sourceId": "ds_feed",
    "field": "mean_interarrival_mins",
    "targetParam": "mean",
    "fallback": "1.5"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `sourceId` | Yes | Must match a `dataSources[].id` |
| `field` | Yes | Dot-notation path into the source JSON (e.g. `arrivals.mean`) |
| `targetParam` | No | Key in `distParams` to replace; defaults to first key |
| `fallback` | No | Used when the source is unavailable; defaults to the static `distParams` value |

---

## Supabase Edge Functions

simmodlr exposes two Supabase Edge Functions. Both require the `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables to be configured in the deployment.

### `POST /functions/v1/import-model`

Import and validate a model JSON from an external system.

**Auth:** Bearer JWT (Supabase user token).

**Request body:**

```json
{
  "model": { /* full model JSON */ },
  "name": "Optional name override"
}
```

**Success response (201):**

```json
{ "ok": true, "modelId": "<uuid>", "warnings": [] }
```

**Error responses:**

| Status | Cause |
|--------|-------|
| 400 | Malformed request body or missing `model` field |
| 401 | Missing or invalid JWT |
| 422 | Model fails validation — response body lists validation errors |
| 500 | Database write failure |

**Validation codes checked:** V1 (unique entity names), V2 (unique attr names), V4 (PRIORITY queue has priority attr), V8 (arrival source/sink exist), V9 (queue refs valid), V19 (server count ≥ 1), V20 (queue capacity ≥ 1), V21 (balk probability 0–1).

### `POST /functions/v1/llm-proxy`

Proxy for LLM inference (AI Insights, report generation, model builder). **Internal use only** — called by the simmodlr UI. Not intended for direct external consumption.

**Auth:** Optional Bearer token (rate-limiting is IP-based regardless).

**Rate limit:** 25 requests / hour per IP (configurable via `LLM_RATE_LIMIT` environment variable).

**Request body:**

```json
{
  "kind": "narrative | comparison | sensitivity | suggestion | query | model_builder",
  "messages": [{ "role": "user", "content": "..." }],
  "maxTokens": 450,
  "stream": true,
  "responseFormat": "text"
}
```

**Streaming response:** Server-sent events (SSE) when `stream: true`; plain JSON when `stream: false`.

**Status 429** is returned when the rate limit is exceeded.
