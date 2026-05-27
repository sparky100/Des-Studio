import { describe, it, expect } from 'vitest';
import { buildRunRecord, compareResults } from '../../src/db/runRecord.js';

describe('buildRunRecord', () => {
  it('omits model_snapshot by default for lightweight run saves', () => {
    const model = { id: '1', name: 'Test', entityTypes: [{ name: 'A' }] };
    const record = buildRunRecord(model, { summary: {} }, {}, 42);
    expect(record.model_snapshot).toBeNull();
  });

  it('model_snapshot is a deep clone when archival snapshot storage is requested', () => {
    const model = { id: '1', name: 'Test', entityTypes: [{ name: 'A' }] };
    const record = buildRunRecord(model, { summary: {} }, {}, 42, { includeModelSnapshot: true });
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

  it('snapshot does not share references with live model arrays or objects when enabled', () => {
    const model = { id: '2', name: 'N', queues: [{ id: 'q1', capacity: 5 }] };
    const record = buildRunRecord(model, {}, {}, 0, { includeModelSnapshot: true });
    model.queues[0].capacity = 999;
    expect(record.model_snapshot.queues[0].capacity).toBe(5);
  });
});

describe('compareResults', () => {
  const summary = { served: 10, avgWait: 5.0, avgSvc: 2.0, avgSojourn: 7.0, reneged: 0 };

  it('returns true for two identical summaries', () => {
    expect(compareResults({ summary }, { summary })).toBe(true);
  });

  it('returns true when summaries differ by less than 0.0001', () => {
    const slightly = { ...summary, avgWait: 5.00009 };
    expect(compareResults({ summary: slightly }, { summary })).toBe(true);
  });

  it('returns false when summaries differ by 0.01 or more', () => {
    const different = { ...summary, avgWait: 5.01 };
    expect(compareResults({ summary: different }, { summary })).toBe(false);
  });
});
