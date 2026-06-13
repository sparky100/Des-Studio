// tests/engine/model-immutability.test.js
//
// Guards the invariant that buildEngine() never mutates its model argument.
// This invariant is load-bearing for INIT_RUN sharing (same model object
// reused across all reps in a worker) and for the Phase 4 runtimeModel cache.

import { describe, expect, test } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { makeMM1Model } from './__helpers__/benchmarkFixtures.js';

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj)) deepFreeze(value);
  return obj;
}

describe('model immutability', () => {
  test('buildEngine does not mutate the model object', () => {
    const model = deepFreeze(makeMM1Model(0.9, 1.0));
    // Runs from the same frozen object must not throw (mutation would throw in strict mode)
    const r1 = buildEngine(model, 1, 0, 50, null, 2000, 200, false).runAll();
    const r2 = buildEngine(model, 1, 0, 50, null, 2000, 200, false).runAll();
    expect(r1.summary.served).toBeGreaterThan(0);
    expect(r1.summary.served).toBe(r2.summary.served);
  });

  test('runtimeModel cache returns identical results for same model+seed', () => {
    const model = makeMM1Model(0.8, 1.0);
    const r1 = buildEngine(model, 42, 0, 100, null, 5000, 500, false).runAll();
    const r2 = buildEngine(model, 42, 0, 100, null, 5000, 500, false).runAll();
    expect(r1.summary).toEqual(r2.summary);
    expect(r1.finalTime).toBe(r2.finalTime);
  });
});
