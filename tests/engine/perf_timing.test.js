import { describe, expect, it } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { createBenchmarkScenarios } from "./benchmark-scenarios.js";
import { runScenario } from "./perf_timing.js";
import { runToCompletionYielding } from "./__helpers__/runToCompletionYielding.js";

// The suite below now only runs the queue-growth scenario family, which is
// well under vitest's ~60s worker-heartbeat timeout — but still yields
// periodically via runToCompletionYielding (see that file for why), then
// hands the finished result to runScenario() via its `overrides.result`
// escape hatch so the computed summary shape is identical either way.
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

  // Only the queue-growth family (light/medium/heavy) — this test's job is
  // to prove that family's presence doesn't break the aggregated summary
  // shape (per its name), including the heavy scenario's cycle-cap-saturated
  // output. It previously looped over all 12 non-stress scenarios (~80s,
  // dominated by refugee-displacement-corridor's ~70-75s run) just to
  // re-derive the same shape guarantee; the other scenarios' correctness is
  // already covered, per-scenario, by determinism-parity.test.js's snapshot
  // assertions — this test only needs the shape to survive, not every
  // scenario re-run a second time.
  it("keeps the suite summary shape stable when queue-growth scenarios are present", { timeout: 60000 }, async () => {
    const scenarios = createBenchmarkScenarios({ includeStress: false })
      .filter(entry => entry.category === "queue-growth");
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
