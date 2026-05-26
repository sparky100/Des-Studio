import { describe, expect, it } from "vitest";
import { createBenchmarkScenarios } from "./benchmark-scenarios.js";
import { runScenario, runTimingSuite } from "./perf_timing.js";

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

  it("keeps the suite summary shape stable when queue-growth scenarios are present", () => {
    const summary = runTimingSuite([]);

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
