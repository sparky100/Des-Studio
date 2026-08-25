// @vitest-environment node
import { describe, test, expect } from 'vitest';
import { buildWorkbookBlob, parseSheetToCsv, XLSX_MIME_TYPE } from '../../../src/ui/shared/workbook.js';

describe('workbook wrapper (ExcelJS round trip)', () => {
  test('buildWorkbookBlob produces an xlsx Blob that parseSheetToCsv can read back', async () => {
    const blob = await buildWorkbookBlob([{ name: 'Sheet1', rows: [['a', 'b'], [1, 2]] }]);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(XLSX_MIME_TYPE);
    expect(blob.size).toBeGreaterThan(0);

    const csv = await parseSheetToCsv(await blob.arrayBuffer());
    expect(csv).toBe('a,b\n1,2');
  });

  test('round trip picks a named sheet and preserves multiple sheets', async () => {
    const blob = await buildWorkbookBlob([
      { name: 'Summary', rows: [['Metric', 'Value'], ['Served', 9]] },
      { name: 'Replications', rows: [['Replication', 'Seed'], [0, 42]] },
    ]);
    const buffer = await blob.arrayBuffer();

    expect(await parseSheetToCsv(buffer)).toBe('Metric,Value\nServed,9');
    expect(await parseSheetToCsv(buffer, { sheetName: 'Replications' })).toBe('Replication,Seed\n0,42');
  });

  test('quotes cells containing commas, quotes, and newlines; drops blank rows', async () => {
    const blob = await buildWorkbookBlob([{
      name: 'Sheet1',
      rows: [
        ['plain', 'a,b', 'say "hi"'],
        [],
        ['multi\nline', '', 3],
      ],
    }]);
    const csv = await parseSheetToCsv(await blob.arrayBuffer());
    expect(csv).toBe('plain,"a,b","say ""hi"""\n"multi\nline",,3');
  });

  test('rejects with SHEET_NOT_FOUND for a missing named sheet', async () => {
    const blob = await buildWorkbookBlob([{ name: 'Sheet1', rows: [['x']] }]);
    await expect(parseSheetToCsv(await blob.arrayBuffer(), { sheetName: 'Nope' }))
      .rejects.toMatchObject({ code: 'SHEET_NOT_FOUND', sheetName: 'Nope' });
  });

  test('rejects plainly for unreadable input', async () => {
    await expect(parseSheetToCsv(new ArrayBuffer(8))).rejects.toBeInstanceOf(Error);
  });
});
