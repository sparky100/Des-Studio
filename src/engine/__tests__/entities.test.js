import { describe, test, expect, beforeEach } from 'vitest';
import { createServerEntities, makeHelpers, resetSeq, claimServerForEntity, releaseServerClaim, markEntityWaiting, clearWaitingState, sortResourceEntities } from '../entities.js';

beforeEach(() => {
  resetSeq();
});

describe('createServerEntities', () => {
  test('creates correct number of server entities from count field', () => {
    const types = [{ name: 'Server', role: 'server', count: '3', attrDefs: [] }];
    const entities = createServerEntities(types, () => ({}));
    expect(entities.length).toBe(3);
  });

  test('each entity has role="server" and status="idle"', () => {
    const types = [{ name: 'Server', role: 'server', count: '2', attrDefs: [] }];
    const entities = createServerEntities(types, () => ({}));
    for (const e of entities) {
      expect(e.role).toBe('server');
      expect(e.status).toBe('idle');
    }
  });

  test('skips non-server entity types', () => {
    const types = [
      { name: 'Customer', role: 'customer', count: '5', attrDefs: [] },
      { name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
    ];
    const entities = createServerEntities(types, () => ({}));
    expect(entities.length).toBe(1);
    expect(entities[0].type).toBe('Server');
  });

  test('defaults count to 1 when count is missing or invalid', () => {
    const types = [{ name: 'Server', role: 'server', count: '', attrDefs: [] }];
    const entities = createServerEntities(types, () => ({}));
    expect(entities.length).toBe(1);
  });

  test('calls sampleAttrsFn and stores result as attrs', () => {
    const types = [{ name: 'Server', role: 'server', count: '1', attrDefs: ['serviceTime=3'] }];
    const entities = createServerEntities(types, (defs) => ({ serviceTime: 3, _defs: defs }));
    expect(entities[0].attrs.serviceTime).toBe(3);
  });
});

describe('makeHelpers', () => {
  let entities;

  beforeEach(() => {
    entities = [
      { id: 1, type: 'Customer', role: 'customer', status: 'waiting',  arrivalTime: 5  },
      { id: 2, type: 'Customer', role: 'customer', status: 'waiting',  arrivalTime: 2  },
      { id: 3, type: 'Customer', role: 'customer', status: 'serving',  arrivalTime: 1  },
      { id: 4, type: 'Customer', role: 'customer', status: 'done',     arrivalTime: 0  },
      { id: 5, type: 'Server',   role: 'server',   status: 'idle',     arrivalTime: 0  },
      { id: 6, type: 'Server',   role: 'server',   status: 'busy',     arrivalTime: 0  },
    ];
  });

  test('waitingOf returns only waiting entities of matching type', () => {
    const h = makeHelpers(entities);
    const result = h.waitingOf('Customer');
    expect(result.length).toBe(2);
    expect(result.every(e => e.status === 'waiting')).toBe(true);
    expect(result.every(e => e.type === 'Customer')).toBe(true);
  });

  test('waitingOf sorts by arrivalTime ascending (FIFO)', () => {
    const h = makeHelpers(entities);
    const result = h.waitingOf('Customer');
    expect(result[0].arrivalTime).toBe(2);
    expect(result[1].arrivalTime).toBe(5);
  });

  test('waitingOf is case-insensitive on type name', () => {
    const h = makeHelpers(entities);
    expect(h.waitingOf('customer').length).toBe(2);
    expect(h.waitingOf('CUSTOMER').length).toBe(2);
    expect(h.waitingOf('CuStOmEr').length).toBe(2);
  });

  test('idleOf returns only idle entities of matching type', () => {
    const h = makeHelpers(entities);
    const result = h.idleOf('Server');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(5);
    expect(result[0].status).toBe('idle');
  });

  test('busyOf returns busy and serving entities', () => {
    const h = makeHelpers(entities);
    const busy = h.busyOf('Server');
    expect(busy.length).toBe(1);
    expect(busy[0].id).toBe(6);

    // serving customers also count as busy
    const servingCustomers = h.busyOf('Customer');
    expect(servingCustomers.length).toBe(1);
    expect(servingCustomers[0].id).toBe(3);
    expect(servingCustomers[0].status).toBe('serving');
  });

  test('findById returns correct entity', () => {
    const h = makeHelpers(entities);
    const found = h.findById(3);
    expect(found).toBeDefined();
    expect(found.id).toBe(3);
    expect(found.type).toBe('Customer');
  });

  test('findById returns undefined for missing id', () => {
    const h = makeHelpers(entities);
    expect(h.findById(999)).toBeUndefined();
  });

  test('idleOf returns idle resources in deterministic creation order', () => {
    entities.push(
      { id: 7, type: 'Server', role: 'server', status: 'idle', arrivalTime: 5 },
      { id: 8, type: 'Server', role: 'server', status: 'idle', arrivalTime: 0 },
    );
    const h = makeHelpers(entities);
    const result = h.idleOf('Server');
    expect(result.map(e => e.id)).toEqual([5, 8, 7]);
  });

  test('selectIdleOf returns the deterministically first idle server', () => {
    entities.push(
      { id: 7, type: 'Server', role: 'server', status: 'idle', arrivalTime: 5 },
      { id: 8, type: 'Server', role: 'server', status: 'idle', arrivalTime: 0 },
    );
    const h = makeHelpers(entities);
    expect(h.selectIdleOf('Server').id).toBe(5);
  });
});

describe('resource claim helpers', () => {
  test('claimServerForEntity records mirrored claim metadata on customer and server', () => {
    const customer = { id: 1, type: 'Customer', role: 'customer', status: 'waiting', queue: 'Main Queue', arrivalTime: 2 };
    const server = { id: 2, type: 'Server', role: 'server', status: 'idle', arrivalTime: 0 };

    const claimed = claimServerForEntity(customer, server, 5);

    expect(claimed).toBe(true);
    expect(customer.status).toBe('serving');
    expect(customer.serviceStart).toBe(5);
    expect(customer.serverId).toBe(2);
    expect(customer.queue).toBeUndefined();
    expect(customer.resourceClaim).toEqual({
      customerId: 1,
      customerType: 'Customer',
      serverId: 2,
      serverType: 'Server',
      queueName: 'Main Queue',
      claimedAt: 5,
    });
    expect(server.status).toBe('busy');
    expect(server.currentCustId).toBe(1);
    expect(server.resourceClaim).toEqual(customer.resourceClaim);
  });

  test('claimServerForEntity rejects non-waiting customers and non-idle servers', () => {
    const doneCustomer = { id: 1, type: 'Customer', role: 'customer', status: 'done', queue: 'Main Queue', arrivalTime: 2 };
    const busyServer = { id: 2, type: 'Server', role: 'server', status: 'busy', arrivalTime: 0 };

    expect(claimServerForEntity(doneCustomer, busyServer, 5)).toBe(false);
    expect(doneCustomer.resourceClaim).toBeUndefined();
    expect(busyServer.resourceClaim).toBeUndefined();
  });

  test('releaseServerClaim clears mirrored ownership metadata', () => {
    const claim = {
      customerId: 1,
      customerType: 'Customer',
      serverId: 2,
      serverType: 'Server',
      queueName: 'Main Queue',
      claimedAt: 5,
    };
    const customer = { id: 1, type: 'Customer', role: 'customer', status: 'serving', serverId: 2, resourceClaim: claim };
    const server = { id: 2, type: 'Server', role: 'server', status: 'busy', currentCustId: 1, resourceClaim: claim };

    const released = releaseServerClaim(customer, server);

    expect(released).toBe(true);
    expect(customer.serverId).toBeUndefined();
    expect(customer.resourceClaim).toBeUndefined();
    expect(server.status).toBe('idle');
    expect(server.currentCustId).toBeUndefined();
    expect(server.resourceClaim).toBeUndefined();
  });

  test('markEntityWaiting records explicit waiting ownership metadata', () => {
    const customer = { id: 1, type: 'Customer', role: 'customer', arrivalTime: 2, lastQueue: 'Main Queue' };

    const marked = markEntityWaiting(customer, 7, 'Triage');

    expect(marked).toBe(true);
    expect(customer.status).toBe('waiting');
    expect(customer.queue).toBe('Triage');
    expect(customer.waitingSince).toBe(7);
    expect(customer.waitingFor).toEqual({
      kind: 'queue',
      queueName: 'Triage',
      enteredAt: 7,
    });
  });

  test('clearWaitingState removes explicit waiting ownership metadata', () => {
    const customer = {
      id: 1,
      type: 'Customer',
      role: 'customer',
      status: 'waiting',
      queue: 'Triage',
      waitingSince: 7,
      waitingFor: { kind: 'queue', queueName: 'Triage', enteredAt: 7 },
    };

    const cleared = clearWaitingState(customer);

    expect(cleared).toBe(true);
    expect(customer.waitingSince).toBeUndefined();
    expect(customer.waitingFor).toBeUndefined();
  });

  test('sortResourceEntities orders by creation/arrival order with id tiebreaker', () => {
    const resources = [
      { id: 9, type: 'Server', status: 'idle', arrivalTime: 10 },
      { id: 3, type: 'Server', status: 'idle', arrivalTime: 0 },
      { id: 4, type: 'Server', status: 'idle', arrivalTime: 0 },
    ];
    expect(sortResourceEntities(resources).map(e => e.id)).toEqual([3, 4, 9]);
  });
});
