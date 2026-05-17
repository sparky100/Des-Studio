import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { RestAdapter, AdapterFetchError } from '../RestAdapter.js';
import { SnapshotAdapter } from '../SnapshotAdapter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFetchResponse(status, body, options = {}) {
  const { jsonThrows = false } = options;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jsonThrows
      ? () => Promise.reject(new SyntaxError('Unexpected token'))
      : () => Promise.resolve(body),
  };
}

function makeSource(url = 'https://example.com/api') {
  return { id: 'ds1', type: 'rest', label: 'Test', url, refreshSecs: 60 };
}

function makeSnapshotSource(url = 'https://example.com/snapshot') {
  return { id: 'ds_snap', type: 'snapshot', label: 'Snap', url };
}

const VALID_SNAPSHOT = {
  clock: 42,
  entities: [],
  queues: {},
};

// ── RestAdapter error paths ───────────────────────────────────────────────────

describe('RestAdapter — HTTP 4xx: no retry, immediate throw', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  test('throws AdapterFetchError immediately on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(404, null)));

    const adapter = new RestAdapter(makeSource());
    await expect(adapter.prefetch()).rejects.toMatchObject({
      name: 'AdapterFetchError',
      status: 404,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('throws AdapterFetchError immediately on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(401, null)));

    const adapter = new RestAdapter(makeSource());
    await expect(adapter.prefetch()).rejects.toMatchObject({
      name: 'AdapterFetchError',
      status: 401,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('RestAdapter — HTTP 5xx: retries 3 times then throws', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  test('retries on 503 and throws AdapterFetchError after 3 attempts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(503, null)));

    const adapter = new RestAdapter(makeSource());
    const promise = adapter.prefetch();
    promise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({
      name: 'AdapterFetchError',
      status: 503,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('retries on 500 and throws AdapterFetchError after 3 attempts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(500, null)));

    const adapter = new RestAdapter(makeSource());
    const promise = adapter.prefetch();
    promise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ name: 'AdapterFetchError' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe('RestAdapter — malformed JSON', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  test('throws AdapterFetchError with "Malformed JSON response" message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(200, null, { jsonThrows: true })));

    const adapter = new RestAdapter(makeSource());
    await expect(adapter.prefetch()).rejects.toMatchObject({
      name: 'AdapterFetchError',
      message: 'Malformed JSON response',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('RestAdapter — network error: retries then throws', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  test('retries on network error and throws after 3 attempts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const adapter = new RestAdapter(makeSource());
    const promise = adapter.prefetch();
    promise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ name: 'AdapterFetchError' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe('RestAdapter — successful retry after one failure', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  test('succeeds on second attempt when first returns 503', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(makeFetchResponse(503, null))
      .mockResolvedValueOnce(makeFetchResponse(200, { rate: 2.5 }))
    );

    const adapter = new RestAdapter(makeSource());
    const promise = adapter.prefetch();

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(adapter.getLatest('rate')).toBe(2.5);
  });

  test('succeeds on third attempt after two network errors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(makeFetchResponse(200, { value: 9.9 }))
    );

    const adapter = new RestAdapter(makeSource());
    const promise = adapter.prefetch();

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(adapter.getLatest('value')).toBe(9.9);
  });
});

// ── AdapterFetchError class ───────────────────────────────────────────────────

describe('AdapterFetchError', () => {
  test('has correct name and status', () => {
    const err = new AdapterFetchError('something went wrong', 503);
    expect(err.name).toBe('AdapterFetchError');
    expect(err.status).toBe(503);
    expect(err.message).toBe('something went wrong');
    expect(err instanceof Error).toBe(true);
  });

  test('status defaults to null', () => {
    const err = new AdapterFetchError('no status');
    expect(err.status).toBeNull();
  });
});

// ── SnapshotAdapter error paths ───────────────────────────────────────────────

describe('SnapshotAdapter — HTTP 4xx: no retry, immediate throw', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  test('throws AdapterFetchError immediately on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(404, null)));

    const adapter = new SnapshotAdapter(makeSnapshotSource());
    await expect(adapter.prefetch()).rejects.toMatchObject({
      name: 'AdapterFetchError',
      status: 404,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('throws AdapterFetchError immediately on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(403, null)));

    const adapter = new SnapshotAdapter(makeSnapshotSource());
    await expect(adapter.prefetch()).rejects.toMatchObject({
      name: 'AdapterFetchError',
      status: 403,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('SnapshotAdapter — HTTP 5xx: retries and eventually throws', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  test('retries on 503 and throws AdapterFetchError after 3 attempts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(503, null)));

    const adapter = new SnapshotAdapter(makeSnapshotSource());
    const promise = adapter.prefetch();
    promise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({
      name: 'AdapterFetchError',
      status: 503,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('succeeds on retry after one 503', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(makeFetchResponse(503, null))
      .mockResolvedValueOnce(makeFetchResponse(200, VALID_SNAPSHOT))
    );

    const adapter = new SnapshotAdapter(makeSnapshotSource());
    const promise = adapter.prefetch();

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(adapter.getSnapshot()).toMatchObject({ clock: 42 });
  });
});
