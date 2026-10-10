import { describe, expect, test, vi } from 'vitest';
import { compactReplicationPayload, runReplications, defaultWorkerCount, MAX_DESKTOP_WORKERS, MAX_MOBILE_WORKERS, MAX_LOW_MEMORY_WORKERS } from '../../src/engine/replication-runner.js';

function deferredWorkerFactory() {
  const workers = [];
  const createWorker = () => {
    const worker = {
      message: null,
      onmessage: null,
      onerror: null,
      terminated: false,
      initMessage: null,
      postMessage(message) {
        if (message.type === 'INIT_RUN') {
          this.initMessage = message;
          return;
        }
        this.message = message;
      },
      complete(result = {}) {
        this.onmessage?.({
          data: {
            type: 'REPLICATION_COMPLETE',
            payload: {
              replicationIndex: this.message.payload.replicationIndex,
              seed: this.message.payload.seed,
              result: {
                summary: result,
              },
            },
          },
        });
      },
      terminate() {
        this.terminated = true;
      },
    };
    workers.push(worker);
    return worker;
  };
  return { workers, createWorker };
}

describe('runReplications', () => {
  test('compacts completed payloads before retaining them', () => {
    const payload = compactReplicationPayload({
      replicationIndex: 0,
      seed: 1,
      result: {
        finalTime: 10,
        snap: { clock: 10 },
        summary: { served: 1 },
        runtimeMetrics: { events_processed: 12, c_event_scans: 7, c_events_fired: 2, entities_created: 3, entities_completed: 1, replications: 1, wall_clock_ms: null },
        entitySummary: [{ id: 1 }],
        log: [{ snap: { entities: new Array(1000).fill({}) } }],
      },
    });

    expect(payload.result.log).toEqual([]);
    expect(payload.result.summary.served).toBe(1);
    expect(payload.result.snap.clock).toBe(10);
    expect(payload.result.runtimeMetrics).toEqual(expect.objectContaining({ events_processed: 12, entities_completed: 1 }));
  });

  test('preserves perQueue balk/block counts on compaction', () => {
    const payload = compactReplicationPayload({
      replicationIndex: 0,
      seed: 1,
      result: {
        finalTime: 10,
        snap: { clock: 10 },
        summary: { served: 1 },
        perQueue: { 'Burger Queue': { balkCount: 3, blockingCount: 2 } },
        log: [],
      },
    });

    expect(payload.result.perQueue).toEqual({ 'Burger Queue': { balkCount: 3, blockingCount: 2 } });
  });

  test('assigns deterministic independent seeds', () => {
    const { workers, createWorker } = deferredWorkerFactory();

    runReplications({
      model: {},
      replications: 3,
      baseSeed: 100,
      workerCount: 3,
      createWorker,
    });

    expect(workers.map(worker => worker.message.payload.seed)).toEqual([100, 101, 102]);
  });

  test('uses a bounded worker pool and reuses workers across replications', () => {
    const { workers, createWorker } = deferredWorkerFactory();

    runReplications({
      model: {},
      replications: 30,
      baseSeed: 0,
      workerCount: 4,
      createWorker,
    });

    expect(workers).toHaveLength(4);
    workers[0].complete();
    // Worker 0 picks up the next replication instead of being respawned
    expect(workers).toHaveLength(4);
    expect(workers[0].message.payload.replicationIndex).toBe(4);
    expect(workers[0].message.payload.seed).toBe(4);
  });

  test('sends shared run config once per worker via INIT_RUN', () => {
    const { workers, createWorker } = deferredWorkerFactory();
    const model = { name: 'm' };

    runReplications({
      model,
      replications: 3,
      baseSeed: 0,
      workerCount: 2,
      createWorker,
    });

    expect(workers[0].initMessage.payload.model).toBe(model);
    // Per-replication messages carry only the job, not the model
    expect(workers[0].message.payload.model).toBeUndefined();
    expect(Object.keys(workers[0].message.payload).sort()).toEqual(['entityDetail', 'replicationIndex', 'seed']);
  });

  test('emits the shared batch progress shape', () => {
    const { createWorker } = deferredWorkerFactory();
    const onProgress = vi.fn();

    runReplications({
      model: {},
      replications: 2,
      baseSeed: 10,
      workerCount: 2,
      createWorker,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'batch',
      completed: 0,
      total: 2,
      running: 2,
      pending: 0,
      cancelled: false,
      workerCount: 2,
    }));
  });

  test('returns final results in replication index order', () => {
    const { workers, createWorker } = deferredWorkerFactory();
    const onComplete = vi.fn();

    runReplications({
      model: {},
      replications: 3,
      baseSeed: 50,
      workerCount: 3,
      createWorker,
      onComplete,
    });

    workers[2].complete({ served: 2 });
    workers[0].complete({ served: 0 });
    workers[1].complete({ served: 1 });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].map(result => result.replicationIndex)).toEqual([0, 1, 2]);
    expect(onComplete.mock.calls[0][0].map(result => result.seed)).toEqual([50, 51, 52]);
  });

  test('cancels active work and prevents completion callback', () => {
    const { workers, createWorker } = deferredWorkerFactory();
    const onComplete = vi.fn();
    const onCancelled = vi.fn();

    const controller = runReplications({
      model: {},
      replications: 5,
      baseSeed: 1,
      workerCount: 2,
      createWorker,
      onComplete,
      onCancelled,
    });

    controller.cancel();
    workers[0].complete();
    workers[1].complete();

    expect(workers.every(worker => worker.terminated)).toBe(true);
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('terminates active workers when one replication fails', () => {
    const { workers, createWorker } = deferredWorkerFactory();
    const onError = vi.fn();
    const onComplete = vi.fn();

    runReplications({
      model: {},
      replications: 3,
      baseSeed: 1,
      workerCount: 3,
      createWorker,
      onError,
      onComplete,
    });

    workers[1].onmessage({
      data: {
        type: 'REPLICATION_ERROR',
        payload: { replicationIndex: 1, seed: 2, message: 'boom' },
      },
    });
    workers[0].complete();
    workers[2].complete();

    expect(workers.every(worker => worker.terminated)).toBe(true);
    expect(onError).toHaveBeenCalledWith({ replicationIndex: 1, seed: 2, message: 'boom' });
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('reports worker startup failures through onError', () => {
    const onError = vi.fn();

    runReplications({
      model: {},
      replications: 1,
      baseSeed: 7,
      createWorker: () => {
        throw new Error('worker unavailable');
      },
      onError,
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        replicationIndex: 0,
        seed: 7,
        message: 'worker unavailable',
      })
    );
  });
});

describe('defaultWorkerCount', () => {
  const desktop = { hardwareConcurrency: 16, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0' };
  const iphone = { hardwareConcurrency: 8, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', maxTouchPoints: 5 };

  test('desktop: cores − 1, capped at 8', () => {
    expect(defaultWorkerCount(30, desktop)).toBe(MAX_DESKTOP_WORKERS);
    expect(defaultWorkerCount(30, { ...desktop, hardwareConcurrency: 6 })).toBe(5);
  });

  test('phones and tablets: capped at 4 (iPadOS reports as a Mac with touch)', () => {
    expect(defaultWorkerCount(10, iphone)).toBe(MAX_MOBILE_WORKERS);
    expect(defaultWorkerCount(10, { hardwareConcurrency: 8, userAgentData: { mobile: true } })).toBe(4);
    expect(defaultWorkerCount(10, { hardwareConcurrency: 10, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1', maxTouchPoints: 5 })).toBe(4);
    expect(defaultWorkerCount(10, { hardwareConcurrency: 10, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1', maxTouchPoints: 0 })).toBe(8);
  });

  test('low-memory devices: 2 workers', () => {
    expect(defaultWorkerCount(10, { ...desktop, deviceMemory: 4 })).toBe(MAX_LOW_MEMORY_WORKERS);
    expect(defaultWorkerCount(10, { ...desktop, deviceMemory: 8 })).toBe(8);
  });

  test('never more workers than replications, never fewer than 1', () => {
    expect(defaultWorkerCount(2, desktop)).toBe(2);
    expect(defaultWorkerCount(10, { hardwareConcurrency: 1 })).toBe(1);
  });
});
