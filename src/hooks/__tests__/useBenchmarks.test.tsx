import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Per-series response slot — the hook fires two queries in parallel
// (sp500, inflation_eu). We key responses by the .eq() argument so each
// query can resolve independently.
const responses: Record<string, { data: unknown; error: { message: string } | null }> = {
  sp500: { data: [], error: null },
  inflation_eu: { data: [], error: null },
};

vi.mock('@/integrations/supabase/client', () => {
  function chainFor(sid: string) {
    return {
      eq: (_col: string, _val: string) => chainFor(sid),
      order: () => chainFor(sid),
      limit: () => Promise.resolve(responses[sid] ?? { data: [], error: null }),
    };
  }
  return {
    supabase: {
      from: () => {
        let currentSid = 'sp500';
        return {
          select: () => ({
            eq: (_col: string, sid: string) => {
              currentSid = sid;
              return chainFor(currentSid);
            },
          }),
        };
      },
    },
  };
});

import { useBenchmarks } from '@/hooks/useBenchmarks';

beforeEach(() => {
  responses.sp500 = { data: [], error: null };
  responses.inflation_eu = { data: [], error: null };
});

describe('useBenchmarks', () => {
  it('starts in a not-ready state with empty series', () => {
    const { result } = renderHook(() => useBenchmarks());
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toBe(false);
    expect(result.current.series.sp500.points).toEqual([]);
    expect(result.current.series.inflation_eu.points).toEqual([]);
  });

  it('groups rows by series_id after both queries resolve', async () => {
    responses.sp500 = {
      data: [
        { series_id: 'sp500', date: '2026-05-12', value: 5200 },
        { series_id: 'sp500', date: '2026-05-11', value: 5180 },
      ],
      error: null,
    };
    responses.inflation_eu = {
      data: [
        { series_id: 'inflation_eu', date: '2026-04-01', value: 120.4 },
      ],
      error: null,
    };
    const { result } = renderHook(() => useBenchmarks());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBe(false);
    expect(result.current.series.sp500.points).toEqual([
      { date: '2026-05-12', value: 5200 },
      { date: '2026-05-11', value: 5180 },
    ]);
    expect(result.current.series.inflation_eu.points).toEqual([
      { date: '2026-04-01', value: 120.4 },
    ]);
  });

  it('coerces string `value` columns to Number', async () => {
    responses.sp500 = {
      // PostgREST occasionally returns numeric columns as strings depending on
      // the column type and client config. The hook must coerce them.
      data: [{ series_id: 'sp500', date: '2026-05-12', value: '5200.50' as unknown as number }],
      error: null,
    };
    const { result } = renderHook(() => useBenchmarks());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.series.sp500.points[0].value).toBeCloseTo(5200.5, 5);
    expect(typeof result.current.series.sp500.points[0].value).toBe('number');
  });

  it('ignores rows with unknown series_id values', async () => {
    responses.sp500 = {
      data: [
        { series_id: 'sp500', date: '2026-05-12', value: 5200 },
        // A row that somehow slipped in for an unrelated series — should be dropped.
        { series_id: 'msci_world', date: '2026-05-12', value: 3500 },
      ],
      error: null,
    };
    const { result } = renderHook(() => useBenchmarks());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.series.sp500.points).toHaveLength(1);
    // Only the configured series ids exist in the returned object.
    expect(Object.keys(result.current.series).sort()).toEqual(['inflation_eu', 'sp500']);
  });

  it('flips error=true when EITHER query returns an error', async () => {
    responses.sp500 = { data: null, error: { message: 'connection refused' } };
    responses.inflation_eu = { data: [], error: null };

    // Silence the deliberate console.error from the hook to keep test output clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useBenchmarks());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBe(true);
    // No rows were grouped because the hook short-circuits on error.
    expect(result.current.series.sp500.points).toEqual([]);
    expect(result.current.series.inflation_eu.points).toEqual([]);

    errSpy.mockRestore();
  });
});
