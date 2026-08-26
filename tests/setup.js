import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // jsdom's localStorage/sessionStorage are tied to the environment, not to
  // any one test file — under vitest 3 the same jsdom environment can be
  // reused across files that land on the same worker, so a value one file's
  // component writes (e.g. BottomPanel.jsx's "des.bottomPanel.tab" preference)
  // can leak into a later, unrelated file's fresh render and change what it
  // defaults to. Clear both after every test, same rationale as clearAllMocks.
  try { globalThis.localStorage?.clear(); } catch { /* storage unavailable outside jsdom */ }
  try { globalThis.sessionStorage?.clear(); } catch { /* storage unavailable outside jsdom */ }
});

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

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
