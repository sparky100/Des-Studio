import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App, { extractImportedModelPayload } from '../../src/App.jsx';
import { supabase } from '../../src/db/supabase.js';

const mockFetchModels = vi.hoisted(() => vi.fn());
const mockFetchProfiles = vi.hoisted(() => vi.fn());
const mockSaveModel = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', () => ({
  fetchModels: mockFetchModels,
  fetchProfiles: mockFetchProfiles,
  fetchRunStatsForModels: vi.fn().mockResolvedValue({}),
  saveModel: mockSaveModel,
  deleteModel: vi.fn(),
  setVisibility: vi.fn(),
  setAccess: vi.fn(),
  forkModel: vi.fn(),
}));

const session = { user: { id: 'user-1' } };
const emptyModelJson = {
  entityTypes: [
    { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: 'arr', name: 'Arrival', scheduledTime: '0', effect: 'ARRIVE(Customer)', schedules: [] },
    { id: 'comp', name: 'Complete', scheduledTime: '0', effect: 'COMPLETE(Customer)', schedules: [] },
  ],
  cEvents: [],
  queues: [],
  graph: null,
  experimentDefaults: {},
};

async function renderLibrary() {
  render(<App />);
  await screen.findByText('Model Library');
}

describe('model JSON import', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockFetchModels.mockResolvedValue([]);
    mockFetchProfiles.mockResolvedValue([{ id: 'user-1', full_name: 'Owner', initials: 'O', color: '#06b6d4' }]);
    mockSaveModel.mockResolvedValue({ id: 'imported-1' });
  });

  it('renders the New Model button in the model library', async () => {
    await renderLibrary();
    expect(screen.getByRole('button', { name: /\+ new model/i })).toBeInTheDocument();
  });

  it('shows Import a file option in New Model modal', async () => {
    await renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: /\+ new model/i }));
    await screen.findByText('New Model');
    expect(screen.getByText(/Import a file/i)).toBeInTheDocument();
  });

  it('normalizes exported payloads without preserving external ownership or visibility', () => {
    const imported = extractImportedModelPayload({
      name: 'Shared model',
      description: 'from file',
      user_id: 'other-user',
      owner_id: 'other-user',
      is_public: true,
      visibility: 'public',
      model_json: emptyModelJson,
    });

    expect(imported.name).toBe('Shared model (Imported)');
    expect(imported.description).toBe('from file');
    expect(imported.visibility).toBe('private');
    expect(imported.access).toEqual({});
    expect(imported.user_id).toBeUndefined();
    expect(imported.owner_id).toBeUndefined();
    expect(imported.is_public).toBeUndefined();
    expect(imported.entityTypes).toEqual(emptyModelJson.entityTypes);
    expect(imported.bEvents).toEqual(emptyModelJson.bEvents);
  });

  it('normalizes missing graph to null in imported payload', () => {
    const imported = extractImportedModelPayload({
      name: 'No graph',
      model_json: {
        entityTypes: [],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
      },
    });
    expect(imported.graph).toBeNull();
    expect(imported.experimentDefaults).toEqual({});
  });

  it('preserves experiment defaults when present in imported model_json', () => {
    const imported = extractImportedModelPayload({
      name: 'Defaults model',
      model_json: {
        ...emptyModelJson,
        experimentDefaults: { maxSimTime: 900, warmupPeriod: 30, replications: 5, terminationMode: 'time' },
      },
    });

    expect(imported.experimentDefaults).toEqual({
      maxSimTime: 900,
      warmupPeriod: 30,
      replications: 5,
      terminationMode: 'time',
    });
  });

  it('preserves graph key when present in imported model_json', () => {
    const imported = extractImportedModelPayload({
      name: 'Graph model',
      model_json: {
        ...emptyModelJson,
        graph: { nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] },
      },
    });
    expect(imported.graph).toEqual({ nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] });
  });
});
