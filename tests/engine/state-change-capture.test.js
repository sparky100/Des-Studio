// Structured state-variable change capture (SET / ROUND_ROBIN / scalar shorthand).
// The engine records { time, variable, from, to, sourceEventId, sourceEventName, phase }
// for every model-level state-variable write, exposed on the run result and per-step.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => {
  resetSeq();
});

// ── Fixture ───────────────────────────────────────────────────────────────────

// M/M/1 where every arrival and every assignment also touches state variables:
//   B-event "Arrive"  → SET(arrivals, arrivals + 1)
//   C-event "Assign"  → SET(servedCount, servedCount + 1); ROUND_ROBIN(route, 3); cap++
function makeStatefulModel() {
  return {
    entityTypes: [
      { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
    bEvents: [
      {
        id: 'arr', name: 'Arrive', scheduledTime: '0',
        effect: 'ARRIVE(Customer, Queue); SET(arrivals, arrivals + 1)',
        schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '5' } }],
      },
      { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [{
      id: 'a', name: 'Assign', priority: 1,
      condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Queue, Server); SET(servedCount, servedCount + 1); ROUND_ROBIN(route, 3); cap++',
      cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }],
    }],
    stateVariables: [
      { name: 'arrivals', initialValue: '0' },
      { name: 'servedCount', initialValue: '0' },
      { name: 'route', initialValue: '0' },
      { name: 'cap', initialValue: '0' },
    ],
  };
}

function runStateful(seed = 42, maxSimTime = 30) {
  return buildEngine(makeStatefulModel(), seed, 0, maxSimTime).runAll();
}

// ── SET ───────────────────────────────────────────────────────────────────────

describe('state change capture — SET', () => {
  test('records a change with from/to, source event, and phase for a B-event SET', () => {
    const result = runStateful();
    const arrivalChanges = result.stateChanges.filter(c => c.variable === 'arrivals');
    expect(arrivalChanges.length).toBeGreaterThan(0);
    const first = arrivalChanges[0];
    expect(first).toMatchObject({
      variable: 'arrivals',
      from: 0,
      to: 1,
      sourceEventName: 'Arrive',
      phase: 'B',
    });
    expect(first.time).toBeGreaterThanOrEqual(0);
    expect(first.sourceEventId).toBe('arr');
  });

  test('records a change for a C-event SET with phase C', () => {
    const result = runStateful();
    const servedChanges = result.stateChanges.filter(c => c.variable === 'servedCount');
    expect(servedChanges.length).toBeGreaterThan(0);
    expect(servedChanges[0]).toMatchObject({
      variable: 'servedCount',
      from: 0,
      to: 1,
      sourceEventName: 'Assign',
      phase: 'C',
    });
  });

  test('records the correct from value on repeated writes', () => {
    const result = runStateful();
    const servedChanges = result.stateChanges.filter(c => c.variable === 'servedCount');
    for (let i = 0; i < servedChanges.length; i++) {
      expect(servedChanges[i].from).toBe(i);
      expect(servedChanges[i].to).toBe(i + 1);
    }
  });
});

// ── ROUND_ROBIN ───────────────────────────────────────────────────────────────

describe('state change capture — ROUND_ROBIN', () => {
  test('records each rotation with from/to wrapping back to 0', () => {
    const result = runStateful();
    const routeChanges = result.stateChanges.filter(c => c.variable === 'route');
    expect(routeChanges.length).toBeGreaterThan(0);
    expect(routeChanges[0]).toMatchObject({ from: 0, to: 1, phase: 'C', sourceEventName: 'Assign' });
    const last = routeChanges[routeChanges.length - 1];
    expect(last.to).toBe((last.from + 1) % 3);
  });
});

// ── Scalar shorthand ──────────────────────────────────────────────────────────

describe('state change capture — scalar shorthand', () => {
  test('records VAR++ writes', () => {
    const result = runStateful();
    const capChanges = result.stateChanges.filter(c => c.variable === 'cap');
    expect(capChanges.length).toBeGreaterThan(0);
    expect(capChanges[0]).toMatchObject({ from: 0, to: 1, phase: 'C', sourceEventName: 'Assign' });
  });
});

