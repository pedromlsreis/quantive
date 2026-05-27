import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Hoisted so both the vi.mock factory and the test bodies can share them.
const { queryResponse, fromCalls, authState } = vi.hoisted(() => ({
  // Mutable query response — reset per test.
  queryResponse: {
    data: null as unknown,
    error: null as { message: string } | null,
  },
  // Counts `supabase.from(...)` invocations so we can assert that the hook
  // doesn't hit the database when the user is a guest. Reset per test.
  fromCalls: { count: 0 },
  // Mutable auth state — the hook now gates the fetch on `user`, so tests
  // need to control whether a user is "signed in" at any given moment.
  authState: {
    user: null as { id: string } | null,
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const get = () => queryResponse;
  const chain = {
    select: () => chain,
    gte: () => chain,
    order: () => Promise.resolve(get()),
  };
  return {
    supabase: {
      from: () => {
        fromCalls.count += 1;
        return chain;
      },
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));

import { useFxRates } from '@/hooks/useFxRates';

const SAMPLE_ROWS = [
  { date: '2026-05-13', currency: 'USD', rate_to_base: 0.93 },
  { date: '2026-05-13', currency: 'GBP', rate_to_base: 0.85 },
];

// A distinct rate set so the "refetch on account switch" test can prove the
// new rates are actually in effect (a conversion that returned X under
// SAMPLE_ROWS returns Y under these).
const SAMPLE_ROWS_ALT = [
  { date: '2026-05-13', currency: 'USD', rate_to_base: 0.5 },
  { date: '2026-05-13', currency: 'GBP', rate_to_base: 0.4 },
];

beforeEach(() => {
  queryResponse.data = null;
  queryResponse.error = null;
  fromCalls.count = 0;
  // Default to a signed-in user so the pre-existing tests still exercise
  // the fetch path. The auth-gated regression block below flips this.
  authState.user = { id: 'user-a' };
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

// ─── Regression: stale fx_rates on sign-in ──────────────────────────────────
//
// The fx_rates table is gated by an RLS policy that requires an
// authenticated session (see migrations/20260514120000_fx_rates.sql). Before
// this fix, useFxRates fired its fetch in a useEffect with empty deps on
// PortfolioProvider mount — which, for any guest-first journey
// (landing → sign-in), happened while the user was still `anon`. The
// request was silently denied, `rows` got stuck at `[]`, and every
// cross-currency conversion returned NaN for the rest of the session. The
// snapshots useMemo in PortfolioContext then filtered NaN totals out,
// hiding any snapshot containing non-EUR facts and presenting an older
// subset of the user's data until they hard-refreshed.
//
// The hook now gates the fetch on `user` and re-fires when `user.id`
// changes. These three cases pin both behaviours.
describe('useFxRates — auth-gated fetch (regression: stale fx_rates on sign-in)', () => {
  const WAIT = { timeout: 5000 };

  it('does not call supabase.from() while the user is a guest', async () => {
    queryResponse.data = SAMPLE_ROWS;
    authState.user = null;

    const { result } = renderHook(() => useFxRates());

    // Give any errant async effect a chance to fire — fromCalls.count would
    // increment if the hook tried to fetch. A fixed wait is fine here
    // because the assertion is "nothing happens", which by definition has
    // no signal to await.
    await new Promise((r) => setTimeout(r, 50));

    expect(fromCalls.count).toBe(0);
    expect(result.current.ready).toBe(false);
    // Cross-currency conversions stay NaN — the correct signal for callers
    // that the rate book is not available.
    expect(Number.isNaN(result.current.convertAt(100, 'EUR', 'USD', new Date(2026, 4, 13)))).toBe(
      true,
    );
  });

  it('fetches once the user transitions guest → authed', async () => {
    queryResponse.data = SAMPLE_ROWS;
    authState.user = null;

    const { result, rerender } = renderHook(() => useFxRates());
    // Nothing fetched yet.
    expect(fromCalls.count).toBe(0);
    expect(result.current.ready).toBe(false);

    // Simulate sign-in.
    await act(async () => {
      authState.user = { id: 'user-a' };
      rerender();
    });

    await waitFor(() => expect(result.current.ready).toBe(true), WAIT);
    expect(fromCalls.count).toBe(1);

    // The freshly-fetched rates are in effect.
    const d = new Date(2026, 4, 13);
    expect(result.current.convertAt(1000, 'EUR', 'USD', d)).toBeCloseTo(1000 / 0.93, 4);
  });

  it('refetches when the user-id changes (account switch)', async () => {
    queryResponse.data = SAMPLE_ROWS;
    authState.user = { id: 'user-a' };

    const { result, rerender } = renderHook(() => useFxRates());
    await waitFor(() => expect(result.current.ready).toBe(true), WAIT);
    expect(fromCalls.count).toBe(1);

    // Sanity: under SAMPLE_ROWS, 1000 EUR → 1000/0.93 USD.
    const d = new Date(2026, 4, 13);
    expect(result.current.convertAt(1000, 'EUR', 'USD', d)).toBeCloseTo(1000 / 0.93, 4);

    // Swap in a different rate book and switch identities.
    queryResponse.data = SAMPLE_ROWS_ALT;

    await act(async () => {
      authState.user = { id: 'user-b' };
      rerender();
    });

    // ready briefly drops to false while the new fetch settles, then comes
    // back true with the alternative rates loaded.
    await waitFor(() => {
      const v = result.current.convertAt(1000, 'EUR', 'USD', d);
      // Under SAMPLE_ROWS_ALT (USD rate_to_base=0.5), 1000 EUR → 2000 USD.
      expect(v).toBeCloseTo(1000 / 0.5, 4);
    }, WAIT);

    expect(fromCalls.count).toBe(2);
  });
});
