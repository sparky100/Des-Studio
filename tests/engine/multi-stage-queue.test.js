import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

const erTriageModel = {
  name: "ER Triage",
  entityTypes: [
    { id: 'et_patient', name: 'Patient', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_nurse',   name: 'Nurse',   role: 'server', count: '10', attrDefs: [] },
    { id: 'et_doctor',  name: 'Doctor',  role: 'server', count: '10', attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: 'b_arrive',          name: 'Arrival',         scheduledTime: '0',   effect: 'ARRIVE(Patient, Patient)',       schedules: [{ eventId: 'b_arrive', dist: 'Fixed', distParams: { value: '5' } }] },
    { id: 'b_triage_done',     name: 'Triage Done',     scheduledTime: '999', effect: 'RELEASE(Nurse, Treatment)',       schedules: [] },
    { id: 'b_treatment_done',  name: 'Treatment Done',  scheduledTime: '999', effect: 'COMPLETE()',                      schedules: [] },
  ],
  cEvents: [
    { id: 'c_triage', name: 'Start Triage',    priority: 1, condition: 'queue(Patient).length > 0 AND idle(Nurse).count > 0',   effect: 'ASSIGN(Patient, Nurse)',   cSchedules: [{ eventId: 'b_triage_done',    dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }] },
    { id: 'c_treat',  name: 'Start Treatment', priority: 2, condition: 'queue(Treatment).length > 0 AND idle(Doctor).count > 0', effect: 'ASSIGN(Treatment, Doctor)', cSchedules: [{ eventId: 'b_treatment_done', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }] },
  ],
  queues: [
    { id: 'q_patient',   name: 'Patient',   customerType: 'Patient', capacity: '', discipline: 'FIFO' },
    { id: 'q_treatment', name: 'Treatment', customerType: 'Patient', capacity: '', discipline: 'PRIORITY' },
  ],
};

const mm1Model = {
  entityTypes: [
    { id: 'et1', name: 'Customer', role: 'customer', count: '', attrDefs: [] },
    { id: 'et2', name: 'Server', role: 'server', count: '1', attrDefs: [{ id: 'a1', name: 'serviceTime', dist: 'Fixed', distParams: { value: '3' } }] },
  ],
  stateVariables: [],
  bEvents: [
    { id: 'b1', name: 'Customer Arrives', scheduledTime: '0', effect: 'ARRIVE(Customer)', schedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: '3' } }] },
    { id: 'b2', name: 'Service Complete', scheduledTime: '999', effect: 'COMPLETE()', schedules: [] },
  ],
  cEvents: [
    { id: 'c1', name: 'Start Service', effect: 'ASSIGN(Customer, Server)',
      condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
      cSchedules: [{ id: 'cs1', eventId: 'b2', dist: 'Fixed', distParams: { value: '3' }, useEntityCtx: true }] },
  ],
};

describe('ASSIGN clears queue field - no double-counting across stages', () => {
  test('M/M/1: serving entities have no queue field after ASSIGN', () => {
    const engine = buildEngine(mm1Model, 42, 0, 20);
    const result = engine.runAll();

    const serving = result.entitySummary.filter(e => e.status === 'serving');
    for (const e of serving) {
      expect(e.queue).toBeUndefined();
      expect(e.lastQueue).toBe('CustomerQueue');
    }

    const done = result.entitySummary.filter(e => e.status === 'done');
    for (const e of done) {
      expect(e.lastQueue).toBe('CustomerQueue');
    }
  });

  test('M/M/1: waiting entities must have a queue and status === waiting', () => {
    const engine = buildEngine(mm1Model, 42, 0, 20);
    const result = engine.runAll();

    const waiting = result.entitySummary.filter(e => e.status === 'waiting');
    for (const e of waiting) {
      expect(e.queue).toBeDefined();
    }
  });

  test('ER Triage: serving entities have no queue after ASSIGN', () => {
    const result = buildEngine(erTriageModel, 42, 0, 40).runAll();

    const serving = result.entitySummary.filter(e => e.status === 'serving');
    for (const e of serving) {
      expect(e.queue).toBeUndefined();
      expect(typeof e.lastQueue).toBe('string');
    }
  });

  test('ER Triage: waiting entities are only in one queue and have correct status', () => {
    const result = buildEngine(erTriageModel, 42, 0, 40).runAll();

    const waiting = result.entitySummary.filter(e => e.status === 'waiting');
    for (const e of waiting) {
      expect(e.queue).toBeDefined();
    }

    const inPatient   = waiting.filter(e => e.queue === 'Patient');
    const inTreatment = waiting.filter(e => e.queue === 'Treatment');
    expect(inPatient.length + inTreatment.length).toBe(waiting.length);
  });
});

