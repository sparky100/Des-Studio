// Parse a planned-arrivals CSV into rows suitable for distParams.rows
// First column = time (numeric or timestamp); remaining columns = entity attributes.
// Header row is detected automatically (non-numeric or "time" in col 0).
// Options: { epoch, timeUnit } — required when time column contains timestamps.
import { looksLikeTimestamp, parseTimeInput } from '../../engine/clockUtils.js';

export function parsePlanCsv(text, { epoch, timeUnit } = {}) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return { error: 'Empty file', rows: [], attrHeaders: [] };

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
  const hasHeader = isNaN(Number(firstVal)) || firstVal.toLowerCase() === 'time';
  let headers, dataLines;
  if (hasHeader) {
    headers = firstRow.map((h, i) => i === 0 ? 'time' : h.trim() || `col${i}`);
    dataLines = lines.slice(1);
  } else {
    headers = ['time', ...firstRow.slice(1).map((_, i) => `attr${i + 1}`)];
    dataLines = lines;
  }

  const attrHeaders = headers.slice(1);

  // Detect if any data row uses timestamps in the time column
  const timestampDetected = dataLines.some(line => {
    const cols = splitRow(line);
    return cols[0] != null && looksLikeTimestamp(cols[0]);
  });

  if (timestampDetected && (epoch == null || epoch === '')) {
    return {
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

  return { attrHeaders, rows, skipped };
}
