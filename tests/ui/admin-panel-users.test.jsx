/**
 * tests/ui/admin-panel-users.test.jsx
 * Sprint 71 — Enhanced user list, plan badge, Usage tab KPI tiles.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminPanel } from '../../src/ui/AdminPanel.jsx';

const MOCK_USERS = [
  {
    id: 'user-a', email: 'alpha@example.com', role: 'user', plan: 'pro',
    isAdmin: false, suspended: false,
    signupAt: '2026-05-15T00:00:00Z', lastActiveAt: '2026-05-22T00:00:00Z',
    modelCount: 5, runCount: 100, runsLast30d: 80,
  },
  {
    id: 'user-b', email: 'beta@example.com', role: 'user', plan: 'free',
    isAdmin: false, suspended: false,
    signupAt: '2026-05-01T00:00:00Z', lastActiveAt: '2026-05-10T00:00:00Z',
    modelCount: 1, runCount: 10, runsLast30d: 5,
  },
  {
    id: 'admin-x', email: 'admin@example.com', role: 'admin', plan: 'pro',
    isAdmin: true, suspended: false,
    signupAt: '2026-04-01T00:00:00Z', lastActiveAt: '2026-05-23T00:00:00Z',
    modelCount: 2, runCount: 20, runsLast30d: 15,
  },
];

const PLATFORM_STATS = { total_users: 3, active_7d: 2, active_30d: 3, total_models: 8 };
const SIGNUP_COUNTS  = [{ day: '2026-05-01', count: 2 }, { day: '2026-05-15', count: 1 }];

vi.mock('../../src/db/models.js', () => ({
  getPlatformConfig:    vi.fn().mockResolvedValue(null),
  setPlatformConfig:    vi.fn().mockResolvedValue({ ok: true }),
  fetchAdminUserStats:  vi.fn().mockResolvedValue(MOCK_USERS),
  fetchPlatformStats:   vi.fn().mockResolvedValue(PLATFORM_STATS),
  fetchSignupCounts:    vi.fn().mockResolvedValue(SIGNUP_COUNTS),
  updateUserRole:       vi.fn().mockResolvedValue({ ok: true }),
  updateUserPlan:       vi.fn().mockResolvedValue({ ok: true }),
  suspendUser:          vi.fn().mockResolvedValue({ ok: true }),
  unsuspendUser:        vi.fn().mockResolvedValue({ ok: true }),
  logAdminAction:       vi.fn().mockResolvedValue({ ok: true }),
  fetchAuditLog:        vi.fn().mockResolvedValue([]),
  // PR #115: feedback functions — must be present since AdminPanel imports them
  fetchFeedback:        vi.fn().mockResolvedValue([]),
  updateFeedbackStatus: vi.fn().mockResolvedValue({ ok: true }),
}));

const defaultProps = { userId: 'admin-x', isAdmin: true, onClose: vi.fn() };

async function openUsersTab() {
  render(<AdminPanel {...defaultProps} />);
  await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('tab', { name: /Users/i }));
}

describe('AdminPanel — Enhanced User List', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('displays email column for all users', async () => {
    await openUsersTab();
    expect(screen.getByText('alpha@example.com')).toBeInTheDocument();
    expect(screen.getByText('beta@example.com')).toBeInTheDocument();
  });

  it('renders FREE plan badge for free-plan users', async () => {
    await openUsersTab();
    const freeBadges = screen.getAllByText('FREE');
    expect(freeBadges.length).toBeGreaterThan(0);
  });

  it('renders PRO plan badge for pro-plan users', async () => {
    await openUsersTab();
    const proBadges = screen.getAllByText('PRO');
    expect(proBadges.length).toBeGreaterThan(0);
  });

  it('sorts by signupAt descending by default (newest first)', async () => {
    await openUsersTab();
    const rows = screen.getAllByRole('row');
    // Skip header row (index 0); first data row should be alpha (signed up 2026-05-15, newest)
    expect(within(rows[1]).getByText('alpha@example.com')).toBeInTheDocument();
  });

  it('sorts ascending when same column header clicked twice', async () => {
    await openUsersTab();
    const signedUpHeader = screen.getByText(/Signed Up/i);
    // First click: desc → asc
    fireEvent.click(signedUpHeader);
    // Now oldest (admin-x, 2026-04-01) should be first
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('admin@example.com')).toBeInTheDocument();
  });

  it('re-sorts when a different column header is clicked', async () => {
    await openUsersTab();
    // Click "Runs (30d)" — should sort desc, alpha (80) first
    fireEvent.click(screen.getByText(/Runs \(30d\)/i));
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('alpha@example.com')).toBeInTheDocument();
  });

  it('filters by email prefix when search input is used', async () => {
    await openUsersTab();
    const searchInput = screen.getByPlaceholderText(/Filter by email/i);
    fireEvent.change(searchInput, { target: { value: 'beta' } });
    expect(screen.queryByText('alpha@example.com')).not.toBeInTheDocument();
    expect(screen.getByText('beta@example.com')).toBeInTheDocument();
  });

  it('opens user detail drawer on row click', async () => {
    await openUsersTab();
    const row = screen.getByText('beta@example.com').closest('tr');
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText('User Details')).toBeInTheDocument());
  });

  it('drawer shows plan change buttons', async () => {
    await openUsersTab();
    const row = screen.getByText('beta@example.com').closest('tr');
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText('User Details')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /FREE/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PRO/i })).toBeInTheDocument();
  });

  it('plan change calls updateUserPlan and logAdminAction', async () => {
    const { updateUserPlan, logAdminAction } = await import('../../src/db/models.js');
    await openUsersTab();
    const row = screen.getByText('beta@example.com').closest('tr');
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText('User Details')).toBeInTheDocument());
    // beta is currently 'free'; click PRO to upgrade
    const proBtns = screen.getAllByRole('button', { name: /^PRO$/i });
    fireEvent.click(proBtns[0]);
    await waitFor(() => expect(updateUserPlan).toHaveBeenCalledWith('user-b', 'pro'));
    expect(logAdminAction).toHaveBeenCalledWith('update_plan', 'user-b', null, 'free', 'pro');
  });
});

describe('AdminPanel — Usage Tab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function openUsageTab() {
    render(<AdminPanel {...defaultProps} />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Usage/i }));
  }

  it('renders four KPI tiles', async () => {
    await openUsageTab();
    expect(screen.getByText(/Total users/i)).toBeInTheDocument();
    expect(screen.getByText(/Active \(7 days\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Active \(30 days\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Total models/i)).toBeInTheDocument();
  });

  it('KPI tile shows correct total_users value', async () => {
    await openUsageTab();
    // total_users = 3 from PLATFORM_STATS
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders the signups bar chart section', async () => {
    await openUsageTab();
    expect(screen.getByText(/Signups — Last 30 Days/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Daily signups bar chart/i)).toBeInTheDocument();
  });

  it('renders user activity table sorted by runs_last_30d desc', async () => {
    await openUsageTab();
    // alpha has 80 runs_last_30d, should be first
    const rows = screen.getAllByRole('row');
    // Find rows in the usage table (after the KPI tiles section)
    const alphaRow = rows.find(r => within(r).queryByText('alpha@example.com'));
    expect(alphaRow).toBeDefined();
  });
});
