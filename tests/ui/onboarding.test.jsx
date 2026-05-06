import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App, { createSampleMm1Model } from '../../src/App.jsx';
import { supabase } from '../../src/db/supabase.js';
import { buildEngine } from '../../src/engine/index.js';
import { validateModel } from '../../src/engine/validation.js';

const mockFetchModels = vi.hoisted(() => vi.fn());
const mockFetchProfiles = vi.hoisted(() => vi.fn());
const mockFetchRunStatsForModels = vi.hoisted(() => vi.fn());
const mockSaveModel = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', () => ({
  fetchModels: mockFetchModels,
  fetchProfiles: mockFetchProfiles,
  fetchRunStatsForModels: mockFetchRunStatsForModels,
  saveModel: mockSaveModel,
  deleteModel: vi.fn(),
  setVisibility: vi.fn(),
  setAccess: vi.fn(),
  forkModel: vi.fn(),
}));

const session = { user: { id: 'user-1' } };
const profile = { id: 'user-1', full_name: 'Owner', initials: 'O', color: '#06b6d4' };

async function renderApp() {
  render(<App />);
  await screen.findByText('Model Library');
}

describe('first-run onboarding', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockFetchModels.mockResolvedValue([]);
    mockFetchProfiles.mockResolvedValue([profile]);
    mockFetchRunStatsForModels.mockResolvedValue({});
    mockSaveModel.mockResolvedValue({ id: 'sample-1' });
  });

  it('shows onboarding actions for an empty model list', async () => {
    await renderApp();

    expect(screen.getByText('Start your first model')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create blank model/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create sample m\/m\/1 model/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /import model/i }).length).toBeGreaterThan(0);
  });

  it('hides onboarding when the user already has models', async () => {
    mockFetchModels.mockResolvedValueOnce([{ id: 'm1', name: 'Existing', owner_id: 'user-1', visibility: 'private', entityTypes: [], bEvents: [], cEvents: [] }]);

    await renderApp();

    expect(screen.queryByText('Start your first model')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open model existing/i })).toBeInTheDocument();
  });

  it('creates the sample M/M/1 model for the current user', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: /create sample m\/m\/1 model/i }));

    await waitFor(() => expect(mockSaveModel).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sample M/M/1 Queue', visibility: 'private' }),
      'user-1'
    ));
  });

  it('provides a valid runnable sample M/M/1 model', () => {
    const sample = createSampleMm1Model();

    expect(validateModel(sample).errors).toEqual([]);
    const engine = buildEngine(sample, 42, 0, 25);
    const result = engine.runAll();
    expect(result.summary.total).toBeGreaterThan(0);
  });
});
