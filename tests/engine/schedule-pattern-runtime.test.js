// tests/engine/schedule-pattern-runtime.test.js — weekly schedulePattern actually
// closing a resource at runtime (applyShiftChange capacity-0 fix), and the
// calendar-aware `calendarUtilisation` summary field.
import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

// Monday 2026-06-01, minutes time unit (matches tests/engine/schedule-pattern.test.js).
// Nurse is open Monday 09:00-09:20 (540-560 min) capacity 2, closed otherwise.
// Clerk has no schedulePattern — always on, capacity 1 — used as the "unaffected"
// control for the new calendarUtilisation field.
function calendarModel() {
  return {
    epoch: '2026-06-01',
    timeUnit: 'minutes',
    entityTypes: [
      { id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] },
      {
        id: 'nurse', name: 'Nurse', role: 'server', count: '0', attrDefs: [],
        schedulePattern: {
          type: 'weekly',
          mode: 'absolute',
          periods: [{ dayOfWeek: 1, start: '09:00', end: '09:20', capacity: '2' }],
          defaultCapacity: '0',
        },
      },
      { id: 'clerk', name: 'Clerk', role: 'server', count: '1', attrDefs: [] },
    ],
    queues: [
      { id: 'q-nurse', name: 'NurseQueue', discipline: 'FIFO' },
      { id: 'q-clerk', name: 'ClerkQueue', discipline: 'FIFO' },
    ],
    stateVariables: [],
    bEvents: [
      { id: 'arr-nurse', name: 'Arrive (Nurse)', scheduledTime: '0', effect: 'ARRIVE(Customer, NurseQueue)',
        schedules: [{ eventId: 'arr-nurse', dist: 'fixed', distParams: { value: '3' } }] },
      { id: 'arr-clerk', name: 'Arrive (Clerk)', scheduledTime: '0', effect: 'ARRIVE(Customer, ClerkQueue)',
        schedules: [{ eventId: 'arr-clerk', dist: 'fixed', distParams: { value: '3' } }] },
      { id: 'done-nurse', name: 'Nurse Service Complete', scheduledTime: '9999', effect: 'RELEASE(Nurse)', schedules: [] },
      { id: 'done-clerk', name: 'Clerk Service Complete', scheduledTime: '9999', effect: 'RELEASE(Clerk)', schedules: [] },
    ],
    cEvents: [
      {
        id: 'ce-nurse', name: 'Assign Nurse', priority: 1,
        condition: 'queue(NurseQueue).length > 0 AND idle(Nurse).count > 0',
        effect: 'ASSIGN(NurseQueue, Nurse)',
        cSchedules: [{ eventId: 'done-nurse', dist: 'fixed', distParams: { value: '4' }, useEntityCtx: true }],
      },
      {
        id: 'ce-clerk', name: 'Assign Clerk', priority: 2,
        condition: 'queue(ClerkQueue).length > 0 AND idle(Clerk).count > 0',
        effect: 'ASSIGN(ClerkQueue, Clerk)',
        cSchedules: [{ eventId: 'done-clerk', dist: 'fixed', distParams: { value: '2' }, useEntityCtx: true }],
      },
    ],
  };
}

describe('weekly schedulePattern — capacity-0 close actually retires servers', () => {
  test('Nurse population is 0 before open, 2 while open, and back to 0 after close', () => {
    const result = buildEngine(calendarModel(), 42, 0, 700, null, 5000, 5000, true).runAll();
    const entries = result.timeSeries;
    expect(Array.isArray(entries) && entries.length).toBeTruthy();

    const nurseTotalAt = t => entries.filter(e => e.t <= t).at(-1)?.byType?.Nurse?.total ?? 0;

    // Before the Monday 09:00 open event, Nurse has never been created.
    expect(nurseTotalAt(500)).toBe(0);

    // Comfortably inside the 540-560 open window, capacity should be 2.
    const duringOpen = entries.find(e => e.t >= 545 && e.t <= 559 && e.byType?.Nurse);
    expect(duringOpen?.byType.Nurse.total).toBe(2);

    // Well after the 09:20 close (with enough buffer for any in-flight service
    // to finish), population must have dropped back to 0. Before the
    // applyShiftChange fix, capacity-0 close events were silently ignored and
    // this would still read 2.
    expect(nurseTotalAt(650)).toBe(0);

    // Clerk has no schedulePattern — always on, unaffected by the calendar.
    expect(nurseTotalAt(650)).toBe(0);
    const lastEntry = entries.at(-1);
    expect(lastEntry.byType.Clerk.total).toBe(1);
  });
});

describe('calendarUtilisation — calendar-aware overall utilisation', () => {
  test('is defined and within [0,1] for a resource with a weekly schedulePattern', () => {
    const result = buildEngine(calendarModel(), 42, 0, 700, null, 5000, 5000, false).runAll();
    const nurse = result.summary.perResource?.Nurse;
    expect(nurse).toBeDefined();
    expect(nurse.calendarUtilisation).not.toBeUndefined();
    expect(nurse.calendarUtilisation).toBeGreaterThanOrEqual(0);
    expect(nurse.calendarUtilisation).toBeLessThanOrEqual(1);
  });

  test('is undefined for a resource with no schedulePattern', () => {
    const result = buildEngine(calendarModel(), 42, 0, 700, null, 5000, 5000, false).runAll();
    const clerk = result.summary.perResource?.Clerk;
    expect(clerk).toBeDefined();
    expect(clerk.calendarUtilisation).toBeUndefined();
  });

  test('is materially higher than the plain wall-clock utilisation for a narrow-window resource', () => {
    // Nurse is only open ~20 of the 700 simulated minutes. The plain `utilisation`
    // field divides busy time by the full 700-minute wall clock, which drastically
    // understates how busy Nurse actually was while open — calendarUtilisation
    // divides by open-hours-only capacity-time instead and should read much higher.
    const result = buildEngine(calendarModel(), 42, 0, 700, null, 5000, 5000, false).runAll();
    const nurse = result.summary.perResource?.Nurse;
    expect(nurse.calendarUtilisation).toBeGreaterThan(nurse.utilisation);
  });
});
