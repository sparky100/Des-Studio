import { describe, test, expect, beforeEach } from 'vitest';
import { MACROS, applyScalar } from '../macros.js';
import { applyEffect } from '../phases.js';
import { makeHelpers } from '../entities.js';
import { mulberry32 } from '../distributions.js';
import { assertClaimsCleared } from './helpers/fixtures.js';

// Build a minimal applyEffect context. `extra` may override/add ctx fields such
// as `rng` (required for any macro path that can reach a balk-probability draw
// or queue-level renegeDist scheduling) or `_arbitration`.
function makeCtx(entities, state, model, clock = 0, felRef = null, extra = {}) {
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
    ...extra,
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

// ── PREEMPT ───────────────────────────────────────────────────────────────────
describe('PREEMPT(ServerType)', () => {
  function setup() {
    const customer = {
      id: 1, type: 'Customer', role: 'customer', status: 'serving',
      arrivalTime: 0, serviceStart: 2, lastQueue: 'CustomerQueue', stages: [],
    };
    const server = {
      id: 2, type: 'Server', role: 'server', status: 'busy',
      currentCustId: 1, _busyStart: 2, _scheduledDuration: 10, stages: [],
    };
    return { customer, server, entities: [customer, server] };
  }

  test('no-op with message when no busy server of that type', () => {
    const ctx = makeCtx([], {}, baseModel, 5);
    const { msgs } = applyEffect('PREEMPT(Server)', ctx);
    expect(msgs[0]).toMatch(/no busy server found/);
  });

  test('no-op with message when the matched server has no customer', () => {
    const server = { id: 2, type: 'Server', role: 'server', status: 'busy', stages: [] };
    const ctx = makeCtx([server], {}, baseModel, 5);
    const { msgs } = applyEffect('PREEMPT(Server)', ctx);
    expect(msgs[0]).toMatch(/has no customer/);
  });

  test('interrupts the busy server and re-queues the customer with remaining service', () => {
    const { customer, server, entities } = setup();
    const ctx = makeCtx(entities, {}, baseModel, 6);
    applyEffect('PREEMPT(Server)', ctx);
    expect(server.status).toBe('idle');
    expect(server.currentCustId).toBeUndefined();
    expect(customer.status).toBe('waiting');
    expect(customer.queue).toBe('CustomerQueue');
    // scheduledDuration 10, elapsed (6-2)=4 -> remaining = 6
    expect(customer._remainingService).toBeCloseTo(6, 4);
  });

  test('remaining service clamps at 0 when elapsed exceeds scheduled duration', () => {
    const { customer, server, entities } = setup();
    server._scheduledDuration = 3; // less than elapsed (6-2=4)
    const ctx = makeCtx(entities, {}, baseModel, 6);
    applyEffect('PREEMPT(Server)', ctx);
    expect(customer._remainingService).toBe(0);
  });

  test('skips balk on requeue even when the queue has balkProbability=1', () => {
    const { customer, server, entities } = setup();
    const model = {
      entityTypes: baseModel.entityTypes,
      queues: [{ name: 'CustomerQueue', balkProbability: 1 }],
      bEvents: [], cEvents: [],
    };
    const ctx = makeCtx(entities, {}, model, 6, null, { rng: mulberry32(1) });
    applyEffect('PREEMPT(Server)', ctx);
    expect(customer.status).toBe('waiting');
    expect(customer.queue).toBe('CustomerQueue');
  });

  test('records arbitration metadata when ctx._arbitration is provided', () => {
    const { customer, server, entities } = setup();
    const arbitration = {};
    const ctx = makeCtx(entities, {}, baseModel, 6, null, { _arbitration: arbitration });
    applyEffect('PREEMPT(Server)', ctx);
    expect(arbitration).toMatchObject({
      type: 'preemption',
      serverType: 'Server',
      serverId: server.id,
      preemptedEntity: customer.id,
    });
    expect(arbitration.remainingService).toBeCloseTo(6, 4);
  });

  test('repeated preempt/resume computes fresh remaining service each time', () => {
    const { customer, server, entities } = setup();
    applyEffect('PREEMPT(Server)', makeCtx(entities, {}, baseModel, 6));
    expect(customer._remainingService).toBeCloseTo(6, 4);

    // Resume: server re-claims the customer with a fresh scheduled duration
    // equal to the preserved remaining service.
    customer.status = 'serving';
    customer.serviceStart = 6;
    server.status = 'busy';
    server.currentCustId = customer.id;
    server._scheduledDuration = customer._remainingService;

    // Second preemption after 3 of the 6 remaining time units elapse
    applyEffect('PREEMPT(Server)', makeCtx(entities, {}, baseModel, 9));
    expect(customer._remainingService).toBeCloseTo(3, 4);
  });
});

// ── FAIL ──────────────────────────────────────────────────────────────────────
describe('FAIL(ServerType)', () => {
  test('no-op with message when no matching servers exist', () => {
    const ctx = makeCtx([], {}, baseModel, 5);
    const { msgs } = applyEffect('FAIL(Server)', ctx);
    expect(msgs[0]).toMatch(/no matching servers found/);
  });

  test('sets a busy server to failed and re-queues its customer with remaining service', () => {
    const customer = {
      id: 1, type: 'Customer', role: 'customer', status: 'serving',
      arrivalTime: 0, serviceStart: 1, lastQueue: 'CustomerQueue', stages: [],
    };
    const server = {
      id: 2, type: 'Server', role: 'server', status: 'busy',
      currentCustId: 1, _scheduledDuration: 8, stages: [],
    };
    const entities = [customer, server];
    const ctx = makeCtx(entities, {}, baseModel, 4);
    applyEffect('FAIL(Server)', ctx);
    expect(server.status).toBe('failed');
    expect(server._failedAt).toBe(4);
    expect(customer.status).toBe('waiting');
    expect(customer._remainingService).toBeCloseTo(5, 4); // 8 - (4-1)
  });

  test('sets an idle server to failed and flushes its starvation timer', () => {
    const server = { id: 2, type: 'Server', role: 'server', status: 'idle', _starvationStart: 1, stages: [] };
    const ctx = makeCtx([server], {}, baseModel, 6);
    applyEffect('FAIL(Server)', ctx);
    expect(server.status).toBe('failed');
    expect(server._starvationTime).toBeCloseTo(5, 4); // 6-1
    expect(server._starvationStart).toBeUndefined();
  });

  test('fails every matching server in the pool, leaving other types untouched (pool scope)', () => {
    const serverA = { id: 1, type: 'Server', role: 'server', status: 'idle', stages: [] };
    const serverB = { id: 2, type: 'Server', role: 'server', status: 'idle', stages: [] };
    const otherType = { id: 3, type: 'Backup', role: 'server', status: 'idle', stages: [] };
    const entities = [serverA, serverB, otherType];
    const ctx = makeCtx(entities, {}, baseModel, 0);
    const { msgs } = applyEffect('FAIL(Server)', ctx);
    expect(serverA.status).toBe('failed');
    expect(serverB.status).toBe('failed');
    expect(otherType.status).toBe('idle');
    expect(msgs.join(' ')).toMatch(/2 Server server\(s\) set to failed/);
  });
});

// ── REPAIR ────────────────────────────────────────────────────────────────────
describe('REPAIR(ServerType)', () => {
  test('no-op with message when no failed servers exist', () => {
    const server = { id: 1, type: 'Server', role: 'server', status: 'idle', stages: [] };
    const ctx = makeCtx([server], {}, baseModel, 5);
    const { msgs } = applyEffect('REPAIR(Server)', ctx);
    expect(server.status).toBe('idle');
    expect(msgs[0]).toMatch(/no failed servers found/);
  });

  test('repair of a busy (non-failed) server is a no-op', () => {
    const server = { id: 1, type: 'Server', role: 'server', status: 'busy', stages: [] };
    const ctx = makeCtx([server], {}, baseModel, 5);
    applyEffect('REPAIR(Server)', ctx);
    expect(server.status).toBe('busy');
  });

  test('restores a failed server to idle and records downtime precisely', () => {
    const server = { id: 1, type: 'Server', role: 'server', status: 'failed', _failedAt: 2, stages: [] };
    const ctx = makeCtx([server], {}, baseModel, 9);
    applyEffect('REPAIR(Server)', ctx);
    expect(server.status).toBe('idle');
    expect(server._downtime).toBeCloseTo(7, 4);
    expect(server._totalDowntime).toBeCloseTo(7, 4);
    expect(server._failureCount).toBe(1);
    expect(server._starvationStart).toBe(9);
  });

  test('flushes an unclosed pre-failure starvation interval into _starvationTime', () => {
    const server = {
      id: 1, type: 'Server', role: 'server', status: 'failed',
      _failedAt: 5, _starvationStart: 2, stages: [],
    };
    const ctx = makeCtx([server], {}, baseModel, 9);
    applyEffect('REPAIR(Server)', ctx);
    expect(server._starvationTime).toBeCloseTo(3, 4); // [2,5) flushed, not [2,9)
  });

  test('accumulates downtime and failure count across repeated fail/repair cycles', () => {
    const server = {
      id: 1, type: 'Server', role: 'server', status: 'failed',
      _failedAt: 0, _totalDowntime: 3, _failureCount: 1, stages: [],
    };
    const ctx = makeCtx([server], {}, baseModel, 4);
    applyEffect('REPAIR(Server)', ctx);
    expect(server._totalDowntime).toBeCloseTo(7, 4);
    expect(server._failureCount).toBe(2);
  });
});

// ── SPLIT ─────────────────────────────────────────────────────────────────────
describe('SPLIT(EntityType, N, TargetQueue)', () => {
  function makeSplitModel(extraQueueFields = {}) {
    return {
      entityTypes: [{ name: 'Customer', role: 'customer', attrDefs: [] }],
      queues: [{ name: 'CloneQueue', customerType: 'Customer', discipline: 'FIFO', ...extraQueueFields }],
      bEvents: [], cEvents: [],
    };
  }

  test('no-op with message when there is no context entity', () => {
    const ctx = makeCtx([], {}, makeSplitModel(), 0);
    const { msgs } = applyEffect('SPLIT(Customer, 3, CloneQueue)', ctx);
    expect(msgs[0]).toMatch(/no context entity found/);
  });

  test('rejects N < 2 without creating any clones', () => {
    const parent = { id: 1, type: 'Customer', role: 'customer', status: 'serving', arrivalTime: 0, attrs: {}, stages: [] };
    const ctx = makeCtx([parent], {}, makeSplitModel(), 0, { _contextCustId: parent.id });
    const { msgs } = applyEffect('SPLIT(Customer, 1, CloneQueue)', ctx);
    expect(msgs[0]).toMatch(/N must be >= 2/);
    expect(parent._splitChildren).toBeUndefined();
  });

  test('creates N-1 clones in the target queue, copying parent attrs, with lineage metadata', () => {
    const parent = { id: 1, type: 'Customer', role: 'customer', status: 'serving', arrivalTime: 0, attrs: { vip: true }, stages: [] };
    const entities = [parent];
    const ctx = makeCtx(entities, {}, makeSplitModel(), 5, { _contextCustId: parent.id });
    applyEffect('SPLIT(Customer, 3, CloneQueue)', ctx);

    const clones = entities.filter(e => e.id !== parent.id);
    expect(clones.length).toBe(2);
    clones.forEach(clone => {
      expect(clone.type).toBe('Customer');
      expect(clone.status).toBe('waiting');
      expect(clone.queue).toBe('CloneQueue');
      expect(clone.attrs).toEqual({ vip: true });
      expect(clone._splitFrom).toBe(parent.id);
    });

    expect(parent._splitParent).toBe(true);
    expect(parent._splitChildren).toEqual(clones.map(c => c.id));
  });

  test('partial balking: clones that fail to join are discarded, parent records only the joined ones', () => {
    const parent = { id: 1, type: 'Customer', role: 'customer', status: 'serving', arrivalTime: 0, attrs: {}, stages: [] };
    const entities = [parent];
    // capacity=1 means only the first clone fits; the rest block with no overflow destination
    const ctx = makeCtx(entities, {}, makeSplitModel({ capacity: 1 }), 5, { _contextCustId: parent.id });
    applyEffect('SPLIT(Customer, 3, CloneQueue)', ctx);

    expect(parent._splitChildren.length).toBe(1);
    expect(entities.map(e => e.id)).toEqual([parent.id, parent._splitChildren[0]]);
  });

  test('all clones balking still leaves the parent marked as a split parent with an empty child list', () => {
    const parent = { id: 1, type: 'Customer', role: 'customer', status: 'serving', arrivalTime: 0, attrs: {}, stages: [] };
    const entities = [parent];
    const ctx = makeCtx(entities, {}, makeSplitModel({ balkProbability: 1 }), 5, { _contextCustId: parent.id }, { rng: mulberry32(1) });
    const { msgs } = applyEffect('SPLIT(Customer, 3, CloneQueue)', ctx);
    expect(parent._splitChildren).toEqual([]);
    expect(msgs.join(' ')).toMatch(/all 2 clone\(s\) balked\/blocked/);
  });
});

// ── MATCH ─────────────────────────────────────────────────────────────────────
describe('MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue)', () => {
  function makeMatchModel(disciplineA = 'FIFO', disciplineB = 'FIFO') {
    return {
      entityTypes: [
        { name: 'Order',   role: 'customer', attrDefs: [{ name: 'priority' }] },
        { name: 'Payment', role: 'customer', attrDefs: [] },
      ],
      queues: [
        { name: 'OrderQueue',   discipline: disciplineA },
        { name: 'PaymentQueue', discipline: disciplineB },
      ],
      bEvents: [], cEvents: [],
    };
  }

  test('no match (message only, no state change) when either queue is empty', () => {
    const order = { id: 1, type: 'Order', role: 'customer', status: 'waiting', queue: 'OrderQueue', arrivalTime: 0, attrs: {}, stages: [] };
    const ctx = makeCtx([order], {}, makeMatchModel(), 5);
    const { msgs } = applyEffect('MATCH(Order, OrderQueue, Payment, PaymentQueue, MatchedQueue)', ctx);
    expect(msgs[0]).toMatch(/no match — A=1 B=0/);
    expect(order.status).toBe('waiting');
  });

  test('pairs the first entity from each queue, merging attrs with B overwriting A on collision', () => {
    const order   = { id: 1, type: 'Order',   role: 'customer', status: 'waiting', queue: 'OrderQueue',   arrivalTime: 0, attrs: { orderId: 'O1', amount: 10 }, stages: [] };
    const payment = { id: 2, type: 'Payment', role: 'customer', status: 'waiting', queue: 'PaymentQueue', arrivalTime: 1, attrs: { amount: 99, paid: true }, stages: [] };
    const entities = [order, payment];
    const ctx = makeCtx(entities, {}, makeMatchModel(), 5);
    applyEffect('MATCH(Order, OrderQueue, Payment, PaymentQueue, MatchedQueue)', ctx);

    expect(order.status).toBe('done');
    expect(order._matchedInto).toBeDefined();
    expect(payment.status).toBe('done');
    expect(payment._matchedInto).toBe(order._matchedInto);

    const parent = entities.find(e => e.id === order._matchedInto);
    expect(parent).toBeDefined();
    expect(parent.role).toBe('batch');
    expect(parent.type).toBe('Order+Payment');
    expect(parent.status).toBe('waiting');
    expect(parent.queue).toBe('MatchedQueue');
    // B (payment) overwrites A (order) on the colliding "amount" key
    expect(parent.attrs).toEqual({ orderId: 'O1', amount: 99, paid: true });
    expect(parent._matchedFrom).toEqual([order.id, payment.id]);
  });

  test('respects PRIORITY discipline when selecting the candidate from each queue', () => {
    const lowPrioOrder  = { id: 1, type: 'Order', role: 'customer', status: 'waiting', queue: 'OrderQueue', arrivalTime: 0, attrs: { priority: 5 }, stages: [] };
    const highPrioOrder = { id: 2, type: 'Order', role: 'customer', status: 'waiting', queue: 'OrderQueue', arrivalTime: 1, attrs: { priority: 1 }, stages: [] };
    const payment = { id: 3, type: 'Payment', role: 'customer', status: 'waiting', queue: 'PaymentQueue', arrivalTime: 0, attrs: {}, stages: [] };
    const entities = [lowPrioOrder, highPrioOrder, payment];
    const ctx = makeCtx(entities, {}, makeMatchModel('PRIORITY', 'FIFO'), 5);
    applyEffect('MATCH(Order, OrderQueue, Payment, PaymentQueue, MatchedQueue)', ctx);

    expect(highPrioOrder.status).toBe('done');
    expect(lowPrioOrder.status).toBe('waiting');
  });
});

// ── COSEIZE ───────────────────────────────────────────────────────────────────
describe('COSEIZE(QueueName, ServerType1, ServerType2[, ...])', () => {
  const coseizeModel = {
    entityTypes: [
      { name: 'Patient',  role: 'customer', attrDefs: [] },
      { name: 'Surgeon',  role: 'server',   attrDefs: [] },
      { name: 'Nurse',    role: 'server',   attrDefs: [] },
    ],
    queues: [{ name: 'ORQueue', discipline: 'FIFO' }],
    bEvents: [], cEvents: [],
  };

  function makeEntities() {
    const patient = { id: 1, type: 'Patient', role: 'customer', status: 'waiting', queue: 'ORQueue', arrivalTime: 0, attrs: {}, stages: [] };
    const surgeon = { id: 2, type: 'Surgeon', role: 'server',   status: 'idle',    arrivalTime: 0, stages: [] };
    const nurse   = { id: 3, type: 'Nurse',   role: 'server',   status: 'idle',    arrivalTime: 0, stages: [] };
    return { patient, surgeon, nurse, entities: [patient, surgeon, nurse] };
  }

  test('seizes one server of each distinct type and sets customer to serving', () => {
    const { patient, surgeon, nurse, entities } = makeEntities();
    const ctx = makeCtx(entities, {}, coseizeModel, 5);
    applyEffect('COSEIZE(ORQueue, Surgeon, Nurse)', ctx);

    expect(patient.status).toBe('serving');
    expect(surgeon.status).toBe('busy');
    expect(nurse.status).toBe('busy');
    expect(surgeon.currentCustId).toBe(patient.id);
    expect(nurse.currentCustId).toBe(patient.id);
  });

  test('rejects a duplicate server type without claiming any server', () => {
    const { patient, surgeon, nurse, entities } = makeEntities();
    const ctx = makeCtx(entities, {}, coseizeModel, 5);
    const { msgs } = applyEffect('COSEIZE(ORQueue, Surgeon, Surgeon)', ctx);

    expect(msgs.join(' ')).toMatch(/duplicate server type/);
    expect(patient.status).toBe('waiting');
    expect(surgeon.status).toBe('idle');
    expect(nurse.status).toBe('idle');
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

// ── ASSIGN with Entity.attrName skill source ──────────────────────────────────
describe('ASSIGN(Queue, Server, Entity.attrName)', () => {
  test('pattern matches basic form without skill', () => {
    const p = MACROS.find(m => m.name === 'ASSIGN')?.pattern;
    const m = 'ASSIGN(Patient, Nurse)'.match(p);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('Patient');
    expect(m[2]).toBe('Nurse');
    expect(m[3]).toBeUndefined();
    expect(m[4]).toBeUndefined();
  });

  test('pattern matches quoted skill form', () => {
    const p = MACROS.find(m => m.name === 'ASSIGN')?.pattern;
    const m = 'ASSIGN(SurgeryQueue, Doctor, "Surgery")'.match(p);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('SurgeryQueue');
    expect(m[2]).toBe('Doctor');
    expect(m[3]).toBe('Surgery');
    expect(m[4]).toBeUndefined();
  });

  test('pattern matches Entity.attrName form and captures attribute name', () => {
    const p = MACROS.find(m => m.name === 'ASSIGN')?.pattern;
    const m = 'ASSIGN(Q, Doctor, Entity.requiredSkill)'.match(p);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('Q');
    expect(m[2]).toBe('Doctor');
    expect(m[3]).toBeUndefined();
    expect(m[4]).toBe('requiredSkill');
  });

  test('pattern matches Entity.attrName with attached queue name', () => {
    const p = MACROS.find(m => m.name === 'ASSIGN')?.pattern;
    const m = 'ASSIGN(Patient Queue, Nurse, Entity.repairType)'.match(p);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('Patient Queue');
    expect(m[2]).toBe('Nurse');
    expect(m[3]).toBeUndefined();
    expect(m[4]).toBe('repairType');
  });
});
