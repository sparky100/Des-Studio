// tests/engine/perf_timing.js
// Usage: node tests/engine/perf_timing.js
//
// Measures engine throughput under baseline queueing profiles plus two Phase C
// stress profiles introduced for Sprint 72:
//   1. M/M/1  — single server, λ=0.9, μ=1.0, ρ=0.9
//   2. M/M/c  — two servers, λ=1.6, μ=1.0, ρ=0.8
//   3. Heavy  — single server, λ=0.5, μ=1.0, target N=20 000 customers
//   4. many-c-events-mostly-false — one active queue plus many false C-events
//   5. many-c-events-high-churn   — multiple active queues with frequent Phase C restarts
//
// Pass criteria: no assertion errors — this script reports envelope data only.
// Exit 0 always. Results are documented in docs/performance-envelope.md.

import { performance } from "node:perf_hooks";
import { buildEngine } from "../../src/engine/index.js";

function makeBaselineModel(lambda, mu, servers) {
  return {
    entityTypes: [
      { id: "et_cust", name: "Customer", role: "customer", count: 0, attrDefs: [] },
      { id: "et_srv", name: "Server", role: "server", count: servers, attrDefs: [] },
    ],
    stateVariables: [],
    bEvents: [
      {
        id: "b_arrive",
        name: "Arrival",
        scheduledTime: "0",
        effect: "ARRIVE(Customer)",
        schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: String(1 / lambda) } }],
      },
      {
        id: "b_complete",
        name: "Complete",
        scheduledTime: "9999",
        effect: "COMPLETE()",
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: "c_seize",
        name: "Seize",
        condition: "queue(Customer).length > 0 AND idle(Server).count > 0",
        effect: "ASSIGN(Customer, Server)",
        cSchedules: [
          { eventId: "b_complete", dist: "Exponential", distParams: { mean: String(1 / mu) }, useEntityCtx: true },
        ],
      },
    ],
    queues: [],
  };
}

function makeMostlyFalseCEventModel(decoyCount = 40) {
  const queues = [{ id: "q_primary", name: "Primary Queue", customerType: "Customer", discipline: "FIFO" }];
  const decoyQueues = Array.from({ length: decoyCount }, (_, idx) => ({
    id: `q_decoy_${idx + 1}`,
    name: `Decoy Queue ${idx + 1}`,
    customerType: "Customer",
    discipline: "FIFO",
  }));
  const cEvents = decoyQueues.map((queue, idx) => ({
    id: `c_decoy_${idx + 1}`,
    name: `Decoy ${idx + 1}`,
    priority: idx + 1,
    condition: `queue(${queue.name}).length > 0 AND idle(Server).count > 0`,
    effect: `ASSIGN(${queue.name}, Server)`,
    cSchedules: [{ eventId: "b_complete", dist: "Fixed", distParams: { value: "1.5" }, useEntityCtx: true }],
  }));

  cEvents.push({
    id: "c_primary",
    name: "Serve Primary",
    priority: decoyCount + 1,
    condition: "queue(Primary Queue).length > 0 AND idle(Server).count > 0",
    effect: "ASSIGN(Primary Queue, Server)",
    cSchedules: [{ eventId: "b_complete", dist: "Fixed", distParams: { value: "1.5" }, useEntityCtx: true }],
  });

  return {
    entityTypes: [
      { id: "et_cust", name: "Customer", role: "customer", count: 0, attrDefs: [] },
      { id: "et_srv", name: "Server", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [...queues, ...decoyQueues],
    bEvents: [
      {
        id: "b_arrive",
        name: "Arrival",
        scheduledTime: "0",
        effect: "ARRIVE(Customer, Primary Queue)",
        schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "1.4" } }],
      },
      {
        id: "b_complete",
        name: "Complete",
        scheduledTime: "9999",
        effect: "COMPLETE()",
        schedules: [],
      },
    ],
    cEvents,
  };
}

function makeHighChurnCEventModel(activeQueues = 12) {
  const queueDefs = Array.from({ length: activeQueues }, (_, idx) => ({
    id: `q_active_${idx + 1}`,
    name: `Active Queue ${idx + 1}`,
    customerType: idx % 2 === 0 ? "TypeA" : "TypeB",
    discipline: "FIFO",
  }));

  const arrivals = queueDefs.map((queue, idx) => ({
    id: `b_arrive_${idx + 1}`,
    name: `Arrival ${idx + 1}`,
    scheduledTime: String((idx % 3) * 0.1),
    effect: `ARRIVE(${queue.customerType}, ${queue.name})`,
    schedules: [{ eventId: `b_arrive_${idx + 1}`, dist: "Exponential", distParams: { mean: String(6 + (idx % 4)) } }],
  }));

  const cEvents = queueDefs.map((queue, idx) => ({
    id: `c_service_${idx + 1}`,
    name: `Serve ${queue.name}`,
    priority: idx + 1,
    condition: `queue(${queue.name}).length > 0 AND idle(Server).count > 0`,
    effect: `ASSIGN(${queue.name}, Server)`,
    cSchedules: [{ eventId: "b_complete", dist: "Fixed", distParams: { value: String(1 + (idx % 3) * 0.25) }, useEntityCtx: true }],
  }));

  return {
    entityTypes: [
      { id: "et_a", name: "TypeA", role: "customer", count: 0, attrDefs: [] },
      { id: "et_b", name: "TypeB", role: "customer", count: 0, attrDefs: [] },
      { id: "et_srv", name: "Server", role: "server", count: 2, attrDefs: [] },
    ],
    stateVariables: [],
    queues: queueDefs,
    bEvents: [
      ...arrivals,
      {
        id: "b_complete",
        name: "Complete",
        scheduledTime: "9999",
        effect: "COMPLETE()",
        schedules: [],
      },
    ],
    cEvents,
  };
}

