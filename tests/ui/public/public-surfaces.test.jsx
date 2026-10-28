// The public surfaces (ADR-025) — a published model's page and the gallery.
//
// These are the surfaces a SIGNED-OUT visitor sees, so the tests care about
// three things above all: that a published model is reachable, that its
// provenance is shown (the thing no competitor publishes), and that an
// unavailable model gives no clue whether it exists.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const published = vi.hoisted(() => ({
  fetchPublishedModel: vi.fn(),
  fetchPublishedModelList: vi.fn(),
  buildPublishedSchedulesMap: vi.fn(() => ({})),
}));

vi.mock('../../../src/db/published.js', async () => {
  const actual = await vi.importActual('../../../src/db/published.js');
  return { ...actual, ...published };
});

import { PublicModelPage } from '../../../src/ui/public/PublicModelPage.jsx';
import { PublicGallery } from '../../../src/ui/public/PublicGallery.jsx';

const modelJson = {
  schemaVersion: 1,
  entityTypes: [
    { id: 'et_srv', name: 'Consultant', role: 'server', count: 3, attrDefs: [] },
    { id: 'et_cust', name: 'Patient', role: 'customer', count: 0, attrDefs: [] },
  ],
  stateVariables: [],
  queues: [{ id: 'q1', name: 'Waiting Room', customerType: 'Patient', discipline: 'FIFO' }],
  bEvents: [{ id: 'b1', name: 'Patient Arrives', effect: ['ARRIVE(Patient, Waiting Room)'], schedules: [] }],
  cEvents: [],
  containerTypes: [],
  distances: [],
  skills: [],
  goals: [],
  dataSources: [],
  sections: [],
  graph: null,
  experimentDefaults: { maxSimTime: 100, warmupPeriod: 0, replications: 3 },
  timeUnit: 'minutes',
  epoch: null,
};

