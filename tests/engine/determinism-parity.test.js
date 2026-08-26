// tests/engine/determinism-parity.test.js
//
// Determinism gate for engine performance work. Snapshots the load-bearing
// summary statistics of every benchmark scenario at fixed seeds. Any engine
// optimisation (trace suppression, FEL data structure, payload compaction,
// model caching) must leave these snapshots byte-identical — a changed
// snapshot means the optimisation altered simulation behaviour, not just speed.
//
// If a snapshot legitimately needs to change (an intentional semantic fix),
// regenerate with `vitest run -u` and call the change out in the PR.

import { describe, expect, test } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { createBenchmarkScenarios } from './benchmark-scenarios.js';

// Vitest's worker RPC layer (birpc) enforces a hard, non-configurable 60s
// timeout on its internal onTaskUpdate heartbeat calls between the worker
// process and the main orchestrator — a literal `DEFAULT_TIMEOUT = 6e4`
// constant, present unchanged in both vitest 3.2.7 and the latest 4.x
// (checked both sources directly; not a version-specific bug, and there is
// no vitest config that raises it). The refugee-displacement-corridor
// scenario below runs engine.runAll() synchronously for ~70-75s, which
// blocks the worker's event loop past that window; when the loop frees up,
// the overdue heartbeat fires and crashes the whole `vitest run`, even
// though the test itself already passed — confirmed this is unrelated to
// (and not fixable by) the test's own `timeout` option, which governs a
// different timeout entirely. A process-level `unhandledRejection` guard
// was tried and does not work: vitest's own handler in the main process
// reacts to the same rejection independently of anything registered here.
//
// The actual fix: yield to the event loop periodically during the run, so
// the heartbeat can always be serviced. runAll() (src/engine/index.js)
// can't be made async without breaking every other synchronous caller in
// the app, so this reimplements its outer loop locally using only its
// already-public API. This is provably equivalent to runAll() for every
// scenario this file exercises: none of tests/engine/benchmark-scenarios.js
// configures purge (grepped), and outside of purge handling, step() already
// self-terminates internally on FEL-empty, maxSimTime reached, maxCycles
// reached, and termination-condition-met — runAll()'s own outer-loop guard
// conditions are a redundant early exit in that case, not additional logic.
// buildResult() is the exact same function runAll() itself calls to build
// its return value.
async function runToCompletionYielding(engine, yieldEveryCycles = 500) {
  let cycles = 0;
  while (true) {
    const r = engine.step({ captureSnap: false });
    if (r.done) break;
    cycles++;
    if (cycles % yieldEveryCycles === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  return engine.buildResult();
}

function loadBearingFields(result) {
  const s = result.summary || {};
  const m = result.runtimeMetrics || {};
  return {
    finalTime: result.finalTime,
    served: s.served,
    total: s.total,
    reneged: s.reneged,
    avgWait: s.avgWait,
    avgSvc: s.avgSvc,
    avgSojourn: s.avgSojourn,
    avgWIP: s.avgWIP,
    events_processed: m.events_processed,
    c_event_scans: m.c_event_scans,
    c_events_fired: m.c_events_fired,
    entities_created: m.entities_created,
    max_future_event_list_size: m.max_future_event_list_size,
  };
}

describe('determinism parity — fixed-seed benchmark scenarios', () => {
  const scenarios = createBenchmarkScenarios({ includeStress: true });

  for (const scenario of scenarios) {
    test(`${scenario.key} (seed=${scenario.seed})`, { timeout: 240000 }, async () => {
      const engine = buildEngine(
        scenario.model,
        scenario.seed,
        0,                    // warmupPeriod
        scenario.maxSimTime,
        null,                 // terminationCondition
        scenario.maxCycles,
      );
      const result = await runToCompletionYielding(engine);
      expect(loadBearingFields(result)).toMatchSnapshot();
    });
  }

  test('back-to-back runs of the same scenario are bit-identical', async () => {
    const scenario = createBenchmarkScenarios()[0];
    const run = async () => loadBearingFields(
      await runToCompletionYielding(
        buildEngine(scenario.model, scenario.seed, 0, scenario.maxSimTime, null, scenario.maxCycles)
      )
    );
    expect(await run()).toEqual(await run());
  });
});
