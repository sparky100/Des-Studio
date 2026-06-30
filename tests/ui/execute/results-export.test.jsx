import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEntityJourneys,
  buildResultsCsv,
  buildResultsExportPayload,
  ExecutePanel,
} from '../../../src/ui/execute/index.jsx';

const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFetchRunHistory = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../../../src/db/models.js', () => ({
  fetchRunHistory:  mockFetchRunHistory,
  saveSimulationRun: mockSaveSimulationRun,
  fetchUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  saveUserSettings:  vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  fetchExperiments: vi.fn().mockResolvedValue([]),
  saveExperiment: vi.fn().mockResolvedValue({}),
  updateExperiment: vi.fn().mockResolvedValue({}),
  cloneExperiment: vi.fn().mockResolvedValue({}),
  deleteExperiment: vi.fn().mockResolvedValue({ ok: true }),
  fetchModelSchedules: vi.fn().mockResolvedValue([]),
  buildSchedulesMap: vi.fn().mockReturnValue({}),
}));

const validModel = {
  name: 'Queue Demo',
  entityTypes: [
    { id: 'et_customer', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_server', name: 'Server', role: 'server', count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b_arrive',
      name: 'Arrival',
      scheduledTime: '0',
      effect: 'ARRIVE(Customer)',
      schedules: [],
    },
    {
      id: 'b_complete',
      name: 'Complete',
      scheduledTime: '9999',
      effect: 'COMPLETE()',
      schedules: [],
    },
  ],
  cEvents: [],
  queues: [],
};

const singleResult = {
  snap: { clock: 10, entities: [], served: 4, reneged: 1 },
  finalTime: 10,
  summary: {
    total: 5,
    served: 4,
    reneged: 1,
    avgWait: 2.5,
    avgSvc: 1.25,
    avgSojourn: 3.75,
    outcomes: {
      "route-exit:triage": { routeId: "route-exit:triage", routeLabel: "Exit", status: "completed", endedBy: "direct-routing", count: 2 },
    },
  },
};

describe('results export helpers', () => {
  it('builds a JSON payload with experiment config and results', () => {
    const payload = buildResultsExportPayload({
      model: validModel,
      results: singleResult,
      config: {
        modelId: 'model-1',
        seed: 123,
        replications: 1,
        warmupPeriod: 5,
        maxSimTime: 100,
        terminationMode: 'time',
        runLabel: 'Baseline',
      },
      exportedAt: '2026-05-04T12:00:00.000Z',
    });

    expect(payload).toEqual(expect.objectContaining({
      schema: 'simmodlr.results.v1',
      status: 'complete',
      exportedAt: '2026-05-04T12:00:00.000Z',
      results: { ...singleResult, entityJourneys: [] },
    }));
    expect(payload.model).toEqual({ id: 'model-1', name: 'Queue Demo' });
    expect(payload.experiment).toEqual(expect.objectContaining({
      seed: 123,
      replications: 1,
      warmupPeriod: 5,
      maxSimTime: 100,
      runLabel: 'Baseline',
    }));
  });

  it('builds CSV with the expected replication headers', () => {
    const csv = buildResultsCsv({ results: singleResult, config: { seed: 123 } });

    expect(csv.split('\n')[0]).toBe('runLabel,replicationIndex,seed,arrived,served,reneged,completionRate,avgWait,avgSvc,avgSojourn,avgTimeInSystem,totalCost,costPerServed,finalTime');
    expect(csv).toContain(',0,123,5,4,1,,2.5,1.25,3.75,,,,10');
  });

  it('includes one CSV row per completed replication plus aggregates', () => {
    const csv = buildResultsCsv({
      replicationResults: [
        { replicationIndex: 0, seed: 10, result: { finalTime: 20, summary: { served: 2, reneged: 0, avgWait: 4, avgSvc: 2, avgSojourn: 6 } } },
        { replicationIndex: 1, seed: 11, result: { finalTime: 22, summary: { served: 3, reneged: 1, avgWait: 5, avgSvc: 3, avgSojourn: 8 } } },
      ],
      aggregateStats: {
        'summary.avgWait': { n: 2, mean: 4.5, lower: 1, upper: 8, halfWidth: 3.5 },
      },
    });

    expect(csv).toContain(',0,10,,2,0,,4,2,6,,,,20');
    expect(csv).toContain(',1,11,,3,1,,5,3,8,,,,22');
    expect(csv).toContain('metric,n,mean,lower95,upper95,halfWidth');
    expect(csv).toContain('summary.avgWait,2,4.5,1,8,3.5');
  });
});

