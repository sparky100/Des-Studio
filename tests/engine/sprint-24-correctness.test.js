import { describe, expect, test } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { fireBEvent } from '../../src/engine/phases.js';

describe('Sprint 24 simulation correctness regressions', () => {
  test('does not discard initially scheduled B-events after t=900', () => {
    const model = {
      entityTypes: [],
      stateVariables: [{ id: 'count', name: 'count', initialValue: '0' }],
      queues: [],
      bEvents: [
        { id: 'late', name: 'Late Event', scheduledTime: '1000', effect: 'count++', schedules: [] },
      ],
      cEvents: [],
    };

    const result = buildEngine(model, 1, 0, 1200).runAll();
    expect(result.finalTime).toBe(1000);
    expect(result.snap.scalars.count).toBe(1);
  });

  test('surfaces Phase C truncation on the run result and summary', () => {
    const model = {
      entityTypes: [],
      stateVariables: [{ id: 'x', name: 'x', initialValue: '0' }],
      queues: [],
      bEvents: [
        { id: 'init', name: 'Init', scheduledTime: '0', effect: '', schedules: [] },
      ],
      cEvents: [
        { id: 'loop', name: 'Always True', priority: 1, condition: 'x >= 0', effect: 'x++', cSchedules: [] },
      ],
    };

    const result = buildEngine(model, 1, 0, null, null, 10, 3).runAll();
    expect(result.phaseCTruncated).toBe(true);
    expect(result.summary.phaseCTruncated).toBe(true);
    expect(result.summary.maxCPasses).toBe(3);
    expect(result.warnings.some(message => message.includes('Phase C truncated after 3 passes'))).toBe(true);
  });

  test('binds reneging timers to the current arrival context, not global queue order', () => {
    const entities = [
      { id: 99, type: 'Customer', role: 'customer', status: 'waiting', queue: 'Main', arrivalTime: 999, attrs: {}, stages: [] },
    ];
    const ctx = {
      entities,
      state: { __served: 0, __reneged: 0 },
      model: {
        entityTypes: [{ id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] }],
        queues: [{ id: 'main', name: 'Main', discipline: 'FIFO' }],
        bEvents: [
          { id: 'arrival', name: 'Arrival', effect: 'ARRIVE(Customer, Main)' },
          { id: 'renege', name: 'Abandon', effect: 'RENEGE(ctx)' },
        ],
      },
      clock: 0,
      nextId: (() => {
        let id = 0;
        return () => ++id;
      })(),
      rng: () => 0.5,
      helpers: { waitingOf: () => [], idleOf: () => [], busyOf: () => [] },
      warnings: [],
      incEventCount: () => {},
    };
    const ev = {
      id: 'arrival',
      name: 'Arrival',
      effect: 'ARRIVE(Customer, Main)',
      schedules: [{ eventId: 'renege', isRenege: true, dist: 'Fixed', distParams: { value: '5' } }],
    };

    const { felEntries } = fireBEvent(ev, ctx);
    expect(felEntries[0]._contextCustId).toBe(1);
    expect(felEntries[0]._contextCustId).not.toBe(99);
  });

  test('does not complete a waiting customer from a stale COMPLETE event', () => {
    const model = {
      entityTypes: [{ id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: 'main', name: 'Main', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arrive', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Main)', schedules: [] },
        { id: 'badComplete', name: 'Bad Complete', scheduledTime: '1', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [],
    };

    const result = buildEngine(model, 1, 0, 5).runAll();
    expect(result.summary.served).toBe(0);
    expect(result.snap.entities.find(entity => entity.type === 'Customer')?.status).toBe('waiting');
    expect(result.log.some(entry => entry.message.includes('COMPLETE skipped'))).toBe(true);
  });

  test('computes service duration correctly when serviceStart is zero', () => {
    const model = {
      entityTypes: [
        { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'srv', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: 'main', name: 'Main', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arrive', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Main)', schedules: [] },
        { id: 'complete', name: 'Complete', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'assign',
        name: 'Assign',
        priority: 1,
        condition: 'queue(Main).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Main, Server)',
        cSchedules: [{ eventId: 'complete', dist: 'Fixed', distParams: { value: '3' }, useEntityCtx: true }],
      }],
    };

    const result = buildEngine(model, 1, 0, 10).runAll();
    expect(result.summary.avgSvc).toBe(3);
    expect(result.entitySummary.find(entity => entity.type === 'Customer')?.stages[0].stageService).toBe(3);
  });

  test('busy servers retained by a downshift are retired after completion', () => {
    const model = {
      entityTypes: [
        { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
        {
          id: 'srv',
          name: 'Server',
          role: 'server',
          count: '1',
          attrDefs: [],
          shiftSchedule: [
            { time: '0', capacity: '2' },
            { time: '1', capacity: '1' },
          ],
        },
      ],
      stateVariables: [],
      queues: [{ id: 'main', name: 'Main', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arrive1', name: 'Arrive 1', scheduledTime: '0', effect: 'ARRIVE(Customer, Main)', schedules: [] },
        { id: 'arrive2', name: 'Arrive 2', scheduledTime: '0', effect: 'ARRIVE(Customer, Main)', schedules: [] },
        { id: 'complete', name: 'Complete', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'assign',
        name: 'Assign',
        priority: 1,
        condition: 'queue(Main).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Main, Server)',
        cSchedules: [{ eventId: 'complete', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }],
      }],
    };

    const result = buildEngine(model, 1, 0, 10).runAll();
    expect(result.snap.byType.Server.total).toBe(1);
    expect(result.summary.served).toBe(2);
    expect(result.log.some(entry => entry.message.includes('retained 1 busy server'))).toBe(true);
    expect(result.log.some(entry => entry.message.includes('Server capacity reconciliation'))).toBe(true);
  });
});
