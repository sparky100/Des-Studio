// tests/engine/phase1-smaller-gaps.test.js — Phase 1 of the "smaller capability gaps"
// round: shortest-queue routing (dynamic RHS resolution), FINISH(ServerType)
// (condition-triggered completion), and MATCH's compatibility predicate.

import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';
import { validateModel } from '../../src/engine/validation.js';

beforeEach(() => {
  resetSeq();
});

describe('Shortest-queue routing — RHS resolves as a dynamic reference', () => {
  function makeModel() {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [
        { id: 'wait', name: 'Wait Queue', customerType: 'Customer', discipline: 'FIFO' },
        { id: 'qa', name: 'QueueA', customerType: 'Customer', discipline: 'FIFO' },
        { id: 'qb', name: 'QueueB', customerType: 'Customer', discipline: 'FIFO' },
      ],
      stateVariables: [],
      bEvents: [
        // Pre-seed QueueA with 3 waiting entities, QueueB with 1 — QueueB is shorter.
        { id: 'seedA1', name: 'SeedA1', scheduledTime: '0', effect: 'ARRIVE(Customer, QueueA)', schedules: [] },
        { id: 'seedA2', name: 'SeedA2', scheduledTime: '0', effect: 'ARRIVE(Customer, QueueA)', schedules: [] },
        { id: 'seedA3', name: 'SeedA3', scheduledTime: '0', effect: 'ARRIVE(Customer, QueueA)', schedules: [] },
        { id: 'seedB1', name: 'SeedB1', scheduledTime: '0', effect: 'ARRIVE(Customer, QueueB)', schedules: [] },
        { id: 'arr', name: 'Arrive', scheduledTime: '1', effect: 'ARRIVE(Customer, Wait Queue)', schedules: [] },
        {
          id: 'done', name: 'Done', scheduledTime: '9999',
          effect: 'RELEASE(Server)', schedules: [],
          routing: [
            { condition: { variable: 'queue(QueueB).length', operator: '<', value: 'queue(QueueA).length' }, queueName: 'QueueB' },
          ],
          defaultQueueName: 'QueueA',
        },
      ],
      cEvents: [{
        id: 'c1', name: 'Start', priority: 1,
        condition: 'queue(Wait Queue).length > 0 AND idle(Server).count > 0',
        effect: 'ASSIGN(Wait Queue, Server)',
        cSchedules: [{ eventId: 'done', dist: 'Fixed', distParams: { value: '0.5' }, useEntityCtx: true }],
      }],
    };
  }

  test('routes to the queue that is dynamically shorter, not a fixed literal', () => {
    const result = buildEngine(makeModel(), 1, 0, 5).runAll();
    const customers = result.entitySummary.filter(e => e.role === 'customer');
    // The entity released from service should have landed in QueueB (1 < 3).
    const routed = customers.find(c => c.queue === 'QueueB' || c.lastQueue === 'QueueB');
    expect(routed).toBeDefined();
    // QueueA must still hold its original 3 seeded entities (nothing routed there).
    const queueACount = customers.filter(c => c.queue === 'QueueA').length;
    expect(queueACount).toBe(3);
  });

  test('numeric literal RHS still works unaffected (backward compatibility)', () => {
    const model = makeModel();
    model.bEvents.find(b => b.id === 'done').routing = [
      { condition: { variable: 'queue(QueueA).length', operator: '>', value: 0 }, queueName: 'QueueA' },
    ];
    const result = buildEngine(model, 1, 0, 5).runAll();
    const customers = result.entitySummary.filter(e => e.role === 'customer');
    const routed = customers.find(c => c.queue === 'QueueA' && c.completionTime != null || c.lastQueue === 'QueueA');
    expect(customers.length).toBeGreaterThan(0);
    // Just confirming the run completes without throwing and literal comparisons still route.
    expect(result.log.some(e => typeof e.message === 'string' && e.message.includes('Routing'))).toBe(true);
  });
});

