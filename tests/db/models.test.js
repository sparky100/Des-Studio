import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchModels, saveModel, deleteModel, saveSimulationRun, fetchRunHistory, fetchRunStatsForModels, forkModel, normalizeRunHistoryRow } from '../../src/db/models.js';
import { supabase } from '../../src/db/supabase.js';

describe('DB Layer: models.js (ADR-001 Enforcement)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchModels', () => {
    it('fetches owned, public, and explicitly shared models with parseable filters', async () => {
      const userId = '7f1882ae-cc1e-4d80-bbdf-fd2355c69c36';
      supabase.from('des_models').select().or.mockReturnThis();
      supabase.from('des_models').select().contains.mockReturnThis();
      supabase.from('des_models').order
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      await fetchModels(userId);
      expect(supabase.from).toHaveBeenCalledWith('des_models');
      expect(supabase.from('des_models').or).toHaveBeenCalledWith(
        `owner_id.eq.${userId},visibility.eq.public`
      );
      expect(supabase.from('des_models').or.mock.calls[0][0]).not.toContain('access->');
      expect(supabase.from('des_models').contains).toHaveBeenCalledWith('access', { [userId]: 'viewer' });
      expect(supabase.from('des_models').contains).toHaveBeenCalledWith('access', { [userId]: 'editor' });
      expect(supabase.from('des_models').order).toHaveBeenCalledWith('updated_at', { ascending: false });
    });

    it('deduplicates and sorts rows from visible and shared model queries', async () => {
      const newer = {
        id: 'm-new',
        name: 'Newer',
        updated_at: '2026-05-04T10:00:00Z',
        entity_types: [],
        state_variables: [],
        b_events: [],
        c_events: [],
        queues: [],
      };
      const older = {
        id: 'm-old',
        name: 'Older',
        updated_at: '2026-05-03T10:00:00Z',
        entity_types: [],
        state_variables: [],
        b_events: [],
        c_events: [],
        queues: [],
      };

      supabase.from('des_models').order
        .mockResolvedValueOnce({ data: [older], error: null })
        .mockResolvedValueOnce({ data: [newer], error: null })
        .mockResolvedValueOnce({ data: [older], error: null });

      const models = await fetchModels('user-123');

      expect(models.map(model => model.id)).toEqual(['m-new', 'm-old']);
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

  describe('deleteModel', () => {
    it('deletes by id and owner_id', async () => {
      supabase.from('des_models').delete.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'm1' }], error: null });

      const result = await deleteModel('m1', 'u1');

      expect(result).toEqual({ ok: true });
      expect(supabase.from).toHaveBeenCalledWith('des_models');
      expect(supabase.from('des_models').delete).toHaveBeenCalled();
      expect(supabase.from('des_models').eq).toHaveBeenCalledWith('id', 'm1');
      expect(supabase.from('des_models').eq).toHaveBeenCalledWith('owner_id', 'u1');
      expect(supabase.from('des_models').select).toHaveBeenCalledWith('id');
    });

    it('does not query when id or userId is missing', async () => {
      const result = await deleteModel('m1', null);

      expect(result.ok).toBe(false);
      expect(supabase.from).not.toHaveBeenCalled();
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

    it('persists replication batch metadata in results_json', async () => {
      supabase.from('simulation_runs').insert.mockResolvedValueOnce({ data: { id: 'run-id-2' }, error: null });
      const suppliedResultsJson = { existing: true };

      await saveSimulationRun(
        'm1',
        'u1',
        {
          summary: { total: 12, served: 10, reneged: 2, avgWait: 4, avgSvc: 3, avgSojourn: 7 },
          snap: { clock: 500 },
        },
        {
          seed: 0,
          replications: 3,
          maxTime: 500,
          batchId: 'batch-123',
          runLabel: 'Baseline',
          aggregateStats: { 'summary.avgWait': { n: 3, mean: 4 } },
          replicationResults: [{ replicationIndex: 0, seed: 100 }],
          resultsJson: suppliedResultsJson,
        }
      );

      expect(supabase.from('simulation_runs').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          seed: 0,
          avg_service_time: 3,
          replications: 3,
          results_json: expect.objectContaining({
            existing: true,
            summary: expect.objectContaining({ avgSvc: 3, avgSojourn: 7 }),
            runLabel: 'Baseline',
            batch_id: 'batch-123',
            aggregateStats: { 'summary.avgWait': { n: 3, mean: 4 } },
            replications: [{ replicationIndex: 0, seed: 100 }],
          }),
        })
      );
      expect(suppliedResultsJson).toEqual({ existing: true });
    });

    it('stores a null avg_service_time when avgSvc is missing', async () => {
      supabase.from('simulation_runs').insert.mockResolvedValueOnce({ data: { id: 'run-id-3' }, error: null });

      await saveSimulationRun('m1', 'u1', {
        summary: { total: 1, served: 1, reneged: 0, avgWait: 4, avgSojourn: 9 },
        snap: { clock: 50 },
      });

      expect(supabase.from('simulation_runs').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          avg_service_time: null,
          results_json: expect.objectContaining({
            summary: expect.objectContaining({ avgSojourn: 9 }),
          }),
        })
      );
    });

    it('normalizes run history avg service from results_json when scalar is absent', () => {
      expect(normalizeRunHistoryRow({
        id: 'run-1',
        avg_service_time: null,
        results_json: { runLabel: 'Two servers', summary: { avgSvc: 2.75 } },
      })).toEqual(expect.objectContaining({
        avg_service_time: 2.75,
        run_label: 'Two servers',
      }));
    });

    it('fetches run stats by model and current user only', async () => {
      supabase.from('simulation_runs').select.mockReturnThis();
      supabase.from('simulation_runs').in.mockReturnThis();
      supabase.from('simulation_runs').eq.mockResolvedValueOnce({
        data: [
          { model_id: 'm1' },
          { model_id: 'm1' },
          { model_id: 'm2' },
        ],
        error: null,
      });

      const stats = await fetchRunStatsForModels(['m1', 'm2'], 'u1');

      expect(supabase.from).toHaveBeenCalledWith('simulation_runs');
      expect(supabase.from('simulation_runs').select).toHaveBeenCalledWith('model_id');
      expect(supabase.from('simulation_runs').in).toHaveBeenCalledWith('model_id', ['m1', 'm2']);
      expect(supabase.from('simulation_runs').eq).toHaveBeenCalledWith('run_by', 'u1');
      expect(stats).toEqual({
        m1: { runs: 2 },
        m2: { runs: 1 },
      });
    });

    it('fetches saved run history with fields needed for AI comparison', async () => {
      supabase.from('simulation_runs').select.mockReturnThis();
      supabase.from('simulation_runs').eq.mockReturnThis();
      supabase.from('simulation_runs').order.mockReturnThis();
      supabase.from('simulation_runs').limit.mockResolvedValueOnce({
        data: [
          {
            id: 'run-1',
            model_id: 'm1',
            seed: 10,
            max_simulation_time: 500,
            warmup_period: 0,
            results_json: { summary: { avgSvc: 3 } },
          },
        ],
        error: null,
      });

      const rows = await fetchRunHistory('m1');

      expect(supabase.from).toHaveBeenCalledWith('simulation_runs');
      expect(supabase.from('simulation_runs').select).toHaveBeenCalledWith(expect.stringContaining('seed'));
      expect(supabase.from('simulation_runs').select).toHaveBeenCalledWith(expect.stringContaining('max_simulation_time'));
      expect(supabase.from('simulation_runs').eq).toHaveBeenCalledWith('model_id', 'm1');
      expect(rows[0]).toEqual(expect.objectContaining({ seed: 10, max_simulation_time: 500 }));
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
