/**
 * @module currencies
 * Single source of truth for the currencies the app understands.
 *
 * To add or remove a currency, edit this file ONLY:
 *   1. Append the ISO 4217 code to CURRENCY_CODES.
 *   2. Add the matching entry to CURRENCIES (name + symbol + locale).
 *
 * No other file maintains a parallel list. The fx-ingest Edge Function does
 * not filter on currency — it persists every code Frankfurter returns. The
 * client decides what to expose via this module.
 *
 * This file is intentionally framework-free (no React, no Supabase imports)
 * so it could be consumed from non-browser runtimes if ever needed.
 */

export const BASE_CURRENCY = 'EUR' as const;

/**
 * Supported ISO 4217 codes, in the order they should appear in pickers
 * (base first, then ordered by region affinity).
 */
export const CURRENCY_CODES = [
  'EUR',
  'USD', 'GBP',
  'NOK', 'SEK', 'DKK',
  'CHF',
  'CAD', 'AUD',
  'JPY',
  'PLN',
  'BRL',
  'INR',
] as const;

export type CurrencyCode = typeof CURRENCY_CODES[number];

export interface CurrencyConfig {
  code: CurrencyCode;
  /** English display name (e.g. "Indian Rupee"). Shown alongside the code in pickers. */
  name: string;
  /**
   * Glyph used in compact rendering (KPI cards, badges, axis labels). Chosen
   * to be unambiguous: where a native glyph is shared across currencies
   * (`$`, `kr`), we fall back to the ISO code or a country-prefixed dollar.
   */
  symbol: string;
  /** BCP-47 locale used by `formatFullCurrency` (`Intl.NumberFormat`). */
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  EUR: { code: 'EUR', name: 'Euro',              symbol: '€',   locale: 'de-DE' },
  USD: { code: 'USD', name: 'US Dollar',         symbol: '$',   locale: 'en-US' },
  GBP: { code: 'GBP', name: 'British Pound',     symbol: '£',   locale: 'en-GB' },
  NOK: { code: 'NOK', name: 'Norwegian Krone',   symbol: 'NOK', locale: 'nb-NO' },
  SEK: { code: 'SEK', name: 'Swedish Krona',     symbol: 'SEK', locale: 'sv-SE' },
  DKK: { code: 'DKK', name: 'Danish Krone',      symbol: 'DKK', locale: 'da-DK' },
  CHF: { code: 'CHF', name: 'Swiss Franc',       symbol: 'CHF', locale: 'de-CH' },
  CAD: { code: 'CAD', name: 'Canadian Dollar',   symbol: 'CA$', locale: 'en-CA' },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$',  locale: 'en-AU' },
  JPY: { code: 'JPY', name: 'Japanese Yen',      symbol: '¥',   locale: 'ja-JP' },
  PLN: { code: 'PLN', name: 'Polish Złoty',      symbol: 'zł',  locale: 'pl-PL' },
  BRL: { code: 'BRL', name: 'Brazilian Real',    symbol: 'R$',  locale: 'pt-BR' },
  INR: { code: 'INR', name: 'Indian Rupee',      symbol: '₹',   locale: 'en-IN' },
};

/** Lookup set for `coerceCurrency` and runtime validation. */
export const SUPPORTED_CURRENCIES: ReadonlySet<CurrencyCode> = new Set(CURRENCY_CODES);
