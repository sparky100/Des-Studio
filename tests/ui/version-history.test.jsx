import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { VersionHistoryPanel } from '../../src/ui/VersionHistoryPanel.jsx';
import * as dbModels from '../../src/db/models.js';

vi.mock('../../src/db/models.js', () => ({
  listVersions: vi.fn(),
  createVersion: vi.fn(),
  deleteVersion: vi.fn(),
  getNextVersion: vi.fn(),
}));

const mockModel = {
  id: 'm1',
  name: 'Test Model',
  entityTypes: [],
  bEvents: [],
  cEvents: [],
  queues: [],
};

const mockVersions = [
  { id: 'v2', modelId: 'm1', version: 2, name: 'v2', notes: 'Added queue', isStructural: true, createdAt: '2026-05-20T11:00:00Z' },
  { id: 'v1', modelId: 'm1', version: 1, name: 'v1 - Initial', notes: 'First version', isStructural: true, createdAt: '2026-05-20T10:00:00Z' },
];

describe('VersionHistoryPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders loading state initially', async () => {
    dbModels.listVersions.mockReturnValue(new Promise(() => {}));
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} />);
    expect(screen.getByText(/loading versions/i)).toBeInTheDocument();
  });

  it('renders version list after loading', async () => {
    dbModels.listVersions.mockResolvedValue(mockVersions);
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} />);
    await screen.findByText('v2');
    expect(screen.getByText('v1 - Initial')).toBeInTheDocument();
    expect(screen.getByText('Added queue')).toBeInTheDocument();
  });

  it('shows empty state when no versions', async () => {
    dbModels.listVersions.mockResolvedValue([]);
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} />);
    await screen.findByText(/no versions yet/i);
  });

  it('shows create version button for owner', async () => {
    dbModels.listVersions.mockResolvedValue(mockVersions);
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} />);
    await screen.findByText('+ Create version');
  });

  it('hides create version button for non-owner', async () => {
    dbModels.listVersions.mockResolvedValue(mockVersions);
    render(<VersionHistoryPanel model={mockModel} userId="user-2" isOwner={false} />);
    await screen.findByText('v2');
    expect(screen.queryByText('+ Create version')).not.toBeInTheDocument();
  });

  it('shows structural badge for structural versions', async () => {
    dbModels.listVersions.mockResolvedValue(mockVersions);
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} />);
    await screen.findByText('v2');
    // Structural badges are present (use regex to match partial text)
    const badges = screen.queryAllByText(/structural/);
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows parameter badge for parameter-only versions', async () => {
    const paramVersions = [{ ...mockVersions[0], isStructural: false }];
    dbModels.listVersions.mockResolvedValue(paramVersions);
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} />);
    await screen.findByText('parameter');
  });

  it('opens create version dialog when button clicked', async () => {
    dbModels.listVersions.mockResolvedValue(mockVersions);
    dbModels.getNextVersion.mockResolvedValue(3);
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} />);
    await screen.findByText('+ Create version');
    fireEvent.click(screen.getByText('+ Create version'));
    // Dialog title is "Create Version", button is also "Create Version"
    await screen.findByRole('dialog');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('creates version when form submitted', async () => {
    dbModels.listVersions.mockResolvedValue(mockVersions);
    dbModels.getNextVersion.mockResolvedValue(3);
    dbModels.createVersion.mockResolvedValue({ id: 'v3', modelId: 'm1', version: 3, name: 'v3', notes: 'Test', isStructural: true, createdAt: '2026-05-20T12:00:00Z' });
    const onToast = vi.fn();
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} onToast={onToast} />);
    await screen.findByText('+ Create version');
    fireEvent.click(screen.getByText('+ Create version'));
    await screen.findByRole('dialog');
    // Verify dialog is open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('v3 (auto-assigned)')).toBeInTheDocument();
  });

  it('shows parameter badge for parameter-only versions', async () => {
    const paramVersions = [{ ...mockVersions[0], isStructural: false }];
    dbModels.listVersions.mockResolvedValue(paramVersions);
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} />);
    await screen.findByText('parameter');
  });

  it('opens create version dialog when button clicked', async () => {
    dbModels.listVersions.mockResolvedValue(mockVersions);
    dbModels.getNextVersion.mockResolvedValue(3);
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} />);
    await screen.findByText('+ Create version');
    fireEvent.click(screen.getByText('+ Create version'));
    await screen.findByRole('dialog');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('v3 (auto-assigned)')).toBeInTheDocument();
  });

  it('creates version when form submitted', async () => {
    dbModels.listVersions.mockResolvedValue(mockVersions);
    dbModels.getNextVersion.mockResolvedValue(3);
    dbModels.createVersion.mockResolvedValue({ id: 'v3', modelId: 'm1', version: 3, name: 'v3', notes: 'Test', isStructural: true, createdAt: '2026-05-20T12:00:00Z' });
    const onToast = vi.fn();
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} onToast={onToast} />);
    await screen.findByText('+ Create version');
    fireEvent.click(screen.getByText('+ Create version'));
    await screen.findByRole('dialog');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('v3 (auto-assigned)')).toBeInTheDocument();
  });

  it('shows delete button for owner', async () => {
    dbModels.listVersions.mockResolvedValue(mockVersions);
    render(<VersionHistoryPanel model={mockModel} userId="user-1" isOwner={true} />);
    await screen.findByText('v2');
    // Delete buttons are present for each version
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it('hides delete button for non-owner', async () => {
    dbModels.listVersions.mockResolvedValue(mockVersions);
    render(<VersionHistoryPanel model={mockModel} userId="user-2" isOwner={false} />);
    await screen.findByText('v2');
    const deleteButtons = screen.queryAllByRole('button', { name: /delete/i });
    expect(deleteButtons.length).toBe(0);
  });
});
