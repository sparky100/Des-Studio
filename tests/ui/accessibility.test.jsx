import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutePanel } from '../../src/ui/execute/index.jsx';
import { ModelCard, ModelDetail, NewModelModal } from '../../src/ui/ModelDetail.jsx';
import { ModelTabBar } from '../../src/ui/ModelTabBar.jsx';

const mockBuildEngine = vi.hoisted(() => vi.fn());
const mockRunReplications = vi.hoisted(() => vi.fn());
const mockFetchUserSettings = vi.hoisted(() => vi.fn(() => new Promise(() => {})));

vi.mock('../../src/engine/index.js', async () => {
  const actual = await vi.importActual('../../src/engine/index.js');
  return { ...actual, buildEngine: mockBuildEngine };
});

vi.mock('../../src/engine/replication-runner.js', async () => {
  const actual = await vi.importActual('../../src/engine/replication-runner.js');
  return {
    ...actual,
    runReplications: mockRunReplications,
    createReplicationPool: () => ({ destroyed: false, get: vi.fn(), destroy: vi.fn() }),
  };
});

vi.mock('../../src/llm/apiClient.js', async () => {
  const actual = await vi.importActual('../../src/llm/apiClient.js');
  return { ...actual, streamNarrative: vi.fn() };
});

vi.mock('../../src/db/models.js', async () => {
  const actual = await vi.importActual('../../src/db/models.js');
  return { ...actual, fetchUserSettings: mockFetchUserSettings };
});

function makeMockEngine(totalCycles = 120) {
  let cycle = 0;

  const makeResult = (options = {}) => ({
    finalTime: cycle,
    log: options.cancelled
      ? [{ phase: 'CANCEL', time: cycle, message: options.message }]
      : [{ phase: 'END', time: cycle, message: 'done' }],
    snap: { clock: cycle, entities: [], served: 0, reneged: 0, scalars: {} },
    summary: { total: 0, served: 0, reneged: 0, avgWait: null, avgSvc: null, avgSojourn: null, warnings: [] },
    runtimeMetrics: {
      wall_clock_ms: null,
      replications: 1,
      events_processed: cycle,
      c_event_scans: 0,
      c_events_fired: 0,
      entities_created: 0,
      entities_completed: 0,
    },
    phaseCTruncated: false,
    warnings: [],
    entitySummary: [],
    waitDist: {},
    ...(options.cancelled ? { cancelled: true, partial: true, completionStatus: 'cancelled' } : {}),
  });

  return {
    step() {
      if (cycle >= totalCycles) {
        return { done: true, phaseCTruncated: false };
      }
      cycle += 1;
      return { done: false, phaseCTruncated: false };
    },
    getProgress(overrides = {}) {
      const cancelled = !!overrides.cancelled;
      const done = !!overrides.done || cancelled || cycle >= totalCycles;
      return {
        mode: 'single',
        completed: cycle,
        total: 5000,
        running: done ? 0 : 1,
        pending: 0,
        cancelled,
        workerCount: 1,
        clock: cycle,
        felSize: Math.max(0, totalCycles - cycle),
        eventsProcessed: cycle,
        maxCycles: 5000,
        terminationMode: 'time',
      };
    },
    buildResult(options = {}) {
      return makeResult(options);
    },
  };
}

const validModel = {
  id: 'model-1',
  name: 'Queue Model',
  description: 'A small queue.',
  visibility: 'private',
  owner_id: 'user-1',
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
  updatedAt: '2026-05-04T10:00:00Z',
};

// Admission checks want a terminating bEvent alongside the arrival — validModel above
// is only exercised for tab/dirty-state assertions, so it's kept minimal. The live-region
// and animation-preference tests below actually start a run, so they need a model that
// clears admission with no blockers.
const runnableModel = {
  ...validModel,
  bEvents: [
    ...validModel.bEvents,
    {
      id: 'b_complete',
      name: 'Complete',
      scheduledTime: '9999',
      effect: 'COMPLETE()',
      schedules: [],
    },
  ],
};

