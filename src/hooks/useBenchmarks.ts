import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { BenchmarkSeries, SeriesId } from '@/lib/benchmarkSeries';

// Thin React wrapper around the `benchmarks` table. Loads all rows for the
// requested series once, groups them by series_id, and exposes them in the
// shape benchmarkSeries.ts expects.
//
// Notes:
//   * Public read RLS — no auth needed; this lets the chart shell render for
//     unauthenticated visitors landing on /performance (though the page is
//     gated behind FeatureGate for free users anyway).
//   * The benchmarks table is small (low thousands of rows total). One full
//     load per session is cheaper than orchestrating per-period queries, and
//     keeps the period-selector switch instant client-side.

export interface BenchmarksApi {
  ready: boolean;
  /** Map of series_id → series. Missing series_ids resolve to an empty series. */
  series: Record<SeriesId, BenchmarkSeries>;
  /** True when the underlying request errored — UI can show a soft notice. */
  error: boolean;
}

const EMPTY: Record<SeriesId, BenchmarkSeries> = {
  inflation_eu: { id: 'inflation_eu', points: [] },
  sp500:        { id: 'sp500',        points: [] },
};

export function useBenchmarks(): BenchmarksApi {
  const [rows, setRows] = useState<{ series_id: string; date: string; value: number }[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(false);
    (async () => {
      const { data, error: err } = await supabase
        .from('benchmarks')
        .select('series_id, date, value')
        .in('series_id', ['inflation_eu', 'sp500'])
        .order('date', { ascending: true });
      if (cancelled) return;
      if (err) {
        console.error('[useBenchmarks] failed to load series:', err);
        setError(true);
        setRows([]);
        return;
      }
      setRows((data ?? []) as { series_id: string; date: string; value: number }[]);
    })();
    return () => { cancelled = true; };
  }, []);

  const series = useMemo<Record<SeriesId, BenchmarkSeries>>(() => {
    if (!rows) return EMPTY;
    const out: Record<SeriesId, BenchmarkSeries> = {
      inflation_eu: { id: 'inflation_eu', points: [] },
      sp500:        { id: 'sp500',        points: [] },
    };
    for (const r of rows) {
      const sid = r.series_id as SeriesId;
      if (sid !== 'inflation_eu' && sid !== 'sp500') continue;
      out[sid].points.push({ date: r.date, value: Number(r.value) });
    }
    return out;
  }, [rows]);

  return { ready: rows !== null, series, error };
}
