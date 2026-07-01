import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { validateModel } from '../../src/engine/validation.js';

// ── DELAY with capacity parameter ─────────────────────────────────────────────

describe('DELAY(QueueName, N) — slot capacity', () => {
  test('DELAY(Q, 2) drains at most 2 entities per firing', () => {
    // Create 5 entities that arrive at time 0
    const arrives = Array.from({ length: 5 }, (_, i) => ({
      id: `b_a${i + 1}`, name: `Arrive ${i + 1}`, scheduledTime: "0",
      effect: "ARRIVE(Runner, Queue)", schedules: [],
    }));

    const model = {
      entityTypes: [{ name: "Runner", role: "customer", count: 0 }],
      bEvents: [
        ...arrives,
        { id: "b_done", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [{
        id: "c_delay",
        name: "Delay",
        effect: "DELAY(Queue, 2)", // Capacity 2
        priority: 1,
        condition: { variable: "queue(Queue).length", operator: ">", value: 0 },
        cSchedules: [{ dist: "Fixed", distParams: { value: "1" }, eventId: "b_done", useEntityCtx: true }],
      }],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO", customerType: "Runner" }],
    };

    const result = buildEngine(model, 42, 0, 10, null, 5000, 5000, false).runAll();
    const entities = result.entitySummary ?? [];
    const done = entities.filter(e => e.status === 'done');
    // With capacity 2 and 5 entities, should complete all 5 (2+2+1 over 3 firings)
    expect(done).toHaveLength(5);
  });

  test('DELAY(Q) without capacity drains all entities', () => {
    const arrives = Array.from({ length: 5 }, (_, i) => ({
      id: `b_a${i + 1}`, name: `Arrive ${i + 1}`, scheduledTime: "0",
      effect: "ARRIVE(Runner, Queue)", schedules: [],
    }));

    const model = {
      entityTypes: [{ name: "Runner", role: "customer", count: 0 }],
      bEvents: [
        ...arrives,
        { id: "b_done", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [{
        id: "c_delay",
        name: "Delay",
        effect: "DELAY(Queue)", // No capacity - drain all
        priority: 1,
        condition: { variable: "queue(Queue).length", operator: ">", value: 0 },
        cSchedules: [{ dist: "Fixed", distParams: { value: "1" }, eventId: "b_done", useEntityCtx: true }],
      }],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO", customerType: "Runner" }],
    };

    const result = buildEngine(model, 42, 0, 10, null, 5000, 5000, false).runAll();
    const entities = result.entitySummary ?? [];
    const done = entities.filter(e => e.status === 'done');
    expect(done).toHaveLength(5);
  });
});

// ── Calendar-aware conditions ─────────────────────────────────────────────────

describe('Calendar conditions — isWeekday, hourOfDay, dayOfWeek', () => {
  test('isWeekday returns true when epoch is set to a weekday', () => {
    const model = {
      entityTypes: [{ name: "Runner", role: "customer", count: 0 }],
      bEvents: [
        { id: "b_a1", name: "Arrive 1", scheduledTime: "0", effect: "ARRIVE(Runner, Queue)", schedules: [] },
        { id: "b_done", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [{
        id: "c_process",
        name: "Process",
        effect: "DELAY(Queue)",
        priority: 1,
        condition: "queue(Queue).length > 0 AND isWeekday",
        cSchedules: [{ dist: "Fixed", distParams: { value: "1" }, eventId: "b_done", useEntityCtx: true }],
      }],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO", customerType: "Runner" }],
      epoch: '2026-07-01T09:00:00', // Wednesday
      timeUnit: 'minutes',
    };

    const result = buildEngine(model, 42, 0, 10, null, 5000, 5000, false).runAll();
    const entities = result.entitySummary ?? [];
    const done = entities.filter(e => e.status === 'done');
    expect(done).toHaveLength(1);
  });

  test('hourOfDay returns correct hour from epoch', () => {
    const model = {
      entityTypes: [{ name: "Runner", role: "customer", count: 0 }],
      bEvents: [
        { id: "b_a1", name: "Arrive 1", scheduledTime: "0", effect: "ARRIVE(Runner, Queue)", schedules: [] },
        { id: "b_done", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [{
        id: "c_process",
        name: "Process",
        effect: "DELAY(Queue)",
        priority: 1,
        condition: "queue(Queue).length > 0 AND hourOfDay >= 9 AND hourOfDay < 17",
        cSchedules: [{ dist: "Fixed", distParams: { value: "1" }, eventId: "b_done", useEntityCtx: true }],
      }],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO", customerType: "Runner" }],
      epoch: '2026-07-01T09:00:00', // 9am
      timeUnit: 'minutes',
    };

    const result = buildEngine(model, 42, 0, 10, null, 5000, 5000, false).runAll();
    const entities = result.entitySummary ?? [];
    const done = entities.filter(e => e.status === 'done');
    expect(done).toHaveLength(1);
  });

  test('dayOfWeek returns correct day from epoch', () => {
    const model = {
      entityTypes: [{ name: "Runner", role: "customer", count: 0 }],
      bEvents: [
        { id: "b_a1", name: "Arrive 1", scheduledTime: "0", effect: "ARRIVE(Runner, Queue)", schedules: [] },
        { id: "b_done", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [{
        id: "c_process",
        name: "Process",
        effect: "DELAY(Queue)",
        priority: 1,
        condition: "queue(Queue).length > 0 AND dayOfWeek >= 1 AND dayOfWeek <= 5",
        cSchedules: [{ dist: "Fixed", distParams: { value: "1" }, eventId: "b_done", useEntityCtx: true }],
      }],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO", customerType: "Runner" }],
      epoch: '2026-07-01T09:00:00', // Wednesday (dayOfWeek = 3)
      timeUnit: 'minutes',
    };

    const result = buildEngine(model, 42, 0, 10, null, 5000, 5000, false).runAll();
    const entities = result.entitySummary ?? [];
    const done = entities.filter(e => e.status === 'done');
    expect(done).toHaveLength(1);
  });
});

// ── Validation rules ──────────────────────────────────────────────────────────

describe('Validation — V-SLOT-1, V-CAL-1, V-CAL-2', () => {
  test('V-SLOT-1: DELAY capacity must be positive integer', () => {
    const model = {
      entityTypes: [{ name: "Runner", role: "customer", count: 0 }],
      bEvents: [
        { id: "b_a1", name: "Arrive 1", scheduledTime: "0", effect: "ARRIVE(Runner, Queue)", schedules: [] },
        { id: "b_done", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [{
        id: "c_delay",
        name: "Delay",
        effect: "DELAY(Queue, 0)", // Invalid: 0 is not positive
        priority: 1,
        condition: "queue(Queue).length > 0",
        cSchedules: [{ dist: "Fixed", distParams: { value: "1" }, eventId: "b_done", useEntityCtx: true }],
      }],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO", customerType: "Runner" }],
    };

    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === 'V-SLOT-1')).toBe(true);
  });

  test('V-CAL-1: warns when calendar conditions used without epoch', () => {
    const model = {
      entityTypes: [{ name: "Runner", role: "customer", count: 0 }],
      bEvents: [
        { id: "b_a1", name: "Arrive 1", scheduledTime: "0", effect: "ARRIVE(Runner, Queue)", schedules: [] },
        { id: "b_done", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [{
        id: "c_process",
        name: "Process",
        effect: "DELAY(Queue)",
        priority: 1,
        condition: "queue(Queue).length > 0 AND isWeekday",
        cSchedules: [{ dist: "Fixed", distParams: { value: "1" }, eventId: "b_done", useEntityCtx: true }],
      }],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO", customerType: "Runner" }],
      // No epoch set
    };

    const { warnings } = validateModel(model);
    expect(warnings.some(w => w.code === 'V-CAL-1')).toBe(true);
  });

  test('V-CAL-2: warns when hourOfDay comparison value outside 0-23', () => {
    const model = {
      entityTypes: [{ name: "Runner", role: "customer", count: 0 }],
      bEvents: [
        { id: "b_a1", name: "Arrive 1", scheduledTime: "0", effect: "ARRIVE(Runner, Queue)", schedules: [] },
        { id: "b_done", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [{
        id: "c_process",
        name: "Process",
        effect: "DELAY(Queue)",
        priority: 1,
        condition: "queue(Queue).length > 0 AND hourOfDay >= 25", // Invalid: 25 > 23
        cSchedules: [{ dist: "Fixed", distParams: { value: "1" }, eventId: "b_done", useEntityCtx: true }],
      }],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO", customerType: "Runner" }],
      epoch: '2026-07-01T09:00:00',
      timeUnit: 'minutes',
    };

    const { warnings } = validateModel(model);
    expect(warnings.some(w => w.code === 'V-CAL-2')).toBe(true);
  });
});
