// engine/schedule-pattern.js — Recurring weekly capacity schedule expansion
// Pure functions: deterministic, no side effects, no React/DOM imports.

import { simToWall, wallToSim } from "./clockUtils.js";

export const MS_PER_DAY = 86400000;
export const MS_PER_WEEK = 604800000;

const UNIT_MS = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };

// Cap on how many weeks of a recurring pattern to expand when maxSimTime is null/unbounded
// (a terminationCondition-driven run) — without this, maxWeeks becomes Infinity and the
// per-week loop below never terminates, hanging the engine. ~10 years is far beyond any
// realistic simulation horizon.
const MAX_WEEKS_CAP = 520;

// Parse HH:MM string to minutes from midnight.
// Returns NaN for invalid input.
export function parseHHMM(str) {
  if (str == null) return NaN;
  const parts = String(str).match(/^(\d{1,2}):(\d{2})$/);
  if (!parts) return NaN;
  const hour = Number(parts[1]);
  const minute = Number(parts[2]);
  if (hour > 23 || minute > 59) return NaN;
  return hour * 60 + minute;
}

// Convert a calendar date string (YYYY-MM-DD) to simulation time offset from epoch.
// Returns null if date or epoch is invalid.
export function dateToSimDay(dateStr, epoch, timeUnit = "minutes") {
  if (!dateStr || epoch == null || epoch === "") return null;
  const ms = UNIT_MS[timeUnit] ?? UNIT_MS.minutes;
  const target = new Date(dateStr + "T00:00:00Z");
  if (isNaN(target.getTime())) return null;
  const epochDate = new Date(epoch + "T00:00:00Z");
  if (isNaN(epochDate.getTime())) return null;
  return (target.getTime() - epochDate.getTime()) / ms;
}

// Get the simulation time for a specific day-of-week at HH:MM within a given week.
function periodToSimTime(dayOfWeek, startHHMM, weekOffset, startDayOfWeek, ms, epochMs) {
  const targetDayOffset = ((dayOfWeek - 1) - startDayOfWeek + 7) % 7;
  const dayMs = targetDayOffset * MS_PER_DAY + weekOffset * MS_PER_WEEK;
  const timeMinutes = parseHHMM(startHHMM);
  if (isNaN(timeMinutes)) return null;
  return (dayMs + timeMinutes * 60000) / ms;
}

// Generate a human-readable label for a period.
export function periodLabel(period) {
  const days = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayName = days[period.dayOfWeek] || `Day${period.dayOfWeek}`;
  return `${dayName} ${period.start}-${period.end}`;
}

// Summarise a weekly pattern into a short string (e.g. "Mon-Fri 09:00-17:00").
export function summarizePattern(pattern) {
  if (!pattern?.periods?.length) return "";
  const days = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Group by (start, end, capacity)
  const bySlot = {};
  for (const p of pattern.periods) {
    const key = `${p.start}|${p.end}|${p.capacity}`;
    if (!bySlot[key]) bySlot[key] = [];
    bySlot[key].push(p.dayOfWeek);
  }
  const parts = [];
  for (const [key, dayNums] of Object.entries(bySlot)) {
    dayNums.sort((a, b) => a - b);
    // Collapse consecutive days into ranges
    const ranges = [];
    let rangeStart = dayNums[0];
    let prev = dayNums[0];
    for (let i = 1; i <= dayNums.length; i++) {
      if (i < dayNums.length && dayNums[i] === prev + 1) {
        prev = dayNums[i];
      } else {
        ranges.push(rangeStart === prev ? days[rangeStart] : `${days[rangeStart]}-${days[prev]}`);
        if (i < dayNums.length) { rangeStart = dayNums[i]; prev = dayNums[i]; }
      }
    }
    const [start, end, cap] = key.split("|");
    parts.push(`${ranges.join(",")} ${start}-${end} (${cap})`);
  }
  return parts.join("; ");
}

