// tests/engine/distance-validation.test.js — V69 (distances[] registry
// structure) and V70 (Distance distribution usage cross-reference).

import { describe, test, expect } from 'vitest';
import { validateModel } from '../../src/engine/validation.js';

function base(overrides = {}) {
  return {
    entityTypes: [
      { id: 'C', name: 'Package', role: 'customer', attrDefs: [] },
      { id: 'S', name: 'Driver', role: 'server', count: 1, attrDefs: [{ name: 'speed', valueType: 'number', defaultValue: '2' }] },
    ],
    queues: [
      { id: 'q1', name: 'WarehouseQueue', discipline: 'FIFO' },
      { id: 'q2', name: 'DepotQueue', discipline: 'FIFO' },
    ],
    distances: [],
    stateVariables: [],
    bEvents: [],
    cEvents: [{ id: 'c1', name: 'Start', priority: 1, condition: '', effect: '', cSchedules: [] }],
    ...overrides,
  };
}

describe('V69 — distances[] registry structure', () => {
  test('accepts a valid entry', () => {
    const m = base({ distances: [{ id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: 20 }] });
    expect(validateModel(m).errors.filter(e => e.code === 'V69')).toEqual([]);
  });

  test('flags a duplicate id', () => {
    const m = base({ distances: [
      { id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: 20 },
      { id: 'd1', fromQueue: 'DepotQueue', toQueue: 'WarehouseQueue', distance: 5 },
    ] });
    const msgs = validateModel(m).errors.filter(e => e.code === 'V69').map(e => e.message);
    expect(msgs.some(m => /Duplicate distance id/.test(m))).toBe(true);
  });

  test('flags an undeclared queue in fromQueue/toQueue', () => {
    const m = base({ distances: [{ id: 'd1', fromQueue: 'Nope', toQueue: 'DepotQueue', distance: 20 }] });
    const msgs = validateModel(m).errors.filter(e => e.code === 'V69').map(e => e.message);
    expect(msgs.some(m => /fromQueue 'Nope' does not match/.test(m))).toBe(true);
  });

  test('flags fromQueue === toQueue', () => {
    const m = base({ distances: [{ id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'WarehouseQueue', distance: 20 }] });
    const msgs = validateModel(m).errors.filter(e => e.code === 'V69').map(e => e.message);
    expect(msgs.some(m => /must be different queues/.test(m))).toBe(true);
  });

  test('flags a non-positive distance', () => {
    const m = base({ distances: [{ id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: -5 }] });
    const msgs = validateModel(m).errors.filter(e => e.code === 'V69').map(e => e.message);
    expect(msgs.some(m => /must be a positive number/.test(m))).toBe(true);
  });

  test('flags a duplicate unordered pair even when declared in reversed order', () => {
    const m = base({ distances: [
      { id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: 20 },
      { id: 'd2', fromQueue: 'DepotQueue', toQueue: 'WarehouseQueue', distance: 5 },
    ] });
    const msgs = validateModel(m).errors.filter(e => e.code === 'V69').map(e => e.message);
    expect(msgs.some(m => /duplicate entry for the pair/.test(m))).toBe(true);
  });
});

describe('V70 — Distance distribution usage cross-reference', () => {
  function withDistanceSchedule(distParams, distances = [{ id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: 20 }]) {
    return base({
      distances,
      cEvents: [{
        id: 'c1', name: 'Start', priority: 1, condition: '', effect: 'ASSIGN(WarehouseQueue,Driver)',
        cSchedules: [{ eventId: 'done', dist: 'Distance', distParams }],
      }],
    });
  }

  test('accepts valid usage with no errors or warnings', () => {
    const m = withDistanceSchedule({ from: 'WarehouseQueue', to: 'DepotQueue', speedAttr: 'speed', speedSource: 'server' });
    const r = validateModel(m);
    expect(r.errors.filter(e => e.code === 'V70')).toEqual([]);
    expect(r.warnings.filter(e => e.code === 'V70')).toEqual([]);
  });

  test('flags an unknown queue in distParams.from', () => {
    const m = withDistanceSchedule({ from: 'Nope', to: 'DepotQueue', speedAttr: 'speed', speedSource: 'server' });
    const msgs = validateModel(m).errors.filter(e => e.code === 'V70').map(e => e.message);
    expect(msgs.some(m => /'from'.*does not match any defined queue/.test(m))).toBe(true);
  });

  test('flags a missing/invalid speedSource', () => {
    const m = withDistanceSchedule({ from: 'WarehouseQueue', to: 'DepotQueue', speedAttr: 'speed' });
    const msgs = validateModel(m).errors.filter(e => e.code === 'V70').map(e => e.message);
    expect(msgs.some(m => /speedSource.*must be "entity" or "server"/.test(m))).toBe(true);
  });

  test('flags a missing speedAttr', () => {
    const m = withDistanceSchedule({ from: 'WarehouseQueue', to: 'DepotQueue', speedSource: 'server' });
    const msgs = validateModel(m).errors.filter(e => e.code === 'V70').map(e => e.message);
    expect(msgs.some(m => /non-empty 'speedAttr'/.test(m))).toBe(true);
  });

  test('warns (not errors) when the pair is not declared in distances[]', () => {
    const m = withDistanceSchedule({ from: 'WarehouseQueue', to: 'DepotQueue', speedAttr: 'speed', speedSource: 'server' }, []);
    const r = validateModel(m);
    expect(r.errors.filter(e => e.code === 'V70')).toEqual([]);
    expect(r.warnings.some(e => e.code === 'V70' && /no declared distance entry/.test(e.message))).toBe(true);
  });

  test('warns (not errors) when speedAttr is not declared on any matching entity type', () => {
    const m = withDistanceSchedule({ from: 'WarehouseQueue', to: 'DepotQueue', speedAttr: 'ghostAttr', speedSource: 'server' });
    const r = validateModel(m);
    expect(r.errors.filter(e => e.code === 'V70')).toEqual([]);
    expect(r.warnings.some(e => e.code === 'V70' && /is not declared on any server entity type/.test(e.message))).toBe(true);
  });
});
