import { describe, it, expect } from 'vitest';
import {
  rebaseToHundred,
  intersectByDate,
  isStale,
  lastDate,
  periodCutoff,
  filterByPeriod,
  DEFAULT_STALE_THRESHOLDS,
  type BenchmarkSeries,
} from '@/lib/benchmarkSeries';

describe('rebaseToHundred', () => {
  it('returns an empty array for empty input', () => {
    expect(rebaseToHundred([])).toEqual([]);
  });

  it('sets the first point to exactly 100', () => {
    const out = rebaseToHundred([
      { date: '2025-01-01', value: 250 },
      { date: '2025-02-01', value: 260 },
    ]);
    expect(out[0].rebased).toBeCloseTo(100, 10);
  });

  it('scales subsequent points proportionally', () => {
    const out = rebaseToHundred([
      { date: '2025-01-01', value: 200 },
      { date: '2025-02-01', value: 210 },  // +5%
      { date: '2025-03-01', value: 180 },  // -10%
    ]);
    expect(out[1].rebased).toBeCloseTo(105, 6);
    expect(out[2].rebased).toBeCloseTo(90,  6);
  });

  it('preserves the original raw value', () => {
    const out = rebaseToHundred([
      { date: '2025-01-01', value: 42 },
      { date: '2025-02-01', value: 84 },
    ]);
    expect(out[0].raw).toBe(42);
    expect(out[1].raw).toBe(84);
    expect(out[1].rebased).toBeCloseTo(200, 6);
  });

  it('throws when the first value is zero or negative', () => {
    expect(() => rebaseToHundred([{ date: '2025-01-01', value: 0 }])).toThrow();
    expect(() => rebaseToHundred([{ date: '2025-01-01', value: -1 }])).toThrow();
  });
});

describe('intersectByDate', () => {
  const sp500: BenchmarkSeries = {
    id: 'sp500',
    points: [
      { date: '2025-01-02', value: 100 },
      { date: '2025-01-03', value: 101 },
      { date: '2025-01-06', value: 105 },  // weekend gap
      { date: '2025-01-07', value: 104 },
    ],
  };

  it('returns an empty array when either side is empty', () => {
    expect(intersectByDate(sp500, [])).toEqual([]);
    expect(intersectByDate({ id: 'sp500', points: [] }, ['2025-01-02'])).toEqual([]);
  });

  it('picks the latest value on-or-before each snapshot date', () => {
    // Saturday 2025-01-04: no row that day, latest <= it is 2025-01-03 (101).
    const out = intersectByDate(sp500, ['2025-01-02', '2025-01-04', '2025-01-07']);
    expect(out.map((p) => [p.date, p.value])).toEqual([
      ['2025-01-02', 100],
      ['2025-01-04', 101],
      ['2025-01-07', 104],
    ]);
  });

  it('skips snapshot dates that predate the series', () => {
    const out = intersectByDate(sp500, ['2024-12-30', '2025-01-03']);
    expect(out).toEqual([{ date: '2025-01-03', value: 101 }]);
  });

  it('pads a monthly series across daily snapshots in the same month', () => {
    const hicp: BenchmarkSeries = {
      id: 'inflation_eu',
      points: [
        { date: '2025-01-01', value: 120.0 },
        { date: '2025-02-01', value: 120.5 },
      ],
    };
    const snaps = ['2025-01-15', '2025-01-31', '2025-02-15'];
    const out = intersectByDate(hicp, snaps);
    expect(out.map((p) => p.value)).toEqual([120.0, 120.0, 120.5]);
  });

  it('sorts unsorted snapshot input before walking the series', () => {
    const out = intersectByDate(sp500, ['2025-01-07', '2025-01-02', '2025-01-04']);
    // Output is keyed off the sorted snapshot dates.
    expect(out.map((p) => p.date)).toEqual(['2025-01-02', '2025-01-04', '2025-01-07']);
  });
});

