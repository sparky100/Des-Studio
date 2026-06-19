import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutePanel } from '../../../src/ui/execute/index.jsx';

const mockPrefetchAll = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockPrefetchScheduleFeeds = vi.hoisted(() => vi.fn(async model => model));
const mockResolveAllParamSources = vi.hoisted(() => vi.fn(model => model));
const mockDispose = vi.hoisted(() => vi.fn());
const mockFetchRunHistory = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockFetchUserSettings = vi.hoisted(() => vi.fn(() => new Promise(() => {})));

vi.mock('../../../src/engine/adapters/index.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    AdapterRegistry: vi.fn().mockImplementation(() => ({
      prefetchAll: mockPrefetchAll,
      prefetchScheduleFeeds: mockPrefetchScheduleFeeds,
      resolveAllParamSources: mockResolveAllParamSources,
      dispose: mockDispose,
    })),
  };
});

vi.mock('../../../src/db/models.js', () => ({
  fetchRunHistory: mockFetchRunHistory,
  saveSimulationRun: vi.fn().mockResolvedValue('saved-run-id'),
  fetchUserSettings: mockFetchUserSettings,
  saveUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  fetchExperiments: vi.fn().mockResolvedValue([]),
  saveExperiment: vi.fn().mockResolvedValue({}),
  updateExperiment: vi.fn().mockResolvedValue({}),
  cloneExperiment: vi.fn().mockResolvedValue({}),
  deleteExperiment: vi.fn().mockResolvedValue({ ok: true }),
  fetchModelSchedules: vi.fn().mockResolvedValue([]),
  buildSchedulesMap: vi.fn().mockReturnValue({}),
}));

const liveDataModel = {
  entityTypes: [
    { id: 'et_customer', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_server', name: 'Server', role: 'server', count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: 'b_arrive', name: 'Arrival', scheduledTime: '0', effect: 'ARRIVE(Customer)', schedules: [] },
    { id: 'b_complete', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
  ],
  cEvents: [],
  queues: [],
  dataSources: [{ id: 'src1', type: 'scheduleFeed', targetBEventId: 'b_arrive' }],
  experimentDefaults: { liveDataMode: 'calibrated_batch' },
};

describe('live data parity between Run All and Step/Auto Run/Reset', () => {
  beforeEach(() => {
    mockPrefetchAll.mockClear();
    mockPrefetchScheduleFeeds.mockClear();
    mockResolveAllParamSources.mockClear();
    mockDispose.mockClear();
    mockFetchRunHistory.mockImplementation(() => new Promise(() => {}));
    mockFetchUserSettings.mockImplementation(() => new Promise(() => {}));
  });

  it('resolves live data sources when Reset rebuilds the step/auto-run engine', async () => {
    render(<ExecutePanel model={liveDataModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));

    await waitFor(() => expect(mockPrefetchAll).toHaveBeenCalled());
    expect(mockPrefetchScheduleFeeds).toHaveBeenCalled();
    expect(mockResolveAllParamSources).toHaveBeenCalled();
  });

  it('resolves live data sources when Auto Run starts from idle', async () => {
    render(<ExecutePanel model={liveDataModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: /^auto run$/i }));

    await waitFor(() => expect(mockPrefetchAll).toHaveBeenCalled());
    expect(mockPrefetchScheduleFeeds).toHaveBeenCalled();
    expect(mockResolveAllParamSources).toHaveBeenCalled();
  });
});
