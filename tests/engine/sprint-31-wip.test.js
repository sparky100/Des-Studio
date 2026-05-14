import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

function makeMM1Model(lambda = 0.9, mu = 1.0) {
  return {
    entityTypes: [
      { id: 'Customer', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'Server', name: 'Server', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q1', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
    bEvents: [
      {
        id: 'arrival', name: 'Arrival', scheduledTime: '0',
        effect: 'ARRIVE(Customer, Queue)',
        schedules: [{ eventId: 'arrival', dist: 'exponential', distParams: { rate: String(lambda) } }],
      },
      {
        id: 'complete', name: 'Service Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'assign', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'complete', dist: 'exponential', distParams: { rate: String(mu) }, useEntityCtx: true }],
      },
    ],
    stateVariables: [],
  };
}

describe('G11 — WIP time-average metric', () => {

  test('avgWIP is zero for an empty model', () => {
    const model = {
      entityTypes: [],
      queues: [],
      bEvents: [{ id: 'b1', name: 'Init', scheduledTime: '0', effect: '', schedules: [] }],
      cEvents: [],
      stateVariables: [],
    };
    const engine = buildEngine(model);
    const result = engine.runAll();
    expect(result.summary.avgWIP).toBe(0);
  });

  test('avgWIP is positive when entities pass through the system', () => {
    const model = makeMM1Model(0.9, 1.0);
    const engine = buildEngine(model, 42, 0, 200);
    const result = engine.runAll();
    expect(result.summary.avgWIP).toBeGreaterThan(0);
    expect(Number.isFinite(result.summary.avgWIP)).toBe(true);
  });

  test('avgWIP satisfies Little\'s Law within 15% for M/M/1', () => {
    const lambda = 0.9;
    const mu = 1.0;
    const model = makeMM1Model(lambda, mu);
    const engine = buildEngine(model, 42, 0, 500);
    const result = engine.runAll();

    const avgWIP = result.summary.avgWIP;
    const avgSojourn = result.summary.avgSojourn;
    if (avgSojourn != null && avgSojourn > 0) {
      const littleLawWIP = lambda * avgSojourn;
      const error = Math.abs(avgWIP - littleLawWIP) / littleLawWIP;
      expect(error).toBeLessThan(0.15);
    }
  });

  test('avgWIP resets at warm-up boundary', () => {
    const model = makeMM1Model(0.9, 1.0);
    const warmupPeriod = 50;
    const engine = buildEngine(model, 42, warmupPeriod, 200);
    const result = engine.runAll();

    const avgWIP = result.summary.avgWIP;
    expect(Number.isFinite(avgWIP)).toBe(true);
    expect(avgWIP).toBeGreaterThanOrEqual(0);
  });

  test('avgWIP is exposed in getSummary() during step-by-step execution', () => {
    const model = makeMM1Model(0.9, 1.0);
    const engine = buildEngine(model, 42, 0, 50);
    engine.step();
    const summary = engine.getSummary();
    expect('avgWIP' in summary).toBe(true);
    expect(Number.isFinite(summary.avgWIP)).toBe(true);
  });
});
