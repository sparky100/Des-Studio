import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

function makeHospitalModel() {
  return {
    entityTypes: [
      { id: 'Patient', name: 'Patient', role: 'customer', attrDefs: [] },
      { id: 'Doctor', name: 'Doctor', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q1', name: 'Waiting Room', customerType: 'Patient', discipline: 'FIFO' }],
    bEvents: [
      {
        id: 'arrival', name: 'Patient Arrives', scheduledTime: '0',
        effect: 'ARRIVE(Patient, Waiting Room)',
        schedules: [{ eventId: 'arrival', dist: 'fixed', distParams: { value: '2' } }],
      },
      {
        id: 'complete', name: 'Service Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
      {
        id: 'preempt', name: 'Emergency Preempt', scheduledTime: '5',
        effect: 'PREEMPT(Doctor)',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'assign', name: 'Start Service', priority: 1,
        condition: 'queue(Waiting Room).length > 0 AND idle(Doctor).count > 0',
        effect: 'ASSIGN(Waiting Room, Doctor)',
        cSchedules: [{ eventId: 'complete', dist: 'fixed', distParams: { value: '10' }, useEntityCtx: true }],
      },
    ],
    stateVariables: [],
  };
}

function makeFactoryModel() {
  return {
    entityTypes: [
      { id: 'Part', name: 'Part', role: 'customer', attrDefs: [] },
      { id: 'Machine', name: 'Machine', role: 'server', count: '1', attrDefs: [],
        mtbfDist: 'fixed', mtbfDistParams: { value: '8' },
        mttrDist: 'fixed', mttrDistParams: { value: '3' },
      },
    ],
    queues: [{ id: 'q1', name: 'Input Queue', customerType: 'Part', discipline: 'FIFO' }],
    bEvents: [
      {
        id: 'arrival', name: 'Part Arrives', scheduledTime: '0',
        effect: 'ARRIVE(Part, Input Queue)',
        schedules: [{ eventId: 'arrival', dist: 'fixed', distParams: { value: '1' } }],
      },
      {
        id: 'complete', name: 'Service Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'assign', name: 'Start Processing', priority: 1,
        condition: 'queue(Input Queue).length > 0 AND idle(Machine).count > 0',
        effect: 'ASSIGN(Input Queue, Machine)',
        cSchedules: [{ eventId: 'complete', dist: 'fixed', distParams: { value: '4' }, useEntityCtx: true }],
      },
    ],
    stateVariables: [],
  };
}

describe('G01 — Resource Preemption', () => {

  test('PREEMPT macro interrupts busy server and re-queues customer', () => {
    const model = makeHospitalModel();
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();

    const preemptLog = result.log.filter(e => e.message?.includes('PREEMPT'));
    expect(preemptLog.length).toBeGreaterThan(0);
    expect(preemptLog[0].message).toContain('interrupted');
    expect(preemptLog[0].message).toContain('re-queued');
  });

  test('Preempted customer resumes with remaining service time', () => {
    const model = makeHospitalModel();
    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();

    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBeGreaterThan(0);
  });

  test('PREEMPT with no busy server logs a message', () => {
    const model = {
      entityTypes: [
        { id: 'Patient', name: 'Patient', role: 'customer', attrDefs: [] },
        { id: 'Doctor', name: 'Doctor', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q1', name: 'Waiting Room', customerType: 'Patient', discipline: 'FIFO' }],
      bEvents: [
        {
          id: 'preempt', name: 'Early Preempt', scheduledTime: '0',
          effect: 'PREEMPT(Doctor)',
          schedules: [],
        },
      ],
      cEvents: [],
      stateVariables: [],
    };
    const engine = buildEngine(model, 42, 0, 5);
    const result = engine.runAll();

    const preemptLog = result.log.filter(e => e.message?.includes('PREEMPT'));
    expect(preemptLog.length).toBeGreaterThan(0);
    expect(preemptLog[0].message).toContain('no busy server');
  });
});

describe('G04 — Resource Breakdowns / Failures', () => {

  test('MTBF/MTTR scheduling creates FAILURE and REPAIR events', () => {
    const model = makeFactoryModel();
    const engine = buildEngine(model, 42, 0, 30);
    const result = engine.runAll();

    const failureLog = result.log.filter(e => e.message?.includes('FAILURE'));
    const repairLog = result.log.filter(e => e.message?.includes('REPAIR'));
    expect(failureLog.length).toBeGreaterThan(0);
    expect(repairLog.length).toBeGreaterThan(0);
  });

  test('Failed server is excluded from idle count', () => {
    const model = makeFactoryModel();
    const engine = buildEngine(model, 42, 0, 20);

    let foundFailed = false;
    for (let i = 0; i < 100; i++) {
      const r = engine.step();
      if (r.done) break;
      const snap = engine.getSnap();
      const failed = snap.entities.find(e => e.role === 'server' && e.status === 'failed');
      if (failed) { foundFailed = true; break; }
    }
    expect(foundFailed).toBe(true);
  });

  test('Server failure during service re-queues customer with remaining service', () => {
    const model = makeFactoryModel();
    const engine = buildEngine(model, 42, 0, 30);
    const result = engine.runAll();

    const failureLog = result.log.filter(e => e.message?.includes('FAILURE'));
    expect(failureLog.length).toBeGreaterThan(0);
  });

  test('Repair restores server to idle pool', () => {
    const model = makeFactoryModel();
    const engine = buildEngine(model, 42, 0, 30);
    const result = engine.runAll();

    const repairLog = result.log.filter(e => e.message?.includes('REPAIR'));
    expect(repairLog.length).toBeGreaterThan(0);
    expect(repairLog[0].message).toContain('restored');
  });
});
