import { describe, it, expect } from 'vitest';
import { downloadExcelTemplate } from '@/lib/templateGenerator';
import {
  buildPortfolioCsv,
  exportPortfolioCsv,
  exportPortfolioExcel,
} from '@/lib/exporter';
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
  it('triggers a file download with the correct filename', async () => {
    const mock = mockDownload();
    await downloadExcelTemplate();
    expect(mock.clicks).toContain('portfolio_template.xlsx');
    mock.restore();
  });
});

describe('exportPortfolioExcel', () => {
  const sampleData: PortfolioData = {
    facts: [
      { date: new Date(2024, 0, 1), idSource: 'Savings', sourceVl: 10000, currency: 'EUR' },
      { date: new Date(2024, 1, 1), idSource: 'Savings', sourceVl: 10500, currency: 'EUR' },
    ],
    refSources: [
      { idSource: 'Savings', volatType: 'Non-Volatile', transferableInDays: true },
    ],
  };

  it('triggers a download with default filename', async () => {
    const mock = mockDownload();
    await exportPortfolioExcel(sampleData);
    expect(mock.clicks).toContain('portfolio_export.xlsx');
    mock.restore();
  });

  it('uses a custom filename when provided', async () => {
    const mock = mockDownload();
    await exportPortfolioExcel(sampleData, 'custom.xlsx');
    expect(mock.clicks).toContain('custom.xlsx');
    mock.restore();
  });
});

describe('buildPortfolioCsv', () => {
  it('emits a header row followed by one row per fact', () => {
    const csv = buildPortfolioCsv({
      facts: [
        { date: new Date(2024, 0, 1), idSource: 'Savings', sourceVl: 10000, currency: 'EUR' },
        { date: new Date(2024, 1, 15), idSource: 'Savings', sourceVl: 10500.5, currency: 'EUR' },
      ],
      refSources: [],
    });
    expect(csv).toBe(
      'DATE,ID_SOURCE,SOURCE_VL,CURRENCY\r\n' +
      '2024-01-01,Savings,10000,EUR\r\n' +
      '2024-02-15,Savings,10500.5,EUR',
    );
  });

  it('emits only the header when there are no facts', () => {
    const csv = buildPortfolioCsv({ facts: [], refSources: [] });
    expect(csv).toBe('DATE,ID_SOURCE,SOURCE_VL,CURRENCY');
  });

  it('quotes source names containing commas, quotes, or newlines (RFC 4180)', () => {
    const csv = buildPortfolioCsv({
      facts: [
        { date: new Date(2024, 0, 1), idSource: 'Acme, Inc.', sourceVl: 1, currency: 'EUR' },
        { date: new Date(2024, 0, 2), idSource: 'He said "hi"', sourceVl: 2, currency: 'EUR' },
        { date: new Date(2024, 0, 3), idSource: 'line1\nline2', sourceVl: 3, currency: 'EUR' },
      ],
      refSources: [],
    });
    const rows = csv.split('\r\n');
    expect(rows[1]).toBe('2024-01-01,"Acme, Inc.",1,EUR');
    expect(rows[2]).toBe('2024-01-02,"He said ""hi""",2,EUR');
    expect(rows[3]).toBe('2024-01-03,"line1\nline2",3,EUR');
  });

  it('renders numbers as plain digits without thousand separators', () => {
    const csv = buildPortfolioCsv({
      facts: [
        { date: new Date(2024, 0, 1), idSource: 'A', sourceVl: 1234567.89, currency: 'USD' },
      ],
      refSources: [],
    });
    expect(csv).toContain(',1234567.89,');
  });

  it('neutralises formula injection in source names with a leading quote', () => {
    // A leading =, +, -, or @ would run as a formula when the CSV is opened in
    // Excel/Sheets. Prefixing a single quote disarms the cell.
    const csv = buildPortfolioCsv({
      facts: [
        { date: new Date(2024, 0, 1), idSource: '=1+1', sourceVl: 1, currency: 'EUR' },
        { date: new Date(2024, 0, 2), idSource: '@SUM(A1)', sourceVl: 2, currency: 'EUR' },
        { date: new Date(2024, 0, 3), idSource: '+1', sourceVl: 3, currency: 'EUR' },
        { date: new Date(2024, 0, 4), idSource: '-1+2', sourceVl: 4, currency: 'EUR' },
      ],
      refSources: [],
    });
    const rows = csv.split('\r\n');
    expect(rows[1]).toBe("2024-01-01,'=1+1,1,EUR");
    expect(rows[2]).toBe("2024-01-02,'@SUM(A1),2,EUR");
    expect(rows[3]).toBe("2024-01-03,'+1,3,EUR");
    expect(rows[4]).toBe("2024-01-04,'-1+2,4,EUR");
  });

  it('quotes AND disarms a formula that also contains special characters', () => {
    const csv = buildPortfolioCsv({
      facts: [
        { date: new Date(2024, 0, 1), idSource: '=HYPERLINK("http://x")', sourceVl: 1, currency: 'EUR' },
      ],
      refSources: [],
    });
    expect(csv.split('\r\n')[1]).toBe('2024-01-01,"\'=HYPERLINK(""http://x"")",1,EUR');
  });

  it('does NOT disarm a negative numeric value (numeric column stays numeric)', () => {
    // A liability's negative SOURCE_VL must import as a number, not text — it is
    // written raw, never quote-prefixed.
    const csv = buildPortfolioCsv({
      facts: [
        { date: new Date(2024, 0, 1), idSource: 'Mortgage', sourceVl: -250000, currency: 'EUR' },
      ],
      refSources: [],
    });
    expect(csv.split('\r\n')[1]).toBe('2024-01-01,Mortgage,-250000,EUR');
  });
});

describe('exportPortfolioCsv', () => {
  const sampleData: PortfolioData = {
    facts: [
      { date: new Date(2024, 0, 1), idSource: 'Savings', sourceVl: 10000, currency: 'EUR' },
    ],
    refSources: [],
  };

  it('triggers a download with the default filename', () => {
    const mock = mockDownload();
    exportPortfolioCsv(sampleData);
    expect(mock.clicks).toContain('portfolio_export.csv');
    mock.restore();
  });

  it('uses a custom filename when provided', () => {
    const mock = mockDownload();
    exportPortfolioCsv(sampleData, 'custom.csv');
    expect(mock.clicks).toContain('custom.csv');
    mock.restore();
  });
});
