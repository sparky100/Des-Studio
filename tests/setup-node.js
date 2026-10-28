import { afterEach, beforeEach, vi } from 'vitest';

// Yield one macrotask before every test. Vitest runs a file's synchronous
// tests back to back, and awaiting a synchronous test only drains microtasks,
// so the worker never reads its RPC replies until the file finishes. A file of
// full simulations that runs past 60 s (benchmarks.test.js takes ~62 s on a
// slow GitHub runner) then fails with "[vitest-worker]: Timeout calling
// onTaskUpdate" even though every test passed. Reproduced with three 22 s
// synchronous tests in one file; this hook fixes it.
beforeEach(() => new Promise(resolve => setImmediate(resolve)));

afterEach(() => {
  vi.clearAllMocks();
});

// Mock Supabase client — never hit real DB in tests
const mockQuery = {
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
  single: vi.fn().mockResolvedValue({ data: null, error: null }), // Default single return
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
};

const mockSupabase = {
  from: vi.fn(() => mockQuery),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    setSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
};

vi.mock('../src/db/supabase.js', () => ({
  supabase: mockSupabase,
  touchLastActive: vi.fn().mockResolvedValue({ data: null, error: null }),
}));
