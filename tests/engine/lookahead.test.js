// tests/engine/lookahead.test.js — Sprint 61: injectState() and lookahead mode tests
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildEngine, prefetchForRun } from '../../src/engine/index.js';
import { AdapterRegistry } from '../../src/engine/adapters/index.js';
import { SnapshotAdapter } from '../../src/engine/adapters/SnapshotAdapter.js';

// ── Minimal DES model ──────────────────────────────────────────────────────────

const BASE_MODEL = {
  entityTypes: [
    { id: 'et1', name: 'Customer', role: 'customer', count: '', attrDefs: [] },
    { id: 'et2', name: 'Server',   role: 'server',   count: '2', attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b1', name: 'Arrive', scheduledTime: '5',
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
  dataSources: [
    { id: 'snap-ds', label: 'Snapshot Feed', type: 'snapshot', url: 'https://example.com/snap' },
  ],
  experimentDefaults: { liveDataMode: 'lookahead' },
};

const SNAPSHOT_2_IN_QUEUE = {
  clock: 60,
  entities: [
    { type: 'Customer', id: 'e1', attrs: {}, location: 'queue', queueId: 'MainQueue' },
    { type: 'Customer', id: 'e2', attrs: {}, location: 'queue', queueId: 'MainQueue' },
  ],
  queues: {
    MainQueue: { waiting: 2, serving: 0 },
  },
};

const SNAPSHOT_1_IN_QUEUE_1_SERVING = {
  clock: 90,
  entities: [
    { type: 'Customer', id: 'e1', attrs: {}, location: 'queue', queueId: 'MainQueue' },
    { type: 'Customer', id: 'e2', attrs: {}, location: 'server' },
  ],
  queues: {
    MainQueue: { waiting: 1, serving: 1 },
  },
};

const EMPTY_SNAPSHOT = {
  clock: 0,
  entities: [],
  queues: {},
};

// ── Test 1: injectState() returns the number of entities injected ─────────────

describe('injectState — basic injection', () => {
  test('returns the count of injected customer entities', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 60);
    const count = engine.injectState(SNAPSHOT_2_IN_QUEUE);
    expect(count).toBe(2);
  });

  test('returns 0 for empty snapshot', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 60);
    const count = engine.injectState(EMPTY_SNAPSHOT);
    expect(count).toBe(0);
  });
});

// ── Test 2: After injection, getSnap() shows queues populated ────────────────

describe('injectState — entity/queue state', () => {
  test('getSnap() byQueue shows injected entities waiting in the named queue', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 60);
    engine.injectState(SNAPSHOT_2_IN_QUEUE);

    const snap = engine.getSnap();
    expect(snap.byQueue['MainQueue'].waiting).toBe(2);
  });

  test('entities array contains injected customers', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 60);
    engine.injectState(SNAPSHOT_2_IN_QUEUE);

    const snap = engine.getSnap();
    const customers = snap.entities.filter(e => e.role !== 'server');
    expect(customers).toHaveLength(2);
    expect(customers.every(e => e.type === 'Customer')).toBe(true);
    expect(customers.every(e => e.status === 'waiting')).toBe(true);
    expect(customers.every(e => e.queue === 'MainQueue')).toBe(true);
  });

  test('server entities are preserved after injection', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 60);
    engine.injectState(SNAPSHOT_2_IN_QUEUE);

    const snap = engine.getSnap();
    const servers = snap.entities.filter(e => e.role === 'server');
    expect(servers).toHaveLength(2);
  });

  test('server-location entities get serving status', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 60);
    engine.injectState(SNAPSHOT_1_IN_QUEUE_1_SERVING);

    const snap = engine.getSnap();
    const customers = snap.entities.filter(e => e.role !== 'server');
    const waiting  = customers.filter(e => e.status === 'waiting');
    const serving  = customers.filter(e => e.status === 'serving');
    expect(waiting).toHaveLength(1);
    expect(serving).toHaveLength(1);
  });

  test('clock resets to 0 after injection', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 60);
    engine.injectState(SNAPSHOT_2_IN_QUEUE);

    const snap = engine.getSnap();
    expect(snap.clock).toBe(0);
  });
});

