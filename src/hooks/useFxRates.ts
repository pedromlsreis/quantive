import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CurrencyCode } from '@/contexts/CurrencyContext';

// Converts an amount denominated in any tracked currency to any other tracked
// currency, at the rate that was valid on the supplied date. Mirrors the SQL
// `convert_at` helper: "latest rate on or before the target date" (ECB doesn't
// publish on weekends/holidays).
//
// All rates are anchored to EUR (`rate_to_base` = EUR per 1 unit of currency).
// EUR has no row — its implied rate_to_base is 1.

const BASE: CurrencyCode = 'EUR';

interface FxRow {
  date: string;          // ISO YYYY-MM-DD from PostgREST
  currency: string;      // foreign currency code
  rate_to_base: number;  // EUR per 1 unit of `currency`
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Per-currency time series: pre-sorted ISO dates + lookup map. Built once
// from the flat rows so each convertAt is a binary search + a hash lookup.
interface Series {
  dates: string[];
  rates: Map<string, number>;
}

function buildSeries(rows: FxRow[]): Map<string, Series> {
  const grouped = new Map<string, FxRow[]>();
  for (const r of rows) {
    const arr = grouped.get(r.currency) ?? [];
    arr.push(r);
    grouped.set(r.currency, arr);
  }
  const out = new Map<string, Series>();
  for (const [ccy, arr] of grouped) {
    arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    out.set(ccy, {
      dates: arr.map(r => r.date),
      rates: new Map(arr.map(r => [r.date, Number(r.rate_to_base)])),
    });
  }
  return out;
}

function rateAt(series: Series, isoDate: string): number | null {
  // Largest i such that series.dates[i] <= isoDate.
  let lo = 0;
  let hi = series.dates.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.dates[mid] <= isoDate) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best === -1) return null;
  return series.rates.get(series.dates[best])!;
}

export interface FxRatesApi {
  /** True once rates have loaded (or the query failed and gave up). */
  ready: boolean;
  /**
   * Convert `amount` from `from` to `to` using the rate valid on `date`.
   * Returns NaN if either currency has no rate on or before `date` —
   * NaN propagates through arithmetic so missing data renders as "—" rather
   * than silently appearing as the wrong number.
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

  const seriesByCcy = useMemo(() => (rows ? buildSeries(rows) : null), [rows]);

  const convertAt = useCallback(
    (amount: number, from: CurrencyCode, to: CurrencyCode, date: Date): number => {
      if (from === to) return amount;
      if (!seriesByCcy) return NaN;

      const key = toIsoDate(date);
      const rateFromBase = (ccy: CurrencyCode): number | null => {
        if (ccy === BASE) return 1;
        const s = seriesByCcy.get(ccy);
        if (!s) return null;
        return rateAt(s, key);
      };

      const fromRate = rateFromBase(from);
      const toRate = rateFromBase(to);
      if (fromRate === null || toRate === null) return NaN;
      // amount_in_base = amount * rate_to_base[from]
      // amount_in_to   = amount_in_base / rate_to_base[to]
      return (amount * fromRate) / toRate;
    },
    [seriesByCcy],
  );

  return { ready: rows !== null, convertAt };
}
