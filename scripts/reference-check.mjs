// scripts/reference-check.mjs — opt-in reference-model check.
//
//   npm run test:reference                       check every model in reference-models/
//   npm run test:reference -- --model world-oil-network
//   npm run test:reference -- --update           regenerate the expected file(s) from a fresh run
//   npm run test:reference -- --verbose          list every compared value, not just mismatches
//
// Not part of `npm test`, pre-commit or the per-PR CI job: it runs full
// multi-replication simulations (~10–30 s per scenario). See
// reference-models/README.md for when to run it.
//
// Each reference model folder holds a reference.json manifest naming the model
// file and the expected-results file. The model is loaded the way the app
// imports a file (extractImportedModelPayload), parameter overrides are applied
// the way the Run tab applies them (applySweepValues), and replications run
// through the same runReplications → makeBatchResult → makeBatchRuntimeMetrics
// → buildGoalOutcomes path as a batch run in the app (in-process: Node has no
// Web Worker, so runReplications uses its inline worker).
//
// Comparison rules (from the expected file's comparisonRules):
//   exact  runtime counts, summary.total/served/balked, activityCounts,
//          maxQueueLength, per-replication arrays, booleans and strings
//   float  every other number: |actual − expected| <= 1e-6 · max(1, |expected|)
//   perf   wall-clock and µs/event: reported, never fail
//
// Exit codes: 0 pass, 1 result mismatch, 2 the run itself failed or was truncated.
//
// Run with vite-node (not plain node): some src/ modules use extensionless
// imports that only Vite's resolver understands.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import { runReplications } from "../src/engine/replication-runner.js";
import { summarizeReplicationResults } from "../src/engine/statistics.js";
import { enumerateSweepableParams, applySweepValues } from "../src/engine/sweep-params.js";
import { extractImportedModelPayload } from "../src/ui/shared/utils.js";
import {
  CI_METRICS,
  makeBatchResult,
  makeBatchRuntimeMetrics,
  makeTimeSeriesAccumulator,
  TIME_SERIES_GRID_POINTS,
  buildGoalOutcomes,
} from "../src/ui/execute/executeHelpers.js";
import { buildGoalGapsFromResults } from "../src/llm/prompts.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE_DIR = join(ROOT, "reference-models");
const FLOAT_TOLERANCE = 1e-6;
// Generous safety valves: the reference runs must not hit them. If one does,
// the run is reported as failed rather than compared (a truncated run would
// differ for a reason that has nothing to do with the engine's results).
const MAX_CYCLES = 5_000_000;
const MAX_C_PASSES = 5000;

