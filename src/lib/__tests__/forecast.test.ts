import { describe, it, expect } from 'vitest';
import { generateForecast } from '@/lib/forecast';

describe('generateForecast', () => {
  it('returns empty for less than 2 snapshots', () => {
    expect(generateForecast([], 12)).toEqual([]);
    expect(generateForecast([{ date: new Date(), total: 100 }], 12)).toEqual([]);
  });

  it('generates the correct number of forecast points', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 10000 },
      { date: new Date(2024, 1, 1), total: 10500 },
      { date: new Date(2024, 2, 1), total: 11000 },
    ];
    const forecast = generateForecast(snapshots, 6);
    expect(forecast).toHaveLength(6);
  });

  it('forecast values are non-negative', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 100 },
      { date: new Date(2024, 1, 1), total: 200 },
    ];
    const forecast = generateForecast(snapshots, 12);
    forecast.forEach(f => {
      expect(f.forecast).toBeGreaterThanOrEqual(0);
      expect(f.upper).toBeGreaterThanOrEqual(0);
      expect(f.lower).toBeGreaterThanOrEqual(0);
    });
  });

  it('upper >= forecast >= lower', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 10000 },
      { date: new Date(2024, 1, 1), total: 10500 },
      { date: new Date(2024, 2, 1), total: 11000 },
    ];
    const forecast = generateForecast(snapshots, 6);
    forecast.forEach(f => {
      expect(f.upper).toBeGreaterThanOrEqual(f.forecast);
      expect(f.forecast).toBeGreaterThanOrEqual(f.lower);
    });
  });

  it('forecast dates are in the future', () => {
    const snapshots = [
      { date: new Date(2024, 0, 1), total: 10000 },
      { date: new Date(2024, 1, 1), total: 10500 },
    ];
    const lastDate = snapshots[snapshots.length - 1].date;
    const forecast = generateForecast(snapshots, 3);
    forecast.forEach(f => {
      expect(f.date.getTime()).toBeGreaterThan(lastDate.getTime());
    });
  });
});
