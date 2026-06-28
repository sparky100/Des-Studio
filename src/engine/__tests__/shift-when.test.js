// Tests for condition-triggered (`when`) shiftSchedule entries.
// Modeled after src/engine/__tests__/cschedule-when.test.js (conventions) and
// tests/engine/time-varying.test.js (shiftSchedule-specific conventions).
import { describe, expect, test } from 'vitest';
import { buildEngine } from '../index.js';

function baseModel(overrides = {}) {
  return {
    entityTypes: [
      { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
      {
        id: 'srv',
        name: 'Server',
        role: 'server',
        count: '1',
        attrDefs: [],
        shiftSchedule: [
          { time: 0, capacity: 6 },
          { when: { variable: 'state.traineesQualified', operator: '>=', value: 20 }, capacity: 8 },
        ],
      },
    ],
    stateVariables: [
      { name: 'traineesQualified', initialValue: '0' },
    ],
    bEvents: [
      // Periodic event that increments traineesQualified, simulating qualification events.
      {
        id: 'b_qualify',
        name: 'Qualify trainee',
        scheduledTime: '1',
        effect: 'traineesQualified++',
        schedules: [{ eventId: 'b_qualify', dist: 'Fixed', distParams: { value: '1' } }],
      },
    ],
    cEvents: [],
    queues: [],
    ...overrides,
  };
}

describe('shiftSchedule `when` entries', () => {
  test('capacity becomes 8 once traineesQualified >= 20, fires once', () => {
    const model = baseModel();
    const engine = buildEngine(model, 1, 0, 50);
    const result = engine.runAll();

    expect(result.snap.scalars.traineesQualified).toBeGreaterThanOrEqual(20);
    expect(result.snap.byType.Server.total).toBe(8);

    const shiftMsgs = result.log.filter(entry => entry.message?.includes('SHIFT_CHANGE: Server capacity -> 8'));
    expect(shiftMsgs.length).toBe(1);
  });

  test('condition staying true after firing does not cause duplicate firing', () => {
    const model = baseModel();
    const engine = buildEngine(model, 2, 0, 60);
    const result = engine.runAll();

    // traineesQualified keeps increasing well past 20, but capacity must not change again.
    expect(result.snap.scalars.traineesQualified).toBeGreaterThan(20);
    expect(result.snap.byType.Server.total).toBe(8);
    const shiftMsgs = result.log.filter(entry => entry.message?.includes('SHIFT_CHANGE: Server capacity -> 8'));
    expect(shiftMsgs.length).toBe(1);
  });

  test('two `when` entries both true at same event fire in array order (lowest index first)', () => {
    const model = baseModel({
      entityTypes: [
        { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
        {
          id: 'srv',
          name: 'Server',
          role: 'server',
          count: '1',
          attrDefs: [],
          shiftSchedule: [
            { time: 0, capacity: 6 },
            { when: { variable: 'state.traineesQualified', operator: '>=', value: 20 }, capacity: 8 },
            { when: { variable: 'state.traineesQualified', operator: '>=', value: 5 }, capacity: 7 },
          ],
        },
      ],
      bEvents: [
        // Jump traineesQualified straight to 25 in one shot so both predicates become
        // true at the same Phase C evaluation point.
        {
          id: 'b_qualify',
          name: 'Qualify trainee',
          scheduledTime: '1',
          effect: 'traineesQualified = 25',
          schedules: [],
        },
      ],
    });
    const engine = buildEngine(model, 3, 0, 10);
    const result = engine.runAll();

    // Index 1 (capacity 8) fires before index 2 (capacity 7) — final capacity
    // reflects whichever applies last in the restart-from-top scan, but both fired.
    const fired8 = result.log.some(entry => entry.message?.includes('SHIFT_CHANGE: Server capacity -> 8'));
    const fired7 = result.log.some(entry => entry.message?.includes('SHIFT_CHANGE: Server capacity ->'));
    expect(fired8).toBe(true);
    expect(fired7).toBe(true);

    // Find the order in the log: capacity->8 should be logged before capacity->7.
    const idx8 = result.log.findIndex(entry => entry.message?.includes('SHIFT_CHANGE: Server capacity -> 8'));
    const idx7 = result.log.findIndex(entry => entry.message?.includes('SHIFT_CHANGE: Server capacity -> 7'));
    expect(idx8).toBeGreaterThanOrEqual(0);
    expect(idx7).toBeGreaterThanOrEqual(0);
    expect(idx8).toBeLessThan(idx7);
  });

  test('`when` referencing Queue.SomeQueue.length fires when queue reaches threshold', () => {
    const model = {
      entityTypes: [
        { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
        {
          id: 'srv',
          name: 'Server',
          role: 'server',
          count: '1',
          attrDefs: [],
          shiftSchedule: [
            { time: 0, capacity: 1 },
            { when: { variable: 'Queue.Waiting.length', operator: '>=', value: 3 }, capacity: 4 },
          ],
        },
      ],
      stateVariables: [],
      queues: [{ id: 'q1', name: 'Waiting', entityTypeId: 'cust' }],
      bEvents: [
        {
          id: 'b_arrive',
          name: 'Arrival',
          scheduledTime: '0',
          effect: 'ARRIVE(Customer, Waiting)',
          schedules: [{ eventId: 'b_arrive', dist: 'Fixed', distParams: { value: '0.5' } }],
        },
      ],
      cEvents: [],
    };

    const engine = buildEngine(model, 4, 0, 5);
    const result = engine.runAll();

    const fired = result.log.some(entry => entry.message?.includes('SHIFT_CHANGE: Server capacity -> 4'));
    expect(fired).toBe(true);
  });
});
