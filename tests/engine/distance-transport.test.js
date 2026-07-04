// tests/engine/distance-transport.test.js — the `Distance` distribution type
// and the `distances[]` reference-data registry. Duration = declared distance
// between two queues ÷ a speed attribute read from the matched server or the
// arriving customer entity, resolved in phases.js's cSchedules loop (mirroring
// how ServerAttr/EntityAttr are resolved there, not inside distributions.js).

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => {
  resetSeq();
});

function makeModel({ distances = [], speedSource = 'server', driverAttrs = [{ name: 'speed', valueType: 'number', defaultValue: '2' }] } = {}) {
  return {
    entityTypes: [
      { id: 'C', name: 'Package', role: 'customer', attrDefs: speedSource === 'entity' ? driverAttrs : [] },
      { id: 'S', name: 'Driver', role: 'server', count: '1', attrDefs: speedSource === 'server' ? driverAttrs : [] },
    ],
    queues: [
      { id: 'q1', name: 'WarehouseQueue', customerType: 'Package', discipline: 'FIFO' },
      { id: 'q2', name: 'DepotQueue', customerType: 'Package', discipline: 'FIFO' },
    ],
    distances,
    stateVariables: [],
    bEvents: [
      { id: 'a1', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Package, WarehouseQueue)', schedules: [] },
      { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'RELEASE(Driver, DepotQueue)', schedules: [] },
    ],
    cEvents: [{
      id: 'c1', name: 'Start', priority: 1,
      condition: 'queue(WarehouseQueue).length > 0 AND idle(Driver).count > 0',
      effect: 'ASSIGN(WarehouseQueue, Driver)',
      cSchedules: [{ eventId: 'done', dist: 'Distance', distParams: { from: 'WarehouseQueue', to: 'DepotQueue', speedAttr: 'speed', speedSource }, useEntityCtx: true }],
    }],
  };
}

describe('Distance distribution — happy path', () => {
  test('computes duration = distance / speed when speedSource is "server"', () => {
    const model = makeModel({ distances: [{ id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: 20 }], speedSource: 'server' });
    const result = buildEngine(model, 1, 0, 20).runAll();
    const msg = result.log.find(e => /Scheduled "Done"/.test(e.message));
    expect(msg).toBeDefined();
    expect(msg.message).toContain('t=10.000');
  });

  test('computes duration = distance / speed when speedSource is "entity"', () => {
    const model = makeModel({ distances: [{ id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: 9 }], speedSource: 'entity', driverAttrs: [{ name: 'speed', valueType: 'number', defaultValue: '3' }] });
    const result = buildEngine(model, 1, 0, 20).runAll();
    const msg = result.log.find(e => /Scheduled "Done"/.test(e.message));
    expect(msg.message).toContain('t=3.000');
  });

  test('matches a declared pair regardless of which order (from,to) was declared in', () => {
    const model = makeModel({ distances: [{ id: 'd1', fromQueue: 'DepotQueue', toQueue: 'WarehouseQueue', distance: 15 }] });
    const result = buildEngine(model, 1, 0, 20).runAll();
    const msg = result.log.find(e => /Scheduled "Done"/.test(e.message));
    expect(msg.message).toContain('t=7.500');
  });
});

describe('Distance distribution — fallbacks', () => {
  test('falls back to a duration of 0 and logs a message when the pair is not declared', () => {
    const model = makeModel({ distances: [] });
    const result = buildEngine(model, 1, 0, 20).runAll();
    expect(result.log.some(e => /no declared distance for this pair/.test(e.message))).toBe(true);
    const msg = result.log.find(e => /Scheduled "Done"/.test(e.message));
    expect(msg.message).toContain('t=0.000');
  });

  test('falls back to a duration of 0 and logs a message when the speed attribute is missing', () => {
    const model = makeModel({ distances: [{ id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: 20 }], driverAttrs: [] });
    const result = buildEngine(model, 1, 0, 20).runAll();
    expect(result.log.some(e => /invalid\/missing speed attribute/.test(e.message))).toBe(true);
    const msg = result.log.find(e => /Scheduled "Done"/.test(e.message));
    expect(msg.message).toContain('t=0.000');
  });

  test('falls back to a duration of 0 when the speed attribute is zero or negative', () => {
    const model = makeModel({ distances: [{ id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: 20 }], driverAttrs: [{ name: 'speed', valueType: 'number', defaultValue: '0' }] });
    const result = buildEngine(model, 1, 0, 20).runAll();
    expect(result.log.some(e => /invalid\/missing speed attribute/.test(e.message))).toBe(true);
  });
});
