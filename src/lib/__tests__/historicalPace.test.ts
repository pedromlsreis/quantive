import { describe, it, expect } from 'vitest';
import { historicalPace, generateScenarioForecast, PACE_MIN_MONTHS, projectionHistory } from '@/lib/scenarioForecast';

const monthly = (n: number, start: number, growth: number) =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(2024, i, 1), total: start * Math.pow(1 + growth, i) }));

describe('historicalPace', () => {
  it('annualises first-to-latest growth once a year of history exists', () => {
    const pace = historicalPace(monthly(25, 100_000, 0.005));
    expect(pace).not.toBeNull();
    expect(pace!.months).toBe(24);
    expect(pace!.rate).toBeCloseTo(Math.pow(1.005, 12) - 1, 6);
  });

  it('is null with less than PACE_MIN_MONTHS of history or a non-positive endpoint', () => {
    expect(historicalPace(monthly(PACE_MIN_MONTHS, 100_000, 0.01))).toBeNull();
    expect(historicalPace([{ date: new Date(2024, 0, 1), total: -5 }, { date: new Date(2026, 0, 1), total: 10 }])).toBeNull();
  });

  it('drives the same 5-year figure wherever it is used', () => {
    const snaps = monthly(30, 100_000, 0.004);
    const pace = historicalPace(snaps)!;
    const a = generateScenarioForecast(snaps, 60, pace.rate).at(-1)!.forecast;
    const b = generateScenarioForecast([...snaps].reverse(), 60, historicalPace([...snaps].reverse())!.rate).at(-1)!.forecast;
    expect(a).toBeCloseTo(b, 6);
  });

  it('ignores an entry whose total is missing, so the overview and /forecast agree while rates load', () => {
    const snaps = monthly(25, 100_000, 0.005);
    const withGap = snaps.map((s, i) => (i === 24 ? { ...s, total: NaN } : s));
    const usable = projectionHistory(withGap);
    expect(usable).toHaveLength(24);
    expect(historicalPace(withGap)).toEqual(historicalPace(usable));
    const viaHero = generateScenarioForecast(usable, 60, historicalPace(withGap)!.rate).at(-1)!.forecast;
    expect(Number.isFinite(viaHero)).toBe(true);
  });
});
