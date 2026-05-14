// tests/engine/perf_timing.js
// Usage: node tests/engine/perf_timing.js
//
// Measures engine throughput (steps/sec, customers/sec) under three load profiles:
//   1. M/M/1  — single server, λ=0.9,  μ=1.0, ρ=0.9  (high utilisation)
//   2. M/M/c  — two servers, λ=1.6,  μ=1.0, ρ=0.8  (multi-server)
//   3. Heavy  — single server, λ=0.5,  μ=1.0, ρ=0.5  (target N=20 000 customers)
//
// Pass criteria: no assertion errors — this script reports envelope data only.
// Exit 0 always. Results are documented in docs/performance-envelope.md.

import { buildEngine } from '../../src/engine/index.js';

function makeModel(lambda, mu, servers) {
  return {
    entityTypes: [
      { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_srv',  name: 'Server',   role: 'server',   count: servers, attrDefs: [] },
    ],
    stateVariables: [],
    bEvents: [
      {
        id: 'b_arrive', name: 'Arrival', scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: String(1 / lambda) } }],
      },
      {
        id: 'b_complete', name: 'Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'c_seize', name: 'Seize',
        condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [
          { eventId: 'b_complete', dist: 'Exponential', distParams: { mean: String(1 / mu) }, useEntityCtx: true },
        ],
      },
    ],
    queues: [],
  };
}

function bench(label, model, targetCustomers, seed = 42) {
  const engine = buildEngine(model, seed, 999999);
  const t0 = performance.now();
  let steps = 0;
  const MAX_STEPS = 500000;

  while (steps < MAX_STEPS) {
    const { done } = engine.step();
    steps++;
    if (done) break;
    if (steps % 100 === 0 && engine.getSnap().served >= targetCustomers) break;
  }

  const elapsed = (performance.now() - t0) / 1000; // seconds
  const served = engine.getSnap().served;
  const stepsPerSec = Math.round(steps / elapsed);
  const custsPerSec = Math.round(served / elapsed);

  console.log(`${label}`);
  console.log(`  Customers served:  ${served}`);
  console.log(`  Steps executed:    ${steps}`);
  console.log(`  Wall time:         ${elapsed.toFixed(3)}s`);
  console.log(`  Throughput:        ${stepsPerSec.toLocaleString()} steps/sec`);
  console.log(`  Customer rate:     ${custsPerSec.toLocaleString()} customers/sec`);
  console.log('');

  return { label, steps, served, elapsed, stepsPerSec, custsPerSec };
}

console.log('DES Studio — Engine Performance Timing');
console.log(`Node.js ${process.version}  ${new Date().toISOString()}`);
console.log('');

const results = [
  bench('M/M/1  λ=0.9 μ=1.0 ρ=0.9  (target 5 000 customers)',  makeModel(0.9, 1.0, 1), 5000),
  bench('M/M/c  λ=1.6 μ=1.0 ρ=0.8  (target 5 000 customers)',  makeModel(1.6, 1.0, 2), 5000),
  bench('Heavy  λ=0.5 μ=1.0 ρ=0.5  (target 20 000 customers)', makeModel(0.5, 1.0, 1), 20000),
];

const minStepsPerSec = Math.min(...results.map(r => r.stepsPerSec));
const maxStepsPerSec = Math.max(...results.map(r => r.stepsPerSec));
console.log(`Summary: ${minStepsPerSec.toLocaleString()}–${maxStepsPerSec.toLocaleString()} steps/sec across load profiles`);
console.log('See docs/performance-envelope.md for baseline values and regression thresholds.');

process.exit(0);
