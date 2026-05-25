import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/ui/shared/xlsxParser.js', () => ({
  parseXlsx: vi.fn(),
}));

const mockGetRun = vi.hoisted(() => vi.fn());
const mockFetchRunHistory = vi.hoisted(() => vi.fn());
const mockUpdateRunLabel = vi.hoisted(() => vi.fn());
const mockUpdateRunTags = vi.hoisted(() => vi.fn());
const mockArchiveRun = vi.hoisted(() => vi.fn());
const mockUnarchiveRun = vi.hoisted(() => vi.fn());
const mockDeleteSimulationRun = vi.hoisted(() => vi.fn());
const mockRevokeShareLink = vi.hoisted(() => vi.fn());
const mockBuildEngine = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', () => ({
  getRun: mockGetRun,
  fetchRunHistory: mockFetchRunHistory,
  updateRunLabel: mockUpdateRunLabel,
  updateRunTags: mockUpdateRunTags,
  archiveRun: mockArchiveRun,
  unarchiveRun: mockUnarchiveRun,
  deleteSimulationRun: mockDeleteSimulationRun,
  revokeShareLink: mockRevokeShareLink,
}));

vi.mock('../../src/engine/index.js', () => ({
  buildEngine: mockBuildEngine,
}));

vi.mock('../../src/db/runRecord.js', () => ({
  compareResults: vi.fn((a, b) => {
    const fields = ['served', 'avgWait', 'avgSvc', 'avgSojourn', 'reneged'];
    return fields.every(f =>
      Math.abs((a.summary[f] || 0) - (b.summary[f] || 0)) < 0.0001
    );
  }),
}));

vi.mock('../../src/ui/shared/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }),
}));

import { ModelHistoryTab } from '../../src/ui/ModelHistoryTab.jsx';

const snapshot = { id: 'm1', name: 'Test Model', entityTypes: [] };
const storedSummary = { served: 10, avgWait: 5.0, avgSvc: 2.0, avgSojourn: 7.0, reneged: 0 };

const makeRow = (overrides = {}) => ({
  id: 'run-1',
  run_label: 'Baseline',
  ran_at: '2026-05-01T12:00:00Z',
  seed: 42,
  replications: 1,
  warmup_period: 0,
  max_simulation_time: 500,
  total_arrived: 10,
  total_served: 10,
  total_reneged: 0,
  avg_wait_time: 5.0,
  avg_service_time: 2.0,
  renege_rate: 0,
  duration_ms: 150,
  ai_insights: null,
  tags: [],
  archived: false,
  results_json: { summary: storedSummary },
  ...overrides,
});

const baseRow = makeRow();

const baseRunRecord = {
  id: 'run-1',
  model_snapshot: snapshot,
  base_seed: 42,
  engine_version: '55a',
  experiment_config: { maxSimTime: 500, warmupPeriod: 0, replications: 1, terminationMode: 'time', terminationCondition: null },
  summary: storedSummary,
  results_json: { summary: storedSummary },
};

const defaultProps = {
  historyRows: [baseRow],
  setHistoryRows: vi.fn(),
  historyLoading: false,
  setHistoryLoading: vi.fn(),
  historyError: '',
  setHistoryError: vi.fn(),
  historyShowArchived: false,
  setHistoryShowArchived: vi.fn(),
  shareLinksMap: {},
  setShareLinksMap: vi.fn(),
  modelId: 'm1',
  userId: 'u1',
  model: { id: 'm1', name: 'Current Model' },
  baseUrl: 'http://localhost:5173',
  onExplainRun: vi.fn(),
  onViewResults: vi.fn(),
};

function renderTab(overrides = {}) {
  return render(
    <ModelHistoryTab {...defaultProps} {...overrides} />
  );
}

// Helper: get the clickable label span in the table (not the summary card)
function getLabelSpan(container, text) {
  const spans = container.querySelectorAll('span[title="Click to edit label"]');
  return Array.from(spans).find(s => s.textContent === text);
}

