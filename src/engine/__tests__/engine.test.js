import { beforeAll, describe, test, expect } from 'vitest';
import { buildEngine } from '../index.js';

// ── M/M/1 model fixture ───────────────────────────────────────────────────────
// Customer arrives at t=0, inter-arrival ~ Exp(2), service Fixed(3)
const mm1Model = {
  entityTypes: [
    { id: 'et1', name: 'Customer', role: 'customer', count: '', attrDefs: [] },
    {
      id: 'et2', name: 'Server', role: 'server', count: '1',
      attrDefs: [{ id: 'a1', name: 'serviceTime', dist: 'Fixed', distParams: { value: '3' } }],
    },
  ],
  stateVariables: [
    { id: 'sv1', name: 'totalArrived', initialValue: '0' },
  ],
  bEvents: [
    {
      id: 'b1', name: 'Customer Arrives', scheduledTime: '0',
      effect: 'ARRIVE(Customer); totalArrived++',
      schedules: [{ eventId: 'b1', dist: 'Exponential', distParams: { mean: '2' }, isRenege: false }],
    },
    {
      id: 'b2', name: 'Service Complete', scheduledTime: '999',
      effect: 'COMPLETE()', schedules: [],
    },
  ],
  cEvents: [
    {
      id: 'c1', name: 'Start Service',
      condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Customer, Server)',
      cSchedules: [{ id: 'cs1', eventId: 'b2', dist: 'ServerAttr', distParams: { attr: 'serviceTime' }, useEntityCtx: true }],
    },
  ],
};

