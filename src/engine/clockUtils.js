// engine/clockUtils.js — Simulation ↔ real-world time conversion

const UNIT_MS = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };

export function simToWall(t, epoch, timeUnit = 'minutes') {
  if (epoch == null || epoch === '') return null;
  const ms = UNIT_MS[timeUnit] ?? UNIT_MS.minutes;
  return new Date(new Date(epoch).getTime() + Number(t) * ms);
}

export function wallToSim(dt, epoch, timeUnit = 'minutes') {
  if (epoch == null || epoch === '' || dt == null) return null;
  const ms = UNIT_MS[timeUnit] ?? UNIT_MS.minutes;
  return (new Date(dt).getTime() - new Date(epoch).getTime()) / ms;
}

export function formatWallTime(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function formatSimWallTime(t, epoch, timeUnit = 'minutes') {
  return formatWallTime(simToWall(t, epoch, timeUnit));
}

// Parse a value that could be: plain number, HH:MM, or ISO datetime string.
// Returns a sim-time number, or null if unparseable/epoch missing.
export function parseTimeInput(value, epoch, timeUnit = 'minutes') {
  if (value == null || value === '') return null;
  const trimmed = String(value).trim();

  const asNum = Number(trimmed);
  if (!isNaN(asNum) && trimmed !== '') return asNum;

  const hhMm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhMm) {
    if (!epoch) return null;
    const base = new Date(epoch);
    const candidate = new Date(base);
    candidate.setHours(Number(hhMm[1]), Number(hhMm[2]), 0, 0);
    return wallToSim(candidate, epoch, timeUnit);
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    if (!epoch) return null;
    return wallToSim(parsed, epoch, timeUnit);
  }

  return null;
}

// Returns true if a string looks like a timestamp (not a plain number)
export function looksLikeTimestamp(value) {
  const s = String(value ?? '').trim();
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s);
}
