import { describe, it, expect } from 'vitest';
import { buildSourceColors, sourceColor, OTHER_COLOR } from '@/lib/sourceColors';
import type { Snapshot } from '@/lib/types';

const snap = (sources: [string, number][]): Snapshot => ({
  date: new Date(2026, 8, 1),
  total: sources.reduce((s, [, v]) => s + v, 0),
  sources: sources.map(([name, value]) => ({ name, value, volatType: 'Volatile', isLiquid: true })),
});

describe('buildSourceColors', () => {
  it('ranks by value, largest first, ties by name', () => {
    const map = buildSourceColors(snap([['B', 10], ['A', 10], ['C', 50]]));
    expect(map.get('C')).toBe('var(--series-1)');
    expect(map.get('A')).toBe('var(--series-2)');
    expect(map.get('B')).toBe('var(--series-3)');
  });

  it('sends ranks past seven, non-positive values and unknown names to Other', () => {
    const rows: [string, number][] = Array.from({ length: 9 }, (_, i) => [`S${i}`, 100 - i]);
    rows.push(['Mortgage', -150000]);
    const map = buildSourceColors(snap(rows));
    expect(map.get('S6')).toBe('var(--series-7)');
    expect(sourceColor(map, 'S7')).toBe(OTHER_COLOR);
    expect(sourceColor(map, 'Mortgage')).toBe(OTHER_COLOR);
    expect(sourceColor(map, 'Sold last year')).toBe(OTHER_COLOR);
  });

  it('returns an empty map without data', () => {
    expect(buildSourceColors(undefined).size).toBe(0);
  });
});
