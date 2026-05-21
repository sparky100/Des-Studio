import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the supabase module
vi.mock('../../db/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../../db/supabase.js';
import { getNextVersion, listVersions } from '../../db/models.js';

function makeChain(resolvedValue) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolvedValue),
    single: vi.fn().mockResolvedValue(resolvedValue),
    contains: vi.fn().mockReturnThis(),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getNextVersion', () => {
  test('returns 1 when no versions exist', async () => {
    supabase.from.mockReturnValue(makeChain({ data: [], error: null }));
    const next = await getNextVersion('model-123');
    expect(next).toBe(1);
  });

  test('returns max+1 when versions exist', async () => {
    supabase.from.mockReturnValue(makeChain({ data: [{ version: 5 }], error: null }));
    const next = await getNextVersion('model-123');
    expect(next).toBe(6);
  });
});

describe('listVersions', () => {
  test('returns empty array when no versions', async () => {
    const chain = makeChain({ data: [], error: null });
    chain.order = vi.fn().mockResolvedValue({ data: [], error: null });
    supabase.from.mockReturnValue(chain);
    const versions = await listVersions('model-123');
    expect(versions).toEqual([]);
  });

  test('normalises snake_case to camelCase', async () => {
    const row = {
      id: 'v1',
      model_id: 'model-123',
      version: 1,
      name: 'Initial',
      notes: 'First version',
      model_json: { entityTypes: [] },
      is_structural: true,
      created_at: '2026-05-21T00:00:00Z',
      created_by: 'user-abc',
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [row], error: null }),
    };
    supabase.from.mockReturnValue(chain);
    const versions = await listVersions('model-123');
    expect(versions[0].modelId).toBe('model-123');
    expect(versions[0].isStructural).toBe(true);
    expect(versions[0].createdBy).toBe('user-abc');
    expect(versions[0].modelJson).toEqual({ entityTypes: [] });
  });
});
