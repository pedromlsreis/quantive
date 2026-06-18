/**
 * Round-trip tests: exporter output must parse back to the same data via
 * the parser. Catches subtle drift between the two halves (header naming,
 * cell formatting, sheet-name conventions) that unit tests on either side
 * alone would miss.
 */

import { describe, it, expect } from 'vitest';
import { buildPortfolioWorkbook } from '@/lib/exporter';
import { buildTemplateWorkbook } from '@/lib/templateGenerator';
import { parsePortfolioExcel } from '@/lib/dataProcessor';
import type { PortfolioData } from '@/lib/types';

const sample: PortfolioData = {
  facts: [
    { date: new Date(2024, 0, 1), idSource: 'Savings', sourceVl: 10000, currency: 'EUR' },
    { date: new Date(2024, 1, 1), idSource: 'Savings', sourceVl: 10500.55, currency: 'EUR' },
    { date: new Date(2024, 0, 1), idSource: 'ETF World', sourceVl: 25000, currency: 'USD' },
    { date: new Date(2024, 5, 15), idSource: 'ETF World', sourceVl: 27300.75, currency: 'USD' },
  ],
  refSources: [
    { idSource: 'Savings', volatType: 'Non-Volatile', transferableInDays: true },
    { idSource: 'ETF World', volatType: 'Volatile', transferableInDays: false },
  ],
  goals: [],
};

describe('Excel round-trip: export → parse', () => {
  it('preserves all fact rows', async () => {
    const buf = await buildPortfolioWorkbook(sample);
    const parsed = await parsePortfolioExcel(buf);
    expect(parsed.facts).toHaveLength(sample.facts.length);
  });

  it('preserves fact values byte-equivalently (date, idSource, sourceVl, currency)', async () => {
    const buf = await buildPortfolioWorkbook(sample);
    const parsed = await parsePortfolioExcel(buf);
    parsed.facts.forEach((f, i) => {
      const expected = sample.facts[i];
      expect(f.idSource).toBe(expected.idSource);
      expect(f.sourceVl).toBeCloseTo(expected.sourceVl, 6);
      expect(f.date.getTime()).toBe(expected.date.getTime());
      expect(f.currency).toBe(expected.currency);
    });
  });

  it('defaults missing CURRENCY column to EUR (back-compat with pre-multi-currency files)', async () => {
    // Hand-built workbook with the original 3-column shape — no CURRENCY column.
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.default.Workbook();
    const sheet = wb.addWorksheet('facts');
    sheet.columns = [
      { header: 'DATE', key: 'date', width: 14 },
      { header: 'ID_SOURCE', key: 'idSource', width: 20 },
      { header: 'SOURCE_VL', key: 'sourceVl', width: 14 },
    ];
    sheet.addRow({ date: new Date(2024, 0, 1), idSource: 'Legacy', sourceVl: 5000 });
    const buf = await wb.xlsx.writeBuffer() as ArrayBuffer;
    const parsed = await parsePortfolioExcel(buf);
    expect(parsed.facts).toHaveLength(1);
    expect(parsed.facts[0].currency).toBe('EUR');
  });

  it('preserves all refSources with boolean-typed transferableInDays', async () => {
    const buf = await buildPortfolioWorkbook(sample);
    const parsed = await parsePortfolioExcel(buf);
    expect(parsed.refSources).toEqual(sample.refSources);
    parsed.refSources.forEach(r => {
      expect(typeof r.transferableInDays).toBe('boolean');
    });
  });

  it('handles fractional currency values', async () => {
    const data: PortfolioData = {
      facts: [
        { date: new Date(2024, 0, 1), idSource: 'X', sourceVl: 1234.56, currency: 'EUR' },
      ],
      refSources: [
        { idSource: 'X', volatType: 'Volatile', transferableInDays: true },
      ],
      goals: [],
    };
    const buf = await buildPortfolioWorkbook(data);
    const parsed = await parsePortfolioExcel(buf);
    expect(parsed.facts[0].sourceVl).toBeCloseTo(1234.56, 6);
  });

  it('handles unicode in idSource (accents, CJK, emoji)', async () => {
    const data: PortfolioData = {
      facts: [
        { date: new Date(2024, 0, 1), idSource: 'Caixa Geral 💰', sourceVl: 100, currency: 'EUR' },
        { date: new Date(2024, 0, 1), idSource: 'Crédit Agricole', sourceVl: 200, currency: 'EUR' },
        { date: new Date(2024, 0, 1), idSource: '日本株式', sourceVl: 300, currency: 'EUR' },
      ],
      refSources: [
        { idSource: 'Caixa Geral 💰', volatType: 'Non-Volatile', transferableInDays: true },
        { idSource: 'Crédit Agricole', volatType: 'Non-Volatile', transferableInDays: true },
        { idSource: '日本株式', volatType: 'Volatile', transferableInDays: true },
      ],
      goals: [],
    };
    const buf = await buildPortfolioWorkbook(data);
    const parsed = await parsePortfolioExcel(buf);
    expect(parsed.facts.map(f => f.idSource)).toEqual(data.facts.map(f => f.idSource));
    expect(parsed.refSources.map(r => r.idSource)).toEqual(data.refSources.map(r => r.idSource));
  });

  it('handles empty refSources', async () => {
    const data: PortfolioData = {
      facts: [
        { date: new Date(2024, 0, 1), idSource: 'X', sourceVl: 100, currency: 'EUR' },
      ],
      refSources: [],
      goals: [],
    };
    const buf = await buildPortfolioWorkbook(data);
    const parsed = await parsePortfolioExcel(buf);
    expect(parsed.facts).toHaveLength(1);
    expect(parsed.refSources).toHaveLength(0);
  });

  it('handles a large dataset (1000 fact rows)', async () => {
    const facts = Array.from({ length: 1000 }, (_, i) => ({
      date: new Date(2024, 0, 1 + (i % 28)),
      idSource: `Source ${i % 10}`,
      sourceVl: 100 + i * 1.5,
      currency: 'EUR' as const,
    }));
    const refSources = Array.from({ length: 10 }, (_, i) => ({
      idSource: `Source ${i}`,
      volatType: i % 2 === 0 ? 'Non-Volatile' : 'Volatile',
      transferableInDays: i % 3 === 0,
    }));
    const buf = await buildPortfolioWorkbook({ facts, refSources, goals: [] });
    const parsed = await parsePortfolioExcel(buf);
    expect(parsed.facts).toHaveLength(1000);
    expect(parsed.refSources).toHaveLength(10);
    expect(parsed.facts[999].sourceVl).toBeCloseTo(100 + 999 * 1.5, 6);
  });
});

describe('Excel round-trip: template → parse', () => {
  it('the bundled template parses without error and yields valid sample data', async () => {
    const buf = await buildTemplateWorkbook();
    const parsed = await parsePortfolioExcel(buf);
    expect(parsed.facts.length).toBeGreaterThan(0);
    expect(parsed.refSources.length).toBeGreaterThan(0);
    parsed.facts.forEach(f => {
      expect(f.idSource).toBeTruthy();
      expect(Number.isFinite(f.sourceVl)).toBe(true);
      expect(f.date.getTime()).not.toBeNaN();
    });
  });
});
