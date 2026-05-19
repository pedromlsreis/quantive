import { describe, it, expect } from 'vitest';
import {
  computeMonthlyRows,
  applyFreeTierMask,
  buildMonthlyCsv,
} from '@/lib/monthlyAggregate';
import type { Snapshot } from '@/lib/types';

function snap(date: string, total: number): Snapshot {
  return { date: new Date(date), total, sources: [] };
}

describe('computeMonthlyRows', () => {
  it('returns empty array for empty input', () => {
    expect(computeMonthlyRows([])).toEqual([]);
  });

  it('emits a single row with null deltas for a single snapshot', () => {
    const rows = computeMonthlyRows([snap('2026-05-15', 1000)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].netWorth).toBe(1000);
    expect(rows[0].deltaMonthAbs).toBeNull();
    expect(rows[0].deltaMonthPct).toBeNull();
    expect(rows[0].deltaYearAbs).toBeNull();
    expect(rows[0].annualisedPct).toBeNull();
  });

  it('uses the latest snapshot on or before each month-end (rate-of-day)', () => {
    // Two snapshots in May: 10 May and 25 May. Month-end May = 25 May value.
    const rows = computeMonthlyRows([
      snap('2026-05-10', 800),
      snap('2026-05-25', 1000),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].netWorth).toBe(1000);
    expect(rows[0].sourceDate).toBe('2026-05-25');
    // Last day of May 2026 is 31 May.
    expect(rows[0].monthEnd).toBe('2026-05-31');
  });

  it('carries the latest snapshot forward when a month has no snapshot of its own', () => {
    // Snapshot in Jan, no snapshot in Feb — Feb month-end uses Jan's value.
    const rows = computeMonthlyRows([
      snap('2026-01-15', 1000),
      snap('2026-03-15', 1200),
    ]);
    // Three rows: Jan, Feb (carry forward), Mar.
    expect(rows.map((r) => r.monthKey)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(rows[0].netWorth).toBe(1000);
    expect(rows[1].netWorth).toBe(1000); // Feb carried from Jan.
    expect(rows[2].netWorth).toBe(1200);
  });

  it('computes month-over-month deltas relative to the previous row', () => {
    const rows = computeMonthlyRows([
      snap('2026-01-31', 1000),
      snap('2026-02-28', 1100),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].deltaMonthAbs).toBe(100);
    expect(rows[1].deltaMonthPct).toBeCloseTo(10, 5);
  });

  it('computes year-over-year deltas keyed by calendar month, not by index', () => {
    const rows = computeMonthlyRows([
      snap('2025-05-31', 1000),
      // Gap of several months — the YoY key should still match May->May.
      snap('2026-05-31', 1200),
    ]);
    const may2026 = rows.find((r) => r.monthKey === '2026-05');
    expect(may2026).toBeDefined();
    expect(may2026!.deltaYearAbs).toBe(200);
    expect(may2026!.deltaYearPct).toBeCloseTo(20, 5);
  });

  it('annualised CAGR is null when fewer than 12 months of history', () => {
    const rows = computeMonthlyRows([
      snap('2026-01-31', 1000),
      snap('2026-06-30', 1200),
    ]);
    rows.forEach((r) => expect(r.annualisedPct).toBeNull());
  });

  it('annualised CAGR is set once 12+ months of history exist', () => {
    const rows = computeMonthlyRows([
      snap('2025-01-31', 1000),
      snap('2026-01-31', 1100),
    ]);
    const last = rows[rows.length - 1];
    expect(last.annualisedPct).not.toBeNull();
    // 10% over exactly 12 months ≈ 10% CAGR.
    expect(last.annualisedPct!).toBeCloseTo(10, 1);
  });

  it('is tolerant of unsorted input', () => {
    const rows = computeMonthlyRows([
      snap('2026-02-28', 1100),
      snap('2026-01-31', 1000),
    ]);
    expect(rows.map((r) => r.monthKey)).toEqual(['2026-01', '2026-02']);
  });

  it('handles zero previous-month values without producing NaN/Infinity', () => {
    const rows = computeMonthlyRows([
      snap('2026-01-31', 0),
      snap('2026-02-28', 100),
    ]);
    expect(rows[1].deltaMonthAbs).toBe(100);
    expect(rows[1].deltaMonthPct).toBeNull();
  });
});

describe('applyFreeTierMask', () => {
  it('redacts rows older than 12 months', () => {
    const rows = computeMonthlyRows([
      snap('2024-01-31', 800),
      snap('2025-01-31', 900),
      snap('2026-01-31', 1000),
      snap('2026-05-31', 1100),
    ]);
    const now = new Date('2026-05-19');
    const masked = applyFreeTierMask(rows, now);
    // Floor = 2025-05-01. Anything before that is redacted.
    expect(masked.find((r) => r.monthKey === '2024-01')!.redacted).toBe(true);
    expect(masked.find((r) => r.monthKey === '2025-01')!.redacted).toBe(true);
    expect(masked.find((r) => r.monthKey === '2026-05')!.redacted).toBe(false);
  });

  it('redacts no rows when all are inside the 12-month window', () => {
    const rows = computeMonthlyRows([
      snap('2026-01-31', 1000),
      snap('2026-05-31', 1100),
    ]);
    const masked = applyFreeTierMask(rows, new Date('2026-05-19'));
    expect(masked.every((r) => !r.redacted)).toBe(true);
  });

  it('preserves row order and count', () => {
    const rows = computeMonthlyRows([
      snap('2024-01-31', 800),
      snap('2025-01-31', 900),
      snap('2026-05-31', 1100),
    ]);
    const masked = applyFreeTierMask(rows, new Date('2026-05-19'));
    expect(masked).toHaveLength(rows.length);
    expect(masked.map((r) => r.monthKey)).toEqual(rows.map((r) => r.monthKey));
  });
});

describe('buildMonthlyCsv', () => {
  it('emits the header row first', () => {
    const csv = buildMonthlyCsv([]);
    const [header] = csv.split('\r\n');
    expect(header).toBe(
      'MONTH_END,NET_WORTH,DELTA_MONTH_ABS,DELTA_MONTH_PCT,DELTA_YEAR_ABS,DELTA_YEAR_PCT,ANNUALISED_PCT',
    );
  });

  it('writes redacted rows with empty value cells but preserves the date', () => {
    const rows = computeMonthlyRows([
      snap('2024-01-31', 800),
      snap('2026-05-31', 1100),
    ]);
    const masked = applyFreeTierMask(rows, new Date('2026-05-19'));
    const csv = buildMonthlyCsv(masked);
    const lines = csv.split('\r\n');
    const redactedLine = lines.find((l) => l.startsWith('2024-01-31'));
    expect(redactedLine).toBeDefined();
    // Date + six empty fields.
    expect(redactedLine).toBe('2024-01-31,,,,,,');
  });

  it('writes raw numerics for non-redacted rows', () => {
    const rows = computeMonthlyRows([
      snap('2026-01-31', 1000),
      snap('2026-02-28', 1100),
    ]);
    const csv = buildMonthlyCsv(rows.map((r) => ({ ...r, redacted: false })));
    const lines = csv.split('\r\n');
    const febLine = lines.find((l) => l.startsWith('2026-02-28'))!;
    expect(febLine).toContain('1100');
    // Δ month abs = 100.
    expect(febLine.split(',')[2]).toBe('100');
  });
});
