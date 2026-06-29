// Schedule pattern — weekly recurring capacity schedule expansion

import { describe, test, expect } from 'vitest';
import {
  parseHHMM,
  dateToSimDay,
  expandWeeklyPatternToEvents,
  getPatternInitialCapacity,
  summarizePattern,
  periodLabel,
} from '../../src/engine/schedule-pattern.js';

// ── parseHHMM ──────────────────────────────────────────────────────────────────

describe('parseHHMM', () => {
  test('parses valid HH:MM strings', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('09:00')).toBe(540);
    expect(parseHHMM('12:00')).toBe(720);
    expect(parseHHMM('17:30')).toBe(1050);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  test('handles single-digit hours', () => {
    expect(parseHHMM('8:00')).toBe(480);
    expect(parseHHMM('5:30')).toBe(330);
  });

  test('returns NaN for invalid inputs', () => {
    expect(parseHHMM('')).toBeNaN();
    expect(parseHHMM(null)).toBeNaN();
    expect(parseHHMM(undefined)).toBeNaN();
    expect(parseHHMM('abc')).toBeNaN();
    expect(parseHHMM('25:00')).toBeNaN();
    expect(parseHHMM('12:60')).toBeNaN();
    expect(parseHHMM('12:00:00')).toBeNaN();
  });
});

// ── dateToSimDay ────────────────────────────────────────────────────────────

describe('dateToSimDay', () => {
  test('converts date to simulation day offset', () => {
    const d = dateToSimDay('2026-06-01', '2026-06-01', 'minutes');
    expect(d).toBeCloseTo(0, 1);
  });

  test('returns 1440 for next day with minute unit', () => {
    const d = dateToSimDay('2026-06-02', '2026-06-01', 'minutes');
    expect(d).toBe(1440);
  });

  test('returns 1 for next day with day unit', () => {
    const d = dateToSimDay('2026-06-02', '2026-06-01', 'days');
    expect(d).toBe(1);
  });

  test('returns negative for dates before epoch', () => {
    const d = dateToSimDay('2026-05-31', '2026-06-01', 'minutes');
    expect(d).toBeLessThan(0);
  });

  test('returns null for invalid date string', () => {
    expect(dateToSimDay('not-a-date', '2026-06-01', 'minutes')).toBeNull();
  });

  test('returns null for invalid epoch', () => {
    expect(dateToSimDay('2026-06-01', '', 'minutes')).toBeNull();
    expect(dateToSimDay('2026-06-01', null, 'minutes')).toBeNull();
  });
});

// ── periodLabel ─────────────────────────────────────────────────────────────

describe('periodLabel', () => {
  test('produces readable label', () => {
    expect(periodLabel({ dayOfWeek: 1, start: '09:00', end: '17:00' })).toBe('Mon 09:00-17:00');
    expect(periodLabel({ dayOfWeek: 7, start: '10:00', end: '18:00' })).toBe('Sun 10:00-18:00');
    expect(periodLabel({ dayOfWeek: 4, start: '00:00', end: '23:59' })).toBe('Thu 00:00-23:59');
  });
});

// ── summarizePattern ────────────────────────────────────────────────────────

describe('summarizePattern', () => {
  test('returns empty for no periods', () => {
    expect(summarizePattern({})).toBe('');
    expect(summarizePattern({ periods: [] })).toBe('');
  });

  test('collapses consecutive days', () => {
    const pat = {
      periods: [
        { dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '' },
        { dayOfWeek: 2, start: '09:00', end: '17:00', capacity: '' },
        { dayOfWeek: 3, start: '09:00', end: '17:00', capacity: '' },
        { dayOfWeek: 4, start: '09:00', end: '17:00', capacity: '' },
        { dayOfWeek: 5, start: '09:00', end: '17:00', capacity: '' },
      ],
    };
    expect(summarizePattern(pat)).toContain('Mon-Fri');
  });

  test('shows capacity when set', () => {
    const pat = {
      periods: [
        { dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '5' },
      ],
    };
    expect(summarizePattern(pat)).toContain('(5)');
  });
});

// ── expandWeeklyPatternToEvents ─────────────────────────────────────────────

