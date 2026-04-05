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

/**
 * Format a number as abbreviated currency (e.g. €12.3k, $1.2M).
 * Uses "kr" instead of "NOK" for Norwegian Krone.
 */
export function formatCurrency(value: number, symbol: string): string {
  const s = symbol === 'NOK' ? 'kr' : symbol;
  if (Math.abs(value) >= 1_000_000) {
    return `${s}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${s}${(value / 1_000).toFixed(1)}k`;
  }
  return `${s}${value.toFixed(0)}`;
}

/**
 * Format a number as full Intl-formatted currency (e.g. €12,345.67).
 * Uses the browser's Intl.NumberFormat for locale-correct output.
 */
export function formatFullCurrency(value: number, code: CurrencyCode, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a number as a percentage with sign (e.g. "+5.2%", "-3.1%").
 */
export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format a number with abbreviated suffixes (e.g. 1.2M, 45.3k).
 * No currency symbol — use for axis labels and raw numeric display.
 */
export function formatNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toFixed(0);
}

/**
 * Format a milestone badge label (e.g. €100k, $1M).
 * Uses whole numbers without decimals for clean badge display.
 */
export function formatMilestone(value: number, symbol: string): string {
  const s = symbol === 'NOK' ? 'kr' : symbol;
  if (value >= 1_000_000) return `${s}${value / 1_000_000}M`;
  if (value >= 1_000) return `${s}${value / 1_000}k`;
  return `${s}${value}`;
}