// Helper: open the "More" dropdown for a row and return the menu
async function openMoreMenu() {
  const moreBtn = screen.getByRole('button', { name: 'More actions' });
  fireEvent.click(moreBtn);
  await waitFor(() => {
    expect(screen.getByText(/Reproduce/i)).toBeInTheDocument();
  });
}

describe('ModelHistoryTab — Run History UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRun.mockReset();
    mockBuildEngine.mockReset();
  });

  // ── Empty / Loading / Error states ──────────────────────────────────────

  it('shows empty state when no runs exist', () => {
    renderTab({ historyRows: [] });
    expect(screen.getByText(/No runs yet/i)).toBeInTheDocument();
  });

  it('shows loading indicator when historyLoading is true', () => {
    renderTab({ historyLoading: true, historyRows: [] });
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('shows error message when historyError is set', () => {
    renderTab({ historyError: 'Network error', historyRows: [] });
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  // ── Summary cards ──────────────────────────────────────────────────────

  it('renders summary cards with latest run data', () => {
    renderTab({ historyRows: [makeRow({ total_served: 42, total_reneged: 3, avg_wait_time: 7.5 })] });
    expect(screen.getAllByText(/42/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/7\.50t/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows renege rate percentage when there are arrivals', () => {
    renderTab({ historyRows: [makeRow({ total_arrived: 100, total_reneged: 10 })] });
    expect(screen.getByText('10.0%')).toBeInTheDocument();
  });

  it('shows dash for renege rate when no arrivals', () => {
    renderTab({ historyRows: [makeRow({ total_arrived: 0, total_reneged: 0 })] });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  // ── Search filtering ───────────────────────────────────────────────────

  it('filters rows by run label search', () => {
    const rows = [
      makeRow({ id: 'r1', run_label: 'Morning run' }),
      makeRow({ id: 'r2', run_label: 'Evening run' }),
    ];
    renderTab({ historyRows: rows });
    const search = screen.getByLabelText('Search run history');
    fireEvent.change(search, { target: { value: 'Morning' } });
    expect(screen.getAllByText('Morning run').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Evening run')).not.toBeInTheDocument();
  });

  it('shows all rows when search is empty', () => {
    const rows = [
      makeRow({ id: 'r1', run_label: 'Morning run' }),
      makeRow({ id: 'r2', run_label: 'Evening run' }),
    ];
    renderTab({ historyRows: rows });
    expect(screen.getAllByText('Morning run').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Evening run').length).toBeGreaterThanOrEqual(1);
  });

  // ── Export buttons ─────────────────────────────────────────────────────

  it('disables export buttons when no rows', () => {
    renderTab({ historyRows: [] });
    const buttons = screen.getAllByRole('button');
    const exportJson = buttons.find(b => b.textContent.includes('Export run list') && !b.textContent.includes('CSV'));
    const exportCsv = buttons.find(b => b.textContent.includes('Export run list as CSV'));
    expect(exportJson).toBeDisabled();
    expect(exportCsv).toBeDisabled();
  });

  it('enables export buttons when rows exist', () => {
    renderTab({ historyRows: [baseRow] });
    const buttons = screen.getAllByRole('button');
    const exportJson = buttons.find(b => b.textContent.includes('Export run list') && !b.textContent.includes('CSV'));
    const exportCsv = buttons.find(b => b.textContent.includes('Export run list as CSV'));
    expect(exportJson).not.toBeDisabled();
    expect(exportCsv).not.toBeDisabled();
  });

  // ── Bulk selection ─────────────────────────────────────────────────────

  it('shows selection bar when runs are selected', () => {
    renderTab({ historyRows: [baseRow] });
    const checkbox = screen.getByLabelText('Select run Baseline');
    fireEvent.click(checkbox);
    expect(screen.getByText('1 run selected')).toBeInTheDocument();
  });

  it('select all checkbox selects all rows', () => {
    const rows = [
      makeRow({ id: 'r1', run_label: 'Run A' }),
      makeRow({ id: 'r2', run_label: 'Run B' }),
    ];
    renderTab({ historyRows: rows });
    const selectAll = screen.getByLabelText('Select all runs');
    fireEvent.click(selectAll);
    expect(screen.getByText('2 runs selected')).toBeInTheDocument();
  });

  it('clear selection button removes all selections', () => {
    renderTab({ historyRows: [baseRow] });
    fireEvent.click(screen.getByLabelText('Select run Baseline'));
    expect(screen.getByText('1 run selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByText(/run.*selected/i)).not.toBeInTheDocument();
  });

  // ── Archive selected ───────────────────────────────────────────────────

  it('archive selected calls archiveRun for each selected id', async () => {
    mockArchiveRun.mockResolvedValue({ ok: true });
    const setHistoryRows = vi.fn();
    renderTab({ historyRows: [baseRow], setHistoryRows });
    fireEvent.click(screen.getByLabelText('Select run Baseline'));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mockArchiveRun).toHaveBeenCalledWith('run-1', 'u1'));
  });

  // ── Inline label editing ───────────────────────────────────────────────

  it('clicking label opens inline edit input', () => {
    const { container } = renderTab({ historyRows: [baseRow] });
    const labelSpan = getLabelSpan(container, 'Baseline');
    fireEvent.click(labelSpan);
    expect(screen.getByLabelText('Edit run label')).toBeInTheDocument();
  });

  it('saving label calls updateRunLabel and updates rows', async () => {
    mockUpdateRunLabel.mockResolvedValue({ ok: true });
    const { container } = renderTab({ historyRows: [baseRow] });
    const labelSpan = getLabelSpan(container, 'Baseline');
    fireEvent.click(labelSpan);
    const input = screen.getByLabelText('Edit run label');
    await userEvent.clear(input);
    await userEvent.type(input, 'New Label');
    await act(async () => { input.blur(); });
    await waitFor(() => expect(mockUpdateRunLabel).toHaveBeenCalledWith('run-1', 'u1', 'New Label'));
  });

  it('pressing Enter saves the label', async () => {
    mockUpdateRunLabel.mockResolvedValue({ ok: true });
    const { container } = renderTab({ historyRows: [baseRow] });
    const labelSpan = getLabelSpan(container, 'Baseline');
    fireEvent.click(labelSpan);
    const input = screen.getByLabelText('Edit run label');
    await userEvent.clear(input);
    await userEvent.type(input, 'Enter Saved{enter}');
    await waitFor(() => expect(mockUpdateRunLabel).toHaveBeenCalledWith('run-1', 'u1', 'Enter Saved'));
  });

  it('pressing Escape cancels label editing', () => {
    const { container } = renderTab({ historyRows: [baseRow] });
    const labelSpan = getLabelSpan(container, 'Baseline');
    fireEvent.click(labelSpan);
    expect(screen.getByLabelText('Edit run label')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('Edit run label'), { key: 'Escape' });
    expect(screen.queryByLabelText('Edit run label')).not.toBeInTheDocument();
  });

  // ── Tags ───────────────────────────────────────────────────────────────

  it('renders existing tags with remove button', () => {
    renderTab({ historyRows: [makeRow({ tags: ['production', 'v2'] })] });
    expect(screen.getByText('#production ×')).toBeInTheDocument();
    expect(screen.getByText('#v2 ×')).toBeInTheDocument();
  });

  it('adding a tag calls updateRunTags', async () => {
    mockUpdateRunTags.mockResolvedValue({ ok: true });
    const setHistoryRows = vi.fn();
    renderTab({ historyRows: [makeRow({ tags: [] })], setHistoryRows });
    const tagInput = screen.getByLabelText('Add tag to run run-1');
    await userEvent.type(tagInput, 'test{enter}');
    await waitFor(() => expect(mockUpdateRunTags).toHaveBeenCalledWith('run-1', 'u1', ['test']));
  });

  it('clicking a tag removes it', async () => {
    mockUpdateRunTags.mockResolvedValue({ ok: true });
    const setHistoryRows = vi.fn();
    renderTab({ historyRows: [makeRow({ tags: ['old'] })], setHistoryRows });
    fireEvent.click(screen.getByText('#old ×'));
    await waitFor(() => expect(mockUpdateRunTags).toHaveBeenCalledWith('run-1', 'u1', []));
  });

  // ── Share links ────────────────────────────────────────────────────────

  it('shows copy and unshare buttons when share link exists', async () => {
    renderTab({
      historyRows: [baseRow],
      shareLinksMap: { 'run-1': { id: 'link-1', token: 'abc123' } },
    });
    await openMoreMenu();
    expect(screen.getByRole('button', { name: /📋 Copy share link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /✕ Unshare/i })).toBeInTheDocument();
  });

  it('shows dash in Reshare column when no share link exists', async () => {
    renderTab({ historyRows: [baseRow], shareLinksMap: {} });
    await openMoreMenu();
    expect(screen.queryByRole('button', { name: /📋 Copy share link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /✕ Unshare/i })).not.toBeInTheDocument();
  });

  it('revoking share link calls revokeShareLink and removes from map', async () => {
    mockRevokeShareLink.mockResolvedValue({ ok: true });
    const setShareLinksMap = vi.fn();
    window.confirm = vi.fn(() => true);
    renderTab({
      historyRows: [baseRow],
      shareLinksMap: { 'run-1': { id: 'link-1', token: 'abc123' } },
      setShareLinksMap,
    });
    await openMoreMenu();
    fireEvent.click(screen.getByRole('button', { name: /✕ Unshare/i }));
    await waitFor(() => expect(mockRevokeShareLink).toHaveBeenCalledWith('link-1', 'u1'));
  });

  // ── View Results / Explain ─────────────────────────────────────────────

  it('View Results button only appears when row has results_json payload', () => {
    const withResults = makeRow({ id: 'r1', results_json: { summary: storedSummary } });
    const withoutResults = makeRow({ id: 'r2', results_json: {} });
    renderTab({ historyRows: [withResults, withoutResults] });
    const viewResultsButtons = screen.getAllByRole('button', { name: 'View Results' });
    expect(viewResultsButtons).toHaveLength(1);
  });

  it('clicking View Results calls onViewResults', () => {
    const onViewResults = vi.fn();
    const withResults = makeRow({ results_json: { summary: storedSummary } });
    renderTab({ historyRows: [withResults], onViewResults });
    fireEvent.click(screen.getByRole('button', { name: 'View Results' }));
    expect(onViewResults).toHaveBeenCalledWith(withResults);
  });

  it('clicking Explain calls onExplainRun', () => {
    const onExplainRun = vi.fn();
    renderTab({ historyRows: [baseRow], onExplainRun });
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));
    expect(onExplainRun).toHaveBeenCalledWith(baseRow);
  });

  // ── Archive / Unarchive per row ────────────────────────────────────────

  it('archive button calls archiveRun and removes row when not showing archived', async () => {
    mockArchiveRun.mockResolvedValue({ ok: true });
    const setHistoryRows = vi.fn();
    renderTab({ historyRows: [baseRow], setHistoryRows, historyShowArchived: false });
    await openMoreMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mockArchiveRun).toHaveBeenCalledWith('run-1', 'u1'));
  });

  it('unarchive button calls unarchiveRun for archived rows', async () => {
    mockUnarchiveRun.mockResolvedValue({ ok: true });
    const setHistoryRows = vi.fn();
    const archivedRow = makeRow({ archived: true });
    renderTab({ historyRows: [archivedRow], setHistoryRows, historyShowArchived: true });
    await openMoreMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
    await waitFor(() => expect(mockUnarchiveRun).toHaveBeenCalledWith('run-1', 'u1'));
  });

  // ── Delete ─────────────────────────────────────────────────────────────

  it('delete button calls deleteSimulationRun after confirmation', async () => {
    mockDeleteSimulationRun.mockResolvedValue({ ok: true });
    const setHistoryRows = vi.fn();
    window.confirm = vi.fn(() => true);
    renderTab({ historyRows: [baseRow], setHistoryRows });
    await openMoreMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mockDeleteSimulationRun).toHaveBeenCalledWith('run-1', 'u1'));
  });

  it('delete is cancelled when user declines confirmation', async () => {
    window.confirm = vi.fn(() => false);
    renderTab({ historyRows: [baseRow] });
    await openMoreMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mockDeleteSimulationRun).not.toHaveBeenCalled();
  });

  // ── Archived row styling ───────────────────────────────────────────────

  it('archived rows have reduced opacity', () => {
    const archivedRow = makeRow({ archived: true, run_label: 'ArchivedLabel' });
    const { container } = renderTab({ historyRows: [archivedRow] });
    const labelSpan = getLabelSpan(container, 'ArchivedLabel');
    const row = labelSpan.closest('tr');
    expect(row).toHaveStyle({ opacity: '0.55' });
  });

  // ── Show / Hide archived toggle ────────────────────────────────────────

  it('toggling show archived fetches with correct filter', async () => {
    mockFetchRunHistory.mockResolvedValue([]);
    renderTab({
      historyRows: [baseRow],
      historyShowArchived: false,
      setHistoryShowArchived: vi.fn(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show archived' }));
    await waitFor(() => expect(mockFetchRunHistory).toHaveBeenCalledWith('m1', { archived: true }));
  });

  // ── Reproduce Run ──────────────────────────────────────────────────────

  it('shows green banner when reproduction matches stored summary', async () => {
    mockGetRun.mockResolvedValue(baseRunRecord);
    mockBuildEngine.mockReturnValue({
      runAll: () => ({ summary: storedSummary }),
    });

    renderTab();
    await openMoreMenu();
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
    await openMoreMenu();
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
    await openMoreMenu();
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
    await openMoreMenu();
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
    await openMoreMenu();
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
    await openMoreMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Reproduce' }));

    await waitFor(() =>
      expect(screen.getByTestId('reproduce-result-run-1')).toHaveTextContent(/Reproduce failed/i)
    );
  });

  it('shows error when no model snapshot is stored', async () => {
    mockGetRun.mockResolvedValue({ ...baseRunRecord, model_snapshot: null });
    renderTab();
    await openMoreMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Reproduce' }));
    await waitFor(() =>
      expect(screen.getByTestId('reproduce-result-run-1')).toHaveTextContent(/No model snapshot/i)
    );
  });

  it('shows error when reproduce throws an exception', async () => {
    mockGetRun.mockRejectedValue(new Error('Network timeout'));
    renderTab();
    await openMoreMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Reproduce' }));
    await waitFor(() =>
      expect(screen.getByTestId('reproduce-result-run-1')).toHaveTextContent(/Reproduce error.*Network timeout/i)
    );
  });

  it('disables reproduce button while running', async () => {
    mockGetRun.mockResolvedValue(new Promise(() => {}));
    renderTab();
    await openMoreMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Reproduce' }));
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Running/i });
      expect(btn).toBeDisabled();
    });
  });

  // ── AI insights display ────────────────────────────────────────────────
  // AI insights are no longer shown inline in the table; they are accessible
  // via the Explain button which opens the Results Explain sub-tab.

  // ── Date formatting ────────────────────────────────────────────────────

  it('displays formatted date for each run', () => {
    renderTab({ historyRows: [makeRow({ ran_at: '2026-05-01T14:30:00Z' })] });
    expect(screen.getByText(/01 May 2026/i)).toBeInTheDocument();
  });

  // ── Multiple runs rendering ────────────────────────────────────────────

  it('renders all row labels in the table', () => {
    const rows = [
      makeRow({ id: 'r1', run_label: 'First' }),
      makeRow({ id: 'r2', run_label: 'Second' }),
      makeRow({ id: 'r3', run_label: 'Third' }),
    ];
    renderTab({ historyRows: rows });
    expect(screen.getAllByText('First').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Second').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Third').length).toBeGreaterThanOrEqual(1);
  });
});
