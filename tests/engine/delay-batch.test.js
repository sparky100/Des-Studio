import { describe, it, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

function delayModel(entityCount = 3) {
  const arrives = Array.from({ length: entityCount }, (_, i) => ({
    id: `b_a${i + 1}`, name: `Arrive ${i + 1}`, scheduledTime: "0",
    effect: "ARRIVE(Runner, Finish Line)", schedules: [],
  }));
  return {
    entityTypes: [{ name: "Runner", role: "customer", count: 0 }],
    bEvents: [
      ...arrives,
      { id: "b_done", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    ],
    cEvents: [{
      id: "c_delay",
      name: "Recovery",
      effect: "DELAY(Finish Line)",
      priority: 1,
      condition: { variable: "queue(Finish Line).length", operator: ">", value: 0 },
      cSchedules: [{ dist: "Fixed", distParams: { value: "1" }, eventId: "b_done", useEntityCtx: true }],
    }],
    queues: [{ id: "q_finish", name: "Finish Line", discipline: "FIFO", customerType: "Runner" }],
  };
}

describe('DELAY macro — batch processing', () => {
  it('completes all 3 entities when they all arrive at once', () => {
    const result = buildEngine(delayModel(3), 42, 0, 10, null, 5000, 5000, false).runAll();
    const entities = result.entitySummary ?? [];
    const done = entities.filter(e => e.status === 'done');
    expect(done).toHaveLength(3);
    expect(result.phaseCTruncated).toBeFalsy();
  });

  it('does not hit Phase C limit even with 400 simultaneous arrivals', () => {
    const result = buildEngine(delayModel(400), 42, 0, 10, null, 500, 500, false).runAll();
    expect(result.summary.served).toBe(400);
    expect(result.phaseCTruncated).toBeFalsy();
  });

  it('each entity gets an independently sampled delay', () => {
    const model = delayModel(5);
    // Use Uniform(0,2) so delays vary
    model.cEvents[0].cSchedules[0].dist = 'Uniform';
    model.cEvents[0].cSchedules[0].distParams = { min: '0', max: '2' };
    const result = buildEngine(model, 99, 0, 10, null, 500, 500, false).runAll();
    const entities = result.entitySummary ?? [];
    const done = entities.filter(e => e.status === 'done');
    expect(done).toHaveLength(5);
    const completionTimes = done.map(e => e.completionTime);
    // Not all at the same time (independent delays from Uniform(0,2))
    const distinct = new Set(completionTimes.map(t => t?.toFixed(4)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('routes a delay completion B-event with NO effect (routing-table-only pattern) instead of leaving entities stuck in "serving"', () => {
    const model = delayModel(5);
    model.bEvents[model.bEvents.length - 1] = {
      id: "b_done", name: "Recovery Complete", scheduledTime: "9999",
      effect: [], schedules: [],
      probabilisticRouting: [{ probability: 1, queueName: "Voucher Queue" }],
    };
    model.queues.push({ id: "q_voucher", name: "Voucher Queue", discipline: "FIFO", customerType: "Runner" });
    const result = buildEngine(model, 42, 0, 5, null, 500, 500, false).runAll();
    const entities = result.entitySummary ?? [];
    const stuck = entities.filter(e => e.status === 'serving');
    expect(stuck).toHaveLength(0);
    const inVoucher = entities.filter(e => e.status === 'waiting' && e.queue === 'Voucher Queue');
    expect(inVoucher).toHaveLength(5);
  });
});
