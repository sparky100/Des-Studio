import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the ExcelJS-backed workbook wrapper so tests run without a real
// binary xlsx library
const mockParseSheetToCsv = vi.fn();

vi.mock('../workbook.js', () => ({
  parseSheetToCsv: (...args) => mockParseSheetToCsv(...args),
}));

// Import after mock is registered
const { parseXlsx } = await import('../xlsxParser.js');

const EPOCH = '2026-05-18T08:00:00';

function makeWorkbook(csv) {
  mockParseSheetToCsv.mockResolvedValue(csv);
  return new ArrayBuffer(8);
}

function wrapperError(message, code, extra = {}) {
  return Object.assign(new Error(message), { code }, extra);
}

describe('parseXlsx', () => {
  beforeEach(() => {
    mockParseSheetToCsv.mockReset();
  });

  test('parses numeric time column', async () => {
    const buf = makeWorkbook('time,severity\n10,3\n20,1');
    const r = await parseXlsx(buf);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ time: 10, attrs: { severity: 3 } });
    expect(r.attrHeaders).toEqual(['severity']);
    expect(r.skipped).toBe(0);
  });

  test('parses HH:MM timestamps with epoch', async () => {
    const buf = makeWorkbook('time,type\n08:30,hip\n10:45,knee');
    const r = await parseXlsx(buf, { epoch: EPOCH, timeUnit: 'minutes' });
    expect(r.error).toBeUndefined();
    expect(r.rows[0].time).toBe(30);
    expect(r.rows[1].time).toBe(165);
  });

  test('returns error when timestamps present but no epoch', async () => {
    const buf = makeWorkbook('time\n08:30\n09:00');
    const r = await parseXlsx(buf);
    expect(r.error).toMatch(/epoch/i);
    expect(r.rows).toEqual([]);
  });

  test('returns error when workbook read fails', async () => {
    mockParseSheetToCsv.mockRejectedValue(new Error('corrupt file'));
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.error).toMatch(/corrupt file/);
    expect(r.rows).toEqual([]);
  });

  test('returns error when workbook has no sheets', async () => {
    mockParseSheetToCsv.mockRejectedValue(
      wrapperError('Workbook contains no sheets.', 'NO_SHEETS')
    );
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.error).toMatch(/no sheets/i);
  });

  test('returns error when named sheet not found', async () => {
    mockParseSheetToCsv.mockRejectedValue(
      wrapperError('Sheet "Missing" not found in workbook.', 'SHEET_NOT_FOUND', { sheetName: 'Missing' })
    );
    const r = await parseXlsx(new ArrayBuffer(8), { sheetName: 'Missing' });
    expect(r.error).toMatch(/Missing/);
  });

  test('uses first sheet by default (no sheetName passed through)', async () => {
    const buf = makeWorkbook('time\n5\n10');
    const r = await parseXlsx(buf);
    expect(r.rows).toHaveLength(2);
    expect(mockParseSheetToCsv).toHaveBeenCalledWith(buf, { sheetName: undefined });
  });

  test('passes named sheet through when sheetName option provided', async () => {
    const buf = makeWorkbook('time\n5');
    const r = await parseXlsx(buf, { sheetName: 'Data' });
    expect(r.rows).toHaveLength(1);
    expect(mockParseSheetToCsv).toHaveBeenCalledWith(buf, { sheetName: 'Data' });
  });

  test('returns empty rows for header-only sheet', async () => {
    const buf = makeWorkbook('time,severity');
    const r = await parseXlsx(buf);
    expect(r.rows).toEqual([]);
    expect(r.skipped).toBe(0);
  });

  test('skips rows with non-numeric non-timestamp time values', async () => {
    const buf = makeWorkbook('time,sev\n10,3\nbad,5\n20,1');
    const r = await parseXlsx(buf);
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toBe(1);
  });
});
