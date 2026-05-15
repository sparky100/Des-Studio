import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeProfile,
  suspendUser,
  unsuspendUser,
  logAdminAction,
  fetchAuditLog,
} from '../../src/db/models.js';
import { supabase } from '../../src/db/supabase.js';

describe('normalizeProfile — suspended field', () => {
  it('defaults suspended to false when absent', () => {
    expect(normalizeProfile({ id: 'u1', role: 'user' }).suspended).toBe(false);
  });

  it('preserves suspended:true', () => {
    expect(normalizeProfile({ id: 'u1', role: 'user', suspended: true }).suspended).toBe(true);
  });

  it('preserves suspended:false', () => {
    expect(normalizeProfile({ id: 'u1', role: 'user', suspended: false }).suspended).toBe(false);
  });
});

describe('suspendUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates profiles.suspended to true and sets suspended_at', async () => {
    supabase.from('profiles').update.mockReturnThis();
    supabase.from('profiles').update().eq.mockResolvedValue({ error: null });
    await suspendUser('user-123');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(supabase.from('profiles').update).toHaveBeenCalledWith(
      expect.objectContaining({ suspended: true, suspended_at: expect.any(String) })
    );
  });

  it('throws on DB error', async () => {
    supabase.from('profiles').update.mockReturnThis();
    supabase.from('profiles').update().eq.mockResolvedValue({ error: { message: 'DB error' } });
    await expect(suspendUser('user-123')).rejects.toThrow('DB error');
  });
});

describe('unsuspendUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets suspended to false and clears suspended_at', async () => {
    supabase.from('profiles').update.mockReturnThis();
    supabase.from('profiles').update().eq.mockResolvedValue({ error: null });
    await unsuspendUser('user-123');
    expect(supabase.from('profiles').update).toHaveBeenCalledWith(
      expect.objectContaining({ suspended: false, suspended_at: null })
    );
  });
});

describe('logAdminAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the log_admin_action RPC with correct params', async () => {
    supabase.rpc.mockResolvedValue({ error: null });
    await logAdminAction('promote', 'target-id', null, 'user', 'admin');
    expect(supabase.rpc).toHaveBeenCalledWith('log_admin_action', {
      p_action:     'promote',
      p_target_id:  'target-id',
      p_target_key: null,
      p_old_value:  'user',
      p_new_value:  'admin',
    });
  });

  it('converts numeric values to strings', async () => {
    supabase.rpc.mockResolvedValue({ error: null });
    await logAdminAction('update_config', null, 'maxReplications', 50, 100);
    expect(supabase.rpc).toHaveBeenCalledWith('log_admin_action', expect.objectContaining({
      p_old_value: '50',
      p_new_value: '100',
    }));
  });

  it('throws on RPC error', async () => {
    supabase.rpc.mockResolvedValue({ error: { message: 'RPC failed' } });
    await expect(logAdminAction('suspend', 'uid')).rejects.toThrow('RPC failed');
  });
});

describe('fetchAuditLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns normalized audit entries', async () => {
    supabase.from('admin_audit_log').select.mockReturnThis();
    supabase.from('admin_audit_log').select().order.mockReturnThis();
    supabase.from('admin_audit_log').select().order().limit.mockResolvedValue({
      data: [{
        id: 'log-1', actor_id: 'admin-1', action: 'promote', target_id: 'user-1',
        target_key: null, old_value: 'user', new_value: 'admin', created_at: '2026-05-15T10:00:00Z',
      }],
      error: null,
    });
    const log = await fetchAuditLog(10);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      id: 'log-1', actorId: 'admin-1', action: 'promote',
      targetId: 'user-1', oldValue: 'user', newValue: 'admin',
    });
  });

  it('returns empty array when no entries', async () => {
    supabase.from('admin_audit_log').select.mockReturnThis();
    supabase.from('admin_audit_log').select().order.mockReturnThis();
    supabase.from('admin_audit_log').select().order().limit.mockResolvedValue({ data: [], error: null });
    const log = await fetchAuditLog();
    expect(log).toEqual([]);
  });
});
