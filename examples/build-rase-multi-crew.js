// Build Heat Pump v3 — RASE with 3-route DNO resolution (fuse/unloop/transformer) + dedicated crews
// Run: node build-rase-multi-crew.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Segment definitions ---
const SEGMENTS = [
  {
    id: 'urban', name: 'Urban', entityType: 'Urban Household', pri: 3, color: '#4A90D9',
    arrivalMean: '1.78', dnoRisk: 1,
    assess: { max: '2.0', min: '0.5', mode: '1.0' },
    pNoReinf: 0.85, pATC: 0.15,
    pFuse: 0.60, pUnloop: 0.30, pTransformer: 0.10,
    install: { max: '2.0', min: '0.75', mode: '1.0' },
    commission: { max: '1.0', min: '0.25', mode: '0.5' }
  },
  {
    id: 'suburban', name: 'Suburban', entityType: 'Suburban Household', pri: 2, color: '#E74C3C',
    arrivalMean: '1.78', dnoRisk: 2,
    assess: { max: '3.0', min: '0.5', mode: '1.5' },
    pNoReinf: 0.65, pATC: 0.35,
    pFuse: 0.35, pUnloop: 0.40, pTransformer: 0.25,
    install: { max: '3', min: '0.75', mode: '1.5' },
    commission: { max: '1.0', min: '0.25', mode: '0.5' }
  },
  {
    id: 'rural', name: 'Rural', entityType: 'Rural Household', pri: 1, color: '#27AE60',
    arrivalMean: '3.56', dnoRisk: 3,
    assess: { max: '3.0', min: '0.75', mode: '1.5' },
    pNoReinf: 0.30, pATC: 0.70,
    pFuse: 0.15, pUnloop: 0.35, pTransformer: 0.50,
    install: { max: '4', min: '1.5', mode: '2' },
    commission: { max: '1.5', min: '0.25', mode: '0.75' }
  }
];

// --- Entity Types ---
const entityTypes = [
  { id: 'et_urban_hh', name: 'Urban Household', role: 'customer', count: 0,
    attrDefs: [{ name: 'priority', mutable: true, valueType: 'number', defaultValue: 3 }, { name: 'dno_risk', mutable: false, valueType: 'number', defaultValue: 1 }] },
  { id: 'et_suburban_hh', name: 'Suburban Household', role: 'customer', count: 0,
    attrDefs: [{ name: 'priority', mutable: true, valueType: 'number', defaultValue: 2 }, { name: 'dno_risk', mutable: false, valueType: 'number', defaultValue: 2 }] },
  { id: 'et_rural_hh', name: 'Rural Household', role: 'customer', count: 0,
    attrDefs: [{ name: 'priority', mutable: true, valueType: 'number', defaultValue: 1 }, { name: 'dno_risk', mutable: false, valueType: 'number', defaultValue: 3 }] },
  { id: 'et_surveyor', name: 'MCS Surveyor', role: 'server', count: 4,
    attrDefs: [], shiftSchedule: [{ time: 0, capacity: 4 }, { time: 86, capacity: 5 }, { time: 171, capacity: 6 }] },
  { id: 'et_fuse', name: 'Fuse Engineer', role: 'server', count: 8, attrDefs: [] },
  { id: 'et_unloop', name: 'Unlooping Team', role: 'server', count: 3, attrDefs: [] },
  { id: 'et_transformer', name: 'Transformer Crew', role: 'server', count: 2, attrDefs: [] },
  { id: 'et_installer', name: 'Heat Pump Installer', role: 'server', count: 6,
    attrDefs: [], shiftSchedule: [{ time: 0, capacity: 6 }, { time: 129, capacity: 8 }, { time: 214, capacity: 10 }] },
  { id: 'et_commissioning', name: 'Commissioning Engineer', role: 'server', count: 4, attrDefs: [] },
  { id: 'et_training', name: 'Training Capacity', role: 'server', count: 8, attrDefs: [] },
  { id: 'et_trainee', name: 'Installer Trainee', role: 'customer', count: 0,
    attrDefs: [{ name: 'priority', mutable: false, valueType: 'number', defaultValue: 1 }] }
];

// --- Queues ---
const queues = [];
const bEvents = [];
const cEvents = [];
const graphNodes = [];
const sectionMemberIds = {
  demand: [],       // sec 1: demand & assessment
  dno: [],          // sec 2: DNO connection & grid work
  install: [],      // sec 3: installation & commissioning
  training: []      // sec 4: training
};

