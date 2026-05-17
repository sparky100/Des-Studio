import { describe, test, expect, vi } from 'vitest';
import { AdapterRegistry, nullRegistry } from '../index.js';
import { makeMockAdapter } from '../mockAdapter.js';
import { buildEngine } from '../../index.js';

// ── nullRegistry ──────────────────────────────────────────────────────────────

describe('nullRegistry', () => {
  test('resolve returns distParams unchanged', () => {
    const dp = { mean: '2.5' };
    expect(nullRegistry.resolve(dp, undefined)).toBe(dp);
    expect(nullRegistry.resolve(dp, null)).toBe(dp);
    expect(nullRegistry.resolve(dp, { sourceId: 'any', field: 'f' })).toBe(dp);
  });

  test('prefetchAll resolves without error', async () => {
    await expect(nullRegistry.prefetchAll()).resolves.toBeUndefined();
  });
});

// ── makeMockAdapter ───────────────────────────────────────────────────────────

describe('makeMockAdapter', () => {
  test('returns null before prefetch', () => {
    const m = makeMockAdapter({ rate: 3.5 });
    expect(m.getLatest('rate')).toBeNull();
  });

  test('returns configured value after prefetch', async () => {
    const m = makeMockAdapter({ rate: 3.5 });
    await m.prefetch();
    expect(m.getLatest('rate')).toBe(3.5);
  });

  test('returns null for unknown field after prefetch', async () => {
    const m = makeMockAdapter({ rate: 3.5 });
    await m.prefetch();
    expect(m.getLatest('unknown_field')).toBeNull();
  });

  test('returns string values as-is', async () => {
    const m = makeMockAdapter({ label: 'high' });
    await m.prefetch();
    expect(m.getLatest('label')).toBe('high');
  });

  test('wasFetched() reflects prefetch state', async () => {
    const m = makeMockAdapter({});
    expect(m.wasFetched()).toBe(false);
    await m.prefetch();
    expect(m.wasFetched()).toBe(true);
  });

  test('callLog() records getLatest calls', async () => {
    const m = makeMockAdapter({ a: 1, b: 2 });
    await m.prefetch();
    m.getLatest('a');
    m.getLatest('b');
    m.getLatest('a');
    expect(m.callLog()).toEqual(['a', 'b', 'a']);
  });

  test('setField() updates value dynamically', async () => {
    const m = makeMockAdapter({ rate: 1.0 });
    await m.prefetch();
    expect(m.getLatest('rate')).toBe(1.0);
    m.setField('rate', 5.0);
    expect(m.getLatest('rate')).toBe(5.0);
  });

  test('dispose() resets state', async () => {
    const m = makeMockAdapter({ rate: 1.0 });
    await m.prefetch();
    m.dispose();
    expect(m.wasFetched()).toBe(false);
    expect(m.getLatest('rate')).toBeNull();
  });
});

// ── AdapterRegistry ───────────────────────────────────────────────────────────

describe('AdapterRegistry.resolve', () => {
  function makeRegistry(fields = { mean_mins: 4.0 }) {
    const registry = new AdapterRegistry([{ id: 'ds1', type: 'mock', label: 'Test' }]);
    const mock = makeMockAdapter(fields);
    registry.registerMock('ds1', mock);
    return { registry, mock };
  }

  test('returns distParams unchanged when no paramSource', async () => {
    const { registry, mock } = makeRegistry();
    await mock.prefetch();
    const dp = { mean: '2.0' };
    expect(registry.resolve(dp, undefined)).toBe(dp);
    expect(registry.resolve(dp, null)).toBe(dp);
  });

  test('returns distParams unchanged for unknown sourceId', async () => {
    const { registry, mock } = makeRegistry();
    await mock.prefetch();
    const dp = { mean: '2.0' };
    const ps = { sourceId: 'nonexistent', field: 'x', fallback: '9.9' };
    expect(registry.resolve(dp, ps)).toBe(dp);
  });

  test('substitutes live value into targetParam key', async () => {
    const { registry, mock } = makeRegistry({ mean_mins: 4.0 });
    await mock.prefetch();
    const result = registry.resolve(
      { mean: '2.0' },
      { sourceId: 'ds1', field: 'mean_mins', targetParam: 'mean' }
    );
    expect(result).toEqual({ mean: '4' });
  });

  test('substitutes live value into first distParams key when targetParam omitted', async () => {
    const { registry, mock } = makeRegistry({ rate: 7.5 });
    await mock.prefetch();
    const result = registry.resolve(
      { mean: '2.0' },
      { sourceId: 'ds1', field: 'rate' }
    );
    expect(result).toEqual({ mean: '7.5' });
  });

  test('uses fallback when adapter not yet fetched', () => {
    const { registry } = makeRegistry({ mean_mins: 4.0 });
    // No prefetch — getLatest returns null
    const result = registry.resolve(
      { mean: '2.0' },
      { sourceId: 'ds1', field: 'mean_mins', targetParam: 'mean', fallback: '3.0' }
    );
    expect(result).toEqual({ mean: '3.0' });
  });

  test('returns static distParams when no fallback and adapter not fetched', () => {
    const { registry } = makeRegistry({ mean_mins: 4.0 });
    const dp = { mean: '2.0' };
    const result = registry.resolve(dp, { sourceId: 'ds1', field: 'mean_mins', targetParam: 'mean' });
    expect(result).toBe(dp);
  });

  test('does not mutate original distParams', async () => {
    const { registry, mock } = makeRegistry({ mean_mins: 9.9 });
    await mock.prefetch();
    const original = { mean: '2.0' };
    const result = registry.resolve(original, { sourceId: 'ds1', field: 'mean_mins', targetParam: 'mean' });
    expect(original.mean).toBe('2.0');
    expect(result.mean).toBe('9.9');
  });
});

