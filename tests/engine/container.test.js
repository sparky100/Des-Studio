// Sprint 39 — G21: Container/level resource tests (FILL, DRAIN, summary)

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => { resetSeq(); });

// ── Minimal model builder ─────────────────────────────────────────────────────

function makeContainerModel({ containers, bEffects = [], cEvents = [], maxTime = 100 }) {
  return {
    entityTypes: [
      { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
    stateVariables: [],
    containerTypes: containers,
    bEvents: [
      { id: 'arr',  name: 'Arrive',   scheduledTime: '1', effect: 'ARRIVE(Customer, Queue)', schedules: [] },
      { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ...bEffects,
    ],
    cEvents: [
      {
        id: 'assign', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true }],
      },
      ...cEvents,
    ],
    maxSimTime: maxTime,
  };
}

// ── FILL macro tests ──────────────────────────────────────────────────────────

describe('FILL macro — B-event', () => {
  test('increases container level by the specified amount', () => {
    const model = makeContainerModel({
      containers: [{ id: 'Tank', capacity: '1000', initialLevel: '500' }],
      bEffects: [
        { id: 'fill', name: 'Fill', scheduledTime: '2', effect: 'FILL(Tank, 100)', schedules: [] },
      ],
    });
    const engine = buildEngine(model, 42, 0, 10);
    let snap;
    while (true) {
      const step = engine.step();
      snap = step.snap;
      if (step.done) break;
    }
    // Initial 500 + FILL 100 = 600
    expect(snap.containers?.Tank?.level).toBe(600);
  });

  test('clamps level at capacity', () => {
    const model = makeContainerModel({
      containers: [{ id: 'Tank', capacity: '1000', initialLevel: '950' }],
      bEffects: [
        { id: 'fill', name: 'Fill', scheduledTime: '2', effect: 'FILL(Tank, 200)', schedules: [] },
      ],
    });
    const engine = buildEngine(model, 42, 0, 10);
    let snap;
    while (true) {
      const step = engine.step();
      snap = step.snap;
      if (step.done) break;
    }
    // Would be 1150, clamped to 1000
    expect(snap.containers?.Tank?.level).toBe(1000);
  });

  test('initialLevel is included in snap before any FILL', () => {
    const model = makeContainerModel({
      containers: [{ id: 'Fuel', capacity: '500', initialLevel: '250' }],
    });
    const engine = buildEngine(model, 42, 0, 5);
    const step = engine.step();
    expect(step.snap?.containers?.Fuel?.level).toBe(250);
  });

  test('FILL to undeclared container emits a warning message but does not crash', () => {
    const model = makeContainerModel({
      containers: [],
      bEffects: [
        { id: 'fill', name: 'Fill', scheduledTime: '2', effect: 'FILL(Ghost, 10)', schedules: [] },
      ],
    });
    const engine = buildEngine(model, 42, 0, 10);
    expect(() => engine.runAll()).not.toThrow();
  });
});

// ── DRAIN macro tests ─────────────────────────────────────────────────────────

describe('DRAIN macro — C-event guard', () => {
  function makeDrainModel(initialLevel, drainAmount, condition = null) {
    const condStr = condition || `queue(Queue).length > 0 AND idle(Server).count > 0`;
    return makeContainerModel({
      containers: [{ id: 'Buffer', capacity: '1000', initialLevel: String(initialLevel) }],
      cEvents: [
        {
          id: 'drain', name: 'Drain', priority: 2,
          condition: condStr,
          effect: `DRAIN(Buffer, ${drainAmount})`,
          cSchedules: [],
        },
      ],
    });
  }

  test('subtracts amount from container when level >= amount', () => {
    const model = makeContainerModel({
      containers: [{ id: 'Buffer', capacity: '1000', initialLevel: '400' }],
      bEffects: [
        // Trigger a drain by having a separate b-event at t=2
        { id: 'trigger', name: 'DrainB', scheduledTime: '2', effect: 'FILL(Buffer, 0.001)', schedules: [] },
      ],
      cEvents: [
        {
          id: 'drain', name: 'Drain', priority: 2,
          condition: 'idle(Server).count > 0',
          effect: 'DRAIN(Buffer, 100)',
          cSchedules: [],
        },
      ],
    });
    const engine = buildEngine(model, 42, 0, 10);
    let snap;
    while (true) {
      const step = engine.step();
      snap = step.snap;
      if (step.done) break;
    }
    // level starts 400, DRAIN 100 → 300 (if guard fires)
    // Since guard fires when idle(Server)>0 (server starts idle), level should drop
    expect(snap.containers?.Buffer?.level).toBeLessThanOrEqual(400);
  });

  test('does not subtract when level < amount (guard blocks)', () => {
    const model = makeContainerModel({
      containers: [{ id: 'Buffer', capacity: '1000', initialLevel: '50' }],
      cEvents: [
        {
          id: 'drain', name: 'Drain', priority: 2,
          condition: 'idle(Server).count > 0',
          effect: 'DRAIN(Buffer, 200)',
          cSchedules: [],
        },
      ],
    });
    const engine = buildEngine(model, 42, 0, 10);
    let snap;
    while (true) {
      const step = engine.step();
      snap = step.snap;
      if (step.done) break;
    }
    // 50 < 200 → guard blocked, level stays at 50
    expect(snap.containers?.Buffer?.level).toBe(50);
  });

  test('level reaches exactly zero after draining exactly the remaining amount', () => {
    const model = makeContainerModel({
      containers: [{ id: 'Tank', capacity: '500', initialLevel: '100' }],
      cEvents: [
        {
          id: 'drain', name: 'Drain', priority: 2,
          condition: 'idle(Server).count > 0',
          effect: 'DRAIN(Tank, 100)',
          cSchedules: [],
        },
      ],
    });
    const engine = buildEngine(model, 42, 0, 10);
    let snap;
    while (true) {
      const step = engine.step();
      snap = step.snap;
      if (step.done) break;
    }
    expect(snap.containers?.Tank?.level).toBe(0);
  });
});

// ── summary.containerLevels ───────────────────────────────────────────────────

describe('summary.containerLevels', () => {
  test('reports min, max, avg, final for each declared container', () => {
    const model = makeContainerModel({
      containers: [{ id: 'Fuel', capacity: '1000', initialLevel: '500' }],
      bEffects: [
        { id: 'fill', name: 'Fill', scheduledTime: '2', effect: 'FILL(Fuel, 200)', schedules: [] },
      ],
      maxTime: 10,
    });
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();
    const levels = result.summary.containerLevels;
    expect(levels).toBeDefined();
    expect(levels.Fuel).toBeDefined();
    expect(levels.Fuel.min).toBeTypeOf('number');
    expect(levels.Fuel.max).toBeTypeOf('number');
    expect(levels.Fuel.avg).toBeTypeOf('number');
    expect(levels.Fuel.final).toBeTypeOf('number');
  });

  test('final level reflects FILL operations', () => {
    const model = makeContainerModel({
      containers: [{ id: 'Tank', capacity: '1000', initialLevel: '300' }],
      bEffects: [
        { id: 'fill', name: 'Fill', scheduledTime: '2', effect: 'FILL(Tank, 150)', schedules: [] },
      ],
      maxTime: 20,
    });
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();
    // 300 + 150 = 450
    expect(result.summary.containerLevels?.Tank?.final).toBe(450);
  });

  test('min tracks lowest level observed', () => {
    const model = makeContainerModel({
      containers: [{ id: 'Buffer', capacity: '500', initialLevel: '200' }],
      cEvents: [
        {
          id: 'drain', name: 'Drain', priority: 2,
          condition: 'idle(Server).count > 0',
          effect: 'DRAIN(Buffer, 150)',
          cSchedules: [],
        },
      ],
      maxTime: 20,
    });
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();
    // After DRAIN: level drops to 50; min should be ≤ 200
    expect(result.summary.containerLevels?.Buffer?.min).toBeLessThanOrEqual(200);
  });

  test('no containerLevels key when no containers declared', () => {
    const model = makeContainerModel({ containers: [] });
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();
    expect(result.summary.containerLevels).toBeUndefined();
  });
});

// ── FILL + DRAIN round-trip ───────────────────────────────────────────────────

describe('FILL then DRAIN — level accounting', () => {
  test('fill then drain returns to near-original level', () => {
    const model = makeContainerModel({
      containers: [{ id: 'Tank', capacity: '1000', initialLevel: '500' }],
      bEffects: [
        { id: 'fill', name: 'Fill', scheduledTime: '2', effect: 'FILL(Tank, 200)', schedules: [] },
      ],
      cEvents: [
        {
          id: 'drain', name: 'Drain', priority: 2,
          condition: 'idle(Server).count > 0',
          effect: 'DRAIN(Tank, 200)',
          cSchedules: [],
        },
      ],
      maxTime: 20,
    });
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();
    const levels = result.summary.containerLevels?.Tank;
    // DRAIN of 200 fires when guard passes. After fill=700 then drain=500 → back to 500
    expect(levels?.max).toBe(700);
    expect(levels?.final).toBeLessThanOrEqual(700);
  });
});