function q(id, name, custType) {
  queues.push({ id, name, capacity: '', discipline: 'FIFO', customerType: custType });
  return id;
}

const capacity200 = { max: '200', min: '25', mode: '75' }; // transformer plan wait

// Generate per-segment elements
SEGMENTS.forEach((s, idx) => {
  const P = s.id.charAt(0).toUpperCase() + s.id.slice(1); // Urban etc
  const p = s.id; // urban etc
  const laneY = 80 + idx * 160;

  // Queue IDs
  const qAssess = q(`q_${p}_assess`, `${P} Assessment Queue`, s.entityType);
  const qATC = q(`q_${p}_atc`, `${P} ATC Queue`, s.entityType);
  const qFuse = q(`q_${p}_fuse`, `${P} Fuse Queue`, s.entityType);
  const qUnloop = q(`q_${p}_unloop`, `${P} Unloop Queue`, s.entityType);
  const qTransPlan = q(`q_${p}_trans_plan`, `${P} Transformer Plan Queue`, s.entityType);
  const qTransform = q(`q_${p}_transform`, `${P} Transformer Work Queue`, s.entityType);
  const qInstallSched = q(`q_${p}_install_sched`, `${P} Install Schedule Queue`, s.entityType);
  const qInstall = q(`q_${p}_install`, `${P} Installation Queue`, s.entityType);
  const qCommission = q(`q_${p}_commission`, `${P} Commissioning Queue`, s.entityType);

  // Section membership
  sectionMemberIds.demand.push(
    `et_${p}_hh`, 'et_surveyor',
    qAssess, `b_${p}_arrives`, `b_${p}_assessed`, `c_assess_${p}`
  );
  sectionMemberIds.dno.push(
    'et_fuse', 'et_unloop', 'et_transformer',
    qATC, qFuse, qUnloop, qTransPlan, qTransform,
    `b_${p}_atc_complete`, `b_${p}_fuse_complete`, `b_${p}_unloop_complete`,
    `b_${p}_transform_planned`, `b_${p}_transform_complete`,
    `c_atc_${p}`, `c_fuse_${p}`, `c_unloop_${p}`,
    `c_plan_transform_${p}`, `c_transform_${p}`
  );
  sectionMemberIds.install.push(
    'et_installer', 'et_commissioning',
    qInstallSched, qInstall, qCommission,
    `b_${p}_install_scheduled`, `b_${p}_installed`, `b_${p}_commissioned`,
    `c_install_schedule_${p}`, `c_install_${p}`, `c_commission_${p}`
  );

  // --- B-Events ---
  // Arrival
  bEvents.push({
    id: `b_${p}_arrives`, name: `${P} Household Applies`,
    effect: [`ARRIVE(${s.entityType}, ${P} Assessment Queue)`],
    schedules: [{
      dist: 'Piecewise', eventId: `b_${p}_arrives`,
      distParams: {
        periods: [
          { dist: 'Exponential', startTime: '0', distParams: { mean: s.arrivalMean } },
          { dist: 'Exponential', startTime: '260', distParams: { mean: '99999' } }
        ]
      }
    }],
    scheduledTime: '0'
  });

  // Assessment complete → probRouting to either Install Schedule or ATC
  bEvents.push({
    id: `b_${p}_assessed`, name: `${P} Assessment Complete`,
    effect: ['RELEASE(MCS Surveyor)'],
    schedules: [], scheduledTime: '9999',
    probabilisticRouting: [
      { queueName: `${P} ATC Queue`, probability: s.pATC },
      { queueName: `${P} Install Schedule Queue`, probability: s.pNoReinf }
    ]
  });

  // Apply to Connect complete → 3-way routing
  bEvents.push({
    id: `b_${p}_atc_complete`, name: `${P} ATC Complete`,
    effect: [], schedules: [], scheduledTime: '9999',
    probabilisticRouting: [
      { queueName: `${P} Fuse Queue`, probability: s.pFuse },
      { queueName: `${P} Unloop Queue`, probability: s.pUnloop },
      { queueName: `${P} Transformer Plan Queue`, probability: s.pTransformer }
    ]
  });

  // Fuse complete → Install Schedule
  bEvents.push({
    id: `b_${p}_fuse_complete`, name: `${P} Fuse Complete`,
    effect: [`RELEASE(Fuse Engineer, ${P} Install Schedule Queue)`],
    schedules: [], scheduledTime: '9999'
  });

  // Unloop complete → Install Schedule
  bEvents.push({
    id: `b_${p}_unloop_complete`, name: `${P} Unloop Complete`,
    effect: [`RELEASE(Unlooping Team, ${P} Install Schedule Queue)`],
    schedules: [], scheduledTime: '9999'
  });

  // Transformer plan complete → Transformer Work Queue
  bEvents.push({
    id: `b_${p}_transform_planned`, name: `${P} Transformer Planned`,
    effect: [], schedules: [], scheduledTime: '9999',
    probabilisticRouting: [{ queueName: `${P} Transformer Work Queue`, probability: 1 }]
  });

  // Transformer complete → Install Schedule
  bEvents.push({
    id: `b_${p}_transform_complete`, name: `${P} Transformer Complete`,
    effect: [`RELEASE(Transformer Crew, ${P} Install Schedule Queue)`],
    schedules: [], scheduledTime: '9999'
  });

  // Install schedule complete → Install Queue
  bEvents.push({
    id: `b_${p}_install_scheduled`, name: `${P} Install Scheduled`,
    effect: [], schedules: [], scheduledTime: '9999',
    probabilisticRouting: [{ queueName: `${P} Installation Queue`, probability: 1 }]
  });

  // Installation complete → Commission
  bEvents.push({
    id: `b_${p}_installed`, name: `${P} Installation Complete`,
    effect: [`RELEASE(Heat Pump Installer, ${P} Commissioning Queue)`],
    schedules: [], scheduledTime: '9999'
  });

  // Commissioned → COMPLETE
  bEvents.push({
    id: `b_${p}_commissioned`, name: `${P} Commissioned`,
    effect: ['COMPLETE()'], schedules: [], scheduledTime: '9999'
  });

  // --- C-Events ---
  // Assessment
  cEvents.push({
    id: `c_assess_${p}`, name: `Assess ${P}`, priority: 1,
    effect: [`ASSIGN(${P} Assessment Queue, MCS Surveyor)`],
    condition: {
      operator: 'AND',
      clauses: [
        { variable: `queue(${P} Assessment Queue).length`, operator: '>', value: 0 },
        { variable: 'idle(MCS Surveyor).count', operator: '>', value: 0 }
      ]
    },
    cSchedules: [{ dist: 'Triangular', eventId: `b_${p}_assessed`, distParams: s.assess, useEntityCtx: true }]
  });

  // Apply to Connect DELAY (fixed 10 wd)
  cEvents.push({
    id: `c_atc_${p}`, name: `Apply to Connect ${P}`, priority: 4,
    effect: [`DELAY(${P} ATC Queue)`],
    condition: { variable: `queue(${P} ATC Queue).length`, operator: '>', value: 0 },
    cSchedules: [{ dist: 'Fixed', eventId: `b_${p}_atc_complete`, distParams: { value: '10' }, useEntityCtx: true }]
  });

  // Fuse work
  cEvents.push({
    id: `c_fuse_${p}`, name: `${P} Fuse Work`, priority: 2,
    effect: [`ASSIGN(${P} Fuse Queue, Fuse Engineer)`],
    condition: {
      operator: 'AND',
      clauses: [
        { variable: `queue(${P} Fuse Queue).length`, operator: '>', value: 0 },
        { variable: 'idle(Fuse Engineer).count', operator: '>', value: 0 }
      ]
    },
    cSchedules: [{ dist: 'Triangular', eventId: `b_${p}_fuse_complete`, distParams: { max: '2', min: '0.5', mode: '1' }, useEntityCtx: true }]
  });

  // Unlooping work
  cEvents.push({
    id: `c_unloop_${p}`, name: `${P} Unloop Work`, priority: 2,
    effect: [`ASSIGN(${P} Unloop Queue, Unlooping Team)`],
    condition: {
      operator: 'AND',
      clauses: [
        { variable: `queue(${P} Unloop Queue).length`, operator: '>', value: 0 },
        { variable: 'idle(Unlooping Team).count', operator: '>', value: 0 }
      ]
    },
    cSchedules: [{ dist: 'Triangular', eventId: `b_${p}_unloop_complete`, distParams: { max: '14', min: '3', mode: '7' }, useEntityCtx: true }]
  });

  // Transformer plan wait DELAY
  cEvents.push({
    id: `c_plan_transform_${p}`, name: `${P} Transformer Plan`, priority: 4,
    effect: [`DELAY(${P} Transformer Plan Queue)`],
    condition: { variable: `queue(${P} Transformer Plan Queue).length`, operator: '>', value: 0 },
    cSchedules: [{ dist: 'Triangular', eventId: `b_${p}_transform_planned`, distParams: capacity200, useEntityCtx: true }]
  });

  // Transformer work
  cEvents.push({
    id: `c_transform_${p}`, name: `${P} Transformer Work`, priority: 2,
    effect: [`ASSIGN(${P} Transformer Work Queue, Transformer Crew)`],
    condition: {
      operator: 'AND',
      clauses: [
        { variable: `queue(${P} Transformer Work Queue).length`, operator: '>', value: 0 },
        { variable: 'idle(Transformer Crew).count', operator: '>', value: 0 }
      ]
    },
    cSchedules: [{ dist: 'Triangular', eventId: `b_${p}_transform_complete`, distParams: { max: '28', min: '5', mode: '14' }, useEntityCtx: true }]
  });

  // Install schedule DELAY
  cEvents.push({
    id: `c_install_schedule_${p}`, name: `${P} Install Schedule`, priority: 6,
    effect: [`DELAY(${P} Install Schedule Queue)`],
    condition: { variable: `queue(${P} Install Schedule Queue).length`, operator: '>', value: 0 },
    cSchedules: [{ dist: 'Triangular', eventId: `b_${p}_install_scheduled`, distParams: { max: '15', min: '5', mode: '10' }, useEntityCtx: true }]
  });

  // Installation
  cEvents.push({
    id: `c_install_${p}`, name: `Install ${P}`, priority: 3,
    effect: [`ASSIGN(${P} Installation Queue, Heat Pump Installer)`],
    condition: {
      operator: 'AND',
      clauses: [
        { variable: `queue(${P} Installation Queue).length`, operator: '>', value: 0 },
        { variable: 'idle(Heat Pump Installer).count', operator: '>', value: 0 }
      ]
    },
    cSchedules: [{ dist: 'Triangular', eventId: `b_${p}_installed`, distParams: s.install, useEntityCtx: true }]
  });

  // Commissioning
  cEvents.push({
    id: `c_commission_${p}`, name: `Commission ${P}`, priority: 0,
    effect: [`ASSIGN(${P} Commissioning Queue, Commissioning Engineer)`],
    condition: {
      operator: 'AND',
      clauses: [
        { variable: `queue(${P} Commissioning Queue).length`, operator: '>', value: 0 },
        { variable: 'idle(Commissioning Engineer).count', operator: '>', value: 0 }
      ]
    },
    cSchedules: [{ dist: 'Triangular', eventId: `b_${p}_commissioned`, distParams: s.commission, useEntityCtx: true }]
  });

  // --- Graph nodes ---
  const col = (offset) => 40 + offset * 140;
  const row = laneY;

  graphNodes.push(
    { x: col(0), y: row, id: `source:b_${p}_arrives-0`, type: 'source', refId: `b_${p}_arrives` },
    { x: col(1), y: row, id: `queue:${qAssess}`, type: 'queue', refId: qAssess },
    { x: col(2), y: row, id: `activity:c_assess_${p}`, type: 'activity', refId: `c_assess_${p}` },
    // ATC
    { x: col(3.5), y: row, id: `queue:${qATC}`, type: 'queue', refId: qATC },
    { x: col(4.5), y: row, id: `activity:c_atc_${p}`, type: 'activity', refId: `c_atc_${p}` },
    // 3 resolution queues stacked vertically
    { x: col(6), y: row - 30, id: `queue:${qFuse}`, type: 'queue', refId: qFuse },
    { x: col(6), y: row + 20, id: `queue:${qUnloop}`, type: 'queue', refId: qUnloop },
    { x: col(6), y: row + 70, id: `queue:${qTransPlan}`, type: 'queue', refId: qTransPlan },
    { x: col(7), y: row - 30, id: `activity:c_fuse_${p}`, type: 'activity', refId: `c_fuse_${p}` },
    { x: col(7), y: row + 20, id: `activity:c_unloop_${p}`, type: 'activity', refId: `c_unloop_${p}` },
    { x: col(7), y: row + 70, id: `activity:c_plan_transform_${p}`, type: 'activity', refId: `c_plan_transform_${p}` },
    // Transformer work queue + activity (offset right, inline with plan)
    { x: col(8.5), y: row + 70, id: `queue:${qTransform}`, type: 'queue', refId: qTransform },
    { x: col(9.5), y: row + 70, id: `activity:c_transform_${p}`, type: 'activity', refId: `c_transform_${p}` },
    // Install schedule & beyond
    { x: col(11), y: row, id: `queue:${qInstallSched}`, type: 'queue', refId: qInstallSched },
    { x: col(12), y: row, id: `activity:c_install_schedule_${p}`, type: 'activity', refId: `c_install_schedule_${p}` },
    { x: col(13), y: row, id: `queue:${qInstall}`, type: 'queue', refId: qInstall },
    { x: col(14), y: row, id: `activity:c_install_${p}`, type: 'activity', refId: `c_install_${p}` },
    { x: col(15), y: row, id: `queue:${qCommission}`, type: 'queue', refId: qCommission },
    { x: col(16), y: row, id: `activity:c_commission_${p}`, type: 'activity', refId: `c_commission_${p}` },
    { x: col(17), y: row, id: `sink:b_${p}_commissioned`, type: 'sink', refId: `b_${p}_commissioned` }
  );
});

