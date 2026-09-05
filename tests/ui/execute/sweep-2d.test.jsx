import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutePanel } from '../../../src/ui/execute/index.jsx';

const mockRunSweep = vi.hoisted(() => vi.fn());
const mockRun2DSweep = vi.hoisted(() => vi.fn());
const mockRunSweepOffthread = vi.hoisted(() => vi.fn());
const mockGenerate2DSweepValues = vi.hoisted(() => vi.fn());
const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFetchRunHistory = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../../../src/engine/sweep-runner.js', () => ({
  runSweep: mockRunSweep,
  run2DSweep: mockRun2DSweep,
  runSweepOffthread: mockRunSweepOffthread,
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

function openSweepSection() {
  fireEvent.click(screen.getByRole('button', { name: /^studies$/i }));
}

function setup2DPanel() {
  render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
  openSweepSection();
  fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));
}

// Opens the picker at `chooseBtns[index]`, optionally filters via the search box, then clicks the param.
// For X (before Y selected): index=0 when 2 "Choose parameter…" buttons exist.
// For Y (after X selected): index=0 when only Y's button remains.
// Uses findByRole (async) so state updates from picker opening flush before querying.
async function selectParam(index, labelRegex, searchQuery = null) {
  const chooseBtns = screen.getAllByRole('button', { name: /choose parameter/i });
  fireEvent.click(chooseBtns[index]);
  if (searchQuery) {
    // Use the search input to show params in collapsed sections (bypasses section expansion)
    const searchInput = await screen.findByPlaceholderText(/filter parameters/i);
    fireEvent.change(searchInput, { target: { value: searchQuery } });
  }
  fireEvent.click(await screen.findByRole('button', { name: labelRegex }));
}

function mock2DSweepRunner(results) {
  mockRunSweepOffthread.mockImplementation(({ onComplete }) => {
    onComplete?.(results);
    return { cancel: vi.fn() };
  });
}

