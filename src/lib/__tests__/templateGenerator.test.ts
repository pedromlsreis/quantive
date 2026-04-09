import { describe, it, expect } from 'vitest';
import { downloadExcelTemplate } from '@/lib/templateGenerator';
import * as XLSX from 'xlsx';

// Intercept the generated workbook for inspection
function captureWorkbook() {
  let capturedBuf: ArrayBuffer | null = null;
  const origCreate = document.createElement.bind(document);
  const origCreateObj = URL.createObjectURL;
  const origRevokeObj = URL.revokeObjectURL;
  const origWrite = XLSX.write;

  // Monkey-patch XLSX.write to capture the buffer
  (XLSX as any).write = (wb: XLSX.WorkBook, opts: any) => {
    const buf = origWrite(wb, opts);
    capturedBuf = buf;
    return buf;
  };

  URL.createObjectURL = () => 'blob:mock';
  URL.revokeObjectURL = () => {};
  const origCreateElement = document.createElement;
  document.createElement = ((tag: string) => {
    const el = origCreate(tag);
    if (tag === 'a') el.click = () => {};
    return el;
  }) as typeof document.createElement;

  return {
    getBuffer: () => capturedBuf,
    restore: () => {
      (XLSX as any).write = origWrite;
      document.createElement = origCreateElement;
      URL.createObjectURL = origCreateObj;
      URL.revokeObjectURL = origRevokeObj;
    },
  };
}

describe('downloadExcelTemplate content', () => {
  it('generates a workbook with facts and ref sheets', () => {
    const cap = captureWorkbook();
    downloadExcelTemplate();
    const buf = cap.getBuffer()!;
    cap.restore();

    expect(buf).not.toBeNull();
    const wb = XLSX.read(buf, { type: 'array' });
    expect(wb.SheetNames).toContain('facts');
    expect(wb.SheetNames).toContain('ref');
  });

  it('facts sheet has correct headers and example rows', () => {
    const cap = captureWorkbook();
    downloadExcelTemplate();
    const buf = cap.getBuffer()!;
    cap.restore();

    const wb = XLSX.read(buf, { type: 'array' });
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['facts'], { header: 1 });
    expect(rows[0]).toEqual(['DATE', 'ID_SOURCE', 'SOURCE_VL']);
    expect(rows.length).toBeGreaterThan(1); // has example data
  });

  it('ref sheet has correct headers', () => {
    const cap = captureWorkbook();
    downloadExcelTemplate();
    const buf = cap.getBuffer()!;
    cap.restore();

    const wb = XLSX.read(buf, { type: 'array' });
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['ref'], { header: 1 });
    expect(rows[0]).toEqual(['ID_SOURCE', 'VOLAT_TYPE', 'TRANSFERABLE_IN_DAYS']);
    expect(rows.length).toBeGreaterThan(1);
  });
});
