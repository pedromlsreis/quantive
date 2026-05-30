import { describe, it, expect } from 'vitest';
import {
  computeMaxDrawdown,
  computeLongestDecline,
  computeRolling12mExtremes,
  computeDownsideStats,
} from '@/lib/drawdownStats';
import type { Snapshot } from '@/lib/types';

function snap(date: string, total: number): Snapshot {
  return { date: new Date(date), total, sources: [] };
}

/** Helper: build {date,value} points the way computeMaxDrawdown expects. */
function pts(...pairs: [string, number][]) {
  return pairs.map(([d, v]) => ({ date: new Date(d), value: v }));
}

describe('computeMaxDrawdown', () => {
  it('returns the neutral result for empty or single-point input', () => {
    expect(computeMaxDrawdown([]).maxDrawdownPct).toBe(0);
    expect(computeMaxDrawdown(pts(['2026-01-01', 100])).peakDate).toBeNull();
  });

  it('returns zero drawdown for a strictly rising series', () => {
    const r = computeMaxDrawdown(pts(['2026-01-01', 100], ['2026-02-01', 110], ['2026-03-01', 120]));
    expect(r.maxDrawdownPct).toBe(0);
    expect(r.troughDate).toBeNull();
    expect(r.stillUnderwater).toBe(false);
  });

  it('finds the largest peak-to-trough decline', () => {
    // Peak 200 on 1 Feb, trough 150 on 1 Mar -> 25% drop.
    const r = computeMaxDrawdown(
      pts(['2026-01-01', 100], ['2026-02-01', 200], ['2026-03-01', 150], ['2026-04-01', 180]),
    );
    expect(r.maxDrawdownAbs).toBe(50);
    expect(r.maxDrawdownPct).toBeCloseTo(25, 5);
    expect(r.peakValue).toBe(200);
    expect(r.peakDate).toBe('2026-02-01');
    expect(r.troughValue).toBe(150);
    expect(r.troughDate).toBe('2026-03-01');
  });

  it('marks the series underwater when the peak is never regained', () => {
    const r = computeMaxDrawdown(pts(['2026-01-01', 100], ['2026-02-01', 200], ['2026-03-01', 150]));
    expect(r.stillUnderwater).toBe(true);
    expect(r.recoveryDate).toBeNull();
    expect(r.recoveryDays).toBeNull();
  });

  it('resolves the recovery date and duration once the peak is reclaimed', () => {
    // Peak 200 (1 Feb) -> trough 150 (1 Mar) -> reclaim 200 on 31 Mar.
    const r = computeMaxDrawdown(
      pts(['2026-02-01', 200], ['2026-03-01', 150], ['2026-03-31', 205]),
    );
    expect(r.stillUnderwater).toBe(false);
    expect(r.recoveryDate).toBe('2026-03-31');
    // 1 Mar -> 31 Mar = 30 days.
    expect(r.recoveryDays).toBe(30);
  });

  it('picks the deeper of two separate declines', () => {
    // First dip: 100->90 (10%). Recover to 100. Second dip: 100->70 (30%).
    const r = computeMaxDrawdown(
      pts(
        ['2026-01-01', 100],
        ['2026-02-01', 90],
        ['2026-03-01', 100],
        ['2026-04-01', 70],
      ),
    );
    expect(r.maxDrawdownPct).toBeCloseTo(30, 5);
    expect(r.peakDate).toBe('2026-03-01');
    expect(r.troughDate).toBe('2026-04-01');
  });
});

