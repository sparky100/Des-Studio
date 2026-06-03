// tests/engine/perf_timing.js
// Usage:
//   node tests/engine/perf_timing.js
//   node tests/engine/perf_timing.js --stress
//   node tests/engine/perf_timing.js --json
//
// Extends the existing local timing harness instead of creating a second
// benchmark framework. Core scenarios stay lightweight; the large-queue stress
// case runs only when --stress is supplied.

import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildEngine } from "../../src/engine/index.js";
import { createBenchmarkScenarios } from "./benchmark-scenarios.js";

export function parseArgs(argv = []) {
  return {
    includeStress: argv.includes("--stress"),
    json: argv.includes("--json"),
  };
}

function maxQueueLength(runtimeMetrics = {}) {
  const perQueue = runtimeMetrics?.max_queue_length_by_queue;
  if (!perQueue || typeof perQueue !== "object") return 0;
  return Object.values(perQueue)
    .map(value => Number(value) || 0)
    .reduce((max, value) => Math.max(max, value), 0);
}

export function runScenario(scenario) {
  const t0 = performance.now();
  const result = buildEngine(
    scenario.model,
    scenario.seed,
    0,
    scenario.maxSimTime,
    null,
    scenario.maxCycles
  ).runAll();
  const wallClockMs = Math.max(0, Math.round(performance.now() - t0));
  const metrics = result.runtimeMetrics || {};
  const eventsProcessed = Number(metrics.events_processed) || 0;

  return {
    key: scenario.key,
    label: scenario.label,
    category: scenario.category,
    replications: scenario.replications || 1,
    wall_clock_ms: wallClockMs,
    events_processed: eventsProcessed,
    c_event_scans: Number(metrics.c_event_scans) || 0,
    max_queue_length: maxQueueLength(metrics),
    events_per_second: wallClockMs > 0
      ? Math.round((eventsProcessed / wallClockMs) * 1000)
      : 0,
    final_time: Number(result.finalTime) || 0,
    served: Number(result.summary?.served) || 0,
    total_entities: Number(result.summary?.total) || 0,
    max_future_event_list_size: Number(metrics.max_future_event_list_size) || 0,
  };
}

export function printHumanReport(results, { includeStress }) {
  console.log("simmodlr — Engine Benchmark Timing");
  console.log(`Run date: ${new Date().toISOString()}`);
  console.log(`Stress scenarios: ${includeStress ? "included" : "disabled (use --stress to include)"}`);
  console.log("");
  for (const row of results) {
    console.log(row.label);
    console.log(`  key:                    ${row.key}`);
    console.log(`  category:               ${row.category}`);
    console.log(`  replications:           ${row.replications}`);
    console.log(`  wall_clock_ms:          ${row.wall_clock_ms}`);
    console.log(`  events_processed:       ${row.events_processed}`);
    console.log(`  c_event_scans:          ${row.c_event_scans}`);
    console.log(`  max_queue_length:       ${row.max_queue_length}`);
    console.log(`  events_per_second:      ${row.events_per_second}`);
    console.log(`  final_time:             ${row.final_time}`);
    console.log(`  served:                 ${row.served}`);
    console.log(`  max_future_event_list:  ${row.max_future_event_list_size}`);
    console.log("");
  }
}

export function runTimingSuite(argv = []) {
  const options = parseArgs(argv);
  const scenarios = createBenchmarkScenarios({ includeStress: options.includeStress });
  const results = scenarios.map(runScenario);
  return {
    generated_at: new Date().toISOString(),
    include_stress: options.includeStress,
    scenario_count: results.length,
    scenarios: results,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const summary = runTimingSuite(process.argv.slice(2));

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHumanReport(summary.scenarios, options);
    console.log("JSON output available with --json");
  }
}
