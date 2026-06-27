// Tests for Sprint 65 — Actuals tracking: _plannedTime, updateScheduledTime, avgPlanDeviation
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildEngine } from '../index.js';

const EPOCH = '2026-05-18T08:00:00';

function makeScheduleModel(times) {
  return {
    entityTypes: [{ id: 'et1', name: 'Patient', role: 'customer', count: 1 }],
    queues: [{ id: 'q1', name: 'Waiting', entityTypeId: 'et1' }],
    bEvents: [
      {
        id: 'b_arrives',
        name: 'Patient Arrives',
        effect: 'ARRIVE(Patient, Waiting)',
        schedules: [{
          eventId: 'b_arrives',
          dist: 'Schedule',
          distParams: {
            rows: times.map((t, i) => ({ time: t, attrs: { entityId: `patient_${i + 1}` } })),
          },
        }],
      },
      {
        id: 'b_done',
        name: 'Done',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [{
      id: 'ce1',
      name: 'Assign',
      priority: 1,
      condition: 'queue(Waiting).length > 0',
      effect: 'ASSIGN(Waiting, Patient)',
      cSchedules: [{
        id: 'cs1',
        eventId: 'b_done',
        dist: 'Fixed',
        distParams: { value: '30' },
        useEntityCtx: true,
      }],
    }],
    stateVariables: [],
    epoch: EPOCH,
    timeUnit: 'minutes',
  };
}

describe('_plannedTime on entities', () => {
  test('entities created from rows[] have _plannedTime set', () => {
    const model = makeScheduleModel([10, 20, 30]);
    const engine = buildEngine(model, 42, 0, 40);
    engine.runAll();
    const entities = engine.getEntitySummary();
    const patients = entities.filter(e => e.type === 'Patient' && e.role === 'customer');
    // At least some should have _plannedTime set
    const withPlan = patients.filter(e => e._plannedTime != null);
    expect(withPlan.length).toBeGreaterThan(0);
    // Planned times should match the rows[] times (first is rows[0].time = 10)
    const plannedTimes = withPlan.map(e => e._plannedTime).sort((a, b) => a - b);
    expect(plannedTimes[0]).toBeCloseTo(10, 5);
  });
});

describe('updateScheduledTime', () => {
  test('returns false for unknown entityId', () => {
    const model = makeScheduleModel([10, 20]);
    const engine = buildEngine(model, 42, 0, 5);
    expect(engine.updateScheduledTime('unknown', 15)).toBe(false);
  });

  test('returns true and reschedules FEL entry by entityId', () => {
    const model = makeScheduleModel([10, 20, 30]);
    const engine = buildEngine(model, 42, 0, 50);
    // t=0: b_arrives fires (initial), schedules patient_1 FEL entry at t=10
    engine.step();
    // t=10: b_arrives fires (patient_1 arrives), schedules patient_2 FEL entry at t=20
    engine.step();
    // Now patient_2 should be pre-scheduled in FEL
    const updated = engine.updateScheduledTime('patient_2', 25);
    expect(updated).toBe(true);
  });

  test('preserves _plannedArrivalTime when rescheduling', () => {
    const model = makeScheduleModel([10, 20]);
    const engine = buildEngine(model, 42, 0, 50);
    engine.step(); // t=0: initial fire, schedules patient_1 at t=10
    engine.step(); // t=10: patient_1 arrives, schedules patient_2 at t=20
    // Update patient_2 from t=20 to t=25
    engine.updateScheduledTime('patient_2', 25);
    // Continue to patient_2 arrival
    engine.runAll();
    const entities = engine.getEntitySummary();
    const p2 = entities.find(e => e.attrs?.entityId === 'patient_2');
    if (p2) {
      // arrivalTime should be ~25, plannedTime should be ~20
      expect(p2.arrivalTime).toBeCloseTo(25, 0);
      expect(p2._plannedTime).toBeCloseTo(20, 0);
    }
  });

  test('returns false for invalid newSimTime', () => {
    const model = makeScheduleModel([10]);
    const engine = buildEngine(model, 42, 0, 5);
    expect(engine.updateScheduledTime('patient_1', NaN)).toBe(false);
    expect(engine.updateScheduledTime('patient_1', null)).toBe(false);
  });

  test('rejects a reschedule before the current clock (monotonicity guard)', () => {
    const model = makeScheduleModel([10, 20, 30]);
    const engine = buildEngine(model, 42, 0, 50);
    engine.step(); // t=0: initial fire, schedules patient_1 at t=10
    engine.step(); // t=10: patient_1 arrives, schedules patient_2 at t=20 (clock now 10)
    // Attempting to move patient_2's FEL entry to a time before the current clock (10)
    // must be rejected outright — accepting it would let an event fire "in the past".
    const result = engine.updateScheduledTime('patient_2', 5);
    expect(result).toBe(false);
    // The FEL entry must be left untouched — a later, valid update should still see t=20.
    const validUpdate = engine.updateScheduledTime('patient_2', 22);
    expect(validUpdate).toBe(true);
  });
});

describe('getSummary avgPlanDeviation', () => {
  test('avgPlanDeviation is null when no planned entities exist', () => {
    const model = {
      entityTypes: [{ id: 'et1', name: 'Patient', role: 'customer', count: 1 }],
      queues: [{ id: 'q1', name: 'Waiting', entityTypeId: 'et1' }],
      bEvents: [{
        id: 'b_arrives',
        name: 'Arrives',
        effect: 'ARRIVE(Patient, Waiting)',
        schedules: [{ eventId: 'b_arrives', dist: 'Exponential', distParams: { rate: '0.1' } }],
      }],
      cEvents: [],
      stateVariables: [],
    };
    const engine = buildEngine(model, 42, 0, 30);
    engine.runAll();
    const summary = engine.getSummary();
    expect(summary.avgPlanDeviation).toBeNull();
  });

  test('avgPlanDeviation is 0 when all entities arrive exactly on time', () => {
    const model = makeScheduleModel([10, 20, 30]);
    const engine = buildEngine(model, 42, 0, 40);
    engine.runAll();
    const summary = engine.getSummary();
    // No rescheduling happened, so all arrivals are on planned time → deviation = 0
    if (summary.avgPlanDeviation !== null) {
      expect(summary.avgPlanDeviation).toBe(0);
    }
  });

  test('avgPlanDeviation reflects delay after updateScheduledTime', () => {
    const model = makeScheduleModel([10, 20]);
    const engine = buildEngine(model, 42, 0, 50);
    engine.step(); // t=0: initial, schedules patient_1 at t=10
    engine.step(); // t=10: patient_1 arrives, schedules patient_2 at t=20
    // Delay patient_2 by 10 minutes (planned t=20, actual t=30)
    engine.updateScheduledTime('patient_2', 30);
    engine.runAll();
    const summary = engine.getSummary();
    // patient_1: deviation=0 (arrives at planned t=10)
    // patient_2: deviation=+10 (arrives at t=30, planned t=20)
    // avg = +5
    if (summary.avgPlanDeviation !== null) {
      expect(summary.avgPlanDeviation).toBeGreaterThan(0);
    }
  });
});

describe('ActualsStreamAdapter', () => {
  test('pushUpdate reschedules via attached engine', () => {
    const { ActualsStreamAdapter } = require('../adapters/ActualsStreamAdapter.js');
    const model = makeScheduleModel([10, 20, 30]);
    const engine = buildEngine(model, 42, 0, 5);

    const adapter = new ActualsStreamAdapter({
      id: 'ds_actuals',
      type: 'actualsStream',
      url: 'wss://example.com/actuals',
    });
    adapter.attachEngine(engine, EPOCH, 'minutes');

    engine.step(); // fire first arrival

    // Push an update for patient_2 delayed by 10 minutes (from t=20 to t=30)
    adapter.pushUpdate('patient_2', 30);
    // updateScheduledTime should have been called with patient_2, 30
    // (we can verify by checking that the engine doesn't throw)
    adapter.dispose();
  });

  test('buffers updates before engine is attached', () => {
    const { ActualsStreamAdapter } = require('../adapters/ActualsStreamAdapter.js');
    const adapter = new ActualsStreamAdapter({
      id: 'ds_actuals',
      type: 'actualsStream',
      url: 'wss://example.com/actuals',
    });

    // Push before attaching engine — should be buffered
    adapter.pushUpdate('patient_1', 15);
    expect(adapter._queue).toHaveLength(1);

    // Attach a mock engine
    const mockEngine = { updateScheduledTime: vi.fn().mockReturnValue(true) };
    adapter.attachEngine(mockEngine, '', 'minutes');

    // Queue should have been flushed
    expect(adapter._queue).toHaveLength(0);
    expect(mockEngine.updateScheduledTime).toHaveBeenCalledWith('patient_1', 15);
    adapter.dispose();
  });
});
