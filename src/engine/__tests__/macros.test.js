import { describe, test, expect, beforeEach } from 'vitest';
import { MACROS, applyScalar } from '../macros.js';
import { applyEffect } from '../phases.js';
import { makeHelpers } from '../entities.js';

// Build a minimal applyEffect context
function makeCtx(entities, state, model, clock = 0, felRef = null) {
  let seq = entities.reduce((m, e) => Math.max(m, e.id || 0), 0);
  return {
    entities,
    state,
    model,
    clock,
    felRef,
    helpers: makeHelpers(entities),
    nextId: () => ++seq,
    _lastCustId: null,
    _lastSrvId: null,
  };
}

const baseModel = {
  entityTypes: [
    { name: 'Customer', role: 'customer', attrDefs: [] },
    { name: 'Server',   role: 'server',   attrDefs: [] },
  ],
  bEvents: [],
  cEvents: [],
};

// ── ARRIVE ────────────────────────────────────────────────────────────────────
describe('ARRIVE(Customer)', () => {
  test('creates new entity with status="waiting"', () => {
    const entities = [];
    const ctx = makeCtx(entities, {}, baseModel, 0);
    applyEffect('ARRIVE(Customer)', ctx);
    expect(entities.length).toBe(1);
    expect(entities[0].status).toBe('waiting');
  });

  test('sets arrivalTime = clock', () => {
    const entities = [];
    const ctx = makeCtx(entities, {}, baseModel, 7);
    applyEffect('ARRIVE(Customer)', ctx);
    expect(entities[0].arrivalTime).toBe(7);
  });

  test('new entity appears in entities array', () => {
    const entities = [];
    const ctx = makeCtx(entities, {}, baseModel, 0);
    applyEffect('ARRIVE(Customer)', ctx);
    expect(entities.length).toBe(1);
    expect(entities[0].type).toBe('Customer');
  });

  test('ctx._lastCustId is set to the new entity id after applyEffect', () => {
    const entities = [];
    const ctx = makeCtx(entities, {}, baseModel, 0);
    applyEffect('ARRIVE(Customer)', ctx);
    expect(ctx._lastCustId).toBe(entities[0].id);
  });

  test('waitingOf returns the new entity', () => {
    const entities = [];
    const ctx = makeCtx(entities, {}, baseModel, 0);
    applyEffect('ARRIVE(Customer)', ctx);
    const h = makeHelpers(entities);
    expect(h.waitingOf('Customer').length).toBe(1);
  });

  test('assigns stages array to new entity', () => {
    const entities = [];
    const ctx = makeCtx(entities, {}, baseModel, 0);
    applyEffect('ARRIVE(Customer)', ctx);
    expect(Array.isArray(entities[0].stages)).toBe(true);
  });
});

// ── ASSIGN ────────────────────────────────────────────────────────────────────
describe('ASSIGN(Customer, Server)', () => {
  let entities, customer, server;

  beforeEach(() => {
    customer = { id: 1, type: 'Customer', role: 'customer', status: 'waiting', arrivalTime: 0, stages: [] };
    server   = { id: 2, type: 'Server',   role: 'server',   status: 'idle',    arrivalTime: 0, stages: [] };
    entities = [customer, server];
  });

  test('sets customer status to "serving"', () => {
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(customer.status).toBe('serving');
  });

  test('sets server status to "busy"', () => {
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(server.status).toBe('busy');
  });

  test('sets customer.serviceStart = clock', () => {
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(customer.serviceStart).toBe(5);
  });

  test('sets server.currentCustId = customer.id', () => {
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(server.currentCustId).toBe(customer.id);
  });

  test('ctx._lastCustId and _lastSrvId set after applyEffect', () => {
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(ctx._lastCustId).toBe(customer.id);
    expect(ctx._lastSrvId).toBe(server.id);
  });

  test('does nothing when no waiting customers', () => {
    customer.status = 'done';
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(server.status).toBe('idle');
  });

  test('does nothing when no idle servers', () => {
    server.status = 'busy';
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(customer.status).toBe('waiting');
  });
});

