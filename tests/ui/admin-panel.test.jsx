import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminPanel } from '../../src/ui/AdminPanel.jsx';

// vi.hoisted ensures these values are available when vi.mock factory is called
// (vi.mock is hoisted before variable declarations; vi.hoisted is hoisted before vi.mock)
const { MOCK_USERS } = vi.hoisted(() => ({
  MOCK_USERS: [
    { id: 'user-1', email: 'alice@example.com', role: 'user', plan: 'free',
      isAdmin: false, suspended: false,
      signupAt: '2026-05-01T00:00:00Z', lastActiveAt: '2026-05-20T00:00:00Z',
      modelCount: 2, runCount: 5, runsLast30d: 3 },
    { id: 'admin-1', email: 'bob@example.com', role: 'admin', plan: 'pro',
      isAdmin: true, suspended: false,
      signupAt: '2026-04-01T00:00:00Z', lastActiveAt: '2026-05-22T00:00:00Z',
      modelCount: 1, runCount: 10, runsLast30d: 5 },
    { id: 'user-2', email: 'carol@example.com', role: 'user', plan: 'free',
      isAdmin: false, suspended: true,
      signupAt: '2026-05-10T00:00:00Z', lastActiveAt: null,
      modelCount: 0, runCount: 0, runsLast30d: 0 },
  ],
}));

vi.mock('../../src/db/models.js', () => ({
  getPlatformConfig:    vi.fn().mockResolvedValue(null),
  setPlatformConfig:    vi.fn().mockResolvedValue({ ok: true }),
  fetchAdminUserStats:  vi.fn().mockResolvedValue(MOCK_USERS),
  fetchPlatformStats:   vi.fn().mockResolvedValue({ total_users: 3, active_7d: 2, active_30d: 3, total_models: 3 }),
  fetchSignupCounts:    vi.fn().mockResolvedValue([
    { day: '2026-05-01', count: 1 },
    { day: '2026-05-10', count: 1 },
    { day: '2026-05-15', count: 1 },
  ]),
  updateUserRole:       vi.fn().mockResolvedValue({ ok: true }),
  updateUserPlan:       vi.fn().mockResolvedValue({ ok: true }),
  suspendUser:          vi.fn().mockResolvedValue({ ok: true }),
  unsuspendUser:        vi.fn().mockResolvedValue({ ok: true }),
  logAdminAction:       vi.fn().mockResolvedValue({ ok: true }),
  fetchAuditLog:        vi.fn().mockResolvedValue([
    { id: 'log-1', actorId: 'admin-1', action: 'promote', targetId: 'user-1',
      targetKey: null, oldValue: 'user', newValue: 'admin', createdAt: '2026-05-15T10:00:00Z' },
  ]),
  // PR #115: feedback functions
  fetchFeedback:        vi.fn().mockResolvedValue([
    { id: 'fb-1', category: 'bug', message: 'Something is broken', userId: 'user-1',
      appVersion: '0.9.0', pageContext: 'model-detail', status: 'new', createdAt: '2026-05-20T10:00:00Z' },
  ]),
  updateFeedbackStatus: vi.fn().mockResolvedValue({ ok: true }),
}));

const defaultProps = { userId: 'admin-1', isAdmin: true, onClose: vi.fn() };

describe('AdminPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders all six tabs (LLM, Limits, Users, Usage, Feedback, Audit Log)', async () => {
    render(<AdminPanel {...defaultProps} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /LLM Provider/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Platform Limits/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Users/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Usage/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Feedback/i })).toBeInTheDocument();
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
    // admin-1 is currentUser — no Suspend button for them
    // alice (user-1) gets Suspend; carol (user-2) gets Unsuspend; bob (admin-1) = current user → no action
    const suspendBtns = screen.getAllByRole('button', { name: /^Suspend$/i });
    expect(suspendBtns).toHaveLength(1); // alice only
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
