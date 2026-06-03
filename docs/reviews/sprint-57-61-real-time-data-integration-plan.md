# Sprints 57–61 — Real-Time Data Integration

**Date planned:** 2026-05-17
**Status:** Proposed
**Prerequisite:** Sprint 56 (ExecutePanel hook extraction) complete

---

## Overview

simmodlr currently evaluates all simulation parameters from **static values** baked into the model at design time — distribution means, standard deviations, arrival rates, and service times are constants defined in `bEvents[].schedules[].distParams` and `cEvents[].cSchedules[].distParams`.

This plan specifies the architecture and delivery roadmap for allowing any parameter to be **resolved from a live data source at sample-time**, enabling three new operational patterns:

| Pattern | Description | Use case |
|---|---|---|
| **Calibrated batch** | Fetch live params once at run-start, freeze for the entire run | Consistent multi-replication studies calibrated to current real-world conditions |
| **Rolling single run** | Re-sample parameters on each FEL scheduling event | Digital twin / real-time operations dashboard |
| **Predictive lookahead** | Inject live system snapshot as warm-up state, run forward N minutes | Decision support — "what happens if I add a server right now?" |

---

## Current Architecture

### Model parameter locations

| Parameter type | Schema field | How used by engine |
|---|---|---|
| Arrival rate | `bEvents[i].schedules[j].{dist, distParams}` | Inter-arrival time sampling in Phase B |
| Service time | `cEvents[i].cSchedules[j].{dist, distParams}` | Completion delay scheduling in Phase C |
| Entity attributes | `entityTypes[i].attrDefs[k].defaultValue` | Entity creation at ARRIVE |
| Resource capacity | `entityTypes[i].count` / `shiftSchedule[].capacity` | Server pool size |
| Experiment defaults | `experimentDefaults.{warmupPeriod, maxSimTime, replications}` | Run boundaries |

### Engine entry points (`src/engine/index.js`)

```
buildEngine(model, seed, warmupPeriod, maxSimTime, terminationCondition)
  → { step(), runAll(), getSnap(), getFelSize() }
```

`step()` is synchronous. `runAll()` drives the full Phase A → B → C loop.
Parameters are resolved once at `buildEngine()` call time — there is no runtime re-resolution mechanism.

### Gap

- Parameters are static: defined at model design time, unchanged per run
- No adapter pattern: no concept of a named external data source
- No live binding: no schema field linking a `distParam` value to an external feed
- No state injection: warm-up always runs from an empty system; real-world queue state cannot be seeded

---

## Target Architecture

### Schema extension — `paramSource`

Every `distParams` object gains an optional `paramSource` sibling:

```json
{
  "dist": "Exponential",
  "distParams": { "mean": "1.5" },
  "paramSource": {
    "sourceId": "ds_arrivals",
    "field": "mean_interarrival_mins",
    "fallback": "1.5"
  }
}
```

The `paramSource` field is optional everywhere. Existing models without it behave identically to today — fully backwards-compatible.

### Schema extension — top-level `dataSources`

```json
{
  "dataSources": [
    {
      "id": "ds_arrivals",
      "label": "Live Arrival Feed",
      "type": "websocket",
      "url": "wss://ops.example.com/queue-feed",
      "authHeader": "Authorization",
      "authSecret": "{{env.LIVE_FEED_TOKEN}}"
    },
    {
      "id": "ds_snapshot",
      "label": "Queue Management System Snapshot",
      "type": "rest",
      "url": "https://qms.example.com/api/snapshot",
      "refreshSecs": 300
    }
  ]
}
```

`dataSources` lives inside the existing `model_json` JSONB column in Supabase — no schema migration required.
Credentials use `{{env.VAR}}` placeholders resolved at runtime from `sessionStorage` — never persisted to Supabase.

### Live data mode

Added to `experimentDefaults`:

```json
"liveDataMode": "calibrated_batch" | "rolling" | "lookahead" | null
```

