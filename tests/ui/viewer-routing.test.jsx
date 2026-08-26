// Access-role routing (stakeholder view groundwork): what a non-owner sees
// when opening a shared model depends on their access-map role. Fixture and
// mock style copied from session-handoff.test.jsx.
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.jsx';
import { supabase } from '../../src/db/supabase.js';

const mockFetchModels = vi.hoisted(() => vi.fn());
const mockFetchProfiles = vi.hoisted(() => vi.fn());
const mockFetchRunStatsForModels = vi.hoisted(() => vi.fn());
const mockFetchModelSchedules = vi.hoisted(() => vi.fn());
const mockFetchRunHistory = vi.hoisted(() => vi.fn());
const mockFetchUserSettings = vi.hoisted(() => vi.fn());
const mockSaveUserSettings = vi.hoisted(() => vi.fn());
const mockListShareLinks = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', async () => {
  const actual = await vi.importActual('../../src/db/models.js');
  return {
    ...actual,
    fetchModels: mockFetchModels,
    fetchProfiles: mockFetchProfiles,
    fetchRunStatsForModels: mockFetchRunStatsForModels,
    saveModel: vi.fn(),
    deleteModel: vi.fn(),
    setVisibility: vi.fn(),
    setAccess: vi.fn(),
    forkModel: vi.fn(),
    getPlatformConfig: vi.fn(() => Promise.resolve(null)),
    fetchModelSchedules: mockFetchModelSchedules,
    fetchRunHistory: mockFetchRunHistory,
    fetchUserSettings: mockFetchUserSettings,
    saveUserSettings: mockSaveUserSettings,
    listShareLinks: mockListShareLinks,
  };
});

const session = { user: { id: 'user-1' } };

const sharedModel = (access) => ({
  id: 'shared-1',
  name: 'Branch Staffing',
  description: 'A staffing model',
  visibility: 'private',
  owner_id: 'other-user',
  access,
  entityTypes: [],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
});

describe('access-role routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState(null, '', '/');
    sessionStorage.clear();
    mockFetchProfiles.mockResolvedValue([
      { id: 'user-1', full_name: 'Viewer Person', initials: 'V', color: '#06b6d4' },
      { id: 'other-user', full_name: 'Owner Person', initials: 'O', color: '#f59e0b' },
    ]);
    mockFetchRunStatsForModels.mockResolvedValue({});
    mockFetchModelSchedules.mockResolvedValue([]);
    mockFetchRunHistory.mockResolvedValue([]);
    mockFetchUserSettings.mockResolvedValue({ settings: {} });
    mockSaveUserSettings.mockResolvedValue(undefined);
    mockListShareLinks.mockResolvedValue([]);
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  afterEach(() => {
    window.history.pushState(null, '', '/');
    sessionStorage.clear();
  });

  it('gives an editor-role user ModelDetail without the owner-only Access tab', async () => {
    mockFetchModels.mockResolvedValue([sharedModel({ 'user-1': 'editor' })]);
    window.history.pushState(null, '', '/#model/shared-1');

    render(<App />);

    // ModelDetail is up (Design mode button present)…
    expect(await screen.findByRole('button', { name: /^design$/i }, { timeout: 10000 })).toBeInTheDocument();
    // …but the owner-only tabs are gone now that isOwner is passed honestly.
    expect(screen.queryByRole('button', { name: /^access$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /versions/i })).not.toBeInTheDocument();
  }, 15000);

  it("hides models where the stale legacy 'none' role is stored from My Models", async () => {
    mockFetchModels.mockResolvedValue([sharedModel({ 'user-1': 'none' })]);

    render(<App />);

    await screen.findByText('Model Library');
    await waitFor(() => expect(mockFetchModels).toHaveBeenCalled());
    expect(screen.queryByText('Branch Staffing')).not.toBeInTheDocument();
  }, 15000);
});
