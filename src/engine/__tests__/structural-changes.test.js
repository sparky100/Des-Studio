import { describe, test, expect } from 'vitest';
import { detectStructuralChanges } from '../validation.js';

const BASE = {
  entityTypes: [{ id: 'et1', name: 'Customer', role: 'customer', attrDefs: [] }],
  bEvents: [{ id: 'b1', name: 'Arrival', schedules: [] }],
  cEvents: [{ id: 'c1', name: 'Seize', conditions: [], priority: 1 }],
  queues: [{ id: 'q1', name: 'Queue', discipline: 'FIFO' }],
  stateVariables: [],
  graph: null,
};

describe('detectStructuralChanges', () => {
  test('no changes returns isStructural=false', () => {
    const result = detectStructuralChanges(BASE, BASE);
    expect(result.isStructural).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  test('null oldModel (first version) returns isStructural=true', () => {
    const result = detectStructuralChanges(null, BASE);
    expect(result.isStructural).toBe(true);
  });

  test('adding an entity type is structural', () => {
    const next = { ...BASE, entityTypes: [...BASE.entityTypes, { id: 'et2', name: 'Server', role: 'server', attrDefs: [] }] };
    const result = detectStructuralChanges(BASE, next);
    expect(result.isStructural).toBe(true);
    expect(result.changes.some(c => /entity/i.test(c))).toBe(true);
  });

  test('removing a queue is structural', () => {
    const next = { ...BASE, queues: [] };
    const result = detectStructuralChanges(BASE, next);
    expect(result.isStructural).toBe(true);
  });

  test('renaming a B-Event is structural', () => {
    const next = { ...BASE, bEvents: [{ ...BASE.bEvents[0], name: 'ArrivalRenamed' }] };
    const result = detectStructuralChanges(BASE, next);
    expect(result.isStructural).toBe(true);
  });

  test('adding a C-Event is structural', () => {
    const next = { ...BASE, cEvents: [...BASE.cEvents, { id: 'c2', name: 'Complete', conditions: [], priority: 2 }] };
    const result = detectStructuralChanges(BASE, next);
    expect(result.isStructural).toBe(true);
  });

  test('changing only experimentDefaults is not structural', () => {
    const next = { ...BASE, experimentDefaults: { maxSimTime: 1000, replications: 10 } };
    const result = detectStructuralChanges(BASE, next);
    expect(result.isStructural).toBe(false);
  });

  test('changing only model name/description is not structural', () => {
    const next = { ...BASE, name: 'Renamed', description: 'New desc' };
    const result = detectStructuralChanges(BASE, next);
    expect(result.isStructural).toBe(false);
  });
});