// ── CLI ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2).filter(a => a !== "--");
const args = {
  update: argv.includes("--update"),
  verbose: argv.includes("--verbose"),
  model: (() => {
    const i = argv.indexOf("--model");
    return i >= 0 ? argv[i + 1] : null;
  })(),
};
const unknown = argv.filter((a, i) => a.startsWith("--") && !["--update", "--verbose", "--model"].includes(a) && argv[i - 1] !== "--model");
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(", ")}`);
  process.exit(2);
}

// ── Running a scenario ─────────────────────────────────────────────────────

function applyOverrides(model, overrides = []) {
  if (!overrides.length) return model;
  const params = enumerateSweepableParams(model);
  const configs = overrides.map(({ path, value }) => {
    const paramConfig = params.find(p => p.path === path);
    if (!paramConfig) throw new Error(`Parameter override path not found in model: ${path}`);
    return { paramConfig, value };
  });
  return applySweepValues(model, configs);
}

function runBatch(model, settings) {
  const { seed, replications, maxSimTime, warmupPeriod } = settings;
  const tsAccumulator = makeTimeSeriesAccumulator(TIME_SERIES_GRID_POINTS, maxSimTime);
  return new Promise((resolvePromise, reject) => {
    const started = performance.now();
    runReplications({
      model,
      replications,
      baseSeed: seed,
      warmupPeriod,
      maxSimTime,
      terminationCondition: null,
      maxCycles: MAX_CYCLES,
      maxCPasses: MAX_C_PASSES,
      maxCEventScans: null,
      // Same chart-data settings as a batch run in the app with charts on.
      collectTimeSeries: true,
      timeSeriesGridPoints: TIME_SERIES_GRID_POINTS,
      onTimeSeriesSample: ts => tsAccumulator.addSeries(ts),
      workerCount: 1,
      onError: error => reject(new Error(`Replication ${error?.replicationIndex} failed: ${error?.message}`)),
      onComplete: payloads => {
        const wallClockMs = Math.round(performance.now() - started);
        const ordered = payloads.filter(Boolean);
        const stats = summarizeReplicationResults(ordered, CI_METRICS);
        const result = {
          ...makeBatchResult(ordered, stats, maxSimTime, warmupPeriod, tsAccumulator.getResult()),
          runtimeMetrics: makeBatchRuntimeMetrics(ordered, replications, wallClockMs),
          aggregateStats: stats,
        };
        result.goalOutcomes = buildGoalOutcomes(buildGoalGapsFromResults(model, result));
        resolvePromise({ result, replications: ordered, wallClockMs });
      },
    });
  });
}

function truncationProblems(result, replications) {
  const problems = [];
  if (result.summary?.phaseCTruncated || result.phaseCTruncated) problems.push("Phase C truncated");
  if (result.cycleLimitReached || result.summary?.cycleLimitReached) problems.push("cycle limit reached");
  if (result.scanLimitReached || result.summary?.scanLimitReached) problems.push("C-event scan limit reached");
  replications.forEach(r => {
    if (r.result?.cycleLimitReached) problems.push(`replication ${r.replicationIndex + 1}: cycle limit reached`);
  });
  return problems;
}

// ── Extracting the compared metrics (same shape as the expected file) ─────

const round1 = v => Math.round(v * 10) / 10;
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] != null).map(k => [k, obj[k]]));

function extractScenario({ result, replications, wallClockMs }, overrides, previous) {
  const s = result.summary || {};
  const rt = result.runtimeMetrics || {};
  const repSummaries = replications.map(r => r.result?.summary || {});
  const containerIds = Object.keys(s.containerLevels || {});
  // Keep the unmet-container selection of the existing file; otherwise every
  // container whose id says it is a shortfall tally.
  const unmetIds = previous?.unmetFinalByReplication
    ? Object.keys(previous.unmetFinalByReplication)
    : containerIds.filter(id => /unmet/i.test(id));

  return {
    parameterOverrides: overrides,
    runtime: {
      replications: rt.replications,
      events_processed: rt.events_processed,
      c_event_scans: rt.c_event_scans,
      c_events_fired: rt.c_events_fired,
      entities_created: rt.entities_created,
      entities_completed: rt.entities_completed,
      wall_clock_ms_observed: wallClockMs,
      us_per_event_observed: rt.events_processed ? round1((wallClockMs * 1000) / rt.events_processed) : null,
    },
    summary: pick(s, ["total", "served", "servedRatio", "servedQuantity", "balked", "balkedQuantity", "quantityInSystem", "avgWait"]),
    containers: Object.fromEntries(containerIds.map(id => [
      id, pick(s.containerLevels[id], ["min", "max", "avg", "final", "lowestMin", "highestMax"]),
    ])),
    unmetFinalByReplication: Object.fromEntries(unmetIds.map(id => [
      id, repSummaries.map(rs => rs.containerLevels?.[id]?.final ?? null),
    ])),
    balkedQuantityByReplication: repSummaries.map(rs => rs.balkedQuantity ?? null),
    servedQuantityByReplication: repSummaries.map(rs => rs.servedQuantity ?? null),
    maxQueueLength: { ...(rt.max_queue_length_by_queue || {}) },
    resources: Object.fromEntries(Object.entries(s.perResource || {}).map(([name, r]) => [
      name, pick(r, ["utilisation", "busyUtilisation", "turnaroundFraction", "quantityProcessed"]),
    ])),
    outcomes: Object.fromEntries(Object.entries(s.outcomes || {}).map(([key, o]) => [key, pick(o, ["count", "quantity"])])),
    goalOutcomes: (result.goalOutcomes || []).map(g => pick(g, ["label", "current", "target", "met"])),
    activityCounts: Object.fromEntries(Object.entries(s.activityCounts || {}).map(([id, a]) => [id, a?.count ?? a])),
  };
}

// ── Comparison ─────────────────────────────────────────────────────────────

const PERF_PATHS = new Set(["runtime.wall_clock_ms_observed", "runtime.us_per_event_observed"]);
const EXACT_PATTERNS = [
  /^runtime\./,
  /^summary\.(total|served|balked)$/,
  /^activityCounts\./,
  /^maxQueueLength\./,
  /^unmetFinalByReplication\./,
  /ByReplication(\.|\[|$)/,
  /^parameterOverrides/,
];

function ruleFor(path, expected, actual) {
  if (PERF_PATHS.has(path)) return "perf";
  if (typeof expected !== "number" || typeof actual !== "number") return "exact";
  return EXACT_PATTERNS.some(re => re.test(path)) ? "exact" : "float";
}

// Goal outcomes are matched by label, not array position.
function keyedGoals(goals) {
  return Array.isArray(goals) ? Object.fromEntries(goals.map((g, i) => [g?.label ?? `#${i}`, g])) : goals;
}

