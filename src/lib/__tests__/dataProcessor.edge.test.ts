import { describe, it, expect } from 'vitest';
import { parsePortfolioExcel } from '@/lib/dataProcessor';
import * as XLSX from 'xlsx';

function createWorkbook(factsData: any[][], refData: any[][], refSheetName = 'ref') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(factsData), 'facts');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(refData), refSheetName);
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

describe('parsePortfolioExcel edge cases', () => {
  const validRef = [
    ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
    ['Savings', 'Non-Volatile', true],
  ];

  it('handles case-insensitive headers (date, id_source, source_vl)', () => {
    const facts = [
      ['date', 'id_source', 'source_vl'],
      [new Date(2024, 0, 1), 'Savings', 5000],
    ];
    const buf = createWorkbook(facts, validRef);
    const result = parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].sourceVl).toBe(5000);
  });

  it('handles mixed-case column headers (Date, Id_Source)', () => {
    const facts = [
      ['Date', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Savings', 3000],
    ];
    const buf = createWorkbook(facts, validRef);
    const result = parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
  });

  it('filters out rows with NaN sourceVl', () => {
    const facts = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Savings', 1000],
      [new Date(2024, 1, 1), 'Savings', 'not_a_number'],
    ];
    const buf = createWorkbook(facts, validRef);
    const result = parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
  });

  it('filters out rows with empty idSource', () => {
    const facts = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), '', 1000],
      [new Date(2024, 0, 1), 'Savings', 2000],
    ];
    const buf = createWorkbook(facts, validRef);
    const result = parsePortfolioExcel(buf);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].idSource).toBe('Savings');
  });

  it('parses boolean TRANSFERABLE_IN_DAYS as string "yes"', () => {
    const ref = [
      ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
      ['Test', 'Volatile', 'yes'],
    ];
    const facts = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Test', 100],
    ];
    const buf = createWorkbook(facts, ref);
    const result = parsePortfolioExcel(buf);
    expect(result.refSources[0].transferableInDays).toBe(true);
  });

  it('parses boolean TRANSFERABLE_IN_DAYS as number 0', () => {
    const ref = [
      ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
      ['Test', 'Volatile', 0],
    ];
    const facts = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Test', 100],
    ];
    const buf = createWorkbook(facts, ref);
    const result = parsePortfolioExcel(buf);
    expect(result.refSources[0].transferableInDays).toBe(false);
  });

  it('throws when all fact rows are invalid', () => {
    const facts = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), '', 'bad'],
    ];
    const buf = createWorkbook(facts, validRef);
    expect(() => parsePortfolioExcel(buf)).toThrow();
  });

  it('handles ref sheet with different name (uses second sheet)', () => {
    const facts = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Savings', 1000],
    ];
    const ref = [
      ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
      ['Savings', 'Non-Volatile', true],
    ];
    const buf = createWorkbook(facts, ref, 'references');
    const result = parsePortfolioExcel(buf);
    expect(result.refSources).toHaveLength(1);
  });
});
