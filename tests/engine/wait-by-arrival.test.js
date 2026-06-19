// Total wait (across every queue/stage an entity passed through) vs. arrival
// time, pooled across all completed entities — the overall counterpart to
// waitByArrivalAttr (which splits by entity attribute).

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => { resetSeq(); });

function simpleModel({ maxSimTime = 40 } = {}) {
  return {
    entityTypes: [
      { id: 'c', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'srv', name: 'Server', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
    stateVariables: [],
    bEvents: [
      { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
        schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '4' } }] },
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

describe('waitByArrival', () => {
  test('pools total wait vs. arrival time across all completed entities', () => {
    const engine = buildEngine(simpleModel(), 42, 0, 40);
    const result = engine.runAll();

    expect(Array.isArray(result.waitByArrival)).toBe(true);
    expect(result.waitByArrival.length).toBeGreaterThan(0);
    for (const [t, wait] of result.waitByArrival) {
      expect(typeof t).toBe('number');
      expect(typeof wait).toBe('number');
    }
  });

  test('only counts fully completed entities, not those still waiting/serving at end', () => {
    const engine = buildEngine(simpleModel(), 42, 0, 8);
    const result = engine.runAll();
    const doneCount = result.entitySummary.filter(e => e.status === 'done').length;
    expect(result.waitByArrival.length).toBeLessThanOrEqual(doneCount);
  });
});