function compare(expected, actual, path = "", rows = []) {
  if (path === "goalOutcomes") {
    expected = keyedGoals(expected);
    actual = keyedGoals(actual);
  }
  const isObj = v => v !== null && typeof v === "object";
  if (isObj(expected) && isObj(actual) && Array.isArray(expected) === Array.isArray(actual)) {
    const keys = Array.isArray(expected)
      ? [...Array(Math.max(expected.length, actual.length)).keys()]
      : [...new Set([...Object.keys(expected), ...Object.keys(actual)])];
    for (const k of keys) {
      const childPath = Array.isArray(expected) ? `${path}[${k}]` : path ? `${path}.${k}` : String(k);
      compare(expected[k], actual[k], childPath, rows);
    }
    return rows;
  }
  const rule = ruleFor(path, expected, actual);
  let ok;
  let delta = null;
  if (expected === undefined || actual === undefined) {
    ok = rule === "perf";
  } else if (rule === "perf") {
    ok = true;
    if (typeof expected === "number" && typeof actual === "number") delta = actual - expected;
  } else if (rule === "float") {
    delta = actual - expected;
    ok = Math.abs(delta) <= FLOAT_TOLERANCE * Math.max(1, Math.abs(expected));
  } else {
    if (typeof expected === "number" && typeof actual === "number") delta = actual - expected;
    ok = isObj(expected) || isObj(actual) ? JSON.stringify(expected) === JSON.stringify(actual) : expected === actual;
  }
  rows.push({ path, expected, actual, delta, rule, ok });
  return rows;
}

// ── Reporting ──────────────────────────────────────────────────────────────

const fmt = v => {
  if (v === undefined) return "(missing)";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(+v.toPrecision(12));
  return JSON.stringify(v);
};

function printTable(rows) {
  const header = ["metric", "expected", "actual", "delta", "rule"];
  const body = rows.map(r => [r.path, fmt(r.expected), fmt(r.actual), r.delta == null ? "" : fmt(r.delta), r.rule]);
  const widths = header.map((h, i) => Math.min(70, Math.max(h.length, ...body.map(b => b[i].length))));
  const line = cells => "  " + cells.map((c, i) => c.length > widths[i] ? c.slice(0, widths[i] - 1) + "…" : c.padEnd(widths[i])).join("  ");
  console.log(line(header));
  console.log(line(widths.map(w => "-".repeat(w))));
  body.forEach(b => console.log(line(b)));
}

function perfLine(name, rows, recordedUs) {
  const wall = rows.find(r => r.path === "runtime.wall_clock_ms_observed")?.actual;
  const us = rows.find(r => r.path === "runtime.us_per_event_observed")?.actual;
  const ratio = recordedUs ? us / recordedUs : null;
  const note = ratio != null && ratio > 1.5 ? "  (over 1.5× the recorded value)" : "";
  return `  ${name}: ${wall} ms wall clock, ${us} µs/event` +
    (recordedUs ? ` (recorded: ${recordedUs} µs/event, ×${ratio.toFixed(2)})` : "") + note;
}

// ── Main ───────────────────────────────────────────────────────────────────

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

function listReferenceModels() {
  return readdirSync(REFERENCE_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(REFERENCE_DIR, d.name, "reference.json")))
    .map(d => {
      const dir = join(REFERENCE_DIR, d.name);
      return { dir, folder: d.name, ...JSON.parse(readFileSync(join(dir, "reference.json"), "utf8")) };
    });
}

