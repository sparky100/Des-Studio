// The public routes (ADR-025) — the part that makes Flow's publishing
// reachable.
//
// The whole point of publishing is that a STRANGER can reach it. So the
// assertion that matters is not "the public page renders" but "the public
// page renders WITHOUT a session" — the sign-in form must not be in the way.
//
// The existing public route (`#share/<token>`) already works this way; the
// published routes join it. The private routes (`#model/<id>`) must NOT
// change.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchModels = vi.hoisted(() => vi.fn());
const mockFetchProfiles = vi.hoisted(() => vi.fn());
const mockSaveModel = vi.hoisted(() => vi.fn());
const mockFetchPublishedModel = vi.hoisted(() => vi.fn());
const mockFetchPublishedModelList = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', async () => ({
  ...await vi.importActual('../../src/db/models.js'),
  fetchModels: mockFetchModels,
  fetchProfiles: mockFetchProfiles,
  fetchRunStatsForModels: vi.fn().mockResolvedValue({}),
  saveModel: mockSaveModel,
  deleteModel: vi.fn(),
  setVisibility: vi.fn(),
  setAccess: vi.fn(),
  forkModel: vi.fn(),
  getPlatformConfig: vi.fn(() => Promise.resolve(null)),
  fetchModelSchedules: vi.fn().mockResolvedValue([]),
  fetchUserSettings: vi.fn().mockResolvedValue({ settings: {} }),
  updateModelTags: vi.fn(),
  validateDbSchema: vi.fn(),
  getNextVersion: vi.fn(),
  listVersions: vi.fn().mockResolvedValue([]),
  getShareLink: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/db/published.js', async () => {
  const actual = await vi.importActual('../../src/db/published.js');
  return {
    ...actual,
    fetchPublishedModel: mockFetchPublishedModel,
    fetchPublishedModelList: mockFetchPublishedModelList,
  };
});

import App from '../../src/App.jsx';
vi.mock('../../src/ui/ModelDetail.jsx', () => ({
  ModelDetail: () => <div>Copied model workspace</div>,
}));
import { supabase } from '../../src/db/supabase.js';

const setHash = hash => { window.history.replaceState(null, "", window.location.pathname + hash); };

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  setHash('');
  mockFetchModels.mockResolvedValue([]);
  mockFetchProfiles.mockResolvedValue([]);
  mockFetchPublishedModel.mockResolvedValue({
    model_id: 'm1',
    title: 'A published model',
    summary: 'A summary',
    description: '',
    category: 'healthcare',
    licence: 'cc-by-4.0',
    author: 'A Consultant',
    released_version: 1,
    release_notes: '',
    show_evidence_register: false,
    exposed_params: [],
    published_at: '2026-10-01T00:00:00.000Z',
    model: { entityTypes: [], stateVariables: [], queues: [], bEvents: [], cEvents: [] },
    schedules: [],
    registers: null,
  });
  mockFetchPublishedModelList.mockResolvedValue([]);
  // No session: a signed-out visitor.
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  supabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

describe('public routes', () => {
  it('serves a published model to a signed-out visitor', async () => {
    setHash('#/published/m1');
    render(<App />);

    expect(await screen.findByText('A published model')).toBeInTheDocument();
    // The sign-in form must not be in the way.
    expect(screen.queryByText(/sign in to build, run, and share models/i)).not.toBeInTheDocument();
  });

  it('serves the gallery to a signed-out visitor', async () => {
    setHash('#/published');
    render(<App />);

    expect(await screen.findByText(/published models/i)).toBeInTheDocument();
    expect(screen.queryByText(/sign in to build, run, and share models/i)).not.toBeInTheDocument();
  });

  it('still asks a signed-out visitor to sign in for a private model link', async () => {
    setHash('#model/m1');
    render(<App />);

    // The `#model/<id>` route is a different thing: it opens the model in the
    // app, and it needs an account.
    expect(await screen.findByText(/sign in to build, run, and share models/i, {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('still serves a shared run dashboard to a signed-out visitor', async () => {
    setHash('#share/token-123');
    render(<App />);

    // The existing public route keeps working — the published routes join it
    // rather than replacing it.
    await waitFor(() => {
      expect(screen.queryByText(/sign in to build, run, and share models/i)).not.toBeInTheDocument();
    }, { timeout: 5000 });
  });
});

describe('taking a copy of a published model', () => {
  it('makes a copied timetable independent of the publisher', async () => {
    mockFetchPublishedModel.mockResolvedValue({
      title: 'Supplier',
      model: { bEvents: [{ id: 'arrival', schedules: [{ dist: 'Schedule', scheduleRef: 'owner-timetable' }] }] },
      schedules: [{ id: 'owner-timetable', scheduleJson: [{ eventId: 'arrival', rows: [{ time: 2 }] }] }],
    });
    mockSaveModel.mockResolvedValue({ id: 'copy-1' });
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    setHash('#model/m1');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /copy & open/i }, { timeout: 8000 }));
    expect(await screen.findByText('Copied model workspace')).toBeInTheDocument();
    const schedule = mockSaveModel.mock.calls[0][0].bEvents[0].schedules[0];
    expect(schedule.rows).toEqual([{ time: 2 }]);
    expect(schedule.scheduleRef).toBeUndefined();
  });
  it('offers a copy when the model is not in the visitor\'s own library', async () => {
    // Publishing is independent of `visibility` (ADR-022), so a published
    // model is not necessarily in the community list either. Without the copy
    // path, "Open in Flow" on such a model would silently do nothing.
    mockFetchModels.mockResolvedValue([]);
    mockFetchPublishedModel.mockResolvedValue({
      model_id: 'm1',
      title: 'A published model',
      summary: 'A summary',
      model: { entityTypes: [], stateVariables: [], queues: [], bEvents: [], cEvents: [] },
      schedules: [],
      registers: null,
    });
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });

    setHash('#model/m1');
    render(<App />);

    expect(await screen.findByText(/copy this published model/i, {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('copies a published model into the visitor\'s own library', async () => {
    mockFetchModels.mockResolvedValue([]);
    mockFetchPublishedModel.mockResolvedValue({
      model_id: 'm1',
      title: 'A published model',
      summary: 'A summary',
      model: { entityTypes: [], stateVariables: [], queues: [], bEvents: [], cEvents: [] },
      schedules: [],
      registers: {
        evidence: [{ id: 'ev1', description: 'A source' }],
        assumptions: [],
        backingLinks: [],
      },
    });
    mockSaveModel.mockResolvedValue({ id: 'copy-1' });
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });

    setHash('#model/m1');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /copy & open/i }, { timeout: 8000 }));
    await waitFor(() => expect(mockSaveModel).toHaveBeenCalled());
    const saved = mockSaveModel.mock.calls[0][0];
    expect(saved.name).toBe('A published model');
    expect(saved.visibility).toBe('private');
    expect(saved.access).toEqual({});
    expect(saved.id).toBeUndefined();
  });
});
