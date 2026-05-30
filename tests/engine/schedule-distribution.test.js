// Schedule distribution — planned arrival times with optional jitter.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { sample, normalizeDistributionName, mulberry32 } from '../../src/engine/distributions.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => { resetSeq(); });

// ── Unit tests for Schedule sampler ──────────────────────────────────────────

describe('Schedule distribution — unit', () => {
  const rng = mulberry32(42);

  test('returns delay = plannedTime - clock for first entry', () => {
    const state = {};
    const delay = sample('Schedule', { times: [10, 30, 60] }, rng, null, { clock: 0, state, schedKey: 'ev1' });
    expect(delay).toBeCloseTo(10, 5);
    expect(state.__schedIdx_ev1).toBe(1);
  });

  test('advances index on each call', () => {
    const state = {};
    sample('Schedule', { times: [10, 30, 60] }, rng, null, { clock: 0, state, schedKey: 'ev1' });  // idx→1
    const d2 = sample('Schedule', { times: [10, 30, 60] }, rng, null, { clock: 10, state, schedKey: 'ev1' }); // idx→2
    expect(d2).toBeCloseTo(20, 5);
    expect(state.__schedIdx_ev1).toBe(2);
  });

  test('returns 1e9 when plan is exhausted', () => {
    const state = { __schedIdx_ev1: 3 };
    const delay = sample('Schedule', { times: [10, 30, 60] }, rng, null, { clock: 0, state, schedKey: 'ev1' });
    expect(delay).toBe(1e9);
  });

  test('returns 1e9 when times array is empty', () => {
    const state = {};
    const delay = sample('Schedule', { times: [] }, rng, null, { clock: 0, state, schedKey: 'ev1' });
    expect(delay).toBe(1e9);
  });

  test('clamps to 0 when clock is already past planned time', () => {
    const state = {};
    const delay = sample('Schedule', { times: [5] }, rng, null, { clock: 20, state, schedKey: 'ev1' });
    expect(delay).toBe(0);
    expect(state.__schedIdx_ev1).toBe(1);
  });

  test('alias "plan" and "schedule" resolve to Schedule', () => {
    expect(normalizeDistributionName('plan')).toBe('Schedule');
    expect(normalizeDistributionName('schedule')).toBe('Schedule');
  });

  test('Normal jitter adds signed variability — some arrivals early, some late', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      const state = {};
      const r = mulberry32(i);
      const d = sample('Schedule',
        { times: [10], jitterDist: 'Normal', jitterParams: { stddev: '3' } },
        r, null, { clock: 0, state, schedKey: 'j' }
      );
      results.push(d);
    }
    expect(results.some(d => d > 10)).toBe(true);   // some arrive late
    expect(results.some(d => d < 10 && d >= 0)).toBe(true); // some arrive early
  });

  test('Uniform jitter produces values within [min, max] of planned time', () => {
    const results = [];
    for (let i = 0; i < 50; i++) {
      const state = {};
      const r = mulberry32(i);
      const d = sample('Schedule',
        { times: [20], jitterDist: 'Uniform', jitterParams: { min: '-5', max: '5' } },
        r, null, { clock: 0, state, schedKey: 'j' }
      );
      results.push(d);
    }
    expect(results.every(d => d >= 15 && d <= 25)).toBe(true);
  });
});

// ── Integration tests: engine fires arrivals at planned times ────────────────
//
// Convention: scheduledTime fires the FIRST arrival; `times` in distParams are
// the absolute clock times of subsequent arrivals via self-scheduling.

describe('Schedule distribution — engine integration', () => {
  // scheduledTime='0' → 1st arrival; times=[t1,t2,...] → subsequent arrivals
  function makeScheduleModel(subsequentTimes, jitterDist, jitterParams) {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{
            eventId: 'arr', dist: 'Schedule',
            distParams: {
              times: subsequentTimes,
              ...(jitterDist ? { jitterDist, jitterParams } : {}),
            },
          }] },
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true }],
      }],
    };
  }

  test('exactly N arrivals for N times entries (no phantom t=0 fire)', () => {
    // 4 entries in times[] → 4 arrivals, first at t=10
    const engine = buildEngine(makeScheduleModel([10, 20, 30, 40]), 1, 0, 200);
    const { summary } = engine.runAll();
    expect(summary.served).toBe(4);
  });

  test('no extra arrivals after plan is exhausted', () => {
    // 1 entry in times[] → exactly 1 arrival
    const engine = buildEngine(makeScheduleModel([5]), 1, 0, 1000);
    const { summary } = engine.runAll();
    expect(summary.served).toBe(1);
  });

  test('arrivals occur at scheduled absolute times', () => {
    // times=[10, 20] → arrivals at t=10 and t=20 (no phantom at t=0)
    const engine = buildEngine(makeScheduleModel([10, 20]), 1, 0, 100);
    const { log } = engine.runAll();
    const arriveTimes = log
      .filter(e => e.phase === 'B' && e.event?.name === 'Arrive' && !e.skipped)
      .map(e => e.time);
    expect(arriveTimes.length).toBe(2);
    expect(arriveTimes[0]).toBeCloseTo(10, 1);
    expect(arriveTimes[1]).toBeCloseTo(20, 1);
  });

  test('zero arrivals when times[] is empty (no plan, no phantom)', () => {
    const engine = buildEngine(makeScheduleModel([]), 1, 0, 1000);
    const { summary } = engine.runAll();
    // Empty times[] — phantom suppressed: engine pushes initial FEL entry to 1e9
    expect(summary.served).toBe(0);
    expect(summary.total).toBe(0);
  });

  test('jitter produces arrival times spread around planned times', () => {
    // Use two entries: times[0] fires as initial FEL (exact), times[1] goes through
    // sample() and has jitter applied. Check times[1] for variation across seeds.
    const arrivalTimes = [];
    for (let seed = 1; seed <= 20; seed++) {
      resetSeq();
      const engine = buildEngine(
        makeScheduleModel([10, 20], 'Normal', { stddev: '2' }), seed, 0, 50
      );
      const { log } = engine.runAll();
      const times = log
        .filter(e => e.phase === 'B' && e.event?.name === 'Arrive' && !e.skipped)
        .map(e => e.time);
      // times[1] is self-scheduled through sample() and carries jitter
      if (times[1] != null) arrivalTimes.push(times[1]);
    }
    expect(arrivalTimes.length).toBeGreaterThan(0);
    const spread = Math.max(...arrivalTimes) - Math.min(...arrivalTimes);
    expect(spread).toBeGreaterThan(1);  // jitter produces variation across seeds
  });
});
