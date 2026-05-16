// Sprint 36 — Cost modelling (G17) and public API (G24) tests.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => { resetSeq(); });

// ── G17: COST macro accumulation ───────────────────────────────────────────

describe('G17 — COST macro and summary.totalCost', () => {
  function makeServiceModel(effect) {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [
          { name: 'value', valueType: 'number', defaultValue: '10' },
        ]},
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [
        { id: 'arr',  name: 'Arrive',   scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
          schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '2' } }] },
        { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [{
        id: 'a', name: 'Assign', priority: 1,
        condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
        effect,
        cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '1' }, useEntityCtx: true }],
      }],
    };
  }

  test('COST(5) accumulates flat cost per service event', () => {
    const engine = buildEngine(makeServiceModel('ASSIGN(Queue, Server); COST(5)'), 42, 0, 20);
    const { summary } = engine.runAll();
    expect(summary.served).toBeGreaterThan(0);
    // totalCost may include one in-flight assignment (not yet completed), so allow ±5
    expect(summary.totalCost).toBeGreaterThanOrEqual(summary.served * 5);
    expect(summary.totalCost).toBeLessThanOrEqual((summary.served + 1) * 5);
  });

  test('COST with entity attribute expression: COST(Entity.value * 2)', () => {
    const engine = buildEngine(makeServiceModel('ASSIGN(Queue, Server); COST(Entity.value * 2)'), 42, 0, 20);
    const { summary } = engine.runAll();
    // Each customer has value=10, so each service costs 20
    expect(summary.served).toBeGreaterThan(0);
    expect(summary.totalCost).toBeGreaterThanOrEqual(summary.served * 20);
    expect(summary.totalCost).toBeLessThanOrEqual((summary.served + 1) * 20);
  });

  test('costPerServed equals totalCost / served', () => {
    const engine = buildEngine(makeServiceModel('ASSIGN(Queue, Server); COST(15)'), 42, 0, 20);
    const { summary } = engine.runAll();
    expect(summary.served).toBeGreaterThan(0);
    // costPerServed = totalCost / served; allow for one in-flight unmatched assignment
    expect(summary.costPerServed).toBeGreaterThanOrEqual(15);
    expect(summary.costPerServed).toBeLessThanOrEqual(15 * (1 + 1 / summary.served) + 0.01);
  });

  test('totalCost is 0 and costPerServed is 0 when no COST macro is used', () => {
    const engine = buildEngine(makeServiceModel('ASSIGN(Queue, Server)'), 42, 0, 20);
    const { summary } = engine.runAll();
    expect(summary.totalCost).toBe(0);
    // costPerServed = 0/served = 0 (not null — cost tracking simply wasn't used)
    expect(summary.costPerServed).toBe(0);
  });

  test('COST with math function: COST(min(Entity.value, 8))', () => {
    const engine = buildEngine(makeServiceModel('ASSIGN(Queue, Server); COST(min(Entity.value, 8))'), 42, 0, 20);
    const { summary } = engine.runAll();
    // value=10, min(10, 8)=8 per service; allow for in-flight
    expect(summary.totalCost).toBeGreaterThanOrEqual(summary.served * 8);
    expect(summary.totalCost).toBeLessThanOrEqual((summary.served + 1) * 8);
  });

  test('COST with non-finite expression logs skip and does not corrupt totalCost', () => {
    const engine = buildEngine(makeServiceModel('ASSIGN(Queue, Server); COST(unknownVar / 0)'), 42, 0, 10);
    const { summary, log } = engine.runAll();
    // Cost should remain 0 if expression is non-finite
    expect(summary.totalCost).toBe(0);
    const costLog = log.filter(e => e.message?.includes('COST:') && e.message?.includes('finite'));
    expect(costLog.length).toBeGreaterThan(0);
  });

  test('COST accumulates per-entity cost in entity.attrs.__cost', () => {
    const engine = buildEngine(makeServiceModel('ASSIGN(Queue, Server); COST(7)'), 42, 0, 20);
    const { entitySummary } = engine.runAll();
    const costEntities = entitySummary.filter(e => e.role !== 'server' && e.attrs.__cost != null);
    expect(costEntities.length).toBeGreaterThan(0);
    for (const entity of costEntities) {
      expect(entity.attrs.__cost).toBeCloseTo(7, 5);
    }
  });

  test('entities without COST macro have no __cost attribute', () => {
    const engine = buildEngine(makeServiceModel('ASSIGN(Queue, Server)'), 42, 0, 20);
    const { entitySummary } = engine.runAll();
    const costEntities = entitySummary.filter(e => e.attrs.__cost != null);
    expect(costEntities.length).toBe(0);
  });
});

// ── G24: Public API module exports ─────────────────────────────────────────

describe('G24 — Public engine API exports', () => {
  test('buildEngine is exported from public-api.js', async () => {
    const api = await import('../../src/engine/public-api.js');
    expect(typeof api.buildEngine).toBe('function');
  });

  test('validateModel is exported from public-api.js', async () => {
    const api = await import('../../src/engine/public-api.js');
    expect(typeof api.validateModel).toBe('function');
    // Quick smoke test: validateModel returns errors/warnings
    const result = api.validateModel({
      entityTypes: [], stateVariables: [], queues: [], bEvents: [], cEvents: [],
    });
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test('summarizeReplicationResults is exported from public-api.js', async () => {
    const api = await import('../../src/engine/public-api.js');
    expect(typeof api.summarizeReplicationResults).toBe('function');
    // Smoke test
    const ci = api.summarizeReplicationResults([{ summary: { avgWait: 5 } }, { summary: { avgWait: 7 } }], ['summary.avgWait']);
    expect(ci['summary.avgWait'].n).toBe(2);
  });

  test('runReplications is exported from public-api.js', async () => {
    const api = await import('../../src/engine/public-api.js');
    expect(typeof api.runReplications).toBe('function');
  });

  test('mulberry32 is exported from public-api.js', async () => {
    const api = await import('../../src/engine/public-api.js');
    expect(typeof api.mulberry32).toBe('function');
    const rng = api.mulberry32(42);
    expect(typeof rng()).toBe('number');
  });
});
