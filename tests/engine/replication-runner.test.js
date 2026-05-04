import { describe, expect, test, vi } from 'vitest';
import { compactReplicationPayload, runReplications } from '../../src/engine/replication-runner.js';

function deferredWorkerFactory() {
  const workers = [];
  const createWorker = () => {
    const worker = {
      message: null,
      onmessage: null,
      onerror: null,
      terminated: false,
      postMessage(message) {
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
        entitySummary: [{ id: 1 }],
        log: [{ snap: { entities: new Array(1000).fill({}) } }],
      },
    });

    expect(payload.result.log).toEqual([]);
    expect(payload.result.summary.served).toBe(1);
    expect(payload.result.snap.clock).toBe(10);
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

  test('uses a bounded worker pool', () => {
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
    expect(workers).toHaveLength(5);
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
