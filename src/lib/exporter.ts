/**
 * @module exporter
 * Exports PortfolioData back to an .xlsx workbook (lossless round-trip) or a
 * .csv flattening of the facts sheet (for spreadsheets, notebooks, and scripts).
 */

import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import type { PortfolioData } from './types';

/**
 * Build a workbook for the given portfolio data and return its raw bytes.
 * Pure function — no DOM, no I/O. Used by `exportPortfolioExcel` and tests.
 */
export async function buildPortfolioWorkbook(data: PortfolioData): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();

  // ── facts sheet ──────────────────────────────────────────────────────────
  const factsSheet = wb.addWorksheet('facts');
  factsSheet.columns = [
    { header: 'DATE', key: 'date', width: 14 },
    { header: 'ID_SOURCE', key: 'idSource', width: 20 },
    { header: 'SOURCE_VL', key: 'sourceVl', width: 14 },
    { header: 'CURRENCY', key: 'currency', width: 10 },
  ];
  for (const f of data.facts) {
    factsSheet.addRow({ date: f.date, idSource: f.idSource, sourceVl: f.sourceVl, currency: f.currency });
  }
  // Format the DATE column as YYYY-MM-DD for clean Excel display
  factsSheet.getColumn('date').numFmt = 'yyyy-mm-dd';

  // ── ref sheet ─────────────────────────────────────────────────────────────
  const refSheet = wb.addWorksheet('ref');
  refSheet.columns = [
    { header: 'ID_SOURCE', key: 'idSource', width: 20 },
    { header: 'VOLAT_TYPE', key: 'volatType', width: 18 },
    { header: 'TRANSFERABLE_IN_DAYS', key: 'transferableInDays', width: 22 },
  ];
  for (const s of data.refSources) {
    refSheet.addRow({
      idSource: s.idSource,
      volatType: s.volatType,
      transferableInDays: s.transferableInDays,
    });
  }

  return await wb.xlsx.writeBuffer() as ArrayBuffer;
}

/**
 * Export the current portfolio data as an Excel (.xlsx) file download.
 *
 * Creates a workbook with two sheets:
 * - **facts**: DATE, ID_SOURCE, SOURCE_VL, CURRENCY columns
 * - **ref**: ID_SOURCE, VOLAT_TYPE, TRANSFERABLE_IN_DAYS columns
 *
 * @param data - The portfolio data to export.
 * @param filename - Download filename (default: "portfolio_export.xlsx").
 */
export async function exportPortfolioExcel(
  data: PortfolioData,
  filename = 'portfolio_export.xlsx',
): Promise<void> {
  const buf = await buildPortfolioWorkbook(data);
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, filename);
}

const CSV_HEADERS = ['DATE', 'ID_SOURCE', 'SOURCE_VL', 'CURRENCY'] as const;

// Leading characters spreadsheet apps treat as the start of a formula.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Escape a free-text field for CSV. Neutralises formula injection (a leading
 * `=`, `+`, `-`, `@` would otherwise run as a formula in Excel/Sheets) by
 * prefixing a single quote, then applies RFC 4180 quoting for commas, quotes,
 * and newlines. Only used for text columns; numeric columns are written raw so
 * negative values stay numeric.
 */
function csvEscape(value: string): string {
  const guarded = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * Build a CSV string for the facts sheet. RFC 4180: comma-delimited, CRLF row
 * terminator, double-quote escaping for values containing commas, quotes, or
 * line breaks. Dates render as ISO `yyyy-MM-dd` and values as plain numbers
 * without thousand separators so the file imports cleanly into pandas, R, and
 * Google Sheets. Pure function — no DOM, no I/O.
 */
export function buildPortfolioCsv(data: PortfolioData): string {
  const lines: string[] = [CSV_HEADERS.join(',')];
  for (const f of data.facts) {
    lines.push([
      format(f.date, 'yyyy-MM-dd'),
      csvEscape(f.idSource),
      String(f.sourceVl),
      f.currency,
    ].join(','));
  }
  return lines.join('\r\n');
}

/**
 * Export the current portfolio facts as a `.csv` file download.
 *
 * Single sheet, RFC 4180. Columns match the Excel facts sheet:
 * DATE, ID_SOURCE, SOURCE_VL, CURRENCY. A UTF-8 BOM is prepended so Excel
 * opens non-ASCII source names (e.g. "Caixa Geral") without mojibake; pandas,
 * R, and Google Sheets all strip the BOM transparently.
 *
 * @param data - The portfolio data to export.
 * @param filename - Download filename (default: "portfolio_export.csv").
 */
export function exportPortfolioCsv(
  data: PortfolioData,
  filename = 'portfolio_export.csv',
): void {
  const blob = new Blob(['﻿', buildPortfolioCsv(data)], {
    type: 'text/csv;charset=utf-8',
  });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
