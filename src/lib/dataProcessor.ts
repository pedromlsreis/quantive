import * as XLSX from 'xlsx';
import { FactRow, RefSource, RefVolatType, PortfolioData } from './types';

function parseDate(val: any): Date {
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    return new Date((val - 25569) * 86400 * 1000);
  }
  return new Date(String(val));
}

function parseBoolean(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const str = String(val).toLowerCase().trim();
  return str === 'true' || str === '1' || str === 'yes';
}

function normalizeHeader(val: any): string {
  return String(val || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function findTableData(
  rows: any[][],
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

function extractTableRows(
  rows: any[][],
  headerRow: number,
  colIndices: Record<string, number>
): Record<string, any>[] {
  const firstHeader = Object.keys(colIndices)[0];
  const firstCol = colIndices[firstHeader];
  const result: Record<string, any>[] = [];

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row[firstCol] === undefined || row[firstCol] === null || row[firstCol] === '') break;
    const record: Record<string, any> = {};
    for (const [header, col] of Object.entries(colIndices)) {
      record[header] = row[col];
    }
    result.push(record);
  }
  return result;
}

export function parsePortfolioExcel(buffer: ArrayBuffer): PortfolioData {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  // Parse fact sheet (first sheet)
  const factSheet = workbook.Sheets[workbook.SheetNames[0]];
  const factRows = XLSX.utils.sheet_to_json<any>(factSheet);

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
  const refRows: any[][] = XLSX.utils.sheet_to_json(refSheet, { header: 1 });

  // Find REF_SOURCES table
  const sourcesTable = findTableData(refRows, ['ID_SOURCE', 'ID_VOLAT_TYPE', 'IS_CRYPTO', 'TRANSFERABLE_IN_DAYS']);
  const refSources: RefSource[] = sourcesTable
    ? extractTableRows(refRows, sourcesTable.headerRow, sourcesTable.colIndices).map(r => ({
        idSource: String(r['ID_SOURCE']).trim(),
        idVolatType: Number(r['ID_VOLAT_TYPE']),
        isCrypto: parseBoolean(r['IS_CRYPTO']),
        transferableInDays: parseBoolean(r['TRANSFERABLE_IN_DAYS']),
      }))
    : [];

  // Find REF_VOLAT_TYPES table
  const volatTable = findTableData(refRows, ['ID_VOLAT_TYPE', 'VOLAT_TYPE_DSC']);
  const refVolatTypes: RefVolatType[] = volatTable
    ? extractTableRows(refRows, volatTable.headerRow, volatTable.colIndices).map(r => ({
        idVolatType: Number(r['ID_VOLAT_TYPE']),
        volatTypeDsc: String(r['VOLAT_TYPE_DSC']),
      }))
    : [];

  if (facts.length === 0) throw new Error('No valid fact records found');

  return { facts, refSources, refVolatTypes };
}
