import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  entityTypes: [],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
};

function jsonFile(name, payload) {
  return new File([typeof payload === 'string' ? payload : JSON.stringify(payload)], name, {
    type: 'application/json',
  });
}

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

  it('renders the Import JSON button in the model library', async () => {
    await renderLibrary();

    expect(screen.getAllByRole('button', { name: /import json/i }).length).toBeGreaterThan(0);
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

    expect(imported).toEqual({
      name: 'Shared model (Imported)',
      description: 'from file',
      visibility: 'private',
      access: {},
      ...emptyModelJson,
    });
    expect(imported.user_id).toBeUndefined();
    expect(imported.owner_id).toBeUndefined();
    expect(imported.is_public).toBeUndefined();
  });

  it('imports a valid exported payload through saveModel for the current user', async () => {
    await renderLibrary();

    fireEvent.change(screen.getByLabelText('Import JSON file'), {
      target: {
        files: [jsonFile('exported.json', { name: 'Exported model', model_json: emptyModelJson })],
      },
    });

    await waitFor(() => expect(mockSaveModel).toHaveBeenCalledTimes(1));
    expect(mockSaveModel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Exported model (Imported)',
        visibility: 'private',
        access: {},
        ...emptyModelJson,
      }),
      'user-1'
    );
  });

  it('imports a raw model_json object', async () => {
    await renderLibrary();

    fireEvent.change(screen.getByLabelText('Import JSON file'), {
      target: {
        files: [jsonFile('raw.json', { ...emptyModelJson, name: 'Raw model' })],
      },
    });

    await waitFor(() => expect(mockSaveModel).toHaveBeenCalledTimes(1));
    expect(mockSaveModel.mock.calls[0][0].name).toBe('Raw model (Imported)');
  });

  it('surfaces invalid JSON and does not save', async () => {
    await renderLibrary();

    fireEvent.change(screen.getByLabelText('Import JSON file'), {
      target: { files: [jsonFile('broken.json', '{not json')] },
    });

    expect(await screen.findByText(/import failed/i)).toBeInTheDocument();
    expect(mockSaveModel).not.toHaveBeenCalled();
  });

  it('blocks imported models with validation errors', async () => {
    await renderLibrary();

    fireEvent.change(screen.getByLabelText('Import JSON file'), {
      target: {
        files: [jsonFile('invalid.json', {
          name: 'Invalid model',
          model_json: {
            ...emptyModelJson,
            entityTypes: [{ id: 'et1', name: '', role: 'customer', attrDefs: [] }],
          },
        })],
      },
    });

    expect(await screen.findByText('Import blocked by validation errors.')).toBeInTheDocument();
    expect(screen.getByText(/\[V1\]/)).toBeInTheDocument();
    expect(mockSaveModel).not.toHaveBeenCalled();
  });
});
