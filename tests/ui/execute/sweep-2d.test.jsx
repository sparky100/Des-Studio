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
  fetchModelSchedules: vi.fn().mockResolvedValue([]),
  buildSchedulesMap: vi.fn().mockReturnValue({}),
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
    {
      id: 'b_complete',
      name: 'Complete',
      scheduledTime: '9999',
      effect: 'COMPLETE()',
      schedules: [],
    },
  ],
  cEvents: [],
  queues: [
    { id: 'q_wait', name: 'Waiting', customerType: 'Customer', capacity: '', discipline: 'FIFO', description: '' },
  ],
};

// Open the Studies section in the Execute panel.
function openSweepSection() {
  fireEvent.click(screen.getByRole('button', { name: /^studies$/i }));
  const header = screen.getByText('STUDIES');
  fireEvent.click(header.closest('div') || header);
}

// Render the panel and open the Studies section in 2D sweep mode.
function setup2DPanel() {
  render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
  openSweepSection();
  fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));
}

/**
 * Select the X (or only) sweep parameter via the ParamBrowserPanel.
 * The UI renders a "Choose parameter…" button that opens a browser popup;
 * the caller supplies the exact label text of the param row to click.
 * After calling this, "Choose parameter…" for Y becomes available.
 */
function selectSweepParamX(paramLabel) {
  // In 2D mode before any selection, there is one "Choose parameter…" button (for X).
  const chooseBtns = screen.getAllByRole('button', { name: /choose parameter/i });
  fireEvent.click(chooseBtns[0]);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(paramLabel.replace('.', '\\.')) }));
}

/**
 * Select the Y sweep parameter via the ParamBrowserPanel.
 * Must be called after selectSweepParamX so the Y picker button is rendered.
 */
function selectSweepParamY(paramLabel) {
  // After X is selected, the "Choose parameter…" button is now for Y.
  const chooseBtns = screen.getAllByRole('button', { name: /choose parameter/i });
  fireEvent.click(chooseBtns[0]);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(paramLabel.replace('.', '\\.')) }));
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

    // Default is 1D: only the X "Choose parameter…" button is visible (one picker).
    // In 1D mode there is exactly one "Choose parameter…" button and no Y picker.
    expect(screen.getAllByRole('button', { name: /choose parameter/i })).toHaveLength(1);
    // Confirm no Y-specific indicator yet (the PARAMETER Y label only shows in 2D mode).
    expect(screen.queryByText('PARAMETER Y')).not.toBeInTheDocument();

    // Switch to 2D — now two "Choose parameter…" buttons (X and Y).
    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));
    expect(screen.getByText('PARAMETER Y')).toBeInTheDocument();

    // Switch back to 1D — Y picker disappears.
    fireEvent.click(screen.getByRole('button', { name: /1d sweep/i }));
    expect(screen.queryByText('PARAMETER Y')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /choose parameter/i })).toHaveLength(1);
  });

  it('validation blocks run when 2D grid exceeds 50 points', () => {
    setup2DPanel();

    // Select parameter X: Server.count
    selectSweepParamX('Server.count');

    // Select parameter Y: Waiting.capacity
    selectSweepParamY('Waiting.capacity');

    // Mock grid validation to throw an error.
    mockGenerate2DSweepValues.mockImplementation(() => {
      throw new Error('2D sweep grid exceeds 50 points (8 x 7 = 56). Reduce one range or increase step size.');
    });

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    // The error appears in the validation banner.
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

    setup2DPanel();
    selectSweepParamX('Server.count');
    selectSweepParamY('Waiting.capacity');

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

    setup2DPanel();
    selectSweepParamX('Server.count');
    selectSweepParamY('Waiting.capacity');

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

    // Select X only — Run Sweep button now appears but is disabled
    selectSweepParamX('Server.count');

    const runBtn = screen.getByRole('button', { name: /run sweep/i });
    expect(runBtn).toBeDisabled();

    // Select Y — button becomes enabled
    selectSweepParamY('Waiting.capacity');
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

    setup2DPanel();
    selectSweepParamX('Server.count');
    selectSweepParamY('Waiting.capacity');

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    await waitFor(() => expect(screen.getByText(/grid:/i)).toBeInTheDocument());
    expect(screen.getByText(/2 x 2/i)).toBeInTheDocument();
  });
});