// ── COMPLETE ─────────────────────────────────────────────────────────────────
describe('COMPLETE()', () => {
  let entities, customer, server, state;

  beforeEach(() => {
    customer = {
      id: 1, type: 'Customer', role: 'customer', status: 'serving',
      arrivalTime: 0, serviceStart: 0, stages: [],
    };
    server = { id: 2, type: 'Server', role: 'server', status: 'busy', currentCustId: 1, stages: [] };
    entities = [customer, server];
    state = { __served: 0 };
  });

  function runComplete(clock = 3) {
    const ctx = makeCtx(entities, state, baseModel, clock,
      { _contextCustId: customer.id, _contextSrvId: server.id });
    applyEffect('COMPLETE()', ctx);
  }

  test('sets customer status to "done"', () => {
    runComplete();
    expect(customer.status).toBe('done');
  });

  test('sets customer.completionTime = clock', () => {
    runComplete(3);
    expect(customer.completionTime).toBe(3);
  });

  test('sets customer.sojournTime = completionTime - arrivalTime', () => {
    customer.arrivalTime = 1;
    runComplete(4);
    expect(customer.sojournTime).toBeCloseTo(3, 4);
  });

  test('sets server status to "idle"', () => {
    runComplete();
    expect(server.status).toBe('idle');
  });

  test('increments state.__served', () => {
    runComplete();
    expect(state.__served).toBe(1);
  });

  test('pushes stage entry to customer.stages', () => {
    runComplete(3);
    expect(customer.stages.length).toBe(1);
    expect(customer.stages[0]).toHaveProperty('stageService');
    expect(customer.stages[0]).toHaveProperty('stageWait');
    expect(customer.stages[0]).toHaveProperty('serverType');
  });

  test('uses felRef._contextCustId and _contextSrvId when provided', () => {
    const otherCustomer = { id: 99, type: 'Customer', role: 'customer', status: 'serving',
      arrivalTime: 0, serviceStart: 0, stages: [] };
    entities.push(otherCustomer);
    // felRef points to customer (id=1), not otherCustomer (id=99)
    const ctx = makeCtx(entities, state, baseModel, 3,
      { _contextCustId: 1, _contextSrvId: 2 });
    applyEffect('COMPLETE()', ctx);
    expect(customer.status).toBe('done');
    expect(otherCustomer.status).toBe('serving');
  });
});

// ── RELEASE ───────────────────────────────────────────────────────────────────
describe('RELEASE(ServerType)', () => {
  let entities, customer, server, state;

  beforeEach(() => {
    customer = {
      id: 1, type: 'Customer', role: 'customer', status: 'serving',
      arrivalTime: 2, serviceStart: 5, stages: [],
    };
    server = { id: 2, type: 'Server', role: 'server', status: 'busy', currentCustId: 1, stages: [] };
    entities = [customer, server];
    state = {};
  });

  function runRelease(clock = 10) {
    const ctx = makeCtx(entities, state, baseModel, clock,
      { _contextCustId: customer.id, _contextSrvId: server.id });
    applyEffect('RELEASE(Server)', ctx);
  }

  test('sets server status to "idle"', () => {
    runRelease();
    expect(server.status).toBe('idle');
  });

  test('sets customer status back to "waiting"', () => {
    runRelease();
    expect(customer.status).toBe('waiting');
  });

  test('preserves customer.arrivalTime (does not change it)', () => {
    runRelease();
    expect(customer.arrivalTime).toBe(2);
  });

  test('pushes stage entry to customer.stages', () => {
    runRelease(10);
    expect(customer.stages.length).toBe(1);
    expect(customer.stages[0].stageService).toBeCloseTo(5, 4); // clock(10) - serviceStart(5) = 5
  });

  test('sets customer.lastStageStart = clock', () => {
    runRelease(10);
    expect(customer.lastStageStart).toBe(10);
  });

  test('deletes customer.serviceStart', () => {
    runRelease();
    expect(customer.serviceStart).toBeUndefined();
  });
});

