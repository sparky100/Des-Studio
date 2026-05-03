import { describe, test, expect, beforeEach } from 'vitest';
import { makeHelpers, resetSeq } from '../../src/engine/entities.js';

// Tests for queue discipline in waitingOf().
// These tests fail on the unmodified codebase (waitingOf ignores discipline).
// They pass after Sprint 1 Task 3 is implemented.

beforeEach(() => {
  resetSeq();
});

// ── Fixture ───────────────────────────────────────────────────────────────────
//
// Three jobs in the queue — deliberately ordered so that FIFO, LIFO, and
// PRIORITY each produce a *different* first selection.
//
//   id=1  arrivalTime=10  priority=2   ← middle on all three dimensions
//   id=2  arrivalTime=5   priority=3   ← earliest arrival, lowest priority
//   id=3  arrivalTime=15  priority=1   ← latest arrival, highest priority
//
// FIFO order (ascending arrivalTime):   id=2, id=1, id=3
// LIFO order (descending arrivalTime):  id=3, id=1, id=2
// PRIORITY order (ascending priority):  id=3, id=1, id=2

function makeJobs() {
  return [
    { id: 1, type: 'Job', role: 'customer', status: 'waiting', arrivalTime: 10, attrs: { priority: 2 } },
    { id: 2, type: 'Job', role: 'customer', status: 'waiting', arrivalTime: 5,  attrs: { priority: 3 } },
    { id: 3, type: 'Job', role: 'customer', status: 'waiting', arrivalTime: 15, attrs: { priority: 1 } },
  ];
}

describe('waitingOf — FIFO discipline', () => {
  test('FIFO: selects entity with the smallest arrivalTime first', () => {
    const h = makeHelpers(makeJobs());
    const result = h.waitingOf('Job', 'FIFO');
    expect(result[0].id).toBe(2);  // arrivalTime=5
    expect(result[1].id).toBe(1);  // arrivalTime=10
    expect(result[2].id).toBe(3);  // arrivalTime=15
  });

  test('FIFO is the default when no discipline is specified', () => {
    const h = makeHelpers(makeJobs());
    // Calling without second argument — must behave identically to FIFO
    const withArg    = h.waitingOf('Job', 'FIFO');
    const withoutArg = h.waitingOf('Job');
    expect(withoutArg.map(e => e.id)).toEqual(withArg.map(e => e.id));
  });
});

describe('waitingOf — LIFO discipline', () => {
  test('LIFO: selects entity with the largest arrivalTime first', () => {
    const h = makeHelpers(makeJobs());
    const result = h.waitingOf('Job', 'LIFO');
    expect(result[0].id).toBe(3);  // arrivalTime=15
    expect(result[1].id).toBe(1);  // arrivalTime=10
    expect(result[2].id).toBe(2);  // arrivalTime=5
  });

  test('LIFO: all returned entities are still waiting and of the correct type', () => {
    const h = makeHelpers(makeJobs());
    const result = h.waitingOf('Job', 'LIFO');
    expect(result).toHaveLength(3);
    expect(result.every(e => e.status === 'waiting')).toBe(true);
    expect(result.every(e => e.type === 'Job')).toBe(true);
  });
});

describe('waitingOf — PRIORITY discipline', () => {
  test('PRIORITY: selects entity with the smallest priority attribute first', () => {
    const h = makeHelpers(makeJobs());
    const result = h.waitingOf('Job', 'PRIORITY');
    expect(result[0].id).toBe(3);  // priority=1 (highest)
    expect(result[1].id).toBe(1);  // priority=2
    expect(result[2].id).toBe(2);  // priority=3 (lowest)
  });

  test('PRIORITY tiebreaker: equal priority uses FIFO (smallest arrivalTime)', () => {
    // Three entities: two share priority=1, one has priority=2.
    // Among the two tied at priority=1, the one with the earlier arrivalTime wins.
    //
    //   id=10  arrivalTime=20  priority=1
    //   id=11  arrivalTime=5   priority=2   ← lowest priority, earliest arrival
    //   id=12  arrivalTime=10  priority=1   ← tied on priority=1, earlier than id=10
    //
    // Expected PRIORITY order: id=12 (p=1, t=10), id=10 (p=1, t=20), id=11 (p=2)
    const tied = [
      { id: 10, type: 'Task', role: 'customer', status: 'waiting', arrivalTime: 20, attrs: { priority: 1 } },
      { id: 11, type: 'Task', role: 'customer', status: 'waiting', arrivalTime: 5,  attrs: { priority: 2 } },
      { id: 12, type: 'Task', role: 'customer', status: 'waiting', arrivalTime: 10, attrs: { priority: 1 } },
    ];
    const h = makeHelpers(tied);
    const result = h.waitingOf('Task', 'PRIORITY');
    expect(result[0].id).toBe(12); // priority=1, arrivalTime=10 wins the tie
    expect(result[1].id).toBe(10); // priority=1, arrivalTime=20
    expect(result[2].id).toBe(11); // priority=2
  });
});

