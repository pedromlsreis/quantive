import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CurrencyCode } from '@/contexts/CurrencyContext';

// All stored amounts are denominated in EUR (base). This module converts
// EUR → display currency at the rate that was valid on the snapshot's own
// date, mirroring the SQL `convert_at` helper. Lookup rule: latest rate on
// or before the target date (ECB doesn't publish on weekends/holidays).

const BASE: CurrencyCode = 'EUR';

interface FxRow {
  date: string; // ISO YYYY-MM-DD from PostgREST
  rate_to_base: number;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface FxRatesApi {
  /** True once the rate set for `target` is loaded (or target = base). */
  ready: boolean;
  /**
   * Convert an EUR amount into the target currency using the rate valid on
   * `date`. Returns NaN if no rate is available on or before that date —
   * NaN propagates through arithmetic so missing data renders as "—" rather
   * than silently appearing as the wrong number.
   */
  convertAt: (amountEur: number, date: Date) => number;
}

export function useFxRates(target: CurrencyCode): FxRatesApi {
  const [rows, setRows] = useState<FxRow[] | null>(null);

  useEffect(() => {
    if (target === BASE) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(null);
    (async () => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('date, rate_to_base')
        .eq('currency', target)
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
  }, [target]);

  // Sorted date strings for binary search. ISO YYYY-MM-DD sorts
  // lexicographically the same as chronologically.
  const sortedDates = useMemo(() => rows?.map(r => r.date) ?? null, [rows]);
  const rateByDate = useMemo(() => {
    if (!rows) return null;
    const m = new Map<string, number>();
    rows.forEach(r => m.set(r.date, Number(r.rate_to_base)));
    return m;
  }, [rows]);

  const convertAt = useCallback((amountEur: number, date: Date): number => {
    if (target === BASE) return amountEur;
    if (!sortedDates || !rateByDate || sortedDates.length === 0) return NaN;

    const key = toIsoDate(date);
    // Largest i such that sortedDates[i] <= key.
    let lo = 0;
    let hi = sortedDates.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sortedDates[mid] <= key) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best === -1) return NaN; // no rate on or before date
    const rateToBase = rateByDate.get(sortedDates[best])!;
    // rate_to_base = EUR per 1 unit of target → amount_in_target = EUR / rate_to_base
    return amountEur / rateToBase;
  }, [sortedDates, rateByDate, target]);

  return { ready: rows !== null, convertAt };
}