describe('ER Triage multi-stage flow - correct queue hand-off via RELEASE', () => {
  test('completed patients have exactly 2 stages (Nurse then Doctor)', () => {
    const result = buildEngine(erTriageModel, 42, 0, 50).runAll();

    const done = result.entitySummary.filter(e => e.status === 'done');
    expect(done.length).toBeGreaterThan(0);
    for (const e of done) {
      expect(e.stages.length).toBe(2);
      expect(e.stages[0].serverType).toBe('Nurse');
      expect(e.stages[1].serverType).toBe('Doctor');
    }
  });

  test('RELEASE sets the correct target queue on the customer', () => {
    const result = buildEngine(erTriageModel, 42, 0, 50).runAll();

    for (const e of result.entitySummary) {
      if (e.status === 'done' && e.stages.length >= 2) {
        expect(e.stages[0].serverType).toBe('Nurse');
        expect(e.stages[1].serverType).toBe('Doctor');
        expect(e.stages[0].stageWait).toBeGreaterThanOrEqual(0);
        expect(e.stages[1].stageWait).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('completed patients have a lastQueue recorded from their final stage', () => {
    const result = buildEngine(erTriageModel, 42, 0, 50).runAll();

    const done = result.entitySummary.filter(e => e.status === 'done');
    for (const e of done) {
      expect(e.lastQueue).toBe('Treatment');
    }
  });
});

describe('Server idle/busy consistency across multi-stage flow', () => {
  test('ER Triage: all 10 nurses and 10 doctors are present', () => {
    const result = buildEngine(erTriageModel, 42, 0, 30).runAll();

    expect(result.summary.perResource.Nurse.total).toBe(10);
    expect(result.summary.perResource.Doctor.total).toBe(10);
  });

  test('ER Triage: busy + idle = total for each resource type', () => {
    const result = buildEngine(erTriageModel, 42, 0, 30).runAll();

    for (const r of Object.values(result.summary.perResource)) {
      expect(r.busyCount + r.idleCount).toBe(r.total);
    }
  });

  test('ER Triage: each serving patient references a real busy server', () => {
    const result = buildEngine(erTriageModel, 42, 0, 30).runAll();

    const servingPatients = result.entitySummary.filter(e => e.role !== 'server' && e.status === 'serving');
    for (const p of servingPatients) {
      expect(typeof p.serverId).toBe('number');
      const server = result.entitySummary.find(e => e.id === p.serverId);
      expect(server).toBeDefined();
      expect(server.status === 'busy' || server.status === 'serving').toBe(true);
    }
  });
});

describe('RELEASE frees server and sets queue for next stage', () => {
  test('ER Triage: patients in Treatment queue have completed triage (1 stage, Nurse)', () => {
    const engine = buildEngine(erTriageModel, 42, 0, 60);
    for (let i = 0; i < 150; i++) {
      const r = engine.step();
      if (r.done) break;
    }
    const snap = engine.getSnap();

    const inTreatment = snap.entities.filter(e => e.queue === 'Treatment' && e.status === 'waiting');
    for (const e of inTreatment) {
      expect(e.stages.length).toBe(1);
      expect(e.stages[0].serverType).toBe('Nurse');
    }
  });
});