describe('buildEntityJourneys', () => {
  it('returns empty array for null/undefined input', () => {
    expect(buildEntityJourneys(null)).toEqual([]);
    expect(buildEntityJourneys(undefined)).toEqual([]);
    expect(buildEntityJourneys([])).toEqual([]);
  });

  it('filters out server entities', () => {
    const summary = [
      { id: 's1', role: 'server', type: 'Cashier', status: 'idle', arrivalTime: 0 },
      { id: 'c1', role: 'customer', type: 'Customer', status: 'done', arrivalTime: 0, completedAt: 10 },
    ];
    const result = buildEntityJourneys(summary);
    expect(result).toHaveLength(1);
    expect(result[0].entityId).toBe('c1');
  });

  it('maps entity fields to flat journey structure', () => {
    const summary = [{
      id: 'e_42',
      type: 'Customer',
      role: 'customer',
      status: 'done',
      arrivalTime: 0,
      completedAt: 12.5,
      stages: [
        { queueName: 'Checkout', stageWait: 3.2, serverType: 'Cashier', stageService: 1.8 },
        { queueName: 'Counter', stageWait: 0.5, serverType: 'Clerk', stageService: 2.1 },
      ],
      outcome: { routeId: 'route-exit:main', routeLabel: 'Served', status: 'completed', endedBy: 'COMPLETE' },
    }];
    const result = buildEntityJourneys(summary);
    expect(result[0]).toEqual({
      entityId: 'e_42',
      type: 'Customer',
      arrivedAt: 0,
      completedAt: 12.5,
      status: 'done',
      stages: [
        { queue: 'Checkout', wait: 3.2, server: 'Cashier', service: 1.8 },
        { queue: 'Counter', wait: 0.5, server: 'Clerk', service: 2.1 },
      ],
      outcome: { routeId: 'route-exit:main', routeLabel: 'Served', status: 'completed', endedBy: 'COMPLETE' },
    });
  });

  it('handles entities with no stages', () => {
    const summary = [{
      id: 'e_1', type: 'Customer', role: 'customer', status: 'waiting',
      arrivalTime: 5, completedAt: null, outcome: null,
    }];
    const result = buildEntityJourneys(summary);
    expect(result[0].stages).toEqual([]);
    expect(result[0].outcome).toBeNull();
  });

  it('handles entities with non-finite stage values', () => {
    const summary = [{
      id: 'e_1', type: 'Customer', role: 'customer', status: 'done',
      arrivalTime: 0, completedAt: 10,
      stages: [{ queueName: 'Q', stageWait: null, serverType: 'S', stageService: undefined }],
      outcome: null,
    }];
    const result = buildEntityJourneys(summary);
    expect(result[0].stages[0].wait).toBeNull();
    expect(result[0].stages[0].service).toBeNull();
  });

  it('entityJourneys included in JSON export payload when metricsOnly=false', () => {
    const payload = buildResultsExportPayload({
      model: validModel,
      results: { ...singleResult, entitySummary: [
        { id: 'e1', type: 'Customer', role: 'customer', status: 'done', arrivalTime: 0, completedAt: 10, stages: [], outcome: null },
      ]},
      config: { modelId: 'm1', seed: 42 },
      metricsOnly: false,
    });
    expect(payload.results.entityJourneys).toHaveLength(1);
    expect(payload.results.entityJourneys[0].entityId).toBe('e1');
  });

  it('entityJourneys excluded from JSON export when metricsOnly=true', () => {
    const payload = buildResultsExportPayload({
      model: validModel,
      results: { ...singleResult, entitySummary: [
        { id: 'e1', type: 'Customer', role: 'customer', status: 'done', arrivalTime: 0, completedAt: 10, stages: [], outcome: null },
      ]},
      config: { modelId: 'm1', seed: 42 },
      metricsOnly: true,
    });
    expect(payload.results.entityJourneys).toBeUndefined();
  });
});

describe('ExecutePanel unified export popover', () => {
  it('renders Export button disabled before run', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    expect(screen.getByRole('button', { name: 'Export ▾' })).toBeDisabled();
  });

  beforeEach(() => {
    mockSaveSimulationRun.mockReset();
    mockSaveSimulationRun.mockResolvedValue(undefined);
  });

  it('disables result exports before a run and enables them after completion', async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    expect(screen.getByRole('button', { name: 'Export ▾' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export ▾' })).not.toBeDisabled()
    );
  });
});
