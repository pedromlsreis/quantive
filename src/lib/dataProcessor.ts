/**
 * @module dataProcessor
 * Parses portfolio Excel files (.xlsx) into the internal PortfolioData structure.
 * Supports flexible header matching (case-insensitive, accent-stripped).
 */

import * as XLSX from 'xlsx';
import { FactRow, RefSource, PortfolioData } from './types';

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
 * - **Sheet 1 ("facts")**: Columns DATE, ID_SOURCE, SOURCE_VL
 * - **Sheet 2 ("ref")**: Table with ID_SOURCE, VOLAT_TYPE, TRANSFERABLE_IN_DAYS
 *
 * @param buffer - The raw ArrayBuffer of the .xlsx file.
 * @throws Error if no valid data is found.
 */
export function parsePortfolioExcel(buffer: ArrayBuffer): PortfolioData {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  // Parse fact sheet (first sheet)
  const factSheet = workbook.Sheets[workbook.SheetNames[0]];
  const factRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(factSheet);

  if (factRows.length === 0) throw new Error('No data found in the first sheet');

  const facts: FactRow[] = factRows
    .map(row => ({
      date: parseDate(row['DATE'] || row['date'] || row['Date']),
      idSource: String(row['ID_SOURCE'] || row['id_source'] || ''),
      sourceVl: Number(row['SOURCE_VL'] || row['source_vl'] || 0),
    }))
    .filter(f => f.idSource && !isNaN(f.sourceVl) && !isNaN(f.date.getTime()));

  // Parse ref sheet
  const refSheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'ref') || workbook.SheetNames[1];
  if (!refSheetName) throw new Error('Reference sheet "ref" not found');

  const refSheet = workbook.Sheets[refSheetName];
  const refRows: unknown[][] = XLSX.utils.sheet_to_json(refSheet, { header: 1 });

  // Find REF_SOURCES table
  const sourcesTable = findTableData(refRows, ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS']);
  const refSources: RefSource[] = sourcesTable
    ? extractTableRows(refRows, sourcesTable.headerRow, sourcesTable.colIndices).map(r => ({
        idSource: String(r['ID_SOURCE']).trim(),
        volatType: String(r['VOLAT_TYPE']).trim(),
        transferableInDays: parseBoolean(r['TRANSFERABLE_IN_DAYS']),
      }))
    : [];

  if (facts.length === 0) throw new Error('No valid fact records found');

  return { facts, refSources };
}
