import { describe, test, expect } from 'vitest';
import { buildModelDiff } from '../ModelDiffPreview.jsx';

const A = {
  entityTypes: [{ id: 'et1', name: 'Customer' }],
  bEvents: [{ id: 'b1', name: 'Arrive' }],
  cEvents: [],
  queues: [{ id: 'q1', name: 'Queue' }],
  stateVariables: [],
};

const B = {
  entityTypes: [{ id: 'et1', name: 'Customer' }, { id: 'et2', name: 'Server' }],
  bEvents: [{ id: 'b1', name: 'Arrive' }],
  cEvents: [{ id: 'c1', name: 'Seize' }],
  queues: [],
  stateVariables: [],
};

describe('buildModelDiff', () => {
  test('returns one section per model section type', () => {
    const diff = buildModelDiff(A, B);
    expect(diff).toHaveLength(5);
    const keys = diff.map(d => d.key);
    expect(keys).toContain('entityTypes');
    expect(keys).toContain('queues');
  });

  test('detects added entity type', () => {
    const diff = buildModelDiff(A, B);
    const etSection = diff.find(d => d.key === 'entityTypes');
    expect(etSection.diff.added).toHaveLength(1);
    expect(etSection.diff.added[0].name).toBe('Server');
  });

  test('detects removed queue', () => {
    const diff = buildModelDiff(A, B);
    const qSection = diff.find(d => d.key === 'queues');
    expect(qSection.diff.removed).toHaveLength(1);
  });

  test('detects added C-Event', () => {
    const diff = buildModelDiff(A, B);
    const ceSection = diff.find(d => d.key === 'cEvents');
    expect(ceSection.diff.added).toHaveLength(1);
  });

  test('unchanged items reported correctly', () => {
    const diff = buildModelDiff(A, A);
    diff.forEach(section => {
      expect(section.diff.added).toHaveLength(0);
      expect(section.diff.removed).toHaveLength(0);
      expect(section.diff.modified).toHaveLength(0);
    });
  });

  test('detects modified item', () => {
    const C = { ...A, bEvents: [{ id: 'b1', name: 'ArrivalRenamed' }] };
    const diff = buildModelDiff(A, C);
    const beSection = diff.find(d => d.key === 'bEvents');
    expect(beSection.diff.modified).toHaveLength(1);
  });
});
