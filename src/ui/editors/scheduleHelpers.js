// ui/editors/scheduleHelpers.js
// Pure helpers for schedule import and event-link management.
// Extracted from ScheduleManager.jsx so they can be unit-tested independently.

/**
 * Merge imported rows into a scheduleJson array.
 *
 * If an entry for targetEventId already exists its rows are replaced in-place.
 * Otherwise a new entry is appended.
 *
 * @param {Array|null} scheduleJson  Existing [{ eventId, rows }, ...]
 * @param {string}     targetEventId
 * @param {Array}      rows          Parsed rows [{ time, attrs }, ...]
 * @returns {Array}    New scheduleJson (original is never mutated)
 */
export function mergeScheduleRows(scheduleJson, targetEventId, rows) {
  const existing = scheduleJson ?? [];
  if (existing.some(e => e.eventId === targetEventId)) {
    return existing.map(e => e.eventId === targetEventId ? { ...e, rows } : e);
  }
  return [...existing, { eventId: targetEventId, rows }];
}

/**
 * Link a bEvent to a named schedule.
 *
 * Sets scheduleRef on the bEvent's first schedule entry and clears any
 * existing inline rows[] to avoid duplicate data.
 *
 * @param {Array}  bEvents
 * @param {string} bEventId
 * @param {string} scheduleId  UUID of the model_schedules row
 * @returns {Array} New bEvents array (original is never mutated)
 */
export function linkBEventToSchedule(bEvents, bEventId, scheduleId) {
  return bEvents.map(be => be.id !== bEventId ? be : {
    ...be,
    schedules: (be.schedules || []).map((s, i) =>
      i === 0 ? { ...s, scheduleRef: scheduleId, rows: [] } : s
    ),
  });
}

/**
 * Remove a scheduleRef link from a bEvent's schedule entries.
 *
 * Only entries whose scheduleRef matches scheduleId are affected.
 *
 * @param {Array}  bEvents
 * @param {string} bEventId
 * @param {string} scheduleId
 * @returns {Array} New bEvents array (original is never mutated)
 */
export function unlinkBEventFromSchedule(bEvents, bEventId, scheduleId) {
  return bEvents.map(be => be.id !== bEventId ? be : {
    ...be,
    schedules: (be.schedules || []).map(s => {
      if (s.scheduleRef !== scheduleId) return s;
      const { scheduleRef: _, ...rest } = s;
      return rest;
    }),
  });
}