describe('isStale', () => {
  const NOW = new Date('2025-05-19T12:00:00Z');

  it('returns false for an empty series (UI handles empty separately)', () => {
    const empty: BenchmarkSeries = { id: 'sp500', points: [] };
    expect(isStale(empty, NOW)).toBe(false);
  });

  it('flags sp500 stale at > 3 days behind', () => {
    const sp500Fresh: BenchmarkSeries = {
      id: 'sp500',
      points: [{ date: '2025-05-17', value: 100 }],  // 2 days old
    };
    const sp500Stale: BenchmarkSeries = {
      id: 'sp500',
      points: [{ date: '2025-05-15', value: 100 }],  // 4 days old
    };
    expect(isStale(sp500Fresh, NOW)).toBe(false);
    expect(isStale(sp500Stale, NOW)).toBe(true);
  });

  it('flags inflation_eu stale at > 45 days behind', () => {
    const hicpFresh: BenchmarkSeries = {
      id: 'inflation_eu',
      points: [{ date: '2025-04-15', value: 120 }],  // ~34 days old
    };
    const hicpStale: BenchmarkSeries = {
      id: 'inflation_eu',
      points: [{ date: '2025-03-15', value: 120 }],  // ~65 days old
    };
    expect(isStale(hicpFresh, NOW)).toBe(false);
    expect(isStale(hicpStale, NOW)).toBe(true);
  });

  it('boundary: when latest is the same calendar day at midnight UTC, age is 0 — not stale', () => {
    // Latest point timestamp is 2025-05-19T00:00:00Z; NOW is 12:00Z same day.
    // Age = 0.5 days, well under the 3-day daily threshold.
    const sp500: BenchmarkSeries = {
      id: 'sp500',
      points: [{ date: '2025-05-19', value: 100 }],
    };
    expect(isStale(sp500, NOW)).toBe(false);
  });

  it('honours injected thresholds', () => {
    const sp500: BenchmarkSeries = {
      id: 'sp500',
      points: [{ date: '2025-05-18', value: 100 }],  // 1 day old
    };
    expect(isStale(sp500, NOW, { ...DEFAULT_STALE_THRESHOLDS, daily: 0 })).toBe(true);
  });
});

describe('lastDate', () => {
  it('returns the maximum date in the series', () => {
    const s: BenchmarkSeries = {
      id: 'sp500',
      points: [
        { date: '2025-01-02', value: 1 },
        { date: '2025-01-07', value: 2 },
        { date: '2025-01-04', value: 3 },
      ],
    };
    expect(lastDate(s)).toBe('2025-01-07');
  });

  it('returns null for an empty series', () => {
    expect(lastDate({ id: 'sp500', points: [] })).toBeNull();
  });
});

describe('periodCutoff', () => {
  const NOW = new Date('2025-05-19T12:00:00Z');

  it('subtracts the right number of years', () => {
    expect(periodCutoff('1y', NOW)).toBe('2024-05-19');
    expect(periodCutoff('3y', NOW)).toBe('2022-05-19');
  });
});

describe('filterByPeriod', () => {
  const points = [
    { date: '2023-01-01', value: 1 },
    { date: '2024-06-01', value: 2 },
    { date: '2025-04-01', value: 3 },
  ];

  it('keeps everything when cutoff is null', () => {
    expect(filterByPeriod(points, null)).toEqual(points);
  });

  it('filters out dates before the cutoff', () => {
    expect(filterByPeriod(points, '2024-01-01')).toEqual([
      { date: '2024-06-01', value: 2 },
      { date: '2025-04-01', value: 3 },
    ]);
  });

  it('includes dates equal to the cutoff (inclusive lower bound)', () => {
    expect(filterByPeriod(points, '2024-06-01')).toEqual([
      { date: '2024-06-01', value: 2 },
      { date: '2025-04-01', value: 3 },
    ]);
  });
});
