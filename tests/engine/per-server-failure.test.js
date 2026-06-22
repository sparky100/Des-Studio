import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

function makeMultiServerModel(count = 3, extra = {}) {
  return {
    entityTypes: [
      { id: 'Part', name: 'Part', role: 'customer', attrDefs: [] },
      { id: 'Machine', name: 'Machine', role: 'server', count: String(count), attrDefs: [],
        mtbfDist: 'fixed', mtbfDistParams: { value: '8' },
        mttrDist: 'fixed', mttrDistParams: { value: '3' },
        ...extra,
      },
    ],
    queues: [{ id: 'q1', name: 'Input Queue', customerType: 'Part', discipline: 'FIFO' }],
    bEvents: [
      {
        id: 'arrival', name: 'Part Arrives', scheduledTime: '0',
        effect: 'ARRIVE(Part, Input Queue)',
        schedules: [{ eventId: 'arrival', dist: 'fixed', distParams: { value: '1' } }],
      },
      {
        id: 'complete', name: 'Service Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'assign', name: 'Start Processing', priority: 1,
        condition: 'queue(Input Queue).length > 0 AND idle(Machine).count > 0',
        effect: 'ASSIGN(Input Queue, Machine)',
        cSchedules: [{ eventId: 'complete', dist: 'fixed', distParams: { value: '4' }, useEntityCtx: true }],
      },
    ],
    stateVariables: [],
  };
}

