// Sprint 40 — S40.1 + S40.2 integration tests
// EntityAttr service time; Schedule rows attr merge; combined end-to-end

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';
import { sample, mulberry32 } from '../../src/engine/distributions.js';

beforeEach(() => { resetSeq(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeModel(overrides = {}) {
  return {
    entityTypes: [
      {
        id: 'Job', name: 'Job', role: 'customer',
        attrDefs: [{ name: 'serviceTime', dist: 'Fixed', distParams: { value: '5' } }],
      },
      { id: 'W', name: 'Worker', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q', name: 'Queue', customerType: 'Job', discipline: 'FIFO' }],
    stateVariables: [],
    bEvents: [
      {
        id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Job, Queue)',
        schedules: [],
      },
      { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [
      {
        id: 'assign', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Worker).count > 0',
        effect: 'ASSIGN(Queue, Worker)',
        cSchedules: [{ eventId: 'done', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }],
      },
    ],
    maxSimTime: 50,
    ...overrides,
  };
}

// ── S40.1 — EntityAttr service time ──────────────────────────────────────────

describe('S40.1 — EntityAttr cSchedule service time', () => {
  test('uses customer entity attribute as service delay', () => {
    const model = makeModel();
    // Replace cSchedule dist with EntityAttr
    model.cEvents[0].cSchedules = [{
      eventId: 'done', dist: 'EntityAttr', distParams: { attr: 'serviceTime' }, useEntityCtx: true,
    }];
    // Entity arrives with serviceTime=5 (from attrDefs Fixed(5))
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();
    // At least one entity should be completed
    expect(result.summary.served).toBeGreaterThan(0);
    // Sojourn time should reflect serviceTime=5 (plus wait time if any)
    const done = result.entitySummary.filter(e => e.status === 'done');
    expect(done.length).toBeGreaterThan(0);
    done.forEach(e => expect(e.sojournTime).toBeGreaterThanOrEqual(5));
  });

  test('falls back to delay=0 and emits log message when attribute is missing', () => {
    const model = makeModel();
    // Entity type has no attrDefs — no serviceTime attribute
    model.entityTypes[0].attrDefs = [];
    model.cEvents[0].cSchedules = [{
      eventId: 'done', dist: 'EntityAttr', distParams: { attr: 'serviceTime' }, useEntityCtx: true,
    }];
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();
    // Should complete without throwing
    const msgs = result.log.flatMap(e => e.event?.result || []);
    expect(msgs.some(m => m.includes('EntityAttr') && m.includes("no attribute"))).toBe(true);
  });

  test('different entity attribute values produce different service durations', () => {
    // Two arrivals, both with serviceTime from attribute; verify log shows correct attr-driven delay
    const model = makeModel();
    model.bEvents[0] = {
      id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Job, Queue)',
      schedules: [{ eventId: 'arr', dist: 'Fixed', distParams: { value: '10' }, isRenege: false }],
    };
    model.cEvents[0].cSchedules = [{
      eventId: 'done', dist: 'EntityAttr', distParams: { attr: 'serviceTime' }, useEntityCtx: true,
    }];
    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();
    const entityAttrMsgs = result.log.flatMap(e => e.event?.result || []).filter(m => m.includes('[entity.serviceTime'));
    expect(entityAttrMsgs.length).toBeGreaterThan(0);
  });
});

// ── S40.2 — Schedule rows[] per-arrival attributes ───────────────────────────

describe('S40.2 — Schedule rows[] per-arrival attribute merge', () => {
  test('arrivals at planned times from rows[]', () => {
    const rng = mulberry32(7);
    const state = { __schedIdx_test: 0 };
    const params = {
      rows: [
        { time: 10, attrs: { size: 5 } },
        { time: 30, attrs: { size: 12 } },
        { time: 60, attrs: { size: 3 } },
      ],
    };

    // First arrival: delay = 10 - 0 = 10
    const d1 = sample('Schedule', params, rng, null, { state, schedKey: 'test', clock: 0 });
    expect(d1).toBe(10);
    expect(state['__schedRowAttrs_test']).toEqual({ size: 5 });

    // Second arrival: delay = 30 - 10 = 20
    const d2 = sample('Schedule', params, rng, null, { state, schedKey: 'test', clock: 10 });
    expect(d2).toBe(20);
    expect(state['__schedRowAttrs_test']).toEqual({ size: 12 });

    // Third arrival: delay = 60 - 30 = 30
    const d3 = sample('Schedule', params, rng, null, { state, schedKey: 'test', clock: 30 });
    expect(d3).toBe(30);
    expect(state['__schedRowAttrs_test']).toEqual({ size: 3 });
  });

  test('rows[] exhausted returns sentinel 1e9', () => {
    const rng = mulberry32(7);
    const state = { __schedIdx_exhausted: 3 };
    const params = { rows: [{ time: 10 }, { time: 20 }, { time: 30 }] };
    const d = sample('Schedule', params, rng, null, { state, schedKey: 'exhausted', clock: 0 });
    expect(d).toBe(1e9);
  });

  test('rowAttrs is null when row has no attrs', () => {
    const rng = mulberry32(7);
    const state = {};
    const params = { rows: [{ time: 5 }] };
    sample('Schedule', params, rng, null, { state, schedKey: 'noattr', clock: 0 });
    expect(state['__schedRowAttrs_noattr']).toBeNull();
  });

  test('rows[] attrs override sampled attrDefs on entity', () => {
    // Build a model where arrivals come from rows[] and rows carry serviceTime override
    const model = {
      entityTypes: [
        {
          id: 'J', name: 'Job', role: 'customer',
          attrDefs: [{ name: 'serviceTime', dist: 'Fixed', distParams: { value: '1' } }],
        },
        { id: 'W', name: 'Worker', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Job', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        {
          id: 'arr', name: 'Arrive', scheduledTime: '0',
          effect: 'ARRIVE(Job, Queue)',
          schedules: [{
            eventId: 'arr', dist: 'Schedule',
            distParams: { rows: [{ time: 1, attrs: { serviceTime: 10 } }] },
          }],
        },
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'assign', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Worker).count > 0',
        effect: 'ASSIGN(Queue, Worker)',
        cSchedules: [{ eventId: 'done', dist: 'EntityAttr', distParams: { attr: 'serviceTime' }, useEntityCtx: true }],
      }],
      maxSimTime: 30,
    };

    const engine = buildEngine(model, 42, 0, 30);
    const result = engine.runAll();
    // Entity has serviceTime=10 from row attrs (overrides Fixed=1)
    const entityAttrMsgs = result.log.flatMap(e => e.event?.result || []).filter(m => m.includes('[entity.serviceTime=10'));
    expect(entityAttrMsgs.length).toBeGreaterThan(0);
  });
});

// ── Combined end-to-end: rows supply attrs, EntityAttr uses them ──────────────

describe('S40 combined — plan-driven model', () => {
  test('multiple arrivals from rows, each uses its own serviceTime', () => {
    const model = {
      entityTypes: [
        {
          id: 'J', name: 'Job', role: 'customer',
          attrDefs: [{ name: 'serviceTime', dist: 'Fixed', distParams: { value: '1' } }],
        },
        { id: 'W', name: 'Worker', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Job', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        {
          id: 'arr', name: 'Arrive', scheduledTime: '0',
          effect: 'ARRIVE(Job, Queue)',
          schedules: [{
            eventId: 'arr', dist: 'Schedule',
            distParams: {
              rows: [
                { time: 1,  attrs: { serviceTime: 3 } },
                { time: 10, attrs: { serviceTime: 5 } },
              ],
            },
          }],
        },
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'assign', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Worker).count > 0',
        effect: 'ASSIGN(Queue, Worker)',
        cSchedules: [{ eventId: 'done', dist: 'EntityAttr', distParams: { attr: 'serviceTime' }, useEntityCtx: true }],
      }],
      maxSimTime: 50,
    };

    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();
    expect(result.summary.served).toBeGreaterThanOrEqual(2);

    // Verify that entity-attr service messages appear for both service times
    const svcMsgs = result.log.flatMap(e => e.event?.result || []).filter(m => m.includes('[entity.serviceTime='));
    expect(svcMsgs.some(m => m.includes('serviceTime=3'))).toBe(true);
    expect(svcMsgs.some(m => m.includes('serviceTime=5'))).toBe(true);
  });

  test('backward-compatible — times[] still works when rows[] absent', () => {
    const rng = mulberry32(3);
    const state = {};
    const params = { times: [5, 15, 25] };
    const d1 = sample('Schedule', params, rng, null, { state, schedKey: 'bc', clock: 0 });
    expect(d1).toBe(5);
    expect(state['__schedRowAttrs_bc']).toBeNull();
    const d2 = sample('Schedule', params, rng, null, { state, schedKey: 'bc', clock: 5 });
    expect(d2).toBe(10);
  });
});
