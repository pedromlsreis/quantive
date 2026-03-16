import { describe, it, expect } from 'vitest';
import { parsePortfolioExcel } from '@/lib/dataProcessor';
import * as XLSX from 'xlsx';

function createTestWorkbook(factsData: any[][], refData: any[][]) {
  const wb = XLSX.utils.book_new();
  const factsSheet = XLSX.utils.aoa_to_sheet(factsData);
  XLSX.utils.book_append_sheet(wb, factsSheet, 'facts');
  const refSheet = XLSX.utils.aoa_to_sheet(refData);
  XLSX.utils.book_append_sheet(wb, refSheet, 'ref');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return buf as ArrayBuffer;
}

describe('parsePortfolioExcel', () => {
  const validFacts = [
    ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
    [new Date(2024, 0, 1), 'Savings', 10000],
    [new Date(2024, 1, 1), 'Savings', 10500],
    [new Date(2024, 0, 1), 'ETF', 20000],
    [new Date(2024, 1, 1), 'ETF', 21000],
  ];

  const validRef = [
    ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
    ['Savings', 'Non-Volatile', true],
    ['ETF', 'Volatile', true],
  ];

  it('parses a valid workbook', () => {
    const buffer = createTestWorkbook(validFacts, validRef);
    const result = parsePortfolioExcel(buffer);
    expect(result.facts).toHaveLength(4);
    expect(result.refSources).toHaveLength(2);
  });

  it('parses dates correctly', () => {
    const buffer = createTestWorkbook(validFacts, validRef);
    const result = parsePortfolioExcel(buffer);
    result.facts.forEach(f => {
      expect(f.date).toBeInstanceOf(Date);
      expect(f.date.getTime()).not.toBeNaN();
    });
  });

  it('throws on empty data', () => {
    const emptyFacts = [['DATE', 'ID_SOURCE', 'SOURCE_VL']];
    const buffer = createTestWorkbook(emptyFacts, validRef);
    expect(() => parsePortfolioExcel(buffer)).toThrow();
  });

  it('handles missing ref data gracefully', () => {
    const emptyRef = [['no_matching_headers']];
    const buffer = createTestWorkbook(validFacts, emptyRef);
    const result = parsePortfolioExcel(buffer);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.refSources).toHaveLength(0);
  });
});