`null` (or absent) = current behaviour, fully static.

---

## New Subsystem — Adapter Layer (`src/engine/adapters/`)

Pure JavaScript, zero React/DOM dependencies. One file per adapter type.

```
src/engine/adapters/
  index.js            — AdapterRegistry: construct, register, resolve, dispose
  RestAdapter.js      — poll-based fetch with TTL cache and retry
  WebSocketAdapter.js — subscribe/receive; exposes latest value synchronously after first message
  SnapshotAdapter.js  — fetches and parses a system state snapshot for warm-up injection
  mockAdapter.js      — deterministic stub returning configured values; used in all Vitest tests
```

### Adapter contract

Every adapter must implement:

```js
// Resolve a single parameter value (returns a number or string)
async getValue(paramSource: ParamSource): Promise<string>

// Fetch a full system snapshot for state injection (SnapshotAdapter only)
async getSnapshot(warmupSource: WarmupSource): Promise<SystemSnapshot>

// Release connections / clear timers
dispose(): void
```

### AdapterRegistry

Constructed once per simulation run, passed into `buildEngine()`:

```js
const registry = new AdapterRegistry(model.dataSources, envSecrets)
const engine   = buildEngine(model, seed, opts, registry)
// after run:
registry.dispose()
```

`registry.resolve(distParams, paramSource)` returns the live value if a `paramSource` is present, or the static `distParam` value if not. This is the only call site change in the engine.

### SystemSnapshot shape

The snapshot returned by `SnapshotAdapter` must conform to:

```js
{
  clock: number,           // real-world time offset (minutes)
  entities: [
    { type: string, id: string, attrs: {}, location: "queue" | "server", queueId?: string }
  ],
  queues: {
    [queueId]: { waiting: number, serving: number }
  }
}
```

The engine's `injectState(snapshot)` method converts this into FEL entries and entity records, bypassing the warm-up phase.

---

## Engine Modifications (`src/engine/index.js`)

### Change 1 — Dynamic parameter resolution

```js
// BEFORE (current)
const delay = sample(sched.dist, sched.distParams, rng)

// AFTER (calibrated_batch mode: registry.resolve() is sync after prefetch)
const resolvedParams = registry.resolve(sched.distParams, sched.paramSource)
const delay = sample(sched.dist, resolvedParams, rng)
```

For `calibrated_batch` mode, `registry.resolve()` is **synchronous** — all live values are prefetched before `buildEngine()` returns, so the core FEL loop remains synchronous and reproducible.

For `rolling` mode, `step()` becomes `async step()` and awaits `registry.resolve()` at each FEL scheduling point. A new `runAllAsync()` entry point is added; the existing synchronous `runAll()` is unchanged.

### Change 2 — State injection

```js
// New method on engine instance
engine.injectState(snapshot: SystemSnapshot): void
```

Called after `buildEngine()` and before the first `step()` when `liveDataMode === "lookahead"`. Populates the FEL and entity store from real-world state, resetting the clock to zero (simulation time, not wall time).

### Backwards compatibility

`buildEngine()` signature gains an optional fourth argument:

```js
buildEngine(model, seed, opts, registry = nullRegistry)
```

`nullRegistry.resolve(distParams, _)` returns `distParams` unchanged. All existing callers (sweep runner, test suite) work without modification.

---

## UI Changes

### Data Source Manager (new panel — ModelDetail settings tab)

- Add / edit / delete named data sources in `model.dataSources[]`
- **Test connection** button: fires one `getValue()` call, shows the returned value inline
- **Credential slot**: value stored in `sessionStorage` only, bound to the `{{env.VAR}}` placeholder; never written to Supabase

### Parameter Binding Editor (extension to `BEventEditor` and `CEventEditor`)

Per `distParam` field:

- Toggle: `Static` (current behaviour) | `Live` (binds to a data source)
- When `Live`: select source from `dataSources[]` dropdown, enter field path (dot-notation), set fallback value
- **Preview chip**: fetches the current live value and displays it inline alongside the fallback

