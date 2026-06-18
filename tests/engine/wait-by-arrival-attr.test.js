// Total wait (across every queue/stage an entity passed through) vs. arrival
// time, broken down by entity attribute. Global/whole-journey counterpart to
// waitDistByAttr (which is per-queue).

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => { resetSeq(); });

function tieredModel({ maxSimTime = 40 } = {}) {
  return {
    entityTypes: [
      { id: 'g', name: 'Gold',   role: 'customer', attrDefs: [{ name: 'tier', valueType: 'string', defaultValue: 'gold' }] },
      { id: 's', name: 'Silver', role: 'customer', attrDefs: [{ name: 'tier', valueType: 'string', defaultValue: 'silver' }] },
      { id: 'srv', name: 'Server', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q', name: 'Queue', customerType: 'Gold', discipline: 'FIFO' }],
    stateVariables: [],
    bEvents: [
      { id: 'arrG', name: 'ArriveGold',   scheduledTime: '0', effect: 'ARRIVE(Gold, Queue)',
        schedules: [{ eventId: 'arrG', dist: 'fixed', distParams: { value: '4' } }] },
      { id: 'arrS', name: 'ArriveSilver', scheduledTime: '2', effect: 'ARRIVE(Silver, Queue)',
        schedules: [{ eventId: 'arrS', dist: 'fixed', distParams: { value: '4' } }] },
      { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [{
      id: 'a', name: 'Assign', priority: 1,
      condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Queue, Server)',
      cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '3' }, useEntityCtx: true }],
    }],
    maxSimTime,
  };
}

describe('waitByArrivalAttr', () => {
  test('breaks down total wait vs. arrival time by entity attribute value', () => {
    const engine = buildEngine(tieredModel(), 42, 0, 40);
    const result = engine.runAll();

    expect(result.waitByArrivalAttr.tier).toBeDefined();
    expect(Array.isArray(result.waitByArrivalAttr.tier.gold)).toBe(true);
    expect(Array.isArray(result.waitByArrivalAttr.tier.silver)).toBe(true);
    expect(result.waitByArrivalAttr.tier.gold.length).toBeGreaterThan(0);
    expect(result.waitByArrivalAttr.tier.silver.length).toBeGreaterThan(0);
    // Each point is [arrivalTime, totalWait]
    for (const [t, wait] of result.waitByArrivalAttr.tier.gold) {
      expect(typeof t).toBe('number');
      expect(typeof wait).toBe('number');
    }
  });

  test('only counts fully completed entities, not those still waiting/serving at end', () => {
    const engine = buildEngine(tieredModel(), 42, 0, 8);
    const result = engine.runAll();
    const doneCount = result.entitySummary.filter(e => e.status === 'done').length;
    const totalPoints = Object.values(result.waitByArrivalAttr.tier || {})
      .reduce((sum, points) => sum + points.length, 0);
    expect(totalPoints).toBeLessThanOrEqual(doneCount);
  });

  test('omits attributes with only one observed value', () => {
    const model = tieredModel();
    model.bEvents = model.bEvents.filter(e => e.id !== 'arrS');
    const engine = buildEngine(model, 42, 0, 40);
    const result = engine.runAll();
    expect(result.waitByArrivalAttr.tier).toBeUndefined();
  });
});
