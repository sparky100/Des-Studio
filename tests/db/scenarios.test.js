import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScenario, listScenarios, deleteScenario } from '../../src/db/scenarios.js';
import { supabase } from '../../src/db/supabase.js';

describe('DB Layer: scenarios.js (F-9 named-scenario manager)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createScenario', () => {
    it('inserts a row with param deltas, seed, and replications, and returns the new id', async () => {
      supabase.from('scenarios').single.mockResolvedValueOnce({
        data: { id: 'scenario-1' },
        error: null,
      });

      const id = await createScenario('model-1', 'user-1', {
        name: '  Double clerk staffing  ',
        description: '  two clerks instead of one  ',
        paramDeltas: [{ paramConfig: { path: 'entityTypes.et1.count' }, value: 2 }],
        baseSeed: 42,
        replications: '10',
      });

      expect(id).toBe('scenario-1');
      expect(supabase.from).toHaveBeenCalledWith('scenarios');
      expect(supabase.from('scenarios').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          model_id: 'model-1',
          created_by: 'user-1',
          name: 'Double clerk staffing',
          description: 'two clerks instead of one',
          param_deltas: [{ paramConfig: { path: 'entityTypes.et1.count' }, value: 2 }],
          base_seed: 42,
          replications: 10,
        })
      );
    });

    it('trims a missing description down to an empty string and defaults a missing/invalid replications to 1', async () => {
      supabase.from('scenarios').single.mockResolvedValueOnce({ data: { id: 'scenario-2' }, error: null });

      await createScenario('model-1', 'user-1', {
        name: 'No description',
        paramDeltas: [],
        replications: 'not-a-number',
      });

      expect(supabase.from('scenarios').insert).toHaveBeenCalledWith(
        expect.objectContaining({ description: '', replications: 1, base_seed: null })
      );
    });

    it('throws the raw Supabase error on failure', async () => {
      supabase.from('scenarios').single.mockResolvedValueOnce({
        data: null,
        error: { message: 'insert failed' },
      });

      await expect(createScenario('model-1', 'user-1', { name: 'X', paramDeltas: [] }))
        .rejects.toEqual({ message: 'insert failed' });
    });
  });

  describe('listScenarios', () => {
    it('returns scenarios for a model ordered by creation date', async () => {
      supabase.from('scenarios').order.mockResolvedValueOnce({
        data: [
          { id: 'scenario-1', name: 'A', created_at: '2026-08-01T00:00:00Z' },
          { id: 'scenario-2', name: 'B', created_at: '2026-08-02T00:00:00Z' },
        ],
        error: null,
      });

      const scenarios = await listScenarios('model-1');

      expect(scenarios).toHaveLength(2);
      expect(scenarios[0].id).toBe('scenario-1');
      expect(supabase.from).toHaveBeenCalledWith('scenarios');
      expect(supabase.from('scenarios').eq).toHaveBeenCalledWith('model_id', 'model-1');
      expect(supabase.from('scenarios').order).toHaveBeenCalledWith('created_at', { ascending: true });
    });

    it('returns an empty array rather than null when no scenarios exist', async () => {
      supabase.from('scenarios').order.mockResolvedValueOnce({ data: null, error: null });

      const scenarios = await listScenarios('model-1');

      expect(scenarios).toEqual([]);
    });

    it('throws the raw Supabase error on failure', async () => {
      supabase.from('scenarios').order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

      await expect(listScenarios('model-1')).rejects.toEqual({ message: 'boom' });
    });
  });

  describe('deleteScenario', () => {
    it('deletes by id', async () => {
      supabase.from('scenarios').delete.mockReturnThis();
      supabase.from('scenarios').eq.mockReturnThis();

      await expect(deleteScenario('scenario-1')).resolves.toBeUndefined();

      expect(supabase.from).toHaveBeenCalledWith('scenarios');
      expect(supabase.from('scenarios').delete).toHaveBeenCalled();
      expect(supabase.from('scenarios').eq).toHaveBeenCalledWith('id', 'scenario-1');
    });
  });
});
