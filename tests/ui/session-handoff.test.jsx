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
const ownModel = { id: 'own-1', name: 'Own Model', visibility: 'private', owner_id: 'user-1', access: {}, entityTypes: [], bEvents: [], cEvents: [], queues: [] };

describe('Compass session handoff', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState(null, '', '/');
    sessionStorage.clear();
    mockFetchProfiles.mockResolvedValue([{ id: 'user-1', full_name: 'Owner', initials: 'O', color: '#06b6d4' }]);
    mockFetchRunStatsForModels.mockResolvedValue({});
    mockFetchModelSchedules.mockResolvedValue([]);
    mockFetchRunHistory.mockResolvedValue([]);
    mockFetchUserSettings.mockResolvedValue({ settings: {} });
    mockSaveUserSettings.mockResolvedValue(undefined);
    mockListShareLinks.mockResolvedValue([]);
    mockFetchModels.mockResolvedValue([ownModel]);
    supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  afterEach(() => {
    window.history.pushState(null, '', '/');
    sessionStorage.clear();
  });

  it('adopts an access_token/refresh_token pair ahead of a #model/{id} hash, strips them from the URL, and opens the model', async () => {
    window.history.pushState(null, '', '/?access_token=tok-abc&refresh_token=tok-def#model/own-1');
    // Not signed in yet — setSession() below is what hands off the Compass session.
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    supabase.auth.setSession.mockResolvedValue({ data: { session }, error: null });

    render(<App />);

    await waitFor(() => {
      expect(supabase.auth.setSession).toHaveBeenCalledWith({
        access_token: 'tok-abc',
        refresh_token: 'tok-def',
      });
    });

    await waitFor(() => {
      expect(window.location.search).toBe('');
    });
    expect(window.location.href).not.toContain('access_token');
    expect(window.location.href).not.toContain('refresh_token');
  });

  it('logs a warning and falls back to the normal login flow when the handed-off session is invalid', async () => {
    window.history.pushState(null, '', '/?access_token=bad&refresh_token=bad#model/own-1');
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    supabase.auth.setSession.mockResolvedValue({ data: { session: null }, error: { message: 'invalid token' } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<App />);

    await waitFor(() => {
      expect(supabase.auth.setSession).toHaveBeenCalledWith({
        access_token: 'bad',
        refresh_token: 'bad',
      });
    });
    await waitFor(() => expect(warnSpy).toHaveBeenCalled());

    // Falls through to the existing getSession()/login flow — params are left as-is on error.
    expect(window.location.search).toBe('?access_token=bad&refresh_token=bad');
    warnSpy.mockRestore();
  });

  it('behaves exactly as before when no handoff params are present', async () => {
    window.history.pushState(null, '', '/#model/own-1');
    supabase.auth.getSession.mockResolvedValue({ data: { session } });

    render(<App />);

    expect(await screen.findByRole('button', { name: /^access$/i }, { timeout: 10000 })).toBeInTheDocument();
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });
});