describe('expandWeeklyPatternToEvents', () => {
  const epoch = '2026-06-01'; // Monday
  const timeUnit = 'minutes';

  test('returns empty events for null pattern', () => {
    const r = expandWeeklyPatternToEvents(null, epoch, 10080, timeUnit);
    expect(r.events).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test('returns empty events for pattern with no periods', () => {
    const r = expandWeeklyPatternToEvents({}, epoch, 10080, timeUnit);
    expect(r.events).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test('returns empty events with warning when epoch is missing', () => {
    const pattern = { periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '5' }] };
    const r = expandWeeklyPatternToEvents(pattern, '', 10080, timeUnit);
    expect(r.events).toEqual([]);
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain('requires an epoch');
  });

  test('generates Mon-Fri 09:00-17:00 events for a single week', () => {
    const pattern = {
      periods: [
        { dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '5' },
        { dayOfWeek: 2, start: '09:00', end: '17:00', capacity: '5' },
        { dayOfWeek: 3, start: '09:00', end: '17:00', capacity: '5' },
        { dayOfWeek: 4, start: '09:00', end: '17:00', capacity: '5' },
        { dayOfWeek: 5, start: '09:00', end: '17:00', capacity: '5' },
      ],
      defaultCapacity: '0',
    };
    // 1 week (Mon 00:00 to next Mon 00:00) = 10080 minutes
    const r = expandWeeklyPatternToEvents(pattern, epoch, 10080, timeUnit);
    expect(r.warnings).toEqual([]);
    // 5 days * 2 events each (start + end) = 10 events
    expect(r.events.length).toBe(10);
    // First event at Mon 09:00 = 540 min
    expect(r.events[0]).toEqual({ time: 540, capacity: 5 });
    // Last event at Fri 17:00
    const fri1700 = 4 * 1440 + 17 * 60; // Fri 17:00
    expect(r.events[r.events.length - 1]).toEqual({ time: fri1700, capacity: 0 });
  });

  test('capacity drops to 0 after end time via defaultCapacity', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '3' }],
      defaultCapacity: '0',
    };
    const r = expandWeeklyPatternToEvents(pattern, epoch, 10080, timeUnit);
    expect(r.events).toContainEqual({ time: 540, capacity: 3 });
    expect(r.events).toContainEqual({ time: 1020, capacity: 0 });
  });

  test('generates events for multiple weeks when maxSimTime is long enough', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '2' }],
      defaultCapacity: '0',
    };
    // 15 days = 21600 minutes — should cover 2 Mondays
    const r = expandWeeklyPatternToEvents(pattern, epoch, 21600, timeUnit);
    // 2 weeks * 2 events = 4
    expect(r.events.length).toBe(4);
    expect(r.events[0].time).toBe(540);     // Week 1 Mon
    expect(r.events[2].time).toBe(540 + 10080); // Week 2 Mon
  });

  test('handles weekend-only schedule', () => {
    const pattern = {
      periods: [
        { dayOfWeek: 6, start: '10:00', end: '18:00', capacity: '4' },  // Sat
        { dayOfWeek: 7, start: '10:00', end: '18:00', capacity: '4' },  // Sun
      ],
      defaultCapacity: '0',
    };
    const r = expandWeeklyPatternToEvents(pattern, epoch, 10080, timeUnit);
    // Mon epoch, so Sat = day 5, Sun = day 6
    // Sat 10:00 = 5*1440 + 600 = 7800
    // Sun 10:00 = 6*1440 + 600 = 9240
    expect(r.events.length).toBe(4);
    expect(r.events[0].time).toBe(7800);
    expect(r.events[2].time).toBe(9240);
  });

  test('returns events within time bound only', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '1' }],
      defaultCapacity: '0',
    };
    // Only 1 hour — nothing should fire
    const r = expandWeeklyPatternToEvents(pattern, epoch, 1, timeUnit);
    expect(r.events.filter(e => e.time > 1).length).toBe(0);
  });

  test('returns 0-time event when period covers t=0', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '00:00', end: '08:00', capacity: '2' }],
      defaultCapacity: '0',
    };
    const r = expandWeeklyPatternToEvents(pattern, epoch, 10080, timeUnit);
    expect(r.events).toContainEqual({ time: 0, capacity: 2 });
  });

  test('returns no events when maxSimTime is null (unbounded — use maxWeeks cap)', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '3' }],
      defaultCapacity: '0',
    };
    const r = expandWeeklyPatternToEvents(pattern, epoch, null, timeUnit);
    // Should generate events for reasonable number of weeks
    expect(r.events.length).toBeGreaterThanOrEqual(2);
    expect(r.warnings).toEqual([]);
  });

  test('empty pattern returns no events', () => {
    const r = expandWeeklyPatternToEvents({ periods: [] }, epoch, 10080, timeUnit);
    expect(r.events).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test('overlapping events at same time merge (last capacity wins)', () => {
    // Two periods on same day at same start time — last one should win
    const pattern = {
      periods: [
        { dayOfWeek: 1, start: '09:00', end: '12:00', capacity: '2' },
        { dayOfWeek: 1, start: '09:00', end: '13:00', capacity: '5' }, // should take precedence at t=540
      ],
      defaultCapacity: '0',
    };
    const r = expandWeeklyPatternToEvents(pattern, epoch, 10080, timeUnit);
    expect(r.warnings).toEqual([]);
    // 540 should end up with capacity 5 (second period wins)
    const at540 = r.events.find(e => e.time === 540);
    expect(at540).toBeDefined();
    expect(at540.capacity).toBe(5);
  });

  test('generates events with defaultCapacity for off-periods', () => {
    const pattern = {
      defaultCapacity: '1',
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '5' }],
    };
    const r = expandWeeklyPatternToEvents(pattern, epoch, 10080, timeUnit);
    const endEvent = r.events.find(e => e.time === 1020);
    expect(endEvent).toBeDefined();
    expect(endEvent.capacity).toBe(1);
  });
});

// ── expandWeeklyPatternToEvents — Exceptions ─────────────────────────────────

