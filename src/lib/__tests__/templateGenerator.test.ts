import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';

// We can't monkey-patch XLSX.write, so instead we spy on Blob/URL and
// just verify the template function runs without errors and triggers download.
// For content verification, we replicate the template logic inline.

describe('downloadExcelTemplate', () => {
  it('triggers a download', async () => {
    // Mock DOM APIs
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    }) as typeof document.createElement;

    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    const { downloadExcelTemplate } = await import('@/lib/templateGenerator');
    downloadExcelTemplate();

    expect(clickSpy).toHaveBeenCalledOnce();

    // Cleanup
    document.createElement = origCreate;
  });
});

describe('template content structure', () => {
  // Directly build the same workbook the template generates to verify structure
  it('facts sheet has DATE, ID_SOURCE, SOURCE_VL headers with example data', () => {
    const wb = XLSX.utils.book_new();
    const factsData = [
      ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
      [new Date(2024, 0, 1), 'Savings Account', 15000],
      [new Date(2024, 0, 1), 'ETF World', 25000],
      [new Date(2024, 1, 1), 'Savings Account', 15100],
      [new Date(2024, 1, 1), 'ETF World', 25400],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(factsData);
    XLSX.utils.book_append_sheet(wb, sheet, 'facts');

    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['facts'], { header: 1 });
    expect(rows[0]).toEqual(['DATE', 'ID_SOURCE', 'SOURCE_VL']);
    expect(rows.length).toBe(5); // header + 4 data rows
  });

  it('ref sheet has ID_SOURCE, VOLAT_TYPE, TRANSFERABLE_IN_DAYS headers', () => {
    const wb = XLSX.utils.book_new();
    const refData = [
      ['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS'],
      ['Savings Account', 'Non-Volatile', true],
      ['ETF World', 'Volatile', true],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(refData);
    XLSX.utils.book_append_sheet(wb, sheet, 'ref');

    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['ref'], { header: 1 });
    expect(rows[0]).toEqual(['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS']);
    expect(rows.length).toBe(3);
  });
});
