// ui/editors/scheduleHelpers.js
// Pure helpers for schedule import and event-link management.
// Extracted from ScheduleManager.jsx so they can be unit-tested independently.

function effectText(effect) {
  return Array.isArray(effect) ? effect.filter(Boolean).join(";") : String(effect || "");
}

/**
 * Returns true when a B-event is an arrival source.
 *
 * Schedule linking is primarily relevant for arrival events because timetable
 * rows drive ARRIVE() re-firing. Treating them as first-class candidates keeps
 * them visible in the Schedules tab even before a scheduleRef exists.
 *
 * @param {object} bEvent
 * @returns {boolean}
 */
export function isArrivalBEvent(bEvent) {
  return /ARRIVE\s*\(/i.test(effectText(bEvent?.effect));
}

/**
 * Partition B-events into linked/unlinked candidates for a named schedule.
 *
 * The Schedules view should keep arrival B-events visible even when they start
 * with empty rows[] and no scheduleRef, because that is the normal post-import
 * shape for large companion CSV models.
 *
 * @param {Array}  bEvents
 * @param {string} scheduleId
 * @param {Array}  scheduleJson
 * @returns {{ linked: Array, unlinked: Array }}
 */
export function partitionScheduleBEvents(bEvents, scheduleId, scheduleJson = []) {
  const linked = [];
  const unlinked = [];
  const scheduleEventIds = new Set(
    (scheduleJson || [])
      .map(entry => String(entry?.eventId || "").trim().toLowerCase())
      .filter(Boolean)
  );

  for (const bEvent of bEvents || []) {
    const schedules = bEvent?.schedules || [];
    const linkedToSchedule = schedules.some(s => s.scheduleRef === scheduleId);
    const hasScheduleLikeEntry = schedules.some(s =>
      s.scheduleRef ||
      s.dist === "Schedule" ||
      (Array.isArray(s.rows) && s.rows.length > 0)
    );
    const idMatch = scheduleEventIds.has(String(bEvent?.id || "").trim().toLowerCase());
    const nameMatch = scheduleEventIds.has(String(bEvent?.name || "").trim().toLowerCase());
    const relevant = linkedToSchedule || idMatch || nameMatch || hasScheduleLikeEntry || isArrivalBEvent(bEvent);

    if (!relevant) continue;
    (linkedToSchedule ? linked : unlinked).push(bEvent);
  }

  return { linked, unlinked };
}

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
    schedules: (() => {
      const existing = be.schedules || [];
      if (existing.length === 0) {
        // bEvent has no schedule entry yet — create one
        return [{ eventId: be.id, scheduleRef: scheduleId, rows: [] }];
      }
      return existing.map((s, i) =>
        i === 0 ? { ...s, eventId: s.eventId ?? be.id, scheduleRef: scheduleId, rows: [] } : s
      );
    })(),
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
