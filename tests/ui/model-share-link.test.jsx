import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.jsx';
import { supabase } from '../../src/db/supabase.js';

const mockFetchModels = vi.hoisted(() => vi.fn());
const mockFetchProfiles = vi.hoisted(() => vi.fn());
const mockForkModel = vi.hoisted(() => vi.fn());
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
    forkModel: mockForkModel,
    getPlatformConfig: vi.fn(() => Promise.resolve(null)),
    fetchModelSchedules: mockFetchModelSchedules,
    fetchRunHistory: mockFetchRunHistory,
    fetchUserSettings: mockFetchUserSettings,
    saveUserSettings: mockSaveUserSettings,
    listShareLinks: mockListShareLinks,
  };
});

const session = { user: { id: 'user-1' } };
const ownModel = { id: 'own-1', name: 'Own Model', visibility: 'private', owner_id: 'user-1', access: {}, entityTypes: [], bEvents: [], cEvents: [], queues: [] };
const publicModel = { id: 'pub-1', name: 'Public Model', visibility: 'public', owner_id: 'user-2', access: {}, entityTypes: [], bEvents: [], cEvents: [], queues: [] };

describe('#model/<id> deep link', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
    sessionStorage.clear();
    mockFetchProfiles.mockResolvedValue([{ id: 'user-1', full_name: 'Owner', initials: 'O', color: '#06b6d4' }]);
    mockFetchRunStatsForModels.mockResolvedValue({});
    mockFetchModelSchedules.mockResolvedValue([]);
    mockFetchRunHistory.mockResolvedValue([]);
    mockFetchUserSettings.mockResolvedValue({ settings: {} });
    mockSaveUserSettings.mockResolvedValue(undefined);
    mockListShareLinks.mockResolvedValue([]);
  });

  afterEach(() => {
    window.location.hash = '';
    sessionStorage.clear();
  });

  it('opens an owned model directly when the link is followed while already signed in', async () => {
    window.location.hash = '#model/own-1';
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mockFetchModels.mockResolvedValue([ownModel]);

    render(<App />);

    expect(await screen.findByRole('button', { name: /^access$/i })).toBeInTheDocument();
    expect(screen.queryByText('Model Library')).not.toBeInTheDocument();
  });

  it('shows the fork-confirmation dialog when the link points to a public model owned by someone else', async () => {
    window.location.hash = '#model/pub-1';
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mockFetchModels.mockResolvedValue([publicModel]);

    render(<App />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/run public model/i)).toBeInTheDocument();
  });

  it('lands on the normal library with no error when the linked model does not exist or is not accessible', async () => {
    window.location.hash = '#model/missing-1';
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mockFetchModels.mockResolvedValue([ownModel]);

    render(<App />);

    expect(await screen.findByText('Model Library')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resumes opening the model after sign-in when the link is followed while signed out', async () => {
    window.location.hash = '#model/own-1';
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    let authStateCallback;
    supabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authStateCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockFetchModels.mockResolvedValue([ownModel]);

    render(<App />);

    await waitFor(() => expect(sessionStorage.getItem('des.pendingModelId')).toBe('own-1'));

    await act(async () => {
      authStateCallback('SIGNED_IN', session);
    });

    expect(await screen.findByRole('button', { name: /^access$/i })).toBeInTheDocument();
    expect(sessionStorage.getItem('des.pendingModelId')).toBeNull();
  });
});
