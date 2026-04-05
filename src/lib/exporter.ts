/**
 * @module exporter
 * Exports PortfolioData back to an .xlsx file matching the original template
 * structure, enabling a lossless upload → explore → export round-trip.
 */

import * as XLSX from 'xlsx';
import type { PortfolioData } from './types';

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
export function exportPortfolioExcel(data: PortfolioData, filename = 'portfolio_export.xlsx'): void {
  const wb = XLSX.utils.book_new();

  // ── facts sheet ──────────────────────────────────────────────────────────
  const factsRows: unknown[][] = [
    ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
    ...data.facts.map(f => [f.date, f.idSource, f.sourceVl]),
  ];
  const factsSheet = XLSX.utils.aoa_to_sheet(factsRows, { cellDates: true });

  // Format the DATE column as YYYY-MM-DD for clean Excel display
  const dateFormat = 'yyyy-mm-dd';
  for (let r = 1; r <= data.facts.length; r++) {
    const cellRef = XLSX.utils.encode_cell({ r, c: 0 });
    if (factsSheet[cellRef]) {
      factsSheet[cellRef].z = dateFormat;
    }
  }

  factsSheet['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, factsSheet, 'facts');

  // ── ref sheet ─────────────────────────────────────────────────────────────
  const refRows: unknown[][] = [
    ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
    ...data.refSources.map(s => [s.idSource, s.volatType, s.transferableInDays]),
  ];
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, refSheet, 'ref');

  // ── trigger download ──────────────────────────────────────────────────────
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
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
