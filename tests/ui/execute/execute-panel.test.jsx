import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutePanel } from '../../../src/ui/execute/index.jsx';

const mockRunReplications = vi.hoisted(() => vi.fn());
const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../../src/engine/replication-runner.js', () => ({
  runReplications: mockRunReplications,
}));

vi.mock('../../../src/db/models.js', () => ({
  saveSimulationRun: mockSaveSimulationRun,
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
  beforeEach(() => {
    mockRunReplications.mockReset();
    mockSaveSimulationRun.mockReset();
    mockSaveSimulationRun.mockResolvedValue(undefined);
  });

  it('renders the execute controls without crashing', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    expect(screen.getByText('WARM-UP PERIOD')).toBeInTheDocument();
    expect(screen.getByText('REPLICATIONS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run all/i })).toBeInTheDocument();
    expect(screen.getByText('Run or step the simulation to see the visual view.')).toBeInTheDocument();
  });

  it('runs one replication through the existing single-run path', async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    expect(mockRunReplications).not.toHaveBeenCalled();
    expect(mockSaveSimulationRun.mock.calls[0][3]).toEqual(
      expect.objectContaining({ replications: 1 })
    );
  });

  it('shows batch progress and cancel button for multi-replication runs', async () => {
    const cancel = vi.fn();
    mockRunReplications.mockImplementation(({ onProgress }) => {
      onProgress({ completed: 0, total: 3, running: 2, pending: 1, cancelled: false, workerCount: 2 });
      return { cancel };
    });

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

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

    const spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[1], { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /run all/i }));

    expect(await screen.findAllByText('Avg wait')).toHaveLength(2);
    expect(screen.getByText('5.00')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
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
});
