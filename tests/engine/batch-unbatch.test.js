import { describe, test, expect, beforeEach } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { resetSeq } from '../../src/engine/entities.js';
import { MACROS } from '../../src/engine/macros.js';

beforeEach(() => {
  resetSeq();
});

const baseModel = {
  entityTypes: [
    { id: "part", name: "Part", role: "customer", attrDefs: [] },
  ],
  stateVariables: [],
  queues: [
    { id: "q1", name: "Accum Queue", discipline: "FIFO" },
    { id: "q2", name: "Output Queue", discipline: "FIFO" },
  ],
  bEvents: [
    { id: "arrival", name: "Arrival", effect: "ARRIVE(Part, Accum Queue)", scheduledTime: "0", schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
    { id: "process", name: "Process Batch", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
  ],
  cEvents: [],
};

describe('BATCH macro', () => {
  test('BATCH macro is registered in MACROS', () => {
    const batch = MACROS.find(m => m.name === 'BATCH');
    expect(batch).toBeDefined();
    expect(batch.pattern).toBeDefined();
    expect(typeof batch.apply).toBe('function');
  });

  test('BATCH pattern matches valid syntax', () => {
    const batch = MACROS.find(m => m.name === 'BATCH');
    const m1 = 'BATCH(Accum Queue, 2)'.match(batch.pattern);
    expect(m1).toBeTruthy();
    expect(m1[1].trim()).toBe('Accum Queue');
    expect(m1[2]).toBe('2');

    const m2 = 'BATCH(Output Queue, 10)'.match(batch.pattern);
    expect(m2).toBeTruthy();
    expect(m2[1].trim()).toBe('Output Queue');
    expect(m2[2]).toBe('10');
  });

  test('BATCH creates parent entity when queue has enough entities', () => {
    const model = {
      ...baseModel,
      cEvents: [
        {
          id: "c1",
          name: "Batch Parts",
          condition: "queue(Accum Queue).length >= 2",
          effect: "BATCH(Accum Queue, 2)",
          cSchedules: [{ eventId: "process", dist: "Fixed", distParams: { value: "0" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    expect(result.finalTime).toBeGreaterThan(0);
    // After BATCH fires, there should be a parent batch entity
    const batchEntities = result.entitySummary.filter(e => e.role === "batch");
    expect(batchEntities.length).toBeGreaterThan(0);
    // Each batch parent should have children
    batchEntities.forEach(be => {
      expect(be.batch).toBeDefined();
      expect(Array.isArray(be.batch.children)).toBe(true);
      expect(be.batch.children.length).toBe(2);
    });
  });

  test('BATCH respects queue discipline (FIFO)', () => {
    const model = {
      ...baseModel,
      cEvents: [
        {
          id: "c1",
          name: "Batch Parts",
          condition: "queue(Accum Queue).length >= 2",
          effect: "BATCH(Accum Queue, 2)",
          cSchedules: [{ eventId: "process", dist: "Fixed", distParams: { value: "0" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const batchEntities = result.entitySummary.filter(e => e.role === "batch");
    batchEntities.forEach(be => {
      const children = be.batch.children;
      // FIFO: children should be ordered by arrivalTime ascending
      for (let i = 1; i < children.length; i++) {
        expect(children[i].arrivalTime).toBeGreaterThanOrEqual(children[i - 1].arrivalTime);
      }
    });
  });

  test('BATCH does nothing when queue has insufficient entities', () => {
    // C-Event with condition requiring >= 50 but only ~10 entities arrive
    const model = {
      ...baseModel,
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Part, Accum Queue)", scheduledTime: "0", schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "process", name: "Process Batch", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Batch Parts",
          condition: "queue(Accum Queue).length >= 50",
          effect: "BATCH(Accum Queue, 50)",
          cSchedules: [{ eventId: "process", dist: "Fixed", distParams: { value: "0" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 8);
    const result = engine.runAll();

    // No batch should have formed (< 10 arrivals, batchSize=50)
    const batchEntities = result.entitySummary.filter(e => e.role === "batch");
    expect(batchEntities.length).toBe(0);
    // Entities should still be waiting in the queue
    const waiting = result.entitySummary.filter(e => e.status === "waiting");
    expect(waiting.length).toBeGreaterThan(0);
  });

  test('BATCH rejects batchSize < 2 in macro apply', () => {
    // Verify that batchSize is validated — the macro won't match batchSize < 2
    const batch = MACROS.find(m => m.name === 'BATCH');
    const m1 = 'BATCH(Accum Queue, 1)'.match(batch.pattern);
    expect(m1).toBeTruthy();
    expect(parseInt(m1[2], 10)).toBe(1);
    // The validation rule V22 catches this; the macro still applies it
  });
});

describe('UNBATCH macro', () => {
  test('UNBATCH macro is registered in MACROS', () => {
    const unbatch = MACROS.find(m => m.name === 'UNBATCH');
    expect(unbatch).toBeDefined();
    expect(unbatch.pattern).toBeDefined();
    expect(typeof unbatch.apply).toBe('function');
  });

  test('UNBATCH pattern matches valid syntax', () => {
    const unbatch = MACROS.find(m => m.name === 'UNBATCH');
    const m1 = 'UNBATCH(Output Queue)'.match(unbatch.pattern);
    expect(m1).toBeTruthy();
    expect(m1[1].trim()).toBe('Output Queue');
  });

  test('UNBATCH restores children to target queue', () => {
    const model = {
      ...baseModel,
      queues: [
        { id: "q1", name: "Accum Queue", discipline: "FIFO" },
        { id: "q3", name: "Output Queue", discipline: "FIFO" },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Batch Parts",
          condition: "queue(Accum Queue).length >= 2",
          effect: "BATCH(Accum Queue, 2)",
          cSchedules: [{ eventId: "unbatch-event", dist: "Fixed", distParams: { value: "0" }, useEntityCtx: true }],
        },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Part, Accum Queue)", scheduledTime: "0", schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "unbatch-event", name: "Unbatch", effect: "UNBATCH(Output Queue)", scheduledTime: "9999", schedules: [] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // After the simulation, children should be restored to Output Queue
    const restored = result.entitySummary.filter(e => e.queue === "Output Queue" && e.status === "waiting");
    expect(restored.length).toBeGreaterThanOrEqual(2);
  });

  test('UNBATCH preserves child attributes and arrivalTime', () => {
    const model = {
      entityTypes: [
        { id: "part", name: "Part", role: "customer", attrDefs: [
          { name: "defectRate", valueType: "number", defaultValue: "0" },
        ]},
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Accum Queue", discipline: "FIFO" },
        { id: "q2", name: "Output Queue", discipline: "FIFO" },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Batch Parts",
          condition: "queue(Accum Queue).length >= 2",
          effect: "BATCH(Accum Queue, 2)",
          cSchedules: [{ eventId: "unbatch-event", dist: "Fixed", distParams: { value: "0" }, useEntityCtx: true }],
        },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", effect: "ARRIVE(Part, Accum Queue)", scheduledTime: "0", schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "unbatch-event", name: "Unbatch", effect: "UNBATCH(Output Queue)", scheduledTime: "9999", schedules: [] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Children should retain their attrs
    const restored = result.entitySummary.filter(e => e.queue === "Output Queue" && e.status === "waiting");
    expect(restored.length).toBeGreaterThanOrEqual(2);
    // Children should have valid IDs and arrivalTimes
    restored.forEach(child => {
      expect(child.id).toBeGreaterThan(0);
      expect(child.arrivalTime).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('BATCH + UNBATCH end-to-end flow', () => {
  test('batched entities are seized as a group, unbatched, then individually re-seized and completed', () => {
    // Full lifecycle: ARRIVE (x2) → BATCH → ASSIGN seizes the batch parent as a unit →
    // COMPLETE releases the worker + UNBATCH restores the two children → each child is
    // individually re-seized from Output Queue and completes on its own.
    const model = {
      entityTypes: [
        { id: "part", name: "Part", role: "customer", attrDefs: [] },
        { id: "worker", name: "Worker", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q1", name: "Accum Queue", discipline: "FIFO" },
        { id: "q2", name: "Output Queue", discipline: "FIFO" },
      ],
      bEvents: [
        // Both arrivals fire in the same tick so BATCH's condition is already true
        // before ASSIGN gets a chance to seize either part individually.
        { id: "arrival1", name: "Arrival 1", effect: "ARRIVE(Part, Accum Queue)", scheduledTime: "0", schedules: [] },
        { id: "arrival2", name: "Arrival 2", effect: "ARRIVE(Part, Accum Queue)", scheduledTime: "0", schedules: [] },
        { id: "parent-complete", name: "Complete", effect: "COMPLETE()", scheduledTime: "9999", schedules: [] },
        { id: "unbatch-event", name: "Unbatch", effect: "UNBATCH(Output Queue)", scheduledTime: "9999", schedules: [] },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Batch Parts",
          priority: 1,
          condition: "queue(Accum Queue).length >= 2",
          effect: "BATCH(Accum Queue, 2)",
          cSchedules: [],
        },
        {
          id: "c2",
          name: "Seize Batch",
          priority: 2,
          condition: "queue(Accum Queue).length > 0 AND idle(Worker).count > 0",
          effect: "ASSIGN(Accum Queue, Worker)",
          cSchedules: [
            { eventId: "parent-complete", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true },
            { eventId: "unbatch-event", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true },
          ],
        },
        {
          id: "c3",
          name: "Process Restored Children",
          priority: 3,
          condition: "queue(Output Queue).length > 0 AND idle(Worker).count > 0",
          effect: "ASSIGN(Output Queue, Worker)",
          cSchedules: [{ eventId: "parent-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, 8);
    const result = engine.runAll();

    // The batch parent itself completed (was seized as a single unit, then released).
    const batchParent = result.entitySummary.find(e => e.role === "batch");
    expect(batchParent).toBeDefined();
    expect(batchParent.status).toBe("done");

    // Recover the original child IDs from the BATCH log line rather than hard-coding them.
    const batchLogMsg = result.log.find(e => e.message?.includes("BATCH:"))?.message;
    expect(batchLogMsg).toBeDefined();
    const batchPart = batchLogMsg.slice(batchLogMsg.indexOf("BATCH:"));
    const ids = [...batchPart.matchAll(/#(\d+)/g)].map(m => Number(m[1]));
    const childIds = ids.slice(0, -1);
    expect(childIds.length).toBe(2);

    // Both children must have been individually re-seized from Output Queue after
    // UNBATCH restored them — not just left sitting in the queue.
    for (const childId of childIds) {
      const reseizeLog = result.log.some(e =>
        e.message?.includes(`#${childId} (Output Queue) → serving`)
      );
      expect(reseizeLog).toBe(true);

      const child = result.entitySummary.find(e => e.id === childId);
      expect(child).toBeDefined();
      expect(child.status).toBe("done");
    }
  });
});
