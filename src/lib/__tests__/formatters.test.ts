import { describe, it, expect } from 'vitest';
import { formatCurrency, formatFullCurrency, formatPercent, formatNumber, formatMilestone } from '@/lib/formatters';
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies';

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

  it('renders Nordic codes as ISO strings to disambiguate from other "kr" currencies', () => {
    expect(formatCurrency(5_000, 'NOK')).toBe('NOK5.0k');
    expect(formatCurrency(5_000, 'SEK')).toBe('SEK5.0k');
    expect(formatCurrency(5_000, 'DKK')).toBe('DKK5.0k');
  });

  it('renders prefixed dollar symbols for CAD/AUD', () => {
    expect(formatCurrency(2_000, 'CA$')).toBe('CA$2.0k');
    expect(formatCurrency(2_000, 'A$')).toBe('A$2.0k');
  });

  it('renders em-dash for non-finite values (missing FX rate)', () => {
    expect(formatCurrency(NaN, '€')).toBe('—');
    expect(formatCurrency(Infinity, '$')).toBe('—');
  });

  it('does not roll across the k→M threshold when rounding up (999_999 stays in k)', () => {
    // 999_999 is below 1M, so it formats as thousands; toFixed(1) rounds the
    // quotient up to 1000.0. Pinned so the boundary behaviour is intentional.
    expect(formatCurrency(999_999, '€')).toBe('€1000.0k');
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

  it('uses currency-native decimals (JPY has 0, EUR/USD/etc. have 2)', () => {
    // JPY's smallest unit is the yen — Intl renders no decimals for it.
    // We verify by absence of "." rather than exact spacing, which varies
    // by ICU build.
    const jpy = formatFullCurrency(1234, 'JPY', 'ja-JP');
    expect(jpy).not.toContain('.');
    expect(jpy).toContain('1,234');
  });

  it('renders em-dash for NaN', () => {
    expect(formatFullCurrency(NaN, 'EUR', 'de-DE')).toBe('—');
  });

  // Parameterised: every supported currency must render a non-empty,
  // non-NaN-looking output. Catches new currencies whose locale doesn't
  // resolve in the runtime's ICU data, or whose code Intl rejects.
  it.each(CURRENCY_CODES)('%s renders without errors and includes the amount', (code) => {
    const { locale } = CURRENCIES[code];
    const out = formatFullCurrency(1234.56, code, locale);
    expect(out).toBeTruthy();
    expect(out).not.toContain('NaN');
    // Intl strips spaces inconsistently across locales — match digits only.
    expect(out.replace(/[^\d]/g, '')).toMatch(/1234|1235/); // accounts for rounding
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

  it('renders em-dash for NaN', () => {
    expect(formatPercent(NaN)).toBe('—');
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

  it('formats negative values with the suffix', () => {
    expect(formatNumber(-7_800)).toBe('-7.8k');
    expect(formatNumber(-2_500_000)).toBe('-2.5M');
  });

  it('renders em-dash for non-finite values (axis labels never show NaN)', () => {
    expect(formatNumber(NaN)).toBe('—');
    expect(formatNumber(Infinity)).toBe('—');
  });
});

describe('formatMilestone', () => {
  it('formats million milestones', () => {
    expect(formatMilestone(1_000_000, '€')).toBe('€1M');
  });

  it('formats thousand milestones', () => {
    expect(formatMilestone(100_000, '$')).toBe('$100k');
  });

  it('keeps round milestones clean (no trailing .0)', () => {
    expect(formatMilestone(1_000_000, '€')).toBe('€1M');
    expect(formatMilestone(2_000, '€')).toBe('€2k');
    expect(formatMilestone(1_500_000, '€')).toBe('€1.5M');
  });

  it('shortens non-round user-entered milestones to one decimal', () => {
    // parseFloat lets users add any positive value; without rounding these
    // rendered as "€1.234567M" / "€123.456k".
    expect(formatMilestone(1_234_567, '€')).toBe('€1.2M');
    expect(formatMilestone(123_456, '€')).toBe('€123.5k');
  });

  it('renders em-dash for non-finite values', () => {
    expect(formatMilestone(NaN, '€')).toBe('—');
  });

  it('renders Nordic codes as ISO strings', () => {
    expect(formatMilestone(50_000, 'NOK')).toBe('NOK50k');
    expect(formatMilestone(50_000, 'SEK')).toBe('SEK50k');
  });

  // Parameterised: each currency's canonical symbol must produce a valid
  // compact label for thousand and million milestones.
  it.each(CURRENCY_CODES)('%s milestone labels include the symbol', (code) => {
    const { symbol } = CURRENCIES[code];
    expect(formatMilestone(1_000_000, symbol)).toContain(symbol);
    expect(formatMilestone(1_000_000, symbol)).toContain('M');
    expect(formatMilestone(100_000, symbol)).toContain(symbol);
    expect(formatMilestone(100_000, symbol)).toContain('k');
  });
});
