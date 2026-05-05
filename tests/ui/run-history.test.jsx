import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchRunHistory = vi.hoisted(() => vi.fn());
const mockSaveSimulationRun = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', () => ({
  fetchRunHistory: mockFetchRunHistory,
  saveSimulationRun: mockSaveSimulationRun,
}));

import {
  ModelDetail,
  buildRunHistoryCsv,
  buildRunHistoryExportPayload,
} from '../../src/ui/ModelDetail.jsx';

const baseModel = {
  id: 'm1',
  name: 'Emergency Desk',
  description: 'A small queueing model',
  visibility: 'private',
  access: {},
  entityTypes: [],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
  owner_id: 'user-1',
};

const historyRow = {
  id: 'run-1',
  run_label: 'Two servers',
  ran_at: '2026-05-04T21:47:32.000Z',
  seed: 123,
  replications: 1,
  warmup_period: 0,
  max_simulation_time: 500,
  total_arrived: 109,
  total_served: 81,
  total_reneged: 0,
  renege_rate: 0,
  avg_wait_time: 7.25,
  avg_service_time: 3.5,
  duration_ms: 42,
  results_json: { runLabel: 'Two servers' },
};

function renderDetail() {
  return render(
    <ModelDetail
      modelId="m1"
      modelData={baseModel}
      onBack={vi.fn()}
      onRefresh={vi.fn()}
      overrides={{ isOwner: true, canEdit: true, profiles: [], userId: 'user-1' }}
    />
  );
}

describe('run history', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetchRunHistory.mockReset();
    mockFetchRunHistory.mockResolvedValue([historyRow]);
    URL.createObjectURL = vi.fn(() => 'blob:run-history');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('shows run labels and export actions on the history page', async () => {
    renderDetail();

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));

    await waitFor(() => expect(mockFetchRunHistory).toHaveBeenCalledWith('m1'));
    expect(await screen.findByText('Two servers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export history json/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /export history csv/i })).toBeEnabled();
  });

  it('exports normalized history payloads', () => {
    const payload = buildRunHistoryExportPayload(baseModel, [historyRow], '2026-05-05T12:00:00.000Z');
    const csv = buildRunHistoryCsv([historyRow]);

    expect(payload.runs[0]).toEqual(expect.objectContaining({
      runLabel: 'Two servers',
      seed: 123,
      totalArrived: 109,
    }));
    expect(csv.split('\n')[0]).toContain('runLabel,ranAt,seed');
    expect(csv).toContain('Two servers,2026-05-04T21:47:32.000Z,123');
  });

  it('downloads run history JSON from the page action', async () => {
    renderDetail();

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    await screen.findByText('Two servers');
    fireEvent.click(screen.getByRole('button', { name: /export history json/i }));

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:run-history');
  });
});
