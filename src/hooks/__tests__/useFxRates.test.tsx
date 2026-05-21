import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mutable query response — reset per test.
const queryResponse: {
  data: unknown;
  error: { message: string } | null;
} = { data: null, error: null };

vi.mock('@/integrations/supabase/client', () => {
  const get = () => queryResponse;
  const chain = {
    select: () => chain,
    order: () => Promise.resolve(get()),
  };
  return { supabase: { from: () => chain } };
});

import { useFxRates } from '@/hooks/useFxRates';

const SAMPLE_ROWS = [
  { date: '2026-05-13', currency: 'USD', rate_to_base: 0.93 },
  { date: '2026-05-13', currency: 'GBP', rate_to_base: 0.85 },
];

beforeEach(() => {
  queryResponse.data = null;
  queryResponse.error = null;
});

describe('useFxRates', () => {
  it('starts with ready=false before the query resolves', async () => {
    queryResponse.data = SAMPLE_ROWS;
    const { result } = renderHook(() => useFxRates());
    // Synchronously, before the async effect settles, ready is false.
    expect(result.current.ready).toBe(false);
    // Flush the pending state update so it doesn't fire outside act().
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('sets ready=true after a successful load', async () => {
    queryResponse.data = SAMPLE_ROWS;
    const { result } = renderHook(() => useFxRates());
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('sets ready=true even when the query returns an error (fail-safe)', async () => {
    queryResponse.error = { message: 'connection refused' };
    const { result } = renderHook(() => useFxRates());
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('convertAt returns the amount unchanged for same-currency conversions', async () => {
    queryResponse.data = SAMPLE_ROWS;
    const { result } = renderHook(() => useFxRates());
    // Same-currency short-circuits before any rate lookup.
    expect(result.current.convertAt(500, 'EUR', 'EUR', new Date())).toBe(500);
    expect(result.current.convertAt(100, 'USD', 'USD', new Date())).toBe(100);
    // Flush the pending state update so it doesn't fire outside act().
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('convertAt returns NaN for cross-currency conversions before rates are loaded', async () => {
    queryResponse.data = SAMPLE_ROWS;
    const { result } = renderHook(() => useFxRates());
    // Synchronously (before load), cross-currency should return NaN.
    expect(Number.isNaN(result.current.convertAt(100, 'EUR', 'USD', new Date()))).toBe(true);
    // Flush the pending state update so it doesn't fire outside act().
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('convertAt performs correct EUR→USD conversion after load', async () => {
    queryResponse.data = SAMPLE_ROWS;
    const { result } = renderHook(() => useFxRates());
    await waitFor(() => expect(result.current.ready).toBe(true));

    // USD rate_to_base=0.93: 1000 EUR → 1000/0.93 USD
    const d = new Date(2026, 4, 13);
    const converted = result.current.convertAt(1000, 'EUR', 'USD', d);
    expect(converted).toBeCloseTo(1000 / 0.93, 4);
  });

  it('convertAt performs correct USD→EUR conversion after load', async () => {
    queryResponse.data = SAMPLE_ROWS;
    const { result } = renderHook(() => useFxRates());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const d = new Date(2026, 4, 13);
    const converted = result.current.convertAt(100, 'USD', 'EUR', d);
    expect(converted).toBeCloseTo(100 * 0.93, 4);
  });

  it('convertAt returns NaN for unsupported currencies even after load', async () => {
    queryResponse.data = SAMPLE_ROWS;
    const { result } = renderHook(() => useFxRates());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const result_ = result.current.convertAt(100, 'EUR', 'CNY' as never, new Date(2026, 4, 13));
    expect(Number.isNaN(result_)).toBe(true);
  });

  it('returns NaN for all cross-currency queries when query fails', async () => {
    queryResponse.error = { message: 'timeout' };
    const { result } = renderHook(() => useFxRates());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const d = new Date(2026, 4, 13);
    // With empty rows, no rates are available — convert should return NaN.
    expect(Number.isNaN(result.current.convertAt(100, 'EUR', 'USD', d))).toBe(true);
  });
});