async function checkModel(ref) {
  const modelFile = join(ref.dir, ref.model);
  const expectedFile = join(ref.dir, ref.expected);
  const baseModel = extractImportedModelPayload(JSON.parse(readFileSync(modelFile, "utf8")));
  const expectedDoc = JSON.parse(readFileSync(expectedFile, "utf8"));
  const settings = expectedDoc.settings;

  console.log(`\n▶ ${ref.title || ref.id}  (${ref.folder}/${ref.model})`);
  console.log(`  seed ${settings.seed}, ${settings.replications} replications, ${settings.maxSimTime} time units, warm-up ${settings.warmupPeriod}`);

  let failures = 0;
  let runErrors = 0;
  const fresh = {};
  const perf = [];
  const changes = [];

  for (const [name, scenario] of Object.entries(expectedDoc.scenarios)) {
    process.stdout.write(`  running ${name}… `);
    let run;
    try {
      run = await runBatch(applyOverrides(baseModel, scenario.parameterOverrides || []), settings);
    } catch (error) {
      console.log("ERROR");
      console.error(`  ${error.message}`);
      runErrors++;
      continue;
    }
    console.log(`${run.wallClockMs} ms`);
    const problems = truncationProblems(run.result, run.replications);
    if (problems.length) {
      console.error(`  ✗ ${name}: run did not complete normally — ${problems.join("; ")}`);
      runErrors++;
      continue;
    }
    const actual = extractScenario(run, scenario.parameterOverrides || [], scenario);
    fresh[name] = actual;
    const rows = compare(scenario, actual);
    const bad = rows.filter(r => !r.ok);
    perf.push(perfLine(name, rows, scenario.runtime?.us_per_event_observed));

    if (args.update) {
      changes.push(...rows.filter(r => !r.ok).map(r => ({ ...r, path: `${name}.${r.path}` })));
      continue;
    }
    const compared = rows.filter(r => r.rule !== "perf");
    if (bad.length) {
      failures += bad.length;
      console.log(`  ✗ ${name}: ${bad.length} of ${compared.length} values differ`);
      printTable(bad);
    } else {
      console.log(`  ✓ ${name}: all ${compared.length} values match (${compared.filter(r => r.rule === "exact").length} exact, ${compared.filter(r => r.rule === "float").length} within ${FLOAT_TOLERANCE} relative)`);
    }
    if (args.verbose) printTable(rows);
  }

  console.log("\n  Performance (informational, never fails). Replications run one after another in a");
  console.log("  single thread here; the app runs them on parallel workers, so wall clock and µs/event");
  console.log("  are only comparable with earlier runs of this script on the same machine.");
  perf.forEach(line => console.log(line));

  if (args.update) {
    if (runErrors) {
      console.error("\n  Not updating: a scenario failed to run.");
      return { failures: 0, runErrors };
    }
    if (!changes.length) {
      console.log("\n  No result changes; expected file left as is.");
      return { failures: 0, runErrors: 0 };
    }
    const updated = {
      ...expectedDoc,
      createdFrom: [`npm run test:reference -- --update (${new Date().toISOString().slice(0, 10)}, git ${gitSha()})`],
      scenarios: Object.fromEntries(Object.keys(expectedDoc.scenarios).map(name => [name, fresh[name]])),
    };
    writeFileSync(expectedFile, JSON.stringify(updated, null, 1) + "\n");
    console.log(`\n  Updated ${ref.folder}/${ref.expected}. ${changes.length} value(s) changed:`);
    printTable(changes);
    console.log("\n  Commit the new file together with the change that caused it, and say why in the commit message.");
    return { failures: 0, runErrors: 0 };
  }

  return { failures, runErrors };
}

async function main() {
  let refs = listReferenceModels();
  if (args.model) refs = refs.filter(r => r.folder === args.model || r.id === args.model);
  if (!refs.length) {
    console.error(args.model ? `No reference model "${args.model}" in reference-models/` : "No reference models found.");
    process.exit(2);
  }
  console.log(`Reference check${args.update ? " (--update: regenerating expected results)" : ""} — engine at git ${gitSha()}`);

  let failures = 0;
  let runErrors = 0;
  for (const ref of refs) {
    const r = await checkModel(ref);
    failures += r.failures;
    runErrors += r.runErrors;
  }

  if (runErrors) {
    console.error(`\nFAILED: ${runErrors} scenario(s) could not be run to completion.`);
    process.exit(2);
  }
  if (failures) {
    console.error(`\nFAILED: ${failures} value(s) differ from the expected results.`);
    console.error("If the change is intentional, regenerate with `npm run test:reference -- --update` and commit the new expected file with the change.");
    process.exit(1);
  }
  console.log(args.update ? "\nDone." : "\nPASSED: all reference results match.");
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exit(2);
});
