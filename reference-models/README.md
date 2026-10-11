# Reference models

Full-size models with a recorded set of expected results. Their check runs a
model headless with the engine, using a fixed seed, replication count, run
length and warm-up, and compares the results with the recorded ones. Any change
in a count or an aggregated result shows up as a difference.

The check is **opt-in**. It is not part of `npm test`, `npm run test:all` or
the CI jobs that run on pushes and pull requests. Each model takes a minute or two
(multi-replication runs, one replication after another in a single thread).

## Models

| Folder | Model | Scenarios | Settings | Docs |
|---|---|---|---|---|
| [`world-oil-network/`](world-oil-network/) | World Oil Network: tanker fleet and storage (Flow schema v2.8.0) | `baseline` (no overrides), `closure` (`stateVariables.closureEnabled.initialValue = 1`, Hormuz closed days 100–130) | seed 492153378, 10 replications, 300 days, warm-up 60 | [`oil-network-fleet-model.md`](world-oil-network/oil-network-fleet-model.md) |

The oil network model covers most of the engine's newer features in one model:
`COSEIZE` / `RELEASE_COSEIZED`, carried server claims, `turnaroundDist`,
`quantityAttr`, `ASSIGN … SCAN` with skills, `DRAIN_PARTIAL`, state variables
on condition right-hand sides, `balkCondition`, routing on attributes, and
container results. See §19 of its docs for the full feature map.

## Running the check

```bash
npm run test:reference                                   # every reference model
npm run test:reference -- --model world-oil-network      # one model (folder name)
npm run test:reference -- --verbose                      # also list every compared value
```

The script (`scripts/reference-check.mjs`, run with `vite-node`):

1. Loads the model file the way the app imports a file, and applies each
   scenario's `parameterOverrides` the way the Run tab does.
2. Runs the replications through the same batch path as the app
   (`runReplications` → `makeBatchResult` / `makeBatchRuntimeMetrics` →
   goal outcomes), with chart data on.
3. Compares the results with the expected file using its `comparisonRules`:
   - **exact**: runtime counts (`events_processed`, `c_event_scans`,
     `c_events_fired`, `entities_created`, `entities_completed`),
     `summary.total` / `served` / `balked`, `activityCounts`,
     `maxQueueLength`, every per-replication array, and booleans such as
     `goalOutcomes[].met`;
   - **float**: every other number, within `1e-6 × max(1, |expected|)`;
   - **performance**: wall clock and µs/event are printed but never fail the
     check. They are only comparable with earlier runs of the script on the
     same machine, not with the in-app figures in the expected file (the app
     runs replications on parallel workers).

On a mismatch it prints `metric · expected · actual · delta · rule` for each
value that differs and exits with code 1. If a scenario fails to run, or hits a
cycle or scan limit, it exits with code 2. Keys that appear only on one side
(for example a new queue in `maxQueueLength`) count as mismatches.

## When to run it

- Before a release.
- For engine changes that touch scheduling, C-event scanning, resource and
  claim handling (seize, release, `COSEIZE`, carried claims), turnaround,
  quantities (`quantityAttr`, `FILL`, `DRAIN_PARTIAL`), routing, containers or
  results aggregation (`makeBatchResult`, summary statistics, goal outcomes).
- On demand in CI: the **Reference models** workflow
  (`.github/workflows/reference-models.yml`) runs weekly and can be started by
  hand from the Actions tab (*Run workflow*). It does not run on pushes or pull
  requests.

## Intentional result changes

If a change is meant to alter results (an engine fix, or a change to the model):

```bash
npm run test:reference -- --update                       # all models
npm run test:reference -- --update --model world-oil-network
```

`--update` runs every scenario, rewrites the expected file with the fresh
results (keeping its settings, comparison rules and overrides), and prints each
value that changed. If nothing changed, the file is left alone. Commit the new
expected file in the same commit as the change that caused it, and say why in
the commit message. Never use `--update` just to make a failing check pass
without understanding the difference.

## Adding a reference model

1. Create a folder here with the model JSON (as exported or imported by the
   app), its documentation, and a `reference.json` manifest:

   ```json
   {
     "id": "my-model",
     "title": "My model",
     "model": "my-model.json",
     "expected": "my-model-expected.json",
     "docs": "my-model.md"
   }
   ```

2. Write a starting expected file with `settings` (`seed`, `replications`,
   `maxSimTime`, `warmupPeriod`) and one entry under `scenarios` per scenario,
   each with its `parameterOverrides` (`[{ "path": …, "value": … }]`, paths as
   in the app's parameter list). Copy the `comparisonRules` block from an
   existing file.
3. Run `npm run test:reference -- --update --model my-model` to fill in the
   results, check them against a run in the app, and add a row to the table
   above.
