import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CurrencyCode } from '@/contexts/CurrencyContext';
import { buildSeries, convert, type FxRow, type FxSeriesByCurrency } from '@/lib/fxConvert';

// Thin React wrapper around the pure fxConvert module. Loads fx_rates rows
// once, derives the per-currency series, and exposes a memoised convertAt
// closure for the rest of the app.

export interface FxRatesApi {
  /** True once rates have loaded (or the query failed and gave up). */
  ready: boolean;
  /**
   * Convert `amount` from `from` to `to` using the rate valid on `date`.
   * Returns NaN if rates are unavailable. See `lib/fxConvert.convert` for
   * the math and lookup rule.
   */
  convertAt: (amount: number, from: CurrencyCode, to: CurrencyCode, date: Date) => number;
}

export function useFxRates(): FxRatesApi {
  const [rows, setRows] = useState<FxRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    (async () => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('date, currency, rate_to_base')
        .order('date', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('[useFxRates] failed to load rates:', error);
        setRows([]);
        return;
      }
      setRows((data ?? []) as FxRow[]);
    })();
    return () => { cancelled = true; };
  }, []);

  const seriesByCcy = useMemo<FxSeriesByCurrency | null>(
    () => (rows ? buildSeries(rows) : null),
    [rows],
  );

  const convertAt = useCallback(
    (amount: number, from: CurrencyCode, to: CurrencyCode, date: Date): number => {
      if (from === to) return amount;
      if (!seriesByCcy) return NaN;
      return convert(amount, from, to, date, seriesByCcy);
    },
    [seriesByCcy],
  );

  return { ready: rows !== null, convertAt };
}
