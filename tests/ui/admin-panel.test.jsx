import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminPanel } from '../../src/ui/AdminPanel.jsx';

vi.mock('../../src/db/models.js', () => ({
  getPlatformConfig: vi.fn().mockResolvedValue(null),
  setPlatformConfig: vi.fn().mockResolvedValue({ ok: true }),
  fetchAllUsers: vi.fn().mockResolvedValue([
    { id: 'user-1', full_name: 'Alice', role: 'user', isAdmin: false, suspended: false },
    { id: 'admin-1', full_name: 'Bob',   role: 'admin', isAdmin: true,  suspended: false },
    { id: 'user-2', full_name: 'Carol', role: 'user', isAdmin: false, suspended: true  },
  ]),
  updateUserRole: vi.fn().mockResolvedValue({ ok: true }),
  suspendUser:    vi.fn().mockResolvedValue({ ok: true }),
  unsuspendUser:  vi.fn().mockResolvedValue({ ok: true }),
  logAdminAction: vi.fn().mockResolvedValue({ ok: true }),
  fetchAuditLog:  vi.fn().mockResolvedValue([
    { id: 'log-1', actorId: 'admin-1', action: 'promote', targetId: 'user-1',
      targetKey: null, oldValue: 'user', newValue: 'admin', createdAt: '2026-05-15T10:00:00Z' },
  ]),
}));

const defaultProps = { userId: 'admin-1', isAdmin: true, onClose: vi.fn() };

describe('AdminPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders all four tabs', async () => {
    render(<AdminPanel {...defaultProps} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /LLM Provider/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Platform Limits/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Users/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Audit Log/i })).toBeInTheDocument();
  });

  it('users tab shows Suspend button for active users and Unsuspend for suspended ones', async () => {
    render(<AdminPanel {...defaultProps} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Users/i }));
    expect(screen.getAllByRole('button', { name: /Suspend/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Unsuspend/i })).toBeInTheDocument();
  });

  it('Suspend button calls suspendUser and logAdminAction', async () => {
    const { suspendUser, logAdminAction } = await import('../../src/db/models.js');
    render(<AdminPanel {...defaultProps} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Users/i }));
    const suspendBtns = screen.getAllByRole('button', { name: /^Suspend$/i });
    fireEvent.click(suspendBtns[0]);
    await waitFor(() => expect(suspendUser).toHaveBeenCalled());
    expect(logAdminAction).toHaveBeenCalledWith('suspend', expect.any(String));
  });

  it('Unsuspend button calls unsuspendUser and logAdminAction', async () => {
    const { unsuspendUser, logAdminAction } = await import('../../src/db/models.js');
    render(<AdminPanel {...defaultProps} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Users/i }));
    fireEvent.click(screen.getByRole('button', { name: /Unsuspend/i }));
    await waitFor(() => expect(unsuspendUser).toHaveBeenCalled());
    expect(logAdminAction).toHaveBeenCalledWith('unsuspend', expect.any(String));
  });

  it('admin cannot suspend themselves', async () => {
    render(<AdminPanel {...defaultProps} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Users/i }));
    // 3 users: Alice (active), Bob=admin-1 (current user, no actions), Carol (suspended)
    // Only Alice gets a Suspend button; Carol gets Unsuspend; Bob gets nothing
    const suspendBtns = screen.getAllByRole('button', { name: /^Suspend$/i });
    expect(suspendBtns).toHaveLength(1); // Alice only — current user excluded
  });

  it('audit log tab renders log entries', async () => {
    render(<AdminPanel {...defaultProps} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Audit Log/i }));
    expect(screen.getByText('promote')).toBeInTheDocument();
    expect(screen.getByText('user → admin')).toBeInTheDocument();
  });

  it('role change logs the action', async () => {
    const { updateUserRole, logAdminAction } = await import('../../src/db/models.js');
    render(<AdminPanel {...defaultProps} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Users/i }));
    const promoteBtn = screen.getAllByRole('button', { name: /Promote/i })[0];
    fireEvent.click(promoteBtn);
    await waitFor(() => expect(updateUserRole).toHaveBeenCalled());
    expect(logAdminAction).toHaveBeenCalledWith('promote', expect.any(String), null, expect.any(String), 'admin');
  });
});
