// tests/engine/cancel-round-robin-macros.test.js — CANCEL(EventName) and
// ROUND_ROBIN(StateVar, N) macros.
//
// CANCEL removes a pending FEL entry scoped to the current context entity
// (mirroring the internal FEL-removal the engine already does for FAIL/PREEMPT
// completions). ROUND_ROBIN advances a state var through a 0..N-1 rotation —
// pure sugar over SET, since the expression evaluator has no modulo operator.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => {
  resetSeq();
});

describe('CANCEL — removes a pending FEL entry scoped to the same entity', () => {
  function makeModel() {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [{ name: 'timeoutFired', initialValue: '0' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)', schedules: [] },
        { id: 'done', name: 'ServiceDone', scheduledTime: '9999',
          effect: 'CANCEL(TimeoutCheck); COMPLETE()', schedules: [] },
        { id: 'timeout', name: 'TimeoutCheck', scheduledTime: '9999',
          effect: 'SET(timeoutFired, timeoutFired + 1)', schedules: [] },
      ],
      cEvents: [{
        id: 'c1', name: 'Start', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [
          { eventId: 'done', dist: 'Fixed', distParams: { value: '2' }, useEntityCtx: true },
          { eventId: 'timeout', dist: 'Fixed', distParams: { value: '10' }, useEntityCtx: true },
        ],
      }],
    };
  }

  test('cancelling the timeout prevents it from ever firing', () => {
    const result = buildEngine(makeModel(), 1, 0, 30).runAll();
    expect(result.snap.scalars.timeoutFired).toBe(0);
    const cancelMsg = result.log.some(e =>
      typeof e.message === 'string' && e.message.includes('CANCEL(TimeoutCheck): removed'));
    expect(cancelMsg).toBe(true);
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBe(1);
  });

  test('CANCEL is a harmless no-op when there is nothing pending to cancel', () => {
    const model = makeModel();
    // Remove the timeout cSchedule entirely — CANCEL(TimeoutCheck) now has nothing to remove.
    model.cEvents[0].cSchedules = [model.cEvents[0].cSchedules[0]];
    const result = buildEngine(model, 1, 0, 30).runAll();
    const noMatchMsg = result.log.some(e =>
      typeof e.message === 'string' && e.message.includes('CANCEL(TimeoutCheck): no pending event found'));
    expect(noMatchMsg).toBe(true);
    const served = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done');
    expect(served.length).toBe(1);
  });
});

describe('ROUND_ROBIN — cycles a state variable through 0..N-1', () => {
  test('state variable wraps 0,1,2,0,1,2... (no entity context required)', () => {
    const model = {
      entityTypes: [{ id: 'C', name: 'Customer', role: 'customer', attrDefs: [] }],
      queues: [],
      stateVariables: [{ name: 'rrIndex', initialValue: '-1' }],
      bEvents: [
        { id: 'tick', name: 'Tick', scheduledTime: '0', effect: 'ROUND_ROBIN(rrIndex, 3)',
          schedules: [{ eventId: 'tick', dist: 'Fixed', distParams: { value: '1' } }] },
      ],
      cEvents: [],
    };
    const result = buildEngine(model, 1, 0, 5).runAll();
    const rrLogs = result.log
      .map(e => e.message)
      .filter(m => typeof m === 'string' && m.includes('ROUND_ROBIN rrIndex ='))
      .map(m => Number(m.match(/ROUND_ROBIN rrIndex = (\d+)/)[1]));
    expect(rrLogs).toEqual([0, 1, 2, 0, 1, 2]);
  });

  // Round-robin destination routing is sugar over the existing routing[] table
  // (RELEASE with no target queue defers to routing[], same as conditional
  // routing) — ROUND_ROBIN just advances the index the routing branches key on.
  function makeRoutingModel() {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [
        { id: 'wait', name: 'Wait Queue', customerType: 'Customer', discipline: 'FIFO' },
        { id: 'q0', name: 'QueueA', customerType: 'Customer', discipline: 'FIFO' },
        { id: 'q1', name: 'QueueB', customerType: 'Customer', discipline: 'FIFO' },
        { id: 'q2', name: 'QueueC', customerType: 'Customer', discipline: 'FIFO' },
      ],
      stateVariables: [{ name: 'rrIndex', initialValue: '-1' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Wait Queue)',
          schedules: [{ eventId: 'arr', dist: 'Fixed', distParams: { value: '1' } }] },
        {
          id: 'done', name: 'Done', scheduledTime: '9999',
          effect: 'RELEASE(Server); ROUND_ROBIN(rrIndex, 3)',
          schedules: [],
          routing: [
            { condition: { variable: 'rrIndex', operator: '==', value: 0 }, queueName: 'QueueA' },
            { condition: { variable: 'rrIndex', operator: '==', value: 1 }, queueName: 'QueueB' },
            { condition: { variable: 'rrIndex', operator: '==', value: 2 }, queueName: 'QueueC' },
          ],
        },
      ],
      cEvents: [{
        id: 'c1', name: 'Start', priority: 1,
        condition: 'queue(Wait Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Wait Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'Fixed', distParams: { value: '0.5' }, useEntityCtx: true }],
      }],
    };
  }

  test('entities alternate destination queues following the rotation', () => {
    // Arrivals every 1 time unit at t=0..4 (5 total); stop just after the last
    // one's 0.5-unit service completes and routes, before a 6th arrival at t=5.
    const result = buildEngine(makeRoutingModel(), 1, 0, 4.5).runAll();
    const customers = result.entitySummary
      .filter(e => e.role === 'customer')
      .sort((a, b) => a.arrivalTime - b.arrivalTime);
    const destinations = customers.map(c => c.queue || c.lastQueue);
    expect(destinations).toEqual(['QueueA', 'QueueB', 'QueueC', 'QueueA', 'QueueB']);
  });
});
