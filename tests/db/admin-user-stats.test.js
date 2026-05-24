/**
 * tests/db/admin-user-stats.test.js
 * Sprint 71 — Unit tests for admin stats DB functions.
 * These tests run in the node environment with the globally-mocked supabase client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The supabase mock is set up globally in tests/setup.js.
// We import the functions under test AFTER the mock is registered.
let fetchAdminUserStats, fetchPlatformStats, fetchSignupCounts, updateUserPlan;

beforeEach(async () => {
  vi.resetModules();
  // Re-import after reset to pick up fresh mock state
  const mod = await import('../../src/db/models.js');
  fetchAdminUserStats = mod.fetchAdminUserStats;
  fetchPlatformStats  = mod.fetchPlatformStats;
  fetchSignupCounts   = mod.fetchSignupCounts;
  updateUserPlan      = mod.updateUserPlan;
});

// ── fetchAdminUserStats ───────────────────────────────────────────────────────
describe('fetchAdminUserStats', () => {
  it('returns normalised user stats from RPC response', async () => {
    const { supabase } = await import('../../src/db/supabase.js');
    supabase.rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'uuid-1', email: 'alice@example.com', role: 'user', plan: 'free',
          suspended: false, signup_at: '2026-05-01T00:00:00Z',
          last_active_at: '2026-05-22T00:00:00Z',
          model_count: 3, run_count: 15, runs_last_30d: 10,
        },
        {
          id: 'uuid-2', email: 'bob@example.com', role: 'admin', plan: 'pro',
          suspended: false, signup_at: '2026-04-01T00:00:00Z',
          last_active_at: null,
          model_count: 0, run_count: 0, runs_last_30d: 0,
        },
      ],
      error: null,
    });

    const stats = await fetchAdminUserStats();

    expect(stats).toHaveLength(2);

    const alice = stats.find(u => u.id === 'uuid-1');
    expect(alice).toBeDefined();
    expect(alice.email).toBe('alice@example.com');
    expect(alice.role).toBe('user');
    expect(alice.plan).toBe('free');
    expect(alice.suspended).toBe(false);
    expect(alice.signupAt).toBe('2026-05-01T00:00:00Z');
    expect(alice.lastActiveAt).toBe('2026-05-22T00:00:00Z');
    expect(alice.modelCount).toBe(3);
    expect(alice.runCount).toBe(15);
    expect(alice.runsLast30d).toBe(10);
    expect(alice.isAdmin).toBe(false);

    const bob = stats.find(u => u.id === 'uuid-2');
    expect(bob.isAdmin).toBe(true);
    expect(bob.plan).toBe('pro');
    expect(bob.lastActiveAt).toBeNull();
  });

  it('defaults plan to "free" when RPC returns null plan', async () => {
    const { supabase } = await import('../../src/db/supabase.js');
    supabase.rpc.mockResolvedValueOnce({
      data: [{ id: 'x', email: 'x@x.com', role: 'user', plan: null,
               suspended: false, signup_at: null, last_active_at: null,
               model_count: null, run_count: null, runs_last_30d: null }],
      error: null,
    });

    const stats = await fetchAdminUserStats();
    expect(stats[0].plan).toBe('free');
    expect(stats[0].modelCount).toBe(0);
    expect(stats[0].runCount).toBe(0);
    expect(stats[0].runsLast30d).toBe(0);
  });

  it('throws when RPC returns an error', async () => {
    const { supabase } = await import('../../src/db/supabase.js');
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied: admin only' } });
    await expect(fetchAdminUserStats()).rejects.toMatchObject({ message: 'permission denied: admin only' });
  });
});

// ── fetchPlatformStats ────────────────────────────────────────────────────────
describe('fetchPlatformStats', () => {
  it('returns raw stats object from RPC', async () => {
    const { supabase } = await import('../../src/db/supabase.js');
    const mockStats = { total_users: 42, active_7d: 10, active_30d: 25, total_models: 100 };
    supabase.rpc.mockResolvedValueOnce({ data: mockStats, error: null });

    const stats = await fetchPlatformStats();
    expect(stats).toEqual(mockStats);
  });

  it('returns empty object when data is null', async () => {
    const { supabase } = await import('../../src/db/supabase.js');
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    const stats = await fetchPlatformStats();
    expect(stats).toEqual({});
  });

  it('throws when RPC returns an error', async () => {
    const { supabase } = await import('../../src/db/supabase.js');
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'admin only' } });
    await expect(fetchPlatformStats()).rejects.toMatchObject({ message: 'admin only' });
  });
});

// ── fetchSignupCounts ─────────────────────────────────────────────────────────
describe('fetchSignupCounts', () => {
  it('returns normalised day/count pairs', async () => {
    const { supabase } = await import('../../src/db/supabase.js');
    supabase.rpc.mockResolvedValueOnce({
      data: [
        { day: '2026-05-01', count: '3' },
        { day: '2026-05-02', count: '1' },
      ],
      error: null,
    });

    const counts = await fetchSignupCounts(30);
    expect(counts).toHaveLength(2);
    expect(counts[0]).toEqual({ day: '2026-05-01', count: 3 });
    expect(counts[1]).toEqual({ day: '2026-05-02', count: 1 });
  });

  it('returns empty array when data is null or empty', async () => {
    const { supabase } = await import('../../src/db/supabase.js');
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    const counts = await fetchSignupCounts(30);
    expect(counts).toEqual([]);
  });
});

// ── updateUserPlan ────────────────────────────────────────────────────────────
describe('updateUserPlan', () => {
  it('calls supabase update with correct plan value', async () => {
    const { supabase } = await import('../../src/db/supabase.js');
    // Reset the chain mock to track calls
    const updateMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    supabase.from.mockReturnValueOnce({ update: updateMock, eq: eqMock });
    updateMock.mockReturnValue({ eq: eqMock });

    await updateUserPlan('user-uuid', 'pro');

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(updateMock).toHaveBeenCalledWith({ plan: 'pro' });
    expect(eqMock).toHaveBeenCalledWith('id', 'user-uuid');
  });

  it('throws when update returns an error', async () => {
    const { supabase } = await import('../../src/db/supabase.js');
    const eqMock = vi.fn().mockResolvedValue({ error: { message: 'update failed' } });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    supabase.from.mockReturnValueOnce({ update: updateMock });

    await expect(updateUserPlan('x', 'pro')).rejects.toMatchObject({ message: 'update failed' });
  });
});
