import { describe, it, expect } from 'vitest';
import { buildRunRecord } from '../../src/db/runRecord.js';

describe('buildRunRecord', () => {
  it('model_snapshot is a deep clone independent of the live model', () => {
    const model = { id: '1', name: 'Test', entityTypes: [{ name: 'A' }] };
    const record = buildRunRecord(model, { summary: {} }, {}, 42);
    // Mutate the live model after snapshot is taken
    model.name = 'MUTATED';
    model.entityTypes[0].name = 'MUTATED';
    // Snapshot must be unchanged
    expect(record.model_snapshot.name).toBe('Test');
    expect(record.model_snapshot.entityTypes[0].name).toBe('A');
  });

  it('returns the correct provenance fields', () => {
    const model = { id: 'abc', name: 'M' };
    const results = { summary: { served: 10 } };
    const expConfig = {
      maxSimTime: 500,
      warmupPeriod: 50,
      replications: 3,
      terminationMode: 'time',
      terminationCondition: null,
    };
    const record = buildRunRecord(model, results, expConfig, 99);

    expect(record.model_id).toBe('abc');
    expect(record.prng_algorithm).toBe('mulberry32');
    expect(record.base_seed).toBe(99);
    expect(record.experiment_config.seed).toBe(99);
    expect(record.experiment_config.replications).toBe(3);
    expect(record.summary).toEqual({ served: 10 });
    expect(record.run_label).toBe('');
  });

  it('snapshot does not share references with live model arrays or objects', () => {
    const model = { id: '2', name: 'N', queues: [{ id: 'q1', capacity: 5 }] };
    const record = buildRunRecord(model, {}, {}, 0);
    model.queues[0].capacity = 999;
    expect(record.model_snapshot.queues[0].capacity).toBe(5);
  });
});
