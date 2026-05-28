// tests/ui/editors/schedule-helpers.test.js
//
// Unit tests for pure schedule helper functions (ADR-016).
// Covers: mergeScheduleRows, linkBEventToSchedule, unlinkBEventFromSchedule

import { describe, it, expect } from 'vitest';
import {
  mergeScheduleRows,
  linkBEventToSchedule,
  unlinkBEventFromSchedule,
} from '../../../src/ui/editors/scheduleHelpers.js';

const SCHED_ID  = 'sched-aaaa-0000-0000-000000000001';
const EVENT_ID  = 'b_patient_arrival';
const OTHER_ID  = 'b_other_event';

const ROWS_A = [{ time: 480, attrs: { type: 'routine' } }];
const ROWS_B = [{ time: 600, attrs: { type: 'urgent' } }];

// ── mergeScheduleRows ─────────────────────────────────────────────────────────

describe('mergeScheduleRows', () => {
  it('appends a new entry when scheduleJson is empty', () => {
    const result = mergeScheduleRows([], EVENT_ID, ROWS_A);
    expect(result).toEqual([{ eventId: EVENT_ID, rows: ROWS_A }]);
  });

  it('appends when scheduleJson is null', () => {
    const result = mergeScheduleRows(null, EVENT_ID, ROWS_A);
    expect(result).toEqual([{ eventId: EVENT_ID, rows: ROWS_A }]);
  });

  it('appends when eventId is not yet present', () => {
    const existing = [{ eventId: OTHER_ID, rows: ROWS_B }];
    const result = mergeScheduleRows(existing, EVENT_ID, ROWS_A);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ eventId: EVENT_ID, rows: ROWS_A });
  });

  it('replaces rows for an existing eventId', () => {
    const existing = [{ eventId: EVENT_ID, rows: ROWS_A }];
    const newRows = [{ time: 540, attrs: { type: 'emergency' } }];
    const result = mergeScheduleRows(existing, EVENT_ID, newRows);
    expect(result).toHaveLength(1);
    expect(result[0].rows).toEqual(newRows);
  });

  it('does not touch other entries when replacing', () => {
    const existing = [
      { eventId: OTHER_ID, rows: ROWS_B },
      { eventId: EVENT_ID, rows: ROWS_A },
    ];
    const newRows = [{ time: 540, attrs: {} }];
    const result = mergeScheduleRows(existing, EVENT_ID, newRows);
    expect(result.find(e => e.eventId === OTHER_ID).rows).toEqual(ROWS_B);
    expect(result.find(e => e.eventId === EVENT_ID).rows).toEqual(newRows);
  });

  it('preserves extra fields on replaced entry', () => {
    const existing = [{ eventId: EVENT_ID, rows: ROWS_A, label: 'keep-me' }];
    const result = mergeScheduleRows(existing, EVENT_ID, ROWS_B);
    expect(result[0].label).toBe('keep-me');
  });

  it('does not mutate the original scheduleJson array', () => {
    const existing = [{ eventId: EVENT_ID, rows: ROWS_A }];
    const snapshot = JSON.stringify(existing);
    mergeScheduleRows(existing, EVENT_ID, ROWS_B);
    expect(JSON.stringify(existing)).toBe(snapshot);
  });

  it('handles an import of zero rows (clearing a schedule entry)', () => {
    const existing = [{ eventId: EVENT_ID, rows: ROWS_A }];
    const result = mergeScheduleRows(existing, EVENT_ID, []);
    expect(result[0].rows).toEqual([]);
  });
});

// ── linkBEventToSchedule ──────────────────────────────────────────────────────

