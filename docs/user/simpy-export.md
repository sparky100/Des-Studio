# SimPy Export

**Last updated:** 2026-06-11 (Sprint 85)

simmodlr can export any model as a runnable **SimPy** Python simulation script, or execute it directly in your browser without installing Python.

---

## Quick start

1. Open a model and click **⬇ SimPy** in the top header bar, or go to
   the **Access** tab and click **Export SimPy**.
2. A dialog shows whether the script is **Category 1** (complete) or **Category 2** (partial — needs manual finishing).
3. Choose how to use the script:
   - **Run in Browser** (Category 1 only) — runs the SimPy script in your browser using Pyodide WebAssembly. No Python installation needed. Results are loaded directly into the app.
   - **Download .py** — saves `<model-name>_simpy.py` for local execution.
4. To run locally, install SimPy first:
   ```
   pip install simpy
   ```
5. Run the script:
   ```
   python your_model_simpy.py
   ```

---

## Run in Browser

Category 1 models can be executed without leaving the browser. Click **Run in Browser** in the SimPy dialog:

- **First run:** Pyodide (~25 MB) and SimPy are downloaded and cached. Subsequent runs start immediately.
- **Progress:** A bar tracks each replication as it completes.
- **Results:** When all replications finish, results are loaded into the app and appear in the Results workspace — the same place JS-engine results appear. They carry a `[SimPy]` source label.
- **Metrics available in browser results:** served/reneged counts, arrivals (total), completion rate (servedRatio), average sojourn, average wait, average service time, wait P50/P90/P99, and per-resource utilisation — richer than the text output of the standalone script.
- **History:** Browser runs are saved to your run history with the label `SimPy  DD/MM/YYYY HH:mm`, identical to JS-engine runs. They appear in the history dropdown on the Execute tab.

The **Run in Browser** button is disabled for Category 2 models. Complete the `# TODO` sections in your IDE first, then run locally with `python your_model_simpy.py`.

---

## Category 1 — Complete scripts

If your model uses only fully-supported macros the export dialog shows
**CATEGORY 1 — COMPLETE**. The script runs without any manual edits.

Supported (Category 1) macros: `ARRIVE`, `ASSIGN`, `COSEIZE`, `COMPLETE`,
`RELEASE`, `FILL`, `DRAIN`, `SPLIT`, `SET`, `SET_ATTR`, `COST`, `UNBATCH`.

All 22 built-in templates export as Category 1 scripts, including the Appointment Clinic (Schedule distribution) and the TfL/OpenSky live-data templates.

---

## Category 2 — Partial scripts

If the model contains macros that require more complex SimPy patterns, the dialog
shows **CATEGORY 2 — PARTIAL** and lists the macros that need attention.
The script is still generated and **runs without errors**, but the affected logic
is replaced with commented `# TODO` stubs you must complete manually.

| Macro | What to implement |
|---|---|
| `RENEGE` | Reneging via `yield req \| env.timeout(patience)` |
| `BATCH` | Accumulate N entities from a store before processing |
| `RENEGE_OLDEST` | Remove the oldest entity from `store.items` |
| `MATCH` | Pair entities from two stores |
| `FAIL` | Set `resource._capacity = 0` to simulate breakdown |
| `REPAIR` | Restore capacity after a FAIL |
| `PREEMPT` | Switch resource to `simpy.PreemptiveResource` |
| `RELEASE_COSEIZED` | Release each co-seized resource's `simpy.Request` individually |

Each stub includes a **Pattern** comment showing the idiomatic SimPy approach.

---

## Script structure

The generated script contains these sections, in order:

| Section | Description |
|---|---|
| Docstring | Model name, generation date, category, TODO list |
| Imports | `simpy`, `random`, `math`, `statistics`, `json`, `dataclasses` |
| Configuration | `MAX_SIM_TIME`, `WARMUP_PERIOD`, `REPLICATIONS`, `BASE_SEED`, `RUN_MODE` |
| Distribution samplers | `_exp`, `_uniform`, `_normal`, `_triangular`, `_fixed`, `_erlang`, `_lognormal` |
| State variables | Module-level Python variables from the model's State tab |
| Entity dataclasses | One `@dataclass` per customer entity type, with `arrival_time`, `sojourn_time`, `service_start_time` |
| Statistics collector | `Stats` class tracking `served`, `reneged`, `total_cost`, `resource_busy` |
| Arrival processes | One generator per B-event with `ARRIVE` |
| Service processes | One monitor + service generator pair per C-event with `ASSIGN` or `COSEIZE` |
| Shift schedules | One process per server entity type with a shift schedule |
| TODO stubs | Annotated stubs for unimplemented macros (Category 2 only) |
| `run_replication(seed)` | Wires everything together; returns a metrics dict (see below) |
| `__main__` block | Runs all replications; output format controlled by `RUN_MODE` |

---

## Configuration

Edit the constants near the top of the generated file:

