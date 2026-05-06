import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { buildTemplateWorkbook, downloadExcelTemplate } from '@/lib/templateGenerator';

describe('downloadExcelTemplate', () => {
  it('triggers a download', async () => {
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

    await downloadExcelTemplate();

    expect(clickSpy).toHaveBeenCalledOnce();

    document.createElement = origCreate;
  });
});

describe('template content structure', () => {
  it('facts sheet has DATE, ID_SOURCE, SOURCE_VL headers with example data', async () => {
    const buf = await buildTemplateWorkbook();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const factsSheet = wb.getWorksheet('facts');
    expect(factsSheet).toBeDefined();

    const headerRow = factsSheet!.getRow(1);
    expect(headerRow.getCell(1).value).toBe('DATE');
    expect(headerRow.getCell(2).value).toBe('ID_SOURCE');
    expect(headerRow.getCell(3).value).toBe('SOURCE_VL');

    expect(factsSheet!.actualRowCount).toBe(5); // header + 4 data rows
  });

  it('ref sheet has ID_SOURCE, VOLAT_TYPE, TRANSFERABLE_IN_DAYS headers', async () => {
    const buf = await buildTemplateWorkbook();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const refSheet = wb.getWorksheet('ref');
    expect(refSheet).toBeDefined();

    const headerRow = refSheet!.getRow(1);
    expect(headerRow.getCell(1).value).toBe('ID_SOURCE');
    expect(headerRow.getCell(2).value).toBe('VOLAT_TYPE');
    expect(headerRow.getCell(3).value).toBe('TRANSFERABLE_IN_DAYS');

    expect(refSheet!.actualRowCount).toBe(3); // header + 2 data rows
  });
});
