import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock both context hooks before importing the module under test.
const currencyState = {
  currency: { code: 'EUR', symbol: '€', locale: 'de-DE' },
};
const preferencesState = { numberLocale: undefined as string | undefined };

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => currencyState,
}));

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => preferencesState,
}));

import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';

describe('useCurrencyFormatter', () => {
  beforeEach(() => {
    currencyState.currency = { code: 'EUR', symbol: '€', locale: 'de-DE' };
    preferencesState.numberLocale = undefined;
  });

  it('returns fmt, fmtFull, fmtMilestone and currency', () => {
    const { result } = renderHook(() => useCurrencyFormatter());
    expect(typeof result.current.fmt).toBe('function');
    expect(typeof result.current.fmtFull).toBe('function');
    expect(typeof result.current.fmtMilestone).toBe('function');
    expect(result.current.currency).toBeDefined();
  });

  it('fmt formats using the currency symbol (abbreviated)', () => {
    const { result } = renderHook(() => useCurrencyFormatter());
    expect(result.current.fmt(1_500)).toBe('€1.5k');
    expect(result.current.fmt(2_000_000)).toBe('€2.0M');
    expect(result.current.fmt(50)).toBe('€50');
  });

  it('fmt returns em-dash for non-finite values', () => {
    const { result } = renderHook(() => useCurrencyFormatter());
    expect(result.current.fmt(NaN)).toBe('—');
    expect(result.current.fmt(Infinity)).toBe('—');
  });

  it('fmtFull returns a locale-formatted currency string', () => {
    const { result } = renderHook(() => useCurrencyFormatter());
    const formatted = result.current.fmtFull(1234.5);
    // Must include the currency code or symbol and the amount.
    expect(formatted).toMatch(/1.234/); // de-DE uses dots as thousands separator
    expect(formatted).toMatch(/EUR|€/);
  });

  it('fmtMilestone formats milestone badges (whole numbers)', () => {
    const { result } = renderHook(() => useCurrencyFormatter());
    expect(result.current.fmtMilestone(100_000)).toBe('€100k');
    expect(result.current.fmtMilestone(1_000_000)).toBe('€1M');
    expect(result.current.fmtMilestone(500)).toBe('€500');
  });

  it('currency reflects the active currency config', () => {
    const { result } = renderHook(() => useCurrencyFormatter());
    expect(result.current.currency.code).toBe('EUR');
    expect(result.current.currency.symbol).toBe('€');
    expect(result.current.currency.locale).toBe('de-DE');
  });

  it('numberLocale overrides the currency locale for fmtFull', () => {
    preferencesState.numberLocale = 'en-US';
    const { result } = renderHook(() => useCurrencyFormatter());
    // Effective currency should use the override locale, not de-DE.
    expect(result.current.currency.locale).toBe('en-US');
    const formatted = result.current.fmtFull(1234.5);
    // en-US uses commas as thousands separators.
    expect(formatted).toMatch(/1,234/);
  });

  it('currency code is NOT overridden by numberLocale (only locale changes)', () => {
    preferencesState.numberLocale = 'en-US';
    const { result } = renderHook(() => useCurrencyFormatter());
    expect(result.current.currency.code).toBe('EUR');
    expect(result.current.currency.symbol).toBe('€');
  });

  it('uses USD symbol when active currency is USD', () => {
    currencyState.currency = { code: 'USD', symbol: '$', locale: 'en-US' };
    const { result } = renderHook(() => useCurrencyFormatter());
    expect(result.current.fmt(5_000)).toBe('$5.0k');
    expect(result.current.fmtMilestone(1_000_000)).toBe('$1M');
  });
});