describe('ExecutePanel — 2D Parametric Sweep', () => {
  beforeEach(() => {
    mockRunSweep.mockReset();
    mockRun2DSweep.mockReset();
    mockRunSweepOffthread.mockReset();
    mockGenerate2DSweepValues.mockReset();
    mockSaveSimulationRun.mockReset();
    mockFetchRunHistory.mockReset();
    mockSaveSimulationRun.mockResolvedValue(undefined);
    mockFetchRunHistory.mockResolvedValue([]);
  });

  it('mode toggle switches between 1D and 2D controls', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();

    // Force 1D mode (initial state may vary) and verify 1D controls
    fireEvent.click(screen.getByRole('button', { name: /1d sweep/i }));
    expect(screen.getByText('PARAMETER')).toBeInTheDocument();
    expect(screen.queryByText('PARAMETER Y')).not.toBeInTheDocument();

    // Switch to 2D and verify both X and Y pickers appear
    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));
    expect(screen.getByText('PARAMETER X')).toBeInTheDocument();
    expect(screen.getByText('PARAMETER Y')).toBeInTheDocument();

    // Switch back to 1D and verify Y picker disappears
    fireEvent.click(screen.getByRole('button', { name: /1d sweep/i }));
    expect(screen.getByText('PARAMETER')).toBeInTheDocument();
    expect(screen.queryByText('PARAMETER Y')).not.toBeInTheDocument();
  });

  it('validation blocks run when 2D grid exceeds 50 points', async () => {
    setup2DPanel();

    // Select X = Server.count (Servers & Capacity section is defaultOpen)
    await selectParam(0, /server\.count/i);

    // Select Y = Waiting.capacity (Queue Capacity section must be expanded first)
    await selectParam(0, /waiting\.capacity/i, 'waiting');

    // Mock grid validation to throw
    mockGenerate2DSweepValues.mockImplementation(() => {
      throw new Error('2D sweep grid exceeds 50 points (8 x 7 = 56). Reduce one range or increase step size.');
    });

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    // Error appears in the validation banner (and inline counter)
    const errors = screen.getAllByText(/2d sweep grid exceeds 50 points/i);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(mockRunSweepOffthread).not.toHaveBeenCalled();
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
    await selectParam(0, /server\.count/i);
    await selectParam(0, /waiting\.capacity/i, 'waiting');

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    // Wait for the grid to render (state flush from onComplete callback)
    await waitFor(() => {
      expect(mockRunSweepOffthread).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('10')).toBeInTheDocument();
    });

    // Grid table headers: row labels (valueA) and column labels (valueB)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('10').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('20').length).toBeGreaterThanOrEqual(1);

    // Cell values (fmtMetric uses .toFixed(1) for avgWait)
    expect(screen.getAllByText('5.2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('7.8').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3.1').length).toBeGreaterThanOrEqual(1);
  }, 15000);

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
    await selectParam(0, /server\.count/i);
    await selectParam(0, /waiting\.capacity/i, 'waiting');

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    // Wait for the grid to render (state flush from onComplete callback)
    await waitFor(() => {
      expect(mockRunSweepOffthread).toHaveBeenCalledTimes(1);
      expect(screen.getAllByText('5.2').length).toBeGreaterThanOrEqual(1);
    });

    // Before click, no cell stats sidebar
    expect(screen.queryByText(/cell stats/i)).not.toBeInTheDocument();

    // Click the first data cell (contains 5.2, from mean=5.2 with .toFixed(1))
    const cells = screen.getAllByText('5.2');
    fireEvent.click(cells[0]);

    // Sidebar appears with the cell's aggregate stats
    expect(screen.getByText(/cell stats/i)).toBeInTheDocument();
    expect(screen.getAllByText('Avg service').length).toBeGreaterThanOrEqual(1);
  });

  it('2D sweep run button is disabled until both parameters are selected', async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();
    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));

    // Before selecting any parameter, the Run Sweep button is not rendered
    expect(screen.queryByRole('button', { name: /run sweep/i })).not.toBeInTheDocument();

    // Select X only — button appears but is disabled
    await selectParam(0, /server\.count/i);

    expect(screen.getByRole('button', { name: /run sweep/i })).toBeDisabled();

    // Select Y — button becomes enabled
    await selectParam(0, /waiting\.capacity/i, 'waiting');
    expect(screen.getByRole('button', { name: /run sweep/i })).not.toBeDisabled();
  });

  it('shows 2D grid size in progress text', async () => {
    mockGenerate2DSweepValues.mockReturnValue([
      { valueA: 1, valueB: 10 },
      { valueA: 2, valueB: 20 },
    ]);
    mockRunSweepOffthread.mockImplementation(({ onProgress }) => {
      onProgress({ totalPoints: 4, currentPoint: 1, gridSize: { rows: 2, cols: 2 } });
      return { cancel: vi.fn() };
    });

    setup2DPanel();
    await selectParam(0, /server\.count/i);
    await selectParam(0, /waiting\.capacity/i, 'waiting');

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    // Scoped to the progress banner's own element (not a page-wide getByText)
    // because the pre-run grid-size preview text can also read "2 x 2" for a
    // real (non-mocked) square grid — both are legitimately correct, so a
    // global text query for "2 x 2" is ambiguous once both are present.
    const progressText = await waitFor(() => screen.getByText(/grid:/i));
    expect(progressText.textContent).toMatch(/2 x 2/i);
  });

  // Regression: the range inputs used to store parseFloat(e.target.value) || 0
  // directly, so every keystroke fed a coerced *number* straight back into the
  // controlled input's value. That clobbers exactly the intermediate states a
  // user types through — a trailing decimal point ("4." -> parseFloat -> 4,
  // dropping the dot the user just typed) or a fully-cleared field ("" ->
  // parseFloat -> NaN -> || 0 -> "0", so the field can never actually go
  // blank while retyping) — which reads as the field "locking up" mid-edit.
  // The fix stores the raw string while typing and only parses at the point
  // of use (handleRunSweep / the grid-size preview).
  it('a decimal value in a range field round-trips exactly, not rounded or reformatted', async () => {
    setup2DPanel();
    await selectParam(0, /server\.count/i);
    await selectParam(0, /waiting\.capacity/i, 'waiting');

    const stepYInput = screen.getByLabelText(/sweep step y/i);
    fireEvent.change(stepYInput, { target: { value: '4.5' } });
    expect(stepYInput.value).toBe('4.5');
  });

  it('clearing a range field leaves it blank instead of forcing it to 0', async () => {
    setup2DPanel();
    await selectParam(0, /server\.count/i);
    await selectParam(0, /waiting\.capacity/i, 'waiting');

    const stepYInput = screen.getByLabelText(/sweep step y/i);
    fireEvent.change(stepYInput, { target: { value: '' } });
    expect(stepYInput.value).toBe('');
  });

  it('a typed range value is still parsed to a real number when the sweep runs', async () => {
    mockGenerate2DSweepValues.mockReturnValue([{ valueA: 1, valueB: 10 }]);
    mock2DSweepRunner([]);

    setup2DPanel();
    await selectParam(0, /server\.count/i);
    await selectParam(0, /waiting\.capacity/i, 'waiting');

    fireEvent.change(screen.getByLabelText(/sweep step y/i), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    await waitFor(() => expect(mockRunSweepOffthread).toHaveBeenCalledTimes(1));
    const call = mockRunSweepOffthread.mock.calls[0][0];
    expect(call.ranges[1].step).toBe(2.5);
    expect(typeof call.ranges[1].step).toBe('number');
  });

  // Regression: pointIsFeasible in SweepViews.jsx used to skip every scoped
  // goal (`if (g.scope || ...) continue`), so with an all-scoped goal set —
  // the only kind most real models have (see examples/bike-shop.json) — the
  // loop body never ran and every point read as "meets all goals" regardless
  // of its actual data. evaluateSweepPointGoals (src/llm/prompts.js) is the
  // real, un-mocked function SweepViews.jsx now uses, so feeding it a scoped
  // goal via aggregateStats here exercises the real fix end to end.
  it('the "meet all goals" count reflects a scoped goal\'s actual results, not always all points (regression)', async () => {
    const modelWithGoal = {
      ...validModel,
      goals: [{
        label: 'Server util under 90%',
        metric: 'resource.utilisation',
        target: 0.9,
        operator: '<',
        scope: { type: 'resource', id: 'et_server', name: 'Server' },
      }],
    };
    const results = [
      { valueA: 1, valueB: 10, aggregateStats: { 'summary.avgWait': { mean: 5, n: 3 }, 'resource.utilisation.Server': { mean: 0.5, n: 3 } } },
      { valueA: 2, valueB: 20, aggregateStats: { 'summary.avgWait': { mean: 4, n: 3 }, 'resource.utilisation.Server': { mean: 0.95, n: 3 } } },
    ];
    mockGenerate2DSweepValues.mockReturnValue([
      { valueA: 1, valueB: 10 },
      { valueA: 2, valueB: 20 },
    ]);
    mock2DSweepRunner(results);

    render(<ExecutePanel model={modelWithGoal} modelId="model-1" userId="user-1" />);
    openSweepSection();
    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));
    await selectParam(0, /server\.count/i);
    await selectParam(0, /waiting\.capacity/i, 'waiting');

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    await waitFor(() => {
      expect(mockRunSweepOffthread).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/meet all goals/i)).toBeInTheDocument();
    });

    // Before the fix this always read "2 / 2" regardless of data. One point
    // (0.95) misses the 90% target, so only 1 of 2 should be feasible.
    expect(screen.getByText(/1 \/ 2 meet all goals/i)).toBeInTheDocument();
  });

  // Regression / new feature: the sweep KPI dropdown now also lists the
  // model's own goals (not just the fixed CI_METRICS list), so a sweep can
  // be colored/read directly against what a goal measures.
  it('a model goal is selectable as a sweep KPI and its resolved value is shown', async () => {
    const modelWithGoal = {
      ...validModel,
      goals: [{
        label: 'Server util under 90%',
        metric: 'resource.utilisation',
        target: 0.9,
        operator: '<',
        scope: { type: 'resource', id: 'et_server', name: 'Server' },
      }],
    };
    const results = [
      { valueA: 1, valueB: 10, aggregateStats: { 'summary.avgWait': { mean: 5, n: 3 }, 'resource.utilisation.Server': { mean: 0.42, n: 3 } } },
    ];
    mockGenerate2DSweepValues.mockReturnValue([{ valueA: 1, valueB: 10 }]);
    mock2DSweepRunner(results);

    render(<ExecutePanel model={modelWithGoal} modelId="model-1" userId="user-1" />);
    openSweepSection();
    fireEvent.click(screen.getByRole('button', { name: /2d sweep/i }));
    await selectParam(0, /server\.count/i);
    await selectParam(0, /waiting\.capacity/i, 'waiting');

    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));
    await waitFor(() => expect(mockRunSweepOffthread).toHaveBeenCalledTimes(1));

    const kpiSelect = screen.getByLabelText(/sweep kpi metric/i);
    expect(within(kpiSelect).getByRole('option', { name: /server util under 90%/i })).toBeInTheDocument();

    fireEvent.change(kpiSelect, { target: { value: 'goal:0' } });

    await waitFor(() => expect(screen.getAllByText('0.4').length).toBeGreaterThanOrEqual(1));
  });
});
