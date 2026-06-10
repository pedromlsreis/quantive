import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parsePortfolioExcel } from '@/lib/dataProcessor';

/** Build a workbook from an arbitrary list of [sheetName, rows] pairs. */
async function workbookOf(...sheets: [string, unknown[][]][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of sheets) {
    const ws = wb.addWorksheet(name);
    rows.forEach((row) => ws.addRow(row));
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const REF: unknown[][] = [
  ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
  ['Savings', 'Non-Volatile', true],
];

describe('parsePortfolioExcel — value coercion', () => {
  it('preserves a negative SOURCE_VL (liability row)', async () => {
    const buf = await workbookOf(
      ['facts', [['DATE', 'ID_SOURCE', 'SOURCE_VL'], [new Date(2024, 0, 1), 'Mortgage', -250_000]]],
      ['ref', REF],
    );
    const result = await parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].sourceVl).toBe(-250_000);
  });

  it('keeps a zero SOURCE_VL rather than filtering it out', async () => {
    const buf = await workbookOf(
      ['facts', [['DATE', 'ID_SOURCE', 'SOURCE_VL'], [new Date(2024, 0, 1), 'Cash', 0]]],
      ['ref', REF],
    );
    const result = await parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].sourceVl).toBe(0);
  });
});

describe('parsePortfolioExcel — date parsing', () => {
  it('parses an Excel serial-number date (1900 system)', async () => {
    // 45292 is the Excel serial for 2024-01-01.
    const buf = await workbookOf(
      ['facts', [['DATE', 'ID_SOURCE', 'SOURCE_VL'], [45292, 'Savings', 1000]]],
      ['ref', REF],
    );
    const result = await parsePortfolioExcel(buf);
    const d = result.facts[0].date;
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });

  it('parses an ISO date string', async () => {
    const buf = await workbookOf(
      ['facts', [['DATE', 'ID_SOURCE', 'SOURCE_VL'], ['2024-03-15', 'Savings', 1000]]],
      ['ref', REF],
    );
    const result = await parsePortfolioExcel(buf);
    const d = result.facts[0].date;
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(2); // March
  });
});

describe('parsePortfolioExcel — CURRENCY column', () => {
  it('reads a CURRENCY column into the fact', async () => {
    const buf = await workbookOf(
      ['facts', [['DATE', 'ID_SOURCE', 'SOURCE_VL', 'CURRENCY'], [new Date(2024, 0, 1), 'Brokerage', 1000, 'USD']]],
      ['ref', REF],
    );
    const result = await parsePortfolioExcel(buf);
    expect(result.facts[0].currency).toBe('USD');
  });

  it('defaults to EUR when the CURRENCY cell is blank or unrecognised', async () => {
    const buf = await workbookOf(
      ['facts', [
        ['DATE', 'ID_SOURCE', 'SOURCE_VL', 'CURRENCY'],
        [new Date(2024, 0, 1), 'A', 1000, ''],
        [new Date(2024, 0, 2), 'B', 2000, 'XYZ'],
      ]],
      ['ref', REF],
    );
    const result = await parsePortfolioExcel(buf);
    expect(result.facts[0].currency).toBe('EUR');
    expect(result.facts[1].currency).toBe('EUR');
  });

  it('defaults to EUR when there is no CURRENCY column (legacy template)', async () => {
    const buf = await workbookOf(
      ['facts', [['DATE', 'ID_SOURCE', 'SOURCE_VL'], [new Date(2024, 0, 1), 'A', 1000]]],
      ['ref', REF],
    );
    const result = await parsePortfolioExcel(buf);
    expect(result.facts[0].currency).toBe('EUR');
  });
});

describe('parsePortfolioExcel — sheet resolution', () => {
  it('parses a single-sheet workbook (facts only, no ref sheet)', async () => {
    const buf = await workbookOf(
      ['facts', [['DATE', 'ID_SOURCE', 'SOURCE_VL'], [new Date(2024, 0, 1), 'Savings', 1000]]],
    );
    const result = await parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
    expect(result.refSources).toHaveLength(0);
  });

  it('finds sheets by name when facts is not the first sheet (leading "Read me" tab)', async () => {
    const buf = await workbookOf(
      ['Read me', [['Welcome to the template']]],
      ['facts', [['DATE', 'ID_SOURCE', 'SOURCE_VL'], [new Date(2024, 0, 1), 'Savings', 1000]]],
      ['ref', REF],
    );
    const result = await parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
    expect(result.refSources).toHaveLength(1);
  });

  it('throws when the workbook has no sheets', async () => {
    const wb = new ExcelJS.Workbook();
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    await expect(parsePortfolioExcel(buf)).rejects.toThrow();
  });
});
