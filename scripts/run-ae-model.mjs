/**
 * Run the exact Acuity model JSON from the app and print real statistics.
 * 30 replications, 60 min warmup, 480 min steady-state.
 */

import { runReplicationPayload } from '../src/engine/worker.js';
import { confidenceInterval95 } from '../src/engine/statistics.js';

const WARMUP    = 60;
const SIM_TIME  = 60 + 480;
const REPS      = 30;

const model = {
  entityTypes: [
    {
      id: 'et_patient', name: 'Patient', role: 'customer', count: 0,
      attrDefs: [
        { name: 'acuity', valueType: 'number', defaultValue: '1', mutable: true,
          dist: 'Uniform', distParams: { min: '1', max: '2' } },
      ],
    },
    { id: 'et_clinician', name: 'Clinician', role: 'server', count: 3, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b_arrive', name: 'Patient Arrives', scheduledTime: '0',
      effect: ['ARRIVE(Patient, High Acuity Queue)'],
      schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: '5' } }],
      probabilisticRouting: [
        { probability: 0.3, queueName: 'High Acuity Queue' },
        { probability: 0.7, queueName: 'Low Acuity Queue' },
      ],
    },
    {
      id: 'b_treatment_done', name: 'Treatment Complete', scheduledTime: '9999',
      effect: ['COMPLETE()'], schedules: [],
    },
  ],
  cEvents: [
    {
      id: 'c_start_high_acuity', name: 'Start High Acuity Treatment', priority: 1,
      condition: {
        operator: 'AND', clauses: [
          { variable: 'queue(High Acuity Queue).length', operator: '>', value: 0 },
          { variable: 'idle(Clinician).count',           operator: '>', value: 0 },
        ],
      },
      effect: ['ASSIGN(High Acuity Queue, Clinician)'],
      cSchedules: [{ eventId: 'b_treatment_done', dist: 'Exponential', distParams: { mean: '13' }, useEntityCtx: true }],
    },
    {
      id: 'c_start_low_acuity', name: 'Start Low Acuity Treatment', priority: 2,
      condition: {
        operator: 'AND', clauses: [
          { variable: 'queue(Low Acuity Queue).length', operator: '>', value: 0 },
          { variable: 'idle(Clinician).count',          operator: '>', value: 0 },
        ],
      },
      effect: ['ASSIGN(Low Acuity Queue, Clinician)'],
      cSchedules: [{ eventId: 'b_treatment_done', dist: 'Exponential', distParams: { mean: '13' }, useEntityCtx: true }],
    },
  ],
  queues: [
    { id: 'q_high', name: 'High Acuity Queue', customerType: 'Patient', discipline: 'FIFO' },
    { id: 'q_low',  name: 'Low Acuity Queue',  customerType: 'Patient', discipline: 'FIFO' },
  ],
  timeUnit: 'minutes',
};

function waitTime(entity, warmup) {
  const start = entity.serviceStart ?? entity.stages?.[0]?.serviceStart;
  if (entity.status !== 'done' || start == null || start < warmup) return null;
  return Math.max(0, start - Math.max(entity.arrivalTime ?? 0, warmup));
}

const highWaits = [], lowWaits = [], utils = [], throughputs = [];

console.log(`Running ${REPS} replications (exact model JSON, warmup=${WARMUP} min, steady-state=480 min)\n`);

for (let i = 0; i < REPS; i++) {
  const { result } = runReplicationPayload({
    replicationIndex: i, model, seed: i,
    warmupPeriod: WARMUP, maxSimTime: SIM_TIME,
    maxCycles: 50000, maxCPasses: 1000,
  });

  const entities = result.entitySummary ?? [];
  const highDone = entities.filter(e => e.queue === 'High Acuity Queue' || e.lastQueue === 'High Acuity Queue').filter(e => e.status === 'done' && (e.arrivalTime ?? 0) >= WARMUP);
  const lowDone  = entities.filter(e => e.queue === 'Low Acuity Queue'  || e.lastQueue === 'Low Acuity Queue' ).filter(e => e.status === 'done' && (e.arrivalTime ?? 0) >= WARMUP);

  const hW = highDone.map(e => waitTime(e, WARMUP)).filter(v => v != null);
  const lW = lowDone .map(e => waitTime(e, WARMUP)).filter(v => v != null);
  const hMean = hW.length ? hW.reduce((s,v)=>s+v,0)/hW.length : null;
  const lMean = lW.length ? lW.reduce((s,v)=>s+v,0)/lW.length : null;
  const util  = result.summary?.perResource?.Clinician?.utilisation ?? null;
  const tput  = (highDone.length + lowDone.length) / 480 * 60;

  if (hMean != null) highWaits.push(hMean);
  if (lMean != null) lowWaits.push(lMean);
  if (util  != null) utils.push(util);
  throughputs.push(tput);

  process.stdout.write(`  rep ${String(i+1).padStart(2)}: high=${hMean?.toFixed(1)??'N/A'}m  low=${lMean?.toFixed(1)??'N/A'}m  util=${util!=null?(util*100).toFixed(1)+'%':'N/A'}  tput=${tput.toFixed(1)}/hr\n`);
}

const hCI = confidenceInterval95(highWaits);
const lCI = confidenceInterval95(lowWaits);
const uCI = confidenceInterval95(utils);
const tCI = confidenceInterval95(throughputs);

console.log('\n══════════════════════════════════════════════════');
console.log('  RESULTS — exact model JSON (30 reps, 95% CI)');
console.log('══════════════════════════════════════════════════');
console.log(`  High-acuity mean wait : ${hCI.mean?.toFixed(1)} min  (CI: ${hCI.lower?.toFixed(1)}–${hCI.upper?.toFixed(1)})`);
console.log(`  Low-acuity  mean wait : ${lCI.mean?.toFixed(1)} min  (CI: ${lCI.lower?.toFixed(1)}–${lCI.upper?.toFixed(1)})`);
console.log(`  Clinician utilisation : ${((uCI.mean??0)*100).toFixed(1)}%  (CI: ${((uCI.lower??0)*100).toFixed(1)}%–${((uCI.upper??0)*100).toFixed(1)}%)`);
console.log(`  Throughput            : ${tCI.mean?.toFixed(1)}/hr  (CI: ${tCI.lower?.toFixed(1)}–${tCI.upper?.toFixed(1)})`);
