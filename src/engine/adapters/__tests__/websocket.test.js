// adapters/__tests__/websocket.test.js — WebSocketAdapter unit tests
//
// Uses a mock WebSocket factory (injected via _wsFactory option) so that no
// real network calls are made in Node/jsdom environments.

import { describe, test, expect, vi } from 'vitest';
import { WebSocketAdapter } from '../WebSocketAdapter.js';

/**
 * Creates a mock WebSocket factory.
 * Returns { factory, instances } where instances[] holds every WS created.
 *
 * Each mock WS instance exposes:
 *   .onopen, .onmessage, .onerror, .onclose  -- set by WebSocketAdapter
 *   .send(data)                              -- spy
 *   .close()                                 -- spy; also sets .readyState = CLOSED
 *   .readyState                              -- 0 = CONNECTING, 1 = OPEN, 3 = CLOSED
 *   .triggerOpen()                           -- simulate connection open
 *   .triggerMessage(data)                    -- simulate incoming message (auto-JSON)
 *   .triggerError()                          -- simulate error event
 *   .triggerClose()                          -- simulate close event
 */
function makeMockWsFactory() {
  const instances = [];

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0; // CONNECTING
      this.onopen    = null;
      this.onmessage = null;
      this.onerror   = null;
      this.onclose   = null;
      this.send  = vi.fn();
      this.close = vi.fn().mockImplementation(() => {
        this.readyState = 3; // CLOSED
        this.onclose?.({ code: 1000, reason: 'test close' });
      });
      instances.push(this);
    }

    triggerOpen() {
      this.readyState = 1; // OPEN
      this.onopen?.({});
    }

    triggerMessage(data) {
      const raw = typeof data === 'string' ? data : JSON.stringify(data);
      this.onmessage?.({ data: raw });
    }

    triggerError() {
      this.onerror?.({ type: 'error' });
    }

    triggerClose() {
      this.readyState = 3;
      this.onclose?.({ code: 1000, reason: 'test' });
    }
  }

  return { factory: MockWebSocket, instances };
}

function makeSource(overrides = {}) {
  return { id: 'ds_ws', type: 'websocket', label: 'Test WS', url: 'ws://localhost:8080', ...overrides };
}

// ── Test 1: getLatest() returns null before first message ─────────────────────

describe('WebSocketAdapter', () => {
  test('getLatest returns null before first message', () => {
    const { factory } = makeMockWsFactory();
    const adapter = new WebSocketAdapter(makeSource(), { _wsFactory: factory });
    expect(adapter.getLatest('mean_rate')).toBeNull();
    expect(adapter.getLatest('some.nested.field')).toBeNull();
  });

  // ── Test 2: getLatest() returns value after first message ──────────────────

  test('getLatest returns value after first message', async () => {
    const { factory, instances } = makeMockWsFactory();
    const adapter = new WebSocketAdapter(makeSource(), { _wsFactory: factory });

    const prefetchPromise = adapter.prefetch();
    // Simulate connection open then first message
    instances[0].triggerOpen();
    instances[0].triggerMessage({ mean_rate: 4.2 });

    await prefetchPromise;
    expect(adapter.getLatest('mean_rate')).toBe(4.2);
  });

  // ── Test 3: getLatest() returns updated value after second message ─────────

  test('getLatest returns updated value after second message', async () => {
    const { factory, instances } = makeMockWsFactory();
    const adapter = new WebSocketAdapter(makeSource(), { _wsFactory: factory });

    const prefetchPromise = adapter.prefetch();
    instances[0].triggerOpen();
    instances[0].triggerMessage({ mean_rate: 4.2 });
    await prefetchPromise;

    expect(adapter.getLatest('mean_rate')).toBe(4.2);

    // Second message arrives
    instances[0].triggerMessage({ mean_rate: 7.8 });
    expect(adapter.getLatest('mean_rate')).toBe(7.8);
  });

  // ── Test 4: dot-notation field extraction ────────────────────────────────────

  test('dot-notation field extraction works', async () => {
    const { factory, instances } = makeMockWsFactory();
    const adapter = new WebSocketAdapter(makeSource(), { _wsFactory: factory });

    const prefetchPromise = adapter.prefetch();
    instances[0].triggerOpen();
    instances[0].triggerMessage({ data: { metrics: { rate: 3.14 } } });
    await prefetchPromise;

    expect(adapter.getLatest('data.metrics.rate')).toBe(3.14);
    expect(adapter.getLatest('data.metrics')).toEqual({ rate: 3.14 });
    expect(adapter.getLatest('data.missing')).toBeNull();
  });

  // ── Test 5: dispose() closes the connection ──────────────────────────────────

  test('dispose closes the WebSocket connection', async () => {
    const { factory, instances } = makeMockWsFactory();
    const adapter = new WebSocketAdapter(makeSource(), { _wsFactory: factory });

    const prefetchPromise = adapter.prefetch();
    instances[0].triggerOpen();
    instances[0].triggerMessage({ rate: 1.0 });
    await prefetchPromise;

    adapter.dispose();
    expect(instances[0].close).toHaveBeenCalledOnce();
  });

  // ── Additional: error before environment has WebSocket ────────────────────

  test('prefetch throws clear error when WebSocket not available', async () => {
    // Temporarily hide the global WebSocket so we can test the "not available" path.
    // Node 22+ has a global WebSocket; we need to simulate an environment without it.
    const saved = globalThis.WebSocket;
    try {
      globalThis.WebSocket = undefined;
      const adapter = new WebSocketAdapter(makeSource());
      await expect(adapter.prefetch()).rejects.toThrow('WebSocket not available in this environment');
    } finally {
      globalThis.WebSocket = saved;
    }
  });

  // ── Additional: getLastMessageTime() returns null before any message ──────

  test('getLastMessageTime returns null before any message', () => {
    const { factory } = makeMockWsFactory();
    const adapter = new WebSocketAdapter(makeSource(), { _wsFactory: factory });
    expect(adapter.getLastMessageTime()).toBeNull();
  });

  // ── Additional: getLastMessageTime() returns timestamp after message ──────

  test('getLastMessageTime returns timestamp after message', async () => {
    const { factory, instances } = makeMockWsFactory();
    const adapter = new WebSocketAdapter(makeSource(), { _wsFactory: factory });

    const before = Date.now();
    const prefetchPromise = adapter.prefetch();
    instances[0].triggerOpen();
    instances[0].triggerMessage({ rate: 5.0 });
    await prefetchPromise;
    const after = Date.now();

    const ts = adapter.getLastMessageTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
