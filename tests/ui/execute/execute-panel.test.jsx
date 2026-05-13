import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutePanel } from '../../../src/ui/execute/index.jsx';

const mockRunReplications = vi.hoisted(() => vi.fn());
const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFetchRunHistory = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockFetchUserSettings = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockStreamNarrative = vi.hoisted(() => vi.fn());

vi.mock('../../../src/engine/replication-runner.js', () => ({
  runReplications: mockRunReplications,
}));

vi.mock('../../../src/db/models.js', () => ({
  fetchRunHistory: mockFetchRunHistory,
  saveSimulationRun: mockSaveSimulationRun,
  fetchUserSettings: mockFetchUserSettings,
  saveUserSettings:  vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
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
    mockSaveSimulationRun.mockResolvedValue(undefined);
    mockFetchRunHistory.mockImplementation(() => new Promise(() => {}));
    mockFetchUserSettings.mockImplementation(() => new Promise(() => {}));
  });

  it('renders the execute controls without crashing', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    expect(screen.getByRole('button', { name: /^run$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^setup$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^experiments$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run all/i })).toBeInTheDocument();
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

  it('toggles the AI assistant panel with actions disabled before results exist', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

    expect(screen.getByRole('complementary', { name: /ai assistant/i })).toBeInTheDocument();
    expect(screen.getByText('Run the model to generate insights.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explain results/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^compare$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /sensitivity/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /close ai assistant/i }));
    expect(screen.queryByRole('complementary', { name: /ai assistant/i })).not.toBeInTheDocument();
  });

  it('runs one replication through the existing single-run path', async () => {
    const onRunSaved = vi.fn();
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" onRunSaved={onRunSaved} />);

    openSetup();
    fireEvent.change(screen.getByLabelText(/run label/i), { target: { value: 'Baseline' } });
    fireEvent.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(mockRunReplications).not.toHaveBeenCalled();
    expect(mockSaveSimulationRun.mock.calls[0][3]).toEqual(
      expect.objectContaining({ replications: 1, runLabel: 'Baseline' })
    );
    expect(onRunSaved).toHaveBeenCalledOnce();
  });

  it('enables the Analysis view after a run completes', async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    expect(screen.getByRole('button', { name: /^analysis$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /^analysis$/i })).not.toBeDisabled();
  });

  it('saves all 10 sequential single-replication runs — each click triggers one Supabase insert', async () => {
    // Each iteration runs a real engine.runAll(); allow 30 s for the full loop under load.
    const onRunSaved = vi.fn();
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" onRunSaved={onRunSaved} />);

    openSetup();
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByRole('button', { name: /run all/i }));
      // Wait for this run's save to complete before clicking again
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
    fireEvent.click(screen.getByRole('button', { name: /run all/i }));

    // The batch save must fire exactly once with replications=N
    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(mockSaveSimulationRun.mock.calls[0][3]).toEqual(
      expect.objectContaining({ replications: N })
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
    fireEvent.click(screen.getByRole('button', { name: /run all/i }));

    expect(await screen.findByText('REPLICATION BATCH')).toBeInTheDocument();
    expect(screen.getByText('Running 0/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel batch/i })).toBeInTheDocument();
    expect(mockRunReplications).toHaveBeenCalledWith(
      expect.objectContaining({ replications: 3, baseSeed: expect.any(Number) })
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel batch/i }));
    expect(cancel).toHaveBeenCalled();
  });

  it('populates AI comparison options from completed replications', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /run all/i }));
    fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

    expect(await screen.findByRole('option', { name: /replication 1/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /replication 2/i })).toBeInTheDocument();
  });

  it('loads saved run history for AI comparison when the panel opens', async () => {
    mockFetchRunHistory.mockResolvedValueOnce([
      {
        id: 'run-1',
        ran_at: '2026-05-04T21:47:32.000Z',
        total_arrived: 100,
        total_served: 80,
        total_reneged: 2,
        avg_wait_time: 7,
        avg_service_time: 3,
        renege_rate: 0.02,
        replications: 1,
        seed: 123,
        max_simulation_time: 500,
        warmup_period: 0,
        run_label: 'Baseline',
        results_json: { summary: { avgSojourn: 10 } },
      },
    ]);

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

    await waitFor(() => expect(mockFetchRunHistory).toHaveBeenCalledWith('model-1'));
    expect(await screen.findByRole('option', { name: 'Baseline' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /run all/i }));

    expect(await screen.findAllByText('Avg wait')).toHaveLength(2);
    expect(screen.getByText('5')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(mockSaveSimulationRun.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        replications: 2,
        batchId: expect.any(String),
        replicationResults: expect.any(Array),
        aggregateStats: expect.any(Object),
      })
    );
  });

  it('shows an AI assistant error banner when streaming fails', async () => {
    mockStreamNarrative.mockImplementation((prompt, handlers) => {
      handlers.onError(new Error('network down'));
    });

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: /run all/i }));
    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));
    fireEvent.click(screen.getByRole('button', { name: /explain results/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/analysis unavailable/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/network down/i);
  });

  it('streams AI response chunks and shows copy after completion', async () => {
    mockStreamNarrative.mockImplementation((prompt, handlers) => {
      handlers.onToken('Queues are ');
      handlers.onToken('stable.');
      handlers.onComplete();
    });

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: /run all/i }));
    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));
    fireEvent.click(screen.getByRole('button', { name: /explain results/i }));

    expect(await screen.findByText(/queues are stable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });

  describe('natural language query input (F14.2-4)', () => {
    beforeEach(() => {
      mockStreamNarrative.mockReset();
      mockSaveSimulationRun.mockResolvedValue(undefined);
    });

    it('shows query input when AI assistant panel is open', async () => {
      render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
      fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

      expect(screen.getByLabelText(/ask a question/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/run the model first/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ask question/i })).toBeDisabled();
    });

    it('enables query input and Ask button after a run completes', async () => {
      render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

      fireEvent.click(screen.getByRole('button', { name: /run all/i }));
      await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

      const input = screen.getByLabelText(/ask a question/i);
      expect(input).not.toBeDisabled();
      fireEvent.change(input, { target: { value: 'What was the mean wait?' } });
      expect(screen.getByRole('button', { name: /ask question/i })).not.toBeDisabled();
    });

    it('submits a query and streams the response', async () => {
      mockStreamNarrative.mockImplementation((prompt, handlers) => {
        handlers.onToken('The mean waiting time was ');
        handlers.onToken('8.2 minutes.');
        handlers.onComplete();
      });

      render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

      fireEvent.click(screen.getByRole('button', { name: /run all/i }));
      await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

      const input = screen.getByLabelText(/ask a question/i);
      fireEvent.change(input, { target: { value: 'What was the mean wait?' } });
      fireEvent.click(screen.getByRole('button', { name: /ask question/i }));

      expect(await screen.findByText(/The mean waiting time was 8\.2 minutes/i)).toBeInTheDocument();
      expect(mockStreamNarrative).toHaveBeenCalledTimes(1);
    });

    it('builds conversation history for follow-up questions', async () => {
      mockStreamNarrative
        .mockImplementationOnce((prompt, handlers) => {
          handlers.onToken('Main queue had mean wait of 8.2.');
          handlers.onComplete();
        })
        .mockImplementationOnce((prompt, handlers) => {
          handlers.onToken('The second queue is Triage.');
          handlers.onComplete();
        });

      render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

      fireEvent.click(screen.getByRole('button', { name: /run all/i }));
      await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

      const input = screen.getByLabelText(/ask a question/i);

      fireEvent.change(input, { target: { value: 'Which queue had the longest wait?' } });
      fireEvent.click(screen.getByRole('button', { name: /ask question/i }));
      await screen.findByText(/Main queue had mean wait of 8\.2/);

      fireEvent.change(input, { target: { value: 'What about the second queue?' } });
      fireEvent.click(screen.getByRole('button', { name: /ask question/i }));
      expect(await screen.findByText(/The second queue is Triage/)).toBeInTheDocument();

      expect(screen.getByText(/Which queue had the longest wait/i)).toBeInTheDocument();
      expect(screen.getByText(/What about the second queue/i)).toBeInTheDocument();
      expect(mockStreamNarrative).toHaveBeenCalledTimes(2);
    });

    it('clear button resets conversation history', async () => {
      mockStreamNarrative.mockImplementation((prompt, handlers) => {
        handlers.onToken('8.2 minutes.');
        handlers.onComplete();
      });

      render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

      fireEvent.click(screen.getByRole('button', { name: /run all/i }));
      await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

      const input = screen.getByLabelText(/ask a question/i);
      fireEvent.change(input, { target: { value: 'What was the mean wait?' } });
      fireEvent.click(screen.getByRole('button', { name: /ask question/i }));
      await screen.findByText(/8\.2 minutes/);

      fireEvent.click(screen.getByRole('button', { name: /clear/i }));

      expect(screen.queryByText(/What was the mean wait/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/8\.2 minutes/)).not.toBeInTheDocument();
    });

    it('preserves conversation history in follow-up prompt', async () => {
      let capturedPrompt = null;
      mockStreamNarrative.mockImplementation((prompt, handlers) => {
        capturedPrompt = prompt;
        handlers.onToken('8.2 minutes.');
        handlers.onComplete();
      });

      render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

      fireEvent.click(screen.getByRole('button', { name: /run all/i }));
      await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

      const input = screen.getByLabelText(/ask a question/i);
      fireEvent.change(input, { target: { value: 'What was the wait?' } });
      fireEvent.click(screen.getByRole('button', { name: /ask question/i }));
      await screen.findByText(/8\.2 minutes/);

      mockStreamNarrative.mockImplementation((prompt, handlers) => {
        capturedPrompt = prompt;
        handlers.onToken('Triage queue.');
        handlers.onComplete();
      });

      fireEvent.change(input, { target: { value: 'Which queue?' } });
      fireEvent.click(screen.getByRole('button', { name: /ask question/i }));
      await screen.findByText(/Triage queue/);

      expect(capturedPrompt.messages.some(m => m.content && m.content.includes('What was the wait?'))).toBe(true);
    }, 10000);

    it('disables Ask during streaming', async () => {
      render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

      fireEvent.click(screen.getByRole('button', { name: /run all/i }));
      await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

      const input = screen.getByLabelText(/ask a question/i);
      fireEvent.change(input, { target: { value: 'Question during streaming' } });

      // Start streaming and hold (don't call onComplete)
      mockStreamNarrative.mockImplementation((prompt, handlers) => {
        handlers.onToken('Partial...');
      });

      fireEvent.click(screen.getByRole('button', { name: /ask question/i }));
      expect(screen.getByRole('button', { name: /ask question/i })).toBeDisabled();
    });

    it('displays an error when streaming fails during a query', async () => {
      mockStreamNarrative.mockImplementation((prompt, handlers) => {
        handlers.onError?.(new Error('LLM proxy returned 500'));
      });

      render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

      fireEvent.click(screen.getByRole('button', { name: /run all/i }));
      await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: /ai insights/i }));

      const input = screen.getByLabelText(/ask a question/i);
      fireEvent.change(input, { target: { value: 'What was the mean wait?' } });
      fireEvent.click(screen.getByRole('button', { name: /ask question/i }));

      expect(await screen.findByText(/LLM proxy returned 500/i)).toBeInTheDocument();
    });
  });
});
