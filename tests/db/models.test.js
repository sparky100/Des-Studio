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
            _trimmed_fields: expect.arrayContaining(['log', 'entitySummary', 'timeSeries', 'waitDist.values']),
            runtimeMetrics: expect.objectContaining({
              wall_clock_ms: 42,
              events_processed: 9,
              max_queue_length_by_queue: { Main: 2 },
            }),
            waitDist: expect.objectContaining({
              Main: expect.objectContaining({ n: 2, mean: 3, p99: 4 }),
            }),
            logSummary: expect.objectContaining({ entries: 1, finalMessage: 'Run finished' }),
            entitySummaryCompact: expect.objectContaining({ totalEntities: 1 }),
          }),
        })
      );

      const insertedPayload = supabase.from('simulation_runs').insert.mock.calls.at(-1)[0];
      expect(insertedPayload.results_json.log).toBeUndefined();
      expect(insertedPayload.results_json.entitySummary).toBeUndefined();
      expect(insertedPayload.results_json.timeSeries).toBeUndefined();
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
            entitySummaryCompact: expect.objectContaining({ totalEntities: 400 }),
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

    it('fetchRunHistory falls back to results_json summary when top-level metrics are zeroed', async () => {
      supabase.from('simulation_runs').limit.mockResolvedValueOnce({
        data: [{
          id: 'run-1',
          ran_at: '2026-05-09T11:00:00Z',
          total_arrived: 0,
          total_served: 0,
          total_reneged: 0,
          avg_wait_time: 0,
          avg_service_time: 0,
          renege_rate: 0,
          duration_ms: null,
          replications: 1,
          seed: 42,
          max_simulation_time: 500,
          warmup_period: 0,
          ai_insights: null,
          run_label: '',
          tags: [],
          archived: false,
          version_id: null,
          model_versions: null,
          results_json: {
            runLabel: 'Recovered run',
            summary: { total: 100, served: 95, reneged: 5, avgWait: 8.2, avgSvc: 1.1 },
          },
        }],
        error: null,
      });

      const [row] = await fetchRunHistory('model-1');

      expect(row.run_label).toBe('Recovered run');
      expect(row.total_arrived).toBe(100);
      expect(row.total_served).toBe(95);
      expect(row.total_reneged).toBe(5);
      expect(row.avg_wait_time).toBe(8.2);
      expect(row.avg_service_time).toBe(1.1);
      expect(row.renege_rate).toBeCloseTo(0.05);
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
  // Earlier describe blocks (share links, sweeps, getRun) override supabase.from.mockReturnValue,
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
      supabase.from('des_models').select.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({
        data: { id: 'new-id', name: model.name, owner_id: 'u1' },
        error: null,
      });

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
      supabase.from('des_models').select.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({
        data: { id: 'new-id-2', name: model.name, owner_id: 'u1' },
        error: null,
      });

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
      supabase.from('des_models').select.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({
        data: { id: 'x', name: model.name, owner_id: 'u1' },
        error: null,
      });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      const json = insertArg.model_json;
      const undefinedKeys = Object.keys(json).filter(k => json[k] === undefined);
      expect(undefinedKeys).toHaveLength(0);
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
      supabase.from('des_models').select.mockReturnThis();
      supabase.from('des_models').single.mockResolvedValueOnce({
        data: { id: 'rt-id', name: model.name, owner_id: 'u1' },
        error: null,
      });

      await saveModel(model, 'u1');

      const insertArg = supabase.from('des_models').insert.mock.calls[0][0];
      expect(insertArg.model_json.dataSources).toEqual(dataSources);
    });
  });

  // ── 71.1.4  Null / undefined field handling ───────────────────────────────
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

      await expect(fetchModels('dev-user')).rejects.toThrow('DES Studio schema mismatch');
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
});
