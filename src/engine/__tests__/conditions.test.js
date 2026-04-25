import { describe, test, expect } from 'vitest';
import { evalCondition, buildConditionTokens } from '../conditions.js';
import { makeHelpers } from '../entities.js';

// Build helpers from a live entity array (helpers read the array by reference)
function makeTestHelpers(entities) {
  return makeHelpers(entities);
}

describe('evalCondition', () => {
  test('queue(Customer).length > 0: true when waiting customers exist', () => {
    const entities = [{ id: 1, type: 'Customer', role: 'customer', status: 'waiting', arrivalTime: 0 }];
    const h = makeTestHelpers(entities);
    expect(evalCondition('queue(Customer).length > 0', h, {}, 0)).toBe(true);
  });

  test('queue(Customer).length > 0: false when no waiting customers', () => {
    const entities = [];
    const h = makeTestHelpers(entities);
    expect(evalCondition('queue(Customer).length > 0', h, {}, 0)).toBe(false);
  });

  test('idle(Server).count > 0: true when idle servers exist', () => {
    const entities = [{ id: 1, type: 'Server', role: 'server', status: 'idle', arrivalTime: 0 }];
    const h = makeTestHelpers(entities);
    expect(evalCondition('idle(Server).count > 0', h, {}, 0)).toBe(true);
  });

  test('idle(Server).count > 0: false when all servers busy', () => {
    const entities = [{ id: 1, type: 'Server', role: 'server', status: 'busy', arrivalTime: 0 }];
    const h = makeTestHelpers(entities);
    expect(evalCondition('idle(Server).count > 0', h, {}, 0)).toBe(false);
  });

  test('busy(Server).count > 0: true when server is busy', () => {
    const entities = [{ id: 1, type: 'Server', role: 'server', status: 'busy', arrivalTime: 0 }];
    const h = makeTestHelpers(entities);
    expect(evalCondition('busy(Server).count > 0', h, {}, 0)).toBe(true);
  });

  test('AND: true only when both conditions met', () => {
    const entities = [
      { id: 1, type: 'Customer', role: 'customer', status: 'waiting', arrivalTime: 0 },
      { id: 2, type: 'Server',   role: 'server',   status: 'idle',    arrivalTime: 0 },
    ];
    const h = makeTestHelpers(entities);
    expect(evalCondition('queue(Customer).length > 0 AND idle(Server).count > 0', h, {}, 0)).toBe(true);
  });

  test('AND: false when one side fails', () => {
    const entities = [
      { id: 2, type: 'Server', role: 'server', status: 'idle', arrivalTime: 0 },
    ];
    const h = makeTestHelpers(entities);
    expect(evalCondition('queue(Customer).length > 0 AND idle(Server).count > 0', h, {}, 0)).toBe(false);
  });

  test('OR: true when at least one side is true', () => {
    const entities = [{ id: 1, type: 'Server', role: 'server', status: 'idle', arrivalTime: 0 }];
    const h = makeTestHelpers(entities);
    expect(evalCondition('queue(Customer).length > 0 OR idle(Server).count > 0', h, {}, 0)).toBe(true);
  });

  test('served > 5: true when state.__served = 6', () => {
    const h = makeTestHelpers([]);
    expect(evalCondition('served > 5', h, { __served: 6 }, 0)).toBe(true);
  });

  test('served > 5: false when state.__served = 4', () => {
    const h = makeTestHelpers([]);
    expect(evalCondition('served > 5', h, { __served: 4 }, 0)).toBe(false);
  });

  test('reneged == 0: true when state.__reneged = 0', () => {
    const h = makeTestHelpers([]);
    expect(evalCondition('reneged == 0', h, { __reneged: 0 }, 0)).toBe(true);
  });

  test('clock < 100: true when clock = 50', () => {
    const h = makeTestHelpers([]);
    expect(evalCondition('clock < 100', h, {}, 50)).toBe(true);
  });

  test('clock < 100: false when clock = 150', () => {
    const h = makeTestHelpers([]);
    expect(evalCondition('clock < 100', h, {}, 150)).toBe(false);
  });

  test('custom state variable: totalArrived > 3 resolves correctly', () => {
    const h = makeTestHelpers([]);
    expect(evalCondition('totalArrived > 3', h, { totalArrived: 5 }, 0)).toBe(true);
    expect(evalCondition('totalArrived > 3', h, { totalArrived: 2 }, 0)).toBe(false);
  });

  test('attr(Server, serviceTime) reads first idle server attribute', () => {
    const entities = [
      { id: 1, type: 'Server', role: 'server', status: 'idle', arrivalTime: 0, attrs: { serviceTime: 4 } },
    ];
    const h = makeTestHelpers(entities);
    expect(evalCondition('attr(Server, serviceTime) == 4', h, {}, 0)).toBe(true);
  });

  test('invalid expression returns false without throwing', () => {
    const h = makeTestHelpers([]);
    expect(() => evalCondition('this is not valid JS !!!', h, {}, 0)).not.toThrow();
    expect(evalCondition('this is not valid JS !!!', h, {}, 0)).toBe(false);
  });

  test('empty condition returns false', () => {
    const h = makeTestHelpers([]);
    expect(evalCondition('', h, {}, 0)).toBe(false);
    expect(evalCondition('   ', h, {}, 0)).toBe(false);
    expect(evalCondition(null, h, {}, 0)).toBe(false);
  });
});

describe('buildConditionTokens', () => {
  test('returns queue token for each customer type', () => {
    const types = [{ name: 'Customer', role: 'customer' }];
    const tokens = buildConditionTokens(types, []);
    const queueToken = tokens.find(t => t.value === 'queue(Customer).length');
    expect(queueToken).toBeDefined();
    expect(queueToken.valueType).toBe('number');
  });

  test('returns idle and busy tokens for each server type', () => {
    const types = [{ name: 'Server', role: 'server' }];
    const tokens = buildConditionTokens(types, []);
    expect(tokens.find(t => t.value === 'idle(Server).count')).toBeDefined();
    expect(tokens.find(t => t.value === 'busy(Server).count')).toBeDefined();
  });

  test('returns served and reneged tokens always', () => {
    const tokens = buildConditionTokens([], []);
    expect(tokens.find(t => t.value === 'served')).toBeDefined();
    expect(tokens.find(t => t.value === 'reneged')).toBeDefined();
  });

  test('returns state variable tokens for each declared variable', () => {
    const tokens = buildConditionTokens([], [{ name: 'totalArrived', description: 'total arrivals' }]);
    const sv = tokens.find(t => t.value === 'totalArrived');
    expect(sv).toBeDefined();
    expect(sv.valueType).toBe('number');
  });

  test('skips entity types without a name', () => {
    const types = [{ name: '', role: 'customer' }];
    const tokens = buildConditionTokens(types, []);
    expect(tokens.find(t => t.value?.includes('queue()'))).toBeUndefined();
  });

  test('does not return queue tokens for server types', () => {
    const types = [{ name: 'Server', role: 'server' }];
    const tokens = buildConditionTokens(types, []);
    expect(tokens.find(t => t.value === 'queue(Server).length')).toBeUndefined();
  });

  test('does not return idle/busy tokens for customer types', () => {
    const types = [{ name: 'Customer', role: 'customer' }];
    const tokens = buildConditionTokens(types, []);
    expect(tokens.find(t => t.value === 'idle(Customer).count')).toBeUndefined();
  });
});
