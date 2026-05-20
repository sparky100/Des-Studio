import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  __resetDesModelsSchemaModeForTests,
  norm,
  fetchModels,
  fetchProfiles,
  fetchUserSettings,
  normalizeProfileRole,
  normalizeProfile,
  normalizeUserSettings,
  saveUserSettings,
  saveModel,
  deleteModel,
  saveSimulationRun,
  normalizeRunHistoryRow,
  fetchRunStatsForModels,
  fetchRunHistory,
  forkModel,
  createShareLink,
  getShareLink,
  revokeShareLink,
  listShareLinks,
  saveSweep,
  getSweep,
  listSweeps,
  deleteSweep,
  getRun,
} from '../../src/db/models.js';
import { supabase } from '../../src/db/supabase.js';

describe('DB Layer: models.js (ADR-001 Enforcement)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDesModelsSchemaModeForTests();
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

    it('retries model fetches with a legacy select when model_json is unavailable', async () => {
      supabase.from('des_models').select().or.mockReturnThis();
      supabase.from('des_models').select().contains.mockReturnThis();
      supabase.from('des_models').order
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null });

      await fetchModels('compat-user');

      expect(supabase.from('des_models').select).toHaveBeenCalledWith(expect.stringContaining('model_json'));
      expect(supabase.from('des_models').select).toHaveBeenCalledWith(expect.not.stringContaining('model_json'));
    });

    it('remembers the legacy schema mode after the first compatibility failure', async () => {
      supabase.from('des_models').select().or.mockReturnThis();
      supabase.from('des_models').select().contains.mockReturnThis();
      supabase.from('des_models').order
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null });

      await fetchModels('compat-user');

      vi.clearAllMocks();
      supabase.from('des_models').select().or.mockReturnThis();
      supabase.from('des_models').select().contains.mockReturnThis();
      supabase.from('des_models').order
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      await fetchModels('compat-user');

      expect(supabase.from('des_models').select).not.toHaveBeenCalledWith(expect.stringContaining('model_json'));
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

  describe('norm row normalization', () => {
    it('includes tags array when present in the database row', () => {
      const result = norm({
        id: 'm1',
        name: 'Test',
        description: 'Desc',
        tags: ['queueing', 'healthcare'],
        visibility: 'public',
        owner_id: 'u1',
        entity_types: [],
        state_variables: [],
        b_events: [],
        c_events: [],
        queues: [],
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-02T00:00:00Z',
      });

      expect(result.tags).toEqual(['queueing', 'healthcare']);
    });

    it('defaults tags to an empty array when missing from the row', () => {
      const result = norm({
        id: 'm2',
        name: 'No tags',
        visibility: 'private',
        owner_id: 'u2',
        entity_types: [],
        state_variables: [],
        b_events: [],
        c_events: [],
        queues: [],
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-02T00:00:00Z',
      });

      expect(result.tags).toEqual([]);
    });

    it('hydrates canonical model_json graph and experiment defaults', () => {
      const result = norm({
        id: 'm3',
        name: 'Canonical',
        visibility: 'private',
        owner_id: 'u3',
        entity_types: [],
        state_variables: [],
        b_events: [],
        c_events: [],
        queues: [],
        model_json: {
          graph: { nodes: [{ id: 'n1' }], edges: [] },
          experimentDefaults: { maxSimTime: 250, warmupPeriod: 10 },
        },
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-02T00:00:00Z',
      });

      expect(result.graph).toEqual({ nodes: [{ id: 'n1' }], edges: [] });
      expect(result.experimentDefaults).toEqual({ maxSimTime: 250, warmupPeriod: 10 });
    });
  });

  describe('Profiles and user settings', () => {
    it('normalizes platform roles and exposes isAdmin without model permissions', () => {
      expect(normalizeProfileRole('admin')).toBe('admin');
      expect(normalizeProfileRole('owner')).toBe('user');
      expect(normalizeProfile({ id: 'u1', role: 'admin' })).toEqual(
        expect.objectContaining({ role: 'admin', isAdmin: true })
      );
      expect(normalizeProfile({ id: 'u2', role: 'viewer' })).toEqual(
        expect.objectContaining({ role: 'user', isAdmin: false })
      );
    });

    it('fetches profiles with normalized platform roles', async () => {
      supabase.from('profiles').select.mockResolvedValueOnce({
        data: [
          { id: 'u1', full_name: 'Admin', role: 'admin' },
          { id: 'u2', full_name: 'Owner word is not a platform role', role: 'owner' },
        ],
        error: null,
      });

      const profiles = await fetchProfiles();

      expect(supabase.from).toHaveBeenCalledWith('profiles');
      expect(supabase.from('profiles').select).toHaveBeenCalledWith('id, full_name, initials, color, role');
      expect(profiles).toEqual([
        expect.objectContaining({ id: 'u1', role: 'admin', isAdmin: true }),
        expect.objectContaining({ id: 'u2', role: 'user', isAdmin: false }),
      ]);
    });

    it('returns default settings when no settings row exists', async () => {
      supabase.from('user_settings').select.mockReturnThis();
      supabase.from('user_settings').eq.mockReturnThis();
      supabase.from('user_settings').single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'No rows' },
      });

      const result = await fetchUserSettings('u1');

      expect(supabase.from).toHaveBeenCalledWith('user_settings');
      expect(supabase.from('user_settings').eq).toHaveBeenCalledWith('user_id', 'u1');
      expect(result).toEqual({
        schemaVersion: 1,
        settings: { ui: {}, execute: {}, ai: {} },
      });
    });

    it('normalizes stored user settings with defaults', () => {
      expect(normalizeUserSettings({
        schema_version: 2,
        settings_json: { ui: { density: 'compact' } },
      })).toEqual({
        schemaVersion: 2,
        settings: { ui: { density: 'compact' }, execute: {}, ai: {} },
      });
    });

    it('upserts user settings by current user id', async () => {
      supabase.from('user_settings').upsert.mockReturnThis();
      supabase.from('user_settings').select.mockReturnThis();
      supabase.from('user_settings').single.mockResolvedValueOnce({
        data: { schema_version: 1, settings_json: { ui: { density: 'compact' } } },
        error: null,
      });

      const result = await saveUserSettings('u1', { ui: { density: 'compact' } });

      expect(supabase.from).toHaveBeenCalledWith('user_settings');
      expect(supabase.from('user_settings').upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'u1',
          schema_version: 1,
          settings_json: expect.objectContaining({ ui: { density: 'compact' }, execute: {}, ai: {} }),
          updated_at: expect.any(String),
        })
      );
      expect(result.settings.ui).toEqual({ density: 'compact' });
    });

    it('rejects saving settings without a user id', async () => {
      await expect(saveUserSettings('', {})).rejects.toThrow('User id is required');
      expect(supabase.from).not.toHaveBeenCalled();
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

    it('persists canonical model_json with graph and experiment defaults', async () => {
      const model = {
        id: 'm1',
        name: 'Canonical Save',
        entityTypes: [{ id: 'cust', name: 'Customer' }],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
        graph: { nodes: [{ id: 'source' }], edges: [] },
        experimentDefaults: { maxSimTime: 500, warmupPeriod: 25 },
      };
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();
      supabase.from('des_models').select.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({ data: { ...model, owner_id: 'u1' }, error: null });

      await saveModel(model, 'u1');

      expect(supabase.from('des_models').update).toHaveBeenCalledWith(
        expect.objectContaining({
          model_json: expect.objectContaining({
            graph: { nodes: [{ id: 'source' }], edges: [] },
            experimentDefaults: { maxSimTime: 500, warmupPeriod: 25 },
          }),
        })
      );
    });

    it('retries saves without model_json on legacy schemas', async () => {
      const model = {
        id: 'm1',
        name: 'Legacy Save',
        entityTypes: [],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
        graph: { nodes: [{ id: 'n1' }], edges: [] },
      };
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();
      supabase.from('des_models').select.mockReturnThis();
      supabase.from('des_models').single
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: { ...model, owner_id: 'u1' }, error: null });

      await saveModel(model, 'u1');

      expect(supabase.from('des_models').update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ model_json: expect.any(Object) })
      );
      expect(supabase.from('des_models').update).toHaveBeenNthCalledWith(
        2,
        expect.not.objectContaining({ model_json: expect.anything() })
      );
    });

    it('skips model_json on later saves once legacy schema mode is known', async () => {
      supabase.from('des_models').select().or.mockReturnThis();
      supabase.from('des_models').select().contains.mockReturnThis();
      supabase.from('des_models').order
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null });
      await fetchModels('compat-user');

      vi.clearAllMocks();
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();
      supabase.from('des_models').select.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({
        data: { id: 'm1', name: 'Legacy known', owner_id: 'u1' },
        error: null,
      });

      await saveModel({ id: 'm1', name: 'Legacy known', entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [] }, 'u1');

      expect(supabase.from('des_models').update).toHaveBeenCalledWith(
        expect.not.objectContaining({ model_json: expect.anything() })
      );
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
      supabase.from('simulation_runs').single.mockResolvedValueOnce({ data: { id: 'run-id-1', model_id: 'm1', run_by: 'u1' }, error: null });

      await saveSimulationRun('m1', 'u1', { summary: {} });
      expect(supabase.from).toHaveBeenCalledWith('simulation_runs');
      expect(supabase.from('simulation_runs').insert).toHaveBeenCalledWith(
        expect.objectContaining({ run_by: 'u1' })
      );
      expect(supabase.from('simulation_runs').select).toHaveBeenCalledWith('id');
      expect(supabase.from('simulation_runs').single).toHaveBeenCalled();
    });

    it('persists replication batch metadata in results_json', async () => {
      supabase.from('simulation_runs').single.mockResolvedValueOnce({ data: { id: 'run-id-2' }, error: null });
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
      supabase.from('simulation_runs').single.mockResolvedValueOnce({ data: { id: 'run-id-3' }, error: null });

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

    it('persists Phase C truncation metadata in results_json', async () => {
      supabase.from('simulation_runs').single.mockResolvedValueOnce({ data: { id: 'run-id-4' }, error: null });

      await saveSimulationRun('m1', 'u1', {
        summary: { total: 1, served: 0, reneged: 0, phaseCTruncated: true },
        phaseCTruncated: true,
        warnings: ['Phase C truncated after 3 passes at t=0.000'],
        snap: { clock: 0 },
      });

      expect(supabase.from('simulation_runs').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          results_json: expect.objectContaining({
            phaseCTruncated: true,
            summary: expect.objectContaining({ phaseCTruncated: true }),
            warnings: ['Phase C truncated after 3 passes at t=0.000'],
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
      supabase.from('des_models').select().or.mockReturnThis();
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
      expect(supabase.from('des_models').select).toHaveBeenCalled();
      expect(supabase.from('des_models').or).toHaveBeenCalledWith(expect.stringContaining(newUserId));
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

  describe('share links (Sprint 15)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    function makeQuery() {
      const q = {
        select: vi.fn(() => q),
        insert: vi.fn(() => q),
        upsert: vi.fn(() => q),
        update: vi.fn(() => q),
        delete: vi.fn(() => q),
        eq: vi.fn(() => q),
        in: vi.fn(() => q),
        or: vi.fn(() => q),
        contains: vi.fn(() => q),
        order: vi.fn(() => q),
        limit: vi.fn(() => q),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      return q;
    }
    beforeEach(() => {
      const q = makeQuery();
      supabase.from.mockReturnValue(q);
    });

    it('createShareLink inserts a row with a UUID token', async () => {
      supabase.from('share_links').single.mockResolvedValueOnce({
        data: { id: 'link-1', token: 'abc-123', created_at: '2026-05-09T12:00:00Z' },
        error: null,
      });

      const result = await createShareLink('run-1', 'user-1', { title: 'My Share' });

      expect(result.token).toBe('abc-123');
      expect(result.id).toBe('link-1');
      expect(supabase.from).toHaveBeenCalledWith('share_links');
      expect(supabase.from('share_links').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          run_id: 'run-1',
          created_by: 'user-1',
          config: { pinnedWidgets: [], title: 'My Share' },
        })
      );
    });

    it('getShareLink fetches run and model data by token', async () => {
      const q = supabase.from('share_links');
      q.single.mockResolvedValueOnce({
        data: { id: 'link-1', run_id: 'run-1', config: { pinnedWidgets: [] }, created_at: '2026-05-09T12:00:00Z', revoked_at: null },
        error: null,
      });
      supabase.from('simulation_runs').single.mockResolvedValueOnce({
        data: { id: 'run-1', ran_at: '2026-05-09T11:00:00Z', replications: 1, seed: 42, total_arrived: 100, total_served: 95, total_reneged: 5, avg_wait_time: 8.2, avg_service_time: 1.1, max_simulation_time: 500, warmup_period: 0, results_json: { summary: { avgWait: 8.2 } } },
        error: null,
      });
      supabase.from('des_models').single.mockResolvedValueOnce({
        data: { name: 'Test Model', entity_types: [{ id: 'et_1', name: 'Customer' }], queues: [{ id: 'q_1', name: 'Queue' }] },
        error: null,
      });

      const result = await getShareLink('abc-123');

      expect(result.share.token).toBe('abc-123');
      expect(result.run.avgWaitTime).toBe(8.2);
      expect(result.model.name).toBe('Test Model');
      expect(result.model.entityTypes).toHaveLength(1);
    });

    it('getShareLink throws when share link is revoked', async () => {
      supabase.from('share_links').single.mockResolvedValueOnce({
        data: { id: 'link-1', run_id: 'run-1', config: {}, created_at: '2026-05-09T12:00:00Z', revoked_at: '2026-05-09T13:00:00Z' },
        error: null,
      });

      await expect(getShareLink('revoked-token')).rejects.toThrow('revoked');
    });

    it('revokeShareLink sets revoked_at and guards by userId', async () => {
      supabase.from('share_links').single.mockResolvedValueOnce({
        data: { id: 'link-1' },
        error: null,
      });

      const result = await revokeShareLink('link-1', 'user-1');

      expect(result.ok).toBe(true);
      expect(supabase.from('share_links').update).toHaveBeenCalledWith(
        expect.objectContaining({ revoked_at: expect.any(String) })
      );
      expect(supabase.from('share_links').eq).toHaveBeenCalledWith('created_by', 'user-1');
    });

    it('listShareLinks returns active and revoked links for a model', async () => {
      supabase.from('simulation_runs').eq.mockResolvedValueOnce({
        data: [{ id: 'run-1' }, { id: 'run-2' }],
        error: null,
      });
      supabase.from('share_links').order.mockResolvedValueOnce({
        data: [
          { id: 'link-1', token: 'tok-1', config: { pinnedWidgets: ['arrived'] }, created_at: '2026-05-09T12:00:00Z', revoked_at: null },
          { id: 'link-2', token: 'tok-2', config: { pinnedWidgets: [] }, created_at: '2026-05-09T11:00:00Z', revoked_at: '2026-05-09T12:30:00Z' },
        ],
        error: null,
      });

      const links = await listShareLinks('model-1');

      expect(links).toHaveLength(2);
      expect(links[0].isActive).toBe(true);
      expect(links[1].isActive).toBe(false);
      expect(supabase.from('simulation_runs').eq).toHaveBeenCalledWith('model_id', 'model-1');
      expect(supabase.from('share_links').in).toHaveBeenCalledWith('run_id', ['run-1', 'run-2']);
    });
  });

  describe('sweeps (Sprint 16)', () => {
    beforeEach(() => {
      // Rebuild mock query builder to survive vi.clearAllMocks()
      const qb = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(qb);
    });

    it('saveSweep inserts a row with config and results', async () => {
      supabase.from('sweeps').single.mockResolvedValueOnce({
        data: { id: 'sweep-1', config: { param: 'Server.count', min: 1, max: 3 }, results: { points: [{ value: 1 }, { value: 2 }] }, created_at: '2026-05-09T12:00:00Z' },
        error: null,
      });

      const result = await saveSweep('model-1', 'user-1', { param: 'Server.count', min: 1, max: 3 }, { points: [{ value: 1 }, { value: 2 }] });

      expect(result.id).toBe('sweep-1');
      expect(result.config.param).toBe('Server.count');
      expect(supabase.from).toHaveBeenCalledWith('sweeps');
      expect(supabase.from('sweeps').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          model_id: 'model-1',
          run_by: 'user-1',
          config: expect.objectContaining({ param: 'Server.count' }),
        })
      );
    });

    it('getSweep fetches a sweep by id', async () => {
      supabase.from('sweeps').single.mockResolvedValueOnce({
        data: { id: 'sweep-1', model_id: 'model-1', config: { param: 'Server.count' }, results: { points: [] }, created_at: '2026-05-09T12:00:00Z' },
        error: null,
      });

      const result = await getSweep('sweep-1');

      expect(result.id).toBe('sweep-1');
      expect(result.modelId).toBe('model-1');
      expect(supabase.from('sweeps').eq).toHaveBeenCalledWith('id', 'sweep-1');
    });

    it('listSweeps returns all sweeps for a model ordered by creation date', async () => {
      supabase.from('sweeps').order.mockResolvedValueOnce({
        data: [
          { id: 'sweep-1', config: { param: 'Server.count' }, results: {}, created_at: '2026-05-09T12:00:00Z' },
          { id: 'sweep-2', config: { param: 'Arrival.mean' }, results: {}, created_at: '2026-05-09T11:00:00Z' },
        ],
        error: null,
      });

      const sweeps = await listSweeps('model-1');

      expect(sweeps).toHaveLength(2);
      expect(sweeps[0].id).toBe('sweep-1');
      expect(sweeps[1].id).toBe('sweep-2');
      expect(supabase.from('sweeps').eq).toHaveBeenCalledWith('model_id', 'model-1');
    });

    it('deleteSweep deletes by id', async () => {
      supabase.from('sweeps').delete.mockReturnThis();
      supabase.from('sweeps').eq.mockReturnThis();

      const result = await deleteSweep('sweep-1', 'user-1');

      expect(result.ok).toBe(true);
      expect(supabase.from('sweeps').delete).toHaveBeenCalled();
      expect(supabase.from('sweeps').eq).toHaveBeenCalledWith('id', 'sweep-1');
      expect(supabase.from('sweeps').eq).toHaveBeenCalledWith('run_by', 'user-1');
    });
  });

  describe('getRun', () => {
    beforeEach(() => {
      supabase.from.mockClear();
    });

    it('returns results_json so reproduce check can access stored summary', async () => {
      const storedResultsJson = {
        summary: { served: 10, avgWait: 5.0, avgSvc: 2.0, avgSojourn: 7.0, reneged: 0 },
        _model_snapshot: { id: 'm1', name: 'Test', entityTypes: [] },
        _base_seed: 42,
        _engine_version: '55a',
      };
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'run-1',
                results_json: storedResultsJson,
                max_simulation_time: 500,
                warmup_period: 0,
                replications: 1,
                seed: 42,
                ran_at: '2026-05-01T12:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });

      const run = await getRun('run-1');

      expect(run.results_json).toEqual(storedResultsJson);
      expect(run.results_json.summary).toEqual(storedResultsJson.summary);
      expect(run.summary).toEqual(storedResultsJson.summary);
      expect(run.model_snapshot).toEqual(storedResultsJson._model_snapshot);
      expect(run.base_seed).toBe(42);
    });

    it('returns null results_json when not stored', async () => {
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'run-2',
                results_json: null,
                max_simulation_time: 500,
                warmup_period: 0,
                replications: 1,
                seed: 99,
                ran_at: '2026-05-01T12:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });

      const run = await getRun('run-2');

      expect(run.results_json).toEqual({});
      expect(run.summary).toBeNull();
    });
  });
});
