import { describe, test, expect } from 'vitest';
import { mulberry32, sample, normalizeDistributionName, DISTRIBUTIONS } from '../../src/engine/distributions.js';
import { buildEngine } from '../../src/engine/index.js';

// Tests for seeded PRNG reproducibility (Sprint 1 Task 4).
// These tests fail on the unmodified codebase (mulberry32 is not yet exported
// and buildEngine does not accept a seed parameter).

describe('mulberry32 — seeded PRNG', () => {
  test('same seed produces an identical sequence of 100 values', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  test('different seeds produce different sequences', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(99);
    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  test('all values are in [0, 1)', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('seed 0 and seed 1 produce distinct sequences', () => {
    const s0 = Array.from({ length: 20 }, mulberry32(0));
    const s1 = Array.from({ length: 20 }, mulberry32(1));
    expect(s0).not.toEqual(s1);
  });

  test('same seed used in Exponential sampler produces identical sample sequence', () => {
    const seq1 = Array.from({ length: 50 }, () =>
      sample('Exponential', { mean: '3' }, mulberry32(777))
    );
    const seq2 = Array.from({ length: 50 }, () =>
      sample('Exponential', { mean: '3' }, mulberry32(777))
    );
    expect(seq1).toEqual(seq2);
  });
});

describe('buildEngine — seeded reproducibility', () => {
  // M/M/1 model: Exponential arrivals (mean=2), Fixed service (3).
  // Deterministic enough to verify that same seed → same outcome.
  const m1Model = {
    entityTypes: [
      { id: 'et1', name: 'Customer', role: 'customer', count: '', attrDefs: [] },
      { id: 'et2', name: 'Server', role: 'server', count: '1',
        attrDefs: [{ id: 'a1', name: 'serviceTime', dist: 'Fixed', distParams: { value: '3' } }] },
    ],
    stateVariables: [],
    bEvents: [
      { id: 'b1', name: 'Arrive', scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b1', dist: 'Exponential', distParams: { mean: '2' }, isRenege: false }] },
      { id: 'b2', name: 'Done', scheduledTime: '999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [
      { id: 'c1', name: 'Serve',
        condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [{ id: 'cs1', eventId: 'b2', dist: 'ServerAttr',
                       distParams: { attr: 'serviceTime' }, useEntityCtx: true }] },
    ],
  };

  test('two runs with the same seed produce identical summary.served', () => {
    const r1 = buildEngine(m1Model, 42, 0, 50).runAll();
    const r2 = buildEngine(m1Model, 42, 0, 50).runAll();
    expect(r1.summary.served).toBe(r2.summary.served);
    expect(r1.summary.served).toBeGreaterThan(0);
  });

  test('two runs with the same seed produce identical finalTime', () => {
    const r1 = buildEngine(m1Model, 1234, 0, 50).runAll();
    const r2 = buildEngine(m1Model, 1234, 0, 50).runAll();
    expect(r1.finalTime).toBe(r2.finalTime);
  });

  test('two runs with different seeds produce different outcomes', () => {
    const r1 = buildEngine(m1Model, 1, 0, 50).runAll();
    const r2 = buildEngine(m1Model, 999999, 0, 50).runAll();
    // Inter-arrival times differ; with a fixed time limit, compare outcomes
    // rather than finalTime, which is expected to equal the limit.
    expect({
      total: r1.summary.total,
      served: r1.summary.served,
      avgWait: r1.summary.avgWait,
    }).not.toEqual({
      total: r2.summary.total,
      served: r2.summary.served,
      avgWait: r2.summary.avgWait,
    });
  });
});

// ── Cross-replication independence (Sprint 29 — F29.6) ───────────────────────
//
// Verifies that replications derived from baseSeed + i are truly independent:
// each stream uses its own PRNG state and no shared mutable state leaks between
// them.  Tests are structural (trace-level) rather than statistical.

describe('cross-replication independence', () => {
  const independenceModel = {
    entityTypes: [
      { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_srv',  name: 'Server',   role: 'server',   count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    bEvents: [
      {
        id: 'b_arrive', name: 'Arrival', scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: '2' } }],
      },
      {
        id: 'b_done', name: 'Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'c_seize', name: 'Seize',
        condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [{ eventId: 'b_done', dist: 'Exponential', distParams: { mean: '1.5' }, useEntityCtx: true }],
      },
    ],
    queues: [],
  };

  test('consecutive seeds (baseSeed+0, baseSeed+1) produce different traces', () => {
    const r0 = buildEngine(independenceModel, 300, 0, 60).runAll();
    const r1 = buildEngine(independenceModel, 301, 0, 60).runAll();

    const msgs0 = r0.log.filter(e => e.phase === 'B').map(e => e.time).join(',');
    const msgs1 = r1.log.filter(e => e.phase === 'B').map(e => e.time).join(',');
    expect(msgs0).not.toBe(msgs1);
  });

  test('replication streams do not share PRNG state — running rep 0 does not affect rep 1', () => {
    // Run rep 1 alone and compare against rep 1 run after rep 0 has completed.
    // If state were shared, the second run of rep 1 would differ from the first.
    const r1_alone   = buildEngine(independenceModel, 301, 0, 60).runAll();

    // Run rep 0 fully first, then run rep 1 again.
    buildEngine(independenceModel, 300, 0, 60).runAll(); // side-effect candidate
    const r1_after0  = buildEngine(independenceModel, 301, 0, 60).runAll();

    expect(r1_alone.summary.served).toBe(r1_after0.summary.served);
    expect(r1_alone.summary.avgWait).toBe(r1_after0.summary.avgWait);
    expect(r1_alone.finalTime).toBe(r1_after0.finalTime);
  });

  test('ten consecutive seeds all produce distinct average wait times', () => {
    const BASE = 1000;
    const avgWaits = Array.from({ length: 10 }, (_, i) =>
      buildEngine(independenceModel, BASE + i, 0, 80).runAll().summary.avgWait
    );
    const unique = new Set(avgWaits);
    expect(unique.size).toBe(10);
  });
});

// ── S40.1 — EntityAttr distribution ──────────────────────────────────────────

describe('EntityAttr distribution — S40.1', () => {
  test('normalizes entityattr aliases to EntityAttr', () => {
    expect(normalizeDistributionName('entityattr')).toBe('EntityAttr');
    expect(normalizeDistributionName('entity-attr')).toBe('EntityAttr');
    expect(normalizeDistributionName('entity_attr')).toBe('EntityAttr');
    expect(normalizeDistributionName('EntityAttr')).toBe('EntityAttr');
  });

  test('EntityAttr is registered in DISTRIBUTIONS with correct metadata', () => {
    const def = DISTRIBUTIONS['EntityAttr'];
    expect(def).toBeDefined();
    expect(def.params).toContain('attr');
    expect(def.label).toBeTruthy();
    expect(def.hint).toBeTruthy();
  });

  test('sample() for EntityAttr returns 0 (resolved in phases.js)', () => {
    const rng = mulberry32(1);
    const result = sample('EntityAttr', { attr: 'serviceTime' }, rng);
    expect(result).toBe(0);
  });
});

// ── S40.2 — Schedule rows[] ───────────────────────────────────────────────────

describe('Schedule rows[] — S40.2', () => {
  test('rows[] timing: delay = plannedTime - clock', () => {
    const rng = mulberry32(1);
    const state = {};
    const params = { rows: [{ time: 20, attrs: { x: 1 } }, { time: 45, attrs: { x: 2 } }] };
    const d1 = sample('Schedule', params, rng, null, { state, schedKey: 'r', clock: 0 });
    expect(d1).toBe(20);
    const d2 = sample('Schedule', params, rng, null, { state, schedKey: 'r', clock: 20 });
    expect(d2).toBe(25);
  });

  test('rows[] stores attrs in state under __schedRowAttrs_<key>', () => {
    const rng = mulberry32(1);
    const state = {};
    const params = { rows: [{ time: 5, attrs: { priority: 3 } }] };
    sample('Schedule', params, rng, null, { state, schedKey: 'k', clock: 0 });
    expect(state['__schedRowAttrs_k']).toEqual({ priority: 3 });
  });

  test('rows[] without attrs stores null for that row', () => {
    const rng = mulberry32(1);
    const state = {};
    const params = { rows: [{ time: 5 }] };
    sample('Schedule', params, rng, null, { state, schedKey: 'k', clock: 0 });
    expect(state['__schedRowAttrs_k']).toBeNull();
  });

  test('rows[] backward-compatible: times[] path still works unchanged', () => {
    const rng = mulberry32(1);
    const state = {};
    const params = { times: [10, 20, 30] };
    const d1 = sample('Schedule', params, rng, null, { state, schedKey: 't', clock: 0 });
    expect(d1).toBe(10);
    expect(state['__schedRowAttrs_t']).toBeNull();
  });

  test('rows[] increments schedule index correctly across calls', () => {
    const rng = mulberry32(1);
    const state = {};
    const params = { rows: [{ time: 1 }, { time: 2 }, { time: 3 }] };
    sample('Schedule', params, rng, null, { state, schedKey: 's', clock: 0 });
    expect(state['__schedIdx_s']).toBe(1);
    sample('Schedule', params, rng, null, { state, schedKey: 's', clock: 1 });
    expect(state['__schedIdx_s']).toBe(2);
    sample('Schedule', params, rng, null, { state, schedKey: 's', clock: 2 });
    expect(state['__schedIdx_s']).toBe(3);
  });
});
