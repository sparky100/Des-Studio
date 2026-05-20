// tests/engine/benchmarks/performance.test.js
//
// Wall-clock throughput gate for a complex multi-queue model.
// Model: 3 entity types, 4 queues, 6 B-events, 4 C-events.
// Asserts the engine is not glacially slow — a regression here signals an
// accidental O(n²) loop being introduced in the hot path.

import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../../src/engine/index.js';

function complexModel() {
  return {
    entityTypes: [
      { id: 'et_a',   name: 'TypeA',  role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_b',   name: 'TypeB',  role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_srv', name: 'Server', role: 'server',   count: 4, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: 'q_a',      name: 'Queue A',      customerType: 'TypeA', discipline: 'FIFO' },
      { id: 'q_b',      name: 'Queue B',      customerType: 'TypeB', discipline: 'FIFO' },
      { id: 'q_c',      name: 'Queue C',      customerType: 'TypeA', discipline: 'FIFO' },
      { id: 'q_shared', name: 'Queue Shared', customerType: 'TypeB', discipline: 'FIFO' },
    ],
    bEvents: [
      {
        id: 'b_a1', name: 'TypeA → Queue A', scheduledTime: '0',
        effect: 'ARRIVE(TypeA, Queue A)',
        schedules: [{ eventId: 'b_a1', dist: 'Exponential', distParams: { mean: '20' } }],
      },
      {
        id: 'b_a2', name: 'TypeA → Queue C', scheduledTime: '1',
        effect: 'ARRIVE(TypeA, Queue C)',
        schedules: [{ eventId: 'b_a2', dist: 'Exponential', distParams: { mean: '15' } }],
      },
      {
        id: 'b_a3', name: 'TypeA → Queue Shared', scheduledTime: '1.5',
        effect: 'ARRIVE(TypeA, Queue Shared)',
        schedules: [{ eventId: 'b_a3', dist: 'Exponential', distParams: { mean: '25' } }],
      },
      {
        id: 'b_b1', name: 'TypeB → Queue B', scheduledTime: '0.5',
        effect: 'ARRIVE(TypeB, Queue B)',
        schedules: [{ eventId: 'b_b1', dist: 'Exponential', distParams: { mean: '20' } }],
      },
      {
        id: 'b_b2', name: 'TypeB → Queue Shared', scheduledTime: '0.7',
        effect: 'ARRIVE(TypeB, Queue Shared)',
        schedules: [{ eventId: 'b_b2', dist: 'Exponential', distParams: { mean: '15' } }],
      },
      {
        id: 'b_complete', name: 'Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'c_a', name: 'Serve Queue A',
        condition: 'queue(Queue A).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue A, Server)',
        cSchedules: [{ eventId: 'b_complete', dist: 'Exponential', distParams: { mean: '3' }, useEntityCtx: true }],
      },
      {
        id: 'c_b', name: 'Serve Queue B',
        condition: 'queue(Queue B).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue B, Server)',
        cSchedules: [{ eventId: 'b_complete', dist: 'Exponential', distParams: { mean: '3' }, useEntityCtx: true }],
      },
      {
        id: 'c_c', name: 'Serve Queue C',
        condition: 'queue(Queue C).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue C, Server)',
        cSchedules: [{ eventId: 'b_complete', dist: 'Exponential', distParams: { mean: '2' }, useEntityCtx: true }],
      },
      {
        id: 'c_shared', name: 'Serve Queue Shared',
        condition: 'queue(Queue Shared).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Queue Shared, Server)',
        cSchedules: [{ eventId: 'b_complete', dist: 'Exponential', distParams: { mean: '2' }, useEntityCtx: true }],
      },
    ],
  };
}

// Model spec: 3 entity types, 4 queues, 6 B-events, 4 C-events.
// Total arrival rate ≈ 0.27/t-unit (5 streams, low rate to keep event count bounded).
// 4 servers with mean service ≈ 2.5t — utilisation ≈ 0.17 (always has capacity).
// maxSimTime=2000, 1 replication, no warmup → ≈ 550 total events.
// Threshold: 3000ms (comfortably met locally at ≈380ms; 3000ms gives CI headroom).

describe('Performance — complex multi-queue model throughput', () => {
  test('3-type, 4-queue, 6-B, 4-C model completes maxSimTime=2000 in < 3000ms', { timeout: 10000 }, () => {
    const model = complexModel();
    const t0 = Date.now();
    const result = buildEngine(model, 42, 0, 2000).runAll();
    const elapsed = Date.now() - t0;

    console.log(`Performance: ${elapsed}ms (served=${result.summary.served}, total=${result.summary.total})`);

    expect(elapsed).toBeLessThan(3000);
    // Sanity: engine actually processed events
    expect(result.summary.total).toBeGreaterThan(0);
  });
});