const payload = {
  model_id: 'm1',
  title: 'A&E department, 24 hours',
  summary: 'Queueing model of a 24-hour A&E department.',
  description: 'Models the arrival of patients to an A&E department and their progress through triage, treatment and discharge.',
  category: 'healthcare',
  licence: 'cc-by-4.0',
  cover_image_url: null,
  author: 'A Consultant',
  released_version_id: 'v1',
  released_version: 3,
  release_notes: 'First public release.',
  show_evidence_register: true,
  exposed_params: [{ path: 'entityTypes.et_srv.count' }],
  published_at: '2026-10-01T00:00:00.000Z',
  model: modelJson,
  schedules: [],
  registers: {
    evidence: [
      { id: 'ev1', type: 'data', description: 'Observed triage-to-consultant intervals, Feb–Sep 2026', source: 'Outpatient extract', dateCaptured: '2026-09-30' },
    ],
    assumptions: [
      { id: 'as1', text: 'Weekend arrivals run at 40% of the weekday rate', contested: true, confidence: 0.4 },
    ],
    backingLinks: [
      { id: 'bl1', recordType: 'evidence', recordId: 'ev1', targetType: 'b_event', targetId: 'b1' },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  published.fetchPublishedModel.mockResolvedValue(payload);
  published.fetchPublishedModelList.mockResolvedValue([]);
  published.buildPublishedSchedulesMap.mockReturnValue({});
});

describe('PublicModelPage', () => {
  it('shows the published model to a visitor with no account', async () => {
    render(<PublicModelPage modelId="m1" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('A&E department, 24 hours')).toBeInTheDocument());
    expect(screen.getByText('Queueing model of a 24-hour A&E department.')).toBeInTheDocument();
    expect(screen.getAllByText(/by A Consultant/).length).toBeGreaterThan(0);
  });

  it('leads with where the numbers come from', async () => {
    render(<PublicModelPage modelId="m1" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/where the numbers come from/i)).toBeInTheDocument());
    // The coverage percentage is the headline claim.
    expect(screen.getByText(/backed by a source you can check/i)).toBeInTheDocument();
  });

  it('shows the evidence and assumption register', async () => {
    render(<PublicModelPage modelId="m1" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/the register/i)).toBeInTheDocument());
    expect(screen.getByText(/Observed triage-to-consultant intervals/)).toBeInTheDocument();
    expect(screen.getByText(/Weekend arrivals run at 40%/)).toBeInTheDocument();
    // A contested assumption is flagged, and its contestability is explained.
    expect(screen.getByText(/Contested — reasonable people could disagree/)).toBeInTheDocument();
  });

  it('hides the register when the owner kept it private', async () => {
    published.fetchPublishedModel.mockResolvedValue({ ...payload, registers: null });
    render(<PublicModelPage modelId="m1" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('A&E department, 24 hours')).toBeInTheDocument());
    expect(screen.queryByText(/the register/i)).not.toBeInTheDocument();
  });

  it('gives a citable reference', async () => {
    render(<PublicModelPage modelId="m1" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/cite this model/i)).toBeInTheDocument());
    expect(screen.getByText(/A&E department, 24 hours, release v3/)).toBeInTheDocument();
    expect(screen.getByText(/Published by A Consultant/)).toBeInTheDocument();
  });

  it('says the same thing for a model that does not exist as for one that is not published', async () => {
    published.fetchPublishedModel.mockResolvedValue(null);
    render(<PublicModelPage modelId="m1" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/isn't available/i)).toBeInTheDocument());
    // It must not say WHY — that would let a stranger probe for drafts, and
    // it must not imply the model ever existed either.
    expect(screen.queryByText(/withdrawn/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no longer be published/i)).not.toBeInTheDocument();
  });

  it('offers to run the model', async () => {
    render(<PublicModelPage modelId="m1" onBack={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /run this model/i }, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe('PublicGallery', () => {
  const row = {
    modelId: 'm1',
    title: 'A&E department, 24 hours',
    summary: 'Queueing model of a 24-hour A&E department.',
    category: 'healthcare',
    licence: 'cc-by-4.0',
    coverImageUrl: null,
    author: 'A Consultant',
    publishedAt: '2026-10-01T00:00:00.000Z',
  };

  it('lists published models', async () => {
    published.fetchPublishedModelList.mockResolvedValue([row]);
    render(<PublicGallery onBack={vi.fn()} onOpenModel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('A&E department, 24 hours')).toBeInTheDocument());
    expect(screen.getByText(/by A Consultant/)).toBeInTheDocument();
  });

  it('opens a model when its card is clicked', async () => {
    published.fetchPublishedModelList.mockResolvedValue([row]);
    const onOpenModel = vi.fn();
    render(<PublicGallery onBack={vi.fn()} onOpenModel={onOpenModel} />);
    await waitFor(() => expect(screen.getByText('A&E department, 24 hours')).toBeInTheDocument());
    fireEvent.click(screen.getByText('A&E department, 24 hours'));
    expect(onOpenModel).toHaveBeenCalledWith('m1');
  });

  it('filters by category', async () => {
    published.fetchPublishedModelList.mockResolvedValue([row]);
    render(<PublicGallery onBack={vi.fn()} onOpenModel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('A&E department, 24 hours')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/filter by category/i), { target: { value: 'healthcare' } });
    await waitFor(() => expect(published.fetchPublishedModelList).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'healthcare' })
    ));
  });

  it('searches', async () => {
    published.fetchPublishedModelList.mockResolvedValue([]);
    render(<PublicGallery onBack={vi.fn()} onOpenModel={vi.fn()} />);
    await waitFor(() => expect(published.fetchPublishedModelList).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/search published models/i), { target: { value: 'warehouse' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await waitFor(() => expect(published.fetchPublishedModelList).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'warehouse' })
    ));
  });

  it('says so when nothing has been published', async () => {
    published.fetchPublishedModelList.mockResolvedValue([]);
    render(<PublicGallery onBack={vi.fn()} onOpenModel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/nothing published here yet/i)).toBeInTheDocument());
  });
});
