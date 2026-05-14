/**
 * @module templateGenerator
 * Generates and downloads a blank portfolio Excel template
 * with example data to guide users on the expected format.
 */

import ExcelJS from 'exceljs';

/**
 * Build the template workbook bytes. Pure function — no DOM, no I/O. Exported
 * so tests can verify the structure without intercepting the download flow.
 */
export async function buildTemplateWorkbook(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();

  // Facts sheet with example rows
  const factsSheet = wb.addWorksheet('facts');
  factsSheet.columns = [
    { header: 'DATE', key: 'date', width: 14 },
    { header: 'ID_SOURCE', key: 'idSource', width: 20 },
    { header: 'SOURCE_VL', key: 'sourceVl', width: 14 },
    { header: 'CURRENCY', key: 'currency', width: 10 },
  ];
  factsSheet.addRow({ date: new Date(2024, 0, 1), idSource: 'Savings Account', sourceVl: 15000, currency: 'EUR' });
  factsSheet.addRow({ date: new Date(2024, 0, 1), idSource: 'ETF World', sourceVl: 25000, currency: 'USD' });
  factsSheet.addRow({ date: new Date(2024, 1, 1), idSource: 'Savings Account', sourceVl: 15100, currency: 'EUR' });
  factsSheet.addRow({ date: new Date(2024, 1, 1), idSource: 'ETF World', sourceVl: 25400, currency: 'USD' });

  // Ref sheet with sources reference table
  const refSheet = wb.addWorksheet('ref');
  refSheet.columns = [
    { header: 'ID_SOURCE', key: 'idSource', width: 20 },
    { header: 'VOLAT_TYPE', key: 'volatType', width: 18 },
    { header: 'TRANSFERABLE_IN_DAYS', key: 'transferableInDays', width: 22 },
  ];
  refSheet.addRow({ idSource: 'Savings Account', volatType: 'Non-Volatile', transferableInDays: true });
  refSheet.addRow({ idSource: 'ETF World', volatType: 'Volatile', transferableInDays: true });

  return await wb.xlsx.writeBuffer() as ArrayBuffer;
}

/**
 * Download a pre-filled Excel template that users can populate with their own data.
 *
 * The template contains:
 * - **facts sheet**: Example rows with DATE, ID_SOURCE, SOURCE_VL, CURRENCY columns
 * - **ref sheet**: Example rows with ID_SOURCE, VOLAT_TYPE, TRANSFERABLE_IN_DAYS columns
 */
export async function downloadExcelTemplate(): Promise<void> {
  const buf = await buildTemplateWorkbook();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'portfolio_template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
