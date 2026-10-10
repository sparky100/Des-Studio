// tests/engine/benchmarks/scaling.test.js
//
// Per-event cost must not grow with run length or with server count.
//
// Two engine paths used to scale badly:
//   - with chart data on, every cycle's time-series sample walked every
//     entity ever created (O(N) per event, O(N²) per run);
//   - idle(T)/busy(T) checks and ASSIGN/COSEIZE candidate lists filtered the
//     whole server roster, lower-casing every server's type name, then sorted.
// These gates fail if either comes back. µs/event comes from the engine's own
// runtimeMetrics.wall_clock_ms (time spent in step()).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect, beforeAll } from 'vitest';
import { buildEngine } from '../../../src/engine/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fleetModel = () =>
  JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'oil-network-fleet.json'), 'utf8')).model_json;

function mmc({ c = 10, arrivalMean = 0.02, serviceMean = 0.15 } = {}) {
  return {
    entityTypes: [
      { id: 'job', name: 'Job', role: 'customer', count: 0, attrDefs: [] },
      { id: 'm', name: 'Machine', role: 'server', count: c, attrDefs: [] },
    ],
    queues: [{ id: 'q', name: 'Queue', discipline: 'FIFO' }],
    stateVariables: [],
    bEvents: [
      { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Job, Queue)',
        schedules: [{ eventId: 'arr', dist: 'Exponential', distParams: { mean: String(arrivalMean) } }] },
      { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [{ id: 'serve', name: 'Serve', priority: 1, effect: 'ASSIGN(Queue, Machine)',
      condition: 'queue(Queue).length > 0 AND idle(Machine).count > 0',
      cSchedules: [{ eventId: 'done', dist: 'Exponential', distParams: { mean: String(serviceMean) }, useEntityCtx: true }] }],
  };
}

/** One fixed-seed replication; returns µs per event from runtimeMetrics. */
function usPerEvent(model, maxSimTime, { charts = true } = {}) {
  const result = buildEngine(model, 7, 0, maxSimTime, null, 1e8, 5000, charts, undefined, { collectTrace: false }).runAll();
  const m = result.runtimeMetrics;
  expect(m.wall_clock_ms).toBeGreaterThan(0);
  return (m.wall_clock_ms * 1000) / m.events_processed;
}

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe('engine scaling', () => {
  beforeAll(() => {
    // JIT warm-up so the first measured run isn't penalised.
    usPerEvent(mmc(), 50);
    usPerEvent(fleetModel(), 30);
  });

  test('M/M/c with chart data: µs/event at 300 days within 1.3x of 100 days', () => {
    const short = median([1, 2, 3].map(() => usPerEvent(mmc(), 100)));
    const long = median([1, 2, 3].map(() => usPerEvent(mmc(), 300)));
    expect(long / short).toBeLessThan(1.3);
  });

  test('tanker-fleet model (903 servers) with chart data: µs/event at 300 days within 1.3x of 100 days', () => {
    const short = usPerEvent(fleetModel(), 100);
    const long = usPerEvent(fleetModel(), 300);
    expect(long / short).toBeLessThan(1.3);
  });

  test('µs/event with 1,000 servers of one type is within 2.5x of 10 servers at the same event volume', () => {
    const at = c => median([1, 2, 3].map(() => usPerEvent(mmc({ c, arrivalMean: 0.1, serviceMean: 0.05 * c }), 1000, { charts: false })));
    expect(at(1000) / at(10)).toBeLessThan(2.5);
  });

  test('every replication records its own wall-clock time, step-driven runs included', () => {
    const engine = buildEngine(mmc(), 3, 0, 20, null, 1e6, 5000, false, undefined, { collectTrace: false });
    let r;
    do { r = engine.step({ captureSnap: false }); } while (!r.done);
    expect(engine.getRuntimeMetrics().wall_clock_ms).toBeGreaterThan(0);
  });
});