describe('Per-Server Failure Scheduling', () => {

  test('"unit" scope fails only one server', () => {
    const model = makeMultiServerModel(3, { failureScope: 'unit' });
    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();

    const failureEntries = result.log.filter(e => e.message?.includes('FAILURE'));
    expect(failureEntries.length).toBeGreaterThan(0);

    const firstMsg = failureEntries[0].message;
    expect(firstMsg).toContain('#');
    expect(firstMsg).not.toContain('server(s)');  // singular, not plural pool
  });

  test('"unit" scope schedules repair for the same server', () => {
    const model = makeMultiServerModel(3, { failureScope: 'unit' });
    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();

    const repairEntries = result.log.filter(e => e.message?.includes('REPAIR'));
    expect(repairEntries.length).toBeGreaterThan(0);

    const firstMsg = repairEntries[0].message;
    expect(firstMsg).toContain('#');
    expect(firstMsg).not.toContain('server(s)');
  });

  test('"unit" scope schedules next failure after repair', () => {
    const model = makeMultiServerModel(3, { failureScope: 'unit' });
    const engine = buildEngine(model, 42, 0, 30);
    const result = engine.runAll();

    // With MTBF=8 (fixed), MTTR=3 (fixed), and 3 servers:
    // Each server fails independently: first at ~t=8, repaired at ~t=11, next failure at ~t=19
    // All three should have their own independent first failures
    const failureEntries = result.log.filter(e => e.message?.includes('FAILURE'));
    // 3 servers x at least 1 failure each = at least 3
    expect(failureEntries.length).toBeGreaterThanOrEqual(3);
  });

  test('"pool" scope fails all servers', () => {
    const model = makeMultiServerModel(3, { failureScope: 'pool' });
    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();

    const failureEntries = result.log.filter(e => e.message?.includes('FAILURE'));
    expect(failureEntries.length).toBeGreaterThan(0);

    // Pool scope message: "X server(s) failed"
    const firstMsg = failureEntries[0].message;
    expect(firstMsg).toContain('server(s)');
    // Should fail all 3 servers
    expect(firstMsg).toContain('3');
  });

  test('"pool" scope repairs all servers', () => {
    const model = makeMultiServerModel(3, { failureScope: 'pool' });
    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();

    const repairEntries = result.log.filter(e => e.message?.includes('REPAIR'));
    expect(repairEntries.length).toBeGreaterThan(0);

    const firstMsg = repairEntries[0].message;
    expect(firstMsg).toContain('3');
  });

  test('No pre-generated chain for "unit" scope beyond count events', () => {
    const model = makeMultiServerModel(3, { failureScope: 'unit' });
    const engine = buildEngine(model, 42, 0, 15);

    const snap = engine.getSnap();
    if (snap?.felPreview) {
      const failureFel = snap.felPreview.filter(e => e.name?.startsWith('Failure:'));
      // 3 servers, each with 1 initial failure event = 3 events (no pre-generated chain)
      expect(failureFel.length).toBe(3);
      // No pre-generated REPAIR events for unit scope
      const repairFel = snap.felPreview.filter(e => e.name?.startsWith('Repair:'));
      expect(repairFel.length).toBe(0);
    }
  });

  test('Backward compat: missing failureScope defaults to "unit"', () => {
    const model = makeMultiServerModel(3);
    // No failureScope field — should default to "unit"
    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();

    const failureEntries = result.log.filter(e => e.message?.includes('FAILURE'));
    expect(failureEntries.length).toBeGreaterThan(0);
    // Should be per-server messages
    const firstMsg = failureEntries[0].message;
    expect(firstMsg).toContain('#');
  });

  test('Warmup resets _failedAt for failed server', () => {
    // MTBF=4, MTTR=6, warmup=5, maxSimTime=13
    // Failure at t=4 (pre-warmup), repair at t=10 (post-warmup)
    // Without fix: downtime = 10-4 = 6. With fix: downtime = 10-5 = 5
    const model = {
      entityTypes: [
        { id: 'Part', name: 'Part', role: 'customer', attrDefs: [] },
        { id: 'Machine', name: 'Machine', role: 'server', count: '1', attrDefs: [],
          mtbfDist: 'fixed', mtbfDistParams: { value: '4' },
          mttrDist: 'fixed', mttrDistParams: { value: '6' },
          failureScope: 'pool',
        },
      ],
      queues: [{ id: 'q1', name: 'Queue', customerType: 'Part', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr', name: 'Arr', scheduledTime: '0', effect: 'ARRIVE(Part, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '10' } }] },
        { id: 'comp', name: 'Comp', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [
        { id: 'ass', name: 'Ass', priority: 1,
          condition: 'queue(Queue).length > 0 AND idle(Machine).count > 0',
          effect: 'ASSIGN(Queue, Machine)',
          cSchedules: [{ eventId: 'comp', dist: 'fixed', distParams: { value: '10' }, useEntityCtx: true }] },
      ],
      stateVariables: [],
    };
    const engine = buildEngine(model, 42, 5, 13);
    const result = engine.runAll();

    const machine = result.summary.perResource.Machine;
    expect(machine.totalDowntime).toBeCloseTo(5, 1);
    expect(machine.failureCount).toBe(1);
  });

  test('_starvationTime resets at warmup', () => {
    const model = makeMultiServerModel(1, { failureScope: 'pool' });
    // Run with warmup
    const engineNoWarmup = buildEngine(model, 42, 0, 20);
    const resultNoWarmup = engineNoWarmup.runAll();

    const engineWarmup = buildEngine(model, 42, 10, 20);
    const resultWarmup = engineWarmup.runAll();

    // With warmup=10, very few post-warmup time units — starvation should be limited
    const machine = resultWarmup.summary.perResource.Machine;
    expect(machine.starvationTime).not.toBeNaN();
  });

  test('perResource aggregates failureCount across all server instances', () => {
    const model = makeMultiServerModel(3, { failureScope: 'pool' });
    const engine = buildEngine(model, 42, 0, 20);
    const result = engine.runAll();

    // Pool scope with 3 servers: each failure takes all 3 offline
    // MTBF=8, MTTR=3, maxSimTime=20: failures at t=8 and t=16, repairs at t=11 and t=19
    // 2 failures x 3 servers affected per failure = 6 server-failures
    const machine = result.summary.perResource.Machine;
    expect(machine.failureCount).toBe(6);
    expect(machine.totalDowntime).toBeCloseTo(18, 1); // 2 repairs x 3 servers x 3 time units = 18
    expect(machine.availability).toBeCloseTo(1 - 18 / 60, 4); // 3 servers x 20 time units = 60 denominator
  });

});