describe('accessibility pass', () => {
  beforeEach(() => {
    mockFetchUserSettings.mockReset();
    mockFetchUserSettings.mockImplementation(() => new Promise(() => {}));
  });

  it('opens model cards from the keyboard', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(<ModelCard model={validModel} profiles={[]} onOpen={onOpen} />);

    const card = screen.getByRole('button', { name: /open model queue model/i });
    await user.tab();
    expect(card).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('labels and focuses the new model modal fields', async () => {
    const user = userEvent.setup();
    render(<NewModelModal onClose={vi.fn()} onStartDesign={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /new model/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/e\.g\. Queue with Reneging/i)).not.toBeInTheDocument();

    await user.click(screen.getByText(/^Draw$/i).closest('button'));
    expect(screen.getByRole('dialog', { name: /name your model/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i)).toHaveFocus();
  });

  it('exposes selected state on model tabs', async () => {
    const user = userEvent.setup();

    render(
      <ModelDetail
        modelId="model-1"
        modelData={validModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1' }}
      />
    );

    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-pressed', 'true');
    const tabs = screen.queryAllByRole('tab').map(tab => tab.textContent);
    expect(tabs).not.toContain('AI Designer');

    await user.click(screen.getByRole('button', { name: /^design$/i }));
    expect(screen.getByRole('button', { name: /^describe$/i })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getAllByRole('button', { name: /^run$/i })[0]);
    expect(screen.getAllByRole('button', { name: /^run$/i })[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders no clickable aria-hidden badges in the model tab bar', () => {
    const setTab = vi.fn();
    const modes = [
      { id: 'define', label: 'Define', primaryTab: 'entities', tabs: ['entities', 'validate'] },
    ];

    const { container } = render(
      <ModelTabBar
        tab="entities"
        setTab={setTab}
        DISPLAY_MODES={modes}
        activeMode={modes[0]}
        visibleSelectableTabs={[
          { id: 'entities', label: 'Entities' },
          { id: 'validate', label: 'Model Health' },
        ]}
        validation={{ errors: [{ tab: 'entities', message: 'Entity needs a name' }], warnings: [] }}
        tabIssueCounts={{ entities: { errors: 1, warnings: 0 } }}
        isCompactLayout={false}
        showMoreTabs={false}
        setShowMoreTabs={vi.fn()}
      />
    );

    // Decorative aria-hidden elements (issue badges, icons) must not look or act clickable.
    const hiddenElements = Array.from(container.querySelectorAll('[aria-hidden="true"]'));
    expect(hiddenElements.length).toBeGreaterThan(0);
    hiddenElements.forEach(el => {
      expect(el.style.cursor).not.toBe('pointer');
    });

    // Clicking a badge only activates its parent tab button — it no longer hijacks
    // the click to navigate to the validate tab. The parent button already carries
    // the issue count in its accessible name.
    const entitiesTab = screen.getByRole('tab', { name: /entities, 1 error/i });
    const badge = entitiesTab.querySelector('span[aria-hidden="true"][title]');
    expect(badge).not.toBeNull();
    fireEvent.click(badge);
    expect(setTab).toHaveBeenCalledWith('entities');
    expect(setTab).not.toHaveBeenCalledWith('validate');
  });

  it('keeps Execute Run All discoverable and disabled with validation errors', () => {
    render(<ExecutePanel model={{ ...validModel, entityTypes: [{ id: 'bad', name: '', role: 'customer' }] }} modelId="model-1" userId="user-1" />);

    expect(screen.getAllByRole('button', { name: /blocker/i }).every(button => button.disabled)).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent(/needs attention/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/blockers to resolve before running/i);
  });

  it('does not mark the model dirty just for opening the Visual Designer', async () => {
    render(
      <ModelDetail
        modelId="model-1"
        modelData={validModel}
        initialTab="visual"
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1' }}
      />
    );

    await screen.findByRole('button', { name: /^design$/i });
    expect(screen.queryByText(/Unsaved changes in this model/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('does not mark the model dirty when Execute writes the same experiment defaults back', async () => {
    render(
      <ModelDetail
        modelId="model-1"
        modelData={{
          ...validModel,
          experimentDefaults: { warmupPeriod: 0, maxSimTime: 500, replications: 1, terminationMode: 'time' },
        }}
        initialTab="execute"
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1' }}
      />
    );

    await screen.findAllByRole('button', { name: /^run$/i });
    // The run controls bar now exposes the setup panel via the "⚙ Edit" toggle.
    await userEvent.setup().click(await screen.findByRole('button', { name: '⚙ Edit' }));
    await screen.findByRole('button', { name: /hide setup/i });
    expect(screen.queryByText(/Unsaved changes in this model/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  }, 15000);

  it('exposes single-run status and cancellation-save-status as live regions, with the progress tiles muted', async () => {
    mockBuildEngine.mockReset();
    mockBuildEngine.mockImplementation(() => makeMockEngine(2000));

    render(<ExecutePanel model={runnableModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    const singleRunLabel = await screen.findByText('SINGLE RUN');
    const singleRunHeader = singleRunLabel.closest('[role="status"]');
    expect(singleRunHeader).not.toBeNull();

    // The per-tick progress tiles churn every step and must not spam announcements.
    const tiles = singleRunHeader.parentElement.querySelector('[aria-live="off"]');
    expect(tiles).not.toBeNull();
    expect(tiles.textContent).toMatch(/Sim time/i);

    fireEvent.click(screen.getByRole('button', { name: /cancel run/i }));
    await waitFor(() => expect(screen.getByText('cancelled')).toBeInTheDocument());

    // Cancellation notice is an informational status region.
    expect(screen.getByText(/Cancellation waits for the next safe engine checkpoint/i)).toHaveAttribute('role', 'status');

    // The run-save status block escalates to role="alert" for the cancellation error state.
    const alertRegion = screen.getByRole('alert');
    expect(alertRegion).toHaveTextContent(/Run cancelled\. Partial results were not saved\./i);
  });

  it('exposes role="status" on the batch progress line and mutes the pool/running/pending line', async () => {
    mockRunReplications.mockReset();
    mockRunReplications.mockImplementation(({ onProgress }) => {
      onProgress({ completed: 0, total: 3, running: 2, pending: 1, cancelled: false, workerCount: 2 });
      return { cancel: vi.fn() };
    });

    render(<ExecutePanel model={runnableModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.change(screen.getByLabelText(/replication count/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    const progressLine = await screen.findByText('Running 0/3');
    expect(progressLine).toHaveAttribute('role', 'status');

    const poolLine = screen.getByText(/Pool: 2/i);
    expect(poolLine).toHaveAttribute('aria-live', 'off');
  });

  it('defaults token-animation off when the OS signals prefers-reduced-motion', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    try {
      render(<ExecutePanel model={runnableModel} modelId="model-1" userId="user-1" />);
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      const animateToggle = await screen.findByRole('checkbox', { name: /show entity movement/i });
      expect(animateToggle).not.toBeChecked();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lets a stored user setting override the reduced-motion default', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    mockFetchUserSettings.mockReset();
    mockFetchUserSettings.mockResolvedValue({ settings: { execute: { animateTokens: true } } });

    try {
      render(<ExecutePanel model={runnableModel} modelId="model-1" userId="user-1" />);
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      const animateToggle = await screen.findByRole('checkbox', { name: /show entity movement/i });
      await waitFor(() => expect(animateToggle).toBeChecked());
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
