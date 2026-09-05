// Schema contract round-trip test (see CLAUDE.md / AGENTS.md §"Schema
// Contract"): StudyDefinition is a new field persisted to the Supabase
// `studies.definition` JSONB column (and StudyPoint rows to `study_points`)
// via src/db/models.js's saveStudy(). This asserts the definition/points
// survive that insert-payload construction unchanged, and separately
// exercises the MetricRef helpers StudyDefinition.objective depends on.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveStudy } from '../../src/db/models.js';
import { supabase } from '../../src/db/supabase.js';
import {
  STUDY_SCHEMA_VERSION,
  isAllowedMetricRef,
  metricRefToPath,
  summaryPathToMetricRef,
} from '../../src/contracts/study';

/** @type {import('../../src/contracts/study').StudyDefinition} */
const fullDefinition = {
  name: 'Nurse staffing vs wait time',
  planType: 'grid1d',
  parameters: [
    {
      type: 'entityTypeCount',
      targetId: 'et1',
      path: 'entityTypes.et1.count',
      label: 'Number of Nurse',
      description: 'How many Nurse servers are available',
      currentValue: 2,
      range: { min: 1, max: 5, step: 1 },
    },
  ],
  goals: [
    {
      id: 'g1',
      metric: 'summary.avgWait',
      target: 10,
      operator: '<',
      label: 'Wait under 10',
      description: null,
      scope: null,
    },
  ],
  objective: {
    metricRef: { kind: 'perResource', resourceTypeId: 'et1', field: 'utilisation' },
    direction: 'max',
  },
  runBudget: { points: 5, replicationsPerPoint: 10 },
  baseSeed: 42,
  origin: { kind: 'user' },
};

const fullPoints = [
  {
    pointIndex: 0,
    params: [{ path: 'entityTypes.et1.count', value: 1 }],
    replications: 10,
    metrics: { 'summary.avgWait': { mean: 9.1, ci95Low: 8.5, ci95High: 9.7, min: 2, max: 20 } },
    feasible: true,
    seed: 42,
  },
];

describe('StudyDefinition persistence round-trip', () => {
  beforeEach(() => {
    const qb = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'study-1', definition: fullDefinition, schema_version: STUDY_SCHEMA_VERSION, status: 'complete', origin: fullDefinition.origin, created_at: '2026-09-05T12:00:00Z' },
        error: null,
      }),
    };
    supabase.from.mockReturnValue(qb);
  });

  it('saveStudy sends the full StudyDefinition to the studies.definition column unchanged', async () => {
    await saveStudy('model-1', 'user-1', fullDefinition, fullPoints);

    const insertedRow = supabase.from('studies').insert.mock.calls[0][0];
    expect(insertedRow.definition).toEqual(fullDefinition);
    expect(insertedRow.schema_version).toBe(STUDY_SCHEMA_VERSION);
  });

  it('saveStudy sends each StudyPoint to study_points unchanged (minus the wrapper study_id/point_index)', async () => {
    await saveStudy('model-1', 'user-1', fullDefinition, fullPoints);

    // insert() is the same spy for both the "studies" and "study_points"
    // calls (the mock's from() ignores the table name), and saveStudy()
    // inserts the studies row first — so this is the *second* call.
    const insertedPointRows = supabase.from('study_points').insert.mock.calls[1][0];
    expect(insertedPointRows).toHaveLength(1);
    expect(insertedPointRows[0]).toMatchObject({
      study_id: 'study-1',
      point_index: 0,
      params: fullPoints[0].params,
      replications: 10,
      metrics: fullPoints[0].metrics,
      feasible: true,
      seed: 42,
    });
  });
});

describe('MetricRef helpers', () => {
  const model = {
    entityTypes: [{ id: 'et1', name: 'Nurse', role: 'server' }],
    queues: [{ id: 'q1', name: 'TriageQueue' }],
  };

  it('metricRefToPath resolves a summary ref without needing a model', () => {
    expect(metricRefToPath({ kind: 'summary', field: 'avgWait' })).toBe('summary.avgWait');
  });

  it('metricRefToPath resolves a runtimeMetrics ref without needing a model', () => {
    expect(metricRefToPath({ kind: 'runtimeMetrics', field: 'events_processed' })).toBe('runtimeMetrics.events_processed');
  });

  it('metricRefToPath resolves a perResource ref by looking up the entity type name', () => {
    expect(metricRefToPath({ kind: 'perResource', resourceTypeId: 'et1', field: 'utilisation' }, model))
      .toBe('summary.perResource.Nurse.utilisation');
  });

  it('metricRefToPath resolves a perQueue ref by looking up the queue name', () => {
    expect(metricRefToPath({ kind: 'perQueue', queueId: 'q1', field: 'blockingCount' }, model))
      .toBe('summary.perQueue.TriageQueue.blockingCount');
  });

  it('metricRefToPath returns null when the referenced id is not found in the model', () => {
    expect(metricRefToPath({ kind: 'perResource', resourceTypeId: 'missing', field: 'utilisation' }, model)).toBeNull();
  });

  it('isAllowedMetricRef accepts every field in each allowed-refs list', () => {
    expect(isAllowedMetricRef({ kind: 'summary', field: 'avgWait' })).toBe(true);
    expect(isAllowedMetricRef({ kind: 'perResource', resourceTypeId: 'et1', field: 'utilisation' })).toBe(true);
    expect(isAllowedMetricRef({ kind: 'perQueue', queueId: 'q1', field: 'blockingCount' })).toBe(true);
    expect(isAllowedMetricRef({ kind: 'runtimeMetrics', field: 'events_processed' })).toBe(true);
  });

  it('isAllowedMetricRef rejects an unknown field or kind', () => {
    expect(isAllowedMetricRef({ kind: 'summary', field: 'notAField' })).toBe(false);
    expect(isAllowedMetricRef({ kind: 'perResource', field: 'utilisation' })).toBe(false); // missing resourceTypeId
    expect(isAllowedMetricRef({ kind: 'somethingElse', field: 'avgWait' })).toBe(false);
    expect(isAllowedMetricRef(null)).toBe(false);
  });

  it('summaryPathToMetricRef round-trips with metricRefToPath for summary fields', () => {
    const ref = summaryPathToMetricRef('summary.avgSojourn');
    expect(ref).toEqual({ kind: 'summary', field: 'avgSojourn' });
    expect(metricRefToPath(ref)).toBe('summary.avgSojourn');
  });

  it('summaryPathToMetricRef returns null for a non-summary or unknown path', () => {
    expect(summaryPathToMetricRef('runtimeMetrics.events_processed')).toBeNull();
    expect(summaryPathToMetricRef('summary.notAField')).toBeNull();
  });
});
