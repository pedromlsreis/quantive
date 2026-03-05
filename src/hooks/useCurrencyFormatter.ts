import { useCallback } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { formatCurrency, formatFullCurrency, formatMilestone } from '@/lib/formatters';

/**
 * Returns memoised currency formatting functions bound to the active currency.
 * Use this hook in components instead of calling setActiveCurrency().
 */
export function useCurrencyFormatter() {
  const { currency } = useCurrency();

  const fmt = useCallback(
    (value: number) => formatCurrency(value, currency.symbol),
    [currency.symbol],
  );

  const fmtFull = useCallback(
    (value: number) => formatFullCurrency(value, currency.code, currency.locale),
    [currency.code, currency.locale],
  );

  const fmtMilestone = useCallback(
    (value: number) => formatMilestone(value, currency.symbol),
    [currency.symbol],
  );

  return { fmt, fmtFull, fmtMilestone, currency };
}
