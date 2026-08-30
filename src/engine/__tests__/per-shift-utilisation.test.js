// Regression test for F86.4 per-shift utilisation attribution.
//
// Bug: a server's entire lifetime busy-time (server._busyTime, accumulated across
// every stint it has ever worked) was misattributed wholesale to whichever shift
// label happened to be active at its *most recent* claim (server._shiftLabel, a
// single overwritten scalar) — instead of tracking busy-time per shift label. A
// server that stays claimed across many shift periods ends up dumping its whole
// history into just the current/last period's bucket, producing utilisation well
// over 100% for that period while every earlier period reads ~0%.
import { describe, expect, test } from 'vitest';
import { buildEngine } from '../index.js';

function model() {
  return {
    entityTypes: [
      { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
      {
        id: 'srv',
        name: 'Server',
        role: 'server',
        count: '1',
        attrDefs: [],
        // 5 shift periods of 50 minutes each, same capacity throughout — each
        // boundary still fires a SHIFT_CHANGE event and rotates the shift label.
        shiftSchedule: [
          { time: 0,   capacity: 1 },
          { time: 50,  capacity: 1 },
          { time: 100, capacity: 1 },
          { time: 150, capacity: 1 },
          { time: 200, capacity: 1 },
        ],
      },
    ],
    stateVariables: [],
    bEvents: [
      { id: 'b_arrive', name: 'Arrive', scheduledTime: '0',
        effect: ['ARRIVE(Customer, Queue)'],
        schedules: [{ eventId: 'b_arrive', dist: 'Fixed', distParams: { value: '5' } }] },
      { id: 'b_done', name: 'Done', scheduledTime: '9999', effect: ['COMPLETE()'], schedules: [] },
    ],
    cEvents: [
      { id: 'c_serve', name: 'Serve', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: ['ASSIGN(Queue, Server)'],
        cSchedules: [{ eventId: 'b_done', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }] },
    ],
    queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
  };
}

describe('Per-shift utilisation attribution (F86.4)', () => {
  test('busy time is split per shift period, not dumped entirely into the current one', () => {
    const eng = buildEngine(model(), 1, 0, 250, null, 200000, 5000, false);
    eng.runAll();
    const r = eng.getSummary().perResource.Server;

    expect(r.perShiftUtil.length).toBe(5);
    // The server is kept continuously busy (5-min arrivals, 5-min service, one
    // server) — every period should reflect that, not just the last one.
    for (const period of r.perShiftUtil) {
      expect(period.utilisation).toBeLessThanOrEqual(1);
      expect(period.utilisation).toBeGreaterThan(0.5);
    }
    // The overall (calendar) utilisation must also stay a real percentage.
    expect(r.utilisation).toBeLessThanOrEqual(1);
  });
});
