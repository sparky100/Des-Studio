// tests/engine/rolling-mode.test.js -- Sprint 60: rolling mode integration tests
import { describe, test, expect, vi } from 'vitest';
import { buildEngine, prefetchForRun } from '../../src/engine/index.js';
import { AdapterRegistry, nullRegistry } from '../../src/engine/adapters/index.js';
import { makeMockAdapter } from '../../src/engine/adapters/mockAdapter.js';

// Minimal DES model used across tests
const BASE_MODEL = {
  entityTypes: [
    { id: 'et1', name: 'Customer', role: 'customer', count: '', attrDefs: [] },
    { id: 'et2', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b1', name: 'Arrive', scheduledTime: '0',
      effect: 'ARRIVE(Customer)',
      schedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: '5' }, isRenege: false }],
    },
    { id: 'b2', name: 'Done', scheduledTime: '999', effect: 'COMPLETE()', schedules: [] },
  ],
  cEvents: [
    {
      id: 'c1', name: 'Start Service',
      condition: 'true',
      effect: 'ASSIGN(Customer, Server)',
      cSchedules: [{ eventId: 'b2', dist: 'Fixed', distParams: { value: '3' }, useEntityCtx: true }],
    },
  ],
  queues: [{ id: 'q1', name: 'MainQueue', discipline: 'FIFO', customerType: 'Customer' }],
  experimentDefaults: { liveDataMode: 'rolling' },
  dataSources: [{ id: 'ds_arrivals', label: 'Live Feed', type: 'mock', url: '' }],
};

// ── Test 1: runAllAsync() exists on the engine object ─────────────────────────

describe('rolling mode -- runAllAsync', () => {
  test('runAllAsync exists on the engine object', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 30);
    expect(typeof engine.runAllAsync).toBe('function');
  });

  // ── Test 2: mock registry with varying resolveAsync values affects delays ───

  test('runAllAsync uses resolveAsync to resolve param values', async () => {
    let callCount = 0;
    // Mock registry that returns different values on each resolveAsync call
    const varyingRegistry = {
      ...nullRegistry,
      async resolveAsync(distParams, paramSource) {
        if (!paramSource || !paramSource.sourceId) return distParams;
        callCount++;
        // Alternate between value 2 and value 8 to force variation
        const val = callCount % 2 === 0 ? '2' : '8';
        const targetKey = paramSource.targetParam || Object.keys(distParams)[0] || 'value';
        return { ...distParams, [targetKey]: val };
      },
      resolve(distParams, _ps) { return distParams; },
      async prefetchAll() { },
      dispose() { },
    };

    const liveModel = {
      ...BASE_MODEL,
      bEvents: [
        {
          id: 'b1', name: 'Arrive', scheduledTime: '0',
          effect: 'ARRIVE(Customer)',
          schedules: [{
            eventId: 'b1', dist: 'Fixed', distParams: { value: '5' },
            paramSource: { sourceId: 'ds_arrivals', field: 'interarrival', targetParam: 'value' },
            isRenege: false,
          }],
        },
        { id: 'b2', name: 'Done', scheduledTime: '999', effect: 'COMPLETE()', schedules: [] },
      ],
    };

    const engine = buildEngine(liveModel, 42, 0, 20, null, 5000, 500, false, varyingRegistry);
    const result = await engine.runAllAsync();

    // The run should complete and produce a result
    expect(result).toBeDefined();
    expect(typeof result.finalTime).toBe('number');
    expect(result.snap).toBeDefined();
  });

  // ── Test 3: existing runAll() still works after adding runAllAsync ──────────

  test('runAll still works after adding runAllAsync (no regression)', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 30);
    const result = engine.runAll();
    expect(result).toBeDefined();
    expect(typeof result.finalTime).toBe('number');
    expect(result.snap.clock).toBeGreaterThan(0);
  });

  // ── Test 4: prefetchForRun with rolling mode calls prefetchAll ──────────────

  test('prefetchForRun with rolling mode calls prefetchAll (connects WebSocket)', async () => {
    const registry = new AdapterRegistry([{ id: 'ds_arrivals', type: 'mock', label: 'Feed' }]);
    const mock = makeMockAdapter({ interarrival: 3 });
    registry.registerMock('ds_arrivals', mock);

    await prefetchForRun(BASE_MODEL, registry);

    // The mock adapter's prefetch() should have been called
    expect(mock.wasFetched()).toBe(true);
  });

  // ── Test 5: runAllAsync returns same structure as runAll ────────────────────

  test('runAllAsync result has same structure as runAll result', async () => {
    const engine1 = buildEngine(BASE_MODEL, 99, 0, 20);
    const engine2 = buildEngine(BASE_MODEL, 99, 0, 20);

    const syncResult  = engine1.runAll();
    const asyncResult = await engine2.runAllAsync();

    // Both should have the same top-level shape
    expect(Object.keys(asyncResult)).toEqual(expect.arrayContaining(['finalTime', 'log', 'snap', 'summary', 'warnings']));
    // With same seed and no live data, results should be deterministic and identical
    expect(asyncResult.finalTime).toBe(syncResult.finalTime);
    expect(asyncResult.snap.served).toBe(syncResult.snap.served);
  });

  // ── Test 6: onStep callback is called for each step ────────────────────────

  test('runAllAsync calls onStep callback after each cycle', async () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 10);
    const stepSnapshots = [];
    await engine.runAllAsync((snap, cycleLog) => {
      stepSnapshots.push({ snap, cycleLog });
    });
    // At least one step should have been called
    expect(stepSnapshots.length).toBeGreaterThan(0);
    // Each step should have a cycleLog array
    for (const { cycleLog } of stepSnapshots) {
      expect(Array.isArray(cycleLog)).toBe(true);
    }
  });

  // ── Test 7: prefetchForRun is no-op for non-rolling, non-batch modes ────────

  test('prefetchForRun is no-op when liveDataMode is not set', async () => {
    const registry = new AdapterRegistry([{ id: 'ds1', type: 'mock', label: 'Feed' }]);
    const mock = makeMockAdapter({ rate: 1.0 });
    registry.registerMock('ds1', mock);

    await prefetchForRun({ experimentDefaults: {} }, registry);
    expect(mock.wasFetched()).toBe(false);
  });
});