// ── Two-server model fixture ──────────────────────────────────────────────────
// Patient arrives, goes to TriageNurse (RELEASE after 5), then Doctor (COMPLETE after 10)
// With the current engine, patients may cycle through Nurse multiple times before seeing Doctor,
// but we verify the RELEASE+COMPLETE machinery is functional.
const twoStageModel = {
  entityTypes: [
    { id: 'et1', name: 'Patient', role: 'customer', count: '', attrDefs: [] },
    { id: 'et2', name: 'TriageNurse', role: 'server', count: '1', attrDefs: [] },
    { id: 'et3', name: 'Doctor',      role: 'server', count: '1', attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b1', name: 'Patient Arrives', scheduledTime: '0',
      effect: 'ARRIVE(Patient)',
      schedules: [{ eventId: 'b1', dist: 'Exponential', distParams: { mean: '2' }, isRenege: false }],
    },
    { id: 'b2', name: 'Triage Complete',        scheduledTime: '999', effect: 'RELEASE(TriageNurse)', schedules: [] },
    { id: 'b3', name: 'Consultation Complete',  scheduledTime: '999', effect: 'COMPLETE()',            schedules: [] },
  ],
  cEvents: [
    {
      id: 'c1', name: 'Start Triage',
      condition: 'queue(Patient).length > 0 AND idle(TriageNurse).count > 0',
      effect: 'ASSIGN(Patient, TriageNurse)',
      cSchedules: [{ id: 'cs1', eventId: 'b2', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }],
    },
    {
      id: 'c2', name: 'Start Consultation',
      condition: 'queue(Patient).length > 0 AND idle(Doctor).count > 0',
      effect: 'ASSIGN(Patient, Doctor)',
      cSchedules: [{ id: 'cs2', eventId: 'b3', dist: 'Fixed', distParams: { value: '10' }, useEntityCtx: true }],
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildEngine public API', () => {
  test('returns object with step, runAll, getSnap, getFelSize', () => {
    const engine = buildEngine(mm1Model);
    expect(typeof engine.step).toBe('function');
    expect(typeof engine.runAll).toBe('function');
    expect(typeof engine.getSnap).toBe('function');
    expect(typeof engine.getFelSize).toBe('function');
  });
});

describe('initial state (M/M/1)', () => {
  test('getSnap clock = 0', () => {
    const engine = buildEngine(mm1Model);
    expect(engine.getSnap().clock).toBe(0);
  });

  test('getSnap served = 0', () => {
    const engine = buildEngine(mm1Model);
    expect(engine.getSnap().served).toBe(0);
  });

  test('getSnap reneged = 0', () => {
    const engine = buildEngine(mm1Model);
    expect(engine.getSnap().reneged).toBe(0);
  });

  test('getFelSize = 1 (only Customer Arrives at t=0 in initial FEL)', () => {
    const engine = buildEngine(mm1Model);
    expect(engine.getFelSize()).toBe(1);
  });
});

describe('step()', () => {
  test('first step returns done=false', () => {
    const engine = buildEngine(mm1Model);
    const result = engine.step();
    expect(result.done).toBe(false);
  });

  test('after first step, at least one entity exists in snap', () => {
    const engine = buildEngine(mm1Model);
    const result = engine.step();
    expect(result.snap.entities.length).toBeGreaterThan(0);
  });

  test('after first step, at least one customer has arrived', () => {
    const engine = buildEngine(mm1Model);
    engine.step();
    const snap = engine.getSnap();
    const customers = snap.entities.filter(e => e.role !== 'server');
    expect(customers.length).toBeGreaterThan(0);
  });

  test('clock advances after two steps', () => {
    const engine = buildEngine(mm1Model);
    engine.step(); // t=0
    engine.step(); // t=next arrival time > 0
    expect(engine.getSnap().clock).toBeGreaterThan(0);
  });

  test('step returns cycleLog with phase A entry', () => {
    const engine = buildEngine(mm1Model);
    const result = engine.step();
    expect(result.cycleLog.some(e => e.phase === 'A')).toBe(true);
  });

  test('step returns snap with byType map', () => {
    const engine = buildEngine(mm1Model);
    const result = engine.step();
    expect(result.snap.byType).toBeDefined();
  });
});

describe('runAll() M/M/1 model', () => {
  let result;

  beforeAll(() => {
    // Bound the open-ended arrival process so this file stays cheap to collect
    // and does not build an enormous snapshot log before tests are registered.
    result = buildEngine(mm1Model, 123, 0, 50).runAll();
  });

  test('returns finalTime, summary, log, snap, entitySummary', () => {
    expect(result).toHaveProperty('finalTime');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('log');
    expect(result).toHaveProperty('snap');
    expect(result).toHaveProperty('entitySummary');
  });

  test('summary.total > 0 (customers arrived)', () => {
    expect(result.summary.total).toBeGreaterThan(0);
  });

  test('summary.served > 0 (customers were served)', () => {
    expect(result.summary.served).toBeGreaterThan(0);
  });

  test('summary.reneged === 0 (no reneging in this model)', () => {
    expect(result.summary.reneged).toBe(0);
  });

  test('summary.served <= summary.total', () => {
    expect(result.summary.served).toBeLessThanOrEqual(result.summary.total);
  });

  test('all done customers have sojournTime > 0', () => {
    const done = result.entitySummary.filter(e => e.status === 'done');
    expect(done.length).toBeGreaterThan(0);
    for (const e of done) {
      expect(e.sojournTime).toBeGreaterThan(0);
    }
  });

  test('all done customers have stages.length === 1', () => {
    const done = result.entitySummary.filter(e => e.status === 'done');
    for (const e of done) {
      expect(e.stages.length).toBe(1);
    }
  });

  test('log contains entries with phase A, B, and C', () => {
    const phases = new Set(result.log.map(e => e.phase));
    expect(phases.has('A')).toBe(true);
    expect(phases.has('B')).toBe(true);
    expect(phases.has('C')).toBe(true);
  });

  test('state variable totalArrived is tracked in snap.scalars', () => {
    expect(result.snap.scalars.totalArrived).toBeGreaterThan(0);
    expect(result.snap.scalars.totalArrived).toBe(result.summary.total);
  });
});

describe('two-stage model (TriageNurse + Doctor)', () => {
  let result;

  beforeAll(() => {
    result = buildEngine(twoStageModel, 200, 0, 50).runAll();
  });

  test('runs without error and returns summary', () => {
    expect(result.summary).toBeDefined();
  });

  test('summary.served > 0 (some patients completed)', () => {
    expect(result.summary.served).toBeGreaterThan(0);
  });

  test('done patients have sojournTime > 0', () => {
    const done = result.entitySummary.filter(e => e.status === 'done');
    expect(done.length).toBeGreaterThan(0);
    for (const e of done) {
      expect(e.sojournTime).toBeGreaterThan(0);
    }
  });

  test('done patients have at least 1 stage', () => {
    const done = result.entitySummary.filter(e => e.status === 'done');
    for (const e of done) {
      expect(e.stages.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('entitySummary contains both TriageNurse and Doctor server entities', () => {
    const types = new Set(result.entitySummary.map(e => e.type));
    expect(types.has('TriageNurse')).toBe(true);
    expect(types.has('Doctor')).toBe(true);
  });
});

describe('seed reproducibility', () => {
  test('two runs with the same seed produce identical summary.served', () => {
    const r1 = buildEngine(mm1Model, 42, 0, 50).runAll();
    const r2 = buildEngine(mm1Model, 42, 0, 50).runAll();
    expect(r1.summary.served).toBe(r2.summary.served);
    expect(r1.summary.served).toBeGreaterThan(0);
  });
});
