import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parsePortfolioExcel } from '@/lib/dataProcessor';

async function createTestWorkbook(factsData: unknown[][], refData: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const facts = wb.addWorksheet('facts');
  factsData.forEach(row => facts.addRow(row));
  const ref = wb.addWorksheet('ref');
  refData.forEach(row => ref.addRow(row));
  return await wb.xlsx.writeBuffer() as ArrayBuffer;
}

describe('parsePortfolioExcel', () => {
  const validFacts: unknown[][] = [
    ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
    [new Date(2024, 0, 1), 'Savings', 10000],
    [new Date(2024, 1, 1), 'Savings', 10500],
    [new Date(2024, 0, 1), 'ETF', 20000],
    [new Date(2024, 1, 1), 'ETF', 21000],
  ];

  const validRef: unknown[][] = [
    ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
    ['Savings', 'Non-Volatile', true],
    ['ETF', 'Volatile', true],
  ];

  it('parses a valid workbook', async () => {
    const buffer = await createTestWorkbook(validFacts, validRef);
    const result = await parsePortfolioExcel(buffer);
    expect(result.facts).toHaveLength(4);
    expect(result.refSources).toHaveLength(2);
  });

  it('parses dates correctly', async () => {
    const buffer = await createTestWorkbook(validFacts, validRef);
    const result = await parsePortfolioExcel(buffer);
    result.facts.forEach(f => {
      expect(f.date).toBeInstanceOf(Date);
      expect(f.date.getTime()).not.toBeNaN();
    });
  });

  it('throws on empty data', async () => {
    const emptyFacts: unknown[][] = [['DATE', 'ID_SOURCE', 'SOURCE_VL']];
    const buffer = await createTestWorkbook(emptyFacts, validRef);
    await expect(parsePortfolioExcel(buffer)).rejects.toThrow();
  });

  it('handles missing ref data gracefully', async () => {
    const emptyRef: unknown[][] = [['no_matching_headers']];
    const buffer = await createTestWorkbook(validFacts, emptyRef);
    const result = await parsePortfolioExcel(buffer);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.refSources).toHaveLength(0);
  });
});
