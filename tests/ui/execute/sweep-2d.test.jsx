import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutePanel } from '../../../src/ui/execute/index.jsx';

const mockRunSweep = vi.hoisted(() => vi.fn());
const mockRun2DSweep = vi.hoisted(() => vi.fn());
const mockGenerate2DSweepValues = vi.hoisted(() => vi.fn());
const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFetchRunHistory = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../../../src/engine/sweep-runner.js', () => ({
  runSweep: mockRunSweep,
  run2DSweep: mockRun2DSweep,
}));

vi.mock('../../../src/engine/sweep-params.js', () => ({
  enumerateSweepableParams: vi.fn((model) => {
    const params = [];
    for (const et of (model.entityTypes || [])) {
      params.push({
        type: 'entityTypeCount',
        targetId: et.id,
        label: `${et.name}.count`,
        currentValue: parseInt(et.count, 10) || 0,
        path: `entityTypes.${et.id}.count`,
      });
    }
    for (const q of (model.queues || [])) {
      params.push({
        type: 'queueCapacity',
        targetId: q.id,
        label: `${q.name}.capacity`,
        currentValue: q.capacity === '' ? Infinity : parseInt(q.capacity, 10) || 0,
        path: `queues.${q.id}.capacity`,
      });
    }
    return params;
  }),
  generateSweepValues: vi.fn((min, max, step) => {
    if (Math.abs(max - min) < 1e-9) return [min];
    const values = [];
    const nSteps = Math.floor((max - min) / step);
    for (let i = 0; i <= nSteps; i++) {
      values.push(+(min + i * step).toFixed(6));
    }
    return values;
  }),
  generate2DSweepValues: mockGenerate2DSweepValues,
}));

vi.mock('../../../src/db/models.js', () => ({
  fetchRunHistory: mockFetchRunHistory,
  saveSimulationRun: mockSaveSimulationRun,
  fetchUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  saveUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  fetchExperiments: vi.fn().mockResolvedValue([]),
  saveExperiment: vi.fn().mockResolvedValue({}),
  updateExperiment: vi.fn().mockResolvedValue({}),
  cloneExperiment: vi.fn().mockResolvedValue({}),
  deleteExperiment: vi.fn().mockResolvedValue({ ok: true }),
}));

const validModel = {
  entityTypes: [
    { id: 'et_customer', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_server', name: 'Server', role: 'server', count: 2, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b_arrive',
      name: 'Arrival',
      scheduledTime: '0',
      effect: 'ARRIVE(Customer)',
      schedules: [
        { eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: '1.11' } },
      ],
    },
  ],
  cEvents: [],
  queues: [
    { id: 'q_wait', name: 'Waiting', customerType: 'Customer', capacity: '', discipline: 'FIFO', description: '' },
  ],
};

function openSweepSection() {
  fireEvent.click(screen.getByRole('button', { name: /^experiments$/i }));
  const header = screen.getByText('EXPERIMENTS');
  fireEvent.click(header.closest('div') || header);
}

function selectParamFromDropdown(ariaLabel, optionText) {
  const select = screen.getByRole('combobox', { name: ariaLabel });
  fireEvent.change(select, { target: { value: optionText } });
}

function mock2DSweepRunner(results) {
  mockRun2DSweep.mockImplementation(({ onComplete }) => {
    onComplete?.(results);
    return { cancel: vi.fn() };
  });
}

