import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

describe('Engine Termination (Sprint 3.2)', () => {
  test('terminates at maxSimTime when time-limit is reached', () => {
    const model = {
      bEvents: [
        { id: 'b1', name: 'Infinite', scheduledTime: '0', effect: '', schedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: 10 } }] },
      ]
    };
    // If no maxSimTime, this would run until maxCycles.
    // With maxSimTime=50, it should stop exactly at t=50 (or before the first event at t=60).
    const engine = buildEngine(model, 0, 0, 50);
    const result = engine.runAll();
    
    expect(result.finalTime).toBe(50);
    expect(result.log.some(e => e.phase === 'END' && e.message.includes('Run limit reached'))).toBe(true);
  });

  test('terminates when terminationCondition is met', () => {
    const model = {
      stateVariables: [{ name: 'counter', initialValue: '0' }],
      bEvents: [
        { id: 'b1', name: 'Inc', scheduledTime: '0', effect: 'counter++', schedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: 1 } }] },
      ]
    };
    
    // Stop when counter reaches 5.
    // Events at t=0, 1, 2, 3, 4 fire.
    // At t=4, counter becomes 5.
    // Termination condition check happens AFTER Phase B/C at t=4.
    // It sees counter=5 and terminates. Final clock = 4.
    const engine = buildEngine(model, 0, 0, null, 'counter >= 5');
    const result = engine.runAll();
    
    expect(result.snap.scalars.counter).toBe(5);
    expect(result.finalTime).toBe(4); 
    expect(result.log.some(e => e.phase === 'END' && e.message.includes('Termination condition met'))).toBe(true);
  });

  test('terminates at maxCycles if no other condition met', () => {
    const model = {
      bEvents: [
        { id: 'b1', name: 'Infinite', scheduledTime: '0', effect: '', schedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: 1 } }] },
      ]
    };
    
    const maxCycles = 100;
    const engine = buildEngine(model, 0, 0, null, null, maxCycles);
    const result = engine.runAll();
    
    expect(result.log.some(e => e.phase === 'END' && e.message.includes('Cycle limit reached'))).toBe(true);
  });

  test('warmupPeriod and maxSimTime work together', () => {
    const model = {
      stateVariables: [{ name: 'count', initialValue: '0', resetOnWarmup: true }],
      bEvents: [
        { id: 'b1', name: 'Inc', scheduledTime: '0', effect: 'count++', schedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: 10 } }] },
      ]
    };
    
    // Warmup at 25, stop at 50.
    // Events at: 0, 10, 20 (reset here), 30, 40, 50.
    // count becomes 3 (0, 10, 20). Warmup at 25 resets it to 0.
    // count increments at 30, 40, 50. Final count = 3.
    const engine = buildEngine(model, 0, 25, 50);
    const result = engine.runAll();
    
    expect(result.finalTime).toBe(50);
    expect(result.snap.scalars.count).toBe(3);
  });
});