// --- Training pipeline ---
const trainingQ = q('q_training', 'Installer Training Queue', 'Installer Trainee');
sectionMemberIds.training.push(
  'et_trainee', 'et_training', trainingQ,
  'b_trainee_arrives', 'b_trainee_qualified', 'c_train_installer',
  'sv_rural_blocked', 'sv_trainees_qualified'
);

bEvents.push(
  {
    id: 'b_trainee_arrives', name: 'Trainee Intake',
    effect: ['ARRIVE(Installer Trainee, Installer Training Queue)'],
    schedules: [{
      dist: 'Piecewise', eventId: 'b_trainee_arrives',
      distParams: {
        periods: [
          { dist: 'Exponential', startTime: '0', distParams: { mean: '10.0' } },
          { dist: 'Exponential', startTime: '260', distParams: { mean: '99999' } }
        ]
      }
    }],
    scheduledTime: '0'
  },
  {
    id: 'b_trainee_qualified', name: 'Trainee Qualifies',
    effect: ['COMPLETE()'], schedules: [], scheduledTime: '9999'
  }
);

cEvents.push({
  id: 'c_train_installer', name: 'Train Installer', priority: 1,
  effect: ['ASSIGN(Installer Training Queue, Training Capacity)'],
  condition: {
    operator: 'AND',
    clauses: [
      { variable: 'queue(Installer Training Queue).length', operator: '>', value: 0 },
      { variable: 'idle(Training Capacity).count', operator: '>', value: 0 }
    ]
  },
  cSchedules: [{ dist: 'Triangular', eventId: 'b_trainee_qualified', distParams: { max: '64', min: '29', mode: '50' }, useEntityCtx: true }]
});

