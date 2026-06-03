// Tests for attribute-conditional cSchedule `when` predicates (Sprint 64)
import { describe, test, expect } from 'vitest';
import { fireCEvent } from '../phases.js';
import { B_HIP, B_KNEE, B_GEN, makeWhenModel, makeStandardScheduleEv } from './helpers/fixtures.js';

// Minimal context builder
function makeCtx(overrides = {}) {
  const entities = overrides.entities || [];
  return {
    clock: 0,
    model: { bEvents: [], queues: [], entityTypes: [], ...overrides.model },
    entities,
    state: { __served: 0, __reneged: 0 },
    rng: () => 0.5,
    helpers: { waitingOf: () => [], idleOf: () => [], busyOf: () => [] },
    nextId: (() => { let n = 1; return () => `e${n++}`; })(),
    registry: null,
    incEventCount: () => {},
  };
}

describe('cSchedule `when` condition — first-match semantics', () => {
  test('selects hip cSchedule when entity has surgery_type=hip', () => {
    const ctx = makeCtx({
      model: makeWhenModel(),
      entities: [{ id: 'p1', type: 'Patient', status: 'serving', attrs: { surgery_type: 'hip' } }],
    });
    ctx._lastCustId = 'p1';
    const { felEntries } = fireCEvent(makeStandardScheduleEv(), ctx);
    expect(felEntries).toHaveLength(1);
    expect(felEntries[0].id).toBe('b_hip');
    expect(felEntries[0].scheduledTime).toBe(120);
  });

  test('selects knee cSchedule when entity has surgery_type=knee', () => {
    const ctx = makeCtx({
      model: makeWhenModel(),
      entities: [{ id: 'p2', type: 'Patient', status: 'serving', attrs: { surgery_type: 'knee' } }],
    });
    ctx._lastCustId = 'p2';
    const { felEntries } = fireCEvent(makeStandardScheduleEv(), ctx);
    expect(felEntries).toHaveLength(1);
    expect(felEntries[0].id).toBe('b_knee');
    expect(felEntries[0].scheduledTime).toBe(90);
  });

  test('falls back to unconditional entry when no when-condition matches', () => {
    const ctx = makeCtx({
      model: makeWhenModel(),
      entities: [{ id: 'p3', type: 'Patient', status: 'serving', attrs: { surgery_type: 'spine' } }],
    });
    ctx._lastCustId = 'p3';
    const { felEntries } = fireCEvent(makeStandardScheduleEv(), ctx);
    expect(felEntries).toHaveLength(1);
    expect(felEntries[0].id).toBe('b_gen');
    expect(felEntries[0].scheduledTime).toBe(60);
  });

  test('fires nothing when all conditions have `when` and none match', () => {
    const ctx = makeCtx({
      model: makeWhenModel(),
      entities: [{ id: 'p4', type: 'Patient', status: 'serving', attrs: { surgery_type: 'spine' } }],
    });
    ctx._lastCustId = 'p4';

    const ev = {
      id: 'ce1',
      name: 'Assign',
      effect: '',
      cSchedules: [
        { id: 'cs1', eventId: 'b_hip',  dist: 'Fixed', distParams: { value: '120' }, useEntityCtx: false,
          when: { variable: 'Entity.surgery_type', operator: '==', value: 'hip' } },
        { id: 'cs2', eventId: 'b_knee', dist: 'Fixed', distParams: { value: '90' },  useEntityCtx: false,
          when: { variable: 'Entity.surgery_type', operator: '==', value: 'knee' } },
      ],
    };

    const { felEntries } = fireCEvent(ev, ctx);
    expect(felEntries).toHaveLength(0);
  });

  test('no `when` on any entry → all entries fire (legacy behaviour)', () => {
    const ctx = makeCtx({
      model: makeWhenModel(),
      entities: [{ id: 'p5', type: 'Patient', status: 'serving', attrs: {} }],
    });
    ctx._lastCustId = 'p5';

    const ev = {
      id: 'ce1',
      name: 'Assign',
      effect: '',
      cSchedules: [
        { id: 'cs1', eventId: 'b_hip',  dist: 'Fixed', distParams: { value: '120' }, useEntityCtx: false },
        { id: 'cs2', eventId: 'b_gen',  dist: 'Fixed', distParams: { value: '60' },  useEntityCtx: false },
      ],
    };

    const { felEntries } = fireCEvent(ev, ctx);
    expect(felEntries).toHaveLength(2);
  });

  test('numeric attribute comparison works', () => {
    const ctx = makeCtx({
      model: makeWhenModel(),
      entities: [{ id: 'p6', type: 'Patient', status: 'serving', attrs: { priority: 1 } }],
    });
    ctx._lastCustId = 'p6';

    const ev = {
      id: 'ce1',
      name: 'Assign',
      effect: '',
      cSchedules: [
        { id: 'cs1', eventId: 'b_hip',  dist: 'Fixed', distParams: { value: '30' }, useEntityCtx: false,
          when: { variable: 'Entity.priority', operator: '<=', value: 2 } },
        { id: 'cs2', eventId: 'b_gen',  dist: 'Fixed', distParams: { value: '60' }, useEntityCtx: false },
      ],
    };

    const { felEntries } = fireCEvent(ev, ctx);
    expect(felEntries).toHaveLength(1);
    expect(felEntries[0].id).toBe('b_hip');
  });

  test('compound AND predicate', () => {
    const ctx = makeCtx({
      model: makeWhenModel(),
      entities: [{ id: 'p7', type: 'Patient', status: 'serving', attrs: { surgery_type: 'hip', priority: 1 } }],
    });
    ctx._lastCustId = 'p7';

    const ev = {
      id: 'ce1',
      name: 'Assign',
      effect: '',
      cSchedules: [
        { id: 'cs1', eventId: 'b_hip',  dist: 'Fixed', distParams: { value: '60' }, useEntityCtx: false,
          when: { operator: 'AND', clauses: [
            { variable: 'Entity.surgery_type', operator: '==', value: 'hip' },
            { variable: 'Entity.priority', operator: '==', value: 1 },
          ] } },
        { id: 'cs2', eventId: 'b_gen',  dist: 'Fixed', distParams: { value: '60' }, useEntityCtx: false },
      ],
    };

    const { felEntries } = fireCEvent(ev, ctx);
    expect(felEntries).toHaveLength(1);
    expect(felEntries[0].id).toBe('b_hip');
  });
});

