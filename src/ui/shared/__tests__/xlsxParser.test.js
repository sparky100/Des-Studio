import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock SheetJS so tests run without a real binary xlsx library
const mockSheetToCsv = vi.fn();
const mockRead = vi.fn();

vi.mock('xlsx', () => ({
  read: (...args) => mockRead(...args),
  utils: {
    sheet_to_csv: (...args) => mockSheetToCsv(...args),
  },
}));

// Import after mock is registered
const { parseXlsx } = await import('../xlsxParser.js');

const EPOCH = '2026-05-18T08:00:00';

function makeWorkbook(csv, sheetName = 'Sheet1') {
  const sheet = { __mocked: true };
  mockRead.mockReturnValue({
    SheetNames: [sheetName],
    Sheets: { [sheetName]: sheet },
  });
  mockSheetToCsv.mockReturnValue(csv);
  return new ArrayBuffer(8);
}

describe('parseXlsx', () => {
  beforeEach(() => {
    mockRead.mockReset();
    mockSheetToCsv.mockReset();
  });

  test('parses numeric time column', () => {
    const buf = makeWorkbook('time,severity\n10,3\n20,1');
    const r = parseXlsx(buf);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ time: 10, attrs: { severity: 3 } });
    expect(r.attrHeaders).toEqual(['severity']);
    expect(r.skipped).toBe(0);
  });

  test('parses HH:MM timestamps with epoch', () => {
    const buf = makeWorkbook('time,type\n08:30,hip\n10:45,knee');
    const r = parseXlsx(buf, { epoch: EPOCH, timeUnit: 'minutes' });
    expect(r.error).toBeUndefined();
    expect(r.rows[0].time).toBe(30);
    expect(r.rows[1].time).toBe(165);
  });

  test('returns error when timestamps present but no epoch', () => {
    const buf = makeWorkbook('time\n08:30\n09:00');
    const r = parseXlsx(buf);
    expect(r.error).toMatch(/epoch/i);
    expect(r.rows).toEqual([]);
  });

  test('returns error when workbook read fails', () => {
    mockRead.mockImplementation(() => { throw new Error('corrupt file'); });
    const r = parseXlsx(new ArrayBuffer(8));
    expect(r.error).toMatch(/corrupt file/);
    expect(r.rows).toEqual([]);
  });

  test('returns error when workbook has no sheets', () => {
    mockRead.mockReturnValue({ SheetNames: [], Sheets: {} });
    const r = parseXlsx(new ArrayBuffer(8));
    expect(r.error).toMatch(/no sheets/i);
  });

  test('returns error when named sheet not found', () => {
    const buf = makeWorkbook('time\n10');
    const r = parseXlsx(buf, { sheetName: 'Missing' });
    expect(r.error).toMatch(/Missing/);
  });

  test('uses first sheet by default', () => {
    const sheet = { __mocked: true };
    mockRead.mockReturnValue({
      SheetNames: ['Sheet1', 'Sheet2'],
      Sheets: { Sheet1: sheet, Sheet2: {} },
    });
    mockSheetToCsv.mockReturnValue('time\n5\n10');
    const r = parseXlsx(new ArrayBuffer(8));
    expect(r.rows).toHaveLength(2);
    // sheet_to_csv was called with Sheet1
    expect(mockSheetToCsv.mock.calls[0][0]).toBe(sheet);
  });

  test('uses named sheet when sheetName option provided', () => {
    const sheet2 = { __mocked: true };
    mockRead.mockReturnValue({
      SheetNames: ['Sheet1', 'Data'],
      Sheets: { Sheet1: {}, Data: sheet2 },
    });
    mockSheetToCsv.mockReturnValue('time\n5');
    const r = parseXlsx(new ArrayBuffer(8), { sheetName: 'Data' });
    expect(r.rows).toHaveLength(1);
    expect(mockSheetToCsv.mock.calls[0][0]).toBe(sheet2);
  });

  test('returns empty rows for header-only sheet', () => {
    const buf = makeWorkbook('time,severity');
    const r = parseXlsx(buf);
    expect(r.rows).toEqual([]);
    expect(r.skipped).toBe(0);
  });

  test('skips rows with non-numeric non-timestamp time values', () => {
    const buf = makeWorkbook('time,sev\n10,3\nbad,5\n20,1');
    const r = parseXlsx(buf);
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toBe(1);
  });
});
