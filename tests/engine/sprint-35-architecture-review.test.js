// Sprint 35 — Architecture review correctness fixes.
// Covers M2 (warmup FEL pruning), M3 (V8 blocking validation), L1 (dead code removal).

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { validateModel } from '../../src/engine/validation.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => {
  resetSeq();
});

// ── M3: V8 validation — product decision documented and tested ────────────────
// Sprint 35 review: making individual missing source/sink a hard blocker would
// break ~20 UI tests whose fixture models use simplified (one-sided) structures,
// and would block valid one-way flows. Product decision: individual missing
// source/sink remains a warning; BOTH missing together is the hard blocker.

describe('M3 — V8 validation product-decision (both-missing blocks, individual warns)', () => {
  const base = {
    entityTypes: [],
    stateVariables: [],
    queues: [],
    cEvents: [],
  };

  test('missing both ARRIVE and COMPLETE is a blocking error', () => {
    const model = { ...base, bEvents: [{ id: 'noop', name: 'No-op', effect: 'x = 1', schedules: [] }] };
    const result = validateModel(model);
    expect(result.errors.some(e => e.code === 'V8')).toBe(true);
    expect(result.warnings.filter(w => w.code === 'V8')).toHaveLength(0);
  });

  test('missing ARRIVE only is a warning (not a blocker) — product decision', () => {
    const model = { ...base, bEvents: [{ id: 'done', name: 'Done', effect: 'COMPLETE()', schedules: [] }] };
    const result = validateModel(model);
    expect(result.errors.filter(e => e.code === 'V8')).toHaveLength(0);
    expect(result.warnings.some(w => w.code === 'V8')).toBe(true);
  });

  test('missing COMPLETE only is a warning (not a blocker) — product decision', () => {
    const model = { ...base, bEvents: [{ id: 'arr', name: 'Arrive', effect: 'ARRIVE(C, Q)', schedules: [] }] };
    const result = validateModel(model);
    expect(result.errors.filter(e => e.code === 'V8')).toHaveLength(0);
    expect(result.warnings.some(w => w.code === 'V8')).toBe(true);
  });

  test('valid model with both ARRIVE and COMPLETE has no V8 findings', () => {
    const model = {
      ...base,
      bEvents: [
        { id: 'arr',  name: 'Arrive', effect: 'ARRIVE(C, Q)', schedules: [] },
        { id: 'done', name: 'Done',   effect: 'COMPLETE()',   schedules: [] },
      ],
    };
    const result = validateModel(model);
    expect(result.errors.filter(e => e.code === 'V8')).toHaveLength(0);
    expect(result.warnings.filter(w => w.code === 'V8')).toHaveLength(0);
  });

  test('RENEGE satisfies the sink requirement', () => {
    const model = {
      ...base,
      bEvents: [
        { id: 'arr',    name: 'Arrive',  effect: 'ARRIVE(C, Q)', schedules: [] },
        { id: 'renege', name: 'Reneges', effect: 'RENEGE(ctx)',   schedules: [] },
      ],
    };
    const result = validateModel(model);
    expect(result.errors.filter(e => e.code === 'V8')).toHaveLength(0);
    expect(result.warnings.filter(w => w.code === 'V8')).toHaveLength(0);
  });
});

// ── M2: Warmup FEL pruning — no spurious COMPLETE-skipped noise ───────────────

describe('M2 — Warmup FEL context pruning', () => {
  function makeWarmupModel() {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr',  name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '3' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }],
      }],
      stateVariables: [],
    };
  }

  test('no "COMPLETE skipped" log entries appear after warmup completes', () => {
    // Warmup=5 means customers served at t=2 (entity 1) are done before warmup.
    // Their COMPLETE FEL entry (t=2) fires before warmup anyway, so no stale entries.
    // Run with warmup=10 where entities complete before the warmup boundary.
    const engine = buildEngine(makeWarmupModel(), 42, 10, 60);
    const result = engine.runAll();

    const skippedLogs = result.log.filter(e =>
      e.message?.includes('COMPLETE skipped') &&
      e.message?.includes('not found')
    );
    // After M2 fix: pruned FEL entries mean no "not found" skips for removed entities
    expect(skippedLogs).toHaveLength(0);
  });

  test('entities in service at warmup boundary complete correctly post-warmup', () => {
    // With MTBF/MTTR or long service, entities can be in-service at warmup.
    // They should complete normally and count toward post-warmup stats.
    // Service=8, warmup=5: entity starting at t=0 is still in service at warmup t=5.
    const model = {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr',  name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)', schedules: [] },
        { id: 'done', name: 'Done',   scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '8' }, useEntityCtx: true }],
      }],
      stateVariables: [],
    };
    // Warmup=5, total=20: customer arrives t=0, assigned t=0, completes t=8 (post-warmup)
    const engine = buildEngine(model, 42, 5, 20);
    const result = engine.runAll();

    // The entity completing at t=8 (after warmup t=5) should be counted
    expect(result.summary.served).toBeGreaterThanOrEqual(1);
    // No spurious skipped completions
    const skipped = result.log.filter(e => e.message?.includes('COMPLETE skipped') && e.message?.includes('not found'));
    expect(skipped).toHaveLength(0);
  });

  test('warmup does not suppress phaseCTruncated flag', () => {
    // Verifies that other runAll() return fields survive — regression guard for L1 dead-code removal.
    const engine = buildEngine(makeWarmupModel(), 42, 5, 30);
    const result = engine.runAll();
    // phaseCTruncated must be present (boolean) — part of runAll() contract
    expect(typeof result.phaseCTruncated).toBe('boolean');
    // summary must be computed via getSummary(), not dead local block
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.avgWIP).toBe('number');
  });
});

// ── L1: Dead summary block removal — runAll() still returns correct summary ───

describe('L1 — runAll() summary correctness after dead-code removal', () => {
  function makeSimpleModel() {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      bEvents: [
        { id: 'arr',  name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '3' } }] },
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }],
      }],
      stateVariables: [],
    };
  }

  test('summary fields present and consistent after dead-code removal', () => {
    const engine = buildEngine(makeSimpleModel(), 42, 0, 30);
    const result = engine.runAll();
    const { summary } = result;

    expect(summary).toBeDefined();
    expect(typeof summary.served).toBe('number');
    expect(summary.served).toBeGreaterThan(0);
    expect(typeof summary.avgWait).toBe('number');
    expect(typeof summary.avgSvc).toBe('number');
    expect(typeof summary.avgWIP).toBe('number');
    expect(typeof summary.avgSojourn).toBe('number');
  });

  test('summary served count matches entitySummary done count', () => {
    const engine = buildEngine(makeSimpleModel(), 42, 0, 30);
    const result = engine.runAll();
    const doneCount = result.entitySummary.filter(e => e.role === 'customer' && e.status === 'done').length;
    expect(result.summary.served).toBe(doneCount);
  });

  test('runAll() top-level keys are all present', () => {
    const engine = buildEngine(makeSimpleModel(), 42, 0, 20);
    const result = engine.runAll();
    expect(result).toHaveProperty('finalTime');
    expect(result).toHaveProperty('log');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('phaseCTruncated');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('entitySummary');
    expect(result).toHaveProperty('snap');
  });
});
