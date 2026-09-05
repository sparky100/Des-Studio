import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  setVisibility,
  setAccess,
  saveSimulationRun,
  normalizeRunHistoryRow,
  fetchRunStatsForModels,
  fetchRunHistory,
  forkModel,
  createShareLink,
  getShareLink,
  revokeShareLink,
  listShareLinks,
  saveStudy,
  getStudy,
  listStudies,
  deleteStudy,
  saveExperiment,
  saveDiagnosis,
  listDiagnosesForRun,
  getRun,
  updateModelTags,
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
      expect(supabase.from('profiles').select).toHaveBeenCalledWith('id, full_name, initials, color, role, plan');
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
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ ...model, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');
      expect(supabase.from).toHaveBeenCalledWith('des_models');
      expect(supabase.from('des_models').update).toHaveBeenCalled();
      expect(supabase.from('des_models').eq).toHaveBeenCalledWith('id', 'm1');
      expect(supabase.from('des_models').select).toHaveBeenCalled();
    });

    it('throws a clear permission message instead of a raw PGRST116 coercion error when the update matches zero rows (RLS-filtered)', async () => {
      const model = { id: 'm1', name: 'Test' };
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();
      // No Postgres error — RLS just filtered the row out of the UPDATE, so
      // it legitimately affects zero rows (e.g. an editor collaborator hit
      // by the RLS gap fixed in 20260827130000_editor_write_access.sql, or
      // any update whose target no longer exists).
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [], error: null });

      await expect(saveModel(model, 'u1')).rejects.toThrow(
        "You don't have permission to save this model, or it no longer exists."
      );
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
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ ...model, owner_id: 'u1' }], error: null });

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
      supabase.from('des_models').select
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [{ ...model, owner_id: 'u1' }], error: null });

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
      supabase.from('des_models').select.mockResolvedValueOnce({
        data: [{ id: 'm1', name: 'Legacy known', owner_id: 'u1' }],
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

  describe('setVisibility', () => {
    it('updates visibility scoped by id and owner_id', async () => {
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'm1' }], error: null });

      await setVisibility('m1', 'public', 'u1');

      expect(supabase.from('des_models').update).toHaveBeenCalledWith({ visibility: 'public' });
      expect(supabase.from('des_models').eq).toHaveBeenCalledWith('id', 'm1');
      expect(supabase.from('des_models').eq).toHaveBeenCalledWith('owner_id', 'u1');
    });

    it('throws a clear permission message instead of silently no-oping when the update matches zero rows', async () => {
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [], error: null });

      await expect(setVisibility('m1', 'public', 'u1')).rejects.toThrow(
        "You don't have permission to change this model's visibility, or it no longer exists."
      );
    });
  });

  describe('setAccess', () => {
    it('updates the access map scoped by id and owner_id', async () => {
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'm1' }], error: null });

      await setAccess('m1', { 'user-2': 'viewer' }, 'u1');

      expect(supabase.from('des_models').update).toHaveBeenCalledWith({ access: { 'user-2': 'viewer' } });
      expect(supabase.from('des_models').eq).toHaveBeenCalledWith('id', 'm1');
      expect(supabase.from('des_models').eq).toHaveBeenCalledWith('owner_id', 'u1');
    });

    it('throws a clear permission message instead of silently no-oping when the update matches zero rows', async () => {
      // No Postgres error — this is exactly how a previously-reported bug ("I added a
      // collaborator but it doesn't seem to save it") could go silently unnoticed: the
      // write reports success with nothing actually written.
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [], error: null });

      await expect(setAccess('m1', { 'user-2': 'viewer' }, 'u1')).rejects.toThrow(
        "You don't have permission to change this model's collaborators, or it no longer exists."
      );
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
          // aggregate_stats is a dedicated column (mirrors results_json.aggregateStats)
          // so the run-history list query can render the CI badge without
          // selecting the full results_json payload.
          aggregate_stats: { 'summary.avgWait': { n: 3, mean: 4 } },
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

    it('falls back to aggregate_stats derived from resultsJson.aggregateStats when config.aggregateStats is not passed', async () => {
      supabase.from('simulation_runs').single.mockResolvedValueOnce({ data: { id: 'run-id-3' }, error: null });

      await saveSimulationRun(
        'm1',
        'u1',
        { summary: { total: 1, served: 1, reneged: 0 }, snap: { clock: 10 } },
        { resultsJson: { aggregateStats: { 'summary.avgWait': { n: 2, mean: 5 } } } }
      );

      expect(supabase.from('simulation_runs').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregate_stats: { 'summary.avgWait': { n: 2, mean: 5 } },
        })
      );
    });

    it('stores a null aggregate_stats when no aggregateStats is available', async () => {
      supabase.from('simulation_runs').single.mockResolvedValueOnce({ data: { id: 'run-id-4' }, error: null });

      await saveSimulationRun(
        'm1',
        'u1',
        { summary: { total: 1, served: 1, reneged: 0 }, snap: { clock: 10 } },
        {}
      );

      expect(supabase.from('simulation_runs').insert).toHaveBeenCalledWith(
        expect.objectContaining({ aggregate_stats: null })
      );
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

    it('persists saved run results in minimal form by default', async () => {
      supabase.from('simulation_runs').single.mockResolvedValueOnce({ data: { id: 'run-id-3b' }, error: null });

      await saveSimulationRun('m1', 'u1', {
        summary: { total: 3, served: 2, reneged: 1, avgWait: 4, avgSvc: 2, avgSojourn: 6 },
        snap: { clock: 25 },
        runtimeMetrics: { wall_clock_ms: 42, replications: 1, events_processed: 9, c_event_scans: 5, c_events_fired: 2, entities_created: 3, entities_completed: 2, max_queue_length_by_queue: { Main: 2 } },
        timeSeries: [
          { t: 0, byQueue: { Main: { waiting: 0, total: 0 } }, byType: { Customer: { waiting: 0, idle: 0, busy: 0, total: 0 } } },
          { t: 25, byQueue: { Main: { waiting: 2, total: 3 } }, byType: { Customer: { waiting: 2, idle: 0, busy: 0, total: 3 } } },
        ],
        waitDist: { Main: { n: 2, mean: 3, p50: 3, p90: 4, p95: 4, p99: 4, values: [2, 4] } },
        log: [{ phase: 'END', time: 25, message: 'Run finished' }],
        entitySummary: [{ type: 'Customer', status: 'done', count: 2 }],
      }, {
        durationMs: 42,
      });

      expect(supabase.from('simulation_runs').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          duration_ms: 42,
          results_json: expect.objectContaining({
            _results_payload_size_bytes: expect.any(Number),
            _result_detail_level: 'minimal',
            _trimmed_fields: expect.arrayContaining(['log', 'entitySummary', 'waitDist.values→histogram']),
            runtimeMetrics: expect.objectContaining({
              wall_clock_ms: 42,
              events_processed: 9,
              max_queue_length_by_queue: { Main: 2 },
            }),
            waitDist: expect.objectContaining({
              Main: expect.objectContaining({ n: 2, mean: 3, p99: 4 }),
            }),
            logSummary: expect.objectContaining({ entries: 1, finalMessage: 'Run finished' }),
          }),
        })
      );

      const insertedPayload = supabase.from('simulation_runs').insert.mock.calls.at(-1)[0];
      expect(insertedPayload.results_json.log).toBeUndefined();
      expect(insertedPayload.results_json.entitySummary).toBeUndefined();
      expect(insertedPayload.results_json.timeSeries).toBeDefined();
      expect(insertedPayload.results_json.timeSeries).toHaveLength(2);
      expect(insertedPayload.results_json.waitDist.Main.values).toBeUndefined();
      const { _results_payload_size_bytes: storedSize, ...resultsJsonWithoutSize } = insertedPayload.results_json;
      expect(storedSize).toBe(JSON.stringify(resultsJsonWithoutSize).length);
    });

    it('persists large runs in compact form when compact detail is requested', async () => {
      supabase.from('simulation_runs').single.mockResolvedValueOnce({ data: { id: 'run-id-3c' }, error: null });

      await saveSimulationRun('m1', 'u1', {
        summary: { total: 3000, served: 2500, reneged: 500, avgWait: 4, avgSvc: 2 },
        snap: { clock: 1000 },
        runtimeMetrics: { wall_clock_ms: 100, replications: 1, events_processed: 10000, c_event_scans: 8000, c_events_fired: 3000, entities_created: 3000, entities_completed: 2500, max_queue_length_by_queue: { Main: 25 } },
        timeSeries: Array.from({ length: 500 }, (_, index) => ({ t: index, byQueue: { Main: { waiting: index % 6, total: index % 9 } }, byType: {} })),
        waitDist: { Main: { n: 2, mean: 3, p50: 3, p90: 4, p95: 4, p99: 4, values: [2, 4] } },
        log: Array.from({ length: 40 }, (_, index) => ({ phase: 'END', time: index, message: `message ${index}` })),
        entitySummary: Array.from({ length: 400 }, (_, index) => ({ type: 'Customer', status: index % 2 === 0 ? 'done' : 'waiting' })),
        trace: Array.from({ length: 40 }, (_, index) => ({ seq: index, phase: 'A' })),
      }, {
        resultDetailLevel: 'compact',
        riskLevel: 'large',
      });

      expect(supabase.from('simulation_runs').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          results_json: expect.objectContaining({
            _result_detail_level: 'compact',
            _result_risk_level: 'large',
            _trimmed_fields: expect.arrayContaining(['log', 'entitySummary', 'timeSeries', 'trace']),
            logSummary: expect.objectContaining({ entries: 40 }),
            timeSeries: expect.any(Array),
            waitDist: expect.objectContaining({ Main: expect.objectContaining({ n: 2 }) }),
          }),
        })
      );

      const compactPayload = supabase.from('simulation_runs').insert.mock.calls.at(-1)[0].results_json;
      expect(compactPayload.log).toBeUndefined();
      expect(compactPayload.entitySummary).toBeUndefined();
      expect(compactPayload.trace).toBeUndefined();
      expect(compactPayload.timeSeries.length).toBeLessThanOrEqual(200);
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
            _results_payload_size_bytes: expect.any(Number),
            phaseCTruncated: true,
            summary: expect.objectContaining({ phaseCTruncated: true }),
            warnings: ['Phase C truncated after 3 passes at t=0.000'],
          }),
        })
      );
    });

    it('normalizes run history rows from real columns, without reading results_json', () => {
      // results_json is no longer selected by fetchRunHistory (perf: avoid
      // pulling the full payload for every row in the list) — normalization
      // must rely solely on the promoted scalar columns and aggregate_stats.
      expect(normalizeRunHistoryRow({
        id: 'run-1',
        avg_service_time: 2.75,
        run_label: 'Two servers',
        aggregate_stats: { 'summary.avgWait': { mean: 5, halfWidth: 0.5, n: 3 } },
      })).toEqual(expect.objectContaining({
        avg_service_time: 2.75,
        run_label: 'Two servers',
        aggregate_stats: { 'summary.avgWait': { mean: 5, halfWidth: 0.5, n: 3 } },
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

    it('fetchRunHistory does not select or depend on results_json for list rows', async () => {
      supabase.from('simulation_runs').limit.mockResolvedValueOnce({
        data: [{
          id: 'run-1',
          ran_at: '2026-05-09T11:00:00Z',
          total_arrived: 100,
          total_served: 95,
          total_reneged: 5,
          avg_wait_time: 8.2,
          avg_service_time: 1.1,
          renege_rate: 0.05,
          duration_ms: null,
          replications: 1,
          seed: 42,
          max_simulation_time: 500,
          warmup_period: 0,
          aggregate_stats: { 'summary.avgWait': { mean: 8.2, halfWidth: 0.4, n: 3 } },
          ai_insights: null,
          run_label: 'Recovered run',
          tags: [],
          archived: false,
          version_id: null,
          model_versions: null,
        }],
        error: null,
      });

      const [row] = await fetchRunHistory('model-1');

      expect(supabase.from('simulation_runs').select).toHaveBeenCalledWith(
        expect.not.stringContaining('results_json')
      );
      expect(row.run_label).toBe('Recovered run');
      expect(row.total_arrived).toBe(100);
      expect(row.total_served).toBe(95);
      expect(row.total_reneged).toBe(5);
      expect(row.avg_wait_time).toBe(8.2);
      expect(row.avg_service_time).toBe(1.1);
      expect(row.renege_rate).toBeCloseTo(0.05);
      expect(row.aggregate_stats).toEqual({ 'summary.avgWait': { mean: 8.2, halfWidth: 0.4, n: 3 } });
    });

    it('revokeShareLink sets revoked_at and guards by userId', async () => {
      supabase.from('share_links').select.mockResolvedValueOnce({
        data: [{ id: 'link-1' }],
        error: null,
      });

      const result = await revokeShareLink('link-1', 'user-1');

      expect(result.ok).toBe(true);
      expect(supabase.from('share_links').update).toHaveBeenCalledWith(
        expect.objectContaining({ revoked_at: expect.any(String) })
      );
      expect(supabase.from('share_links').eq).toHaveBeenCalledWith('created_by', 'user-1');
    });

    it('revokeShareLink throws a friendly not-found message (not a raw PGRST116 error) when the update matches zero rows', async () => {
      supabase.from('share_links').select.mockResolvedValueOnce({ data: [], error: null });

      await expect(revokeShareLink('link-1', 'user-1')).rejects.toThrow(
        'Share link not found or you do not own it.'
      );
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

  describe('studies (F-Study; renamed from sweeps in Sprint 16)', () => {
    /** @type {import('../../src/contracts/study').StudyDefinition} */
    const definition = {
      name: 'Nurse staffing sweep',
      planType: 'grid1d',
      parameters: [{ type: 'entityTypeCount', targetId: 'et1', path: 'entityTypes.et1.count', label: 'Number of Nurse', currentValue: 2, range: { min: 1, max: 5, step: 1 } }],
      goals: [],
      objective: { metricRef: { kind: 'summary', field: 'avgWait' }, direction: 'min' },
      runBudget: { points: 5, replicationsPerPoint: 10 },
      baseSeed: 42,
      origin: { kind: 'user' },
    };

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

    it('saveStudy inserts a studies row with the definition (no points)', async () => {
      supabase.from('studies').single.mockResolvedValueOnce({
        data: { id: 'study-1', definition, schema_version: 2, status: 'complete', origin: { kind: 'user' }, created_at: '2026-09-05T12:00:00Z' },
        error: null,
      });

      const result = await saveStudy('model-1', 'user-1', definition, []);

      expect(result.id).toBe('study-1');
      expect(result.schemaVersion).toBe(2);
      expect(supabase.from).toHaveBeenCalledWith('studies');
      expect(supabase.from('studies').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          model_id: 'model-1',
          run_by: 'user-1',
          definition,
          schema_version: 2,
          status: 'complete',
          origin: { kind: 'user' },
        })
      );
      expect(supabase.from).not.toHaveBeenCalledWith('study_points');
    });

    it('saveStudy batch-inserts one study_points row per point', async () => {
      supabase.from('studies').single.mockResolvedValueOnce({
        data: { id: 'study-1', definition, schema_version: 2, status: 'complete', origin: { kind: 'user' }, created_at: '2026-09-05T12:00:00Z' },
        error: null,
      });

      const points = [
        { pointIndex: 0, params: [{ path: 'entityTypes.et1.count', value: 1 }], replications: 10, metrics: { 'summary.avgWait': { mean: 9.1, ci95Low: 8.5, ci95High: 9.7, min: 2, max: 20 } }, feasible: true, seed: 42 },
        { pointIndex: 1, params: [{ path: 'entityTypes.et1.count', value: 2 }], replications: 10, metrics: { 'summary.avgWait': { mean: 4.2, ci95Low: 3.9, ci95High: 4.5, min: 1, max: 10 } }, feasible: true, seed: 10042 },
      ];

      const result = await saveStudy('model-1', 'user-1', definition, points);

      expect(result.id).toBe('study-1');
      expect(supabase.from).toHaveBeenCalledWith('study_points');
      expect(supabase.from('study_points').insert).toHaveBeenCalledWith([
        expect.objectContaining({ study_id: 'study-1', point_index: 0, replications: 10, feasible: true, seed: 42 }),
        expect.objectContaining({ study_id: 'study-1', point_index: 1, replications: 10, feasible: true, seed: 10042 }),
      ]);
    });

    it('getStudy fetches a study and its points when schema_version is set', async () => {
      supabase.from('studies').single.mockResolvedValueOnce({
        data: { id: 'study-1', model_id: 'model-1', definition, schema_version: 2, status: 'complete', origin: { kind: 'user' }, created_at: '2026-09-05T12:00:00Z' },
        error: null,
      });
      supabase.from('studies').order.mockResolvedValueOnce({
        data: [
          { id: 'pt-1', point_index: 0, params: [{ path: 'entityTypes.et1.count', value: 1 }], replications: 10, metrics: {}, feasible: true, seed: 42, created_at: '2026-09-05T12:00:01Z' },
        ],
        error: null,
      });

      const result = await getStudy('study-1');

      expect(result.legacy).toBe(false);
      expect(result.definition).toEqual(definition);
      expect(result.points).toHaveLength(1);
      expect(result.points[0].pointIndex).toBe(0);
      expect(supabase.from).toHaveBeenCalledWith('study_points');
      expect(supabase.from('studies').eq).toHaveBeenCalledWith('study_id', 'study-1');
    });

    it('getStudy returns the untouched legacy blob shape when schema_version is null', async () => {
      supabase.from('studies').single.mockResolvedValueOnce({
        data: { id: 'sweep-1', model_id: 'model-1', config: { param: 'Server.count', min: 1, max: 3 }, results: { points: [{ value: 1 }, { value: 2 }] }, schema_version: null, status: null, origin: null, created_at: '2026-05-09T12:00:00Z' },
        error: null,
      });

      const result = await getStudy('sweep-1');

      expect(result).toEqual({
        id: 'sweep-1',
        modelId: 'model-1',
        legacy: true,
        config: { param: 'Server.count', min: 1, max: 3 },
        results: { points: [{ value: 1 }, { value: 2 }] },
        createdAt: '2026-05-09T12:00:00Z',
      });
      // Legacy rows never fetch study_points — there is nothing to join to.
      expect(supabase.from).not.toHaveBeenCalledWith('study_points');
    });

    it('listStudies returns both legacy and current-schema rows for a model, ordered by creation date', async () => {
      supabase.from('studies').order.mockResolvedValueOnce({
        data: [
          { id: 'study-1', definition, config: null, schema_version: 2, status: 'complete', origin: { kind: 'user' }, created_at: '2026-09-05T12:00:00Z' },
          { id: 'sweep-1', definition: null, config: { param: 'Server.count' }, schema_version: null, status: null, origin: null, created_at: '2026-05-09T11:00:00Z' },
        ],
        error: null,
      });

      const studies = await listStudies('model-1');

      expect(studies).toHaveLength(2);
      expect(studies[0]).toMatchObject({ id: 'study-1', legacy: false, name: 'Nurse staffing sweep', planType: 'grid1d', status: 'complete' });
      expect(studies[1]).toMatchObject({ id: 'sweep-1', legacy: true, planType: 'grid1d', status: 'complete', origin: { kind: 'user' } });
      expect(supabase.from('studies').eq).toHaveBeenCalledWith('model_id', 'model-1');
    });

    it('deleteStudy deletes by id, scoped to the owning user', async () => {
      supabase.from('studies').delete.mockReturnThis();
      supabase.from('studies').eq.mockReturnThis();

      const result = await deleteStudy('study-1', 'user-1');

      expect(result.ok).toBe(true);
      expect(supabase.from('studies').delete).toHaveBeenCalled();
      expect(supabase.from('studies').eq).toHaveBeenCalledWith('id', 'study-1');
      expect(supabase.from('studies').eq).toHaveBeenCalledWith('run_by', 'user-1');
    });

    // Phase 3: sequential studies denormalise their seed study's id onto
    // parent_study_id (from origin.refId) — see study.ts's StudyOrigin and
    // 20260905100000_studies_phase3.sql.
    it('saveStudy derives parent_study_id from a "study"-kind origin', async () => {
      const sequentialDefinition = { ...definition, planType: 'sequential', origin: { kind: 'study', refId: 'study-0' } };
      supabase.from('studies').single.mockResolvedValueOnce({
        data: { id: 'study-1', definition: sequentialDefinition, schema_version: 2, status: 'complete', origin: sequentialDefinition.origin, parent_study_id: 'study-0', created_at: '2026-09-05T12:00:00Z' },
        error: null,
      });

      const result = await saveStudy('model-1', 'user-1', sequentialDefinition, []);

      expect(result.parentStudyId).toBe('study-0');
      expect(supabase.from('studies').insert).toHaveBeenCalledWith(
        expect.objectContaining({ parent_study_id: 'study-0', origin: sequentialDefinition.origin })
      );
    });

    it('saveStudy leaves parent_study_id null for a non-"study" origin', async () => {
      supabase.from('studies').single.mockResolvedValueOnce({
        data: { id: 'study-2', definition, schema_version: 2, status: 'complete', origin: { kind: 'user' }, parent_study_id: null, created_at: '2026-09-05T12:00:00Z' },
        error: null,
      });

      await saveStudy('model-1', 'user-1', definition, []);

      expect(supabase.from('studies').insert).toHaveBeenCalledWith(
        expect.objectContaining({ parent_study_id: null })
      );
    });
  });

  describe('experiments — source_study_point_id (Phase 3 "Promote to Experiment")', () => {
    beforeEach(() => {
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

    it('saveExperiment writes source_study_point_id when promoting a study point', async () => {
      supabase.from('experiments').single.mockResolvedValueOnce({
        data: {
          id: 'exp-1', model_id: 'model-1', user_id: 'user-1', name: 'Promoted point',
          description: null, config: { overrides: [{ path: 'entityTypes.et1.count', value: '3' }] },
          source_study_point_id: 'pt-1', created_at: '2026-09-05T12:00:00Z', updated_at: '2026-09-05T12:00:00Z',
        },
        error: null,
      });

      const result = await saveExperiment({
        modelId: 'model-1', userId: 'user-1', name: 'Promoted point',
        config: { overrides: [{ path: 'entityTypes.et1.count', value: '3' }] },
        sourceStudyPointId: 'pt-1',
      });

      expect(result.sourceStudyPointId).toBe('pt-1');
      expect(supabase.from('experiments').insert).toHaveBeenCalledWith(
        expect.objectContaining({ source_study_point_id: 'pt-1' })
      );
    });

    it('saveExperiment leaves source_study_point_id null for an ordinary experiment', async () => {
      supabase.from('experiments').single.mockResolvedValueOnce({
        data: { id: 'exp-2', model_id: 'model-1', user_id: 'user-1', name: 'Baseline', description: null, config: {}, source_study_point_id: null, created_at: '2026-09-05T12:00:00Z', updated_at: '2026-09-05T12:00:00Z' },
        error: null,
      });

      const result = await saveExperiment({ modelId: 'model-1', userId: 'user-1', name: 'Baseline', config: {} });

      expect(result.sourceStudyPointId).toBeNull();
      expect(supabase.from('experiments').insert).toHaveBeenCalledWith(
        expect.objectContaining({ source_study_point_id: null })
      );
    });
  });

  describe('diagnoses (Phase 3: persisted AI diagnosis results)', () => {
    beforeEach(() => {
      const qb = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from.mockReturnValue(qb);
    });

    const diagnosisResult = {
      findings: [{ severity: 'CRITICAL', title: 'Queue never drains', explanation: 'x', affectedNodeId: 'q1', affectedNodeName: 'Waiting Room', suggestedFix: 'Add a server' }],
      overallAssessment: 'The model is under-resourced.',
    };

    it('saveDiagnosis inserts a diagnoses row keyed to the run', async () => {
      supabase.from('diagnoses').single.mockResolvedValueOnce({
        data: { id: 'diag-1', run_id: 'run-1', user_id: 'user-1', version_id: 'ver-1', result: diagnosisResult, created_at: '2026-09-05T12:00:00Z' },
        error: null,
      });

      const result = await saveDiagnosis('run-1', 'user-1', diagnosisResult, 'ver-1');

      expect(result.id).toBe('diag-1');
      expect(result.result).toEqual(diagnosisResult);
      expect(supabase.from).toHaveBeenCalledWith('diagnoses');
      expect(supabase.from('diagnoses').insert).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: 'run-1', user_id: 'user-1', version_id: 'ver-1', result: diagnosisResult })
      );
    });

    it('listDiagnosesForRun returns diagnoses ordered newest-first', async () => {
      supabase.from('diagnoses').order.mockResolvedValueOnce({
        data: [{ id: 'diag-2', run_id: 'run-1', user_id: 'user-1', version_id: null, result: diagnosisResult, created_at: '2026-09-05T13:00:00Z' }],
        error: null,
      });

      const diagnoses = await listDiagnosesForRun('run-1');

      expect(diagnoses).toHaveLength(1);
      expect(diagnoses[0]).toMatchObject({ id: 'diag-2', runId: 'run-1', result: diagnosisResult });
      expect(supabase.from('diagnoses').eq).toHaveBeenCalledWith('run_id', 'run-1');
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

    it('uses stored experiment_config metadata when present in results_json', async () => {
      const storedResultsJson = {
        summary: { served: 4 },
        _base_seed: 7,
        _engine_version: '55a',
        _experiment_config: {
          maxSimTime: 1440,
          warmupPeriod: 30,
          replications: 3,
          seed: 7,
          terminationMode: 'condition',
          terminationCondition: { variable: 'served.count', operator: '>=', value: 4 },
        },
      };
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'run-1b',
                results_json: storedResultsJson,
                max_simulation_time: 500,
                warmup_period: 0,
                replications: 1,
                seed: 7,
                ran_at: '2026-05-01T12:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });

      const run = await getRun('run-1b');

      expect(run.experiment_config).toEqual(storedResultsJson._experiment_config);
      expect(run.model_snapshot).toBeNull();
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

    it('exposes version_model from joined model_versions when no embedded snapshot', async () => {
      // Simulate a run saved without _model_snapshot (default minimal detail level)
      // but with a version_id that joins to a model_versions row.
      const versionModelJson = { id: 'm1', name: 'Glasgow Central', entityTypes: [], bEvents: [], cEvents: [], queues: [] };
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'run-v1',
                results_json: { summary: { served: 5 }, _base_seed: 77 },
                max_simulation_time: 1440,
                warmup_period: 0,
                replications: 1,
                seed: 77,
                ran_at: '2026-05-27T09:00:00Z',
                version_id: 'ver-uuid-001',
                model_versions: { id: 'ver-uuid-001', version: 3, name: 'Weekday timetable', model_json: versionModelJson },
              },
              error: null,
            }),
          }),
        }),
      });

      const run = await getRun('run-v1');

      expect(run.model_snapshot).toBeNull();
      expect(run.version_model).toEqual(versionModelJson);
      expect(run.version_id).toBe('ver-uuid-001');
      expect(run.version_number).toBe(3);
      expect(run.version_name).toBe('Weekday timetable');
    });

    it('returns null version_model and null version_id when no version is linked', async () => {
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'run-nover',
                results_json: { summary: { served: 2 } },
                max_simulation_time: 500,
                warmup_period: 0,
                replications: 1,
                seed: 1,
                ran_at: '2026-05-27T10:00:00Z',
                version_id: null,
                model_versions: null,
              },
              error: null,
            }),
          }),
        }),
      });

      const run = await getRun('run-nover');

      expect(run.model_snapshot).toBeNull();
      expect(run.version_model).toBeNull();
      expect(run.version_id).toBeNull();
      expect(run.version_number).toBeNull();
      expect(run.version_name).toBeNull();
    });

    it('prefers embedded snapshot over version_model when both are present', async () => {
      // Full-detail saves embed _model_snapshot; version_model is also present.
      // snapshot takes precedence — it is the exact model at run time.
      const embeddedSnapshot = { id: 'm1', name: 'Snapshot copy', entityTypes: [{ id: 'et1' }] };
      const versionModel     = { id: 'm1', name: 'Version copy',  entityTypes: [{ id: 'et1' }, { id: 'et2' }] };
      supabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'run-both',
                results_json: { summary: { served: 1 }, _model_snapshot: embeddedSnapshot, _base_seed: 5 },
                max_simulation_time: 500,
                warmup_period: 0,
                replications: 1,
                seed: 5,
                ran_at: '2026-05-27T11:00:00Z',
                version_id: 'ver-uuid-002',
                model_versions: { id: 'ver-uuid-002', version: 1, name: null, model_json: versionModel },
              },
              error: null,
            }),
          }),
        }),
      });

      const run = await getRun('run-both');

      expect(run.model_snapshot).toEqual(embeddedSnapshot);
      expect(run.version_model).toEqual(versionModel);
      // The caller (ModelHistoryTab) resolves: model_snapshot ?? version_model
      // so snapshot wins — confirmed here by both being non-null
      expect(run.model_snapshot).not.toEqual(run.version_model);
    });
  });
});

