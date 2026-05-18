// ui/shared/xlsxParser.js
// Converts an XLSX/XLS/ODS ArrayBuffer to the same { rows, attrHeaders, skipped, error }
// shape produced by parsePlanCsv(). Internally converts to CSV using SheetJS then
// delegates to parsePlanCsv so all timestamp / epoch logic is centralised.

import * as XLSX from 'xlsx';
import { parsePlanCsv } from './planCsvParser.js';

/**
 * Parse an XLSX file buffer into a plan schedule.
 *
 * @param {ArrayBuffer} buffer         Raw file bytes
 * @param {{ epoch?: string, timeUnit?: string, sheetName?: string }} options
 * @returns {{ rows: Array<{time:number,attrs:{}}>, attrHeaders: string[], skipped: number, error?: string }}
 */
export function parseXlsx(buffer, { epoch, timeUnit, sheetName } = {}) {
  let workbook;
  try {
    workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  } catch (e) {
    return { rows: [], attrHeaders: [], skipped: 0, error: `Could not read file: ${e.message}` };
  }

  const name = sheetName ?? workbook.SheetNames[0];
  if (!name) {
    return { rows: [], attrHeaders: [], skipped: 0, error: 'Workbook contains no sheets.' };
  }
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    return { rows: [], attrHeaders: [], skipped: 0, error: `Sheet "${name}" not found in workbook.` };
  }

  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
  return parsePlanCsv(csv, { epoch, timeUnit });
}
