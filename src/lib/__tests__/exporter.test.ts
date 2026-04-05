import { describe, it, expect } from 'vitest';
import { downloadExcelTemplate } from '@/lib/templateGenerator';
import { exportPortfolioExcel } from '@/lib/exporter';
import type { PortfolioData } from '@/lib/types';

// Mock the DOM download mechanism
function mockDownload() {
  const clicks: string[] = [];
  const origCreate = document.createElement.bind(document);
  const origCreateObj = URL.createObjectURL;
  const origRevokeObj = URL.revokeObjectURL;

  URL.createObjectURL = () => 'blob:mock-url';
  URL.revokeObjectURL = () => {};

  const origCreateElement = document.createElement;
  document.createElement = ((tag: string) => {
    const el = origCreate(tag);
    if (tag === 'a') {
      el.click = () => clicks.push(el.download || 'unknown');
    }
    return el;
  }) as typeof document.createElement;

  return {
    clicks,
    restore: () => {
      document.createElement = origCreateElement;
      URL.createObjectURL = origCreateObj;
      URL.revokeObjectURL = origRevokeObj;
    },
  };
}

describe('downloadExcelTemplate', () => {
  it('triggers a file download with the correct filename', () => {
    const mock = mockDownload();
    downloadExcelTemplate();
    expect(mock.clicks).toContain('portfolio_template.xlsx');
    mock.restore();
  });
});

describe('exportPortfolioExcel', () => {
  const sampleData: PortfolioData = {
    facts: [
      { date: new Date(2024, 0, 1), idSource: 'Savings', sourceVl: 10000 },
      { date: new Date(2024, 1, 1), idSource: 'Savings', sourceVl: 10500 },
    ],
    refSources: [
      { idSource: 'Savings', volatType: 'Non-Volatile', transferableInDays: true },
    ],
  };

  it('triggers a download with default filename', () => {
    const mock = mockDownload();
    exportPortfolioExcel(sampleData);
    expect(mock.clicks).toContain('portfolio_export.xlsx');
    mock.restore();
  });

  it('uses a custom filename when provided', () => {
    const mock = mockDownload();
    exportPortfolioExcel(sampleData, 'custom.xlsx');
    expect(mock.clicks).toContain('custom.xlsx');
    mock.restore();
  });
});
