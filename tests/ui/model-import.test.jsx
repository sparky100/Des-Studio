import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App, { extractImportedModelPayload } from '../../src/App.jsx';
import { supabase } from '../../src/db/supabase.js';

const mockFetchModels = vi.hoisted(() => vi.fn());
const mockFetchProfiles = vi.hoisted(() => vi.fn());
const mockSaveModel = vi.hoisted(() => vi.fn());
const mockFetchUserSettings = vi.hoisted(() => vi.fn());
const mockSaveUserSettings = vi.hoisted(() => vi.fn());
const mockFetchRunHistory = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/models.js', () => ({
  fetchModels: mockFetchModels,
  fetchProfiles: mockFetchProfiles,
  fetchRunStatsForModels: vi.fn().mockResolvedValue({}),
  fetchUserSettings: mockFetchUserSettings,
  saveUserSettings: mockSaveUserSettings,
  fetchRunHistory: mockFetchRunHistory,
  saveModel: mockSaveModel,
  deleteModel: vi.fn(),
  setVisibility: vi.fn(),
  setAccess: vi.fn(),
  forkModel: vi.fn(),
}));

const session = { user: { id: 'user-1' } };
const createdModel = {
  id: 'created-1',
  name: 'Created model',
  description: 'Created in test',
  visibility: 'private',
  owner_id: 'user-1',
  access: {},
  entityTypes: [],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
  graph: null,
  experimentDefaults: {},
  updatedAt: '2026-05-22T10:00:00Z',
};
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
    mockFetchUserSettings.mockResolvedValue({ settings: { execute: { animateTokens: true, kpiSlots: [] } } });
    mockSaveUserSettings.mockResolvedValue(undefined);
    mockFetchRunHistory.mockResolvedValue([]);
  });

  it('renders the New Model button in the model library', async () => {
    await renderLibrary();
    expect(screen.getByRole('button', { name: /\+ new model/i })).toBeInTheDocument();
  });

  it('shows Import a file option in New Model modal', async () => {
    await renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: /\+ new model/i }));
    await screen.findByText('New Model');
    expect(screen.getByText(/^Draw$/i)).toBeInTheDocument();
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

  it('applies entered name and description when importing pasted JSON', async () => {
    const user = userEvent.setup();
    const importPayload = { name: 'Shared model', description: 'Original', model_json: emptyModelJson };
    mockFetchModels.mockReset();
    mockFetchModels.mockResolvedValueOnce([]).mockResolvedValue([
      {
        ...createdModel,
        name: 'Pasted Copy',
        description: 'Imported from clipboard',
      },
    ]);
    mockSaveModel.mockResolvedValue({ id: 'created-1' });
    await renderLibrary();

    fireEvent.click(screen.getByRole('button', { name: /\+ new model/i }));
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i), { target: { value: 'Pasted Copy' } });
    fireEvent.change(screen.getByPlaceholderText(/Optional/i), { target: { value: 'Imported from clipboard' } });
    await user.click(screen.getByText(/Paste model/i).closest('button'));
    fireEvent.change(screen.getByRole('textbox', { name: /Model JSON/i }), { target: { value: JSON.stringify(importPayload) } });
    await user.click(screen.getByRole('button', { name: /import model/i }));

    expect(mockSaveModel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Pasted Copy',
        description: 'Imported from clipboard',
      }),
      'user-1'
    );
  }, 10000);

  it('opens directly in the AI workspace when Describe is chosen', async () => {
    const user = userEvent.setup();
    mockFetchModels.mockReset();
    mockFetchModels.mockResolvedValueOnce([]).mockResolvedValue([
      {
        ...createdModel,
        name: 'AI Draft',
        description: '',
      },
    ]);
    mockSaveModel.mockResolvedValue({ id: 'created-1' });

    await renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: /\+ new model/i }));
    await user.type(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i), 'AI Draft');
    const newModelDialog = screen.getByRole('dialog', { name: /new model/i });
    await user.click(within(newModelDialog).getByText(/^Describe$/i).closest('button'));

    expect(await screen.findByRole('tab', { name: 'AI Designer' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText(/Get started building your model/i)).not.toBeInTheDocument();
  }, 10000);

  it('applies entered name and description when starting from a template', async () => {
    const user = userEvent.setup();
    mockFetchModels.mockReset();
    mockFetchModels.mockResolvedValueOnce([]).mockResolvedValue([
      {
        ...createdModel,
        name: 'Template Scenario',
        description: 'Scenario description',
      },
    ]);
    mockSaveModel.mockResolvedValue({ id: 'created-1' });

    await renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: /\+ new model/i }));
    await user.type(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i), 'Template Scenario');
    await user.type(screen.getByPlaceholderText(/Optional/i), 'Scenario description');
    const newModelDialog = screen.getByRole('dialog', { name: /new model/i });
    await user.click(within(newModelDialog).getByText(/Use a template/i).closest('button'));

    const templateCard = await screen.findByRole('button', { name: /try m\/m\/1 queue/i }, { timeout: 20000 });
    await user.click(templateCard);

    expect(mockSaveModel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Template Scenario',
        description: 'Scenario description',
      }),
      'user-1'
    );
  }, 30000);
});
