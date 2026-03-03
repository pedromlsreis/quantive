import type { CurrencyCode } from '@/contexts/CurrencyContext';

// These will be set by the CurrencyProvider via setActiveCurrency
let _code: CurrencyCode = 'EUR';
let _symbol = '€';
let _locale = 'de-DE';

export function setActiveCurrency(code: CurrencyCode, symbol: string, locale: string) {
  _code = code;
  _symbol = symbol;
  _locale = locale;
}

export function formatCurrency(value: number): string {
  const s = _symbol === 'NOK' ? 'kr' : _symbol;
  if (Math.abs(value) >= 1_000_000) {
    return `${s}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${s}${(value / 1_000).toFixed(1)}k`;
  }
  return `${s}${value.toFixed(0)}`;
}

export function formatFullCurrency(value: number): string {
  return new Intl.NumberFormat(_locale, {
    style: 'currency',
    currency: _code,
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
