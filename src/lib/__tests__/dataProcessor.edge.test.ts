import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parsePortfolioExcel } from '@/lib/dataProcessor';

async function createWorkbook(
  factsData: unknown[][],
  refData: unknown[][],
  refSheetName = 'ref',
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const facts = wb.addWorksheet('facts');
  factsData.forEach(row => facts.addRow(row));
  const ref = wb.addWorksheet(refSheetName);
  refData.forEach(row => ref.addRow(row));
  return await wb.xlsx.writeBuffer() as ArrayBuffer;
}

describe('parsePortfolioExcel edge cases', () => {
  const validRef: unknown[][] = [
    ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
    ['Savings', 'Non-Volatile', true],
  ];

  it('handles case-insensitive headers (date, id_source, source_vl)', async () => {
    const facts: unknown[][] = [
      ['date', 'id_source', 'source_vl'],
      [new Date(2024, 0, 1), 'Savings', 5000],
    ];
    const buf = await createWorkbook(facts, validRef);
    const result = await parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].sourceVl).toBe(5000);
  });

  it('handles mixed-case column headers (Date, Id_Source)', async () => {
    const facts: unknown[][] = [
      ['Date', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Savings', 3000],
    ];
    const buf = await createWorkbook(facts, validRef);
    const result = await parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
  });

  it('filters out rows with NaN sourceVl', async () => {
    const facts: unknown[][] = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Savings', 1000],
      [new Date(2024, 1, 1), 'Savings', 'not_a_number'],
    ];
    const buf = await createWorkbook(facts, validRef);
    const result = await parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
  });

  it('filters out rows with empty idSource', async () => {
    const facts: unknown[][] = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), '', 1000],
      [new Date(2024, 0, 1), 'Savings', 2000],
    ];
    const buf = await createWorkbook(facts, validRef);
    const result = await parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].idSource).toBe('Savings');
  });

  it('parses boolean TRANSFERABLE_IN_DAYS as string "yes"', async () => {
    const ref: unknown[][] = [
      ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
      ['Test', 'Volatile', 'yes'],
    ];
    const facts: unknown[][] = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Test', 100],
    ];
    const buf = await createWorkbook(facts, ref);
    const result = await parsePortfolioExcel(buf);
    expect(result.refSources[0].transferableInDays).toBe(true);
  });

  it('parses boolean TRANSFERABLE_IN_DAYS as number 0', async () => {
    const ref: unknown[][] = [
      ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
      ['Test', 'Volatile', 0],
    ];
    const facts: unknown[][] = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Test', 100],
    ];
    const buf = await createWorkbook(facts, ref);
    const result = await parsePortfolioExcel(buf);
    expect(result.refSources[0].transferableInDays).toBe(false);
  });

  it('throws when all fact rows are invalid', async () => {
    const facts: unknown[][] = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), '', 'bad'],
    ];
    const buf = await createWorkbook(facts, validRef);
    await expect(parsePortfolioExcel(buf)).rejects.toThrow();
  });

  it('handles ref sheet with different name (uses second sheet)', async () => {
    const facts: unknown[][] = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Savings', 1000],
    ];
    const ref: unknown[][] = [
      ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
      ['Savings', 'Non-Volatile', true],
    ];
    const buf = await createWorkbook(facts, ref, 'references');
    const result = await parsePortfolioExcel(buf);
    expect(result.refSources).toHaveLength(1);
  });
});
