/**
 * @module dataProcessor
 * Parses portfolio Excel files (.xlsx) into the internal PortfolioData structure.
 * Supports flexible header matching (case-insensitive, accent-stripped).
 */

import ExcelJS from 'exceljs';
import { FactRow, RefSource, PortfolioData } from './types';
import { coerceCurrency } from './fxConvert';

/**
 * Normalize ExcelJS cell values to primitives. ExcelJS returns rich objects
 * for hyperlinks, formulas, errors, and rich text — flatten them so downstream
 * code only deals with strings, numbers, booleans, Dates, null, or undefined.
 */
function cellValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v;
  if (typeof v !== 'object') return v;
  const obj = v as Record<string, unknown>;
  if ('richText' in obj && Array.isArray(obj.richText)) {
    return obj.richText.map((rt: { text?: string }) => rt.text ?? '').join('');
  }
  if ('text' in obj) return obj.text;
  if ('result' in obj) return obj.result;
  if ('error' in obj) return null;
  return v;
}

/**
 * Convert an ExcelJS worksheet to a 2D array of rows. Empty rows are preserved
 * as `[]` so row indices line up with sheet row numbers (minus 1).
 */
function sheetToArrays(worksheet: ExcelJS.Worksheet): unknown[][] {
  const out: unknown[][] = [];
  const lastRow = worksheet.actualRowCount;
  for (let r = 1; r <= lastRow; r++) {
    const row = worksheet.getRow(r);
    const cells: unknown[] = [];
    // ExcelJS row.values is 1-indexed (index 0 is metadata); slice it.
    const values = row.values as unknown[];
    for (let c = 1; c < values.length; c++) {
      cells.push(cellValue(values[c]));
    }
    out.push(cells);
  }
  return out;
}

/**
 * Convert an ExcelJS worksheet to a list of objects keyed by the first row's
 * header cells. Mirrors the shape that `xlsx.utils.sheet_to_json(sheet)`
 * produced previously.
 */
function sheetToObjects(worksheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const rows = sheetToArrays(worksheet);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => (h == null ? '' : String(h)));
  const out: Record<string, unknown>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const val = row[c];
      obj[key] = val;
      if (val !== undefined && val !== null && val !== '') hasValue = true;
    }
    if (hasValue) out.push(obj);
  }
  return out;
}

/**
 * Convert an Excel date value to a JS Date.
 * Handles Date objects, Excel serial numbers, and date strings.
 */
function parseDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    // Excel serial date: days since 1900-01-01 (with the 1900 leap year bug)
    return new Date((val - 25569) * 86400 * 1000);
  }
  return new Date(String(val));
}

/**
 * Coerce a value to boolean.
 * Accepts booleans, numbers (0/1), and strings ("true", "yes", "1").
 */
function parseBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const str = String(val).toLowerCase().trim();
  return str === 'true' || str === '1' || str === 'yes';
}

/**
 * Normalize a header string for case-/accent-insensitive comparison.
 * Removes whitespace, underscores, and diacritics then uppercases.
 */
function normalizeHeader(val: unknown): string {
  return String(val || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Locate a table within a 2D array of rows by matching required headers.
 * @returns The header row index and column index map, or null if not found.
 */
function findTableData(
  rows: unknown[][],
  requiredHeaders: string[]
): { headerRow: number; colIndices: Record<string, number> } | null {
  const normalizedRequired = requiredHeaders.map(h => ({ original: h, norm: normalizeHeader(h) }));

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const colIndices: Record<string, number> = {};
    for (let c = 0; c < row.length; c++) {
      const cellNorm = normalizeHeader(row[c]);
      if (!cellNorm) continue;
      const match = normalizedRequired.find(h => h.norm === cellNorm);
      if (match && !(match.original in colIndices)) {
        colIndices[match.original] = c;
      }
    }
    if (Object.keys(colIndices).length === requiredHeaders.length) {
      return { headerRow: r, colIndices };
    }
  }
  return null;
}

/**
 * Extract data rows from a 2D array starting after the header row.
 * Stops at the first row with an empty value in the first column.
 */
function extractTableRows(
  rows: unknown[][],
  headerRow: number,
  colIndices: Record<string, number>
): Record<string, unknown>[] {
  const firstHeader = Object.keys(colIndices)[0];
  const firstCol = colIndices[firstHeader];
  const result: Record<string, unknown>[] = [];

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row[firstCol] === undefined || row[firstCol] === null || row[firstCol] === '') break;
    const record: Record<string, unknown> = {};
    for (const [header, col] of Object.entries(colIndices)) {
      record[header] = row[col];
    }
    result.push(record);
  }
  return result;
}

/**
 * Parse a portfolio Excel workbook into structured PortfolioData.
 *
 * Expected structure:
 * - **Sheet 1 ("facts")**: Columns DATE, ID_SOURCE, SOURCE_VL, optional CURRENCY
 * - **Sheet 2 ("ref")**: Table with ID_SOURCE, VOLAT_TYPE, TRANSFERABLE_IN_DAYS
 *
 * CURRENCY column is optional; missing or unrecognised values default to EUR
 * for backwards compatibility with pre-multi-currency templates.
 *
 * @param buffer - The raw ArrayBuffer of the .xlsx file.
 * @throws Error if no valid data is found.
 */
export async function parsePortfolioExcel(buffer: ArrayBuffer): Promise<PortfolioData> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  if (workbook.worksheets.length === 0) {
    throw new Error('Workbook contains no sheets');
  }

  // Parse fact sheet — prefer one named "facts" (case-insensitive), else fall
  // back to the first sheet. Mirrors the ref lookup below so templates can
  // ship a leading "Read me" tab without breaking parsing of older uploads
  // that put facts in slot 0.
  const factSheet =
    workbook.worksheets.find(ws => ws.name.toLowerCase() === 'facts') ??
    workbook.worksheets[0];
  const factRows = sheetToObjects(factSheet);

  if (factRows.length === 0) throw new Error('No data found in the first sheet');

  const facts: FactRow[] = factRows
    .map(row => ({
      date: parseDate(row['DATE'] || row['date'] || row['Date']),
      idSource: String(row['ID_SOURCE'] || row['id_source'] || ''),
      sourceVl: Number(row['SOURCE_VL'] || row['source_vl'] || 0),
      currency: coerceCurrency(row['CURRENCY'] ?? row['currency'] ?? row['Currency']),
    }))
    .filter(f => f.idSource && !isNaN(f.sourceVl) && !isNaN(f.date.getTime()));

  // Parse ref sheet — prefer one named "ref" (case-insensitive), else fall back
  // to the second sheet. Returns no refSources if neither yields a match.
  const refSheet =
    workbook.worksheets.find(ws => ws.name.toLowerCase() === 'ref') ??
    workbook.worksheets[1];

  let refSources: RefSource[] = [];
  if (refSheet) {
    const refRows = sheetToArrays(refSheet);
    const sourcesTable = findTableData(refRows, ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS']);
    if (sourcesTable) {
      refSources = extractTableRows(refRows, sourcesTable.headerRow, sourcesTable.colIndices).map(r => ({
        idSource: String(r['ID_SOURCE']).trim(),
        volatType: String(r['VOLAT_TYPE']).trim(),
        transferableInDays: parseBoolean(r['TRANSFERABLE_IN_DAYS']),
      }));
    }
  }

  if (facts.length === 0) throw new Error('No valid fact records found');

  // Excel import carries no goals; they live only in the encrypted blob.
  return { facts, refSources, goals: [] };
}
