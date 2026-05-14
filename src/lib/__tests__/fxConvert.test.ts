import { describe, it, expect } from 'vitest';
import {
  buildSeries,
  convert,
  rateAt,
  coerceCurrency,
  toIsoDate,
  type FxRow,
} from '@/lib/fxConvert';

// Reference rates used throughout — picked so cross-rate math is verifiable
// by hand. rate_to_base = EUR per 1 unit of currency.
//   1 EUR = 1 / 0.93 USD ≈ 1.0753 USD     (USD rate_to_base = 0.93)
//   1 EUR = 1 / 0.85 GBP ≈ 1.1765 GBP     (GBP rate_to_base = 0.85)
const RATES: FxRow[] = [
  { date: '2026-05-12', currency: 'USD', rate_to_base: 0.92 },
  { date: '2026-05-12', currency: 'GBP', rate_to_base: 0.84 },
  { date: '2026-05-13', currency: 'USD', rate_to_base: 0.93 },  // Wed
  { date: '2026-05-13', currency: 'GBP', rate_to_base: 0.85 },
  { date: '2026-05-14', currency: 'USD', rate_to_base: 0.94 },  // Thu
  { date: '2026-05-14', currency: 'GBP', rate_to_base: 0.86 },
  // 2026-05-15 (Fri) intentionally absent — simulates a holiday gap so the
  // "latest <= date" lookup is exercised.
];

const series = buildSeries(RATES);

describe('convert (FX math)', () => {
  it('same-currency conversion is identity, no rate lookup', () => {
    // Pass an empty series Map — same-currency must still return amount.
    expect(convert(1000, 'EUR', 'EUR', new Date(2026, 4, 13), new Map())).toBe(1000);
    expect(convert(500, 'USD', 'USD', new Date(2026, 4, 13), new Map())).toBe(500);
  });

  it('EUR → USD multiplies by 1/rate_to_base[USD]', () => {
    // 1000 EUR → USD on 2026-05-13: 1000 / 0.93 ≈ 1075.27
    const result = convert(1000, 'EUR', 'USD', new Date(2026, 4, 13), series);
    expect(result).toBeCloseTo(1000 / 0.93, 6);
  });

  it('USD → EUR is the inverse: round-trip preserves the amount', () => {
    const d = new Date(2026, 4, 13);
    const toUsd = convert(1000, 'EUR', 'USD', d, series);
    const backToEur = convert(toUsd, 'USD', 'EUR', d, series);
    expect(backToEur).toBeCloseTo(1000, 6);
  });

  it('USD → GBP routes through EUR base (cross-rate)', () => {
    // 100 USD → EUR: 100 * 0.93 = 93 EUR
    // 93 EUR → GBP: 93 / 0.85 ≈ 109.41 GBP
    // Combined: 100 * 0.93 / 0.85
    const result = convert(100, 'USD', 'GBP', new Date(2026, 4, 13), series);
    expect(result).toBeCloseTo((100 * 0.93) / 0.85, 6);
  });

  it('uses the latest rate on-or-before the target date (weekend/holiday gap)', () => {
    // 2026-05-15 (Fri) has no rate row; the lookup must fall back to
    // 2026-05-14 (Thu). Using *today's* rate (or skipping silently) is the
    // bug this whole design is meant to prevent.
    const fri = new Date(2026, 4, 15);
    const thu = new Date(2026, 4, 14);
    expect(convert(1000, 'EUR', 'USD', fri, series))
      .toBeCloseTo(convert(1000, 'EUR', 'USD', thu, series), 6);
  });

  it('returns NaN when no rate exists on or before the target date', () => {
    // 2026-05-10 predates every row in RATES.
    const result = convert(1000, 'EUR', 'USD', new Date(2026, 4, 10), series);
    expect(Number.isNaN(result)).toBe(true);
  });

  it('returns NaN for an unknown currency', () => {
    // JPY is not in the series — silent fallback to today's USD rate would
    // be catastrophic; NaN propagation is the right behaviour.
    const result = convert(1000, 'EUR', 'JPY' as never, new Date(2026, 4, 13), series);
    expect(Number.isNaN(result)).toBe(true);
  });
});

describe('rateAt (binary search "latest <= date")', () => {
  const usd = series.get('USD')!;

  it('returns the rate for an exact date match', () => {
    expect(rateAt(usd, '2026-05-13')).toBe(0.93);
  });

  it('returns the latest prior rate when the target date is missing', () => {
    expect(rateAt(usd, '2026-05-15')).toBe(0.94); // falls back to Thu
  });

  it('returns null when the target date is before every available date', () => {
    expect(rateAt(usd, '2026-05-11')).toBeNull();
  });

  it('returns the most recent rate when the target date is after all rows', () => {
    expect(rateAt(usd, '2030-01-01')).toBe(0.94);
  });
});

describe('toIsoDate', () => {
  it('formats a Date using local-time components (avoids UTC drift)', () => {
    // Pick a date with month/day < 10 so the zero-padding is exercised.
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('coerceCurrency', () => {
  it('passes through a supported code unchanged', () => {
    expect(coerceCurrency('USD')).toBe('USD');
    expect(coerceCurrency('EUR')).toBe('EUR');
  });

  it('uppercases and trims forgiving inputs', () => {
    expect(coerceCurrency('  usd  ')).toBe('USD');
    expect(coerceCurrency('gbp')).toBe('GBP');
  });

  it('falls back to EUR for missing or empty values (backwards compat)', () => {
    expect(coerceCurrency(undefined)).toBe('EUR');
    expect(coerceCurrency(null)).toBe('EUR');
    expect(coerceCurrency('')).toBe('EUR');
  });

  it('falls back to EUR for unsupported currency codes', () => {
    expect(coerceCurrency('JPY')).toBe('EUR');
    expect(coerceCurrency('XXX')).toBe('EUR');
    expect(coerceCurrency(42)).toBe('EUR'); // numbers etc.
  });
});
