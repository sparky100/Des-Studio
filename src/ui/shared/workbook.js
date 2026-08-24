// ui/shared/workbook.js
// Thin wrapper around ExcelJS so the rest of the app never imports the
// spreadsheet library directly. ExcelJS is loaded via dynamic import inside
// each function — every call path sits behind a file picker or an export
// button, so the library stays out of the main bundle.

export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function loadExcelJS() {
  const mod = await import('exceljs');
  // ExcelJS is CommonJS; depending on the bundler the namespace may carry
  // the library on .default.
  return mod.default ?? mod;
}

const pad2 = (n) => String(n).padStart(2, '0');

// ExcelJS parses xlsx date/time serials into UTC-based Date objects.
// Render time-only cells (Excel epoch date part) as "HH:MM[:SS]" and
// anything else as an ISO-like string, matching what downstream timestamp
// parsing (looksLikeTimestamp/parseTimeInput) accepts.
function formatDateCell(d) {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const h = d.getUTCHours();
  const mi = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  const hm = `${pad2(h)}:${pad2(mi)}${s ? `:${pad2(s)}` : ''}`;
  const isEpochDate =
    (y === 1899 && mo === 12 && (day === 30 || day === 31)) ||
    (y === 1900 && mo === 1 && day === 1);
  if (isEpochDate) return hm;
  const dateStr = `${y}-${pad2(mo)}-${pad2(day)}`;
  return h || mi || s ? `${dateStr}T${hm}` : dateStr;
}

// Convert an ExcelJS cell value to plain text, mirroring SheetJS
// sheet_to_csv semantics: formula cells render their cached result,
// rich text is flattened, booleans render as TRUE/FALSE.
function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') {
    if (v instanceof Date) return formatDateCell(v);
    if (Array.isArray(v.richText)) return v.richText.map((r) => r?.text ?? '').join('');
    if ('error' in v) return String(v.error ?? '');
    if ('result' in v) return cellText(v.result); // formula / shared formula
    if ('text' in v) return cellText(v.text); // hyperlink
    if ('hyperlink' in v) return String(v.hyperlink);
    return String(v);
  }
  return String(v);
}

function csvEscape(text) {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Read a worksheet from an xlsx ArrayBuffer and return it as a CSV string.
 * Blank rows are dropped (matching SheetJS sheet_to_csv({ blankrows:false })).
 *
 * @param {ArrayBuffer} arrayBuffer  Raw file bytes
 * @param {{ sheetName?: string }} options  Pick a sheet by name (default: first sheet)
 * @returns {Promise<string>} CSV text
 * @throws Error with .code 'NO_SHEETS' when the workbook has no sheets, or
 *         .code 'SHEET_NOT_FOUND' (plus .sheetName) when the named sheet is
 *         missing; any other error means the file could not be read.
 */
export async function parseSheetToCsv(arrayBuffer, { sheetName } = {}) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheets = workbook.worksheets;
  if (!worksheets.length) {
    const err = new Error('Workbook contains no sheets.');
    err.code = 'NO_SHEETS';
    throw err;
  }

  let worksheet;
  if (sheetName != null) {
    worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      const err = new Error(`Sheet "${sheetName}" not found in workbook.`);
      err.code = 'SHEET_NOT_FOUND';
      err.sheetName = sheetName;
      throw err;
    }
  } else {
    worksheet = worksheets[0];
  }

  const width = worksheet.columnCount;
  const lines = [];
  worksheet.eachRow((row) => {
    const values = row.values; // sparse, 1-based
    const count = Math.max(width, values.length - 1);
    const cells = [];
    let blank = true;
    for (let c = 1; c <= count; c++) {
      const text = cellText(values[c]);
      if (text !== '') blank = false;
      cells.push(csvEscape(text));
    }
    if (!blank) lines.push(cells.join(','));
  });
  return lines.join('\n');
}

/**
 * Build an xlsx workbook Blob from array-of-arrays sheet data.
 *
 * @param {Array<{ name: string, rows: any[][], colWidths?: number[] }>} sheets
 * @returns {Promise<Blob>} Blob with the xlsx MIME type
 */
export async function buildWorkbookBlob(sheets) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  for (const { name, rows, colWidths } of sheets) {
    const worksheet = workbook.addWorksheet(name);
    if (Array.isArray(colWidths)) {
      worksheet.columns = colWidths.map((width) => ({ width }));
    }
    worksheet.addRows(rows);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME_TYPE });
}

/**
 * Build an xlsx workbook from array-of-arrays sheet data and trigger a
 * browser download of it under the given filename.
 *
 * @param {Array<{ name: string, rows: any[][], colWidths?: number[] }>} sheets
 * @param {string} filename
 */
export async function downloadWorkbook(sheets, filename) {
  const blob = await buildWorkbookBlob(sheets);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
