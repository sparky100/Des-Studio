import { describe, expect, it } from 'vitest';
import { detectStructuralChanges } from '../../src/engine/validation.js';

const baseModel = {
  entityTypes: [{ id: 'et1', name: 'Customer', role: 'customer', attrDefs: [] }],
  bEvents: [{ id: 'b1', name: 'Arrival', schedules: [] }],
  cEvents: [{ id: 'c1', name: 'Serve', condition: { variable: 'Queue.q1.length', operator: '>', value: 0 }, actions: [] }],
  queues: [{ id: 'q1', name: 'Queue', discipline: 'FIFO' }],
  graph: { nodes: [{ id: 'n1' }], edges: [] },
  experimentDefaults: { maxSimTime: 500, warmupPeriod: 0, replications: 1 },
  name: 'Test Model',
  description: 'A test model',
};

describe('detectStructuralChanges', () => {
  it('returns no changes for identical models', () => {
    const result = detectStructuralChanges(baseModel, baseModel);
    expect(result.isStructural).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('detects entity type addition as structural', () => {
    const newModel = {
      ...baseModel,
      entityTypes: [...baseModel.entityTypes, { id: 'et2', name: 'VIP', role: 'customer', attrDefs: [] }],
    };
    const result = detectStructuralChanges(baseModel, newModel);
    expect(result.isStructural).toBe(true);
    expect(result.changes.some(c => c.includes('Entity type(s) added'))).toBe(true);
  });

  it('detects entity type removal as structural', () => {
    const newModel = { ...baseModel, entityTypes: [] };
    const result = detectStructuralChanges(baseModel, newModel);
    expect(result.isStructural).toBe(true);
    expect(result.changes.some(c => c.includes('Entity type(s) removed'))).toBe(true);
  });

  it('detects B-Event addition as structural', () => {
    const newModel = {
      ...baseModel,
      bEvents: [...baseModel.bEvents, { id: 'b2', name: 'Complete', schedules: [] }],
    };
    const result = detectStructuralChanges(baseModel, newModel);
    expect(result.isStructural).toBe(true);
    expect(result.changes.some(c => c.includes('B-Event(s) added'))).toBe(true);
  });

  it('detects C-Event modification as structural', () => {
    const newModel = {
      ...baseModel,
      cEvents: [{ ...baseModel.cEvents[0], condition: { variable: 'Queue.q1.length', operator: '>', value: 5 } }],
    };
    const result = detectStructuralChanges(baseModel, newModel);
    expect(result.isStructural).toBe(true);
    expect(result.changes.some(c => c.includes('C-Event(s) modified'))).toBe(true);
  });

  it('detects queue addition as structural', () => {
    const newModel = {
      ...baseModel,
      queues: [...baseModel.queues, { id: 'q2', name: 'VIP Queue', discipline: 'FIFO' }],
    };
    const result = detectStructuralChanges(baseModel, newModel);
    expect(result.isStructural).toBe(true);
    expect(result.changes.some(c => c.includes('Queue(s) added'))).toBe(true);
  });

  it('detects graph structure change as structural', () => {
    const newModel = {
      ...baseModel,
      graph: { nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [] },
    };
    const result = detectStructuralChanges(baseModel, newModel);
    expect(result.isStructural).toBe(true);
    expect(result.changes.some(c => c.includes('Graph structure changed'))).toBe(true);
  });

  it('does NOT detect experiment defaults change as structural', () => {
    const newModel = {
      ...baseModel,
      experimentDefaults: { maxSimTime: 1000, warmupPeriod: 50, replications: 5 },
    };
    const result = detectStructuralChanges(baseModel, newModel);
    expect(result.isStructural).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('does NOT detect name/description change as structural', () => {
    const newModel = {
      ...baseModel,
      name: 'Updated Model',
      description: 'Updated description',
    };
    const result = detectStructuralChanges(baseModel, newModel);
    expect(result.isStructural).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('handles null oldModel (first version)', () => {
    const result = detectStructuralChanges(null, baseModel);
    expect(result.isStructural).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
  });

  it('handles empty models', () => {
    const result = detectStructuralChanges({}, {});
    expect(result.isStructural).toBe(false);
    expect(result.changes).toHaveLength(0);
  });
});
