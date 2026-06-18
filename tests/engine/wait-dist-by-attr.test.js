// Wait-time distribution broken down by entity attribute (e.g. customer tier).
// Generic over whatever attributes exist on customer entity types — no
// attribute name is hardcoded in the engine.

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

describe('waitDistByAttr', () => {
  test('breaks down completed waits by entity attribute value', () => {
    const engine = buildEngine(tieredModel(), 42, 0, 40);
    const result = engine.runAll();

    expect(result.waitDistByAttr.tier).toBeDefined();
    expect(result.waitDistByAttr.tier.Queue).toBeDefined();
    expect(result.waitDistByAttr.tier.Queue.gold).toBeDefined();
    expect(result.waitDistByAttr.tier.Queue.silver).toBeDefined();
    expect(result.waitDistByAttr.tier.Queue.gold.n).toBeGreaterThan(0);
    expect(result.waitDistByAttr.tier.Queue.silver.n).toBeGreaterThan(0);
  });

  test('only counts fully completed entities, not those still waiting/serving at end', () => {
    // Short run: several arrivals never reach "done" by the time the sim ends.
    const engine = buildEngine(tieredModel(), 42, 0, 8);
    const result = engine.runAll();
    const doneCount = result.entitySummary.filter(e => e.status === 'done').length;
    const totalGoldSilverN = Object.values(result.waitDistByAttr.tier?.Queue || {})
      .reduce((sum, dist) => sum + dist.n, 0);
    expect(totalGoldSilverN).toBeLessThanOrEqual(doneCount);
  });

  test('omits attributes with only one observed value', () => {
    const model = tieredModel();
    // Remove the Silver arrival so only "gold" tier values ever occur.
    model.bEvents = model.bEvents.filter(e => e.id !== 'arrS');
    const engine = buildEngine(model, 42, 0, 40);
    const result = engine.runAll();
    expect(result.waitDistByAttr.tier).toBeUndefined();
  });
});
