import { describe, it, expect } from 'vitest';
import { formatCurrency, formatFullCurrency, formatPercent, formatNumber, formatMilestone } from '@/lib/formatters';

describe('formatCurrency', () => {
  it('formats millions with M suffix', () => {
    expect(formatCurrency(1_500_000, '€')).toBe('€1.5M');
    expect(formatCurrency(-2_300_000, '$')).toBe('$-2.3M');
  });

  it('formats thousands with k suffix', () => {
    expect(formatCurrency(12_500, '€')).toBe('€12.5k');
    expect(formatCurrency(1_000, '$')).toBe('$1.0k');
  });

  it('formats small values without suffix', () => {
    expect(formatCurrency(500, '€')).toBe('€500');
    expect(formatCurrency(0, '$')).toBe('$0');
  });

  it('handles NOK symbol as kr', () => {
    expect(formatCurrency(5_000, 'NOK')).toBe('kr5.0k');
  });
});

describe('formatFullCurrency', () => {
  it('formats EUR with de-DE locale', () => {
    const result = formatFullCurrency(1234.56, 'EUR', 'de-DE');
    expect(result).toContain('1.234,56');
  });

  it('formats USD with en-US locale', () => {
    const result = formatFullCurrency(1234.56, 'USD', 'en-US');
    expect(result).toContain('1,234.56');
  });

  it('formats GBP correctly', () => {
    const result = formatFullCurrency(999.99, 'GBP', 'en-GB');
    expect(result).toContain('999.99');
  });
});

describe('formatPercent', () => {
  it('adds + sign for positive values', () => {
    expect(formatPercent(5.5)).toBe('+5.5%');
  });

  it('no sign for negative values (already has minus)', () => {
    expect(formatPercent(-3.2)).toBe('-3.2%');
  });

  it('no sign for zero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });
});

describe('formatNumber', () => {
  it('formats millions', () => {
    expect(formatNumber(2_500_000)).toBe('2.5M');
  });

  it('formats thousands', () => {
    expect(formatNumber(7_800)).toBe('7.8k');
  });

  it('formats small numbers', () => {
    expect(formatNumber(42)).toBe('42');
  });
});

describe('formatMilestone', () => {
  it('formats million milestones', () => {
    expect(formatMilestone(1_000_000, '€')).toBe('€1M');
  });

  it('formats thousand milestones', () => {
    expect(formatMilestone(100_000, '$')).toBe('$100k');
  });

  it('handles NOK', () => {
    expect(formatMilestone(50_000, 'NOK')).toBe('kr50k');
  });
});
