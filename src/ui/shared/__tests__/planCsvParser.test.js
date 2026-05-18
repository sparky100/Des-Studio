import { describe, test, expect } from 'vitest';
import { parsePlanCsv } from '../planCsvParser.js';

describe('parsePlanCsv', () => {
  test('parses times-only CSV with header', () => {
    const r = parsePlanCsv('time\n10\n20\n30');
    expect(r.rows).toEqual([
      { time: 10, attrs: {} },
      { time: 20, attrs: {} },
      { time: 30, attrs: {} },
    ]);
    expect(r.attrHeaders).toEqual([]);
    expect(r.skipped).toBe(0);
  });

  test('parses times-only CSV without header', () => {
    const r = parsePlanCsv('10\n20\n30');
    expect(r.rows.map(r => r.time)).toEqual([10, 20, 30]);
    expect(r.attrHeaders).toEqual([]);
  });

  test('parses times + attributes CSV with header row', () => {
    const csv = 'time,severity,age\n10,3,45\n25,1,32';
    const r = parsePlanCsv(csv);
    expect(r.attrHeaders).toEqual(['severity', 'age']);
    expect(r.rows).toEqual([
      { time: 10, attrs: { severity: 3, age: 45 } },
      { time: 25, attrs: { severity: 1, age: 32 } },
    ]);
  });

  test('auto-generates attr names when no header row', () => {
    const csv = '10,3,45\n25,1,32';
    const r = parsePlanCsv(csv);
    expect(r.attrHeaders).toEqual(['attr1', 'attr2']);
    expect(r.rows[0].attrs).toEqual({ attr1: 3, attr2: 45 });
  });

  test('skips rows with non-numeric time', () => {
    const csv = 'time,sev\n10,3\nbad,5\n20,1';
    const r = parsePlanCsv(csv);
    expect(r.rows.length).toBe(2);
    expect(r.skipped).toBe(1);
  });

  test('handles CRLF line endings', () => {
    const csv = 'time,sev\r\n10,3\r\n20,1';
    const r = parsePlanCsv(csv);
    expect(r.rows.length).toBe(2);
  });

  test('handles quoted fields with commas', () => {
    const csv = 'time,label\n10,"high, urgent"\n20,low';
    const r = parsePlanCsv(csv);
    expect(r.rows[0].attrs.label).toBe('high, urgent');
    expect(r.rows[1].attrs.label).toBe('low');
  });

  test('handles quoted fields with escaped quotes', () => {
    const csv = 'time,note\n10,"say ""hello"""\n20,ok';
    const r = parsePlanCsv(csv);
    expect(r.rows[0].attrs.note).toBe('say "hello"');
  });

  test('stores string attribute values when not numeric', () => {
    const csv = 'time,category\n10,red\n20,blue';
    const r = parsePlanCsv(csv);
    expect(r.rows[0].attrs.category).toBe('red');
  });

  test('returns empty rows for empty input', () => {
    const r = parsePlanCsv('');
    expect(r.rows).toEqual([]);
    expect(r.error).toBeTruthy();
  });

  test('returns empty rows for header-only CSV', () => {
    const r = parsePlanCsv('time,severity');
    expect(r.rows).toEqual([]);
    expect(r.skipped).toBe(0);
  });

  test('trims whitespace from header names', () => {
    const csv = 'time , severity , age\n10,3,45';
    const r = parsePlanCsv(csv);
    expect(r.attrHeaders).toEqual(['severity', 'age']);
  });
});

const EPOCH = '2026-05-18T08:00:00';

describe('parsePlanCsv — timestamp time column', () => {
  test('HH:MM timestamps with epoch convert to sim time', () => {
    const csv = 'time,type\n08:30,hip\n10:45,knee';
    const r = parsePlanCsv(csv, { epoch: EPOCH, timeUnit: 'minutes' });
    expect(r.error).toBeUndefined();
    expect(r.rows[0].time).toBe(30);
    expect(r.rows[1].time).toBe(165);
    expect(r.rows[0].attrs.type).toBe('hip');
  });

  test('ISO datetime timestamps with epoch convert to sim time', () => {
    const csv = 'time,type\n2026-05-18T08:30:00,hip\n2026-05-18T10:45:00,knee';
    const r = parsePlanCsv(csv, { epoch: EPOCH, timeUnit: 'minutes' });
    expect(r.error).toBeUndefined();
    expect(r.rows[0].time).toBe(30);
    expect(r.rows[1].time).toBe(165);
  });

  test('timestamps without epoch set returns an error', () => {
    const csv = 'time,type\n08:30,hip';
    const r = parsePlanCsv(csv);
    expect(r.error).toBeTruthy();
    expect(r.error).toMatch(/epoch/i);
    expect(r.rows).toEqual([]);
  });

  test('plain numeric time column still works with epoch set', () => {
    const csv = 'time,type\n30,hip\n165,knee';
    const r = parsePlanCsv(csv, { epoch: EPOCH, timeUnit: 'minutes' });
    expect(r.error).toBeUndefined();
    expect(r.rows[0].time).toBe(30);
  });

  test('mixed plain numbers are not flagged as timestamps', () => {
    const csv = '10\n20\n30';
    const r = parsePlanCsv(csv);
    expect(r.error).toBeUndefined();
    expect(r.rows.length).toBe(3);
  });
});