// Expand a weekly schedule pattern into SHIFT_CHANGE event descriptors.
//
// Returns: { events: Array<{scheduledTime, serverTypeName, newCapacity}>, warnings: string[] }
//
// The caller (buildEngine) wraps each event into the proper FEL event shape and
// merges with manually-defined shiftSchedule events.
export function expandWeeklyPatternToEvents(pattern, epoch, maxSimTime = null, timeUnit = "minutes") {
  const warnings = [];
  if (!pattern?.periods?.length) {
    return { events: [], warnings };
  }
  if (epoch == null || epoch === "") {
    warnings.push("schedulePattern requires an epoch (real-world start date) — skipping pattern expansion");
    return { events: [], warnings };
  }
  const ms = UNIT_MS[timeUnit] ?? UNIT_MS.minutes;
  const epochDate = new Date(epoch);
  if (isNaN(epochDate.getTime())) {
    warnings.push("Invalid epoch date for schedulePattern — skipping pattern expansion");
    return { events: [], warnings };
  }

  // Get the day of the week at simulation time 0 (0=Sun, 1=Mon, ... 6=Sat)
  const startDayOfWeek = epochDate.getDay();
  // Convert to our convention: 0=Mon, 1=Tue, ... 6=Sun
  const startDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const defaultCapacity = pattern.defaultCapacity != null ? Math.max(0, parseInt(pattern.defaultCapacity, 10) || 0) : 0;
  const simWeek = MS_PER_WEEK / ms;
  const simDay = MS_PER_DAY / ms;
  const maxTime = (maxSimTime != null && Number.isFinite(maxSimTime)) ? maxSimTime : Infinity;

  // Phase 1: Generate events from weekly periods
  const rawEvents = [];

  if (maxTime <= 0) {
    // At time 0 only, generate the initial capacity event
    for (const period of pattern.periods) {
      const startTime = periodToSimTime(period.dayOfWeek, period.start, 0, startDay, ms, epochDate.getTime());
      if (startTime == null) continue;
      if (startTime <= maxTime + 1e-9) {
        rawEvents.push({ time: Math.max(0, startTime), capacity: parseInt(period.capacity, 10) || 0 });
        const endTime = periodToSimTime(period.dayOfWeek, period.end, 0, startDay, ms, epochDate.getTime());
        if (endTime != null && endTime <= maxTime + 1e-9) {
          rawEvents.push({ time: Math.max(0, endTime), capacity: defaultCapacity });
        }
      }
    }
    return { events: mergeConsecutive(rawEvents), warnings };
  }

  const maxWeeks = Number.isFinite(maxTime) ? Math.ceil(maxTime / simWeek) + 1 : MAX_WEEKS_CAP;

  for (let week = 0; week < maxWeeks; week++) {
    const weekStart = week * simWeek;
    if (weekStart > maxTime) break;
    for (const period of pattern.periods) {
      const startTime = periodToSimTime(period.dayOfWeek, period.start, week, startDay, ms, epochDate.getTime());
      if (startTime == null) continue;
      if (startTime <= maxTime + 1e-9) {
        rawEvents.push({ time: Math.max(0, startTime), capacity: parseInt(period.capacity, 10) || 0 });
        const endTime = periodToSimTime(period.dayOfWeek, period.end, week, startDay, ms, epochDate.getTime());
        if (endTime != null && endTime <= maxTime + 1e-9) {
          rawEvents.push({ time: Math.max(0, endTime), capacity: defaultCapacity });
        }
      }
    }
  }

  // Phase 2: Apply exceptions — strip events on exception dates, inject exception periods
  if (Array.isArray(pattern.exceptions)) {
    for (const exc of pattern.exceptions) {
      const excDayStart = dateToSimDay(exc.date, epoch, timeUnit);
      if (excDayStart == null) {
        warnings.push(`Exception date '${exc.date}' could not be resolved — skipping`);
        continue;
      }
      if (excDayStart > maxTime) continue; // exception is after run end — skip
      // Remove any events within this exception day
      const excEnd = excDayStart + simDay;
      const before = rawEvents.filter(e => e.time < excDayStart || e.time >= excEnd);
      const removed = rawEvents.length - before.length;
      rawEvents.length = 0;
      rawEvents.push(...before);
      // Insert exception periods
      if (Array.isArray(exc.periods)) {
        for (const ep of exc.periods) {
          const startOff = parseHHMM(ep.start);
          const endOff = parseHHMM(ep.end);
          if (isNaN(startOff) || isNaN(endOff)) {
            warnings.push(`Exception date '${exc.date}' has invalid period start/end — skipping period`);
            continue;
          }
          const epStart = excDayStart + startOff * 60000 / ms;
          const epEnd = excDayStart + endOff * 60000 / ms;
          const epCap = parseInt(ep.capacity, 10) || 0;
          if (epStart <= maxTime + 1e-9) {
            rawEvents.push({ time: Math.max(0, epStart), capacity: epCap });
          }
          if (epEnd <= maxTime + 1e-9) {
            rawEvents.push({ time: Math.max(0, epEnd), capacity: defaultCapacity });
          }
        }
      }
      if (removed > 0) {
        warnings.push(`Exception date '${exc.date}': overrode ${removed} event(s) from weekly pattern`);
      }
    }
  }

  // Phase 3: Merge consecutive events at the same time (last wins), sort, trim
  const merged = mergeConsecutive(rawEvents);
  const sorted = merged.sort((a, b) => a.time - b.time);
  const trimmed = sorted.filter(e => e.time <= maxTime);

  return { events: trimmed, warnings };
}