// ── RENEGE ────────────────────────────────────────────────────────────────────
describe('RENEGE(ctx)', () => {
  let entities, customer, state;

  beforeEach(() => {
    customer = { id: 1, type: 'Customer', role: 'customer', status: 'waiting', arrivalTime: 0, stages: [] };
    entities = [customer];
    state = { __reneged: 0 };
  });

  test('sets customer status to "reneged"', () => {
    const ctx = makeCtx(entities, state, baseModel, 5,
      { _contextCustId: customer.id });
    applyEffect('RENEGE(ctx)', ctx);
    expect(customer.status).toBe('reneged');
  });

  test('sets customer.renegeTime = clock', () => {
    const ctx = makeCtx(entities, state, baseModel, 5,
      { _contextCustId: customer.id });
    applyEffect('RENEGE(ctx)', ctx);
    expect(customer.renegeTime).toBe(5);
  });

  test('increments state.__reneged', () => {
    const ctx = makeCtx(entities, state, baseModel, 5,
      { _contextCustId: customer.id });
    applyEffect('RENEGE(ctx)', ctx);
    expect(state.__reneged).toBe(1);
  });

  test('skips (no change) if customer status is not "waiting"', () => {
    customer.status = 'serving';
    const ctx = makeCtx(entities, state, baseModel, 5,
      { _contextCustId: customer.id });
    applyEffect('RENEGE(ctx)', ctx);
    expect(customer.status).toBe('serving');
    expect(state.__reneged).toBe(0);
  });
});

// ── RENEGE_OLDEST ─────────────────────────────────────────────────────────────
describe('RENEGE_OLDEST(Customer)', () => {
  test('reneges the customer with the earliest arrivalTime', () => {
    const older  = { id: 1, type: 'Customer', role: 'customer', status: 'waiting', arrivalTime: 1, stages: [] };
    const newer  = { id: 2, type: 'Customer', role: 'customer', status: 'waiting', arrivalTime: 5, stages: [] };
    const entities = [newer, older]; // intentionally out of order
    const state = { __reneged: 0 };
    const ctx = makeCtx(entities, state, baseModel, 10);
    applyEffect('RENEGE_OLDEST(Customer)', ctx);
    expect(older.status).toBe('reneged');
    expect(newer.status).toBe('waiting');
  });

  test('ignores non-waiting customers', () => {
    const serving = { id: 1, type: 'Customer', role: 'customer', status: 'serving', arrivalTime: 0, stages: [] };
    const waiting = { id: 2, type: 'Customer', role: 'customer', status: 'waiting', arrivalTime: 3, stages: [] };
    const entities = [serving, waiting];
    const state = { __reneged: 0 };
    const ctx = makeCtx(entities, state, baseModel, 10);
    applyEffect('RENEGE_OLDEST(Customer)', ctx);
    expect(waiting.status).toBe('reneged');
    expect(serving.status).toBe('serving');
  });
});

// ── applyScalar ───────────────────────────────────────────────────────────────
describe('applyScalar', () => {
  test('VAR++ increments by 1', () => {
    const state = { count: 3 };
    applyScalar('count++', state, 0);
    expect(state.count).toBe(4);
  });

  test('VAR-- decrements by 1', () => {
    const state = { count: 3 };
    applyScalar('count--', state, 0);
    expect(state.count).toBe(2);
  });

  test('VAR += 5 adds 5', () => {
    const state = { count: 3 };
    applyScalar('count += 5', state, 0);
    expect(state.count).toBe(8);
  });

  test('VAR -= 3 subtracts 3', () => {
    const state = { count: 10 };
    applyScalar('count -= 3', state, 0);
    expect(state.count).toBe(7);
  });

  test('VAR = 10 sets to 10', () => {
    const state = { count: 0 };
    applyScalar('count = 10', state, 0);
    expect(state.count).toBe(10);
  });

  test('VAR++ initialises from 0 when variable missing', () => {
    const state = {};
    applyScalar('newVar++', state, 0);
    expect(state.newVar).toBe(1);
  });

  test('unknown part returns false', () => {
    const state = {};
    const result = applyScalar('not a valid op', state, 0);
    expect(result).toBe(false);
  });
});
