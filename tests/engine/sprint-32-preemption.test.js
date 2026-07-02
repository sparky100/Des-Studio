import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { makeBatchResult } from '../../src/ui/execute/executeHelpers.js';
import { repairServers } from '../../src/engine/entities.js';

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
        failureScope: 'pool',
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

  test('Preempted customer resumes with remaining service time and completes with the correct total duration', () => {
    const model = makeHospitalModel();
    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();

    const preemptIdx = result.log.findIndex(e => e.message?.includes('PREEMPT'));
    expect(preemptIdx).toBeGreaterThanOrEqual(0);
    const match = result.log[preemptIdx].message.match(/interrupted #(\d+) \[remaining ([\d.]+) t\]/);
    expect(match).toBeTruthy();
    const preemptedId = Number(match[1]);
    const remaining = Number(match[2]);
    const preemptTime = result.log[preemptIdx].time;

    // The exact same customer — not just "some" customer — must be re-seized
    // from the queue after being preempted.
    const reseizedAfterPreempt = result.log.some((e, i) =>
      i > preemptIdx && e.message?.includes(`#${preemptedId} (Waiting Room) → serving`)
    );
    expect(reseizedAfterPreempt).toBe(true);

    const preemptedCustomer = result.entitySummary.find(e => e.id === preemptedId);
    expect(preemptedCustomer.status).toBe('done');
    // Can't complete before its remaining service is actually consumed post-resume.
    expect(preemptedCustomer.completionTime).toBeGreaterThanOrEqual(preemptTime + remaining);
    expect(preemptedCustomer.sojournTime).toBeCloseTo(preemptedCustomer.completionTime - preemptedCustomer.arrivalTime, 4);
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

  test('the exact customer displaced by a server failure is later re-served to completion', () => {
    // Identify the customer riding the machine at the moment it fails by watching
    // snapshots directly (the FAILURE log line itself doesn't name the customer),
    // then confirm that same entity — not just "some" entity — eventually completes.
    // Uses mtbf=6 (not 8, like makeFactoryModel) so the failure lands strictly
    // mid-service rather than coinciding with a service's natural completion tick.
    const model = { ...makeFactoryModel() };
    model.entityTypes = model.entityTypes.map(et =>
      et.name === 'Machine' ? { ...et, mtbfDistParams: { value: '6' } } : et
    );
    const engine = buildEngine(model, 42, 0, 30);

    let displacedId = null;
    for (let i = 0; i < 1000; i++) {
      const before = engine.getSnap();
      const busyMachine = before.entities.find(e => e.role === 'server' && (e.status === 'busy' || e.status === 'serving'));
      const beforeCustId = busyMachine?.currentCustId ?? null;

      const r = engine.step();
      if (r.done) break;

      const machine = engine.getSnap().entities.find(e => e.role === 'server');
      if (machine.status === 'failed' && beforeCustId != null && displacedId == null) {
        displacedId = beforeCustId;
      }
    }
    expect(displacedId).not.toBeNull();

    const engine2 = buildEngine(model, 42, 0, 30);
    const result = engine2.runAll();
    const displaced = result.entitySummary.find(e => e.id === displacedId);
    expect(displaced).toBeDefined();
    expect(displaced.status).toBe('done');
  });

  test('Repair restores server to idle pool', () => {
    const model = makeFactoryModel();
    const engine = buildEngine(model, 42, 0, 30);
    const result = engine.runAll();

    const repairLog = result.log.filter(e => e.message?.includes('REPAIR'));
    expect(repairLog.length).toBeGreaterThan(0);
    expect(repairLog[0].message).toContain('restored');
  });

  test('perResource reports failureCount/totalDowntime/availability for fixed MTBF/MTTR', () => {
    // mtbf=8, mttr=3 (fixed) over maxSimTime=20: failures at 8 & 16, repairs at 11 & 19.
    const model = makeFactoryModel();
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();

    const machine = result.summary.perResource.Machine;
    expect(machine.failureCount).toBe(2);
    expect(machine.totalDowntime).toBeCloseTo(6, 4);
    expect(machine.availability).toBeCloseTo(1 - 6 / 20, 4);
    expect(machine.meanDowntimePerFailure).toBeCloseTo(3, 4);
  });

  test('Failures before warmup completes are excluded from perResource stats', () => {
    // First failure/repair cycle (8 -> 11) finishes before warmupPeriod=12, so it's
    // wiped by the warmup reset. Two more full cycles (16->19, 24->27) land after
    // warmup and within maxSimTime=28, so only those should be counted.
    const model = makeFactoryModel();
    const engine = buildEngine(model, 42, 12, 28);
    const result = engine.runAll();

    const machine = result.summary.perResource.Machine;
    expect(machine.failureCount).toBe(2);
    expect(machine.totalDowntime).toBeCloseTo(6, 4);
    expect(machine.availability).toBeCloseTo(1 - 6 / 16, 4);
  });

  test('makeBatchResult averages failureCount/totalDowntime/availability across replications (mean, not sum)', () => {
    const model = makeFactoryModel();
    const result1 = buildEngine(model, 1, 0, 20).runAll();   // 2 failures, 6 downtime (fixed dist, seed-independent)
    const result2 = buildEngine(model, 2, 0, 16).runAll();   // 1 failure (at t=8, repaired at t=11), 3 downtime

    const machine1 = result1.summary.perResource.Machine;
    const machine2 = result2.summary.perResource.Machine;
    expect(machine1.failureCount).toBe(2);
    expect(machine2.failureCount).toBe(1);

    const batch = makeBatchResult([{ result: result1 }, { result: result2 }], {}, 20, 0);
    const batchMachine = batch.summary.perResource.Machine;
    expect(batchMachine.failureCount).toBeCloseTo((machine1.failureCount + machine2.failureCount) / 2, 4);
    expect(batchMachine.totalDowntime).toBeCloseTo((machine1.totalDowntime + machine2.totalDowntime) / 2, 4);
    expect(batchMachine.availability).toBeCloseTo((machine1.availability + machine2.availability) / 2, 4);
  });

  test('repairServers flushes the pre-failure starvation interval instead of discarding it', () => {
    // Server was idle (starvation running) from t=2, failed at t=6, repaired at t=9.
    // The [2, 6) idle interval must be flushed into _starvationTime on repair, not lost.
    const srv = { id: 's1', type: 'Machine', status: 'failed', _starvationStart: 2, _failedAt: 6, _starvationTime: 0 };
    const count = repairServers([srv], 9);

    expect(count).toBe(1);
    expect(srv._starvationTime).toBeCloseTo(4, 4);
    expect(srv.status).toBe('idle');
    expect(srv._starvationStart).toBe(9);
    expect(srv._totalDowntime).toBeCloseTo(3, 4);
    expect(srv._failureCount).toBe(1);
  });

  test('repairServers accumulates the flushed interval onto existing _starvationTime', () => {
    const srv = { id: 's2', type: 'Machine', status: 'failed', _starvationStart: 10, _failedAt: 12, _starvationTime: 5 };
    repairServers([srv], 15);

    expect(srv._starvationTime).toBeCloseTo(7, 4);
  });

  test('repairServers adds nothing extra when there is no open starvation interval', () => {
    const srv = { id: 's3', type: 'Machine', status: 'failed', _starvationStart: null, _failedAt: 4, _starvationTime: 0 };
    repairServers([srv], 7);

    expect(srv._starvationTime).toBe(0);
  });
});
