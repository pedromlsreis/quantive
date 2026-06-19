import { describe, it, expect } from 'vitest';
import { computeMonthlyRows } from '@/lib/monthlyAggregate';
import {
  computeMaxDrawdown,
  computeRolling12mExtremes,
  computeDownsideStats,
} from '@/lib/drawdownStats';
import { generateForecast } from '@/lib/forecast';
import { generateScenarioForecast } from '@/lib/scenarioForecast';
import type { Snapshot } from '@/lib/types';

// Net worth can be negative when liabilities (negative source values) exceed
// assets — a real state, e.g. early in a mortgage. These tests cover how the
// pure-math modules behave when the portfolio total drops below zero.

function snap(date: string, total: number): Snapshot {
  return { date: new Date(date), total, sources: [] };
}
function pts(...pairs: [string, number][]) {
  return pairs.map(([d, v]) => ({ date: new Date(d), value: v }));
}

describe('monthlyAggregate with negative net worth', () => {
  it('shrinking debt reads as a positive change in both abs and pct', () => {
    // -100 → -50 halves the debt: a +50 improvement. Dividing by |base| keeps
    // the percentage positive (+50%) instead of sign-flipping to -50%.
    const rows = computeMonthlyRows([snap('2026-01-31', -100), snap('2026-02-28', -50)]);
    expect(rows).toHaveLength(2);
    expect(rows[1].deltaMonthAbs).toBe(50);
    expect(rows[1].deltaMonthPct).toBe(50);
  });

  it('deepening debt reads as a negative change', () => {
    // -100 → -200 doubles the debt: a -100 change, -100% on the |base|.
    const rows = computeMonthlyRows([snap('2026-01-31', -100), snap('2026-02-28', -200)]);
    expect(rows[1].deltaMonthAbs).toBe(-100);
    expect(rows[1].deltaMonthPct).toBe(-100);
  });

  it('YoY pct uses the magnitude base too (no sign-flip)', () => {
    // -1000 a year ago → -500 now is a +500 improvement → +50%.
    const rows = computeMonthlyRows([snap('2025-02-28', -1000), snap('2026-02-28', -500)]);
    const latest = rows[rows.length - 1];
    expect(latest.deltaYearAbs).toBe(500);
    expect(latest.deltaYearPct).toBe(50);
  });

  it('suppresses annualisedPct when an endpoint is non-positive', () => {
    // CAGR needs both endpoints > 0, so a negative history yields no figure.
    const rows = computeMonthlyRows([
      snap('2025-01-31', -1000),
      snap('2026-01-31', -500),
      snap('2026-02-28', -400),
    ]);
    rows.forEach((r) => expect(r.annualisedPct).toBeNull());
  });

  it('still emits finite rows throughout a fully-negative history', () => {
    const rows = computeMonthlyRows([
      snap('2026-01-31', -1000),
      snap('2026-02-28', -1200),
      snap('2026-03-31', -900),
    ]);
    expect(rows).toHaveLength(3);
    rows.forEach((r) => expect(Number.isFinite(r.netWorth)).toBe(true));
  });
});

describe('computeMaxDrawdown with negative net worth', () => {
  it('detects the absolute drop but forces percentage to 0 when the peak is non-positive', () => {
    // Peak -100 → trough -200: the abs drop is captured, but pct is 0 because a
    // negative peak can't yield a meaningful percentage.
    const r = computeMaxDrawdown(pts(['2026-01-01', -100], ['2026-02-01', -200], ['2026-03-01', -50]));
    expect(r.maxDrawdownAbs).toBe(100);
    expect(r.maxDrawdownPct).toBe(0);
    expect(r.peakValue).toBe(-100);
    expect(r.troughValue).toBe(-200);
    expect(r.stillUnderwater).toBe(false);
  });

  it('handles a series that crosses from positive to negative', () => {
    // 100 → -50 is a 150-unit decline from a positive peak, so the percentage
    // is meaningful here (150 / 100 = 150%).
    const r = computeMaxDrawdown(pts(['2026-01-01', 100], ['2026-02-01', -50]));
    expect(r.maxDrawdownAbs).toBe(150);
    expect(r.maxDrawdownPct).toBeCloseTo(150, 5);
    expect(r.peakValue).toBe(100);
    expect(r.troughValue).toBe(-50);
    expect(r.stillUnderwater).toBe(true);
  });
});

describe('computeRolling12mExtremes with negative net worth', () => {
  it('returns nulls when every window has a non-positive endpoint', () => {
    // 13 rows clears the length gate, but every value is negative so each
    // window is skipped — no rolling return is reportable.
    const snaps: Snapshot[] = [];
    for (let i = 0; i < 13; i++) {
      const month = (i % 12) + 1;
      const year = 2025 + Math.floor(i / 12);
      snaps.push(snap(`${year}-${String(month).padStart(2, '0')}-15`, -1000 - i));
    }
    const r = computeRolling12mExtremes(snaps);
    expect(r.best).toBeNull();
    expect(r.worst).toBeNull();
  });
});

describe('computeDownsideStats with negative net worth', () => {
  it('produces a finite, non-throwing bundle', () => {
    const stats = computeDownsideStats([
      snap('2026-01-01', -500),
      snap('2026-02-01', -800),
      snap('2026-03-01', -300),
    ]);
    expect(stats.sampleSize).toBe(3);
    expect(stats.drawdown.maxDrawdownAbs).toBe(300); // -500 → -800
    expect(stats.drawdown.maxDrawdownPct).toBe(0); // peak is negative
    expect(stats.rolling12m.best).toBeNull();
  });
});

describe('generateForecast with negative net worth', () => {
  it('clamps the central forecast to 0 and keeps every bound finite & non-negative', () => {
    // A negative base can't be projected, so the forecast is clamped to 0 —
    // we don't draw a negative-net worth trajectory.
    const result = generateForecast([
      { date: new Date(2024, 0, 1), total: -1000 },
      { date: new Date(2024, 6, 1), total: -2000 },
    ], 6);
    expect(result).toHaveLength(6);
    result.forEach((p) => {
      expect(p.forecast).toBe(0);
      expect(p.lower).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(p.upper)).toBe(true);
      expect(p.upper).toBeGreaterThanOrEqual(p.lower);
    });
  });
});

describe('generateScenarioForecast with negative net worth', () => {
  it('clamps to 0 for a negative base under a positive growth assumption', () => {
    const points = generateScenarioForecast(
      [
        { date: new Date(2024, 0, 1), total: -1000 },
        { date: new Date(2024, 6, 1), total: -1500 },
      ],
      6,
      0.07,
    );
    expect(points).toHaveLength(6);
    points.forEach((p) => {
      expect(p.forecast).toBe(0);
      expect(p.lower).toBeGreaterThanOrEqual(0);
      expect(p.upper).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(p.upper)).toBe(true);
    });
  });
});
