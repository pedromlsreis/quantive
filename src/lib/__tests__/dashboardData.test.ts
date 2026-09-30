import { describe, it, expect } from 'vitest';
import { latestChange, changeOverYear, whatMoved, yearByYear, niceTicks } from '@/lib/dashboardData';
import type { FactRow, Snapshot } from '@/lib/types';

const snap = (d: Date, sources: [string, number][]): Snapshot => ({
  date: d,
  total: sources.reduce((s, [, v]) => s + v, 0),
  sources: sources.map(([name, value]) => ({ name, value, volatType: 'Volatile', isLiquid: true })),
});
const fact = (d: Date, idSource: string, sourceVl: number, currency = 'EUR'): FactRow =>
  ({ date: d, idSource, sourceVl, currency } as FactRow);

describe('latestChange', () => {
  it('compares the latest entry with the one before it', () => {
    const r = latestChange([snap(new Date(2026, 7, 1), [['A', 100]]), snap(new Date(2026, 8, 1), [['A', 110]])])!;
    expect(r.change).toBe(10);
    expect(r.changePct).toBeCloseTo(10);
    expect(r.previous!.date.getMonth()).toBe(7);
  });

  it('has no previous entry and no percentage with a single entry', () => {
    const r = latestChange([snap(new Date(2026, 8, 1), [['A', 110]])])!;
    expect(r.previous).toBeNull();
    expect(r.change).toBe(0);
    expect(r.changePct).toBeNull();
  });
});

describe('changeOverYear', () => {
  it('measures from the entry nearest a year back', () => {
    const snaps = [0, 3, 6, 9, 12, 15].map((m) => snap(new Date(2025, m, 1), [['A', 100 + m]]));
    const r = changeOverYear(snaps)!;
    expect(r.from.date).toEqual(new Date(2025, 3, 1));
    expect(r.change).toBe(12);
    expect(r.fullYear).toBe(true);
  });

  it('falls back to the first entry with under a year of history', () => {
    const r = changeOverYear([snap(new Date(2026, 3, 1), [['A', 100]]), snap(new Date(2026, 8, 1), [['A', 120]])])!;
    expect(r.fullYear).toBe(false);
    expect(r.change).toBe(20);
  });
});

describe('whatMoved', () => {
  const d1 = new Date(2026, 7, 1);
  const d2 = new Date(2026, 8, 1);

  it('lists changed sources by absolute change and counts the rest as unchanged', () => {
    const facts = [fact(d1, 'A', 100), fact(d2, 'A', 150), fact(d1, 'B', 50), fact(d1, 'C', 10), fact(d2, 'C', 0)];
    const r = whatMoved(snap(d1, [['A', 100], ['B', 50], ['C', 10]]), snap(d2, [['A', 150], ['B', 50], ['C', 0]]), facts);
    expect(r.moved.map((m) => m.name)).toEqual(['A', 'C']);
    expect(r.unchanged).toBe(1);
  });

  it('marks a source whose native balance held but whose converted value moved', () => {
    const facts = [fact(d1, 'USD broker', 1000, 'USD'), fact(d2, 'USD broker', 1000, 'USD')];
    const r = whatMoved(snap(d1, [['USD broker', 920]]), snap(d2, [['USD broker', 905]]), facts);
    expect(r.moved).toEqual([{ name: 'USD broker', now: 905, change: -15, fxOnly: true }]);
    expect(r.unchanged).toBe(0);
  });
});

describe('yearByYear', () => {
  it('chains each year from the previous year-end and marks partial years', () => {
    const rows = yearByYear([
      snap(new Date(2025, 2, 14), [['A', 100]]),
      snap(new Date(2025, 11, 31), [['A', 120]]),
      snap(new Date(2026, 8, 30), [['A', 150]]),
    ], new Date(2026, 8, 30));
    expect(rows.map((r) => [r.year, r.start, r.end, r.change])).toEqual([[2026, 120, 150, 30], [2025, 100, 120, 20]]);
    expect(rows[1].from).toEqual(new Date(2025, 2, 14));
    expect(rows[0].to).toEqual(new Date(2026, 8, 30));
  });
});

describe('niceTicks', () => {
  it('rounds to 1/2/5 steps', () => {
    expect(niceTicks(117_000, 139_000).ticks).toEqual([115_000, 120_000, 125_000, 130_000, 135_000, 140_000]);
    expect(niceTicks(110_000, 182_000).ticks).toEqual([100_000, 120_000, 140_000, 160_000, 180_000, 200_000]);
  });

  it('widens a flat range instead of dividing by zero', () => {
    const { ticks } = niceTicks(1000, 1000);
    expect(ticks.length).toBeGreaterThan(1);
  });
});
