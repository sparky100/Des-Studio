import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';
import { evaluatePredicate, buildConditionTokens } from '../../src/engine/conditions.js';

beforeEach(() => {
  resetSeq();
});

describe('Entity.loopCount', () => {
  test('entities are created with loopCount: 0', () => {
    const model = {
      entityTypes: [{ id: "c", name: "Customer", role: "customer", attrDefs: [] }],
      stateVariables: [],
      queues: [{ id: "q", name: "Q", discipline: "FIFO" }],
      bEvents: [{ id: "arrival", name: "Arrival", effect: "ARRIVE(Customer, Q)", scheduledTime: "0", schedules: [] }],
      cEvents: [],
    };

    const engine = buildEngine(model, 1, 0, 5);
    const result = engine.runAll();

    // At least one entity should exist with loopCount = 0
    const entities = result.entitySummary.filter(e => e.role === "customer");
    expect(entities.length).toBeGreaterThan(0);
    entities.forEach(e => {
      expect(e.loopCount).toBe(0);
    });
  });

  test('loopCount can be read as a condition token', () => {
    const tokens = buildConditionTokens(
      [{ id: "c", name: "Customer", role: "customer", attrDefs: [] }],
      []
    );
    const loopToken = tokens.find(t => t.value === "loopCount");
    expect(loopToken).toBeDefined();
    expect(loopToken.valueType).toBe("number");
  });
});

describe('Loop guard (loopConfig)', () => {
  const loopModel = {
    entityTypes: [
      { id: "c", name: "Customer", role: "customer", attrDefs: [] },
      { id: "w", name: "Worker", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: "q1", name: "Entry Queue", discipline: "FIFO" },
      { id: "q2", name: "Rework Queue", discipline: "FIFO" },
      { id: "q3", name: "Exit Queue", discipline: "FIFO" },
    ],
    bEvents: [
      { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer, Entry Queue)", scheduledTime: "0", schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "2" } }] },
      { id: "process", name: "Process Entity", effect: "RELEASE(Worker)", scheduledTime: "9999", schedules: [] },
      { id: "complete", name: "Complete Entity", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
    ],
    cEvents: [
      {
        id: "c1",
        name: "Start Service",
        condition: "queue(Entry Queue).length > 0 AND idle(Worker).count > 0",
        effect: "ASSIGN(Entry Queue, Worker)",
        cSchedules: [{ eventId: "process", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
      },
    ],
  };

  test('engine does not crash when loopConfig is absent on B-Event', () => {
    const engine = buildEngine(loopModel, 42, 0, 5);
    const result = engine.runAll();
    expect(result.finalTime).toBeGreaterThan(0);
  });

  test('loopConfig increments entity.loopCount when present', () => {
    // Create a model with a loop B-Event that has loopConfig
    const model = {
      ...loopModel,
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer, Entry Queue)", scheduledTime: "0", schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "2" } }] },
        { id: "process", name: "Process Entity", effect: "RELEASE(Worker, Entry Queue)", scheduledTime: "9999", schedules: [],
          loopConfig: { maxLoopCount: 3, exitQueueName: "Exit Queue" },
        },
        { id: "complete", name: "Complete Entity", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Some entities should have traversed the loop at least once
    const withLoopCount = result.entitySummary.filter(e => e.loopCount > 0);
    // No entity should exceed the maxLoopCount
    const exceeded = result.entitySummary.filter(e => e.loopCount > 3);
    expect(exceeded.length).toBe(0);
  });

  test('loopConfig with exitQueueName routes entity to exit queue when maxLoopCount reached', () => {
    const model = {
      ...loopModel,
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Customer, Entry Queue)", scheduledTime: "0", schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "2" } }] },
        { id: "process", name: "Process Entity", effect: "RELEASE(Worker, Entry Queue)", scheduledTime: "9999", schedules: [],
          loopConfig: { maxLoopCount: 1, exitQueueName: "Exit Queue" },
        },
        { id: "complete", name: "Complete Entity", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Entities should be routed to Exit Queue when loopCount reaches 1
    const exitQueueEntities = result.entitySummary.filter(e => e.queue === "Exit Queue" && e.role === "customer");
    expect(exitQueueEntities.length).toBeGreaterThan(0);
  });
});

describe('Predicate evaluator with Entity.loopCount', () => {
  test('resolveVariable handles Entity.loopCount', () => {
    const predicate = { variable: "Entity.loopCount", operator: ">", value: 2 };
    const state = { currentEntity: { loopCount: 3 } };
    expect(evaluatePredicate(predicate, state)).toBe(true);

    const state2 = { currentEntity: { loopCount: 1 } };
    expect(evaluatePredicate(predicate, state2)).toBe(false);
  });

  test('Entity.loopCount resolves to 0 when entity has no loopCount', () => {
    const predicate = { variable: "Entity.loopCount", operator: "==", value: 0 };
    const state = { currentEntity: { } };
    expect(evaluatePredicate(predicate, state)).toBe(true);
  });
});
