/**
 * @module formatters
 * Formatting utilities for currencies, percentages, and numbers.
 * Used throughout the dashboard for consistent display.
 */

import type { CurrencyCode } from '@/contexts/CurrencyContext';

/** Configuration for a supported currency. */
export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  locale: string;
}

// Non-finite (NaN/Infinity) means upstream couldn't resolve a value — typically
// a missing FX rate. Render an em-dash so the gap is visible rather than
// silently showing "NaN" or a misleading zero.
const MISSING = '—';

/**
 * Format a number as abbreviated currency (e.g. €12.3k, $1.2M).
 * The symbol is whatever the CurrencyContext entry says — Nordic codes
 * (NOK/SEK/DKK) render as their ISO code so "kr" doesn't become ambiguous,
 * and CAD/AUD use country-prefixed dollar signs (CA$/A$).
 */
export function formatCurrency(value: number, symbol: string): string {
  if (!Number.isFinite(value)) return MISSING;
  if (Math.abs(value) >= 1_000_000) {
    return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${symbol}${(value / 1_000).toFixed(1)}k`;
  }
  return `${symbol}${value.toFixed(0)}`;
}

/**
 * Format a number as full Intl-formatted currency (e.g. €12,345.67, ¥1,234).
 * Uses the browser's Intl.NumberFormat for locale-correct output. We do NOT
 * pin min/max fraction digits — Intl picks currency-appropriate defaults
 * (2 for EUR/USD/etc., 0 for JPY, 3 for KWD/BHD if we ever add them).
 */
export function formatFullCurrency(value: number, code: CurrencyCode, locale: string): string {
  if (!Number.isFinite(value)) return MISSING;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
  }).format(value);
}

/**
 * Format a number as a percentage with sign (e.g. "+5.2%", "-3.1%").
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return MISSING;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format a number with abbreviated suffixes (e.g. 1.2M, 45.3k).
 * No currency symbol — use for axis labels and raw numeric display.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return MISSING;
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toFixed(0);
}

/** Compact a scaled value for a badge: at most one decimal, trailing ".0" dropped. */
function compact(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/**
 * Format a milestone badge label (e.g. €100k, $1.2M). Round values stay clean
 * (€1M, not €1.0M); non-round user-entered milestones are shortened to one
 * decimal rather than rendering a long tail (€1.234567M).
 */
export function formatMilestone(value: number, symbol: string): string {
  if (!Number.isFinite(value)) return MISSING;
  if (value >= 1_000_000) return `${symbol}${compact(value / 1_000_000)}M`;
  if (value >= 1_000) return `${symbol}${compact(value / 1_000)}k`;
  return `${symbol}${value}`;
}
