import { describe, expect, test } from 'vitest';
import { handleWorkerMessage, runReplicationPayload } from '../../src/engine/worker.js';

const tinyModel = {
  entityTypes: [],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
};

describe('replication worker helper', () => {
  test('runReplicationPayload returns replication metadata and result summary', () => {
    const payload = runReplicationPayload({
      replicationIndex: 2,
      model: tinyModel,
      seed: 99,
      maxSimTime: 10,
    });

    expect(payload.replicationIndex).toBe(2);
    expect(payload.seed).toBe(99);
    expect(payload.result.summary).toBeDefined();
  });

  test('handleWorkerMessage wraps success using the worker contract', () => {
    const message = handleWorkerMessage({
      type: 'RUN_REPLICATION',
      payload: { replicationIndex: 0, model: tinyModel, seed: 1 },
    });

    expect(message.type).toBe('REPLICATION_COMPLETE');
    expect(message.payload.replicationIndex).toBe(0);
    expect(message.payload.result.summary).toBeDefined();
  });

  test('handleWorkerMessage returns structured error payloads', () => {
    const message = handleWorkerMessage({
      type: 'RUN_REPLICATION',
      payload: { replicationIndex: 3, model: null, seed: 4 },
    });

    expect(message.type).toBe('REPLICATION_ERROR');
    expect(message.payload.replicationIndex).toBe(3);
    expect(message.payload.seed).toBe(4);
    expect(message.payload.message).toBeTruthy();
  });
});