function createCounters() {
  return {
    cEvalCount: 0,
    cTrueCount: 0,
    cFalseCount: 0,
    restartSkipCount: 0,
    phaseCPassTotal: 0,
    phaseCPassMax: 0,
    truncatedSteps: 0,
  };
}

function accumulateCycleMetrics(counters, cycleLog = []) {
  const passes = new Set();
  for (const entry of cycleLog) {
    if (entry?.cEval?.pass != null) {
      counters.cEvalCount++;
      passes.add(entry.cEval.pass);
      if (entry.cEval.conditionTrue) counters.cTrueCount++;
      else counters.cFalseCount++;
      if (entry.cEval.skippedBecause === "restart") counters.restartSkipCount++;
    }
    if (String(entry?.message || "").includes("Phase C truncated")) {
      counters.truncatedSteps++;
    }
  }
  counters.phaseCPassTotal += passes.size;
  counters.phaseCPassMax = Math.max(counters.phaseCPassMax, passes.size);
}

function bench({ key, label, model, targetCustomers, seed = 42, maxSteps = 500000 }) {
  const engine = buildEngine(model, seed, 0, null, null, maxSteps);
  const counters = createCounters();
  const t0 = performance.now();
  let steps = 0;
  let done = false;

  while (steps < maxSteps) {
    const result = engine.step();
    steps++;
    accumulateCycleMetrics(counters, result.cycleLog);
    if (result.done) {
      done = true;
      break;
    }
    if (steps % 100 === 0 && engine.getSnap().served >= targetCustomers) break;
  }

  const elapsed = Math.max((performance.now() - t0) / 1000, 0.0001);
  const served = engine.getSnap().served;
  const stepsPerSec = Math.round(steps / elapsed);
  const custsPerSec = Math.round(served / elapsed);
  const cEvalsPerSec = Math.round(counters.cEvalCount / elapsed);

  console.log(`${label}`);
  console.log(`  Customers served:  ${served}`);
  console.log(`  Steps executed:    ${steps}${done ? " (engine finished)" : ""}`);
  console.log(`  Wall time:         ${elapsed.toFixed(3)}s`);
  console.log(`  Throughput:        ${stepsPerSec.toLocaleString()} steps/sec`);
  console.log(`  Customer rate:     ${custsPerSec.toLocaleString()} customers/sec`);
  console.log(`  C-evals:           ${counters.cEvalCount.toLocaleString()} total  (${cEvalsPerSec.toLocaleString()}/sec)`);
  console.log(`  Phase C passes:    ${counters.phaseCPassTotal.toLocaleString()} total  (max ${counters.phaseCPassMax}/step)`);
  console.log(`  False / true:      ${counters.cFalseCount.toLocaleString()} false, ${counters.cTrueCount.toLocaleString()} true`);
  console.log(`  Restart skips:     ${counters.restartSkipCount.toLocaleString()}`);
  console.log(`  Truncations:       ${counters.truncatedSteps.toLocaleString()}`);
  console.log("");

  return {
    key,
    label,
    steps,
    served,
    elapsed,
    stepsPerSec,
    custsPerSec,
    cEvalsPerSec,
    ...counters,
  };
}

console.log("DES Studio — Engine Performance Timing");
console.log(`Node.js ${process.version}  ${new Date().toISOString()}`);
console.log("");

const results = [
  bench({
    key: "mm1-high-util",
    label: "M/M/1  λ=0.9 μ=1.0 ρ=0.9  (target 250 customers)",
    model: makeBaselineModel(0.9, 1.0, 1),
    targetCustomers: 250,
  }),
  bench({
    key: "mmc",
    label: "M/M/c  λ=1.6 μ=1.0 ρ=0.8  (target 250 customers)",
    model: makeBaselineModel(1.6, 1.0, 2),
    targetCustomers: 250,
  }),
  bench({
    key: "heavy-low-util",
    label: "Heavy  λ=0.5 μ=1.0 ρ=0.5  (target 1 000 customers)",
    model: makeBaselineModel(0.5, 1.0, 1),
    targetCustomers: 1000,
  }),
  bench({
    key: "many-c-events-mostly-false",
    label: "many-c-events-mostly-false  40 decoys + 1 active queue  (target 300 customers)",
    model: makeMostlyFalseCEventModel(40),
    targetCustomers: 300,
    maxSteps: 120000,
  }),
  bench({
    key: "many-c-events-high-churn",
    label: "many-c-events-high-churn  12 active queues, shared servers  (target 400 customers)",
    model: makeHighChurnCEventModel(12),
    targetCustomers: 400,
    maxSteps: 120000,
  }),
];

const minStepsPerSec = Math.min(...results.map(result => result.stepsPerSec));
const maxStepsPerSec = Math.max(...results.map(result => result.stepsPerSec));
const maxCEvalPerSec = Math.max(...results.map(result => result.cEvalsPerSec));
console.log(`Summary: ${minStepsPerSec.toLocaleString()}–${maxStepsPerSec.toLocaleString()} steps/sec across load profiles`);
console.log(`Peak Phase C evaluation rate: ${maxCEvalPerSec.toLocaleString()} C-evals/sec`);
console.log("See docs/performance-envelope.md for baseline values and regression thresholds.");

process.exit(0);
