import { describe, it, expect } from 'vitest';
import { generateForecast } from '@/lib/forecast';

describe('generateForecast edge cases', () => {
  it('returns empty when both snapshots are on the same month', () => {
    const result = generateForecast([
      { date: new Date(2024, 5, 1), total: 1000 },
      { date: new Date(2024, 5, 15), total: 1100 },
    ]);
    expect(result).toEqual([]);
  });

  it('handles zero starting value gracefully (no NaN)', () => {
    const result = generateForecast([
      { date: new Date(2024, 0, 1), total: 0 },
      { date: new Date(2024, 6, 1), total: 5000 },
    ], 3);
    result.forEach(p => {
      expect(Number.isFinite(p.forecast)).toBe(true);
      expect(Number.isFinite(p.upper)).toBe(true);
      expect(Number.isFinite(p.lower)).toBe(true);
    });
  });

  it('handles declining portfolio (negative CAGR)', () => {
    const result = generateForecast([
      { date: new Date(2024, 0, 1), total: 50000 },
      { date: new Date(2024, 6, 1), total: 40000 },
    ], 6);
    expect(result).toHaveLength(6);
    // Forecast should trend downward
    expect(result[5].forecast).toBeLessThan(40000);
  });

  it('handles unsorted input', () => {
    const result = generateForecast([
      { date: new Date(2024, 6, 1), total: 12000 },
      { date: new Date(2024, 0, 1), total: 10000 },
      { date: new Date(2024, 3, 1), total: 11000 },
    ], 3);
    expect(result).toHaveLength(3);
    // Last date should be July, so first forecast should be August
    expect(result[0].date.getMonth()).toBe(7); // August (0-indexed)
  });

  it('confidence bands widen over time', () => {
    const result = generateForecast([
      { date: new Date(2024, 0, 1), total: 10000 },
      { date: new Date(2024, 1, 1), total: 10200 },
      { date: new Date(2024, 2, 1), total: 10500 },
      { date: new Date(2024, 3, 1), total: 10300 },
    ], 6);
    const spread1 = result[0].upper - result[0].lower;
    const spread6 = result[5].upper - result[5].lower;
    expect(spread6).toBeGreaterThan(spread1);
  });

  it('uses custom monthsForward parameter', () => {
    const result = generateForecast([
      { date: new Date(2024, 0, 1), total: 10000 },
      { date: new Date(2024, 6, 1), total: 12000 },
    ], 24);
    expect(result).toHaveLength(24);
  });
});
