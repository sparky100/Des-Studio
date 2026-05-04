import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.jsx';
import { supabase } from '../../src/db/supabase.js';

const mockFetchModels = vi.hoisted(() => vi.fn());
const mockFetchProfiles = vi.hoisted(() => vi.fn());
const mockFetchRunStatsForModels = vi.hoisted(() => vi.fn());
const mockDeleteModel = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', () => ({
  fetchModels: mockFetchModels,
  fetchProfiles: mockFetchProfiles,
  fetchRunStatsForModels: mockFetchRunStatsForModels,
  saveModel: vi.fn(),
  deleteModel: mockDeleteModel,
  setVisibility: vi.fn(),
  setAccess: vi.fn(),
  forkModel: vi.fn(),
}));

const session = { user: { id: 'user-1' } };
const ownModel = {
  id: 'own-1',
  name: 'Own Model',
  owner_id: 'user-1',
  visibility: 'private',
  entityTypes: [],
  bEvents: [],
  cEvents: [],
  updatedAt: '2026-05-04T10:00:00Z',
};
const publicModel = {
  id: 'pub-1',
  name: 'Public Model',
  owner_id: 'other-user',
  visibility: 'public',
  entityTypes: [],
  bEvents: [],
  cEvents: [],
  updatedAt: '2026-05-04T10:00:00Z',
};

async function renderLibrary(models = [ownModel]) {
  mockFetchModels.mockResolvedValue(models);
  render(<App />);
  await screen.findByText('Model Library');
}

describe('model delete UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockFetchProfiles.mockResolvedValue([{ id: 'user-1', full_name: 'Owner', initials: 'O', color: '#06b6d4' }]);
    mockFetchRunStatsForModels.mockResolvedValue({});
    mockDeleteModel.mockResolvedValue({ ok: true });
  });

  it('shows Delete on owned models', async () => {
    await renderLibrary();

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('does not show Delete on public models owned by someone else', async () => {
    const user = userEvent.setup();
    await renderLibrary([publicModel]);

    await user.click(screen.getByRole('tab', { name: /public library/i }));
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('requires confirmation before deleting', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderLibrary();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(window.confirm).toHaveBeenCalledWith("Delete 'Own Model'? This cannot be undone.");
    expect(mockDeleteModel).not.toHaveBeenCalled();
  });

  it('deletes after confirmation and removes the card locally', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderLibrary();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockDeleteModel).toHaveBeenCalledWith('own-1', 'user-1'));
    expect(screen.queryByRole('button', { name: /open model own model/i })).not.toBeInTheDocument();
  });
});
