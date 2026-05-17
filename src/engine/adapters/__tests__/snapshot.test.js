// src/engine/adapters/__tests__/snapshot.test.js — SnapshotAdapter unit tests
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SnapshotAdapter, SnapshotValidationError } from '../SnapshotAdapter.js';
import { AdapterFetchError } from '../RestAdapter.js';

const VALID_SNAPSHOT = {
  clock: 120,
  entities: [
    { type: 'Customer', id: 'e1', attrs: { priority: 1 }, location: 'queue', queueId: 'MainQueue' },
    { type: 'Customer', id: 'e2', attrs: {}, location: 'server' },
  ],
  queues: {
    MainQueue: { waiting: 1, serving: 1 },
  },
};

function makeDataSource(overrides = {}) {
  return {
    id: 'snap-ds',
    label: 'Snapshot Feed',
    type: 'snapshot',
    url: 'https://example.com/snapshot',
    authHeader: '',
    authSecret: '',
    ...overrides,
  };
}

function mockFetch(responseBody, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => responseBody,
  });
}

beforeEach(() => {
  vi.stubGlobal('AbortSignal', {
    timeout: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Test 1: Valid snapshot is parsed and stored ────────────────────────────────

describe('SnapshotAdapter.prefetch — valid snapshot', () => {
  test('fetches, validates, and stores a valid snapshot', async () => {
    vi.stubGlobal('fetch', mockFetch(VALID_SNAPSHOT));

    const adapter = new SnapshotAdapter(makeDataSource());
    await adapter.prefetch();

    const snap = adapter.getSnapshot();
    expect(snap).not.toBeNull();
    expect(snap.clock).toBe(120);
    expect(snap.entities).toHaveLength(2);
    expect(snap.queues.MainQueue.waiting).toBe(1);
  });

  test('includes auth header when authHeader and authSecret are provided', async () => {
    const fetchSpy = mockFetch(VALID_SNAPSHOT);
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new SnapshotAdapter(makeDataSource({
      authHeader: 'Authorization',
      authSecret: 'Bearer token123',
    }));
    await adapter.prefetch();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/snapshot',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token123' },
      })
    );
  });
});

// ── Test 2: Empty entities/queues (valid — system may be idle) ────────────────

describe('SnapshotAdapter.prefetch — empty entities/queues', () => {
  test('accepts snapshot with no entities and empty queues', async () => {
    const emptySnap = { clock: 0, entities: [], queues: {} };
    vi.stubGlobal('fetch', mockFetch(emptySnap));

    const adapter = new SnapshotAdapter(makeDataSource());
    await adapter.prefetch();

    const snap = adapter.getSnapshot();
    expect(snap).not.toBeNull();
    expect(snap.entities).toHaveLength(0);
    expect(snap.queues).toEqual({});
  });
});

// ── Test 3: Missing `clock` field → SnapshotValidationError ───────────────────