describe('V29 validation — cSchedule with all when, no fallback', () => {
  test('warns when all cSchedules have `when` and no fallback', async () => {
    const { validateModel } = await import('../validation.js');
    const model = {
      entityTypes: [{ id: 'et1', name: 'Patient', role: 'customer', count: 1 }],
      queues: [{ id: 'q1', name: 'Waiting', entityTypeId: 'et1' }],
      bEvents: [
        { id: 'b1', name: 'Arrives', scheduleType: 'Poisson', distParams: { rate: '1' } },
        { id: 'b2', name: 'Hip Done', scheduleType: 'Fixed', distParams: { value: '1' } },
      ],
      cEvents: [{
        id: 'ce1',
        name: 'Assign',
        condition: '',
        effect: '',
        cSchedules: [
          { id: 'cs1', eventId: 'b2', dist: 'Fixed', distParams: { value: '30' },
            when: { variable: 'Entity.surgery_type', operator: '==', value: 'hip' } },
          { id: 'cs2', eventId: 'b2', dist: 'Fixed', distParams: { value: '60' },
            when: { variable: 'Entity.surgery_type', operator: '==', value: 'knee' } },
        ],
      }],
      stateVariables: [],
    };
    const result = validateModel(model);
    const v29 = result.warnings.find(w => w.code === 'V29');
    expect(v29).toBeTruthy();
    expect(v29.message).toMatch(/fallback/i);
  });

  test('no V29 warning when a fallback entry exists', async () => {
    const { validateModel } = await import('../validation.js');
    const model = {
      entityTypes: [{ id: 'et1', name: 'Patient', role: 'customer', count: 1 }],
      queues: [{ id: 'q1', name: 'Waiting', entityTypeId: 'et1' }],
      bEvents: [
        { id: 'b1', name: 'Arrives', scheduleType: 'Poisson', distParams: { rate: '1' } },
        { id: 'b2', name: 'Done', scheduleType: 'Fixed', distParams: { value: '1' } },
      ],
      cEvents: [{
        id: 'ce1',
        name: 'Assign',
        condition: '',
        effect: '',
        cSchedules: [
          { id: 'cs1', eventId: 'b2', dist: 'Fixed', distParams: { value: '30' },
            when: { variable: 'Entity.surgery_type', operator: '==', value: 'hip' } },
          { id: 'cs2', eventId: 'b2', dist: 'Fixed', distParams: { value: '60' } }, // fallback
        ],
      }],
      stateVariables: [],
    };
    const result = validateModel(model);
    expect(result.warnings.find(w => w.code === 'V29')).toBeUndefined();
  });
});
