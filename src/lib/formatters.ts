import type { CurrencyCode } from '@/contexts/CurrencyContext';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  locale: string;
}

/** Abbreviated currency format: €12.3k, $1.2M */
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

/** Full Intl-formatted currency: €12,345.67 */
export function formatFullCurrency(value: number, code: CurrencyCode, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toFixed(0);
}

/** Milestone badge label: €100k, $1M */
export function formatMilestone(value: number, symbol: string): string {
  const s = symbol === 'NOK' ? 'kr' : symbol;
  if (value >= 1_000_000) return `${s}${value / 1_000_000}M`;
  if (value >= 1_000) return `${s}${value / 1_000}k`;
  return `${s}${value}`;
}
