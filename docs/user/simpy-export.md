# SimPy Export

DES Studio can export any model as a runnable **SimPy** Python simulation script.
The exported `.py` file is self-contained and requires only the `simpy` package.

---

## Quick start

1. Open a model and click **⬇ SimPy** in the top header bar, or go to
   the **Access** tab and click **Export SimPy** in the Export section.
2. A dialog shows whether the script is complete or needs manual finishing (see below).
3. Click **Download .py** — the file saves as `<model-name>_simpy.py`.
4. Install SimPy if you haven't already:
   ```
   pip install simpy
   ```
5. Run the script:
   ```
   python your_model_simpy.py
   ```

---

## Category 1 — Complete scripts

If your model uses only fully-supported macros the export dialog shows
**CATEGORY 1 — COMPLETE**. The script runs without any manual edits.

Supported (Category 1) macros: `ARRIVE`, `ASSIGN`, `COSEIZE`, `COMPLETE`,
`RELEASE`, `FILL`, `DRAIN`, `SPLIT`, `SET`, `SET_ATTR`, `COST`, `UNBATCH`.

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

Each stub includes a **Pattern** comment showing the idiomatic SimPy approach.

---

## Script structure

The generated script contains these sections, in order:

| Section | Description |
|---|---|
| Docstring | Model name, generation date, category, TODO list |
| Imports | `simpy`, `random`, `math`, `statistics`, `dataclasses` |
| Configuration | `MAX_SIM_TIME`, `WARMUP_PERIOD`, `REPLICATIONS`, `BASE_SEED` |
| Distribution samplers | `_exp`, `_uniform`, `_normal`, `_triangular`, `_fixed`, `_erlang`, `_lognormal` |
| State variables | Module-level Python variables from the model's State tab |
| Entity dataclasses | One `@dataclass` per customer entity type |
| Statistics collector | `Stats` class tracking served, reneged, and cost |
| Arrival processes | One generator per B-event with `ARRIVE` |
| Service processes | One monitor + service generator pair per C-event with `ASSIGN` or `COSEIZE` |
| Shift schedules | One process per server entity type with a shift schedule |
| TODO stubs | Annotated stubs for unimplemented macros (Category 2 only) |
| `run_replication(seed)` | Wires everything together; returns `{served, reneged, avg_sojourn, total_cost}` |
| `__main__` block | Runs all replications, prints per-rep results and a summary table |

---

## Configuration

Edit the constants near the top of the generated file:

```python
MAX_SIM_TIME   = 480   # minutes  ← change to match your study horizon
WARMUP_PERIOD  = 60    # minutes  ← statistics collected after this time
REPLICATIONS   = 10              ← number of independent replications
BASE_SEED      = 42              ← change for different random streams
```

These are initialised from the model's **Experiment Defaults** tab and can be
freely edited in the Python file.

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
try:
    yield env.timeout(service_time)
finally:
    for _req in [_req0, _req1]:
        try: _req.resource.release(_req)
        except: pass
```

---

## Tips

- **Seed control:** each replication uses `BASE_SEED + rep_index` so results are
  reproducible. Change `BASE_SEED` to explore different random streams.
- **Warmup:** entities that arrive during `WARMUP_PERIOD` are not counted in
  `stats.served`. Set `WARMUP_PERIOD = 0` to disable.
- **Multiple entity types:** the script generates one `@dataclass` per customer
  entity type. Server types become `simpy.Resource` instances.
- **Extending the script:** add `env.process(...)` calls at the bottom of
  `run_replication` to add your own custom processes.