### Run mode selector (extension to `ExperimentControls`)

- Appears only when model has at least one `paramSource` defined
- Options: `Calibrated batch` | `Rolling` | `Lookahead`
- `Rolling` and `Lookahead` disable the replications input (a single live-driven run is not reproducible across replications)
- `Lookahead` reveals a warm-up source selector pointing at a `stateSnapshot`-type data source

### Run banner

When a live-data run is active, a banner replaces the normal progress indicator:

```
⬤ Live  |  Arrival rate: 1.3 min  (refreshed 4s ago)  |  Service time: 8.2 min  (refreshed 4s ago)
```

---

## Operational Framework for Modellers

### Pattern A — Calibrated batch (recommended starting point)

1. Define a REST data source pointing at your operational system's current-state API
2. Bind the arrival rate mean and service time mean to live fields
3. Set `liveDataMode: "calibrated_batch"`
4. Run as normal — simmodlr fetches live values once, then runs all replications with those fixed values
5. Results are reproducible: re-running at the same moment gives the same answer

**Best for:** daily calibration of models before a planning session; regular "model health" checks against actuals.

### Pattern B — Rolling single run

1. Define a WebSocket or frequently-polled REST source
2. Bind parameters as in Pattern A
3. Set `liveDataMode: "rolling"`, set replications to 1
4. Run — the simulation clock advances and re-samples parameters from the live feed at each arrival/service event
5. Results reflect the system as it evolves in real time

**Best for:** operations dashboards; monitoring a live system against its DES model; anomaly detection (sim diverges from reality → alert).

### Pattern C — Predictive lookahead

1. Define a `stateSnapshot` data source that returns current queue depths and in-flight entities
2. Set `liveDataMode: "lookahead"`
3. Configure the lookahead horizon (e.g., 60 minutes)
4. Run — simmodlr injects the live snapshot, skips warm-up, and simulates forward 60 minutes under N scenarios
5. Compare scenario outputs to choose an intervention

**Best for:** real-time decision support (staffing, routing changes, capacity bursts); "what happens if I do X in the next hour?"

---

## Security and Privacy Considerations

