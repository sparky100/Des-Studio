import { describe, expect, it } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { createBenchmarkScenarios } from "./benchmark-scenarios.js";
import { runScenario } from "./perf_timing.js";

// Same rationale as tests/engine/determinism-parity.test.js's
// runToCompletionYielding: vitest's worker RPC layer enforces a hard,
// non-configurable ~60s heartbeat timeout that a fully-synchronous run can
// trip, crashing the whole `vitest run` even though the test itself would
// pass. The full (non-stress) scenario set here includes
// refugee-displacement-corridor, which alone runs ~70-75s — so running the
// suite via runTimingSuite()'s normal buildEngine(...).runAll() path isn't
// safe inside a vitest test. Step manually with periodic yields instead,
// then hand the finished result to runScenario() via its `overrides.result`
// escape hatch so the computed summary shape is identical either way.
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

async function runScenarioYielding(scenario) {
  const engine = buildEngine(scenario.model, scenario.seed, 0, scenario.maxSimTime, null, scenario.maxCycles);
  const result = await runToCompletionYielding(engine);
  return runScenario(scenario, { result });
}

describe("perf_timing runner", () => {
  it("includes the queue-depth scaling scenario family in the local timing suite", () => {
    const scenarios = createBenchmarkScenarios();
    const keys = scenarios
      .filter(entry => entry.category === "queue-growth")
      .map(entry => entry.key);

    expect(keys).toEqual([
      "queue-depth-scaling-light",
      "queue-depth-scaling-medium",
      "queue-depth-scaling-heavy",
    ]);
  });

  it("returns the existing output shape for a queue-depth scaling run", () => {
    const scenario = createBenchmarkScenarios().find(entry => entry.key === "queue-depth-scaling-light");
    const result = runScenario(scenario);

    expect(result).toEqual(expect.objectContaining({
      key: "queue-depth-scaling-light",
      label: expect.any(String),
      category: "queue-growth",
      replications: 1,
      wall_clock_ms: expect.any(Number),
      events_processed: expect.any(Number),
      c_event_scans: expect.any(Number),
      max_queue_length: expect.any(Number),
      events_per_second: expect.any(Number),
      final_time: expect.any(Number),
      served: expect.any(Number),
      total_entities: expect.any(Number),
      max_future_event_list_size: expect.any(Number),
    }));
  });

  it("keeps the suite summary shape stable when queue-growth scenarios are present", { timeout: 240000 }, async () => {
    const scenarios = createBenchmarkScenarios({ includeStress: false });
    const results = [];
    for (const scenario of scenarios) {
      results.push(await runScenarioYielding(scenario));
    }
    const summary = {
      generated_at: new Date().toISOString(),
      include_stress: false,
      scenario_count: results.length,
      scenarios: results,
    };

    expect(summary).toEqual(expect.objectContaining({
      generated_at: expect.any(String),
      include_stress: false,
      scenario_count: expect.any(Number),
      scenarios: expect.any(Array),
    }));
    expect(summary.scenarios.some(entry => entry.key === "queue-depth-scaling-heavy")).toBe(true);
    expect(summary.scenario_count).toBe(summary.scenarios.length);
  });
});
