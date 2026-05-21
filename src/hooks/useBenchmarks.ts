import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { BenchmarkSeries, SeriesId } from '@/lib/benchmarkSeries';

// Thin React wrapper around the `benchmarks` table. Loads rows for each
// configured series once, groups them by series_id, and exposes them in the
// shape benchmarkSeries.ts expects.
//
// Notes:
//   * Public read RLS — no auth needed; this lets the chart shell render for
//     unauthenticated visitors landing on /performance (though the page is
//     gated behind FeatureGate for free users anyway).
//   * One query per series, ordered date DESC with `.limit(PER_SERIES_CAP)`.
//     A previous single-query implementation interleaved both series with
//     `order date ASC` and a client-side `.limit(10_000)`; that silently hit
//     PostgREST's server-side max-rows cap (1000 on hosted Supabase) and
//     truncated the response to the *oldest* 1000 rows, dragging `lastDate()`
//     years into the past and falsely tripping the stale-data banner. Splitting
//     per series with DESC ordering guarantees the latest observations are
//     present regardless of any server cap.

// 1000 weekday SP500 rows ≈ 4 years of trading history — enough for the 3y
// window and well within PostgREST's default cap. For monthly HICP this is
// effectively the full series.
const PER_SERIES_CAP = 1000;

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
      const fetchSeries = (sid: SeriesId) =>
        supabase
          .from('benchmarks')
          .select('series_id, date, value')
          .eq('series_id', sid)
          .order('date', { ascending: false })
          .limit(PER_SERIES_CAP);

      const [sp500Res, hicpRes] = await Promise.all([
        fetchSeries('sp500'),
        fetchSeries('inflation_eu'),
      ]);
      if (cancelled) return;
      if (sp500Res.error || hicpRes.error) {
        console.error('[useBenchmarks] failed to load series:', sp500Res.error ?? hicpRes.error);
        setError(true);
        setRows([]);
        return;
      }
      const combined = [...(sp500Res.data ?? []), ...(hicpRes.data ?? [])];
      setRows(combined as { series_id: string; date: string; value: number }[]);
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
