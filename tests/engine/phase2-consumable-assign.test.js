// tests/engine/phase2-consumable-assign.test.js — Phase 2, item 2a: consumable
// resources gating ASSIGN. ASSIGN(Queue, ServerType[, Skill], Container:amount)
// only starts service when the named container has at least `amount` available;
// the claim and the container deduction commit atomically together.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';
import { validateModel } from '../../src/engine/validation.js';

beforeEach(() => {
  resetSeq();
});

function makeModel({ assignEffect, initialLevel = 5, capacity = 10 } = {}) {
  return {
    entityTypes: [
      { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
      { id: 'S', name: 'Server', role: 'server', count: '2', attrDefs: [] },
    ],
    queues: [
      { id: 'wait', name: 'Wait Queue', customerType: 'Customer', discipline: 'FIFO' },
    ],
    containerTypes: [
      { id: 'Kits', capacity: String(capacity), initialLevel: String(initialLevel) },
    ],
    stateVariables: [],
    bEvents: [
      { id: 'a1', name: 'Arrive1', scheduledTime: '0', effect: 'ARRIVE(Customer, Wait Queue)', schedules: [] },
      { id: 'a2', name: 'Arrive2', scheduledTime: '0', effect: 'ARRIVE(Customer, Wait Queue)', schedules: [] },
      { id: 'a3', name: 'Arrive3', scheduledTime: '0', effect: 'ARRIVE(Customer, Wait Queue)', schedules: [] },
      {
        id: 'done', name: 'Done', scheduledTime: '9999', effect: 'RELEASE(Server)', schedules: [],
      },
    ],
    cEvents: [{
      id: 'c1', name: 'Start', priority: 1,
      condition: 'queue(Wait Queue).length > 0 AND idle(Server).count > 0',
      effect: assignEffect,
      cSchedules: [{ eventId: 'done', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
    }],
  };
}

describe('ASSIGN gated by a consumable container', () => {
  test('starts service and deducts the container level when enough is available', () => {
    const model = makeModel({ assignEffect: 'ASSIGN(Wait Queue, Server, Kits:2)', initialLevel: 5 });
    const result = buildEngine(model, 1, 0, 5).runAll();
    // Two servers are idle, each consuming 2 Kits per claim: 5 -> 3 -> 1, then the
    // third customer's claim is blocked (1 < 2) — both drops must appear in the log.
    expect(result.log.some(e => /container 'Kits' → 3\.0000/.test(e.message || ''))).toBe(true);
    expect(result.log.some(e => /container 'Kits' → 1\.0000/.test(e.message || ''))).toBe(true);
    const customers = result.entitySummary.filter(e => e.role === 'customer');
    const servedTwice = customers.filter(c => c.stages?.some(s => s.serviceEndedAt != null));
    expect(servedTwice.length).toBe(2);
  });

  test('refuses to start service when the container is below the required amount, leaving the server unclaimed', () => {
    const model = makeModel({ assignEffect: 'ASSIGN(Wait Queue, Server, Kits:2)', initialLevel: 1 });
    const result = buildEngine(model, 1, 0, 5).runAll();
    const guardMsg = result.log.some(e => typeof e.message === 'string' && e.message.includes('guard failed'));
    expect(guardMsg).toBe(true);
    const customers = result.entitySummary.filter(e => e.role === 'customer');
    // No one should have been served — the container never had enough for even one claim.
    expect(customers.every(c => c.status === 'waiting')).toBe(true);
  });

  test('does not partially commit — a failed container check leaves the server idle and the customer waiting', () => {
    const model = makeModel({ assignEffect: 'ASSIGN(Wait Queue, Server, Kits:100)', initialLevel: 5, capacity: 200 });
    const result = buildEngine(model, 1, 0, 5).runAll();
    const customers = result.entitySummary.filter(e => e.role === 'customer');
    expect(customers.every(c => c.status === 'waiting')).toBe(true);
  });

  test('references an undeclared container gracefully instead of crashing', () => {
    const model = makeModel({ assignEffect: 'ASSIGN(Wait Queue, Server, Ghost:1)', initialLevel: 5 });
    expect(() => buildEngine(model, 1, 0, 5).runAll()).not.toThrow();
    const result = buildEngine(model, 1, 0, 5).runAll();
    const notDeclaredMsg = result.log.some(e => typeof e.message === 'string' && e.message.includes('not declared in containerTypes'));
    expect(notDeclaredMsg).toBe(true);
  });

  test('still supports the skill clause together with a container clause', () => {
    const model = makeModel({ assignEffect: 'ASSIGN(Wait Queue, Server, "Triage", Kits:1)', initialLevel: 5 });
    model.entityTypes.find(e => e.id === 'S').skills = ['Triage'];
    const result = buildEngine(model, 1, 0, 5).runAll();
    const servedMsg = result.log.some(e => typeof e.message === 'string' && e.message.includes('skill: Triage'));
    expect(servedMsg).toBe(true);
  });
});

describe('V27 — ASSIGN container clause validation', () => {
  function baseModel(effect) {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'wait', name: 'Wait Queue', customerType: 'Customer', discipline: 'FIFO' }],
      containerTypes: [{ id: 'Kits', capacity: '10', initialLevel: '5' }],
      stateVariables: [],
      bEvents: [],
      cEvents: [{
        id: 'c1', name: 'Start', priority: 1,
        condition: 'queue(Wait Queue).length > 0',
        effect,
      }],
    };
  }

  test('flags an ASSIGN referencing an undeclared container', () => {
    const { errors } = validateModel(baseModel('ASSIGN(Wait Queue, Server, Ghost:1)'));
    expect(errors.some(e => e.code === 'V27' && /undeclared container/.test(e.message))).toBe(true);
  });

  test('accepts an ASSIGN referencing a declared container with a positive amount', () => {
    const { errors } = validateModel(baseModel('ASSIGN(Wait Queue, Server, Kits:1)'));
    expect(errors.some(e => e.code === 'V27')).toBe(false);
  });

  test('flags a non-positive container amount', () => {
    const { errors } = validateModel(baseModel('ASSIGN(Wait Queue, Server, Kits:0)'));
    expect(errors.some(e => e.code === 'V27' && /positive number/.test(e.message))).toBe(true);
  });
});