describe('waitingOf — filterFn applied before discipline', () => {
  test('entity filter excludes non-matching entities before queue rule is applied', () => {
    // id=40 arrived earlier (FIFO would pick first) but priority=5 is excluded by filter
    // id=41 arrived later, priority=2 passes filter (priority < 4)
    const ents = [
      { id: 40, type: 'Job', role: 'customer', status: 'waiting', arrivalTime: 5,  attrs: { priority: 5 } },
      { id: 41, type: 'Job', role: 'customer', status: 'waiting', arrivalTime: 10, attrs: { priority: 2 } },
    ];
    const h = makeHelpers(ents);
    const result = h.waitingOf('Job', 'FIFO', (e) => e.attrs.priority < 4);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(41);
  });

  test('waitingOf returns empty array when no entities pass the filter', () => {
    const ents = [
      { id: 50, type: 'Task', role: 'customer', status: 'waiting', arrivalTime: 5, attrs: { urgent: false } },
    ];
    const h = makeHelpers(ents);
    const result = h.waitingOf('Task', 'FIFO', (e) => e.attrs.urgent === true);
    expect(result).toHaveLength(0);
  });

  test('entity filter applied before PRIORITY sort — filtered set is sorted correctly', () => {
    // id=60 priority=1 excluded, id=61 priority=2 included, id=62 priority=3 included
    // PRIORITY on filtered set picks id=61 (priority=2 wins over priority=3)
    const ents = [
      { id: 60, type: 'Job', role: 'customer', status: 'waiting', arrivalTime: 5,  attrs: { priority: 1 } },
      { id: 61, type: 'Job', role: 'customer', status: 'waiting', arrivalTime: 10, attrs: { priority: 2 } },
      { id: 62, type: 'Job', role: 'customer', status: 'waiting', arrivalTime: 15, attrs: { priority: 3 } },
    ];
    const h = makeHelpers(ents);
    const result = h.waitingOf('Job', 'PRIORITY', (e) => e.attrs.priority >= 2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(61);
    expect(result[1].id).toBe(62);
  });
});

describe('waitingOf — entity type filter applied before discipline', () => {
  test('filter excludes non-matching types before LIFO sort is applied', () => {
    // Two entity types in the same entities array.
    // TypeA: arrivals at t=5 and t=15.
    // TypeB: arrives at t=1 (earliest overall, but wrong type).
    // LIFO on TypeA should return arrivalTime=15 first, NOT TypeB's t=1.
    const mixed = [
      { id: 20, type: 'TypeA', role: 'customer', status: 'waiting', arrivalTime: 5,  attrs: {} },
      { id: 21, type: 'TypeB', role: 'customer', status: 'waiting', arrivalTime: 1,  attrs: {} },
      { id: 22, type: 'TypeA', role: 'customer', status: 'waiting', arrivalTime: 15, attrs: {} },
    ];
    const h = makeHelpers(mixed);
    const result = h.waitingOf('TypeA', 'LIFO');
    expect(result).toHaveLength(2);
    expect(result.every(e => e.type === 'TypeA')).toBe(true);
    expect(result[0].id).toBe(22);  // LIFO: latest TypeA arrival
    expect(result[1].id).toBe(20);
  });

  test('filter excludes non-matching types before PRIORITY sort is applied', () => {
    // TypeA: two entities, priority 3 and 1.
    // TypeB: one entity, priority 0 (better than any TypeA, but wrong type).
    // PRIORITY on TypeA should return priority=1 first, NOT the TypeB entity.
    const mixed = [
      { id: 30, type: 'TypeA', role: 'customer', status: 'waiting', arrivalTime: 5,  attrs: { priority: 3 } },
      { id: 31, type: 'TypeB', role: 'customer', status: 'waiting', arrivalTime: 3,  attrs: { priority: 0 } },
      { id: 32, type: 'TypeA', role: 'customer', status: 'waiting', arrivalTime: 10, attrs: { priority: 1 } },
    ];
    const h = makeHelpers(mixed);
    const result = h.waitingOf('TypeA', 'PRIORITY');
    expect(result).toHaveLength(2);
    expect(result.every(e => e.type === 'TypeA')).toBe(true);
    expect(result[0].id).toBe(32);  // priority=1 is best among TypeA
    expect(result[1].id).toBe(30);
  });
});
