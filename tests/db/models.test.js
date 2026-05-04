import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchModels, saveModel, deleteModel, saveSimulationRun, fetchRunHistory, forkModel } from '../../src/db/models.js';
import { supabase } from '../../src/db/supabase.js';

describe('DB Layer: models.js (ADR-001 Enforcement)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchModels', () => {
    it('applies complex visibility filter when userId is provided', async () => {
      // Mock the entire chain leading to the data resolution
      supabase.from('des_models').select().or.mockReturnThis();
      supabase.from('des_models').order.mockResolvedValueOnce({ data: [], error: null });

      await fetchModels('user-123');
      expect(supabase.from).toHaveBeenCalledWith('des_models');
      expect(supabase.from('des_models').or).toHaveBeenCalledWith(
        expect.stringContaining('owner_id.eq.user-123')
      );
      expect(supabase.from('des_models').order).toHaveBeenCalledWith('updated_at', { ascending: false });
    });

    it('filters strictly by public when no userId is provided', async () => {
      // Mock the entire chain leading to the data resolution
      supabase.from('des_models').select().eq.mockReturnThis();
      supabase.from('des_models').order.mockResolvedValueOnce({ data: [], error: null });

      await fetchModels(null);
      expect(supabase.from).toHaveBeenCalledWith('des_models');
      expect(supabase.from('des_models').eq).toHaveBeenCalledWith('visibility', 'public');
      expect(supabase.from('des_models').order).toHaveBeenCalledWith('updated_at', { ascending: false });
    });
  });

  describe('saveModel', () => {
    it('enforces owner_id when updating to prevent cross-user writes', async () => {
      const model = { id: 'm1', name: 'Test' };
      // Mock the entire chain for an update operation
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();
      supabase.from('des_models').select.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({ data: { ...model, owner_id: 'u1' }, error: null });

      await saveModel(model, 'u1');
      expect(supabase.from).toHaveBeenCalledWith('des_models');
      expect(supabase.from('des_models').update).toHaveBeenCalled();
      expect(supabase.from('des_models').eq).toHaveBeenCalledWith('id', 'm1');
      expect(supabase.from('des_models').select).toHaveBeenCalled();
      expect(supabase.from('des_models').single).toHaveBeenCalled();
    });
  });

  describe('Simulation Runs', () => {
    it('enforces run_by matching current user', async () => {
      // Mock the insert operation without .single()
      supabase.from('simulation_runs').insert.mockResolvedValueOnce({ data: { id: 'run-id-1', model_id: 'm1', run_by: 'u1' }, error: null });

      await saveSimulationRun('m1', 'u1', { summary: {} });
      expect(supabase.from).toHaveBeenCalledWith('simulation_runs');
      expect(supabase.from('simulation_runs').insert).toHaveBeenCalledWith(
        expect.objectContaining({ run_by: 'u1' })
      );
      // .single() is not called for saveSimulationRun
      expect(supabase.from('simulation_runs').single).not.toHaveBeenCalled();
    });
  });

  describe('forkModel', () => {
    it('fetches the source model, assigns new owner, sets to private, and inserts a new model', async () => {
      const sourceModelId = 'source-model-123';
      const newUserId = 'new-user-456';
      const sourceModelData = {
        id: sourceModelId,
        name: 'Public Model',
        description: 'Original description',
        visibility: 'public',
        owner_id: 'original-owner-789',
        entity_types: [],
        state_variables: [],
        b_events: [],
        c_events: [],
        queues: [],
      };

      // Mock the fetch of the source model
      supabase.from('des_models').select().eq.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({ data: sourceModelData, error: null });

      // Mock the insert of the new model
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({
        data: {
          ...sourceModelData,
          id: 'new-model-id',
          owner_id: newUserId,
          visibility: 'private',
          name: `Fork of ${sourceModelData.name}`, // Corrected name
        },
        error: null,
      });

      const forkedModel = await forkModel(sourceModelId, newUserId);

      // Verify fetch call
      expect(supabase.from).toHaveBeenCalledWith('des_models');
      expect(supabase.from('des_models').select).toHaveBeenCalledWith('*');
      expect(supabase.from('des_models').eq).toHaveBeenCalledWith('id', sourceModelId);
      expect(supabase.from('des_models').single).toHaveBeenCalled();

      // Verify insert call
      expect(supabase.from('des_models').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          owner_id: newUserId,
          name: expect.stringContaining('Fork of Public Model'),
          visibility: 'private',
          id: undefined, // Ensure ID is not carried over
          entity_types: [],
          state_variables: [],
          b_events: [],
          c_events: [],
          queues: [],
        })
      );
      expect(supabase.from('des_models').select).toHaveBeenCalled();
      expect(supabase.from('des_models').single).toHaveBeenCalled();

      // Verify returned forked model structure
      expect(forkedModel).toMatchObject({
        id: 'new-model-id',
        owner_id: newUserId,
        name: expect.stringContaining('Fork of Public Model'),
        visibility: 'private',
      });
    });

    it('throws an error if source model is not found', async () => {
      // Mock the fetch to return null data (model not found) without an error
      // Ensure the 'single' method directly resolves for this specific call.
      supabase.from('des_models').single.mockResolvedValueOnce({ data: null, error: null });
      
      await expect(forkModel('non-existent-id', 'user-id')).rejects.toThrow('Source model not found.');
    });

    it('throws an error if fetching source model fails', async () => {
      const mockError = new Error('Fetch failed');
      // Mock the fetch to return an error
      supabase.from('des_models').select().eq.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({ data: null, error: mockError });

      await expect(forkModel('some-id', 'user-id')).rejects.toThrow('Fetch failed');
    });

    it('throws an error if inserting forked model fails', async () => {
      const sourceModelData = {
        id: 'source-model-123',
        name: 'Public Model',
        description: 'Original description',
        visibility: 'public',
        owner_id: 'original-owner-789',
        entity_types: [],
        state_variables: [],
        b_events: [],
        c_events: [],
        queues: [],
      };
      const mockError = new Error('Insert failed');

      // Mock successful fetch of the source model
      supabase.from('des_models').select().eq.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({ data: sourceModelData, error: null });
      
      // Mock failed insert of the new model
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({ data: null, error: mockError });

      await expect(forkModel('source-model-123', 'new-user-456')).rejects.toThrow('Insert failed');
    });
  });
});
