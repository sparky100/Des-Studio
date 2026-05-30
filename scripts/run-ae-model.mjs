/**
 * Run the A&E priority-queue model from the landing page and print real statistics.
 *
 * Model:
 *   - 12 patients/hr (Poisson): 30% high-acuity, 70% low-acuity
 *   - Single PRIORITY queue, 3 shared clinicians
 *   - Service time Exponential(mean=13 min) → ~86.7% utilisation
 *   - 30 replications, 60 min warmup, 480 min steady-state
 */

import { runReplicationPayload } from '../src/engine/worker.js';
import { confidenceInterval95 } from '../src/engine/statistics.js';

// Poisson splitting: λ_high = 0.3×0.2/min = 1/16.67, λ_low = 0.7×0.2/min = 1/7.14
const MEAN_IA_HIGH = 100 / 6;   // 16.667 min  (3.6/hr)
const MEAN_IA_LOW  = 100 / 14;  //  7.143 min  (8.4/hr)
const MEAN_SVC     = 13;        // min  → ρ = 0.2/(3/13) ≈ 0.867
const WARMUP       = 60;        // min
const SIM_TIME     = 60 + 480;  // min (warmup + 8 hr steady-state)
const REPLICATIONS = 30;
const MAX_CYCLES   = 50000;

const aeModel = {
  entityTypes: [
    {
      id: 'et-high', name: 'HighAcuityPatient', role: 'customer', count: '',
      attrDefs: [{ id: 'a-prio-h', name: 'priority', dist: 'Fixed', distParams: { value: '1' } }],
    },
    {
      id: 'et-low', name: 'LowAcuityPatient', role: 'customer', count: '',
      attrDefs: [{ id: 'a-prio-l', name: 'priority', dist: 'Fixed', distParams: { value: '2' } }],
    },
    {
      id: 'et-clin', name: 'Clinician', role: 'server', count: '3', attrDefs: [],
    },
  ],
  queues: [
    { id: 'q-main', name: 'PatientQueue', customerType: 'Patient', discipline: 'PRIORITY' },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'be-high-arrive', name: 'High Acuity Arrives', scheduledTime: '0',
      effect: 'ARRIVE(HighAcuityPatient, PatientQueue)',
      schedules: [{ eventId: 'be-high-arrive', dist: 'Exponential', distParams: { mean: String(MEAN_IA_HIGH) } }],
    },
    {
      id: 'be-low-arrive', name: 'Low Acuity Arrives', scheduledTime: '0',
      effect: 'ARRIVE(LowAcuityPatient, PatientQueue)',
      schedules: [{ eventId: 'be-low-arrive', dist: 'Exponential', distParams: { mean: String(MEAN_IA_LOW) } }],
    },
    {
      id: 'be-consult-done', name: 'Consultation Complete', scheduledTime: '9999',
      effect: 'COMPLETE()', schedules: [],
    },
  ],
  cEvents: [
    {
      id: 'ce-start', name: 'Start Consultation', priority: 1,
      condition: 'queue(PatientQueue).length > 0 AND idle(Clinician).count > 0',
      effect: 'ASSIGN(PatientQueue, Clinician)',
      cSchedules: [{
        id: 'cs-consult', eventId: 'be-consult-done',
        dist: 'Exponential', distParams: { mean: String(MEAN_SVC) }, useEntityCtx: true,
      }],
    },
  ],
};

function waitTime(entity, warmup) {
  // For a normal single-stage entity: wait = serviceStart - max(arrivalTime, warmup)
  if (entity.status !== 'done') return null;
  const start = entity.serviceStart ?? entity.stages?.[0]?.serviceStart;
  const arr   = Math.max(entity.arrivalTime ?? 0, warmup);
  if (start == null || start < warmup) return null;
  return Math.max(0, start - arr);
}

const highWaits = [];
const lowWaits  = [];
const utils     = [];
const throughputs = [];

console.log(`Running ${REPLICATIONS} replications (warmup=${WARMUP} min, steady-state=480 min)...\n`);

