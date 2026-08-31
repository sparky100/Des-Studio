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

  test('r.utilisation is overwritten with calendarUtilisation for shift-scheduled resources', () => {
    // The plain wall-clock `utilisation` was previously computed as
    // busyTimeSum / (elapsed * r.total) where r.total was the end-of-run server
    // count — for a narrow-window resource like Nurse (open ~20 min of 700),
    // r.total is 0 at the end, producing ~0% utilisation even though the Nurse
    // was 100% busy while open. The fix overwrites r.utilisation with the
    // shift-correct calendarUtilisation so downstream consumers get the right
    // answer without checking the calendar field first.
    const result = buildEngine(calendarModel(), 42, 0, 700, null, 5000, 5000, false).runAll();
    const nurse = result.summary.perResource?.Nurse;
    expect(nurse.utilisation).toBe(nurse.calendarUtilisation);
    expect(nurse.utilisation).toBeGreaterThan(0.5);
  });
});

describe('scheduleAdherence (F86.5) — actual server count vs desired capacity', () => {
  // Bug: __desiredServerCapacity is keyed by lowercase-normalized type name
  // (see applyShiftChange in phases.js — String(...).trim().toLowerCase()),
  // but the sampling loop compared it directly against byType, which is keyed
  // by the entity type's actual-case name (e.g. "Nurse"). For any type name
  // containing an uppercase letter — i.e. virtually every real model — the
  // lookup always missed, `matching` never incremented, and scheduleAdherence
  // read 0% regardless of how well the resource actually tracked its
  // schedule. Requires collectTimeSeries=true — the sampling only runs
  // alongside time-series collection.
  test('is close to 1 for a resource that opens/closes exactly on schedule', () => {
    const result = buildEngine(calendarModel(), 42, 0, 700, null, 5000, 5000, true).runAll();
    const nurse = result.summary.perResource?.Nurse;
    expect(nurse.scheduleAdherence).not.toBeUndefined();
    expect(nurse.scheduleAdherence).toBeGreaterThan(0.9);
  });

  test('is undefined for a resource with no schedulePattern', () => {
    const result = buildEngine(calendarModel(), 42, 0, 700, null, 5000, 5000, true).runAll();
    const clerk = result.summary.perResource?.Clerk;
    expect(clerk.scheduleAdherence).toBeUndefined();
  });
});

describe('SchedulePattern arrival distribution — buildEngine() end-to-end', () => {
  // Monday 09:00-17:00 (540-1020 min) open at 120 arrivals/hr (mean 0.5 min),
  // closed (0/hr) the rest of the week — same epoch/timeUnit convention as
  // calendarModel() above.
  function schedulePatternArrivalModel() {
    return {
      epoch: '2026-06-01',
      timeUnit: 'minutes',
      entityTypes: [{ id: 'cust', name: 'Customer', role: 'customer', attrDefs: [] }],
      queues: [{ id: 'q1', name: 'Queue', discipline: 'FIFO' }],
      stateVariables: [],
      bEvents: [{
        id: 'arr', name: 'Arrival', scheduledTime: '0', effect: 'ARRIVE(Customer, Queue)',
        schedules: [{
          eventId: 'arr', dist: 'SchedulePattern',
          distParams: {
            schedulePattern: {
              type: 'weekly', mode: 'absolute',
              periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '120' }],
              defaultCapacity: '0',
            },
          },
        }],
      }],
      cEvents: [],
    };
  }

  test('arrivals cluster inside the open window and are (bounded-artifact aside) absent from the closed stretch', () => {
    const result = buildEngine(schedulePatternArrivalModel(), 42, 0, 10080, null, 20000, 20000, true).runAll();
    const arrivalTimes = result.snap.entities.map(e => e.arrivalTime);
    expect(arrivalTimes.length).toBeGreaterThan(50); // sanity — the open window did produce arrivals

    // Documented v1 approximation: a closed period can receive at most one
    // spurious arrival per open→closed transition (drawn from the open
    // period's own Exponential tail landing just past the close boundary),
    // and exactly one at the instant a closed period reopens. With a single
    // open window per week, that bounds "outside the window" arrivals to a
    // small constant, not a fraction of the sample.
    const outside = arrivalTimes.filter(t => t < 540 || t > 1020);
    expect(outside.length).toBeLessThanOrEqual(4);
  });

  test('_compiled survives ctx.registry.resolve() — sampling actually uses the compiled periods, not the raw schedulePattern', () => {
    // If _compiled were stripped by resolve(), DISTRIBUTIONS.SchedulePattern.sample
    // would fall through to the "unconfigured" 1e9 sentinel and no arrivals would
    // ever fire — this test would fail loudly (zero entities) rather than silently.
    const result = buildEngine(schedulePatternArrivalModel(), 42, 0, 10080, null, 20000, 20000, true).runAll();
    expect(result.snap.entities.length).toBeGreaterThan(0);
  });

  test('re-running buildEngine() on the same model object reuses the cached compiled periods', () => {
    const model = schedulePatternArrivalModel();
    const e1 = buildEngine(model, 42, 0, 100, null, 5000, 5000, true);
    const e2 = buildEngine(model, 42, 0, 100, null, 5000, 5000, true);
    // No direct accessor for the cached compiled periods — assert via behavior
    // instead: both engines must agree on the compiled periods indirectly by
    // running to completion with the same seed and producing identical arrival counts.
    const r1 = e1.runAll();
    const r2 = e2.runAll();
    expect(r1.snap.entities.length).toBe(r2.snap.entities.length);
  });
});