// ── Sprint 71.1 — Persistence unit tests ──────────────────────────────────────
describe('Sprint 71 — persistence layer', () => {
  // Rebuild mock query builder after vi.clearAllMocks() wipes mockReturnThis() implementations.
  // Earlier describe blocks (share links, studies, getRun) override supabase.from.mockReturnValue,
  // and vi.clearAllMocks() in afterEach removes those implementations, leaving supabase.from
  // returning undefined. We restore a fresh chainable query builder here.
  function makeQb() {
    const qb = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return qb;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    __resetDesModelsSchemaModeForTests();
    const qb = makeQb();
    supabase.from.mockReturnValue(qb);
  });

  // ── 71.1.1  saveModel serialises dataSources correctly ───────────────────
  describe('saveModel — dataSources / model_json / parent_model_id serialisation', () => {
    it('includes dataSources inside model_json when the array is non-empty', async () => {
      const model = {
        name: 'Airport Arrivals',
        entityTypes: [],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
        dataSources: [{ id: 'ds1', url: 'https://example.com/data.csv' }],
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'new-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json).toBeDefined();
      expect(insertArg.model_json.dataSources).toEqual([
        { id: 'ds1', url: 'https://example.com/data.csv' },
      ]);
    });

    it('does NOT drop model_json from the insert payload', async () => {
      const model = {
        name: 'No drop test',
        entityTypes: [],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
        graph: { nodes: [], edges: [] },
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'new-id-2', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json).not.toBeUndefined();
      expect(insertArg.model_json).not.toBeNull();
    });

    it('includes parent_model_id when it is present on the model object', async () => {
      // parent_model_id is passed through norm(), not via toRow, so we verify
      // that norm() correctly picks it up from the returned DB row.
      const dbRow = {
        id: 'child-id',
        name: 'Child Model',
        owner_id: 'u1',
        parent_model_id: 'parent-uuid',
        entity_types: [],
        b_events: [],
        c_events: [],
        queues: [],
        model_json: {},
      };
      const result = norm(dbRow);
      expect(result.parentModelId).toBe('parent-uuid');
    });

    it('does not emit undefined for model_json fields', async () => {
      const model = {
        name: 'No undefined',
        entityTypes: [],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'x', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      const json = insertArg.model_json;
      const undefinedKeys = Object.keys(json).filter(k => json[k] === undefined);
      expect(undefinedKeys).toHaveLength(0);
    });

    // Skill-based server preference (ASSIGN cross-type pooling) adds an optional
    // `priority` field to entityTypes[].skillProfiles[] entries. It rides along
    // inside the already-whitelisted `entityTypes` array, but per this repo's
    // schema contract every model_json field addition needs an explicit
    // round-trip assertion.
    it('round-trips entityTypes[].skillProfiles[].priority through saveModel and norm', async () => {
      const model = {
        name: 'Skill priority test',
        entityTypes: [
          {
            id: 'et-doctor', name: 'Doctor', role: 'server', count: 2,
            skills: ['Surgery'],
            skillProfiles: [
              { name: 'Specialist', skills: ['Surgery'], count: 1, priority: 10 },
              { name: 'Generalist', skills: ['Surgery'], count: 1, priority: 1 },
            ],
          },
        ],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'skill-priority-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      // entityTypes is stored both as the dedicated `entity_types` column (what
      // norm() actually reads back) and duplicated inside model_json — assert
      // priority survives in both places.
      expect(insertArg.entity_types[0].skillProfiles[0].priority).toBe(10);
      expect(insertArg.entity_types[0].skillProfiles[1].priority).toBe(1);
      expect(insertArg.model_json.entityTypes[0].skillProfiles[0].priority).toBe(10);

      // Round trip back out through norm(), simulating a row fetched from Supabase —
      // entityTypes comes from the `entity_types` column, not model_json.
      const dbRow = {
        id: 'skill-priority-id',
        name: model.name,
        owner_id: 'u1',
        entity_types: insertArg.entity_types,
        b_events: [],
        c_events: [],
        queues: [],
        model_json: insertArg.model_json,
      };
      const normalized = norm(dbRow);
      expect(normalized.entityTypes[0].skillProfiles[0].priority).toBe(10);
      expect(normalized.entityTypes[0].skillProfiles[1].priority).toBe(1);
    });

    // The stakeholder run surface adds an owner-curated `exposedParams` array
    // to model_json (which parameters a viewer-role user may vary, plus
    // per-knob businessLabel/min/max). Round-trip assertion required per this
    // repo's schema contract.
    it('round-trips exposedParams through saveModel and norm', async () => {
      const model = {
        name: 'Exposed params test',
        entityTypes: [{ id: 'et-teller', name: 'Teller', role: 'server', count: 2 }],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
        exposedParams: [
          { path: 'entityTypes.et-teller.count', businessLabel: 'Number of tellers', min: 1, max: 10 },
          { path: 'queues.q-main.capacity' },
        ],
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'exposed-params-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.exposedParams).toEqual([
        { path: 'entityTypes.et-teller.count', businessLabel: 'Number of tellers', min: 1, max: 10 },
        { path: 'queues.q-main.capacity' },
      ]);

      const dbRow = {
        id: 'exposed-params-id',
        name: model.name,
        owner_id: 'u1',
        entity_types: insertArg.entity_types,
        b_events: [],
        c_events: [],
        queues: [],
        model_json: insertArg.model_json,
      };
      const normalized = norm(dbRow);
      expect(normalized.exposedParams).toEqual(model.exposedParams);
    });

    it('defaults exposedParams to an empty array and omits it from model_json when absent', async () => {
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'no-exposed-id', name: 'Plain', owner_id: 'u1' }], error: null });

      await saveModel({ name: 'Plain', entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [] }, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json).not.toHaveProperty('exposedParams');
      expect(norm({ id: 'x', name: 'Plain', owner_id: 'u1', model_json: {} }).exposedParams).toEqual([]);
    });

    // Entity family/inheritance (Phase 2, 2b) adds an optional `parentTypeId`
    // field to entityTypes[] entries. Same as skillProfiles.priority above,
    // it rides along inside the whitelisted `entityTypes` array but needs its
    // own explicit round-trip assertion per this repo's schema contract.
    it('round-trips entityTypes[].parentTypeId through saveModel and norm', async () => {
      const model = {
        name: 'Entity inheritance test',
        entityTypes: [
          { id: 'et-nurse', name: 'Nurse', role: 'server', count: 2, skills: ['Triage'] },
          { id: 'et-senior-nurse', name: 'Senior Nurse', role: 'server', count: 1, parentTypeId: 'et-nurse' },
        ],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'entity-inheritance-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.entity_types[1].parentTypeId).toBe('et-nurse');
      expect(insertArg.model_json.entityTypes[1].parentTypeId).toBe('et-nurse');

      const dbRow = {
        id: 'entity-inheritance-id',
        name: model.name,
        owner_id: 'u1',
        entity_types: insertArg.entity_types,
        b_events: [],
        c_events: [],
        queues: [],
        model_json: insertArg.model_json,
      };
      const normalized = norm(dbRow);
      expect(normalized.entityTypes[1].parentTypeId).toBe('et-nurse');
    });

    // Service sequence enforcement (Phase 2, 2c) adds an optional
    // `requiredSequence` field (ordered queue names) to entityTypes[]
    // entries. Same rationale as parentTypeId above — needs its own
    // round-trip assertion per this repo's schema contract.
    it('round-trips entityTypes[].requiredSequence through saveModel and norm', async () => {
      const model = {
        name: 'Sequence enforcement test',
        entityTypes: [
          {
            id: 'et-patient', name: 'Patient', role: 'customer',
            requiredSequence: ['Triage Queue', 'Treatment Queue', 'Discharge Queue'],
          },
        ],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'sequence-enforcement-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.entity_types[0].requiredSequence).toEqual(['Triage Queue', 'Treatment Queue', 'Discharge Queue']);
      expect(insertArg.model_json.entityTypes[0].requiredSequence).toEqual(['Triage Queue', 'Treatment Queue', 'Discharge Queue']);

      const dbRow = {
        id: 'sequence-enforcement-id',
        name: model.name,
        owner_id: 'u1',
        entity_types: insertArg.entity_types,
        b_events: [],
        c_events: [],
        queues: [],
        model_json: insertArg.model_json,
      };
      const normalized = norm(dbRow);
      expect(normalized.entityTypes[0].requiredSequence).toEqual(['Triage Queue', 'Treatment Queue', 'Discharge Queue']);
    });
  });

  // ── 71.1.2  norm() structural validity ───────────────────────────────────
  describe('norm() — deserialises stored DB record into a structurally valid model', () => {
    it('returns all expected top-level fields', () => {
      const dbRow = {
        id: 'model-id-1',
        name: 'Full Model',
        description: 'A description',
        tags: ['tag1'],
        visibility: 'public',
        access: { 'u2': 'viewer' },
        entity_types: [{ id: 'et1' }],
        state_variables: [],
        b_events: [{ id: 'be1' }],
        c_events: [],
        queues: [{ id: 'q1' }],
        goals: ['goal1'],
        owner_id: 'u1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
        latest_version: 3,
        parent_model_id: 'parent-id',
        model_json: {
          graph: { nodes: [], edges: [] },
          experimentDefaults: { maxSimTime: 500 },
          timeUnit: 'hours',
          epoch: '2026-01-01',
          dataSources: [{ id: 'ds1' }],
        },
      };

      const result = norm(dbRow);

      const EXPECTED_TOP_LEVEL_FIELDS = [
        'id', 'name', 'entityTypes', 'bEvents', 'cEvents', 'queues',
        'graph', 'experimentDefaults', 'dataSources', 'timeUnit', 'epoch',
        'goals', 'parentModelId',
      ];

      for (const field of EXPECTED_TOP_LEVEL_FIELDS) {
        expect(result).toHaveProperty(field);
      }
    });

    it('maps snake_case DB columns to camelCase model fields', () => {
      const result = norm({
        id: 'id-1',
        name: 'CamelCase',
        entity_types: [{ id: 'et' }],
        b_events: [{ id: 'be' }],
        c_events: [{ id: 'ce' }],
        queues: [{ id: 'q' }],
        owner_id: 'u1',
        parent_model_id: 'p-id',
        model_json: { timeUnit: 'seconds', epoch: 'T0', dataSources: [] },
      });

      expect(result.entityTypes).toEqual([{ id: 'et' }]);
      expect(result.bEvents).toEqual([{ id: 'be' }]);
      expect(result.cEvents).toEqual([{ id: 'ce' }]);
      expect(result.parentModelId).toBe('p-id');
      expect(result.timeUnit).toBe('seconds');
      expect(result.epoch).toBe('T0');
    });
  });

  // ── 71.1.3  Round-trip: model_json in insert contains dataSources ─────────
  describe('round-trip — model_json.dataSources survives saveModel insert', () => {
    it('the insert payload model_json contains dataSources from the input object', async () => {
      const dataSources = [
        { id: 'ds-rt', url: 'https://example.com/arrivals.csv', format: 'csv' },
      ];
      const model = {
        name: 'Round Trip Model',
        entityTypes: [],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
        dataSources,
      };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'rt-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.dataSources).toEqual(dataSources);
    });
  });

  // ── round-trip: queue-scoped balking/reneging fields (F11.2) ───────────────
  describe('round-trip — queue balkProbability/balkCondition/renegeDist survive saveModel + norm()', () => {
    it('the insert payload preserves the new Queue fields', async () => {
      const queues = [
        {
          id: 'q-rt', name: 'Main Queue', customerType: 'Customer', discipline: 'FIFO',
          balkProbability: 0.25,
          balkCondition: { variable: 'Queue.Main Queue.length', operator: '>=', value: 3 },
          renegeDist: 'Exponential',
          renegeDistParams: { rate: '0.5' },
        },
      ];
      const model = {
        name: 'Balk RT Model',
        entityTypes: [], stateVariables: [], bEvents: [], cEvents: [],
        queues,
      };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'rt-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.queues).toEqual(queues);
    });

    it('norm() preserves the new Queue fields from a DB row', () => {
      const queues = [
        {
          id: 'q-rt', name: 'Main Queue', customerType: 'Customer', discipline: 'FIFO',
          balkProbability: 0.25,
          balkCondition: { variable: 'Queue.Main Queue.length', operator: '>=', value: 3 },
          renegeDist: 'Exponential',
          renegeDistParams: { rate: '0.5' },
        },
      ];
      const result = norm({
        id: 'm-rt', name: 'Balk RT Model',
        entity_types: [], b_events: [], c_events: [], queues,
        model_json: {},
      });

      expect(result.queues).toEqual(queues);
    });
  });

  // ── round-trip: shiftSchedule `when` (condition-triggered) entries ────────
  describe('round-trip — entityTypes[].shiftSchedule `when` entries survive saveModel + norm()', () => {
    const entityTypes = [
      {
        id: 'srv-rt', name: 'Installer', role: 'server', count: '6', attrDefs: [],
        shiftSchedule: [
          { time: 0, capacity: 6 },
          { when: { variable: 'state.traineesQualified', operator: '>=', value: 20 }, capacity: 8 },
          { when: { variable: 'state.traineesQualified', operator: '>=', value: 40 }, capacity: 10 },
        ],
      },
    ];

    it('the insert payload preserves shiftSchedule `when` entries', async () => {
      const model = {
        name: 'Shift When RT Model',
        entityTypes, stateVariables: [], bEvents: [], cEvents: [], queues: [],
      };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'rt-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.entity_types).toEqual(entityTypes);
    });

    it('norm() preserves shiftSchedule `when` entries from a DB row', () => {
      const result = norm({
        id: 'm-rt', name: 'Shift When RT Model',
        entity_types: entityTypes, b_events: [], c_events: [], queues: [],
        model_json: {},
      });

      expect(result.entityTypes).toEqual(entityTypes);
    });
  });

  // ── round-trip: Lognormal dist/distParams on B-event/C-event schedules (Sprint 86 — F86.5) ──
  describe('round-trip — Lognormal dist/distParams on schedules survive saveModel + norm()', () => {
    const bEvents = [
      {
        id: 'b-rt', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b-rt', dist: 'Lognormal', distParams: { logMean: '1', logStdDev: '0.5' } }],
      },
    ];
    // condition intentionally omitted — its string→object normalization in
    // norm() is unrelated to this round-trip, which targets dist/distParams only.
    const cEvents = [
      {
        id: 'c-rt', name: 'Serve', effect: 'ASSIGN(Customer, Server)',
        cSchedules: [{ id: 'cs-rt', eventId: 'b-rt', dist: 'Lognormal', distParams: { logMean: '2', logStdDev: '0.3' }, useEntityCtx: true }],
      },
    ];

    it('the insert payload preserves Lognormal dist/distParams on bEvents and cEvents', async () => {
      const model = {
        name: 'Lognormal RT Model',
        entityTypes: [], stateVariables: [], queues: [],
        bEvents, cEvents,
      };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'rt-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.b_events).toEqual(bEvents);
      expect(insertArg.c_events).toEqual(cEvents);
    });

    it('norm() preserves Lognormal dist/distParams on bEvents and cEvents from a DB row', () => {
      const result = norm({
        id: 'm-rt', name: 'Lognormal RT Model',
        entity_types: [], b_events: bEvents, c_events: cEvents, queues: [],
        model_json: {},
      });

      expect(result.bEvents).toEqual(bEvents);
      expect(result.cEvents).toEqual(cEvents);
    });
  });

  // ── round-trip: Piecewise cycleLength on B-event schedules ────────────────
  describe('round-trip — Piecewise cycleLength survives saveModel + norm()', () => {
    const bEvents = [
      {
        id: 'b-pw', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer)',
        schedules: [{
          eventId: 'b-pw', dist: 'Piecewise',
          distParams: {
            periods: [
              { startTime: '0', dist: 'Exponential', distParams: { mean: '5' } },
              { startTime: '60', dist: 'Exponential', distParams: { mean: '10' } },
            ],
            cycleLength: '10080',
          },
        }],
      },
    ];

    it('the insert payload preserves cycleLength on bEvents', async () => {
      const model = { name: 'Piecewise RT Model', entityTypes: [], stateVariables: [], queues: [], bEvents, cEvents: [] };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'rt-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.b_events).toEqual(bEvents);
      expect(insertArg.b_events[0].schedules[0].distParams.cycleLength).toBe('10080');
    });

    it('norm() preserves cycleLength on bEvents from a DB row', () => {
      const result = norm({
        id: 'm-pw', name: 'Piecewise RT Model',
        entity_types: [], b_events: bEvents, c_events: [], queues: [],
        model_json: {},
      });

      expect(result.bEvents).toEqual(bEvents);
      expect(result.bEvents[0].schedules[0].distParams.cycleLength).toBe('10080');
    });
  });

  // ── round-trip: SchedulePattern arrival-rate distribution on B/C-events ───
  describe('round-trip — SchedulePattern arrival distParams survive saveModel + norm()', () => {
    const arrivalPattern = {
      type: 'weekly', mode: 'absolute',
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '120' }],
      defaultCapacity: '0',
    };
    const bEvents = [
      {
        id: 'b-sp', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b-sp', dist: 'SchedulePattern', distParams: { schedulePattern: arrivalPattern } }],
      },
    ];
    const cEvents = [
      {
        id: 'c-sp', name: 'Serve', effect: 'ASSIGN(Customer, Server)',
        cSchedules: [{ id: 'cs-sp', eventId: 'b-sp', dist: 'SchedulePattern', distParams: { schedulePattern: arrivalPattern }, useEntityCtx: true }],
      },
    ];

    it('the insert payload preserves the schedulePattern object on bEvents and cEvents', async () => {
      const model = { name: 'SchedulePattern RT Model', entityTypes: [], stateVariables: [], queues: [], bEvents, cEvents, epoch: '2026-06-01' };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'rt-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.b_events).toEqual(bEvents);
      expect(insertArg.c_events).toEqual(cEvents);
      expect(insertArg.b_events[0].schedules[0].distParams.schedulePattern).toEqual(arrivalPattern);
    });

    it('norm() preserves the schedulePattern object on bEvents and cEvents from a DB row', () => {
      const result = norm({
        id: 'm-sp', name: 'SchedulePattern RT Model',
        entity_types: [], b_events: bEvents, c_events: cEvents, queues: [],
        model_json: {},
      });

      expect(result.bEvents).toEqual(bEvents);
      expect(result.cEvents).toEqual(cEvents);
      expect(result.cEvents[0].cSchedules[0].distParams.schedulePattern).toEqual(arrivalPattern);
    });
  });

  // ── round-trip: unified condition storage format (Part B) ─────────────────
  // toRow()/saveModel() now normalize string-shaped conditions into the canonical
  // predicate-object form before writing — these fields must never persist as strings.
  describe('round-trip — string-shaped conditions are normalized to predicate objects on save', () => {
    it('a string queues[].balkCondition is normalized to a predicate object in the insert payload', async () => {
      const model = {
        name: 'Balk String RT Model',
        entityTypes: [], stateVariables: [], bEvents: [], cEvents: [],
        queues: [
          { id: 'q-rt', name: 'Main Queue', customerType: 'Customer', discipline: 'FIFO',
            balkCondition: 'queue(Main Queue).length >= 3' },
        ],
      };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'rt-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.queues[0].balkCondition).toEqual({
        variable: 'queue(Main Queue).length', operator: '>=', value: 3,
      });
      expect(insertArg.model_json.queues[0].balkCondition).toEqual({
        variable: 'queue(Main Queue).length', operator: '>=', value: 3,
      });
    });

    it('a string bEvents[].routing[].condition is normalized to a predicate object in the insert payload', async () => {
      const model = {
        name: 'Routing String RT Model',
        entityTypes: [], stateVariables: [], cEvents: [],
        queues: [{ id: 'q-rt', name: 'Main Queue', customerType: 'Customer', discipline: 'FIFO' }],
        bEvents: [
          { id: 'be-rt', name: 'Arrival', scheduledTime: '0', effect: 'ARRIVE(Customer, Main Queue)', schedules: [],
            routing: [{ queueName: 'Main Queue', condition: 'idle(Clerk).count > 0' }] },
        ],
      };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'rt-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.b_events[0].routing[0].condition).toEqual({
        variable: 'idle(Clerk).count', operator: '>', value: 0,
      });
    });

    it('bEvents[].probabilisticRouting[] round-trips through saveModel unchanged (no normalization)', async () => {
      const model = {
        name: 'Probabilistic Routing RT Model',
        entityTypes: [], stateVariables: [], cEvents: [],
        queues: [
          { id: 'q-rt-1', name: 'Queue 2', customerType: 'Customer', discipline: 'FIFO' },
          { id: 'q-rt-2', name: 'Queue 3', customerType: 'Customer', discipline: 'FIFO' },
        ],
        bEvents: [
          { id: 'be-rt', name: 'Triage Complete', scheduledTime: '9999', effect: 'RELEASE(Server)', schedules: [],
            probabilisticRouting: [
              { probability: 0.5, queueName: 'Queue 2' },
              { probability: 0.5, queueName: 'Queue 3' },
            ] },
        ],
      };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'rt-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.b_events[0].probabilisticRouting).toEqual([
        { probability: 0.5, queueName: 'Queue 2' },
        { probability: 0.5, queueName: 'Queue 3' },
      ]);
      expect(insertArg.model_json.bEvents[0].probabilisticRouting).toEqual([
        { probability: 0.5, queueName: 'Queue 2' },
        { probability: 0.5, queueName: 'Queue 3' },
      ]);
    });

    it('a string cEvents[].cSchedules[].when is normalized to a predicate object in the insert payload', async () => {
      const model = {
        name: 'When String RT Model',
        entityTypes: [], stateVariables: [], bEvents: [],
        queues: [{ id: 'q-rt', name: 'Main Queue', customerType: 'Customer', discipline: 'FIFO' }],
        cEvents: [
          { id: 'ce-rt', name: 'Drain', priority: 1, condition: '', effect: 'DRAIN(Tank, 10)',
            cSchedules: [{ eventId: 'ce-rt', when: 'clock > 5' }] },
        ],
      };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'rt-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.c_events[0].cSchedules[0].when).toEqual({
        variable: 'clock', operator: '>', value: 5,
      });
    });

    it('a string cEvents[].condition is normalized to a predicate object via norm() on a DB row', () => {
      const result = norm({
        id: 'm-rt', name: 'Condition String RT Model',
        entity_types: [], b_events: [],
        c_events: [{ id: 'ce-rt', name: 'Serve', priority: 1, condition: 'queue(Main Queue).length > 0', cSchedules: [] }],
        queues: [{ id: 'q-rt', name: 'Main Queue', customerType: 'Customer', discipline: 'FIFO' }],
        model_json: {},
      });

      expect(result.cEvents[0].condition).toEqual({
        variable: 'queue(Main Queue).length', operator: '>', value: 0,
      });
    });
  });

  // ── 71.1.4  Round-trip: model_json.sections survives saveModel insert ────
  describe('round-trip — model_json.sections survives saveModel insert', () => {
    it('the insert payload model_json contains sections from the input object', async () => {
      const sections = [
        { id: 'sec_1', name: 'Triage', color: '#4A90D9', memberIds: ['q1'], entryQueues: [], exitQueues: ['q1'] },
      ];
      const model = { name: 'Sections RT', entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [], sections };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'sec-rt-id', name: model.name, owner_id: 'u1' }], error: null });
      await saveModel(model, 'u1');
      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.sections).toEqual(sections);
    });
  });

  // ── 71.1.5  Null / undefined field handling ───────────────────────────────
  describe('norm() — null and undefined field handling', () => {
    it('defaults dataSources to [] when model_json has no dataSources', () => {
      const result = norm({
        id: 'x',
        name: 'No DS',
        entity_types: [],
        b_events: [],
        c_events: [],
        queues: [],
        model_json: {},
      });
      expect(result.dataSources).toEqual([]);
    });

    it('defaults epoch to null when not present in model_json', () => {
      const result = norm({
        id: 'x',
        name: 'No Epoch',
        entity_types: [],
        b_events: [],
        c_events: [],
        queues: [],
        model_json: {},
      });
      expect(result.epoch).toBeNull();
    });

    it('defaults graph to null when not present in model_json or row', () => {
      const result = norm({
        id: 'x',
        name: 'No Graph',
        entity_types: [],
        b_events: [],
        c_events: [],
        queues: [],
        model_json: {},
      });
      expect(result.graph).toBeNull();
    });

    it('defaults parentModelId to null when parent_model_id is absent', () => {
      const result = norm({
        id: 'x',
        name: 'No Parent',
        entity_types: [],
        b_events: [],
        c_events: [],
        queues: [],
        model_json: {},
      });
      expect(result.parentModelId).toBeNull();
    });

    it('round-trips sections[] through model_json', () => {
      const sections = [
        { id: 'sec_a', name: 'Section A', color: '#4A90D9', memberIds: ['q1', 'et1'], entryQueues: ['q1'], exitQueues: [] },
      ];
      const result = norm({
        id: 'x',
        name: 'Sectioned Model',
        entity_types: [],
        b_events: [],
        c_events: [],
        queues: [],
        model_json: { sections },
      });
      expect(result.sections).toEqual(sections);
    });

    it('defaults sections to empty array when absent from model_json', () => {
      const result = norm({
        id: 'x',
        name: 'No Sections',
        entity_types: [],
        b_events: [],
        c_events: [],
        queues: [],
        model_json: {},
      });
      expect(result.sections).toEqual([]);
    });
  });

  // ── D-1 fix: containerTypes round-trip ───────────────────────────────────
  describe('round-trip — model_json.containerTypes survives saveModel insert', () => {
    it('the insert payload model_json contains containerTypes from the input object', async () => {
      const containerTypes = [
        { id: 'tank_a', capacity: 1000, initialLevel: 0 },
        { id: 'buffer_b' },
      ];
      const model = {
        name: 'Container RT',
        entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [],
        containerTypes,
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'ct-rt-id', name: model.name, owner_id: 'u1' }], error: null });
      await saveModel(model, 'u1');
      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.containerTypes).toEqual(containerTypes);
    });

    it('model_json.containerTypes defaults to [] when not supplied', async () => {
      const model = {
        name: 'No Containers',
        entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [],
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'no-ct-id', name: model.name, owner_id: 'u1' }], error: null });
      await saveModel(model, 'u1');
      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.containerTypes).toEqual([]);
    });
  });

  describe('norm() — deserialises containerTypes from model_json', () => {
    it('reads containerTypes from model_json', () => {
      const containerTypes = [{ id: 'tank_x', capacity: 500 }];
      const result = norm({
        id: 'ct-norm-1', name: 'With Containers',
        entity_types: [], b_events: [], c_events: [], queues: [],
        model_json: { containerTypes },
      });
      expect(result.containerTypes).toEqual(containerTypes);
    });

    it('defaults containerTypes to [] when absent from model_json', () => {
      const result = norm({
        id: 'ct-norm-2', name: 'No Containers',
        entity_types: [], b_events: [], c_events: [], queues: [],
        model_json: {},
      });
      expect(result.containerTypes).toEqual([]);
    });

    it('defaults containerTypes to [] when model_json is absent entirely', () => {
      const result = norm({
        id: 'ct-norm-3', name: 'Legacy Row',
        entity_types: [], b_events: [], c_events: [], queues: [],
      });
      expect(result.containerTypes).toEqual([]);
    });
  });

  // Distance-based transport time adds a top-level `distances` registry
  // (undirected queue-pair distances, consumed by the Distance distribution
  // type). Same shape as containerTypes — lives only in model_json, not a
  // dedicated column — so it gets the identical round-trip test pattern.
  describe('round-trip — model_json.distances survives saveModel insert', () => {
    it('the insert payload model_json contains distances from the input object', async () => {
      const distances = [
        { id: 'd_warehouse_depot', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: 12 },
      ];
      const model = {
        name: 'Distance RT',
        entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [],
        distances,
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'dist-rt-id', name: model.name, owner_id: 'u1' }], error: null });
      await saveModel(model, 'u1');
      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.distances).toEqual(distances);
    });

    it('model_json.distances defaults to [] when not supplied', async () => {
      const model = {
        name: 'No Distances',
        entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [],
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'no-dist-id', name: model.name, owner_id: 'u1' }], error: null });
      await saveModel(model, 'u1');
      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.distances).toEqual([]);
    });
  });

  describe('norm() — deserialises distances from model_json', () => {
    it('reads distances from model_json', () => {
      const distances = [{ id: 'd_x', fromQueue: 'A', toQueue: 'B', distance: 5 }];
      const result = norm({
        id: 'dist-norm-1', name: 'With Distances',
        entity_types: [], b_events: [], c_events: [], queues: [],
        model_json: { distances },
      });
      expect(result.distances).toEqual(distances);
    });

    it('defaults distances to [] when absent from model_json', () => {
      const result = norm({
        id: 'dist-norm-2', name: 'No Distances',
        entity_types: [], b_events: [], c_events: [], queues: [],
        model_json: {},
      });
      expect(result.distances).toEqual([]);
    });

    it('defaults distances to [] when model_json is absent entirely', () => {
      const result = norm({
        id: 'dist-norm-3', name: 'Legacy Row',
        entity_types: [], b_events: [], c_events: [], queues: [],
      });
      expect(result.distances).toEqual([]);
    });
  });

  // ── notes — internal/explanatory field, separate from description ───────
  describe('round-trip — model_json.notes survives saveModel insert', () => {
    it('the insert payload model_json contains notes from the input object', async () => {
      const notes = 'Internal assumption: peak arrivals follow the Q3 forecast.';
      const model = {
        name: 'Notes RT Model',
        entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [],
        notes,
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'notes-rt-id', name: model.name, owner_id: 'u1' }], error: null });
      await saveModel(model, 'u1');
      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.notes).toBe(notes);
    });

    it('model_json.notes is omitted when not supplied', async () => {
      const model = {
        name: 'No Notes',
        entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [],
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'no-notes-id', name: model.name, owner_id: 'u1' }], error: null });
      await saveModel(model, 'u1');
      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.notes).toBeUndefined();
    });
  });

  describe('norm() — deserialises notes from model_json', () => {
    it('reads notes from model_json', () => {
      const result = norm({
        id: 'notes-norm-1', name: 'With Notes',
        entity_types: [], b_events: [], c_events: [], queues: [],
        model_json: { notes: 'Caveat: excludes holiday schedules.' },
      });
      expect(result.notes).toBe('Caveat: excludes holiday schedules.');
    });

    it('defaults notes to "" when absent from model_json', () => {
      const result = norm({
        id: 'notes-norm-2', name: 'No Notes',
        entity_types: [], b_events: [], c_events: [], queues: [],
        model_json: {},
      });
      expect(result.notes).toBe('');
    });

    it('defaults notes to "" when model_json is absent entirely', () => {
      const result = norm({
        id: 'notes-norm-3', name: 'Legacy Row',
        entity_types: [], b_events: [], c_events: [], queues: [],
      });
      expect(result.notes).toBe('');
    });
  });

  // ── Model Library tags — round-trip + scoped update helper ───────────────
  describe('round-trip — tags survive saveModel + norm()', () => {
    it('the insert payload preserves tags as a top-level column', async () => {
      const tags = ['logistics', 'high-volume'];
      const model = {
        name: 'Tagged RT Model',
        entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [],
        tags,
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'tag-rt-id', name: model.name, owner_id: 'u1' }], error: null });
      await saveModel(model, 'u1');
      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.tags).toEqual(tags);
    });

    it('tags defaults to [] when not supplied', async () => {
      const model = {
        name: 'Untagged RT Model',
        entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [],
      };
      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'no-tag-id', name: model.name, owner_id: 'u1' }], error: null });
      await saveModel(model, 'u1');
      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.tags).toEqual([]);
    });

    it('norm() preserves tags from a DB row', () => {
      const tags = ['logistics', 'high-volume'];
      const result = norm({
        id: 'm-tag-rt', name: 'Tagged RT Model',
        entity_types: [], b_events: [], c_events: [], queues: [], tags,
        model_json: {},
      });
      expect(result.tags).toEqual(tags);
    });
  });

  describe('updateModelTags', () => {
    it('updates the tags column scoped to id and owner_id', async () => {
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();

      const result = await updateModelTags('model-1', 'u1', ['alpha', 'beta']);

      expect(supabase.from).toHaveBeenCalledWith('des_models');
      expect(supabase.from('des_models').update).toHaveBeenCalledWith({ tags: ['alpha', 'beta'] });
      expect(supabase.from('des_models').eq).toHaveBeenNthCalledWith(1, 'id', 'model-1');
      expect(supabase.from('des_models').eq).toHaveBeenNthCalledWith(2, 'owner_id', 'u1');
      expect(result).toEqual({ ok: true });
    });

    it('coerces a non-array tags argument to []', async () => {
      supabase.from('des_models').update.mockReturnThis();
      supabase.from('des_models').eq.mockReturnThis();

      await updateModelTags('model-1', 'u1', null);

      expect(supabase.from('des_models').update).toHaveBeenCalledWith({ tags: [] });
    });
  });

  // ── Sprint 71.2 — NODE_ENV guard: schema mismatch throws in dev ───────────
  describe('runDesModelsSelect — NODE_ENV=development throws on schema mismatch', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('throws in development when a schema compatibility error occurs', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      __resetDesModelsSchemaModeForTests();

      supabase.from('des_models').select().or.mockReturnThis();
      supabase.from('des_models').select().contains.mockReturnThis();
      supabase.from('des_models').order
        .mockResolvedValue({
          data: null,
          error: { code: '42703', message: 'column des_models.model_json does not exist' },
        });

      await expect(fetchModels('dev-user')).rejects.toThrow('flow schema mismatch');
    });

    it('does NOT throw in production — silent fallback still runs', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      __resetDesModelsSchemaModeForTests();

      supabase.from('des_models').select().or.mockReturnThis();
      supabase.from('des_models').select().contains.mockReturnThis();
      supabase.from('des_models').order
        // First call: current schema fails
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        // Fallback (legacy): succeeds
        .mockResolvedValueOnce({ data: [], error: null })
        // Remaining parallel calls also need responses
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column des_models.model_json does not exist' } })
        .mockResolvedValueOnce({ data: [], error: null });

      await expect(fetchModels('prod-user')).resolves.not.toThrow();
    });
  });

  // ── round-trip: schedulePattern on entityTypes (Sprint 86 — F86.13) ──────
  describe('round-trip — entityTypes[].schedulePattern survives saveModel + norm()', () => {
    const schedulePattern = {
      type: "weekly",
      periods: [
        { dayOfWeek: 1, start: "09:00", end: "17:00", capacity: 3 },
        { dayOfWeek: 2, start: "09:00", end: "17:00", capacity: 3 },
      ],
      exceptions: [{ date: "2026-12-25", periods: [{ start: "10:00", end: "14:00", capacity: 1 }] }],
    };

    it('preserves schedulePattern in the insert payload', async () => {
      const model = {
        name: 'Schedule Pattern RT Model',
        entityTypes: [
          { id: 'srv', name: 'Server', role: 'server', count: 3, schedulePattern },
        ],
        queues: [{ id: 'q', name: 'Queue', discipline: 'FIFO' }],
        bEvents: [{ id: 'b-rt', name: 'Arrive', effect: ['ARRIVE(Customer)'], schedules: [] }],
        cEvents: [{ id: 'c-rt', name: 'Serve', effect: 'ASSIGN(Customer, Server)', cSchedules: [{ eventId: 'b-rt', useEntityCtx: true }] }],
        epoch: '2026-01-05T09:00:00Z',
      };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'sp-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      const entityType = insertArg.entity_types.find(et => et.id === 'srv');
      expect(entityType.schedulePattern).toEqual(schedulePattern);
    });

    it('norm() preserves schedulePattern from a DB row', () => {
      // entity_types column stores camelCase keys (toRow passes entityTypes directly)
      const result = norm({
        id: 'm-sp', name: 'Schedule Pattern RT Model',
        entity_types: [
          { id: 'srv', name: 'Server', role: 'server', count: 3, schedulePattern },
        ],
        queues: [{ id: 'q', name: 'Queue', discipline: 'FIFO' }],
        b_events: [{ id: 'b-rt', name: 'Arrive', effect: ['ARRIVE(Customer)'], schedules: [] }],
        c_events: [{ id: 'c-rt', name: 'Serve', effect: 'ASSIGN(Customer, Server)', cSchedules: [{ eventId: 'b-rt', useEntityCtx: true }] }],
        model_json: {},
      });

      const entityType = result.entityTypes.find(et => et.id === 'srv');
      expect(entityType.schedulePattern).toEqual(schedulePattern);
    });
  });

  // ── round-trip: model.skills, entityTypes[].skills, entityTypes[].skillProfiles ──
  describe('round-trip — skills registry and skillProfiles survive saveModel + norm()', () => {
    const skills = ['Surgery', 'Triage', 'Consultation'];
    const skillProfiles = [
      { name: 'Surgeon', skills: ['Surgery'], count: 1 },
      { name: 'Generalist', skills: ['Triage', 'Consultation'], weight: 50 },
    ];

    it('preserves model.skills and entityTypes[].skills/skillProfiles in the insert payload', async () => {
      const model = {
        name: 'Skills RT Model',
        skills,
        entityTypes: [
          { id: 'srv', name: 'Doctor', role: 'server', count: 3, skills: ['Consultation'], skillProfiles },
        ],
        queues: [{ id: 'q', name: 'Queue', discipline: 'FIFO' }],
        bEvents: [{ id: 'b-rt', name: 'Arrive', effect: ['ARRIVE(Patient)'], schedules: [] }],
        cEvents: [{ id: 'c-rt', name: 'Serve', effect: 'ASSIGN(Patient, Doctor)', cSchedules: [{ eventId: 'b-rt', useEntityCtx: true }] }],
      };

      supabase.from('des_models').insert.mockReturnThis();
      supabase.from('des_models').select.mockResolvedValueOnce({ data: [{ id: 'skills-id', name: model.name, owner_id: 'u1' }], error: null });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.skills).toEqual(skills);
      const entityType = insertArg.entity_types.find(et => et.id === 'srv');
      expect(entityType.skills).toEqual(['Consultation']);
      expect(entityType.skillProfiles).toEqual(skillProfiles);
    });

    it('norm() preserves model.skills and entityTypes[].skills/skillProfiles from a DB row', () => {
      const result = norm({
        id: 'm-skills', name: 'Skills RT Model',
        entity_types: [
          { id: 'srv', name: 'Doctor', role: 'server', count: 3, skills: ['Consultation'], skillProfiles },
        ],
        queues: [{ id: 'q', name: 'Queue', discipline: 'FIFO' }],
        b_events: [{ id: 'b-rt', name: 'Arrive', effect: ['ARRIVE(Patient)'], schedules: [] }],
        c_events: [{ id: 'c-rt', name: 'Serve', effect: 'ASSIGN(Patient, Doctor)', cSchedules: [{ eventId: 'b-rt', useEntityCtx: true }] }],
        model_json: { skills },
      });

      expect(result.skills).toEqual(skills);
      const entityType = result.entityTypes.find(et => et.id === 'srv');
      expect(entityType.skills).toEqual(['Consultation']);
      expect(entityType.skillProfiles).toEqual(skillProfiles);
    });
  });
});
