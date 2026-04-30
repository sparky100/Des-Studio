# Audit Part 5 — Replication, Streaming & Experiment Controls

## Preliminary: No Backend Server Exists

Every feature described in this audit task's scope is **absent**. The repository contains exactly 15 JavaScript source files and no server-side code of any kind:

- **No FastAPI** — no Python at all (confirmed in Part 4)
- **No worker orchestration** — no `ProcessPoolExecutor`, no `ThreadPool`, no Web Workers, no worker threads
- **No background DB writer thread** — all database writes happen synchronously in the browser's main thread via the Supabase JS client
- **No Supabase real-time subscription** — no `supabase.channel()`, no `.on('postgres_changes', ...)`, no `.subscribe()`
- **No streaming** — no `EventSource`, no WebSocket, no server-sent events
- **No experiment configuration layer** — no warm-up period, no time-based or condition-based termination parameters, no multi-replication runner

The entire application is a single-page React app. The simulation engine runs synchronously in the browser's main thread.

---

## REPLICATION & STREAMING

### N-Worker Parallel Execution with Independent Seeds

**Not implemented.**

The app runs exactly one simulation at a time, synchronously, on the browser's main thread. `buildEngine(model)` in `src/engine/index.js` takes no seed parameter and uses `Math.random()` directly throughout (`distributions.js:84`, `phases.js:93`, `phases.js:136`).

The `replications` field exists in the `simulation_runs` database schema and is written via `saveSimulationRun()` in `src/db/models.js:119`:
```js
replications: config.replications || 1,
```
But `config` is always the default empty object `{}` at every call site (`execute/index.jsx:169–179`, `execute/index.jsx:202–205`). The field is hardcoded to `1` and there is no UI control to change it.

### ProcessPoolExecutor vs Threading

**Neither is used.** There is no parallel execution infrastructure of any kind.

### Background DB Writer Thread (Sim Loop Decoupled from Writes?)

**Not decoupled.** All writes happen on the browser's main thread and block the UI.

- **Step mode** (`doStep`, `execute/index.jsx:151–183`): DB write fires inside the `if (r.done)` block after simulation completion. It is an async `saveSimulationRun()` call without `await` — it runs as a floating Promise. The sim loop itself is unaffected, but the write is fire-and-forget with no retry logic. If the write fails the only feedback is a state update to `saveStatus`.

- **Run All mode** (`doRunAll`, `execute/index.jsx:185–210`): `await saveSimulationRun(...)` is called after `engine.runAll()` completes. The entire function is `async` and runs on the main thread. The UI is frozen during `engine.runAll()` since there is no `await`, Web Worker offload, or `setTimeout` yield.

### Supabase Real-Time Subscription on Frontend

**Not implemented.** The Supabase client is initialised in `src/db/supabase.js` with only `createClient(url, anon)`. There are no real-time channel subscriptions anywhere in the codebase.

Data freshness relies entirely on explicit `loadData()` calls triggered by user navigation (`onBack`) or explicit save actions. There is no live push of updates from the database.

### Running Mean and 95% CI Calculation

**Not implemented.** There are no statistical aggregation functions anywhere in the codebase — no running mean, no variance accumulator, no confidence interval formula. The only statistics computed are:

- `avgWait` — arithmetic mean of `(serviceStart - arrivalTime)` over served customers (`engine/index.js:162–165`)
- `avgSvc` — arithmetic mean of `(completionTime - serviceStart)` over served customers with both timestamps (`engine/index.js:165–168`)
- `avgSojourn` — arithmetic mean of `sojournTime` over all customers with a sojourn time (`engine/index.js:169–170`)
- `maxSojourn` — `Math.max(...)` over sojourn times (`engine/index.js:171`)

All of these are single-run point estimates. There is no multi-replication runner to accumulate samples across runs, no variance calculation, and no confidence interval of any form.

---

## EXPERIMENT CONTROLS

### Warm-Up Period Parameter

**Not implemented** — neither in the UI nor in the engine.

There is no `warmUpPeriod`, `warmUp`, or any equivalent field in the model schema, the engine constructor, or any UI component. Statistics are accumulated from t=0 with no provision to discard an initial transient period.

The `saveSimulationRun()` function in `src/db/models.js` accepts a `config` object with a `maxTime` field (`config.maxTime || 500`, line 120), but:
1. This field is written to the DB as `max_simulation_time` but is **never read by the engine**
2. `buildEngine()` takes only `(model, maxCycles = 800)` — there is no `maxTime` parameter
3. The engine terminates when the FEL is empty, not when a time limit is reached

There is no warm-up reset of any kind — no engine-level stat reset, no UI toggle.

### Time-Based Termination

**Not implemented in the engine.**

The `max_simulation_time` column exists in the `simulation_runs` DB schema and the value `500` is written as a default, but the engine never reads it. Termination is solely FEL-driven: the simulation ends when `fel.length === 0` (`engine/index.js:91`) or when `maxCycles` (default 800) is reached (`engine/index.js:151`).

There is no `clock >= maxTime` check anywhere in the engine loop.

### Condition-Based Termination

**Not implemented.**

There is no configurable stop condition (e.g., "stop when `served >= 1000`" or "stop when `clock >= 500`"). The only termination mechanisms are:
- FEL exhaustion (natural end — no more events scheduled)
- 800-cycle hard cap (`maxCycles` in `buildEngine`, `engine/index.js:18`)

### Warm-Up < Run Duration Validation Guard

**Not applicable** — neither warm-up nor run duration parameters exist, so there is nothing to validate.

---

## What the DB Schema Records (vs. What the Engine Produces)

The `simulation_runs` table schema implies features that are not yet implemented in the engine or UI:

| DB column | Implied feature | Actual status |
|---|---|---|
| `replications` | N-replication runner | Always written as `1`; no runner exists |
| `max_simulation_time` | Time-limit termination | Written as `500` default; engine never reads it |
| `seed` | Reproducible RNG | Always written as `null`; engine uses `Math.random()` |
| `avg_service_time` | Mean service time | Written as `avgSojourn` (sojourn, not pure service) — column name is misleading |

The schema was designed for a more capable backend that does not yet exist.

---

## Summary

| Feature | Status |
|---|---|
| FastAPI backend | **Absent** |
| Python code | **Absent** |
| N-worker parallel replication | **Absent** |
| ProcessPoolExecutor / ThreadPool / Web Workers | **Absent** |
| Background DB writer (decoupled from sim loop) | **Absent** — fire-and-forget Promise in step mode; blocking `await` in run-all mode |
| Supabase real-time subscription | **Absent** |
| Running mean + 95% CI | **Absent** |
| Seeded RNG | **Absent** (`test.todo` in `engine.test.js:246`) |
| Warm-up period (engine-level reset) | **Absent** |
| Warm-up period (UI parameter) | **Absent** |
| Time-based termination | **Absent** (field in DB schema but engine never reads it) |
| Condition-based termination | **Absent** |
| Warm-up < run duration guard | **Not applicable** — neither parameter exists |
| Multi-run statistics aggregation | **Absent** |
