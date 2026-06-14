import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.jsx';
import { supabase } from '../../src/db/supabase.js';

const mockFetchModels = vi.hoisted(() => vi.fn());
const mockFetchProfiles = vi.hoisted(() => vi.fn());
const mockForkModel = vi.hoisted(() => vi.fn());
const mockSaveModel = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', () => ({
  fetchModels: mockFetchModels,
  fetchProfiles: mockFetchProfiles,
  fetchRunStatsForModels: vi.fn().mockResolvedValue({}),
  saveModel: mockSaveModel,
  deleteModel: vi.fn(),
  setVisibility: vi.fn(),
  setAccess: vi.fn(),
  forkModel: mockForkModel,
  getPlatformConfig: vi.fn(() => Promise.resolve(null)),
  fetchModelSchedules: vi.fn().mockResolvedValue([]),
}));

const session = { user: { id: 'user-1' } };

async function renderLibrary() {
  render(<App />);
  await screen.findByText('Model Library');
}

describe('Community Gallery tab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockFetchProfiles.mockResolvedValue([
      { id: 'user-1', full_name: 'Alice', initials: 'A', color: '#06b6d4' },
      { id: 'user-2', full_name: 'Bob', initials: 'B', color: '#f59e0b' },
    ]);
    mockSaveModel.mockResolvedValue({ id: 'forked-1' });
    mockForkModel.mockResolvedValue({ id: 'forked-1' });
  });

  it('renders the Community tab alongside My, Templates, and Public', async () => {
    mockFetchModels.mockResolvedValue([]);
    await renderLibrary();

    expect(screen.getByRole('tab', { name: /community/i })).toBeInTheDocument();
  });

  it('shows empty state when no public models exist', async () => {
    mockFetchModels.mockResolvedValue([]);
    await renderLibrary();

    fireEvent.click(screen.getByRole('tab', { name: /community/i }));

    expect(await screen.findByText(/no community models shared yet/i)).toBeInTheDocument();
  });

  it('lists all public models including those owned by the current user', async () => {
    mockFetchModels.mockResolvedValue([
      { id: 'm1', name: 'Alice Public', description: 'A public model', visibility: 'public', owner_id: 'user-1', entityTypes: [], bEvents: [], cEvents: [], queues: [] },
      { id: 'm2', name: 'Bob Public', description: 'Bobs shared model', visibility: 'public', owner_id: 'user-2', entityTypes: [], bEvents: [], cEvents: [], queues: [] },
    ]);
    await renderLibrary();

    fireEvent.click(screen.getByRole('tab', { name: /community/i }));

    expect(await screen.findByText('Alice Public')).toBeInTheDocument();
    expect(screen.getByText('Bob Public')).toBeInTheDocument();
  });

  it('opens owned public models directly without fork dialog', async () => {
    mockFetchModels.mockResolvedValue([
      { id: 'm1', name: 'Mine', visibility: 'public', owner_id: 'user-1', entityTypes: [], bEvents: [], cEvents: [], queues: [] },
    ]);
    await renderLibrary();

    fireEvent.click(screen.getByRole('tab', { name: /community/i }));
    const card = await screen.findByLabelText(/open model mine/i);
    fireEvent.click(card);

    expect(screen.queryByRole('dialog', { name: /fork/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /run public model/i })).not.toBeInTheDocument();
  });

  it('shows fork dialog when opening another users public model from community', async () => {
    mockFetchModels.mockResolvedValue([
      { id: 'm2', name: 'Bobs', visibility: 'public', owner_id: 'user-2', entityTypes: [], bEvents: [], cEvents: [], queues: [] },
    ]);
    await renderLibrary();

    fireEvent.click(screen.getByRole('tab', { name: /community/i }));
    const card = await screen.findByLabelText(/open model bobs/i);
    fireEvent.click(card);

    expect(await screen.findByText(/run public model/i)).toBeInTheDocument();
    expect(screen.getAllByRole('dialog').length).toBeGreaterThanOrEqual(1);
  });

  it('forks from gallery and opens the new private copy', async () => {
    mockFetchModels.mockResolvedValue([
      { id: 'm2', name: 'Bobs', visibility: 'public', owner_id: 'user-2', entityTypes: [], bEvents: [], cEvents: [], queues: [] },
    ]);
    await renderLibrary();

    fireEvent.click(screen.getByRole('tab', { name: /community/i }));
    const card = await screen.findByLabelText(/open model bobs/i);
    fireEvent.click(card);

    const forkBtn = await screen.findByRole('button', { name: /fork & run/i });
    fireEvent.click(forkBtn);

    await waitFor(() => expect(mockForkModel).toHaveBeenCalledTimes(1));
    expect(mockForkModel).toHaveBeenCalledWith('m2', 'user-1', 'Fork of Bobs');
  });
});
