import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/ui/shared/xlsxParser.js', () => ({
  parseXlsx: vi.fn(),
}));

const mockGetRun     = vi.hoisted(() => vi.fn());
const mockBuildEngine = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', () => ({
  getRun:               mockGetRun,
  fetchRunHistory:      vi.fn().mockResolvedValue([]),
  updateRunLabel:       vi.fn(),
  updateRunTags:        vi.fn(),
  archiveRun:           vi.fn(),
  unarchiveRun:         vi.fn(),
  deleteSimulationRun:  vi.fn(),
}));

vi.mock('../../src/engine/index.js', () => ({
  buildEngine: mockBuildEngine,
}));

vi.mock('../../src/ui/shared/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }),
}));

import { ModelHistoryTab } from '../../src/ui/ModelHistoryTab.jsx';

const snapshot = { id: 'm1', name: 'Test Model', entityTypes: [] };

const storedSummary = { served: 10, avgWait: 5.0, avgSvc: 2.0, avgSojourn: 7.0, reneged: 0 };

const baseRow = {
  id: 'run-1',
  run_label: 'Baseline',
  ran_at: '2026-05-01T12:00:00Z',
  total_served: 10,
  total_reneged: 0,
  avg_wait_time: 5.0,
  ai_insights: null,
  tags: [],
  archived: false,
  results_json: {
    summary: storedSummary,
    _model_snapshot: snapshot,
    _base_seed: 42,
  },
};

const baseRunRecord = {
  id: 'run-1',
  model_snapshot: snapshot,
  base_seed: 42,
  engine_version: '55a',
  experiment_config: { maxSimTime: 500, warmupPeriod: 0, replications: 1, terminationMode: 'time', terminationCondition: null },
  summary: storedSummary,
  results_json: { summary: storedSummary },
};

function renderTab(overrides = {}) {
  return render(
    <ModelHistoryTab
      historyRows={[baseRow]}
      setHistoryRows={vi.fn()}
      historyLoading={false}
      setHistoryLoading={vi.fn()}
      historyError=""
      setHistoryError={vi.fn()}
      historyShowArchived={false}
      setHistoryShowArchived={vi.fn()}
      shareLinksMap={{}}
      modelId="m1"
      userId="u1"
      model={{ id: 'm1', name: 'Current Model' }}
      baseUrl=""
      onAnalyseRun={vi.fn()}
      onViewResults={vi.fn()}
      {...overrides}
    />
  );
}

describe('Reproduce Run', () => {
  beforeEach(() => {
    mockGetRun.mockReset();
    mockBuildEngine.mockReset();
  });

  it('shows green banner when reproduction matches stored summary', async () => {
    mockGetRun.mockResolvedValue(baseRunRecord);
    mockBuildEngine.mockReturnValue({
      runAll: () => ({ summary: storedSummary }),
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Reproduce' }));

    await waitFor(() =>
      expect(screen.getByTestId('reproduce-result-run-1')).toHaveTextContent(/bit-identical/i)
    );
    expect(screen.getByTestId('reproduce-result-run-1')).toHaveTextContent('✓');
  });

  it('shows red banner when reproduction differs from stored summary', async () => {
    mockGetRun.mockResolvedValue(baseRunRecord);
    mockBuildEngine.mockReturnValue({
      runAll: () => ({ summary: { served: 6, avgWait: 9.9, avgSvc: 2.0, avgSojourn: 11.9, reneged: 2 } }),
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Reproduce' }));

    await waitFor(() =>
      expect(screen.getByTestId('reproduce-result-run-1')).toHaveTextContent(/Reproduce failed/i)
    );
    expect(screen.getByTestId('reproduce-result-run-1')).toHaveTextContent('✗');
  });

  it('passes model_snapshot (not the current model) to the engine', async () => {
    const differentCurrentModel = { id: 'm1', name: 'Different Current Model' };
    mockGetRun.mockResolvedValue(baseRunRecord);
    mockBuildEngine.mockReturnValue({
      runAll: () => ({ summary: storedSummary }),
    });

    renderTab({ model: differentCurrentModel });
    fireEvent.click(screen.getByRole('button', { name: 'Reproduce' }));

    await waitFor(() => expect(mockBuildEngine).toHaveBeenCalled());
    const [engineModel] = mockBuildEngine.mock.calls[0];
    expect(engineModel).toEqual(snapshot);
    expect(engineModel).not.toEqual(differentCurrentModel);
  });

  it('reproduces successfully when getRun returns results_json with nested summary', async () => {
    const runRecordWithResultsJson = {
      ...baseRunRecord,
      results_json: {
        summary: storedSummary,
        _model_snapshot: snapshot,
        _base_seed: 42,
      },
    };
    mockGetRun.mockResolvedValue(runRecordWithResultsJson);
    mockBuildEngine.mockReturnValue({
      runAll: () => ({ summary: storedSummary }),
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Reproduce' }));

    await waitFor(() =>
      expect(screen.getByTestId('reproduce-result-run-1')).toHaveTextContent(/bit-identical/i)
    );
  });

  it('reproduces successfully when summary is only available via results_json.summary', async () => {
    const runRecordWithoutTopSummary = {
      id: 'run-1',
      model_snapshot: snapshot,
      base_seed: 42,
      engine_version: '55a',
      experiment_config: { maxSimTime: 500, warmupPeriod: 0, replications: 1, terminationMode: 'time', terminationCondition: null },
      summary: null,
      results_json: {
        summary: storedSummary,
      },
    };
    mockGetRun.mockResolvedValue(runRecordWithoutTopSummary);
    mockBuildEngine.mockReturnValue({
      runAll: () => ({ summary: storedSummary }),
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Reproduce' }));

    await waitFor(() =>
      expect(screen.getByTestId('reproduce-result-run-1')).toHaveTextContent(/bit-identical/i)
    );
  });

  it('fails reproduce when results_json is missing entirely', async () => {
    const runRecordWithNoResultsJson = {
      id: 'run-1',
      model_snapshot: snapshot,
      base_seed: 42,
      engine_version: '55a',
      experiment_config: { maxSimTime: 500, warmupPeriod: 0, replications: 1, terminationMode: 'time', terminationCondition: null },
      summary: null,
    };
    mockGetRun.mockResolvedValue(runRecordWithNoResultsJson);
    mockBuildEngine.mockReturnValue({
      runAll: () => ({ summary: storedSummary }),
    });

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Reproduce' }));

    await waitFor(() =>
      expect(screen.getByTestId('reproduce-result-run-1')).toHaveTextContent(/Reproduce failed/i)
    );
  });
});
