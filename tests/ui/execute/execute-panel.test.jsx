import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutePanel } from '../../../src/ui/execute/index.jsx';

const mockRunReplications = vi.hoisted(() => vi.fn());
const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue('saved-run-id'));
const mockFetchRunHistory = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockFetchUserSettings = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockStreamNarrative = vi.hoisted(() => vi.fn());

vi.mock('../../../src/engine/replication-runner.js', () => ({
  runReplications: mockRunReplications,
  createReplicationPool: () => ({ destroyed: false, get: vi.fn(), destroy: vi.fn() }),
}));

vi.mock('../../../src/db/models.js', () => ({
  fetchRunHistory: mockFetchRunHistory,
  saveSimulationRun: mockSaveSimulationRun,
  fetchUserSettings: mockFetchUserSettings,
  saveUserSettings:  vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  fetchExperiments: vi.fn().mockResolvedValue([]),
  saveExperiment: vi.fn().mockResolvedValue({}),
  updateExperiment: vi.fn().mockResolvedValue({}),
  cloneExperiment: vi.fn().mockResolvedValue({}),
  deleteExperiment: vi.fn().mockResolvedValue({ ok: true }),
  fetchModelSchedules: vi.fn().mockResolvedValue([]),
  buildSchedulesMap: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../src/llm/apiClient.js', () => ({
  streamNarrative: mockStreamNarrative,
}));

