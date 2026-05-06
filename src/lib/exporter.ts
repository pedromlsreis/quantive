/**
 * @module exporter
 * Exports PortfolioData back to an .xlsx file matching the original template
 * structure, enabling a lossless upload → explore → export round-trip.
 */

import ExcelJS from 'exceljs';
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
  ];
  for (const f of data.facts) {
    factsSheet.addRow({ date: f.date, idSource: f.idSource, sourceVl: f.sourceVl });
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
 * - **facts**: DATE, ID_SOURCE, SOURCE_VL columns
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
