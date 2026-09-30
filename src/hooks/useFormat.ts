import { useMemo } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { money, pct, tone, type FmtCtx, type MoneyOptions } from '@/lib/formatters';

/**
 * The locale numbers are written in: the Settings choice, else the browser's
 * language. Never the currency's: euros are written 1,234 in Dublin and
 * 1.234 in Berlin, so the currency can't decide.
 */
export function browserNumberLocale(): string {
  if (typeof navigator === 'undefined') return 'en-GB';
  const candidate = navigator.languages?.[0] ?? navigator.language ?? 'en-GB';
  try {
    return Intl.NumberFormat.supportedLocalesOf([candidate])[0] ?? 'en-GB';
  } catch {
    return 'en-GB';
  }
}

/** Formatting bound to the display currency and the effective number locale. */
export function useFormat() {
  const { currency } = useCurrency();
  const { numberLocale } = usePreferences();

  return useMemo(() => {
    const ctx: FmtCtx = { currency: currency.code, locale: numberLocale ?? browserNumberLocale() };
    return {
      ctx,
      currency,
      money: (v: number, opts?: MoneyOptions) => money(v, ctx, opts),
      pct: (v: number, opts?: { signed?: boolean }) => pct(v, ctx, opts),
      tone,
    };
  }, [currency, numberLocale]);
}
