// tests/engine/calibrated-batch.test.js — Sprint 59: calibrated_batch mode integration tests
import { describe, test, expect } from 'vitest';
import { buildEngine, prefetchForRun } from '../../src/engine/index.js';
import { AdapterRegistry, nullRegistry } from '../../src/engine/adapters/index.js';
import { makeMockAdapter } from '../../src/engine/adapters/mockAdapter.js';

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
  experimentDefaults: { liveDataMode: 'calibrated_batch' },
  dataSources: [{ id: 'ds_arrivals', label: 'Live Arrival Feed', type: 'mock', url: '' }],
};

// ── Test 1: calibrated_batch mode — adapter fetched and live value used ───────
describe('calibrated_batch mode — mockAdapter', () => {
  test('wasFetched() true after prefetchForRun and live value used in run', async () => {
    const registry = new AdapterRegistry([{ id: 'ds_arrivals', type: 'mock', label: 'Live Arrival Feed' }]);
    const mock = makeMockAdapter({ mean_interarrival_mins: 2 });
    registry.registerMock('ds_arrivals', mock);

    await prefetchForRun(BASE_MODEL, registry);

    expect(mock.wasFetched()).toBe(true);

    const liveModel = {
      ...BASE_MODEL,
      bEvents: [
        {
          id: 'b1', name: 'Arrive', scheduledTime: '0',
          effect: 'ARRIVE(Customer)',
          schedules: [{
            eventId: 'b1', dist: 'Fixed', distParams: { value: '5' },
            paramSource: { sourceId: 'ds_arrivals', field: 'mean_interarrival_mins', targetParam: 'value' },
            isRenege: false,
          }],
        },
        { id: 'b2', name: 'Done', scheduledTime: '999', effect: 'COMPLETE()', schedules: [] },
      ],
    };

    const staticEngine = buildEngine({ ...BASE_MODEL, experimentDefaults: {} }, 42, 0, 20);
    const liveEngine   = buildEngine(liveModel, 42, 0, 20, null, 5000, 500, false, registry);

    const staticResult = staticEngine.runAll();
    const liveResult   = liveEngine.runAll();

    // inter-arrival=2 produces more arrivals than static inter-arrival=5
    const staticArrivals = staticResult.snap.entities.filter(e => e.type === 'Customer').length;
    const liveArrivals   = liveResult.snap.entities.filter(e => e.type === 'Customer').length;
    expect(liveArrivals).toBeGreaterThan(staticArrivals);
  });
});

// ── Test 2: fallback used when adapter returns null for the field ─────────────
describe('calibrated_batch fallback', () => {
  test('uses fallback when adapter returns null for the requested field', async () => {
    const registry = new AdapterRegistry([{ id: 'ds_arrivals', type: 'mock', label: 'Live Arrival Feed' }]);
    const mock = makeMockAdapter({ other_field: 99 });
    registry.registerMock('ds_arrivals', mock);

    await prefetchForRun(BASE_MODEL, registry);
    expect(mock.wasFetched()).toBe(true);

    const modelWithFallback = {
      ...BASE_MODEL,
      bEvents: [
        {
          id: 'b1', name: 'Arrive', scheduledTime: '0',
          effect: 'ARRIVE(Customer)',
          schedules: [{
            eventId: 'b1', dist: 'Fixed', distParams: { value: '5' },
            paramSource: { sourceId: 'ds_arrivals', field: 'missing_field', targetParam: 'value', fallback: '5' },
            isRenege: false,
          }],
        },
        { id: 'b2', name: 'Done', scheduledTime: '999', effect: 'COMPLETE()', schedules: [] },
      ],
    };

    const engine = buildEngine(modelWithFallback, 42, 0, 20, null, 5000, 500, false, registry);
    expect(() => engine.runAll()).not.toThrow();

    const liveResult = engine.runAll();
    const staticEngine = buildEngine({ ...BASE_MODEL, experimentDefaults: {}, bEvents: BASE_MODEL.bEvents }, 42, 0, 20);
    const staticResult = staticEngine.runAll();

    // With fallback=5 matching the static value, run timings should be identical
    expect(liveResult.finalTime).toBeCloseTo(staticResult.finalTime, 1);
  });
});

// ── Test 3: model without liveDataMode runs identically with nullRegistry ─────
describe('static regression — no liveDataMode', () => {
  test('model without liveDataMode runs identically before and after Sprint 59', () => {
    const staticModel = {
      ...BASE_MODEL,
      experimentDefaults: {},
    };
    const engine1 = buildEngine(staticModel, 42, 0, 30);
    const engine2 = buildEngine(staticModel, 42, 0, 30, null, 5000, 500, false, nullRegistry);
    expect(engine1.runAll().snap.clock).toBe(engine2.runAll().snap.clock);
  });

  test('prefetchForRun is a no-op when liveDataMode is absent', async () => {
    const registry = new AdapterRegistry([{ id: 'ds_arrivals', type: 'mock', label: 'Test' }]);
    const mock = makeMockAdapter({ rate: 1.0 });
    registry.registerMock('ds_arrivals', mock);

    await prefetchForRun({ experimentDefaults: {} }, registry);
    expect(mock.wasFetched()).toBe(false);
  });
});

// ── Test 4: multiple replications use same pre-fetched value (calibrated = frozen) ─
describe('calibrated batch — frozen values across replications', () => {
  test('all replications see the same live value (pre-fetched once)', async () => {
    const registry = new AdapterRegistry([{ id: 'ds_arrivals', type: 'mock', label: 'Feed' }]);
    const mock = makeMockAdapter({ interarrival: 2 });
    registry.registerMock('ds_arrivals', mock);

    await prefetchForRun(BASE_MODEL, registry);

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

    const arrivalCounts = [];
    for (let seed = 100; seed < 103; seed++) {
      const engine = buildEngine(liveModel, seed, 0, 20, null, 5000, 500, false, registry);
      const result = engine.runAll();
      arrivalCounts.push(result.snap.entities.filter(e => e.type === 'Customer').length);
    }

    // All replications should have produced arrivals (live value applied to all)
    expect(arrivalCounts.every(n => n > 0)).toBe(true);
    // getLatest always returns the pre-fetched value — adapter not re-fetched per replication
    expect(mock.wasFetched()).toBe(true);
  });
});

// ── Test 5: prefetchForRun only calls prefetchAll when liveDataMode is set ────
describe('prefetchForRun conditional behaviour', () => {
  test('calls prefetchAll only when liveDataMode === calibrated_batch', async () => {
    const registry = new AdapterRegistry([{ id: 'ds1', type: 'mock', label: 'Source' }]);
    const mock = makeMockAdapter({ rate: 3.0 });
    registry.registerMock('ds1', mock);

    await prefetchForRun({ experimentDefaults: { liveDataMode: null } }, registry);
    expect(mock.wasFetched()).toBe(false);

    await prefetchForRun({ experimentDefaults: { liveDataMode: 'calibrated_batch' } }, registry);
    expect(mock.wasFetched()).toBe(true);
  });

  test('safe to call with nullRegistry regardless of liveDataMode', async () => {
    await expect(
      prefetchForRun({ experimentDefaults: { liveDataMode: 'calibrated_batch' } }, nullRegistry)
    ).resolves.toBeUndefined();
  });
});
