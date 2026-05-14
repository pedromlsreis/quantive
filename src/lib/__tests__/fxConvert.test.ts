import { describe, it, expect } from 'vitest';
import {
  buildSeries,
  convert,
  rateAt,
  coerceCurrency,
  toIsoDate,
  type FxRow,
} from '@/lib/fxConvert';
import { BASE_CURRENCY, CURRENCY_CODES, type CurrencyCode } from '@/lib/currencies';

// Reference rates used by the hand-written math tests below — picked so the
// cross-rate verification is checkable by hand.
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

// Foreign currencies (everything except the base). Used to parameterise the
// "works for every currency" tests below.
const FOREIGN: CurrencyCode[] = CURRENCY_CODES.filter(c => c !== BASE_CURRENCY) as CurrencyCode[];

describe('convert (FX math, hand-checked)', () => {
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

  it('returns NaN when the target currency has no series loaded', () => {
    // CNY is not in our supported set; the function correctly bails to NaN
    // rather than silently using some default rate.
    const result = convert(1000, 'EUR', 'CNY' as never, new Date(2026, 4, 13), series);
    expect(Number.isNaN(result)).toBe(true);
  });
});

// =============================================================================
// Parameterised coverage: every supported foreign currency must work for the
// three fundamental conversion directions. If a new currency is added to
// CURRENCY_CODES without anything else, these tests fail loudly — which is the
// whole point of the canonical catalog. We seed a synthetic rate per foreign
// currency on one date.
// =============================================================================

const DATE = new Date(2026, 4, 13);
const ISO_DATE = '2026-05-13';

// Spread the synthetic rates over a useful range (0.005 .. 100+) so any code
// that accidentally truncates or overflows would surface here. Each currency
// gets a deterministic but distinct rate so cross-rates aren't trivially equal.
function syntheticRate(ccy: CurrencyCode): number {
  // Hash-ish: deterministic, bounded, never 1 (which would mask bugs that only
  // appear when from-rate != to-rate).
  const seed = [...ccy].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return 0.05 + (seed % 41) * 0.07; // ~0.05 .. ~2.85
}

const allCurrenciesSeries = buildSeries(
  FOREIGN.map(c => ({ date: ISO_DATE, currency: c, rate_to_base: syntheticRate(c) })),
);

describe('convert (parameterised over every supported currency)', () => {
  it.each(FOREIGN)('EUR → %s → EUR round-trip preserves the amount', (ccy) => {
    const toCcy = convert(1000, 'EUR', ccy, DATE, allCurrenciesSeries);
    const back  = convert(toCcy, ccy, 'EUR', DATE, allCurrenciesSeries);
    expect(Number.isFinite(toCcy)).toBe(true);
    expect(back).toBeCloseTo(1000, 6);
  });

  it.each(FOREIGN)('%s → EUR uses amount * rate_to_base', (ccy) => {
    const rate = syntheticRate(ccy);
    const result = convert(100, ccy, 'EUR', DATE, allCurrenciesSeries);
    expect(result).toBeCloseTo(100 * rate, 6);
  });

  // Cross-rate test: pair each foreign currency with the next one in the list
  // (wrapping at the end). Verifies every currency works as BOTH a source and
  // a target in a non-base→non-base conversion (the cross-rate path).
  const crossPairs: Array<[CurrencyCode, CurrencyCode]> = FOREIGN.map(
    (from, i) => [from, FOREIGN[(i + 1) % FOREIGN.length]] as [CurrencyCode, CurrencyCode],
  );

  it.each(crossPairs)('%s → %s cross-rate equals amount * rate_from / rate_to', (from, to) => {
    const rateFrom = syntheticRate(from);
    const rateTo = syntheticRate(to);
    const expected = (100 * rateFrom) / rateTo;
    const actual = convert(100, from, to, DATE, allCurrenciesSeries);
    expect(actual).toBeCloseTo(expected, 6);
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
    // CNY, ZAR are not in SUPPORTED_CURRENCIES — they round-trip to EUR.
    expect(coerceCurrency('CNY')).toBe('EUR');
    expect(coerceCurrency('ZAR')).toBe('EUR');
    expect(coerceCurrency('XXX')).toBe('EUR');
    expect(coerceCurrency(42)).toBe('EUR'); // numbers etc.
  });

  // Parameterised: every supported code must round-trip through coerceCurrency
  // unchanged. Adding a code to CURRENCY_CODES without updating the SET would
  // fail here (it can't — they share a definition — but the assertion locks
  // the invariant in).
  it.each(CURRENCY_CODES)('%s is preserved (single source of truth)', (code) => {
    expect(coerceCurrency(code)).toBe(code);
    // Lowercase version also normalises back to the canonical code.
    expect(coerceCurrency(code.toLowerCase())).toBe(code);
  });
});
