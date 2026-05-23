import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CurrencyCode } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { buildSeries, convert, type FxRow, type FxSeriesByCurrency } from '@/lib/fxConvert';

// Thin React wrapper around the pure fxConvert module. Loads fx_rates rows
// per authed user, derives the per-currency series, and exposes a memoised
// convertAt closure for the rest of the app.
//
// fx_rates is gated by an RLS policy that requires an authenticated session.
// Firing the fetch before the user has signed in (any guest-first journey,
// e.g. landing → sign-in) silently returns `[]` from the API, and a
// permanently empty rate set makes every cross-currency conversion return
// NaN — which in turn makes the snapshots useMemo drop those snapshots, so
// the dashboard renders an older subset until the user hard-refreshes. The
// fix below keeps the hook dormant for guests and re-fetches when the
// authed identity changes.

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
  const { user } = useAuth();
  const [rows, setRows] = useState<FxRow[] | null>(null);

  useEffect(() => {
    if (!user) {
      // Guest (or auth still resolving): no fetch. The hook stays dormant —
      // `ready` is false and cross-currency conversions return NaN, which is
      // the correct signal for any caller. When the user signs in this
      // effect re-fires with the new id and the fetch goes out authed.
      return;
    }
    let cancelled = false;
    // Reset so `ready` only flips true after the *new* identity's rates
    // resolve. Without this, a sign-out → sign-in would briefly expose the
    // previous fetch's data as "ready" before the new fetch settles.
    setRows(null);
    (async () => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('date, currency, rate_to_base')
        .order('date', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('[useFxRates] failed to load rates:', error);
        // Fail-safe: flip `ready` so the dashboard doesn't hang on a
        // permanent skeleton when the network is broken.
        setRows([]);
        return;
      }
      setRows((data ?? []) as FxRow[]);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

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
