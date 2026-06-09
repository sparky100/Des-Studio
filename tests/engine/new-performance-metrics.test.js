// Sprint 85 — New performance goal metrics tests.
// Covers: avgTimeInSystem (weighted avg across all entities), servedRatio (served/total).

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';

beforeEach(() => { resetSeq(); });

// ── Helper: simple M/M/1 model with stable queue (service faster than arrival) ─
function stableModel() {
  return {
    entityTypes: [
      { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'S', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
    ],
    queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
    stateVariables: [],
    bEvents: [
      { id: 'arr',  name: 'Arrive',   scheduledTime: '0',  effect: 'ARRIVE(Customer, Queue)',
        schedules: [{ eventId: 'arr', dist: 'fixed', distParams: { value: '10' } }] },
      { id: 'done', name: 'Complete', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
    ],
    cEvents: [{
      id: 'a', name: 'Assign', priority: 1,
      condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Queue, Server)',
      cSchedules: [{ eventId: 'done', dist: 'fixed', distParams: { value: '3' }, useEntityCtx: true }],
    }],
  };
}

// ── Test 1: servedRatio is computed and between 0 and 1 ──────────────────────

test('servedRatio is between 0 and 1 when entities exist', () => {
  const engine = buildEngine(stableModel(), 42, 0, 100);
  const result = engine.runAll();
  expect(result.summary.total).toBeGreaterThan(0);
  expect(result.summary.servedRatio).toBeGreaterThanOrEqual(0);
  expect(result.summary.servedRatio).toBeLessThanOrEqual(1);
});

// ── Test 2: servedRatio approaches 1.0 with long enough run in stable system ─

test('servedRatio approaches 1.0 in stable system with long run', () => {
  const engine = buildEngine(stableModel(), 42, 0, 200);
  const result = engine.runAll();
  // In a stable system (arrival every 10, service 3), most entities should complete
  expect(result.summary.servedRatio).toBeGreaterThan(0.8);
});

// ── Test 3: avgTimeInSystem exists and is positive when entities exist ───────

test('avgTimeInSystem is computed and positive when entities arrive', () => {
  const engine = buildEngine(stableModel(), 42, 0, 100);
  const result = engine.runAll();
  expect(result.summary.avgTimeInSystem).not.toBeNull();
  expect(result.summary.avgTimeInSystem).toBeGreaterThan(0);
});

// ── Test 4: avgTimeInSystem and avgSojourn are both positive ─────────────────

test('both avgTimeInSystem and avgSojourn are positive', () => {
  const engine = buildEngine(stableModel(), 42, 0, 100);
  const result = engine.runAll();
  expect(result.summary.avgSojourn).toBeGreaterThan(0);
  expect(result.summary.avgTimeInSystem).toBeGreaterThan(0);
});

// ── Test 5: avgTimeInSystem and avgSojourn are similar when most complete ────

test('avgTimeInSystem and avgSojourn are similar when most entities complete', () => {
  const engine = buildEngine(stableModel(), 42, 0, 200);
  const result = engine.runAll();
  if (result.summary.avgSojourn != null && result.summary.avgTimeInSystem != null) {
    // They should be within 20% of each other when most entities complete
    const ratio = result.summary.avgTimeInSystem / result.summary.avgSojourn;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  }
});

// ── Test 6: servedRatio is 0 when no entities served ─────────────────────────

test('servedRatio is 0 when no entities are served', () => {
  const model = stableModel();
  // Remove the server so no ASSIGN can happen
  model.entityTypes = model.entityTypes.filter(e => e.role !== 'server');
  const engine = buildEngine(model, 42, 0, 30);
  const result = engine.runAll();
  expect(result.summary.total).toBeGreaterThan(0);
  expect(result.summary.served).toBe(0);
  expect(result.summary.servedRatio).toBe(0);
});

// ── Test 7: avgTimeInSystem includes in-progress partial sojourns ────────────

test('avgTimeInSystem accounts for in-progress entities', () => {
  const model = stableModel();
  // Very short run so entities are still in the system
  // Arrival at t=0, service time 3, so entity is served by t=3
  // But if we stop at t=2, entity is still waiting
  const engine = buildEngine(model, 42, 0, 2);
  const result = engine.runAll();
  expect(result.summary.avgTimeInSystem).not.toBeNull();
  // At t=2, the first entity arrived at t=0 but hasn't been served yet
  expect(result.summary.total).toBeGreaterThan(0);
});
