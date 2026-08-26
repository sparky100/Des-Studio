// StakeholderView — the simplified run-and-results surface viewer-role
// users get instead of the modelling environment.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StakeholderView } from '../../src/ui/StakeholderView.jsx';
import { ThemeProvider } from '../../src/ui/shared/ThemeContext.jsx';
import { fetchModelSchedules } from '../../src/db/models.js';
import { runReplications } from '../../src/engine/replication-runner.js';

const mockFetchModelSchedules = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', async () => {
  const actual = await vi.importActual('../../src/db/models.js');
  return { ...actual, fetchModelSchedules: mockFetchModelSchedules };
});

vi.mock('../../src/engine/replication-runner.js', () => ({
  runReplications: vi.fn(),
}));

// Base on the app's own known-valid starter model so validateModel passes
// and the Run gate genuinely opens.
import { createSampleMm1Model } from '../../src/App.jsx';

const validModel = {
  ...createSampleMm1Model(),
  id: 'm1',
  name: 'Bank Branch',
  description: 'What happens at the counter',
  experimentDefaults: { replications: 3, maxSimTime: 100, warmupPeriod: 0 },
  exposedParams: [
    { path: 'entityTypes.et_srv.count', businessLabel: 'Number of tellers', min: 1, max: 5 },
    { path: 'entityTypes.et-gone.count', businessLabel: 'Ghost knob' }, // orphan — silently dropped here
  ],
  owner_id: 'owner-1',
  access: { 'viewer-1': 'viewer' },
};

const repsOf = (values) => values.map((v, i) => ({
  replicationIndex: i,
  seed: i,
  result: { finalTime: 100, summary: { total: 20, served: 18, reneged: 2, avgWait: v, avgSvc: 4, avgSojourn: v + 4, servedRatio: 0.9 } },
}));

function renderView(model = validModel) {
  return render(
    <ThemeProvider>
      <StakeholderView model={model} plan="pro" onBack={vi.fn()} />
    </ThemeProvider>
  );
}

describe('StakeholderView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchModelSchedules.mockResolvedValue([]);
  });

  it('shows the model identity and the curated knobs, silently dropping orphans', async () => {
    renderView();

    expect(screen.getByRole('heading', { name: 'Bank Branch' })).toBeInTheDocument();
    expect(screen.getByText('What happens at the counter')).toBeInTheDocument();

    expect(await screen.findByText('Number of tellers')).toBeInTheDocument();
    expect(screen.getByText(/Standard: 1/)).toBeInTheDocument();
    expect(screen.getByText(/between 1 and 5/)).toBeInTheDocument();
    // Orphaned entry never renders for the viewer
    expect(screen.queryByText('Ghost knob')).not.toBeInTheDocument();
    // No design-environment chrome
    expect(screen.queryByRole('button', { name: /^design$/i })).not.toBeInTheDocument();
  });

  it('keeps Run disabled until schedules resolve, then runs and shows KPI results', async () => {
    let resolveSchedules;
    mockFetchModelSchedules.mockReturnValue(new Promise(r => { resolveSchedules = r; }));
    runReplications.mockImplementation(opts => {
      opts.onComplete(repsOf([3.1, 2.9, 3.0]));
      return { cancel: vi.fn() };
    });

    renderView();

    const runBtn = screen.getByRole('button', { name: /run the simulation/i });
    expect(runBtn).toBeDisabled();
    expect(screen.getByText(/preparing the model/i)).toBeInTheDocument();

    resolveSchedules([]);
    await waitFor(() => expect(runBtn).not.toBeDisabled());

    fireEvent.click(runBtn);

    expect(await screen.findByText('RESULTS')).toBeInTheDocument();
    // Replication count comes from the owner's experiment defaults
    expect(runReplications).toHaveBeenCalledWith(expect.objectContaining({ replications: 3, collectTimeSeries: false }));
    expect(screen.getByRole('button', { name: /run again/i })).toBeInTheDocument();
  });

  it('applies changed knob values as parameter deltas on the patched model', async () => {
    runReplications.mockImplementation(opts => {
      opts.onComplete(repsOf([3.0]));
      return { cancel: vi.fn() };
    });

    renderView();
    await waitFor(() => expect(screen.getByRole('button', { name: /run the simulation/i })).not.toBeDisabled());

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Number of tellers' }), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /run the simulation/i }));

    const patched = runReplications.mock.calls[0][0].model;
    const teller = patched.entityTypes.find(e => e.id === 'et_srv');
    expect(teller.count).toBe('4');
    // The original model object is untouched
    expect(validModel.entityTypes.find(e => e.id === 'et_srv').count).toBe(1);
  });

  it('clamps a knob to its curated bounds on blur', async () => {
    renderView();
    const input = await screen.findByRole('spinbutton', { name: 'Number of tellers' });

    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(5);

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(1);
  });

  it('shows a friendly blocked state for an invalid model instead of validation codes', () => {
    renderView({ ...validModel, entityTypes: [], bEvents: [], cEvents: [], queues: [], exposedParams: [] });

    expect(screen.getByText(/a problem only its owner can fix/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run the simulation/i })).not.toBeInTheDocument();
  });

  it('offers a run-as-is message when nothing is exposed', async () => {
    renderView({ ...validModel, exposedParams: [] });

    expect(await screen.findByText(/hasn't made any settings adjustable/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /run the simulation/i })).not.toBeDisabled());
  });

  it('surfaces a friendly error when the run fails', async () => {
    runReplications.mockImplementation(opts => {
      opts.onError(new Error('worker exploded'));
      return { cancel: vi.fn() };
    });

    renderView();
    await waitFor(() => expect(screen.getByRole('button', { name: /run the simulation/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /run the simulation/i }));

    expect(await screen.findByText(/something went wrong while running the model/i)).toBeInTheDocument();
    expect(screen.queryByText(/worker exploded/)).not.toBeInTheDocument();
  });
});