- Credentials (API keys, tokens) are **never** written to Supabase. They are entered per session into `sessionStorage` and referenced in the model JSON only as `{{env.VAR}}` placeholders.
- Data fetched from live sources is **not** persisted in run results or exports — only derived simulation outputs are stored.
- All live source URLs are user-supplied and user-controlled. simmodlr makes no outbound requests except to URLs explicitly configured by the model owner.
- For shared/public models, `dataSources` definitions are visible to all viewers, but credentials are not (they live only in the model owner's session).

---

## Sprint Plan

### Sprint 57 — Adapter Layer Foundation

**Branch:** `sprint-57`
**Scope:** Engine-layer only, no UI, no live network calls in tests

#### Deliverables

| ID | Deliverable | File(s) |
|----|-------------|---------|
| F57.1 | `AdapterRegistry` with `nullRegistry` fallback | `src/engine/adapters/index.js` |
| F57.2 | `RestAdapter` — fetch with TTL cache, retry, JSONPath field extraction | `src/engine/adapters/RestAdapter.js` |
| F57.3 | `mockAdapter` — returns configured deterministic values | `src/engine/adapters/mockAdapter.js` |
| F57.4 | Schema types for `DataSource`, `ParamSource`, `SystemSnapshot` | `src/engine/adapters/types.js` |
| F57.5 | Engine: optional `registry` param to `buildEngine()`; `nullRegistry` default | `src/engine/index.js` |
| F57.6 | Engine: `registry.resolve()` call at B-Event and C-Event sample sites | `src/engine/index.js` |
| F57.7 | Vitest: `mockAdapter` integration — verify param substitution, fallback on null | `src/engine/adapters/__tests__/` |

**Out of scope:** WebSocket adapter, UI, async engine, state injection

**Acceptance criteria:**
- All existing Vitest tests pass unchanged (nullRegistry is transparent)
- New tests confirm: live value replaces static param; fallback used when adapter returns null; `dist` sampling is unaffected

---

### Sprint 58 — Calibrated Batch Mode (End to End)

**Branch:** `sprint-58`
**Prerequisite:** Sprint 57 complete

#### Deliverables

| ID | Deliverable | File(s) |
|----|-------------|---------|
| F58.1 | `RestAdapter` prefetch on `AdapterRegistry.prefetchAll()` — resolves all paramSources before run | `src/engine/adapters/index.js` |
| F58.2 | `calibrated_batch` mode in `buildEngine()` — calls `prefetchAll()`, then runs sync | `src/engine/index.js` |
| F58.3 | Data Source Manager UI — add/edit/delete `dataSources[]`, test connection button | `src/ui/ModelDetail.jsx` (new settings tab section) |
| F58.4 | Credential slot — sessionStorage binding, `{{env.VAR}}` resolution at fetch time | `src/ui/ModelDetail.jsx` |
| F58.5 | Parameter binding toggle in `BEventEditor` — Static / Live with source selector, field path, fallback | `src/ui/editors/BEventEditor.jsx` |
| F58.6 | Parameter binding toggle in `CEventEditor` | `src/ui/editors/CEventEditor.jsx` |
| F58.7 | Live preview chip in binding editor — fetches and shows current value | `src/ui/editors/BEventEditor.jsx`, `CEventEditor.jsx` |
| F58.8 | Vitest: calibrated_batch integration using `mockAdapter` — assert fetched values used across all replications | `src/engine/__tests__/` |

**Acceptance criteria:**
- A model with paramSource fields runs in calibrated_batch mode and uses fetched values for every replication
- A model without paramSource fields runs identically to today
- Credential entered in sessionStorage is used by RestAdapter and absent from Supabase payload

---

### Sprint 59 — Rolling Mode and WebSocket Adapter

**Branch:** `sprint-59`
**Prerequisite:** Sprint 58 complete

#### Deliverables

| ID | Deliverable | File(s) |
|----|-------------|---------|
| F59.1 | `WebSocketAdapter` — connect, receive, expose latest value synchronously after first message | `src/engine/adapters/WebSocketAdapter.js` |
| F59.2 | Async `step()` variant — `stepAsync()` awaits `registry.resolve()` per scheduling event | `src/engine/index.js` |
| F59.3 | `runAllAsync()` entry point — drives async FEL loop; existing `runAll()` unchanged | `src/engine/index.js` |
| F59.4 | `rolling` mode in `buildEngine()` — uses `runAllAsync()`, forces replications = 1 | `src/engine/index.js` |
| F59.5 | Run mode selector in `ExperimentControls` — visible when model has paramSources; disables replications for rolling | `src/ui/execute/ExperimentControls.jsx` |
| F59.6 | Live run banner — shows source name, last-refreshed values, time since last fetch | `src/ui/execute/` (new component) |
| F59.7 | Vitest: WebSocketAdapter mock — verify latest-value semantics, reconnect on drop | `src/engine/adapters/__tests__/` |
| F59.8 | Vitest: rolling mode — assert params differ across step() calls when mock returns varying values | `src/engine/__tests__/` |

**Acceptance criteria:**
- Rolling mode run updates parameters as the simulation advances without pausing the FEL loop
- WebSocket disconnection falls back to last-received value (not fallback) until reconnect timeout exceeded
- Replications input locked to 1 in rolling and lookahead modes

---

### Sprint 60 — Predictive Lookahead and State Injection

**Branch:** `sprint-60`
**Prerequisite:** Sprint 59 complete

#### Deliverables

| ID | Deliverable | File(s) |
|----|-------------|---------|
| F60.1 | `SnapshotAdapter` — fetch, validate, and parse `SystemSnapshot` from REST endpoint | `src/engine/adapters/SnapshotAdapter.js` |
| F60.2 | `engine.injectState(snapshot)` — populates FEL and entity store, resets clock to zero | `src/engine/index.js` |
| F60.3 | `lookahead` mode in `buildEngine()` — fetches snapshot, calls `injectState()`, skips warm-up phase | `src/engine/index.js` |
| F60.4 | Warm-up source selector in `ExperimentControls` — appears for lookahead mode; selects a stateSnapshot-type data source | `src/ui/execute/ExperimentControls.jsx` |
| F60.5 | Lookahead horizon input — replaces maxSimTime label with "Lookahead horizon (minutes)" | `src/ui/execute/ExperimentControls.jsx` |
| F60.6 | `SystemSnapshot` schema validator — rejects snapshots missing required fields with user-visible error | `src/engine/adapters/SnapshotAdapter.js` |
| F60.7 | Vitest: `injectState()` — assert entity and queue state matches snapshot, warm-up not triggered | `src/engine/__tests__/` |
| F60.8 | Vitest: lookahead end-to-end with mock snapshot and mockAdapter params | `src/engine/__tests__/` |

**Acceptance criteria:**
- Lookahead run begins at injected state (non-empty queues, entities in flight) with clock at 0
- Warm-up period is ignored in lookahead mode
- Snapshot validation errors surface as a user-readable message before the run starts

---

### Sprint 61 — Hardening, Docs, and Template Models

**Branch:** `sprint-61`
**Prerequisite:** Sprint 60 complete

#### Deliverables

| ID | Deliverable | File(s) |
|----|-------------|---------|
| F61.1 | Error handling: network timeout, invalid JSON, auth failure — all surface as run-abort with message | All adapters |
| F61.2 | Retry logic: exponential back-off (2 s, 4 s, 8 s) for transient failures before falling back | `RestAdapter.js`, `WebSocketAdapter.js` |
| F61.3 | Live data badge on ModelCard and ModelDetail header — visible indicator when model has paramSources | `src/ui/ModelLibrary.jsx`, `src/ui/ModelDetailHeader.jsx` |
| F61.4 | Export: live parameter values used in a run recorded in run metadata (not the fetched data, just the resolved numeric values) | `src/db/models.js` |
| F61.5 | Template: "M/M/1 with Live Arrivals" — demonstrates calibrated_batch pattern with a mock REST endpoint | `src/engine/templates.js` |
| F61.6 | Template: "Predictive Lookahead — A&E Triage" — demonstrates lookahead pattern | `src/engine/templates.js` |
| F61.7 | Capability guide for real-time integration | `docs/reviews/sprint-61-capability-guide.md` |
| F61.8 | Vitest: adapter error paths — timeout, 4xx, 5xx, malformed JSON | `src/engine/adapters/__tests__/` |

**Acceptance criteria:**
- All adapter error paths produce a run-abort message rather than a silent failure or uncaught exception
- Resolved parameter values appear in exported run metadata
- Both template models open and run in calibrated_batch mode using the mock endpoint

---

## Summary

| Sprint | Focus | Key output |
|---|---|---|
| 57 | Adapter layer foundation | `AdapterRegistry`, `RestAdapter`, `mockAdapter`; engine wired; existing tests green |
| 58 | Calibrated batch end-to-end | UI binding editor, Data Source Manager, prefetch-and-freeze run mode |
| 59 | Rolling mode + WebSocket | Async engine variant, live banner, WS adapter |
| 60 | Lookahead + state injection | `injectState()`, `SnapshotAdapter`, lookahead UI |
| 61 | Hardening + templates | Error handling, retry, exported metadata, two live-data template models |

The `calibrated_batch` mode (Sprint 58) delivers the highest value at the lowest complexity — it requires no async engine changes and produces reproducible multi-replication results. Sprints 59–61 layer on progressively more complex operational patterns. Each sprint is independently shippable; later sprints can be deferred without breaking earlier deliverables.
