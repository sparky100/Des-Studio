// tests/engine/mmc_benchmark.js
// Usage: node tests/engine/mmc_benchmark.js
// Pass criteria: simulated mean queue wait within 5% of M/M/c analytical value (Erlang-C)
//
// M/M/c parameters: λ=1.6, μ=1.0, c=2, ρ=λ/(c·μ)=0.8
//
// Erlang-C analytical Wq:
//   a  = λ/μ = 1.6 (offered load)
//   P0 = 1 / (1 + 1.6 + 2.56/(2·0.2)) = 1/9 ≈ 0.1111
//   C(c,ρ)  = [a²/(c!·(1−ρ))]·P0 = 6.4/9 ≈ 0.7111
//   Wq      = C(c,ρ) / (c·μ − λ)  = (6.4/9) / 0.4 ≈ 1.7778 time units
//
// Design notes:
//   N_SERVED = 2000  — more customers needed than M/M/1 because c=2 serves faster;
//                       ensures enough post-warmup data for a stable mean estimate
//   N_WARMUP = 500   — discards initial transient by arrival-order cohort index
//   Fixed seed 42    — reproducible result

import { buildEngine } from '../../src/engine/index.js';

const LAMBDA = 1.6;
const MU = 1.0;
const C_SERVERS = 2;
const RHO = LAMBDA / (C_SERVERS * MU);

function erlangC(c, lambda, mu) {
  const rho = lambda / (c * mu);
  const a = lambda / mu;
  let sumK = 0;
  let factorial = 1;
  for (let k = 0; k < c; k++) {
    if (k > 0) factorial *= k;
    sumK += Math.pow(a, k) / factorial;
  }
  factorial *= c;
  const lastTerm = Math.pow(a, c) / (factorial * (1 - rho));
  const P0 = 1 / (sumK + lastTerm);
  return (lastTerm * P0) / (c * mu - lambda);
}

const ANALYTICAL_MEAN_WAIT = erlangC(C_SERVERS, LAMBDA, MU);
const N_SERVED = 2000;
const N_WARMUP = 500;
const TOLERANCE = 0.05;
const SEED = 42;

const model = {
  entityTypes: [
    { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_srv',  name: 'Server',   role: 'server',   count: C_SERVERS, attrDefs: [] },
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
  queues: [],
};

// warmupPeriod=999999 means the engine's internal stats are not used;
// analysis uses raw entity data below (same pattern as mm1_benchmark.js)
const engine = buildEngine(model, SEED, 999999);

let steps = 0;
const MAX_STEPS = 200000;

while (steps < MAX_STEPS) {
  const { done } = engine.step();
  steps++;
  if (done) break;
  if (steps % 50 === 0 && engine.getSnap().served >= N_SERVED) break;
}

const snap = engine.getSnap();

const allDone = snap.entities
  .filter(e => e.role !== 'server' && e.status === 'done')
  .sort((a, b) => a.arrivalTime - b.arrivalTime);

const steadyDone  = allDone.slice(N_WARMUP);
const waitTimes   = steadyDone.map(e => (e.serviceStart || 0) - e.arrivalTime);
const simMeanWait = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
const pctError    = Math.abs(simMeanWait - ANALYTICAL_MEAN_WAIT) / ANALYTICAL_MEAN_WAIT;
const pass        = pctError <= TOLERANCE;

console.log(`M/M/c Benchmark — λ=${LAMBDA}, μ=${MU}, c=${C_SERVERS}, ρ=${RHO.toFixed(2)}`);
console.log(`  Analytical mean wait in queue: ${ANALYTICAL_MEAN_WAIT.toFixed(4)} time units  (Erlang-C)`);
console.log(`  Simulated mean wait in queue:  ${simMeanWait.toFixed(4)} time units  (post-warmup: customers ${N_WARMUP + 1}–${allDone.length})`);
console.log(`  Customers served (total):      ${allDone.length}`);
console.log(`  Customers analysed:            ${steadyDone.length}  (warm-up discarded: ${N_WARMUP})`);
console.log(`  Error:                         ${(pctError * 100).toFixed(2)}%  (tolerance: ${(TOLERANCE * 100).toFixed(0)}%)`);
console.log(`  Steps executed:                ${steps}`);
console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}`);

process.exit(pass ? 0 : 1);