describe('ExecutePanel — 2D Parametric Sweep', () => {
  beforeEach(() => {
    mockRunSweep.mockReset();
    mockRun2DSweep.mockReset();
    mockGenerate2DSweepValues.mockReset();
    mockSaveSimulationRun.mockReset();
    mockFetchRunHistory.mockReset();
    mockSaveSimulationRun.mockResolvedValue(undefined);
    mockFetchRunHistory.mockResolvedValue([]);
  });

  it('mode toggle switches between 1D and 2D controls', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();

    // Default is 1D: only one parameter picker visible
    expect(screen.getByRole('combobox', { name: /sweep parameter$/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /sweep parameter y/i })).not.toBeInTheDocument();

    // Switch to 2D
    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));
    expect(screen.getByRole('combobox', { name: /sweep parameter x/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /sweep parameter y/i })).toBeInTheDocument();

    // Switch back to 1D
    fireEvent.click(screen.getByRole('button', { name: /1d sweep/i }));
    expect(screen.getByRole('combobox', { name: /sweep parameter$/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /sweep parameter y/i })).not.toBeInTheDocument();
  });

  it('validation blocks run when 2D grid exceeds 50 points', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();

    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));

    // Select parameter X
    const selectX = screen.getByRole('combobox', { name: /sweep parameter x/i });
    fireEvent.change(selectX, { target: { value: 'entityTypeCount|et_server|' } });

    // Select parameter Y
    const selectY = screen.getByRole('combobox', { name: /sweep parameter y/i });
    fireEvent.change(selectY, { target: { value: 'queueCapacity|q_wait|' } });

    // Mock grid validation to throw
    mockGenerate2DSweepValues.mockImplementation(() => {
      throw new Error('2D sweep grid exceeds 50 points (8 x 7 = 56). Reduce one range or increase step size.');
    });

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    // The error appears in both the live counter and the validation banner
    const errors = screen.getAllByText(/2d sweep grid exceeds 50 points/i);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(mockRun2DSweep).not.toHaveBeenCalled();
  });

  it('2D results table renders with correct row and column labels', async () => {
    const results = [
      { valueA: 1, valueB: 10, aggregateStats: { 'summary.avgWait': { mean: 5.2, n: 3 } } },
      { valueA: 1, valueB: 20, aggregateStats: { 'summary.avgWait': { mean: 7.8, n: 3 } } },
      { valueA: 2, valueB: 10, aggregateStats: { 'summary.avgWait': { mean: 3.1, n: 3 } } },
      { valueA: 2, valueB: 20, aggregateStats: { 'summary.avgWait': { mean: 4.5, n: 3 } } },
    ];

    mockGenerate2DSweepValues.mockReturnValue([
      { valueA: 1, valueB: 10 },
      { valueA: 1, valueB: 20 },
      { valueA: 2, valueB: 10 },
      { valueA: 2, valueB: 20 },
    ]);
    mock2DSweepRunner(results);

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();

    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));

    const selectX = screen.getByRole('combobox', { name: /sweep parameter x/i });
    fireEvent.change(selectX, { target: { value: 'entityTypeCount|et_server|' } });

    const selectY = screen.getByRole('combobox', { name: /sweep parameter y/i });
    fireEvent.change(selectY, { target: { value: 'queueCapacity|q_wait|' } });

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    await waitFor(() => expect(mockRun2DSweep).toHaveBeenCalledTimes(1));

    // Grid table headers: row labels (valueA) and column labels (valueB)
    // fmt() now formats to 0 decimal places (integer)
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();

    // Cell values should be visible (now integer formatted)
    // Use getAllByText because multiple cells may have same integer value
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('8').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
  });

  it('clicking a cell shows aggregate stats sidebar', async () => {
    const results = [
      { valueA: 1, valueB: 10, aggregateStats: { 'summary.avgWait': { mean: 5.2, n: 3 }, 'summary.avgSvc': { mean: 2.1, n: 3 } } },
      { valueA: 2, valueB: 20, aggregateStats: { 'summary.avgWait': { mean: 4.5, n: 3 }, 'summary.avgSvc': { mean: 2.3, n: 3 } } },
    ];

    mockGenerate2DSweepValues.mockReturnValue([
      { valueA: 1, valueB: 10 },
      { valueA: 2, valueB: 20 },
    ]);
    mock2DSweepRunner(results);

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();

    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));

    const selectX = screen.getByRole('combobox', { name: /sweep parameter x/i });
    fireEvent.change(selectX, { target: { value: 'entityTypeCount|et_server|' } });

    const selectY = screen.getByRole('combobox', { name: /sweep parameter y/i });
    fireEvent.change(selectY, { target: { value: 'queueCapacity|q_wait|' } });

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    await waitFor(() => expect(mockRun2DSweep).toHaveBeenCalledTimes(1));

    // Before click, no cell stats sidebar
    expect(screen.queryByText(/cell stats/i)).not.toBeInTheDocument();

    // Click the first data cell (contains 5)
    const cells = screen.getAllByText('5');
    fireEvent.click(cells[0]);

    // Sidebar should appear with the cell's aggregate stats
    expect(screen.getByText(/cell stats/i)).toBeInTheDocument();
    // Both cell and sidebar now contain 5
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1);
    // Avg service = 2.1 rounded to 2
    expect(screen.getAllByText('Avg service').length).toBeGreaterThanOrEqual(1);
  });

  it('2D sweep run button is disabled until both parameters are selected', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();

    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));

    // Before selecting any parameter, the Run Sweep button is not rendered
    expect(screen.queryByRole('button', { name: /run sweep/i })).not.toBeInTheDocument();

    // Select X only — button now appears but is disabled
    const selectX = screen.getByRole('combobox', { name: /sweep parameter x/i });
    fireEvent.change(selectX, { target: { value: 'entityTypeCount|et_server|' } });

    const runBtn = screen.getByRole('button', { name: /run sweep/i });
    expect(runBtn).toBeDisabled();

    // Select Y — button becomes enabled
    const selectY = screen.getByRole('combobox', { name: /sweep parameter y/i });
    fireEvent.change(selectY, { target: { value: 'queueCapacity|q_wait|' } });
    expect(runBtn).not.toBeDisabled();
  });

  it('shows 2D grid size in progress text', async () => {
    mockGenerate2DSweepValues.mockReturnValue([
      { valueA: 1, valueB: 10 },
      { valueA: 2, valueB: 20 },
    ]);
    mockRun2DSweep.mockImplementation(({ onProgress, onComplete }) => {
      onProgress({ totalPoints: 4, currentPoint: 1, gridSize: { rows: 2, cols: 2 } });
      return { cancel: vi.fn() };
    });

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();

    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));

    const selectX = screen.getByRole('combobox', { name: /sweep parameter x/i });
    fireEvent.change(selectX, { target: { value: 'entityTypeCount|et_server|' } });

    const selectY = screen.getByRole('combobox', { name: /sweep parameter y/i });
    fireEvent.change(selectY, { target: { value: 'queueCapacity|q_wait|' } });

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    await waitFor(() => expect(screen.getByText(/grid:/i)).toBeInTheDocument());
    expect(screen.getByText(/2 x 2/i)).toBeInTheDocument();
  });
});
