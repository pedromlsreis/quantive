/**
 * @module fxConvert
 * Pure FX conversion primitives. Extracted from `useFxRates` so the
 * load-bearing math (lookup rule + cross-rate derivation) is testable without
 * mounting React or mocking Supabase.
 *
 * All rates are anchored to EUR. `rate_to_base` = EUR per 1 unit of currency.
 * EUR has no row — its implied `rate_to_base` is 1.
 */

import type { CurrencyCode } from '@/contexts/CurrencyContext';

export const BASE_CURRENCY: CurrencyCode = 'EUR';

export const SUPPORTED_CURRENCIES: ReadonlySet<CurrencyCode> = new Set(['EUR', 'USD', 'GBP', 'NOK']);

/**
 * Coerce an unknown value to a CurrencyCode. Trims, uppercases, and validates
 * against the supported set. Anything missing or unrecognised falls back to
 * the historical default (EUR). Used at every system boundary (Excel ingest,
 * cloud decode, localStorage decode) so a single rule governs all paths.
 */
export function coerceCurrency(value: unknown): CurrencyCode {
  if (value === undefined || value === null || value === '') return BASE_CURRENCY;
  const upper = String(value).trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(upper as CurrencyCode) ? (upper as CurrencyCode) : BASE_CURRENCY;
}

export interface FxRow {
  date: string;          // ISO YYYY-MM-DD
  currency: string;
  rate_to_base: number;  // EUR per 1 unit of `currency`
}

/** Per-currency time series: pre-sorted ISO dates + lookup map. */
export interface FxSeries {
  dates: string[];
  rates: Map<string, number>;
}

export type FxSeriesByCurrency = Map<string, FxSeries>;

/**
 * Format a Date as a local-time ISO date string (YYYY-MM-DD). We compare
 * against ECB business dates stored as date-only strings, so timezones must
 * not creep in.
 */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build per-currency time series from flat fx_rates rows. Sorts ascending
 * by date so callers can binary-search.
 */
export function buildSeries(rows: FxRow[]): FxSeriesByCurrency {
  const grouped = new Map<string, FxRow[]>();
  for (const r of rows) {
    const arr = grouped.get(r.currency) ?? [];
    arr.push(r);
    grouped.set(r.currency, arr);
  }
  const out: FxSeriesByCurrency = new Map();
  for (const [ccy, arr] of grouped) {
    arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    out.set(ccy, {
      dates: arr.map(r => r.date),
      rates: new Map(arr.map(r => [r.date, Number(r.rate_to_base)])),
    });
  }
  return out;
}

/**
 * Find the largest series.dates[i] <= isoDate (the "latest rate on or before
 * the target date" rule that mirrors the SQL convert_at helper). Returns null
 * if every available date is strictly after isoDate.
 */
export function rateAt(series: FxSeries, isoDate: string): number | null {
  let lo = 0;
  let hi = series.dates.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.dates[mid] <= isoDate) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best === -1) return null;
  return series.rates.get(series.dates[best])!;
}

/**
 * Convert `amount` from `from` currency to `to` currency using the rate valid
 * on `date`. Routes through EUR base:
 *   amount_in_base = amount * rate_to_base[from]
 *   amount_in_to   = amount_in_base / rate_to_base[to]
 *
 * Returns NaN if either currency has no rate on or before `date`. NaN
 * propagates through arithmetic so missing data renders as "—" rather than
 * silently appearing as the wrong number.
 *
 * Pass an empty Map for `seriesByCcy` (e.g. while rates are still loading)
 * and any non-identity conversion returns NaN.
 */
export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  date: Date,
  seriesByCcy: FxSeriesByCurrency,
): number {
  if (from === to) return amount;
  const key = toIsoDate(date);
  const rateToBase = (ccy: CurrencyCode): number | null => {
    if (ccy === BASE_CURRENCY) return 1;
    const s = seriesByCcy.get(ccy);
    if (!s) return null;
    return rateAt(s, key);
  };
  const fromRate = rateToBase(from);
  const toRate = rateToBase(to);
  if (fromRate === null || toRate === null) return NaN;
  return (amount * fromRate) / toRate;
}
