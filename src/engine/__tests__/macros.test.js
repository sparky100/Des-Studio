import { describe, test, expect, beforeEach } from 'vitest';
import { MACROS, applyScalar } from '../macros.js';
import { applyEffect } from '../phases.js';
import { makeHelpers } from '../entities.js';
import { assertClaimsCleared } from './helpers/fixtures.js';

// Build a minimal applyEffect context
function makeCtx(entities, state, model, clock = 0, felRef = null) {
  let seq = entities.reduce((m, e) => Math.max(m, e.id || 0), 0);
  return {
    entities,
    state,
    model,
    clock,
    felRef,
    helpers: makeHelpers(entities, model),
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

  test('records explicit waiting ownership metadata on arrival', () => {
    const entities = [];
    const ctx = makeCtx(entities, {}, baseModel, 7);
    applyEffect('ARRIVE(Customer)', ctx);
    expect(entities[0].waitingSince).toBe(7);
    expect(entities[0].waitingFor).toEqual({
      kind: 'queue',
      queueName: 'CustomerQueue',
      enteredAt: 7,
    });
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

// ── ARRIVE with explicit queue name ───────────────────────────────────────────
describe('ARRIVE(Patient, TriageQueue)', () => {
  test('creates entity with queue=TriageQueue', () => {
    const entities = [];
    const model = {
      entityTypes: [{ name: 'Patient', role: 'customer', attrDefs: [] }],
      bEvents: [], cEvents: [],
    };
    const ctx = makeCtx(entities, {}, model, 0);
    applyEffect('ARRIVE(Patient, TriageQueue)', ctx);
    expect(entities.length).toBe(1);
    expect(entities[0].queue).toBe('TriageQueue');
    expect(entities[0].type).toBe('Patient');
    expect(entities[0].status).toBe('waiting');
  });

  test('defaults queue to TypeQueue when no queue arg given', () => {
    const entities = [];
    const ctx = makeCtx(entities, {}, baseModel, 0);
    applyEffect('ARRIVE(Customer)', ctx);
    expect(entities[0].queue).toBe('CustomerQueue');
  });

  test('pattern matches with spaces around comma', () => {
    const macro = MACROS.find(m => m.name === 'ARRIVE');
    expect(macro.pattern.test('ARRIVE(Patient , TriageQueue)')).toBe(true);
    expect(macro.pattern.test('ARRIVE(Patient,TriageQueue)')).toBe(true);
  });

  test('pattern still matches single-arg form', () => {
    const macro = MACROS.find(m => m.name === 'ARRIVE');
    expect(macro.pattern.test('ARRIVE(Customer)')).toBe(true);
  });

  test('pattern does not match unknown format', () => {
    const macro = MACROS.find(m => m.name === 'ARRIVE');
    expect(macro.pattern.test('ARRIVE()')).toBe(false);
    expect(macro.pattern.test('ARRIVE(A, B, C)')).toBe(false);
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

  test('records mirrored resourceClaim metadata on customer and server', () => {
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(customer.resourceClaim).toEqual({
      customerId: customer.id,
      customerType: 'Customer',
      serverId: server.id,
      serverType: 'Server',
      queueName: null,
      claimedAt: 5,
    });
    expect(server.resourceClaim).toEqual(customer.resourceClaim);
  });

  test('clears explicit waiting ownership metadata on assign', () => {
    customer.queue = 'CustomerQueue';
    customer.waitingSince = 0;
    customer.waitingFor = { kind: 'queue', queueName: 'CustomerQueue', enteredAt: 0 };
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(customer.waitingSince).toBeUndefined();
    expect(customer.waitingFor).toBeUndefined();
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

  test('prefers queue-name match over entity-type match to prevent cross-queue theft', () => {
    // Two customers with same type "Patient", but in different queues
    const inPatientQ  = { id: 1, type: 'Patient', role: 'customer', status: 'waiting', queue: 'Patient',   arrivalTime: 5, stages: [] };
    const inTreatmentQ = { id: 2, type: 'Patient', role: 'customer', status: 'waiting', queue: 'Treatment', arrivalTime: 0, stages: [] };
    const nurse = { id: 3, type: 'Nurse', role: 'server', status: 'idle', arrivalTime: 0, stages: [] };
    const entities = [inPatientQ, inTreatmentQ, nurse];
    const model = {
      entityTypes: [
        { name: 'Patient', role: 'customer', attrDefs: [] },
        { name: 'Nurse',   role: 'server',   attrDefs: [] },
      ],
      queues: [
        { name: 'Patient',   discipline: 'FIFO' },
        { name: 'Treatment', discipline: 'FIFO' },
      ],
      bEvents: [], cEvents: [],
    };
    const ctx = makeCtx(entities, {}, model, 5);
    applyEffect('ASSIGN(Patient, Nurse)', ctx);
    // Should pick from the "Patient" queue (by queue name), not the Treatment queue
    expect(inPatientQ.status).toBe('serving');
    expect(inTreatmentQ.status).toBe('waiting');
  });

  test('falls back to entity-type match when no entity in the named queue', () => {
    const customer2 = { id: 1, type: 'Customer', role: 'customer', status: 'waiting', queue: 'OtherQueue', arrivalTime: 0, stages: [] };
    const server2   = { id: 2, type: 'Server',   role: 'server',   status: 'idle',    arrivalTime: 0, stages: [] };
    const entities = [customer2, server2];
    // No queue named "Customer" in this model, so queue-name match yields nothing
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(customer2.status).toBe('serving');
  });

  test('applies queue discipline when selecting by queue name', () => {
    const highPrio = { id: 1, type: 'Patient', role: 'customer', status: 'waiting', queue: 'Treatment', arrivalTime: 10, attrs: { priority: 1 }, stages: [] };
    const lowPrio  = { id: 2, type: 'Patient', role: 'customer', status: 'waiting', queue: 'Treatment', arrivalTime: 5,  attrs: { priority: 5 }, stages: [] };
    const doctor   = { id: 3, type: 'Doctor',  role: 'server',   status: 'idle',    arrivalTime: 0, stages: [] };
    const entities = [highPrio, lowPrio, doctor];
    const model = {
      entityTypes: [
        { name: 'Patient', role: 'customer', attrDefs: [{ name: 'priority' }] },
        { name: 'Doctor',  role: 'server',   attrDefs: [] },
      ],
      queues: [{ name: 'Treatment', discipline: 'PRIORITY' }],
      bEvents: [], cEvents: [],
    };
    const ctx = makeCtx(entities, {}, model, 5);
    // ASSIGN with queue name "Treatment" matches by queue name
    applyEffect('ASSIGN(Treatment, Doctor)', ctx);
    expect(highPrio.status).toBe('serving');
    expect(lowPrio.status).toBe('waiting');
  });

  test('selects the deterministically first idle server when multiple are idle', () => {
    const serverA = { id: 3, type: 'Server', role: 'server', status: 'idle', arrivalTime: 0, stages: [] };
    const serverB = { id: 4, type: 'Server', role: 'server', status: 'idle', arrivalTime: 5, stages: [] };
    entities = [customer, serverB, serverA];
    const ctx = makeCtx(entities, {}, baseModel, 5);
    applyEffect('ASSIGN(Customer, Server)', ctx);
    expect(serverA.status).toBe('busy');
    expect(serverA.currentCustId).toBe(customer.id);
    expect(serverB.status).toBe('idle');
  });
});

// ── DELAY ─────────────────────────────────────────────────────────────────────
describe('DELAY(QueueName)', () => {
  function makeDelayModel() {
    return {
      entityTypes: [{ name: 'Customer', role: 'customer', attrDefs: [] }],
      bEvents: [], cEvents: [],
      queues: [{ name: 'RecoveryQueue', customerType: 'Customer', discipline: 'FIFO' }],
    };
  }

  test('marks waiting entity as serving without claiming a server', () => {
    const customer = {
      id: 1, type: 'Customer', role: 'customer', status: 'waiting',
      queue: 'RecoveryQueue', arrivalTime: 0, stages: [],
    };
    const entities = [customer];
    const ctx = makeCtx(entities, {}, makeDelayModel(), 5);
    applyEffect('DELAY(RecoveryQueue)', ctx);

    expect(customer.status).toBe('serving');
    expect(customer.serviceStart).toBe(5);
    expect(customer._isDelay).toBe(true);
    expect(customer.lastQueue).toBe('RecoveryQueue');
    expect(customer.queue).toBeUndefined();
    expect(ctx._lastSrvId).toBeNull();
  });

  test('no-op with a message when no entity is waiting', () => {
    const entities = [];
    const ctx = makeCtx(entities, {}, makeDelayModel(), 0);
    expect(() => applyEffect('DELAY(RecoveryQueue)', ctx)).not.toThrow();
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

  test('clears mirrored claim metadata on complete', () => {
    runComplete();
    assertClaimsCleared(customer, server);
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

  test('skips complete when customer/server claim metadata contradict each other', () => {
    customer.serverId = 999;
    const ctx = makeCtx(entities, state, baseModel, 3,
      { _contextCustId: customer.id, _contextSrvId: server.id });
    applyEffect('COMPLETE()', ctx);
    expect(customer.status).toBe('serving');
    expect(server.status).toBe('busy');
    expect(state.__served).toBe(0);
  });

  test('skips complete when serving customer has no matching busy server', () => {
    entities = [customer];
    const ctx = makeCtx(entities, state, baseModel, 3,
      { _contextCustId: customer.id, _contextSrvId: server.id });
    applyEffect('COMPLETE()', ctx);
    expect(customer.status).toBe('serving');
    expect(state.__served).toBe(0);
  });

  test('completes a DELAY entity with no server claim (no false "no matching busy server" skip)', () => {
    customer._isDelay = true;
    entities = [customer]; // no server entity at all — DELAY never claims one
    const ctx = makeCtx(entities, state, baseModel, 3,
      { _contextCustId: customer.id, _contextSrvId: null });
    applyEffect('COMPLETE()', ctx);
    expect(customer.status).toBe('done');
    expect(customer.sojournTime).toBeCloseTo(3, 4);
    expect(state.__served).toBe(1);
    expect(customer.stages[0].serverType).toBe('delay');
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

  test('clears mirrored claim metadata on release', () => {
    runRelease();
    assertClaimsCleared(customer, server);
  });

  test('sets customer status back to "waiting"', () => {
    runRelease();
    expect(customer.status).toBe('waiting');
  });

  test('re-establishes explicit waiting ownership metadata on release', () => {
    runRelease();
    expect(customer.waitingSince).toBe(10);
    expect(customer.waitingFor).toEqual({
      kind: 'queue',
      queueName: null,
      enteredAt: 10,
    });
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

  test('skips release when customer/server claim metadata contradict each other', () => {
    customer.serverId = 999;
    runRelease();
    expect(customer.status).toBe('serving');
    expect(server.status).toBe('busy');
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

  test('clears explicit waiting ownership metadata on renege', () => {
    customer.queue = 'CustomerQueue';
    customer.waitingSince = 0;
    customer.waitingFor = { kind: 'queue', queueName: 'CustomerQueue', enteredAt: 0 };
    const ctx = makeCtx(entities, state, baseModel, 5,
      { _contextCustId: customer.id });
    applyEffect('RENEGE(ctx)', ctx);
    expect(customer.waitingSince).toBeUndefined();
    expect(customer.waitingFor).toBeUndefined();
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

  test('uses queue-name arbitration when the argument matches a queue', () => {
    const inTreatment = { id: 1, type: 'Patient', role: 'customer', status: 'waiting', queue: 'Treatment', arrivalTime: 5, attrs: { priority: 4 }, stages: [] };
    const inOther = { id: 2, type: 'Patient', role: 'customer', status: 'waiting', queue: 'Other', arrivalTime: 1, attrs: { priority: 1 }, stages: [] };
    const entities = [inOther, inTreatment];
    const state = { __reneged: 0 };
    const model = {
      entityTypes: [{ name: 'Patient', role: 'customer', attrDefs: [{ name: 'priority' }] }],
      queues: [{ name: 'Treatment', discipline: 'PRIORITY' }],
      bEvents: [],
      cEvents: [],
    };
    const ctx = makeCtx(entities, state, model, 10);
    applyEffect('RENEGE_OLDEST(Treatment)', ctx);
    expect(inTreatment.status).toBe('reneged');
    expect(inOther.status).toBe('waiting');
  });
});

describe('BATCH(QueueName, batchSize)', () => {
  test('uses centralized priority arbitration for queue selection', () => {
    const lowPrio = { id: 1, type: 'Patient', role: 'customer', status: 'waiting', queue: 'Treatment', arrivalTime: 1, attrs: { priority: 5 }, stages: [] };
    const highPrio = { id: 2, type: 'Patient', role: 'customer', status: 'waiting', queue: 'Treatment', arrivalTime: 3, attrs: { priority: 1 }, stages: [] };
    const midPrio = { id: 3, type: 'Patient', role: 'customer', status: 'waiting', queue: 'Treatment', arrivalTime: 2, attrs: { priority: 2 }, stages: [] };
    const entities = [lowPrio, highPrio, midPrio];
    const model = {
      entityTypes: [{ name: 'Patient', role: 'customer', attrDefs: [{ name: 'priority' }] }],
      queues: [{ name: 'Treatment', discipline: 'PRIORITY' }],
      bEvents: [],
      cEvents: [],
    };
    const ctx = makeCtx(entities, {}, model, 10);

    applyEffect('BATCH(Treatment, 2)', ctx);

    const parent = entities.find(entity => entity.role === 'batch');
    expect(parent).toBeDefined();
    expect(parent.batch.children.map(child => child.id)).toEqual([2, 3]);
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