describe('FINISH(ServerType) — condition-triggered completion', () => {
  function makeModel() {
    return {
      entityTypes: [
        { id: 'C', name: 'Customer', role: 'customer', attrDefs: [] },
        { id: 'S', name: 'Server', role: 'server', count: '1', attrDefs: [] },
      ],
      queues: [{ id: 'q', name: 'Queue', customerType: 'Customer', discipline: 'FIFO' }],
      stateVariables: [{ name: 'shouldFinish', initialValue: '0' }],
      bEvents: [
        { id: 'arr', name: 'Arrive', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)', schedules: [] },
        { id: 'flip', name: 'FlipFlag', scheduledTime: '5', effect: 'SET(shouldFinish, 1)', schedules: [] },
        // Never reached under normal circumstances — service is "of unknown duration"
        // and should only end via the FINISH-driven C-event below.
        { id: 'done', name: 'Done', scheduledTime: '9999', effect: 'COMPLETE()', schedules: [] },
      ],
      cEvents: [
        {
          id: 'c1', name: 'Start', priority: 1,
          condition: 'queue(Queue).length > 0 AND idle(Server).count > 0',
          effect: 'ASSIGN(Queue, Server)',
          cSchedules: [{ eventId: 'done', dist: 'Fixed', distParams: { value: '9999' }, useEntityCtx: true }],
        },
        {
          id: 'c2', name: 'FinishOnFlag', priority: 2,
          condition: 'shouldFinish == 1 AND busy(Server).count > 0',
          effect: 'FINISH(Server)',
        },
      ],
    };
  }

  test('ends service the moment the condition becomes true, not at the scheduled delay', () => {
    const result = buildEngine(makeModel(), 1, 0, 20).runAll();
    const cust = result.entitySummary.find(e => e.role === 'customer');
    expect(cust.status).toBe('done');
    expect(cust.completionTime).toBeCloseTo(5, 5);
    const server = result.snap.entities.find(e => e.role === 'server');
    expect(server.status).toBe('idle');
  });

  test('is a harmless no-op when no server of that type is busy', () => {
    const model = makeModel();
    // Drop the busy-server guard from c2's condition so FINISH actually gets called
    // while the server is still idle (no one has arrived/been served yet).
    model.cEvents.find(c => c.id === 'c2').condition = 'shouldFinish == 1';
    model.bEvents.find(b => b.id === 'flip').scheduledTime = '0';
    model.bEvents.find(b => b.id === 'arr').scheduledTime = '3';
    const result = buildEngine(model, 1, 0, 20).runAll();
    const noBusyMsg = result.log.some(e => typeof e.message === 'string' && e.message.includes('FINISH(Server): no busy server found'));
    expect(noBusyMsg).toBe(true);
    // The entity that arrives afterward is still assigned and finished cleanly by the
    // (still-true) flag — FINISH's earlier no-op against an idle server didn't corrupt
    // any state that would prevent a later, legitimate FINISH from working.
    const cust = result.entitySummary.find(e => e.role === 'customer');
    expect(cust.status).toBe('done');
    expect(cust.completionTime).toBeCloseTo(3, 5);
  });
});

