// Parse a planned-arrivals CSV into rows suitable for distParams.rows
//
// Two formats are supported:
//
//   Format 1 — single-event (time first):
//     time, attr1, attr2, ...
//     321,  HL0001, wcml, ...
//   Returns: { format:'single', rows, attrHeaders, skipped }
//
//   Format 2 — multi-event (event name/id first):
//     event, time, attr1, attr2, ...
//     WCML Motherwell, 321, HL0001, wcml, ...
//   Detected when col-0 header is one of: event, eventid, event_id, b_event, bevent
//   Returns: { format:'multi', groups:[{eventId,rows}], attrHeaders, skipped }
//
// Header row is detected automatically (non-numeric or "time"/"event" in col 0).
// Options: { epoch, timeUnit } — required when time column contains timestamps.

import { looksLikeTimestamp, parseTimeInput } from '../../engine/clockUtils.js';

const MULTI_EVENT_HEADERS = new Set(['event', 'eventid', 'event_id', 'b_event', 'bevent', 'b-event']);

export function parsePlanCsv(text, { epoch, timeUnit } = {}) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return { format: 'single', error: 'Empty file', rows: [], attrHeaders: [] };

  const splitRow = (line) => {
    const result = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { result.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const firstRow = splitRow(lines[0]);
  const firstVal = firstRow[0];
  const col0norm = firstVal.toLowerCase().replace(/[\s-]/g, '_');
  const isMultiEvent = MULTI_EVENT_HEADERS.has(col0norm);
  const hasHeader = isMultiEvent || isNaN(Number(firstVal)) || firstVal.toLowerCase() === 'time';

  let headers, dataLines;
  if (hasHeader) {
    headers = firstRow.map((h, i) => {
      if (i === 0) return isMultiEvent ? 'event' : 'time';
      if (i === 1 && isMultiEvent) return 'time';
      return h.trim() || `col${i}`;
    });
    dataLines = lines.slice(1);
  } else {
    headers = ['time', ...firstRow.slice(1).map((_, i) => `attr${i + 1}`)];
    dataLines = lines;
  }

  // ── Multi-event format ──────────────────────────────────────────────────────
  if (isMultiEvent) {
    const attrHeaders = headers.slice(2); // skip event + time

    const timestampDetected = dataLines.some(line => {
      const cols = splitRow(line);
      return cols[1] != null && looksLikeTimestamp(cols[1]);
    });
    if (timestampDetected && (epoch == null || epoch === '')) {
      return { format: 'multi', error: 'Timestamps detected in time column but model has no epoch set. Add a simulation start time in Settings.', groups: [], attrHeaders: [] };
    }

    const groupMap = {};
    let skipped = 0;
    for (const line of dataLines) {
      const cols = splitRow(line);
      const eventId = cols[0]?.trim();
      if (!eventId) { skipped++; continue; }
      const raw1 = cols[1];
      let t;
      if (looksLikeTimestamp(raw1)) {
        t = parseTimeInput(raw1, epoch, timeUnit);
      } else {
        t = Number(raw1);
      }
      if (t == null || !Number.isFinite(t)) { skipped++; continue; }
      const attrs = {};
      for (let i = 0; i < attrHeaders.length; i++) {
        const raw = cols[i + 2] ?? '';
        const num = Number(raw);
        attrs[attrHeaders[i]] = Number.isFinite(num) && raw.trim() !== '' ? num : raw;
      }
      if (!groupMap[eventId]) groupMap[eventId] = [];
      groupMap[eventId].push({ time: t, attrs });
    }

    const groups = Object.entries(groupMap).map(([eventId, rows]) => ({ eventId, rows }));
    return { format: 'multi', groups, attrHeaders, skipped };
  }

  // ── Single-event format ─────────────────────────────────────────────────────
  const attrHeaders = headers.slice(1);

  const timestampDetected = dataLines.some(line => {
    const cols = splitRow(line);
    return cols[0] != null && looksLikeTimestamp(cols[0]);
  });
  if (timestampDetected && (epoch == null || epoch === '')) {
    return {
      format: 'single',
      error: 'Timestamps detected in time column but model has no epoch set. Add a simulation start time in Settings.',
      rows: [],
      attrHeaders: [],
    };
  }

  const rows = []; let skipped = 0;
  for (const line of dataLines) {
    const cols = splitRow(line);
    const raw0 = cols[0];
    let t;
    if (looksLikeTimestamp(raw0)) {
      t = parseTimeInput(raw0, epoch, timeUnit);
    } else {
      t = Number(raw0);
    }
    if (t == null || !Number.isFinite(t)) { skipped++; continue; }
    const attrs = {};
    for (let i = 0; i < attrHeaders.length; i++) {
      const raw = cols[i + 1] ?? '';
      const num = Number(raw);
      attrs[attrHeaders[i]] = Number.isFinite(num) && raw.trim() !== '' ? num : raw;
    }
    rows.push({ time: t, attrs });
  }

  return { format: 'single', attrHeaders, rows, skipped };
}