```python
MAX_SIM_TIME   = 480   # minutes  ← change to match your study horizon
WARMUP_PERIOD  = 60    # minutes  ← statistics collected after this time
REPLICATIONS   = 10              ← number of independent replications
BASE_SEED      = 42              ← change for different random streams
RUN_MODE       = "text"          ← "text" for human-readable output, "json" for JSONL
```

These are initialised from the model's **Experiment Defaults** tab and can be freely edited in the Python file.

**`RUN_MODE`** controls the output format of the `__main__` block:
- `"text"` (default) — prints human-readable per-replication lines and a summary table, suitable for reading at the terminal.
- `"json"` — prints one JSON object per line (JSONL format): one `{"type":"rep",...}` record per replication followed by a `{"type":"summary",...}` record. Designed for consumption by scripts, notebooks, or the browser runner. The **Run in Browser** button switches to `"json"` mode automatically.

---

## Distribution mappings

| DES Studio distribution | SimPy / Python expression |
|---|---|
| Exponential(mean) | `random.expovariate(1/mean)` |
| Uniform(min, max) | `random.uniform(min, max)` |
| Normal(mean, stddev) | `max(0, random.gauss(mean, stddev))` |
| Triangular(min, mode, max) | `random.triangular(min, max, mode)` |
| Fixed(value) | `float(value)` |
| Erlang(k, mean) | Sum of k exponentials |
| Lognormal(logMean, logStdDev) | `random.lognormvariate(logMean, logStdDev)` |
| Piecewise(…) | `_piecewise_NAME(env.now)` time-varying helper function (Category 1) |
| Schedule(rows[]) | `for`-loop over absolute arrival times with per-row attribute injection (Category 1) |
| Empirical(values[]) | `random.choice([values])` (Category 1) |

---

## Per-replication metrics

`run_replication(seed)` returns a dict with the following fields:

| Field | Description |
|---|---|
| `total` | Number of entities that arrived post-warmup |
| `served` | Number of entities that completed service (post warmup) |
| `reneged` | Number of entities that left before being served |
| `avg_sojourn` | Mean total time in system (queue + service) |
| `total_cost` | Cumulative COST macro value |
| `wait_mean` | Mean time in queue before service started |
| `wait_p50` | Median queue wait time |
| `wait_p90` | 90th-percentile queue wait time |
| `wait_p99` | 99th-percentile queue wait time |
| `svc_mean` | Mean service duration (time holding resource) |
| `util` | Dict of `{server_name: utilisation_fraction}` — fraction of post-warmup time the server type was busy |

In `"text"` mode the `__main__` block prints a summary row per replication showing `served`, `avg_sojourn`, `reneged`, and `wait_p90`. In `"json"` mode every field above is included in each per-rep JSON line.

---

## DRAIN note

DES Studio's `DRAIN` macro fails immediately if the container level is less than
the requested amount. SimPy's `Container.get()` **blocks** until sufficient level
is available. If your model depends on the fail-fast behaviour, replace the
generated `yield container.get(amount)` with an explicit level check:

```python
if container.level >= amount:
    yield container.get(amount)
else:
    pass  # fail-fast: amount unavailable
```

---

## COSEIZE — simultaneous multi-resource seize

`COSEIZE` is translated using `simpy.AllOf` to simultaneously request all required
resources before service begins:

```python
_req0 = Doctor_resource.request()
_req1 = Nurse_resource.request()
yield simpy.AllOf(env, [_req0, _req1])
entity.service_start_time = env.now
try:
    yield env.timeout(service_time)
    _svc_t = env.now - entity.service_start_time
    stats.resource_busy["Doctor"] = stats.resource_busy.get("Doctor", 0.0) + _svc_t
    stats.resource_busy["Nurse"]  = stats.resource_busy.get("Nurse",  0.0) + _svc_t
finally:
    for _req in [_req0, _req1]:
        try: _req.resource.release(_req)
        except: pass
```

---

## Tips

- **Seed control:** each replication uses `BASE_SEED + rep_index` so results are reproducible. Change `BASE_SEED` to explore different random streams.
- **Warmup:** entities that arrive during `WARMUP_PERIOD` are not counted in statistics. Set `WARMUP_PERIOD = 0` to disable.
- **Multiple entity types:** the script generates one `@dataclass` per customer entity type. Server types become `simpy.Resource` instances.
- **Extending the script:** add `env.process(...)` calls at the bottom of `run_replication` to add your own custom processes.
- **Machine-readable pipeline:** set `RUN_MODE = "json"` to produce one JSON object per line. Pipe into Python:
  ```python
  import subprocess, json
  lines = subprocess.run(["python", "model_simpy.py"], capture_output=True, text=True).stdout.strip().splitlines()
  reps  = [json.loads(l) for l in lines if json.loads(l).get("type") == "rep"]
  waits = [r["wait_p90"] for r in reps]
  ```
- **Utilisation accuracy:** `util` values are computed from cumulative service time divided by `(env.now − WARMUP_PERIOD) × capacity`. For very short warmup periods or low replication counts the estimate may be noisy; use at least 10 replications for stable resource utilisation figures.
