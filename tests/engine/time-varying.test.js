import { describe, expect, test } from 'vitest';
import { sample, mulberry32 } from '../../src/engine/distributions.js';
import { buildEngine } from '../../src/engine/index.js';
import { validateModel } from '../../src/engine/validation.js';

describe('time-varying distributions', () => {
  test('Piecewise samples the distribution active at the simulation clock', () => {
    const params = {
      periods: [
        { startTime: '0', distribution: { dist: 'Fixed', distParams: { value: '5' } } },
        { startTime: '10', distribution: { dist: 'Fixed', distParams: { value: '2' } } },
      ],
    };

    expect(sample('Piecewise', params, mulberry32(1), null, { clock: 5 })).toBe(5);
    expect(sample('Piecewise', params, mulberry32(1), null, { clock: 10 })).toBe(2);
    expect(sample('piecewise', params, mulberry32(1), null, { clock: 99 })).toBe(2);
  });

  test('piecewise exponential periods accept rate shorthand', () => {
    const params = {
      periods: [
        { startTime: 0, distribution: { type: 'exponential', rate: 2 } },
      ],
    };

    const byRate = sample('Piecewise', params, mulberry32(99), null, { clock: 0 });
    const byMean = sample('Exponential', { mean: '0.5' }, mulberry32(99));
    expect(byRate).toBe(byMean);
  });
});

describe('shift schedules', () => {
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
          { time: '0', capacity: '3' },
          { time: '10', capacity: '1' },
        ],
      },
    ],
    stateVariables: [],
    bEvents: [],
    cEvents: [],
    queues: [],
  };

  test('initial shift period overrides static server count', () => {
    const engine = buildEngine(model, 123, 0, 20);
    expect(engine.getSnap().byType.Server.total).toBe(3);
  });

  test('SHIFT_CHANGE retires idle excess servers at the scheduled time', () => {
    const result = buildEngine(model, 123, 0, 20).runAll();
    expect(result.snap.byType.Server.total).toBe(1);
    expect(result.log.some(entry => entry.message.includes('SHIFT_CHANGE: Server capacity -> 1'))).toBe(true);
  });
});

describe('time-varying model validation', () => {
  const base = {
    entityTypes: [{ id: 'srv', name: 'Server', role: 'server', count: '1', attrDefs: [] }],
    stateVariables: [],
    bEvents: [],
    cEvents: [],
    queues: [],
    maxSimTime: 100,
  };

  test('blocks piecewise distributions that do not start at time 0', () => {
    const model = {
      ...base,
      bEvents: [{
        id: 'arrival',
        name: 'Arrival',
        scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{
          eventId: 'arrival',
          dist: 'Piecewise',
          distParams: { periods: [{ startTime: '5', distribution: { dist: 'Fixed', distParams: { value: '1' } } }] },
        }],
      }],
    };

    expect(validateModel(model).errors.some(error => error.code === 'V12')).toBe(true);
  });

  test('blocks unsorted piecewise periods', () => {
    const model = {
      ...base,
      bEvents: [{
        id: 'arrival',
        name: 'Arrival',
        scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{
          eventId: 'arrival',
          dist: 'Piecewise',
          distParams: {
            periods: [
              { startTime: '0', distribution: { dist: 'Fixed', distParams: { value: '1' } } },
              { startTime: '10', distribution: { dist: 'Fixed', distParams: { value: '1' } } },
              { startTime: '5', distribution: { dist: 'Fixed', distParams: { value: '1' } } },
            ],
          },
        }],
      }],
    };

    expect(validateModel(model).errors.some(error => error.code === 'V13')).toBe(true);
  });

  test('blocks invalid shift schedules', () => {
    const model = {
      ...base,
      entityTypes: [{
        id: 'srv',
        name: 'Server',
        role: 'server',
        count: '1',
        attrDefs: [],
        shiftSchedule: [{ time: '5', capacity: '0' }],
      }],
    };

    const errors = validateModel(model).errors.map(error => error.code);
    expect(errors).toContain('V14');
  });

  test('warns when a shift is beyond the configured run duration', () => {
    const model = {
      ...base,
      entityTypes: [{
        id: 'srv',
        name: 'Server',
        role: 'server',
        count: '1',
        attrDefs: [],
        shiftSchedule: [
          { time: '0', capacity: '1' },
          { time: '150', capacity: '2' },
        ],
      }],
    };

    const validation = validateModel(model);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings.some(warning => warning.code === 'V15')).toBe(true);
  });

  test('accepts a valid piecewise schedule with a server shift schedule', () => {
    const model = {
      ...base,
      entityTypes: [{
        id: 'srv',
        name: 'Server',
        role: 'server',
        count: '1',
        attrDefs: [],
        shiftSchedule: [
          { time: '0', capacity: '1' },
          { time: '50', capacity: '2' },
        ],
      }],
      bEvents: [{
        id: 'arrival',
        name: 'Arrival',
        scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{
          eventId: 'arrival',
          dist: 'Piecewise',
          distParams: {
            periods: [
              { startTime: '0', distribution: { dist: 'Fixed', distParams: { value: '1' } } },
              { startTime: '50', distribution: { dist: 'Fixed', distParams: { value: '2' } } },
            ],
          },
        }],
      }],
    };

    expect(validateModel(model).errors).toEqual([]);
  });
});
