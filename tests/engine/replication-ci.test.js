import { describe, expect, test } from 'vitest';
import { runReplications } from '../../src/engine/replication-runner.js';
import { summarizeReplicationResults } from '../../src/engine/statistics.js';

const LAMBDA = 0.9;
const MU = 1.0;
const ANALYTICAL_MEAN_WAIT = 9.0;

const mm1Model = {
  entityTypes: [
    { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_srv', name: 'Server', role: 'server', count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b_arrive',
      name: 'Arrival',
      scheduledTime: '0',
      effect: 'ARRIVE(Customer)',
      schedules: [
        {
          eventId: 'b_arrive',
          dist: 'Exponential',
          distParams: { mean: String(1 / LAMBDA) },
        },
      ],
    },
    {
      id: 'b_complete',
      name: 'Complete',
      scheduledTime: '9999',
      effect: 'COMPLETE()',
      schedules: [],
    },
  ],
  cEvents: [
    {
      id: 'c_seize',
      name: 'Seize',
      condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Customer, Server)',
      cSchedules: [
        {
          eventId: 'b_complete',
          dist: 'Exponential',
          distParams: { mean: String(1 / MU) },
          useEntityCtx: true,
        },
      ],
    },
  ],
  queues: [],
};

describe('replication CI gate', () => {
  test('30 M/M/1 replications produce a 95% CI containing analytical mean wait', async () => {
    const results = await new Promise((resolve, reject) => {
      runReplications({
        model: mm1Model,
        replications: 30,
        baseSeed: 300,
        workerCount: 1,
        warmupPeriod: 200,
        maxSimTime: 600,
        maxCycles: 50000,
        onComplete: resolve,
        onError: reject,
      });
    });

    const ci = summarizeReplicationResults(results, ['summary.avgWait'])['summary.avgWait'];

    expect(ci.n).toBe(30);
    expect(ci.lower).toBeLessThanOrEqual(ANALYTICAL_MEAN_WAIT);
    expect(ci.upper).toBeGreaterThanOrEqual(ANALYTICAL_MEAN_WAIT);
  }, 60000);
});
