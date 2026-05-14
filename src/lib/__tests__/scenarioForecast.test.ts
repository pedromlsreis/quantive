import { describe, it, expect } from 'vitest';
import { generateScenarioForecast } from '@/lib/scenarioForecast';

describe('generateScenarioForecast', () => {
  it('returns empty array for fewer than 2 snapshots', () => {
    expect(generateScenarioForecast([], 12, 0.07)).toEqual([]);
    expect(generateScenarioForecast([{ date: new Date(), total: 100 }], 12, 0.07)).toEqual([]);
  });

  it('generates exactly monthsForward points', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 10_000 },
      { date: new Date(2024, 6, 1), total: 11_000 },
    ];
    expect(generateScenarioForecast(snapshots, 12, 0.07)).toHaveLength(12);
    expect(generateScenarioForecast(snapshots, 1, 0.07)).toHaveLength(1);
    expect(generateScenarioForecast(snapshots, 24, 0.07)).toHaveLength(24);
  });

  it('all predicted values are non-negative (even with aggressive negative rate)', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 1_000 },
      { date: new Date(2024, 1, 1), total: 800 },
    ];
    const points = generateScenarioForecast(snapshots, 36, -0.8);
    points.forEach(p => {
      expect(p.forecast).toBeGreaterThanOrEqual(0);
      expect(p.upper).toBeGreaterThanOrEqual(0);
      expect(p.lower).toBeGreaterThanOrEqual(0);
    });
  });

  it('upper >= forecast >= lower for every point', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 10_000 },
      { date: new Date(2024, 3, 1), total: 11_000 },
      { date: new Date(2024, 6, 1), total: 12_500 },
    ];
    const points = generateScenarioForecast(snapshots, 12, 0.08);
    points.forEach(p => {
      expect(p.upper).toBeGreaterThanOrEqual(p.forecast);
      expect(p.forecast).toBeGreaterThanOrEqual(p.lower);
    });
  });

  it('all forecast dates are strictly after the last snapshot', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 10_000 },
      { date: new Date(2024, 6, 1), total: 11_000 },
    ];
    const lastDate = snapshots[1].date;
    const points = generateScenarioForecast(snapshots, 6, 0.07);
    points.forEach(p => {
      expect(p.date.getTime()).toBeGreaterThan(lastDate.getTime());
    });
  });

  it('higher annualRate produces a higher final forecast value', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 10_000 },
      { date: new Date(2024, 6, 1), total: 11_000 },
    ];
    const low = generateScenarioForecast(snapshots, 12, 0.02);
    const high = generateScenarioForecast(snapshots, 12, 0.20);
    expect(high[11].forecast).toBeGreaterThan(low[11].forecast);
  });

  it('sorts unsorted snapshots before computing (input order does not matter)', () => {
    const sorted = [
      { date: new Date(2024, 0, 1), total: 10_000 },
      { date: new Date(2024, 6, 1), total: 11_000 },
    ];
    const unsorted = [sorted[1], sorted[0]];
    const fromSorted = generateScenarioForecast(sorted, 6, 0.07);
    const fromUnsorted = generateScenarioForecast(unsorted, 6, 0.07);
    fromSorted.forEach((p, i) => {
      expect(fromUnsorted[i].forecast).toBeCloseTo(p.forecast, 6);
    });
  });

  it('zero annual rate keeps the base value approximately constant', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 10_000 },
      { date: new Date(2024, 1, 1), total: 10_000 },
    ];
    const points = generateScenarioForecast(snapshots, 3, 0);
    points.forEach(p => {
      expect(p.forecast).toBeCloseTo(10_000, 1);
    });
  });

  it('falls back gracefully when snapshots span zero months', () => {
    const sameDate = new Date(2024, 0, 1);
    const snapshots = [
      { date: sameDate, total: 10_000 },
      { date: sameDate, total: 10_500 },
    ];
    const points = generateScenarioForecast(snapshots, 6, 0.1);
    expect(points).toHaveLength(6);
    points.forEach(p => {
      expect(p.forecast).toBeGreaterThan(0);
      expect(Number.isFinite(p.forecast)).toBe(true);
    });
  });

  it('forecast grows month-over-month with a positive rate', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 10_000 },
      { date: new Date(2024, 6, 1), total: 11_000 },
    ];
    const points = generateScenarioForecast(snapshots, 12, 0.1);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].forecast).toBeGreaterThan(points[i - 1].forecast);
    }
  });

  it('band widens over time (spread increases with horizon)', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 10_000 },
      { date: new Date(2024, 3, 1), total: 10_500 },
      { date: new Date(2024, 6, 1), total: 11_200 },
    ];
    const points = generateScenarioForecast(snapshots, 12, 0.07);
    const spreadAt1 = points[0].upper - points[0].lower;
    const spreadAt12 = points[11].upper - points[11].lower;
    expect(spreadAt12).toBeGreaterThan(spreadAt1);
  });
});
