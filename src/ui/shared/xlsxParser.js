// ui/shared/xlsxParser.js
// Converts an XLSX ArrayBuffer to the same { rows, attrHeaders, skipped, error }
// shape produced by parsePlanCsv(). Internally converts to CSV using the
// ExcelJS-backed workbook wrapper then delegates to parsePlanCsv so all
// timestamp / epoch logic is centralised.

import { parseSheetToCsv } from './workbook.js';
import { parsePlanCsv } from './planCsvParser.js';

/**
 * Parse an XLSX file buffer into a plan schedule.
 *
 * @param {ArrayBuffer} buffer         Raw file bytes
 * @param {{ epoch?: string, timeUnit?: string, sheetName?: string }} options
 * @returns {Promise<{ rows: Array<{time:number,attrs:{}}>, attrHeaders: string[], skipped: number, error?: string }>}
 */
export async function parseXlsx(buffer, { epoch, timeUnit, sheetName } = {}) {
  let csv;
  try {
    csv = await parseSheetToCsv(buffer, { sheetName });
  } catch (e) {
    if (e?.code === 'NO_SHEETS') {
      return { rows: [], attrHeaders: [], skipped: 0, error: 'Workbook contains no sheets.' };
    }
    if (e?.code === 'SHEET_NOT_FOUND') {
      return { rows: [], attrHeaders: [], skipped: 0, error: `Sheet "${e.sheetName ?? sheetName}" not found in workbook.` };
    }
    return { rows: [], attrHeaders: [], skipped: 0, error: `Could not read file: ${e.message}` };
  }

  return parsePlanCsv(csv, { epoch, timeUnit });
}
