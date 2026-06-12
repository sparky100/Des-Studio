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
    test(`${scenario.key} (seed=${scenario.seed})`, { timeout: 120000 }, () => {
      const engine = buildEngine(
        scenario.model,
        scenario.seed,
        0,                    // warmupPeriod
        scenario.maxSimTime,
        null,                 // terminationCondition
        scenario.maxCycles,
      );
      const result = engine.runAll();
      expect(loadBearingFields(result)).toMatchSnapshot();
    });
  }

  test('back-to-back runs of the same scenario are bit-identical', () => {
    const scenario = createBenchmarkScenarios()[0];
    const run = () => loadBearingFields(
      buildEngine(scenario.model, scenario.seed, 0, scenario.maxSimTime, null, scenario.maxCycles).runAll()
    );
    expect(run()).toEqual(run());
  });
});