// ── Negative: entity/container writes are not state variables ────────────────

describe('state change capture — non-state-variable writes', () => {
  test('SET_ATTR, FILL, and DRAIN produce no state change records', () => {
    const model = {
      entityTypes: [
        { id: 'et-patient', name: 'Patient', role: 'customer', attrDefs: [] },
        { id: 'et-nurse', name: 'Nurse', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [
        { id: 'q-wait', name: 'Waiting Queue', discipline: 'FIFO' },
      ],
      containerTypes: [{ id: 'Tank', capacity: '100', initialLevel: '50' }],
      stateVariables: [],
      bEvents: [
        { id: 'be-arrive', name: 'Patient Arrives', scheduledTime: '0', effect: 'ARRIVE(Patient, Waiting Queue)', schedules: [] },
        { id: 'be-release', name: 'Service Complete', scheduledTime: '9999', effect: 'RELEASE(Nurse)', schedules: [] },
      ],
      cEvents: [{
        id: 'ce-serve', name: 'Start Service', priority: 1,
        condition: 'queue(Waiting Queue).length > 0 AND idle(Nurse).count > 0',
        effect: 'ASSIGN(Waiting Queue, Nurse); SET_ATTR(priority, 5); FILL(Tank, 10)',
        cSchedules: [{ eventId: 'be-release', dist: 'Fixed', distParams: { value: '2' }, useEntityCtx: true }],
      }],
    };
    const result = buildEngine(model, 42, 0, 20).runAll();
    expect(result.stateChanges).toEqual([]);
    // The writes themselves still happened (observational capture must not block them)
    expect(result.snap.scalars).toEqual({});
    const patient = result.entitySummary.find(e => e.role === 'customer');
    expect(patient?.attrs?.priority).toBe(5);
  });
});

// ── Ordering, final values, determinism ───────────────────────────────────────

describe('state change capture — ordering and determinism', () => {
  test('changes are chronological and the last value per variable matches the final snapshot', () => {
    const result = runStateful();
    const times = result.stateChanges.map(c => c.time);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    const lastByVar = {};
    for (const c of result.stateChanges) lastByVar[c.variable] = c.to;
    for (const [variable, to] of Object.entries(lastByVar)) {
      expect(result.snap.scalars[variable]).toBe(to);
    }
  });

  test('same seed replays bit-identical state changes and final scalars', () => {
    const a = runStateful(42, 30);
    const b = runStateful(42, 30);
    expect(a.stateChanges).toEqual(b.stateChanges);
    expect(a.snap.scalars).toEqual(b.snap.scalars);
  });

  test('different seeds produce different state change sequences', () => {
    // Random (exponential) inter-arrival so the seed actually changes the run
    const model = makeStatefulModel();
    model.bEvents[0].schedules = [{ eventId: 'arr', dist: 'exponential', distParams: { mean: '5' } }];
    const a = buildEngine(model, 42, 0, 30).runAll();
    const b = buildEngine(model, 7, 0, 30).runAll();
    expect(a.stateChanges).not.toEqual(b.stateChanges);
  });
});

// ── Per-step exposure ─────────────────────────────────────────────────────────

describe('state change capture — per-step exposure', () => {
  test('step() returns the state changes produced by that cycle', () => {
    const engine = buildEngine(makeStatefulModel(), 42, 0, 30);
    let sawChanges = false;
    let steps = 0;
    while (steps < 200) {
      const r = engine.step();
      steps++;
      if (r.stateChanges?.length) {
        sawChanges = true;
        for (const c of r.stateChanges) {
          expect(c).toHaveProperty('time');
          expect(c).toHaveProperty('variable');
          expect(c).toHaveProperty('from');
          expect(c).toHaveProperty('to');
          expect(c).toHaveProperty('sourceEventName');
          expect(c).toHaveProperty('phase');
        }
        break;
      }
      if (r.done) break;
    }
    expect(sawChanges).toBe(true);
  });
});