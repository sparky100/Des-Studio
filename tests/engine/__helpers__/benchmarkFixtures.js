// Shared MM/1 model fixtures and helpers for engine benchmark and CI tests.
import { buildEngine } from '../../../src/engine/index.js';

/**
 * Returns a minimal M/M/1 model with configurable arrival and service rates.
 * Default: λ=0.9, μ=1.0 (ρ=0.9, E[Wq]=9.0)
 */
export function makeMM1Model(lambda = 0.9, mu = 1.0) {
  return {
    entityTypes: [
      { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_srv',  name: 'Server',   role: 'server',   count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    bEvents: [
      {
        id: 'b_arrive', name: 'Arrival', scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: String(1 / lambda) } }],
      },
      {
        id: 'b_complete', name: 'Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'c_seize', name: 'Seize',
        condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [{
          eventId: 'b_complete', dist: 'Exponential',
          distParams: { mean: String(1 / mu) }, useEntityCtx: true,
        }],
      },
    ],
    queues: [],
  };
}

/**
 * Returns a minimal M/M/c model with configurable arrival/service rates and
 * server count.
 * Default: λ=1.6, μ=1.0, c=2 (ρ=0.8, Erlang-C E[Wq]≈1.7778)
 */
export function makeMMcModel(lambda = 1.6, mu = 1.0, c = 2) {
  return {
    entityTypes: [
      { id: 'et_cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
      { id: 'et_srv',  name: 'Server',   role: 'server',   count: c, attrDefs: [] },
    ],
    stateVariables: [],
    bEvents: [
      {
        id: 'b_arrive', name: 'Arrival', scheduledTime: '0',
        effect: 'ARRIVE(Customer)',
        schedules: [{ eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: String(1 / lambda) } }],
      },
      {
        id: 'b_complete', name: 'Complete', scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'c_seize', name: 'Seize',
        condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Customer, Server)',
        cSchedules: [{
          eventId: 'b_complete', dist: 'Exponential',
          distParams: { mean: String(1 / mu) }, useEntityCtx: true,
        }],
      },
    ],
    queues: [],
  };
}

/**
 * Step-based runner: drives the engine until targetServed entities are done,
 * then returns the mean wait of the steady-state slice (skipping the first
 * `warmup` completions by arrival order).
 *
 * async + a periodic yield: vitest's worker RPC layer enforces a hard,
 * non-configurable ~60s heartbeat timeout (see the identical note in
 * tests/engine/determinism-parity.test.js) that a long enough fully-
 * synchronous run can trip, crashing the whole `vitest run`. This helper's
 * heaviest callers (the M/M/c scenarios in golden.test.js/benchmarks.test.js)
 * are comfortably under that on their own, but full-suite runs share this
 * environment's small (4-core) CPU budget across many parallel workers,
 * and contention alone has been enough to push them close to it — so this
 * yields unconditionally rather than relying on a margin that shrinks under
 * load. Every caller already awaits (or now does, per this change).
 */
export async function runUntilServed(model, targetServed, seed, warmup) {
  const engine = buildEngine(model, seed, 999999);
  let steps = 0;
  while (steps < 500000) {
    const { done } = engine.step();
    steps++;
    if (done) break;
    if (steps % 50 === 0 && engine.getSnap().served >= targetServed) break;
    if (steps % 500 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  const snap = engine.getSnap();
  const allDone = snap.entities
    .filter(e => e.role !== 'server' && e.status === 'done')
    .sort((a, b) => a.arrivalTime - b.arrivalTime);
  const steadyDone = allDone.slice(warmup);
  const waits = steadyDone.map(e => (e.serviceStart || 0) - e.arrivalTime);
  return waits.reduce((a, b) => a + b, 0) / waits.length;
}