describe('computeLongestDecline', () => {
  it('returns zero for a rising series', () => {
    const r = computeLongestDecline(pts(['2026-01-01', 100], ['2026-02-01', 110]));
    expect(r.days).toBe(0);
    expect(r.fromDate).toBeNull();
  });

  it('measures from the high-water mark to the reclaim date', () => {
    // High 100 on 1 Jan, underwater through Feb/Mar, reclaim on 1 Apr.
    const r = computeLongestDecline(
      pts(['2026-01-01', 100], ['2026-02-01', 80], ['2026-03-01', 90], ['2026-04-01', 100]),
    );
    expect(r.fromDate).toBe('2026-01-01');
    expect(r.toDate).toBe('2026-04-01');
    expect(r.ongoing).toBe(false);
    // 1 Jan -> 1 Apr 2026 = 31+28+31 = 90 days.
    expect(r.days).toBe(90);
  });

  it('flags an ongoing stretch that runs to the latest snapshot', () => {
    const r = computeLongestDecline(
      pts(['2026-01-01', 100], ['2026-02-01', 80], ['2026-03-01', 85]),
    );
    expect(r.ongoing).toBe(true);
    expect(r.fromDate).toBe('2026-01-01');
    expect(r.toDate).toBe('2026-03-01');
  });

  it('keeps the longest of multiple stretches', () => {
    // Short dip (1 Feb->1 Mar, ~28d reclaimed) then a longer one
    // (1 Apr->1 Aug, ongoing-but-reclaimed at end).
    const r = computeLongestDecline(
      pts(
        ['2026-01-01', 100],
        ['2026-02-01', 90], // underwater
        ['2026-03-01', 100], // reclaim (28d stretch)
        ['2026-04-01', 95], // underwater again, high=100 set on 1 Mar
        ['2026-05-01', 96],
        ['2026-06-01', 100], // reclaim — stretch 1 Mar -> 1 Jun = 92 days
      ),
    );
    expect(r.days).toBe(92);
    expect(r.fromDate).toBe('2026-03-01');
    expect(r.toDate).toBe('2026-06-01');
  });
});

describe('computeRolling12mExtremes', () => {
  it('returns nulls without at least 13 month-end rows', () => {
    const r = computeRolling12mExtremes([snap('2026-01-15', 1000), snap('2026-02-15', 1100)]);
    expect(r.best).toBeNull();
    expect(r.worst).toBeNull();
  });

  it('computes best and worst trailing-year returns', () => {
    // 25 monthly snapshots so multiple 12-month windows exist.
    const snaps: Snapshot[] = [];
    const values = [
      100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, // year 1
      130, 128, 150, 140, 145, 150, 155, 160, 165, 170, 175, 180, 190, // year 2
    ];
    values.forEach((v, i) => {
      const month = (i % 12) + 1;
      const year = 2025 + Math.floor(i / 12);
      snaps.push(snap(`${year}-${String(month).padStart(2, '0')}-15`, v));
    });
    const r = computeRolling12mExtremes(snaps);
    expect(r.best).not.toBeNull();
    expect(r.worst).not.toBeNull();
    // Best 12m window return should exceed the worst.
    expect(r.best!.pct).toBeGreaterThan(r.worst!.pct);
    // Windows are exactly 12 months apart.
    expect(r.best!.startDate.slice(0, 4)).not.toBe(r.best!.endDate.slice(0, 4));
  });
});

describe('computeDownsideStats', () => {
  it('bundles all stats and reports the sample size', () => {
    const stats = computeDownsideStats([
      snap('2026-01-01', 100),
      snap('2026-02-01', 120),
      snap('2026-03-01', 90),
    ]);
    expect(stats.sampleSize).toBe(3);
    expect(stats.drawdown.maxDrawdownPct).toBeCloseTo(25, 5); // 120 -> 90
    expect(stats.longestDecline.ongoing).toBe(true);
    expect(stats.rolling12m.best).toBeNull(); // too few months
  });

  it('drops non-finite totals before computing', () => {
    const stats = computeDownsideStats([
      snap('2026-01-01', 100),
      snap('2026-02-01', Number.NaN),
      snap('2026-03-01', 80),
    ]);
    expect(stats.sampleSize).toBe(2);
    expect(stats.drawdown.maxDrawdownAbs).toBe(20);
  });

  it('handles empty input without throwing', () => {
    const stats = computeDownsideStats([]);
    expect(stats.sampleSize).toBe(0);
    expect(stats.drawdown.maxDrawdownPct).toBe(0);
    expect(stats.longestDecline.days).toBe(0);
    expect(stats.rolling12m.worst).toBeNull();
  });
});
