import * as XLSX from 'xlsx';
import type { PortfolioData } from './types';

/**
 * Exports the current PortfolioData back to an .xlsx file that mirrors the
 * original template structure (facts sheet + ref sheet), making the upload →
 * explore → export round-trip lossless.
 */
export function exportPortfolioExcel(data: PortfolioData, filename = 'portfolio_export.xlsx'): void {
  const wb = XLSX.utils.book_new();

  // ── facts sheet ──────────────────────────────────────────────────────────
  const factsRows: any[][] = [
    ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
    ...data.facts.map(f => [f.date, f.idSource, f.sourceVl]),
  ];
  const factsSheet = XLSX.utils.aoa_to_sheet(factsRows, { cellDates: true });

  // Format the DATE column as YYYY-MM-DD so Excel shows it cleanly
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
  // Single table: ID_SOURCE | VOLAT_TYPE | TRANSFERABLE_IN_DAYS
  const refRows: any[][] = [
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