graphNodes.push(
  { x: 40, y: 552, id: 'source:b_trainee_arrives-0', type: 'source', refId: 'b_trainee_arrives' },
  { x: 180, y: 552, id: `queue:${trainingQ}`, type: 'queue', refId: trainingQ },
  { x: 320, y: 552, id: 'activity:c_train_installer', type: 'activity', refId: 'c_train_installer' },
  { x: 460, y: 552, id: 'sink:b_trainee_qualified', type: 'sink', refId: 'b_trainee_qualified' }
);

// --- Assemble model ---
const model = {
  name: 'Heat pump v3 — RASE with 3-route DNO resolution',
  model_json: {
    schemaVersion: 1,
    entityTypes,
    stateVariables: [
      { id: 'sv_rural_blocked', name: 'ruralBlocked', valueType: 'number', initialValue: 0, resetOnWarmup: true },
      { id: 'sv_trainees_qualified', name: 'traineesQualified', valueType: 'number', initialValue: 0, resetOnWarmup: true }
    ],
    bEvents,
    cEvents,
    queues,
    containerTypes: [],
    goals: [
      { label: 'Mean end-to-end journey < 65 working days (≈90 calendar)', metric: 'summary.avgSojourn', target: 65, operator: '<' },
      { label: '≥70% of applications complete within the simulation year', metric: 'summary.servedRatio', target: 0.7, operator: '>=' },
      { label: 'Fuse Engineer utilisation < 80% (headroom for minor grid work)', scope: { id: 'et_fuse', name: 'Fuse Engineer', type: 'resource' }, metric: 'resource.utilisation', target: 0.8, operator: '<' },
      { label: 'Unlooping Team utilisation < 80% (headroom for unlooping)', scope: { id: 'et_unloop', name: 'Unlooping Team', type: 'resource' }, metric: 'resource.utilisation', target: 0.8, operator: '<' },
      { label: 'Transformer Crew utilisation < 80% (headroom for upgrades)', scope: { id: 'et_transformer', name: 'Transformer Crew', type: 'resource' }, metric: 'resource.utilisation', target: 0.8, operator: '<' },
      { label: 'Heat Pump Installer utilisation > 60% (workforce not idle)', scope: { id: 'et_installer', name: 'Heat Pump Installer', type: 'resource' }, metric: 'resource.utilisation', target: 0.6, operator: '>' },
      { label: 'Rural transformer plan wait < 60 working days (plan horizon)', scope: { id: 'q_rural_trans_plan', name: 'Rural Transformer Plan Queue', type: 'queue' }, metric: 'summary.avgWait', target: 60, operator: '<' },
      { label: 'Mean suburban transformer plan wait < 45 working days', scope: { id: 'q_suburban_trans_plan', name: 'Suburban Transformer Plan Queue', type: 'queue' }, metric: 'summary.avgWait', target: 45, operator: '<' },
      { label: 'Mean rural transformer work wait < 21 working days (crew available)', scope: { id: 'q_rural_transform', name: 'Rural Transformer Work Queue', type: 'queue' }, metric: 'summary.avgWait', target: 21, operator: '<' },
      { label: 'Rural transformer plan WIP < 15 households (queue not exploding)', scope: { id: 'q_rural_trans_plan', name: 'Rural Transformer Plan Queue', type: 'queue' }, metric: 'summary.avgWIP', target: 15, operator: '<' }
    ],
    graph: { nodes: graphNodes, version: 1, viewport: { x: 0, y: 0, zoom: 1 } },
    experimentDefaults: {
      seed: 627060057,
      maxSimTime: 260,
      liveDataMode: null,
      replications: 40,
      warmupPeriod: 21,
      terminationMode: 'time',
      resultDetailLevel: 'compact',
      terminationCondition: null
    },
    timeUnit: 'workingDays',
    description: 'Multi-crew RASE variant with 3 DNO resolution types (fuse/unloop/transformer). Times working-day units ×1.4 = calendar days.',
    sections: [
      { id: 'sec_demand', name: 'Household Demand & Assessment', color: '#4A90D9', memberIds: sectionMemberIds.demand },
      { id: 'sec_dno', name: 'DNO Connection & Grid Work', color: '#E74C3C', memberIds: sectionMemberIds.dno },
      { id: 'sec_installation', name: 'Installation & Commissioning', color: '#27AE60', memberIds: sectionMemberIds.install },
      { id: 'sec_training', name: 'Installer Training Pipeline', color: '#8E44AD', memberIds: sectionMemberIds.training }
    ]
  },
  exportedAt: new Date().toISOString(),
  appVersion: '0.9.0 - Beta',
  description: 'RASE multi-crew variant with 3 DNO resolution types (fuse, unlooping, transformer upgrade), each with dedicated crews. Time unit is working days. Multiply by 1.4 for calendar-day estimates.'
};

// Write output
const outputPath = path.join(__dirname, 'heat-pump-rase-multi-crew.json');
fs.writeFileSync(outputPath, JSON.stringify(model, null, 2));
console.log('Model written to:', outputPath);
console.log('Stats:');
console.log('  Entity types:', model.model_json.entityTypes.length);
console.log('  Queues:', model.model_json.queues.length);
console.log('  B-Events:', model.model_json.bEvents.length);
console.log('  C-Events:', model.model_json.cEvents.length);
console.log('  Sections:', model.model_json.sections.length);
console.log('  Graph nodes:', model.model_json.graph.nodes.length);