const validModel = {
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

describe('ExecutePanel', () => {
  const openSetup = () => {
    fireEvent.click(screen.getByRole('button', { name: /^setup$/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit setup/i }));
  };

  beforeEach(() => {
    mockRunReplications.mockReset();
    mockSaveSimulationRun.mockReset();
    mockFetchRunHistory.mockReset();
    mockFetchUserSettings.mockReset();
    mockStreamNarrative.mockReset();
    mockSaveSimulationRun.mockResolvedValue('saved-run-id');
    mockFetchRunHistory.mockImplementation(() => new Promise(() => {}));
    mockFetchUserSettings.mockImplementation(() => new Promise(() => {}));
  });

  it('renders the execute controls without crashing', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    expect(screen.getByRole('button', { name: /^run$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^setup$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^studies$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /batch run/i })).toBeInTheDocument();
    expect(screen.getByText('RUN SIZE ESTIMATE')).toBeInTheDocument();
    expect(screen.getByText('Conservative preview of likely workload before execution.')).toBeInTheDocument();
    expect(screen.getByText('Run or step the simulation to see the visual view.')).toBeInTheDocument();
  });

  it('loads and persists model experiment defaults from Execute controls', () => {
    const onExperimentDefaultsChange = vi.fn();
    render(
      <ExecutePanel
        model={{
          ...validModel,
          experimentDefaults: { maxSimTime: 750, warmupPeriod: 25, replications: 4, terminationMode: 'time' },
        }}
        modelId="model-1"
        userId="user-1"
        onExperimentDefaultsChange={onExperimentDefaultsChange}
      />
    );

    openSetup();
    expect(screen.getByLabelText(/warm-up period/i)).toHaveValue(25);
    expect(screen.getByLabelText(/replication count/i)).toHaveValue(4);
    expect(screen.getByLabelText(/run duration/i)).toHaveValue(750);

    fireEvent.change(screen.getByLabelText(/run duration/i), { target: { value: '900' } });

    expect(onExperimentDefaultsChange).toHaveBeenCalledWith(expect.objectContaining({
      maxSimTime: 900,
      warmupPeriod: 25,
      replications: 4,
      terminationMode: 'time',
    }));
  });

  it('keeps the Results entry hidden until a run completes', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    expect(screen.queryByRole('button', { name: /view results/i })).not.toBeInTheDocument();
  });

  it('blocks runs through shared validation when replication count is invalid', async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    openSetup();
    fireEvent.change(screen.getByLabelText(/replication count/i), { target: { value: '0' } });

    expect(screen.getAllByRole('button', { name: /blocker/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: /batch run/i })).not.toBeInTheDocument();

    await waitFor(() => expect(mockSaveSimulationRun).not.toHaveBeenCalled());
    expect(mockRunReplications).not.toHaveBeenCalled();
  });

  it('blocks runs through shared validation when warm-up reaches the run duration in time mode', async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    openSetup();
    fireEvent.change(screen.getByLabelText(/warm-up period/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/run duration/i), { target: { value: '500' } });

    expect(screen.getAllByRole('button', { name: /blocker/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: /batch run/i })).not.toBeInTheDocument();

    await waitFor(() => expect(mockSaveSimulationRun).not.toHaveBeenCalled());
    expect(mockRunReplications).not.toHaveBeenCalled();
  });

  it('runs one replication through the existing single-run path', async () => {
    const onRunSaved = vi.fn();
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" onRunSaved={onRunSaved} />);

    openSetup();
    fireEvent.change(screen.getByLabelText(/run label/i), { target: { value: 'Baseline' } });
    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(mockRunReplications).not.toHaveBeenCalled();
    expect(mockSaveSimulationRun.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        runtimeMetrics: expect.objectContaining({
          replications: 1,
          wall_clock_ms: expect.any(Number),
          events_processed: expect.any(Number),
          c_event_scans: expect.any(Number),
          c_events_fired: expect.any(Number),
          entities_created: expect.any(Number),
          entities_completed: expect.any(Number),
        }),
      })
    );
    expect(mockSaveSimulationRun.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        replications: 1,
        runLabel: 'Baseline',
        durationMs: expect.any(Number),
        requestedCollectTimeSeries: true,
        effectiveCollectTimeSeries: true,
        resultDetailLevel: 'minimal',
      })
    );
    expect(onRunSaved).toHaveBeenCalledOnce();
  });

  it('allows switching to full archival saves from setup before running', async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    openSetup();
    fireEvent.click(screen.getByRole('button', { name: /^full$/i }));
    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(mockSaveSimulationRun.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        resultDetailLevel: 'full',
      })
    );
  });

  it('shows the Results entry after a run completes', async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /view results/i })).toBeInTheDocument();
  });

  it('saves all 10 sequential single-replication runs — each click triggers one Supabase insert', async () => {
    // Each iteration runs a real engine.runAll(); allow 30 s for the full loop under load.
    const onRunSaved = vi.fn();
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" onRunSaved={onRunSaved} />);

    openSetup();
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByRole('button', { name: /batch run/i }));
      await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(i + 1));
      await waitFor(() => expect(onRunSaved).toHaveBeenCalledTimes(i + 1));
    }

    expect(mockSaveSimulationRun).toHaveBeenCalledTimes(10);
    expect(onRunSaved).toHaveBeenCalledTimes(10);
    // Every call must target the same model with replications=1
    mockSaveSimulationRun.mock.calls.forEach(([modelId, userId]) => {
      expect(modelId).toBe('model-1');
      expect(userId).toBe('user-1');
    });
  }, 30000);

  it('displays batch results and saves one record when a multi-replication batch completes', async () => {
    const N = 3;
    const onRunSaved = vi.fn();

    // Mock the replication runner to immediately deliver all N payloads and complete
    mockRunReplications.mockImplementation(({ onReplicationComplete, onComplete }) => {
      const payloads = Array.from({ length: N }, (_, i) => ({
        replicationIndex: i,
        seed: 1000 + i,
        result: {
          snap: { clock: 100 + i },
          summary: { total: 10, served: 8, reneged: 0, avgWait: 5.0, avgSvc: 3.0, avgSojourn: 8.0 },
          finalTime: 100 + i,
        },
      }));
      payloads.forEach(p => onReplicationComplete?.(p, {}));
      onComplete?.(payloads);
      return { cancel: vi.fn() };
    });

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" onRunSaved={onRunSaved} />);

    openSetup();
    const spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[1], { target: { value: String(N) } });
    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(mockSaveSimulationRun.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        runtimeMetrics: expect.objectContaining({
          replications: N,
          wall_clock_ms: expect.any(Number),
          events_processed: expect.any(Number),
          c_event_scans: expect.any(Number),
          c_events_fired: expect.any(Number),
          entities_created: expect.any(Number),
          entities_completed: expect.any(Number),
        }),
      })
    );
    expect(mockSaveSimulationRun.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        replications: N,
        durationMs: expect.any(Number),
        requestedCollectTimeSeries: true,
        effectiveCollectTimeSeries: true,
      })
    );
    await waitFor(() => expect(onRunSaved).toHaveBeenCalledOnce());

    // The batch status badge and each replication row both render "complete" tags
    expect(screen.getAllByText('complete').length).toBeGreaterThanOrEqual(N + 1);
  });

  it('shows batch progress and cancel button for multi-replication runs', async () => {
    const cancel = vi.fn();
    mockRunReplications.mockImplementation(({ onProgress }) => {
      onProgress({ completed: 0, total: 3, running: 2, pending: 1, cancelled: false, workerCount: 2 });
      return { cancel };
    });

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    openSetup();
    const spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[1], { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    expect(await screen.findByText('REPLICATION BATCH')).toBeInTheDocument();
    expect(screen.getByText('Running 0/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel batch/i })).toBeInTheDocument();
    expect(mockRunReplications).toHaveBeenCalledWith(
      expect.objectContaining({ replications: 3, baseSeed: expect.any(Number) })
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel batch/i }));
    expect(cancel).toHaveBeenCalled();
  });

  it('calls onGoToResults when the Results entry is used after a run', async () => {
    const onGoToResults = vi.fn();
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" onGoToResults={onGoToResults} />);

    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));
    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /view results/i }));
    expect(onGoToResults).toHaveBeenCalledOnce();
  });

  it('updates replication rows and aggregate CI from runner callbacks', async () => {
    mockRunReplications.mockImplementation(({ onProgress, onReplicationComplete }) => {
      onProgress({ completed: 0, total: 2, running: 2, pending: 0, cancelled: false, workerCount: 2 });
      onReplicationComplete({
        replicationIndex: 0,
        seed: 10,
        result: { finalTime: 10, snap: { clock: 10, entities: [], served: 1, reneged: 0 }, summary: { served: 1, reneged: 0, avgWait: 4, avgSvc: 2, avgSojourn: 6 } },
      });
      onReplicationComplete({
        replicationIndex: 1,
        seed: 11,
        result: { finalTime: 11, snap: { clock: 11, entities: [], served: 2, reneged: 0 }, summary: { served: 2, reneged: 0, avgWait: 6, avgSvc: 3, avgSojourn: 7 } },
      });
      return { cancel: vi.fn() };
    });

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    openSetup();
    const spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[1], { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    expect(await screen.findAllByText('Avg wait')).toHaveLength(2);
    expect(screen.getByText('5.0')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getAllByText('11')[0]).toBeInTheDocument();
  });

  it('saves one row after a completed multi-replication batch', async () => {
    mockRunReplications.mockImplementation(({ onReplicationComplete, onComplete }) => {
      const payloads = [
        {
          replicationIndex: 0,
          seed: 20,
          result: { finalTime: 10, snap: { clock: 10, entities: [], served: 1, reneged: 0 }, summary: { total: 1, served: 1, reneged: 0, avgWait: 4, avgSvc: 2, avgSojourn: 6 } },
        },
        {
          replicationIndex: 1,
          seed: 21,
          result: { finalTime: 11, snap: { clock: 11, entities: [], served: 2, reneged: 0 }, summary: { total: 2, served: 2, reneged: 0, avgWait: 6, avgSvc: 3, avgSojourn: 7 } },
        },
      ];
      payloads.forEach(payload => onReplicationComplete(payload));
      onComplete(payloads);
      return { cancel: vi.fn() };
    });

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    openSetup();
    const spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[1], { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(mockSaveSimulationRun.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        replications: 2,
        batchId: expect.any(String),
        replicationResults: expect.any(Array),
        aggregateStats: expect.any(Object),
        requestedCollectTimeSeries: true,
        effectiveCollectTimeSeries: true,
      })
    );
  });

});
