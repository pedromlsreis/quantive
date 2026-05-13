import { useCallback, useMemo } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatCurrency, formatFullCurrency, formatMilestone } from '@/lib/formatters';

/**
 * Returns memoised currency formatting functions bound to the active currency.
 * Honors the user's number-format preference: when set to anything other than
 * "auto" it overrides the currency's default locale for number rendering only.
 */
export function useCurrencyFormatter() {
  const { currency } = useCurrency();
  const { numberLocale } = usePreferences();

  const effective = useMemo(
    () => (numberLocale ? { ...currency, locale: numberLocale } : currency),
    [currency, numberLocale],
  );

  const fmt = useCallback(
    (value: number) => formatCurrency(value, effective.symbol),
    [effective.symbol],
  );

  const fmtFull = useCallback(
    (value: number) => formatFullCurrency(value, effective.code, effective.locale),
    [effective.code, effective.locale],
  );

  const fmtMilestone = useCallback(
    (value: number) => formatMilestone(value, effective.symbol),
    [effective.symbol],
  );

  return { fmt, fmtFull, fmtMilestone, currency: effective };
}
