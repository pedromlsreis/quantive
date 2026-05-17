/**
 * @module templateGenerator
 * Generates and downloads a blank portfolio Excel template
 * with example data to guide users on the expected format.
 */

import ExcelJS from 'exceljs';

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEFEFEF' } };
const HEADER_FONT = { bold: true };

/**
 * Build the template workbook bytes. Pure function — no DOM, no I/O. Exported
 * so tests can verify the structure without intercepting the download flow.
 */
export async function buildTemplateWorkbook(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();

  // ---------------------------------------------------------------------------
  // Read me — first sheet, so Excel opens it by default. The parser looks up
  // `facts` / `ref` by name (not position), so this leading tab is safe.
  // ---------------------------------------------------------------------------
  const readme = wb.addWorksheet('Read me');
  readme.getColumn(1).width = 26;
  readme.getColumn(2).width = 86;

  const section = (title: string) => {
    const row = readme.addRow([title, '']);
    row.getCell(1).font = { bold: true, size: 12 };
  };
  const item = (label: string, body: string) => {
    const row = readme.addRow([label, body]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.height = 30;
  };
  const blank = () => readme.addRow([]);

  section('How to fill in this template');
  readme.addRow(['', 'Quantive tracks the value of your accounts and assets over time. Fill in two sheets — facts and ref — then upload this file.']);
  readme.getRow(readme.rowCount).getCell(2).alignment = { wrapText: true, vertical: 'top' };
  readme.getRow(readme.rowCount).height = 30;
  blank();

  section('facts sheet — one row per (date, account)');
  item('DATE', 'The day you recorded the balance. Use YYYY-MM-DD (for example, 2024-01-01). Excel date cells also work.');
  item('ID_SOURCE', 'The account or asset name (for example, "CGD savings", "ETF World"). Use the EXACT same spelling across dates so values line up over time.');
  item('SOURCE_VL', 'The balance in that account on that date. Numbers only — no € or $ symbols. Use a dot or comma as the decimal separator.');
  item('CURRENCY', 'The currency this balance is recorded in. ISO 3-letter code (EUR, USD, GBP, BRL…). One currency per row.');
  blank();

  section('ref sheet — one row per unique account');
  item('ID_SOURCE', 'The same name you used in the facts sheet. One row per account.');
  item('VOLAT_TYPE', 'How much its value swings month-to-month. "Stable" for savings or current accounts, "Volatile" for stocks or crypto. Leave blank if unsure.');
  item('TRANSFERABLE_IN_DAYS', 'TRUE if you can withdraw within a few days (savings, brokerage). FALSE for things like pensions or locked deposits.');
  blank();

  section('Tips');
  readme.addRow(['', '• Don\'t rename the column headers — Quantive looks for them by exact name.']);
  readme.addRow(['', '• Each row in facts is one snapshot. Add a new set of rows each month.']);
  readme.addRow(['', '• You can delete this "Read me" tab once you know the format — facts and ref are what gets parsed.']);
  readme.addRow(['', '• Stuck? Open the Add measurement modal in Quantive and copy what you see there.']);

  // ---------------------------------------------------------------------------
  // facts sheet
  // ---------------------------------------------------------------------------
  const factsSheet = wb.addWorksheet('facts');
  factsSheet.columns = [
    { header: 'DATE', key: 'date', width: 14 },
    { header: 'ID_SOURCE', key: 'idSource', width: 22 },
    { header: 'SOURCE_VL', key: 'sourceVl', width: 14 },
    { header: 'CURRENCY', key: 'currency', width: 12 },
  ];
  const factsHeader = factsSheet.getRow(1);
  factsHeader.font = HEADER_FONT;
  factsHeader.fill = HEADER_FILL;
  factsHeader.getCell(1).note = 'Date the balance was recorded. Format: YYYY-MM-DD.';
  factsHeader.getCell(2).note = 'Account or asset name. Use the same spelling across dates so values line up.';
  factsHeader.getCell(3).note = 'Balance value. Numbers only — no currency symbols.';
  factsHeader.getCell(4).note = 'ISO 3-letter currency code: EUR, USD, GBP, BRL…';

  factsSheet.addRow({ date: new Date(2024, 0, 1), idSource: 'Savings Account', sourceVl: 15000, currency: 'EUR' });
  factsSheet.addRow({ date: new Date(2024, 0, 1), idSource: 'ETF World', sourceVl: 25000, currency: 'USD' });
  factsSheet.addRow({ date: new Date(2024, 1, 1), idSource: 'Savings Account', sourceVl: 15100, currency: 'EUR' });
  factsSheet.addRow({ date: new Date(2024, 1, 1), idSource: 'ETF World', sourceVl: 25400, currency: 'USD' });

  // ---------------------------------------------------------------------------
  // ref sheet
  // ---------------------------------------------------------------------------
  const refSheet = wb.addWorksheet('ref');
  refSheet.columns = [
    { header: 'ID_SOURCE', key: 'idSource', width: 22 },
    { header: 'VOLAT_TYPE', key: 'volatType', width: 18 },
    { header: 'TRANSFERABLE_IN_DAYS', key: 'transferableInDays', width: 22 },
  ];
  const refHeader = refSheet.getRow(1);
  refHeader.font = HEADER_FONT;
  refHeader.fill = HEADER_FILL;
  refHeader.getCell(1).note = 'Same name as in the facts sheet. One row per account.';
  refHeader.getCell(2).note = '"Stable" for savings, "Volatile" for stocks or crypto. Blank if unsure.';
  refHeader.getCell(3).note = 'TRUE = can withdraw within a few days. FALSE = locked away.';

  refSheet.addRow({ idSource: 'Savings Account', volatType: 'Stable', transferableInDays: true });
  refSheet.addRow({ idSource: 'ETF World', volatType: 'Volatile', transferableInDays: true });

  return await wb.xlsx.writeBuffer() as ArrayBuffer;
}

/**
 * Download a pre-filled Excel template that users can populate with their own data.
 *
 * Sheets:
 * - **Read me**: plain-English column reference and tips. Opens first.
 * - **facts**: DATE, ID_SOURCE, SOURCE_VL, CURRENCY — one row per (date, account).
 * - **ref**: ID_SOURCE, VOLAT_TYPE, TRANSFERABLE_IN_DAYS — one row per account.
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
