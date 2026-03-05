import { describe, it, expect } from 'vitest';
import { CHART_COLORS, TREEMAP_COLORS, PRIMARY_COLOR, POSITIVE_COLOR, NEGATIVE_COLOR } from '@/lib/chartColors';

describe('chartColors', () => {
  it('exports at least 10 chart colors', () => {
    expect(CHART_COLORS.length).toBeGreaterThanOrEqual(10);
  });

  it('exports at least 10 treemap colors', () => {
    expect(TREEMAP_COLORS.length).toBeGreaterThanOrEqual(10);
  });

  it('all colors are valid HSL strings', () => {
    const hslRegex = /^hsl\(\d+,\s*\d+%,\s*\d+%\)$/;
    [...CHART_COLORS, ...TREEMAP_COLORS, PRIMARY_COLOR, POSITIVE_COLOR, NEGATIVE_COLOR].forEach(color => {
      expect(color).toMatch(hslRegex);
    });
  });
});