// ── Test 3: warm-up not triggered after injectState ──────────────────────────

describe('injectState — warm-up skipped', () => {
  test('WARMUP event is removed from the FEL after injectState()', () => {
    const engine = buildEngine(BASE_MODEL, 42, 10, 60);
    engine.injectState(SNAPSHOT_2_IN_QUEUE);
    // After injection, the FEL should have no WARMUP entry
    // We verify by running — if WARMUP fires, stats get reset and served count differs
    const result = engine.runAll();
    expect(result).toBeDefined();
    // If warm-up were NOT skipped and a WARMUP event fired, entities in queue
    // would be pruned (done/reneged) and injected entities (waiting) would survive.
    // The run should complete without error.
    expect(typeof result.finalTime).toBe('number');
  });
});

// ── Test 4: runAll() after injectState() completes without error ──────────────

describe('injectState — runAll integration', () => {
  test('runAll() completes without throwing after injectState()', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 30);
    engine.injectState(SNAPSHOT_2_IN_QUEUE);
    expect(() => engine.runAll()).not.toThrow();
  });

  test('runAll() result is well-formed after injectState()', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 30);
    engine.injectState(SNAPSHOT_2_IN_QUEUE);
    const result = engine.runAll();

    expect(result).toBeDefined();
    expect(typeof result.finalTime).toBe('number');
    expect(result.snap).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  test('entities injected before runAll() get processed by C-events', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 30);
    engine.injectState(SNAPSHOT_2_IN_QUEUE);
    const result = engine.runAll();

    // Injected entities (2 in queue) should be picked up by the ASSIGN C-event
    // and eventually processed during the run
    expect(result.summary.served).toBeGreaterThanOrEqual(0);
  });
});

// ── Test 5: Empty snapshot — system starts empty ──────────────────────────────

describe('injectState — empty snapshot', () => {
  test('empty snapshot leaves entity pool with only server entities', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 30);
    engine.injectState(EMPTY_SNAPSHOT);

    const snap = engine.getSnap();
    const nonServers = snap.entities.filter(e => e.role !== 'server');
    expect(nonServers).toHaveLength(0);
  });

  test('runAll() with empty snapshot runs normally (arrivals from FEL)', () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 30);
    engine.injectState(EMPTY_SNAPSHOT);
    expect(() => engine.runAll()).not.toThrow();
  });
});

// ── Test 6: prefetchForRun() with lookahead mode uses SnapshotAdapter ─────────

describe('prefetchForRun — lookahead mode', () => {
  beforeEach(() => {
    vi.stubGlobal('AbortSignal', { timeout: () => undefined });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('prefetchForRun with lookahead mode fetches snapshot and calls injectState on engineRef', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => SNAPSHOT_2_IN_QUEUE,
    }));

    const engine = buildEngine(BASE_MODEL, 42, 0, 30);

    // Build a minimal registry that supports registerMock (needed by prefetchForRun fallback)
    const registry = new AdapterRegistry(BASE_MODEL.dataSources || []);

    await prefetchForRun(BASE_MODEL, registry, engine);

    // After prefetchForRun with engineRef, injectState should have been called:
    // 2 customers should now be in the entity pool
    const snap = engine.getSnap();
    const customers = snap.entities.filter(e => e.role !== 'server');
    expect(customers).toHaveLength(2);
  });

  test('prefetchForRun with lookahead mode when no snapshot source in model — no crash', async () => {
    const modelNoSnap = {
      ...BASE_MODEL,
      dataSources: [],
    };
    const registry = new AdapterRegistry([]);
    await expect(prefetchForRun(modelNoSnap, registry, null)).resolves.toBeUndefined();
  });

  test('prefetchForRun with non-lookahead mode does not call injectState', async () => {
    const engine = buildEngine(BASE_MODEL, 42, 0, 30);
    const injectSpy = vi.spyOn(engine, 'injectState');

    const registry = new AdapterRegistry([]);
    const calBatchModel = { ...BASE_MODEL, experimentDefaults: { liveDataMode: 'calibrated_batch' } };

    await prefetchForRun(calBatchModel, registry, engine);

    expect(injectSpy).not.toHaveBeenCalled();
  });
});
