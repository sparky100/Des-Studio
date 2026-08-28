import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExecutePanel } from '../../../src/ui/execute/index.jsx';
import { ResultsWorkspace } from '../../../src/ui/results/ResultsWorkspace.jsx';
import { buildEngine } from '../../../src/engine/index.js';
import { TEMPLATES } from '../../../src/engine/templates.js';

// ── The sanctioned real-engine-through-the-UI integration test ───────────────
//
// This file is the single deliberate exception to AGENTS.md §12.9's "UI tests
// mock buildEngine()" rule (see that section for the carve-out). Everything
// engine-side is REAL here: ExecutePanel's run path calls the real
// buildEngine(), steps the real Three-Phase engine to completion, and builds
// the real result object. Only the app's external boundaries are mocked, the
// same ones every UI test mocks: the database layer (src/db/models.js — the
// global Supabase client mock in tests/setup-jsdom.js stands behind it) and
// the LLM client.
//
// Why it exists: every other UI test mocks the engine, and every engine test
// runs headless, so the seam between them — the arguments Execute passes to
// buildEngine(), and the shape of the result object the results surfaces
// consume — was asserted nowhere. A mis-wired argument or a reshaped result
// object would have passed the entire suite. This test closes that seam by
// (1) running the app's own sample model through the real Run surface,
// (2) comparing the UI-produced result against a direct engine run with the
// same seed (the engine is deterministic, so summaries must agree), and
// (3) rendering the REAL result through the real ResultsWorkspace — which its
// own unit tests only ever feed hand-built fixtures.
//
// Keep it fast-tier: fixed seed, warmup 0, maxSimTime 50 (≈45 arrivals,
// milliseconds of engine work). Do not grow the model or the horizon here;
// engine-scale behaviour belongs in tests/engine and the soak tier.

const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue('saved-run-id'));
const mockFetchRunHistory = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockFetchUserSettings = vi.hoisted(() => vi.fn(() => new Promise(() => {})));

vi.mock('../../../src/db/models.js', () => ({
  fetchRunHistory: mockFetchRunHistory,
  saveSimulationRun: mockSaveSimulationRun,
  fetchUserSettings: mockFetchUserSettings,
  saveUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  fetchExperiments: vi.fn().mockResolvedValue([]),
  saveExperiment: vi.fn().mockResolvedValue({}),
  updateExperiment: vi.fn().mockResolvedValue({}),
  cloneExperiment: vi.fn().mockResolvedValue({}),
  deleteExperiment: vi.fn().mockResolvedValue({ ok: true }),
  fetchModelSchedules: vi.fn().mockResolvedValue([]),
  buildSchedulesMap: vi.fn().mockReturnValue({}),
  getRun: vi.fn().mockResolvedValue(null),
  createShareLink: vi.fn().mockResolvedValue({}),
  listShareLinks: vi.fn().mockResolvedValue([]),
  revokeShareLink: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('../../../src/llm/apiClient.js', () => ({
  streamNarrative: vi.fn(),
}));

const SEED = 42;
const MAX_SIM_TIME = 50;

// The model users actually get from the template gallery's "M/M/1 Queue" —
// not a hand-built test fixture. If the template drifts from the engine's
// semantics (as the old createSampleMm1Model fixture did — see the onboarding
// test's served-count assertion), this test fails with it.
function makeModel() {
  const template = TEMPLATES.find(t => t.name === 'M/M/1 Queue');
  const { entityTypes, stateVariables, bEvents, cEvents, queues } = template;
  return {
    entityTypes,
    stateVariables,
    bEvents,
    cEvents,
    queues,
    experimentDefaults: {
      maxSimTime: MAX_SIM_TIME,
      warmupPeriod: 0,
      replications: 1, // single-run path: ExecutePanel drives buildEngine directly
      terminationMode: 'time',
      seed: SEED,
    },
  };
}

describe('Run flow integration — real engine through the real UI', () => {
  it('runs the sample model via the Run surface and shows engine-true results', async () => {
    const model = makeModel();

    // Engine truth: the same model, seed, warmup and horizon, run directly.
    // The engine is deterministic for a fixed seed, so whatever the UI path
    // produces must agree with this — any divergence means Execute passed
    // different effective parameters to buildEngine than it claims.
    const truth = buildEngine(model, SEED, 0, MAX_SIM_TIME).runAll();
    expect(truth.summary.served).toBeGreaterThan(0); // guard: a degenerate run would make this test vacuous

    const onRunComplete = vi.fn();
    const onResultsReady = vi.fn();
    const onGoToResults = vi.fn();
    render(
      <ExecutePanel
        model={model}
        modelId="model-1"
        userId="user-1"
        onRunComplete={onRunComplete}
        onResultsReady={onResultsReady}
        onGoToResults={onGoToResults}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /batch run/i }));

    // Wait for a completion callback carrying a real result (initEngine and
    // resets legitimately emit `results: null` along the way).
    await waitFor(
      () => expect(onRunComplete.mock.calls.some(call => call[0]?.results)).toBe(true),
      { timeout: 10000 }
    );

    const uiResult = onRunComplete.mock.calls.findLast(call => call[0]?.results)[0].results;

    // ── Seam assertion 1: the UI-run engine agrees with the direct engine ──
    expect(uiResult.summary.served).toBe(truth.summary.served);
    expect(uiResult.summary.total).toBe(truth.summary.total);
    expect(uiResult.summary.avgWait).toBeCloseTo(truth.summary.avgWait, 8);
    expect(uiResult.summary.avgSvc).toBeCloseTo(truth.summary.avgSvc, 8);
    expect(uiResult.summary.avgSojourn).toBeCloseTo(truth.summary.avgSojourn, 8);

    // ── Seam assertion 2: the run config the UI recorded is the one we set ──
    expect(uiResult._experiment_config).toMatchObject({
      seed: SEED,
      maxSimTime: MAX_SIM_TIME,
      warmupPeriod: 0,
      replications: 1,
    });

    // ── Seam assertion 3: the result reached the persistence boundary ──
    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledTimes(1));
    const [savedModelId, savedUserId, savedResult] = mockSaveSimulationRun.mock.calls[0];
    expect(savedModelId).toBe('model-1');
    expect(savedUserId).toBe('user-1');
    expect(savedResult.summary.served).toBe(truth.summary.served);

    // ── Seam assertion 4: the panel reached its results-available state ──
    expect(onResultsReady).toHaveBeenCalledWith(expect.objectContaining({ summary: expect.anything() }));
    expect(await screen.findByRole('button', { name: /view results/i })).toBeInTheDocument();

    // ── Seam assertion 5: the REAL result renders through the real results
    // surface (ResultsWorkspace's own tests use hand-built fixtures only) ──
    cleanup();
    render(<ResultsWorkspace results={uiResult} model={model} />);

    expect(screen.getByText('SERVED')).toBeInTheDocument();
    expect(screen.getByText('AVG WAIT')).toBeInTheDocument();
    // The displayed values are the engine's numbers (formatMetricValue: served
    // at 0 digits; avgWait at 1 digit with trailing zeros stripped).
    const formattedServed = String(truth.summary.served);
    const formattedAvgWait = Number(truth.summary.avgWait)
      .toFixed(1)
      .replace(/\.?0+$/, '');
    expect(screen.getAllByText(formattedServed).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formattedAvgWait).length).toBeGreaterThan(0);
  });
});