// Merge events at the same simulation time — last capacity wins.
function mergeConsecutive(events) {
  if (!events.length) return [];
  const grouped = {};
  for (const ev of events) {
    const key = ev.time;
    grouped[key] = ev.capacity; // last wins
  }
  return Object.entries(grouped).map(([t, cap]) => ({ time: Number(t), capacity: cap }));
}

// Get the initial capacity for a server type with a schedule pattern.
// Returns the period capacity if any period covers t=0, or defaultCapacity otherwise.
export function getPatternInitialCapacity(pattern, epoch, timeUnit = "minutes") {
  if (!pattern?.periods?.length) return null;
  if (epoch == null || epoch === "") return null;
  const ms = UNIT_MS[timeUnit] ?? UNIT_MS.minutes;
  const epochDate = new Date(epoch);
  if (isNaN(epochDate.getTime())) return null;
  const startDayOfWeek = epochDate.getDay();
  const startDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  for (const period of pattern.periods) {
    const startTime = periodToSimTime(period.dayOfWeek, period.start, 0, startDay, ms, epochDate.getTime());
    const endTime = periodToSimTime(period.dayOfWeek, period.end, 0, startDay, ms, epochDate.getTime());
    if (startTime != null && endTime != null) {
      // Check if t=0 falls within [start, end)
      if (startTime <= 1e-9 && endTime > 1e-9) {
        return parseInt(period.capacity, 10) || 0;
      }
    }
  }
  return pattern.defaultCapacity != null ? Math.max(0, parseInt(pattern.defaultCapacity, 10) || 0) : 0;
}

// Resolve a schedule pattern from multiplier mode to absolute capacities.
// Pure function — never mutates the input pattern.
//
// If mode === "multiplier": multiplies each period.capacity and defaultCapacity
// by baseCapacity, rounds to nearest integer, returns a new pattern with mode: "absolute".
// If mode === "absolute" or absent: returns pattern unchanged (identity).
//
// Returns: { pattern: SchedulePattern, warnings: string[] }
export function resolveSchedulePattern(pattern) {
  const warnings = [];
  if (!pattern || pattern.type !== "weekly") {
    return { pattern, warnings };
  }
  const mode = pattern.mode || "absolute";
  if (mode === "absolute") {
    return { pattern, warnings };
  }
  if (mode !== "multiplier") {
    warnings.push(`Unknown schedulePattern mode '${mode}' — treating as absolute`);
    return { pattern, warnings };
  }
  const baseCapacity = Number(pattern.baseCapacity);
  if (!Number.isFinite(baseCapacity) || baseCapacity < 0) {
    warnings.push(`Invalid baseCapacity '${pattern.baseCapacity}' — cannot resolve multiplier pattern`);
    return { pattern, warnings };
  }
  const resolvedPeriods = (pattern.periods || []).map(p => {
    const mult = Number(p.capacity);
    const absCap = Number.isFinite(mult) ? Math.round(baseCapacity * mult) : 0;
    return { ...p, capacity: absCap };
  });
  const resolvedDefault = Number.isFinite(Number(pattern.defaultCapacity))
    ? Math.round(baseCapacity * Number(pattern.defaultCapacity))
    : 0;
  const resolvedExceptions = (pattern.exceptions || []).map(exc => ({
    ...exc,
    periods: (exc.periods || []).map(ep => {
      const mult = Number(ep.capacity);
      const absCap = Number.isFinite(mult) ? Math.round(baseCapacity * mult) : 0;
      return { ...ep, capacity: absCap };
    })
  }));
  return {
    pattern: {
      ...pattern,
      mode: "absolute",
      baseCapacity: undefined,
      defaultCapacity: resolvedDefault,
      periods: resolvedPeriods,
      exceptions: resolvedExceptions
    },
    warnings
  };
}

// Build per-shift period labels from a pattern for utilisation tracking.
// Returns a map of "shift period key" → human-readable label.
export function buildShiftPeriodLabels(pattern) {
  if (!pattern?.periods?.length) return {};
  const labels = {};
  for (const p of pattern.periods) {
    const key = `${p.dayOfWeek}:${p.start}`;
    labels[key] = periodLabel(p);
  }
  return labels;
}