for (let i = 0; i < REPLICATIONS; i++) {
  const { result } = runReplicationPayload({
    replicationIndex: i,
    model:  aeModel,
    seed:   i,
    warmupPeriod:  WARMUP,
    maxSimTime:    SIM_TIME,
    maxCycles:     MAX_CYCLES,
    maxCPasses:    1000,
  });

  const entities = result.entitySummary ?? [];

  const highDone = entities.filter(e => e.type === 'HighAcuityPatient' && e.status === 'done' && (e.arrivalTime ?? 0) >= WARMUP);
  const lowDone  = entities.filter(e => e.type === 'LowAcuityPatient'  && e.status === 'done' && (e.arrivalTime ?? 0) >= WARMUP);

  const hWaits = highDone.map(e => waitTime(e, WARMUP)).filter(v => v != null);
  const lWaits = lowDone.map(e  => waitTime(e, WARMUP)).filter(v => v != null);

  const hMean = hWaits.length ? hWaits.reduce((s, v) => s + v, 0) / hWaits.length : null;
  const lMean = lWaits.length ? lWaits.reduce((s, v) => s + v, 0) / lWaits.length : null;

  const util = result.summary?.perResource?.Clinician?.utilisation ?? null;
  // throughput: served after warmup across 480 min steady-state
  const served = (highDone.length + lowDone.length);
  const tput = served / 480 * 60; // patients per hour

  if (hMean != null) highWaits.push(hMean);
  if (lMean != null) lowWaits.push(lMean);
  if (util  != null) utils.push(util);
  throughputs.push(tput);

  process.stdout.write(`  rep ${String(i+1).padStart(2)}: high=${hMean?.toFixed(1)??'N/A'}m  low=${lMean?.toFixed(1)??'N/A'}m  util=${util != null ? (util*100).toFixed(1)+'%' : 'N/A'}  tput=${tput.toFixed(1)}/hr\n`);
}

const hCI   = confidenceInterval95(highWaits);
const lCI   = confidenceInterval95(lowWaits);
const uCI   = confidenceInterval95(utils);
const tCI   = confidenceInterval95(throughputs);

console.log('\n══════════════════════════════════════════════════');
console.log('  RESULTS (30-replication, 95% CI)');
console.log('══════════════════════════════════════════════════');
console.log(`  High-acuity mean wait : ${hCI.mean?.toFixed(1)} min  (CI: ${hCI.lower?.toFixed(1)}–${hCI.upper?.toFixed(1)})`);
console.log(`  Low-acuity  mean wait : ${lCI.mean?.toFixed(1)} min  (CI: ${lCI.lower?.toFixed(1)}–${lCI.upper?.toFixed(1)})`);
console.log(`  Clinician utilisation : ${((uCI.mean??0)*100).toFixed(1)}%  (CI: ${((uCI.lower??0)*100).toFixed(1)}%–${((uCI.upper??0)*100).toFixed(1)}%)`);
console.log(`  Throughput            : ${tCI.mean?.toFixed(1)}/hr  (CI: ${tCI.lower?.toFixed(1)}–${tCI.upper?.toFixed(1)})`);
console.log(`\n  Theoretical ρ = λ/(cμ) = 0.2 / (3 × 1/13) = ${(0.2 * 13 / 3).toFixed(4)}`);

// M/M/c Erlang-C formula for comparison (all patients, single priority class)
const lambda = 0.2;  // /min
const mu     = 1/13; // /min
const c      = 3;
const rho    = lambda / (c * mu);

// Erlang-C: C(c, a) where a = lambda/mu = traffic intensity
const a      = lambda / mu;  // = 2.6 erlang
let erlangNum = Math.pow(a, c) / factorial(c) / (1 - rho);
let erlangDen = 0;
for (let k = 0; k < c; k++) erlangDen += Math.pow(a, k) / factorial(k);
erlangDen += erlangNum;
const Pc = erlangNum / erlangDen;   // P(wait > 0) under M/M/c
const Wq_formula = Pc / (c * mu - lambda);  // mean wait in queue (min)

console.log(`\n  Erlang-C (single priority, M/M/c): Wq = ${Wq_formula.toFixed(1)} min`);
console.log(`  (Spreadsheet can't split this by priority class)\n`);

function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