describe('SnapshotAdapter.prefetch — validation errors', () => {
  test('throws SnapshotValidationError when clock is missing', async () => {
    const bad = { entities: [], queues: {} };
    vi.stubGlobal('fetch', mockFetch(bad));

    const adapter = new SnapshotAdapter(makeDataSource());
    await expect(adapter.prefetch()).rejects.toThrow(SnapshotValidationError);
    await expect(adapter.prefetch()).rejects.toThrow(/clock/i);
  });

  test('throws SnapshotValidationError when clock is non-finite', async () => {
    const bad = { clock: NaN, entities: [], queues: {} };
    vi.stubGlobal('fetch', mockFetch(bad));

    const adapter = new SnapshotAdapter(makeDataSource());
    await expect(adapter.prefetch()).rejects.toThrow(SnapshotValidationError);
  });

  // ── Test 4: Missing `entities` field ────────────────────────────────────────

  test('throws SnapshotValidationError when entities is missing', async () => {
    const bad = { clock: 0, queues: {} };
    vi.stubGlobal('fetch', mockFetch(bad));

    const adapter = new SnapshotAdapter(makeDataSource());
    await expect(adapter.prefetch()).rejects.toThrow(SnapshotValidationError);
    await expect(adapter.prefetch()).rejects.toThrow(/entities/i);
  });

  test('throws SnapshotValidationError when entities is not an array', async () => {
    const bad = { clock: 0, entities: {}, queues: {} };
    vi.stubGlobal('fetch', mockFetch(bad));

    const adapter = new SnapshotAdapter(makeDataSource());
    await expect(adapter.prefetch()).rejects.toThrow(SnapshotValidationError);
  });

  // ── Test 5: Missing `queues` field ──────────────────────────────────────────

  test('throws SnapshotValidationError when queues is missing', async () => {
    const bad = { clock: 0, entities: [] };
    vi.stubGlobal('fetch', mockFetch(bad));

    const adapter = new SnapshotAdapter(makeDataSource());
    await expect(adapter.prefetch()).rejects.toThrow(SnapshotValidationError);
    await expect(adapter.prefetch()).rejects.toThrow(/queues/i);
  });

  test('throws SnapshotValidationError when queues is an array', async () => {
    const bad = { clock: 0, entities: [], queues: [] };
    vi.stubGlobal('fetch', mockFetch(bad));

    const adapter = new SnapshotAdapter(makeDataSource());
    await expect(adapter.prefetch()).rejects.toThrow(SnapshotValidationError);
  });

  // ── Test 6: Entity with location=queue but no queueId ────────────────────────

  test('throws SnapshotValidationError for queue entity missing queueId', async () => {
    const bad = {
      clock: 10,
      entities: [{ type: 'Customer', id: 'e1', attrs: {}, location: 'queue' }],
      queues: {},
    };
    vi.stubGlobal('fetch', mockFetch(bad));

    const adapter = new SnapshotAdapter(makeDataSource());
    await expect(adapter.prefetch()).rejects.toThrow(SnapshotValidationError);
    await expect(adapter.prefetch()).rejects.toThrow(/queueId/i);
  });

  test('throws SnapshotValidationError for entity missing type', async () => {
    const bad = {
      clock: 10,
      entities: [{ id: 'e1', attrs: {}, location: 'server' }],
      queues: {},
    };
    vi.stubGlobal('fetch', mockFetch(bad));

    const adapter = new SnapshotAdapter(makeDataSource());
    await expect(adapter.prefetch()).rejects.toThrow(SnapshotValidationError);
    await expect(adapter.prefetch()).rejects.toThrow(/type/i);
  });

  test('throws SnapshotValidationError for entity with invalid location', async () => {
    const bad = {
      clock: 10,
      entities: [{ type: 'Customer', id: 'e1', attrs: {}, location: 'unknown' }],
      queues: {},
    };
    vi.stubGlobal('fetch', mockFetch(bad));

    const adapter = new SnapshotAdapter(makeDataSource());
    await expect(adapter.prefetch()).rejects.toThrow(SnapshotValidationError);
    await expect(adapter.prefetch()).rejects.toThrow(/location/i);
  });
});

// ── Test 7: Network error throws AdapterFetchError (not SnapshotValidationError) ─

describe('SnapshotAdapter.prefetch — network error', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('wraps network errors in AdapterFetchError (not SnapshotValidationError)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const adapter = new SnapshotAdapter(makeDataSource());
    const promise = adapter.prefetch();
    promise.catch(() => {});

    await vi.runAllTimersAsync();
    const err = await promise.catch(e => e);
    expect(err).toBeInstanceOf(AdapterFetchError);
    expect(err).not.toBeInstanceOf(SnapshotValidationError);
  });

  test('throws AdapterFetchError on non-OK HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));

    const adapter = new SnapshotAdapter(makeDataSource());
    const promise = adapter.prefetch();
    promise.catch(() => {});

    await vi.runAllTimersAsync();
    const err = await promise.catch(e => e);
    expect(err).toBeInstanceOf(AdapterFetchError);
    expect(err).toMatchObject({ status: 404 });
  });
});

// ── dispose() clears the snapshot ─────────────────────────────────────────────

describe('SnapshotAdapter.dispose', () => {
  test('clears snapshot after dispose', async () => {
    vi.stubGlobal('fetch', mockFetch(VALID_SNAPSHOT));

    const adapter = new SnapshotAdapter(makeDataSource());
    await adapter.prefetch();
    expect(adapter.getSnapshot()).not.toBeNull();

    adapter.dispose();
    expect(adapter.getSnapshot()).toBeNull();
  });
});

// ── getLatest() returns null (not a param-source adapter) ────────────────────

describe('SnapshotAdapter.getLatest', () => {
  test('getLatest always returns null', async () => {
    vi.stubGlobal('fetch', mockFetch(VALID_SNAPSHOT));
    const adapter = new SnapshotAdapter(makeDataSource());
    await adapter.prefetch();
    expect(adapter.getLatest('any_field')).toBeNull();
  });
});
