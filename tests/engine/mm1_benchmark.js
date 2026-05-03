// tests/engine/mm1_benchmark.js
// Usage: node tests/engine/mm1_benchmark.js
// Pass criteria: simulated mean queue wait within 5% of M/M/1 analytical value (9.0)
//
// M/M/1 parameters: λ=0.9, μ=1.0, ρ=0.9
// Analytical mean wait in queue: Wq = ρ / (μ(1-ρ)) = 0.9 / (1.0 × 0.1) = 9.0 time units
//
// Design notes:
//   N_SERVED = 500  — engine accumulates per-step snapshots in its log, bounding feasible N
//   N_WARMUP = 200  — discards initial transient; at ρ=0.9 the queue build-up phase is long
//                     and biases the raw mean significantly downward without a warm-up cutoff
//   Fixed seed 42   — makes the result perfectly reproducible; same seed always exits 0

import { buildEngine } from '../../src/engine/index.js';

const LAMBDA               = 0.9;
const MU                   = 1.0;
const RHO                  = LAMBDA / MU;
const ANALYTICAL_MEAN_WAIT = RHO / (MU * (1 - RHO));  // 9.0
const N_SERVED             = 500;
const N_WARMUP             = 200;
const TOLERANCE            = 0.05;
const SEED                 = 42;

const model = {
  entityTypes: [
    { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_srv',  name: 'Server',   role: 'server',   count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id:            'b_arrive',
      name:          'Arrival',
      scheduledTime: '0',
      effect:        'ARRIVE(Customer)',
      schedules: [
        {
          eventId:    'b_arrive',
          dist:       'Exponential',
          distParams: { mean: String(1 / LAMBDA) },
        },
      ],
    },
    {
      // scheduledTime >= 900 keeps this out of the initial FEL;
      // it is only scheduled dynamically from the Seize C-event.
      id:            'b_complete',
      name:          'Complete',
      scheduledTime: '9999',
      effect:        'COMPLETE()',
      schedules:     [],
    },
  ],
  cEvents: [
    {
      id:        'c_seize',
      name:      'Seize',
      condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
      effect:    'ASSIGN(Customer, Server)',
      cSchedules: [
        {
          eventId:      'b_complete',
          dist:         'Exponential',
          distParams:   { mean: String(1 / MU) },
          useEntityCtx: true,
        },
      ],
    },
  ],
};

const engine = buildEngine(model, SEED, 999999);

let steps = 0;
const MAX_STEPS = 50000;

while (steps < MAX_STEPS) {
  const { done } = engine.step();
  steps++;
  if (done) break;
  // Check served count every 50 steps to reduce getSnap() overhead
  if (steps % 50 === 0 && engine.getSnap().served >= N_SERVED) break;
}

const snap          = engine.getSnap();

// Sort by arrival time so slicing by index gives arrival-order cohorts
const allDone       = snap.entities
  .filter(e => e.role !== 'server' && e.status === 'done')
  .sort((a, b) => a.arrivalTime - b.arrivalTime);

// Discard initial transient; measure steady-state mean wait only
const steadyDone    = allDone.slice(N_WARMUP);
const waitTimes     = steadyDone.map(e => (e.serviceStart || 0) - e.arrivalTime);
const simMeanWait   = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
const pctError      = Math.abs(simMeanWait - ANALYTICAL_MEAN_WAIT) / ANALYTICAL_MEAN_WAIT;
const pass          = pctError <= TOLERANCE;

console.log('M/M/1 Benchmark — λ=0.9, μ=1.0, ρ=0.9');
console.log(`  Analytical mean wait in queue: ${ANALYTICAL_MEAN_WAIT.toFixed(4)} time units`);
console.log(`  Simulated mean wait in queue:  ${simMeanWait.toFixed(4)} time units  (post-warmup: customers ${N_WARMUP + 1}–${allDone.length})`);
console.log(`  Customers served (total):      ${allDone.length}`);
console.log(`  Customers analysed:            ${steadyDone.length}  (warm-up discarded: ${N_WARMUP})`);
console.log(`  Error:                         ${(pctError * 100).toFixed(2)}%  (tolerance: ${(TOLERANCE * 100).toFixed(0)}%)`);
console.log(`  Steps executed:                ${steps}`);
console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}`);

process.exit(pass ? 0 : 1);
