import { describe, test, expect, beforeEach } from 'vitest';
import { pruneTerminalEntities, resetSeq } from '../../src/engine/entities.js';
import { buildEngine } from '../../src/engine/index.js';

beforeEach(() => {
  resetSeq();
});

// ── pruneTerminalEntities — helper correctness ──────────────────────────────

describe('pruneTerminalEntities', () => {
  test('keeps servers regardless of status, removes done/reneged customers', () => {
    const entities = [
      { id: 1, role: 'server', status: 'idle' },
      { id: 2, role: 'server', status: 'busy' },
      { id: 3, role: 'customer', status: 'waiting' },
      { id: 4, role: 'customer', status: 'serving' },
      { id: 5, role: 'customer', status: 'done' },
      { id: 6, role: 'customer', status: 'reneged' },
    ];
    const { entities: kept, removed } = pruneTerminalEntities(entities, []);
    expect(kept.map(e => e.id).sort()).toEqual([1, 2, 3, 4]);
    expect(removed.map(e => e.id).sort()).toEqual([5, 6]);
  });

  test('is a no-op (returns same references) when nothing is terminal', () => {
    const entities = [
      { id: 1, role: 'server', status: 'idle' },
      { id: 2, role: 'customer', status: 'waiting' },
    ];
    const fel = [{ id: 'b1', scheduledTime: 5 }];
    const result = pruneTerminalEntities(entities, fel);
    expect(result.entities).toBe(entities);
    expect(result.fel).toBe(fel);
    expect(result.removed).toEqual([]);
  });

  test('drops renege-timer FEL entries whose context entity was removed', () => {
    const entities = [{ id: 1, role: 'customer', status: 'done' }];
    const fel = [
      { id: 'renege1', scheduledTime: 10, _contextCustId: 1, _isRenege: true },
      { id: 'complete1', scheduledTime: 12, _contextCustId: 1, _requiresCtxEntity: true },
    ];
    const { fel: keptFel } = pruneTerminalEntities(entities, fel);
    expect(keptFel).toEqual([]);
  });

  test('keeps FEL entries whose context entity is still live', () => {
    const entities = [
      { id: 1, role: 'customer', status: 'done' },
      { id: 2, role: 'customer', status: 'waiting' },
    ];
    const fel = [
      { id: 'renege2', scheduledTime: 10, _contextCustId: 2, _isRenege: true },
    ];
    const { fel: keptFel } = pruneTerminalEntities(entities, fel);
    expect(keptFel).toHaveLength(1);
    expect(keptFel[0].id).toBe('renege2');
  });

  test('keeps FEL entries that merely reference a removed entity as metadata (not renege/ctx-required)', () => {
    const entities = [{ id: 1, role: 'customer', status: 'done' }];
    const fel = [
      { id: 'b_arrive', scheduledTime: 10, _contextCustId: 1 }, // self-scheduled next arrival
    ];
    const { fel: keptFel } = pruneTerminalEntities(entities, fel);
    expect(keptFel).toHaveLength(1);
  });

  test('keeps FEL entries with no context entity at all', () => {
    const entities = [{ id: 1, role: 'customer', status: 'done' }];
    const fel = [{ id: 'b_global', scheduledTime: 10 }];
    const { fel: keptFel } = pruneTerminalEntities(entities, fel);
    expect(keptFel).toHaveLength(1);
  });
});

// ── Engine-level: pruning preserves statistical correctness ────────────────
//
// Fast M/M/1-shaped model (λ slightly below μ) so a large number of
// customers complete over a long horizon, pushing the live `entities` array
// past PRUNE_MIN_LIVE (1000) and triggering the periodic sweep in step()
// many times over the run.

// Deliberately under-congested (rho ~0.2): servers comfortably keep up with
// arrivals, so the live waiting/serving backlog stays small at all times.
// Any growth in the live `entities` array over a long run therefore comes
// from accumulating *terminal* (done) entities, not legitimate queueing —
// exactly what periodic pruning is meant to bound.
function makeFastChurnModel() {
  return {
    entityTypes: [
      { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_srv',  name: 'Server',   role: 'server',   count: 3, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [],
    bEvents: [
      {
        id: 'b_arrive', name: 'Arrival', scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: '0.5' } }],
      },
      { id: 'b_complete', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [
      {
        id: 'c_seize', name: 'Seize',
        condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [{ eventId: 'b_complete', dist: 'Exponential', distParams: { mean: '0.3' }, useEntityCtx: true }],
      },
    ],
  };
}

describe('periodic entity pruning — engine-level correctness', () => {
  test('summary stats are unaffected by mid-run pruning sweeps', () => {
    const model = makeFastChurnModel();
    // maxCycles defaults to 5000, far too low for ~2000 simulated time units
    // of arrivals/completions at this throughput — raise it explicitly.
    const engine = buildEngine(model, 7, 0, 2000, null, 100000);
    const result = engine.runAll();

    // Enough throughput to be confident the periodic sweep fired at least once.
    expect(result.summary.served).toBeGreaterThan(1000);

    // entitySummary (which combines live + pruned via allEntitiesForStats)
    // must account for every customer ever created, plus the servers.
    const customerSummaries = result.entitySummary.filter(e => e.role !== 'server');
    const doneOrRenegedCount = customerSummaries.filter(e => e.status === 'done' || e.status === 'reneged').length;
    expect(result.summary.served + (result.summary.reneged || 0)).toBe(doneOrRenegedCount);

    // Independently recompute mean wait from entitySummary and confirm it
    // matches the engine's own summary.avgWait within rounding tolerance —
    // this would diverge if pruned entities were silently dropped from stats.
    const servedEntities = customerSummaries.filter(e => e.status === 'done');
    const recomputedWaits = servedEntities
      .map(e => (e.serviceStart ?? e.arrivalTime) - e.arrivalTime)
      .filter(w => Number.isFinite(w) && w >= 0);
    const recomputedAvgWait = recomputedWaits.reduce((a, b) => a + b, 0) / recomputedWaits.length;
    expect(Math.abs(recomputedAvgWait - result.summary.avgWait)).toBeLessThan(0.5);
  });

  test('live entities array stays bounded over a long high-churn run, unlike cumulative throughput', () => {
    const model = makeFastChurnModel();
    const engine = buildEngine(model, 11, 0, 2500, null, 150000);

    let maxLiveEntities = 0;
    let cycles = 0;
    while (cycles < 150000) {
      const { done } = engine.step();
      cycles++;
      if (cycles % 200 === 0) {
        const liveCount = engine.getSnap().entities.length;
        if (liveCount > maxLiveEntities) maxLiveEntities = liveCount;
      }
      if (done) break;
    }

    const finalSummary = engine.getSummary();
    // This model runs at ~20% server utilisation, so the legitimate
    // waiting/serving backlog is always small (a handful of entities).
    // Cumulative throughput is in the thousands; without pruning, the live
    // `entities` array would grow to match it (one entry per arrival ever).
    // With pruning, it's bounded by roughly one sweep interval's worth of
    // completions (PRUNE_INTERVAL_CYCLES) plus the small live backlog —
    // an order of magnitude below cumulative throughput, not proportional to it.
    expect(finalSummary.served).toBeGreaterThan(1000);
    expect(maxLiveEntities).toBeLessThan(finalSummary.served / 5);
  });
});