describe('AdapterRegistry.prefetchAll', () => {
  test('calls prefetch on all registered adapters', async () => {
    const registry = new AdapterRegistry([
      { id: 'ds1', type: 'mock', label: 'A' },
      { id: 'ds2', type: 'mock', label: 'B' },
    ]);
    const m1 = makeMockAdapter({ x: 1 });
    const m2 = makeMockAdapter({ y: 2 });
    registry.registerMock('ds1', m1);
    registry.registerMock('ds2', m2);

    await registry.prefetchAll();
    expect(m1.wasFetched()).toBe(true);
    expect(m2.wasFetched()).toBe(true);
  });
});

describe('AdapterRegistry credential resolution', () => {
  test('resolves {{env.VAR}} placeholders from envSecrets', () => {
    const registry = new AdapterRegistry(
      [{ id: 'ds1', type: 'rest', label: 'Secure', url: 'https://example.com', authHeader: 'Authorization', authSecret: '{{env.API_KEY}}' }],
      { API_KEY: 'Bearer secret-token' }
    );
    // Attempt to construct the adapter — RestAdapter constructor should get resolved secret
    // We can verify indirectly: _resolveSecret returns the resolved value
    expect(registry._resolveSecret('{{env.API_KEY}}')).toBe('Bearer secret-token');
    expect(registry._resolveSecret('{{env.MISSING}}')).toBe('');
    expect(registry._resolveSecret('plain-value')).toBe('plain-value');
  });
});

// ── Engine integration — backwards compatibility ──────────────────────────────

describe('buildEngine with registry', () => {
  const baseModel = {
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
        condition: 'Queue.undefined.length > 0 || true',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [{ eventId: 'b2', dist: 'Fixed', distParams: { value: '3' }, useEntityCtx: true }],
      },
    ],
    queues: [{ id: 'q1', name: 'MainQueue', discipline: 'FIFO', customerType: 'Customer' }],
  };

  test('runs without registry — existing behaviour preserved', () => {
    const engine = buildEngine(baseModel, 42, 0, 30);
    const result = engine.runAll();
    expect(result).toBeDefined();
    expect(typeof result.snap.clock).toBe('number');
  });

  test('runs with nullRegistry — identical behaviour', () => {
    const engine1 = buildEngine(baseModel, 42, 0, 30);
    const engine2 = buildEngine(baseModel, 42, 0, 30, null, 5000, 500, false, nullRegistry);
    expect(engine1.runAll().snap.clock).toBe(engine2.runAll().snap.clock);
  });

  test('live value from mockAdapter changes inter-arrival time', async () => {
    // Static model uses Fixed inter-arrival = 5; live source says 2
    const registry = new AdapterRegistry([{ id: 'ds_arr', type: 'mock', label: 'Arrivals' }]);
    const mock = makeMockAdapter({ interarrival: 2 });
    await mock.prefetch();
    registry.registerMock('ds_arr', mock);

    const liveModel = {
      ...baseModel,
      bEvents: [
        {
          id: 'b1', name: 'Arrive', scheduledTime: '0',
          effect: 'ARRIVE(Customer)',
          schedules: [{
            eventId: 'b1', dist: 'Fixed', distParams: { value: '5' },
            paramSource: { sourceId: 'ds_arr', field: 'interarrival', targetParam: 'value' },
            isRenege: false,
          }],
        },
        { id: 'b2', name: 'Done', scheduledTime: '999', effect: 'COMPLETE()', schedules: [] },
      ],
    };

    const staticEngine = buildEngine(baseModel, 42, 0, 20);
    const liveEngine   = buildEngine(liveModel, 42, 0, 20, null, 5000, 500, false, registry);

    const staticResult = staticEngine.runAll();
    const liveResult   = liveEngine.runAll();

    // With interarrival=2 the live run should produce more arrivals than static (interarrival=5)
    const staticArrivals = staticResult.snap.entities.filter(e => e.type === 'Customer').length;
    const liveArrivals   = liveResult.snap.entities.filter(e => e.type === 'Customer').length;
    expect(liveArrivals).toBeGreaterThan(staticArrivals);
  });

  test('live value falls back to static when adapter not fetched', () => {
    const registry = new AdapterRegistry([{ id: 'ds_arr', type: 'mock', label: 'Arrivals' }]);
    const mock = makeMockAdapter({ interarrival: 2 }); // NOT prefetched
    registry.registerMock('ds_arr', mock);

    const liveModel = {
      ...baseModel,
      bEvents: [
        {
          id: 'b1', name: 'Arrive', scheduledTime: '0',
          effect: 'ARRIVE(Customer)',
          schedules: [{
            eventId: 'b1', dist: 'Fixed', distParams: { value: '5' },
            paramSource: { sourceId: 'ds_arr', field: 'interarrival', targetParam: 'value', fallback: '5' },
            isRenege: false,
          }],
        },
        { id: 'b2', name: 'Done', scheduledTime: '999', effect: 'COMPLETE()', schedules: [] },
      ],
    };

    // Should not throw; falls back to distParams.value = '5'
    const engine = buildEngine(liveModel, 42, 0, 20, null, 5000, 500, false, registry);
    expect(() => engine.runAll()).not.toThrow();
  });
});