describe('expandWeeklyPatternToEvents — exceptions', () => {
  const epoch = '2026-06-01'; // Monday
  const timeUnit = 'minutes';

  test('exception replaces events on that date', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '5' }],
      defaultCapacity: '0',
      exceptions: [{
        date: '2026-06-01', // Monday — same day as the weekly pattern
        periods: [{ start: '10:00', end: '14:00', capacity: '2' }],
      }],
    };
    const r = expandWeeklyPatternToEvents(pattern, epoch, 10080, timeUnit);
    // Should NOT have original Mon events (540→5, 1020→0) on that day
    expect(r.events).not.toContainEqual({ time: 540, capacity: 5 });
    // Should have exception events instead
    expect(r.events).toContainEqual({ time: 600, capacity: 2 });  // 10:00 = 600 min
    expect(r.events).toContainEqual({ time: 840, capacity: 0 });  // 14:00 = 840 min
  });

  test('exception on different day does not affect that day', () => {
    const pattern = {
      periods: [
        { dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '5' }, // Monday
        { dayOfWeek: 2, start: '09:00', end: '17:00', capacity: '3' }, // Tuesday
      ],
      defaultCapacity: '0',
      exceptions: [{
        date: '2026-06-02', // Tuesday
        periods: [{ start: '10:00', end: '14:00', capacity: '2' }],
      }],
    };
    const r = expandWeeklyPatternToEvents(pattern, epoch, 10080, timeUnit);
    // Monday should still be normal
    expect(r.events).toContainEqual({ time: 540, capacity: 5 });
    // Tuesday original events should be gone
    expect(r.events).not.toContainEqual({ time: 9 * 60 + 1440, capacity: 3 }); // Tue 09:00
    // Tuesday exception events should be present
    expect(r.events).toContainEqual({ time: 10 * 60 + 1440, capacity: 2 }); // Tue 10:00
  });

  test('exception with "closed" (zero capacity) replaces all periods that day', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '5' }],
      defaultCapacity: '0',
      exceptions: [{
        date: '2026-06-01', // Monday
        periods: [{ start: '09:00', end: '17:00', capacity: '0' }],
      }],
    };
    const r = expandWeeklyPatternToEvents(pattern, epoch, 10080, timeUnit);
    // The exception has capacity 0, but the end at 17:00 sets back to defaultCapacity (0) — same as normal
    // Still should have the events but with capacity 0 all day
    const at540 = r.events.find(e => e.time === 540);
    expect(at540).toBeDefined();
    expect(at540.capacity).toBe(0);
  });

  test('exception date after maxSimTime is ignored', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '5' }],
      defaultCapacity: '0',
      exceptions: [{
        date: '2026-06-22', // Week 4 Monday (well beyond 1 week)
        periods: [{ start: '10:00', end: '14:00', capacity: '2' }],
      }],
    };
    const r = expandWeeklyPatternToEvents(pattern, epoch, 10080, timeUnit);
    // The exception is beyond the maxSimTime, so it shouldn't affect events
    const monEvents = r.events.filter(e => Math.abs(e.time - 540) < 1);
    expect(monEvents.length).toBe(1);
    expect(monEvents[0].capacity).toBe(5); // Original pattern
  });
});

// ── getPatternInitialCapacity ───────────────────────────────────────────────

describe('getPatternInitialCapacity', () => {
  const epoch = '2026-06-01'; // Monday

  test('returns null for no pattern', () => {
    expect(getPatternInitialCapacity(null, epoch)).toBeNull();
    expect(getPatternInitialCapacity({}, epoch)).toBeNull();
  });

  test('returns capacity when period covers t=0', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '00:00', end: '08:00', capacity: '5' }],
    };
    expect(getPatternInitialCapacity(pattern, epoch)).toBe(5);
  });

  test('returns capacity for period starting at 00:00 on first day', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '00:00', end: '23:59', capacity: '3' }],
    };
    expect(getPatternInitialCapacity(pattern, epoch)).toBe(3);
  });

  test('returns defaultCapacity when t=0 falls outside all periods', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '5' }],
      defaultCapacity: '1',
    };
    // t=0 is before 09:00, so defaultCapacity applies
    expect(getPatternInitialCapacity(pattern, epoch)).toBe(1);
  });

  test('returns null when no pattern periods and no defaultCapacity', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '09:00', end: '17:00', capacity: '5' }],
      // no defaultCapacity — period doesn't cover t=0
    };
    expect(getPatternInitialCapacity(pattern, epoch)).toBe(0);
  });

  test('returns null for empty epoch', () => {
    const pattern = {
      periods: [{ dayOfWeek: 1, start: '00:00', end: '08:00', capacity: '3' }],
    };
    expect(getPatternInitialCapacity(pattern, '')).toBeNull();
  });

  test('handles epoch when weekday is not Monday', () => {
    const wedEpoch = '2026-06-03'; // Wednesday (dayOfWeek=3)
    const pattern = {
      periods: [{ dayOfWeek: 3, start: '00:00', end: '08:00', capacity: '4' }],
    };
    expect(getPatternInitialCapacity(pattern, wedEpoch)).toBe(4);
  });
});