describe('linkBEventToSchedule', () => {
  const makeBEvents = () => [
    { id: EVENT_ID, schedules: [{ dist: 'Schedule', distParams: {} }] },
    { id: OTHER_ID, schedules: [{ dist: 'Exponential', distParams: { mean: 5 } }] },
  ];

  it('sets scheduleRef on the first schedule entry of the target bEvent', () => {
    const result = linkBEventToSchedule(makeBEvents(), EVENT_ID, SCHED_ID);
    expect(result.find(b => b.id === EVENT_ID).schedules[0].scheduleRef).toBe(SCHED_ID);
  });

  it('clears inline rows on the linked entry', () => {
    const withRows = [{ id: EVENT_ID, schedules: [{ dist: 'Schedule', rows: [{ time: 10, attrs: {} }] }] }];
    const result = linkBEventToSchedule(withRows, EVENT_ID, SCHED_ID);
    expect(result[0].schedules[0].rows).toEqual([]);
  });

  it('preserves dist and other fields on the linked entry', () => {
    const result = linkBEventToSchedule(makeBEvents(), EVENT_ID, SCHED_ID);
    expect(result.find(b => b.id === EVENT_ID).schedules[0].dist).toBe('Schedule');
  });

  it('does not modify bEvents that are not the target', () => {
    const original = makeBEvents();
    const result = linkBEventToSchedule(original, EVENT_ID, SCHED_ID);
    expect(result.find(b => b.id === OTHER_ID)).toEqual(original[1]);
  });

  it('only modifies the first schedule entry (index 0)', () => {
    const multi = [{ id: EVENT_ID, schedules: [
      { dist: 'Schedule', distParams: {} },
      { dist: 'Exponential', distParams: { mean: 3 } },
    ]}];
    const result = linkBEventToSchedule(multi, EVENT_ID, SCHED_ID);
    expect(result[0].schedules[0].scheduleRef).toBe(SCHED_ID);
    expect(result[0].schedules[1].scheduleRef).toBeUndefined();
  });

  it('handles bEvent with empty schedules array without crashing', () => {
    const empty = [{ id: EVENT_ID, schedules: [] }];
    const result = linkBEventToSchedule(empty, EVENT_ID, SCHED_ID);
    expect(result[0].schedules).toEqual([]);
  });

  it('does not mutate the original bEvents array', () => {
    const original = makeBEvents();
    const snapshot = JSON.stringify(original);
    linkBEventToSchedule(original, EVENT_ID, SCHED_ID);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

// ── unlinkBEventFromSchedule ──────────────────────────────────────────────────

describe('unlinkBEventFromSchedule', () => {
  const makeLinked = () => [
    { id: EVENT_ID, schedules: [{ dist: 'Schedule', scheduleRef: SCHED_ID, rows: [] }] },
    { id: OTHER_ID, schedules: [{ dist: 'Exponential', distParams: { mean: 5 } }] },
  ];

  it('removes scheduleRef from the matching entry', () => {
    const result = unlinkBEventFromSchedule(makeLinked(), EVENT_ID, SCHED_ID);
    expect(result.find(b => b.id === EVENT_ID).schedules[0].scheduleRef).toBeUndefined();
  });

  it('preserves dist and other fields on the unlinked entry', () => {
    const result = unlinkBEventFromSchedule(makeLinked(), EVENT_ID, SCHED_ID);
    expect(result.find(b => b.id === EVENT_ID).schedules[0].dist).toBe('Schedule');
  });

  it('does not touch entries whose scheduleRef does not match', () => {
    const mixed = [{ id: EVENT_ID, schedules: [
      { dist: 'Schedule', scheduleRef: SCHED_ID },
      { dist: 'Schedule', scheduleRef: 'other-sched-uuid' },
    ]}];
    const result = unlinkBEventFromSchedule(mixed, EVENT_ID, SCHED_ID);
    expect(result[0].schedules[0].scheduleRef).toBeUndefined();
    expect(result[0].schedules[1].scheduleRef).toBe('other-sched-uuid');
  });

  it('does not modify bEvents that are not the target', () => {
    const original = makeLinked();
    const result = unlinkBEventFromSchedule(original, EVENT_ID, SCHED_ID);
    expect(result.find(b => b.id === OTHER_ID)).toEqual(original[1]);
  });

  it('is a no-op when the bEvent has no scheduleRef at all', () => {
    const noRef = [{ id: EVENT_ID, schedules: [{ dist: 'Schedule' }] }];
    const result = unlinkBEventFromSchedule(noRef, EVENT_ID, SCHED_ID);
    expect(result[0].schedules[0]).toEqual({ dist: 'Schedule' });
  });

  it('does not mutate the original bEvents array', () => {
    const original = makeLinked();
    const snapshot = JSON.stringify(original);
    unlinkBEventFromSchedule(original, EVENT_ID, SCHED_ID);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('link then unlink round-trips cleanly — no scheduleRef remains', () => {
    const base = [{ id: EVENT_ID, schedules: [{ dist: 'Schedule', distParams: {} }] }];
    const linked   = linkBEventToSchedule(base, EVENT_ID, SCHED_ID);
    const unlinked = unlinkBEventFromSchedule(linked, EVENT_ID, SCHED_ID);
    expect(unlinked[0].schedules[0].scheduleRef).toBeUndefined();
    expect(unlinked[0].schedules[0].dist).toBe('Schedule');
  });
});
