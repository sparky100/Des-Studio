import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
      schema: 'des-studio.results.v1',
      status: 'complete',
      exportedAt: '2026-05-04T12:00:00.000Z',
      results: singleResult,
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

    expect(csv.split('\n')[0]).toBe('runLabel,replicationIndex,seed,served,reneged,avgWait,avgSvc,avgSojourn,finalTime');
    expect(csv).toContain(',0,123,4,1,2.5,1.25,3.75,10');
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

    expect(csv).toContain(',0,10,2,0,4,2,6,20');
    expect(csv).toContain(',1,11,3,1,5,3,8,22');
    expect(csv).toContain('metric,n,mean,lower95,upper95,halfWidth');
    expect(csv).toContain('summary.avgWait,2,4.5,1,8,3.5');
  });
});

describe('ExecutePanel results export buttons', () => {
  beforeEach(() => {
    mockSaveSimulationRun.mockReset();
    mockSaveSimulationRun.mockResolvedValue(undefined);
  });

  it('disables result exports before a run and enables them after completion', async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    expect(screen.getByRole('button', { name: 'Export Results' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export Results CSV' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Export Results' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export Results CSV' })).not.toBeDisabled();
  });
});