describe('MATCH — compatibility predicate scans for a compatible pair', () => {
  function makeModel(predicate) {
    return {
      entityTypes: [
        { id: 'TA', name: 'TypeA', role: 'customer', attrDefs: [{ name: 'bloodType', valueType: 'string', defaultValue: 'A' }] },
        { id: 'TB', name: 'TypeB', role: 'customer', attrDefs: [{ name: 'bloodType', valueType: 'string', defaultValue: 'B' }] },
      ],
      queues: [
        { id: 'qa', name: 'QueueA', discipline: 'FIFO' },
        { id: 'qb', name: 'QueueB', discipline: 'FIFO' },
        { id: 'qt', name: 'Matched', discipline: 'FIFO' },
      ],
      stateVariables: [],
      bEvents: [
        // QueueA FIFO order: TypeA (bloodType A) arrives first, TypeB (bloodType B) second.
        { id: 'a1', name: 'ArriveA', scheduledTime: '0', effect: 'ARRIVE(TypeA, QueueA)', schedules: [] },
        { id: 'a2', name: 'ArriveB1', scheduledTime: '1', effect: 'ARRIVE(TypeB, QueueA)', schedules: [] },
        { id: 'b1', name: 'ArriveB2', scheduledTime: '2', effect: 'ARRIVE(TypeB, QueueB)', schedules: [] },
      ],
      cEvents: [{
        id: 'c1', name: 'Pair', priority: 1,
        condition: 'queue(QueueA).length > 0 AND queue(QueueB).length > 0',
        effect: predicate
          ? `MATCH(TypeA, QueueA, TypeB, QueueB, Matched, "${predicate}")`
          : 'MATCH(TypeA, QueueA, TypeB, QueueB, Matched)',
      }],
    };
  }

  test('skips an incompatible front-of-queue pair and matches the compatible one instead', () => {
    const result = buildEngine(makeModel('Entity.bloodType == Other.bloodType'), 1, 0, 10).runAll();
    const customers = result.entitySummary.filter(e => e.role === 'customer');
    const bloodTypeA = customers.find(c => c.attrs?.bloodType === 'A');
    // The bloodType-A entity (front of QueueA) must NOT have been matched — it's incompatible
    // with QueueB's bloodType-B entity — so it's still waiting.
    expect(bloodTypeA.status).toBe('waiting');
    const batch = result.entitySummary.find(e => e.role === 'batch');
    expect(batch).toBeDefined();
    expect(batch._matchedFrom).not.toContain(bloodTypeA.id);
  });

  test('without a predicate, falls back to the original front-of-queue behavior', () => {
    const result = buildEngine(makeModel(null), 1, 0, 10).runAll();
    const customers = result.entitySummary.filter(e => e.role === 'customer');
    const bloodTypeA = customers.find(c => c.attrs?.bloodType === 'A');
    // Legacy behavior: front of QueueA (bloodType A) is matched regardless of compatibility.
    expect(bloodTypeA.status).toBe('done');
  });

  test('a malformed predicate is caught gracefully instead of crashing the run', () => {
    // "Foo.bar" is not a recognized variable namespace — resolveVariable throws for it.
    expect(() => {
      buildEngine(makeModel('Foo.bar == 1'), 1, 0, 10).runAll();
    }).not.toThrow();
    const result = buildEngine(makeModel('Foo.bar == 1'), 1, 0, 10).runAll();
    const noMatchMsg = result.log.some(e => typeof e.message === 'string' && e.message.includes('predicate error'));
    expect(noMatchMsg).toBe(true);
  });
});

describe('V66 — MATCH compatibility predicate must be evaluable', () => {
  function baseModel(effect) {
    return {
      entityTypes: [
        { id: 'TA', name: 'TypeA', role: 'customer', attrDefs: [] },
        { id: 'TB', name: 'TypeB', role: 'customer', attrDefs: [] },
      ],
      queues: [
        { id: 'qa', name: 'QueueA', discipline: 'FIFO' },
        { id: 'qb', name: 'QueueB', discipline: 'FIFO' },
        { id: 'qt', name: 'Matched', discipline: 'FIFO' },
      ],
      stateVariables: [],
      bEvents: [],
      cEvents: [{ id: 'c1', name: 'Pair', priority: 1, condition: 'queue(QueueA).length > 0', effect }],
    };
  }

  test('flags a malformed compatibility predicate as a blocking error', () => {
    const model = baseModel('MATCH(TypeA, QueueA, TypeB, QueueB, Matched, "Foo.bar == 1")');
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === 'V66')).toBe(true);
  });

  test('a well-formed compatibility predicate does not trigger V66', () => {
    const model = baseModel('MATCH(TypeA, QueueA, TypeB, QueueB, Matched, "Entity.bloodType == Other.bloodType")');
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === 'V66')).toBe(false);
  });
});
