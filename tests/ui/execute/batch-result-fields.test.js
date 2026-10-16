// Batch results must keep per-shift utilisation (it was dropped when
// replications were aggregated, so every resource card read "No per-shift
// data available" after a batch run).
import { describe, expect, it } from 'vitest';
import { buildEngine } from '../../../src/engine/index.js';
import { makeBatchResult } from '../../../src/ui/execute/executeHelpers.js';
import { buildShiftUtilizationSeries } from '../../../src/ui/results/resultsViewModel.js';

const model = {
  epoch: '2026-01-05T00:00:00', timeUnit: 'minutes',
  entityTypes: [
    { id: 'p', name: 'Patient', role: 'customer', attrDefs: [] },
    { id: 'x', name: 'XrayMachine', role: 'server', count: 2, attrDefs: [],
      schedulePattern: { type: 'weekly', defaultCapacity: 2, periods: [1, 2, 3, 4, 5, 6, 7].map(d => ({ dayOfWeek: d, start: '09:00', end: '17:00', capacity: 3 })), exceptions: [] } },
  ],
  stateVariables: [], queues: [{ id: 'q', name: 'Q', customerType: 'Patient' }],
  bEvents: [
    { id: 'a', name: 'Arr', scheduledTime: '0', effect: ['ARRIVE(Patient, Q)'], schedules: [{ eventId: 'a', dist: 'Exponential', distParams: { mean: '10' } }] },
    { id: 'd', name: 'Done', scheduledTime: '1e12', effect: ['COMPLETE()'], schedules: [] },
  ],
  cEvents: [{ id: 'c', name: 'Serve', priority: 1, condition: 'queue(Q).length > 0 AND idle(XrayMachine).count > 0', effect: ['ASSIGN(Q, XrayMachine)'], cSchedules: [{ eventId: 'd', dist: 'Exponential', distParams: { mean: '15' }, useEntityCtx: true }] }],
};

describe('batch per-shift utilisation', () => {
  it('pools each shift period across replications', () => {
    const reps = [1, 2, 3].map(seed => ({ result: buildEngine(model, seed, 0, 3000).runAll() }));
    const single = reps.map(r => r.result.summary.perResource.XrayMachine.perShiftUtil);
    expect(single[0].length).toBeGreaterThan(1);

    const batch = makeBatchResult(reps, {}, 3000, 0);
    const shifts = batch.summary.perResource.XrayMachine.perShiftUtil;
    expect(shifts).toHaveLength(single[0].length);
    shifts.forEach((s, i) => {
      const busy = single.reduce((t, rep) => t + rep[i].busyTimeSum, 0);
      const open = single.reduce((t, rep) => t + rep[i].elapsed * rep[i].plannedCapacity, 0);
      expect(s.startTime).toBe(single[0][i].startTime);
      expect(s.utilisation).toBeCloseTo(busy / open, 3);
    });

    const series = buildShiftUtilizationSeries(batch.summary);
    expect(series.find(x => x.resourceType === 'XrayMachine').shifts.length).toBe(shifts.length);
  });
});

describe('batch keeps single-run diagnostics', () => {
  const rep = (perResource, summary = {}) => ({ result: { summary: { total: 10, served: 10, perResource, ...summary } } });

  it('averages starvation and sustained-utilisation fields per resource (null stretch = 0)', () => {
    const batch = makeBatchResult([
      rep({ Doc: { utilisation: 0.5, starvationPct: 0.3, maxStarvationDuration: 40, maxSustainedHighUtil: 120, maxSustainedZeroUtil: null } }),
      rep({ Doc: { utilisation: 0.7, starvationPct: 0.1, maxStarvationDuration: null, maxSustainedHighUtil: 60, maxSustainedZeroUtil: null } }),
    ], {}, 100, 0);
    expect(batch.summary.perResource.Doc).toMatchObject({
      starvationPct: 0.2, maxStarvationDuration: 20, maxSustainedHighUtil: 90, maxSustainedZeroUtil: 0,
    });
  });

  it('carries the Little\'s-Law discrepancy, plan deviation and warm-up exclusions', () => {
    const batch = makeBatchResult([
      rep({}, { waitDiscrepancy: 8, avgPlanDeviation: 2, excludedCount: 3 }),
      rep({}, { waitDiscrepancy: 4, avgPlanDeviation: 4, excludedCount: 4 }),
    ], {}, 100, 0);
    expect(batch.summary).toMatchObject({ waitDiscrepancy: 6, avgPlanDeviation: 3, excludedCount: 4 });
  });

  it('leaves them null when no replication reported them', () => {
    const batch = makeBatchResult([rep({}), rep({})], {}, 100, 0);
    expect(batch.summary.waitDiscrepancy).toBeNull();
    expect(batch.summary.avgPlanDeviation).toBeNull();
  });
});
