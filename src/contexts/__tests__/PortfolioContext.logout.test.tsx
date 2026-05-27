import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mutable auth state — flipped by tests to simulate sign-in / sign-out.
const authState: {
  user: { id: string } | null;
  loading: boolean;
  subscription: { subscribed: boolean; productId: string | null };
} = {
  user: null,
  loading: false,
  subscription: { subscribed: false, productId: null },
};

const keySessionMock = {
  status: 'unlocked-encrypted' as const,
  getDataKey: () => null,
};

const currencyMock = {
  currency: { code: 'EUR' as const, symbol: '€', position: 'after' as const },
  allCurrencies: [],
  setCurrency: () => {},
};

const fxMock = {
  convertAt: (v: number) => v,
  rates: {},
  isLoading: false,
};

const entitlementsMock = { has: () => true };

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/contexts/KeySessionContext', () => ({ useKeySession: () => keySessionMock }));
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => currencyMock,
  // Re-export the type-ish value so PortfolioContext's `type CurrencyCode` import resolves.
  // It only uses it as a type, so this isn't called.
}));
vi.mock('@/hooks/useFxRates', () => ({ useFxRates: () => fxMock }));
vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => entitlementsMock,
  devPlanOverride: () => null,
}));

// Controllable cloud-load responder. Defaults to "no rows, resolved
// immediately" so legacy tests keep their behaviour. The skeleton-state tests
// below swap this for a manually-resolved deferred so they can assert the
// in-flight state without depending on microtask timing — i.e. they remain
// deterministic on a heavily loaded CI machine.
const cloudMockRef = vi.hoisted(() => ({
  responder: (): Promise<{ data: unknown[]; error: null }> =>
    Promise.resolve({ data: [], error: null }),
}));

vi.mock('@/integrations/supabase/client', () => {
  // Permissive thenable chain — cloud-load reads .from(...).select(...).eq(...).order(...).limit(1)
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = () => cloudMockRef.responder();
  return { supabase: { from: () => chain } };
});

/**
 * Returns a Promise that resolves only when `resolve()` is called. Lets tests
 * pin the cloud-load in its in-flight state for as long as they need to make
 * assertions on `isLoading`, then release it deterministically.
 */
function deferredCloudResponse() {
  let resolve!: (rows: unknown[]) => void;
  const promise = new Promise<{ data: unknown[]; error: null }>((res) => {
    resolve = (rows) => res({ data: rows, error: null });
  });
  return { promise, resolve };
}

vi.mock('@/lib/analytics', () => ({
  analytics: {
    dataCleared: vi.fn(),
    measurementAdded: vi.fn(),
    fileUploaded: vi.fn(),
    fileUploadFailed: vi.fn(),
    cloudSyncFailed: vi.fn(),
    signedIn: vi.fn(),
    signedOut: vi.fn(),
    signedUp: vi.fn(),
    pageViewed: vi.fn(),
    goalCreated: vi.fn(),
    goalCompleted: vi.fn(),
    proGateHit: vi.fn(),
  },
  clearAttribution: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { PortfolioProvider, usePortfolio } from '@/contexts/PortfolioContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PortfolioProvider>{children}</PortfolioProvider>
);

const validCachedPortfolio = () =>
  JSON.stringify({
    facts: [
      {
        date: '2026-01-15T00:00:00.000Z',
        idSource: 'Checking',
        sourceVl: 1234.56,
        currency: 'EUR',
      },
    ],
    refSources: [
      { idSource: 'Checking', volatType: 'Cash', transferableInDays: true },
    ],
  });

beforeEach(() => {
  localStorage.clear();
  authState.user = null;
  authState.loading = false;
  cloudMockRef.responder = () => Promise.resolve({ data: [], error: null });
});

describe('PortfolioContext — logout cleanup (H2/H4)', () => {
  it('removes portfolio-data from localStorage when the user transitions to null', async () => {
    localStorage.setItem('portfolio-data', validCachedPortfolio());
    localStorage.setItem('portfolio-data-is-mock', 'false');

    authState.user = { id: 'user-a' };
    const { rerender } = renderHook(() => usePortfolio(), { wrapper });

    // Let the initial cloud-load microtask settle so any rehydrate would have happened.
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      authState.user = null;
      rerender();
    });

    await waitFor(() => {
      expect(localStorage.getItem('portfolio-data')).toBeNull();
      expect(localStorage.getItem('portfolio-data-is-mock')).toBeNull();
    });
  });

  it('clears in-memory data when the user transitions to null', async () => {
    authState.user = { id: 'user-a' };
    const { result, rerender } = renderHook(() => usePortfolio(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    // Seed in-memory state directly via the context API.
    act(() => {
      result.current.addMeasurement([
        { name: 'Checking', value: 100, currency: 'EUR' as const, isLiquid: true, volatType: 'Cash' },
      ]);
    });

    expect(result.current.data).not.toBeNull();

    await act(async () => {
      authState.user = null;
      rerender();
    });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
    });
  });

  it('wipes state on account switch (user A → user B)', async () => {
    authState.user = { id: 'user-a' };
    const { result, rerender } = renderHook(() => usePortfolio(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.addMeasurement([
        { name: 'A-Account', value: 999, currency: 'EUR' as const, isLiquid: true, volatType: 'Cash' },
      ]);
    });
    expect(result.current.data?.facts.length).toBeGreaterThan(0);

    await act(async () => {
      authState.user = { id: 'user-b' };
      rerender();
    });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
    });
  });
});

describe('PortfolioContext — guest-load race (H3)', () => {
  it('does not hydrate the guest cache while auth is still loading', async () => {
    localStorage.setItem('portfolio-data', validCachedPortfolio());
    localStorage.setItem('portfolio-data-is-mock', 'false');

    authState.user = null;
    authState.loading = true;

    const { result } = renderHook(() => usePortfolio(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    // Auth has not resolved yet — guest-load must hold off so we don't reveal
    // a prior user's cached data to an unknown viewer.
    expect(result.current.data).toBeNull();
  });

  it('hydrates the guest cache once auth resolves to a confirmed guest', async () => {
    localStorage.setItem('portfolio-data', validCachedPortfolio());
    localStorage.setItem('portfolio-data-is-mock', 'false');

    authState.user = null;
    authState.loading = true;

    const { result, rerender } = renderHook(() => usePortfolio(), { wrapper });

    await act(async () => {
      authState.loading = false;
      rerender();
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
      expect(result.current.data?.facts.length).toBe(1);
    });
  });
});

describe('PortfolioContext — authed users do not write plaintext cache (H2)', () => {
  it('addMeasurement for an authed user does NOT write portfolio-data to localStorage', async () => {
    authState.user = { id: 'user-a' };
    const { result } = renderHook(() => usePortfolio(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.addMeasurement([
        { name: 'Checking', value: 100, currency: 'EUR' as const, isLiquid: true, volatType: 'Cash' },
      ]);
    });

    expect(localStorage.getItem('portfolio-data')).toBeNull();
    expect(localStorage.getItem('portfolio-data-is-mock')).toBeNull();
  });

  it('addMeasurement for a guest DOES write portfolio-data to localStorage (offline-first)', async () => {
    authState.user = null;
    const { result } = renderHook(() => usePortfolio(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.addMeasurement([
        { name: 'Checking', value: 100, currency: 'EUR' as const, isLiquid: true, volatType: 'Cash' },
      ]);
    });

    expect(localStorage.getItem('portfolio-data')).not.toBeNull();
  });
});

// ─── Stale-data-on-login regression ──────────────────────────────────────────
//
// Before the fix, a guest who had loaded preview/mock data (or a localStorage
// cache) and then signed in would see the stale numbers on the dashboard
// until they hit F5. Root cause: the user-id watcher only wiped state on
// user-A → user-B transitions, and the cloud-load effect had no loading flag.
//
// These tests pin the cloud-load in its in-flight state with a deferred
// promise so assertions on the intermediate (data: null, isLoading: true)
// state can't be raced past by a fast microtask resolution. That makes them
// deterministic regardless of CI machine load.
describe('PortfolioContext — guest → authed login (no stale data flash)', () => {
  // Generous timeout so a slow CI box doesn't flake; `waitFor` retries until
  // the assertion passes or this elapses.
  const WAIT = { timeout: 5000 };

  it('clears stale guest cache and shows isLoading=true while cloud-load is in flight', async () => {
    // Guest with a populated localStorage cache.
    localStorage.setItem('portfolio-data', validCachedPortfolio());
    localStorage.setItem('portfolio-data-is-mock', 'false');
    authState.user = null;

    const { result, rerender } = renderHook(() => usePortfolio(), { wrapper });

    // Guest-load hydrated the cache.
    await waitFor(() => {
      expect(result.current.data?.facts.length).toBe(1);
    }, WAIT);

    // Pin the upcoming cloud-load mid-flight so the in-flight state is
    // observable regardless of how loaded the machine is.
    const deferred = deferredCloudResponse();
    cloudMockRef.responder = () => deferred.promise;

    // Sign in.
    await act(async () => {
      authState.user = { id: 'user-a' };
      rerender();
    });

    // Stale guest data must be gone and the skeleton armed.
    await waitFor(() => {
      expect(result.current.data).toBeNull();
      expect(result.current.isLoading).toBe(true);
    }, WAIT);

    // Release the cloud-load (empty response → still no data, but isLoading falls).
    await act(async () => {
      deferred.resolve([]);
      await deferred.promise;
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, WAIT);
  });

  it('starts with isLoading=true on mount when a session is already restored (F5 case)', async () => {
    // Pin the cloud-load mid-flight before the provider mounts.
    const deferred = deferredCloudResponse();
    cloudMockRef.responder = () => deferred.promise;
    authState.user = { id: 'user-a' };

    const { result } = renderHook(() => usePortfolio(), { wrapper });

    // The seed (`useState(() => !!user || authLoading)`) means the very first
    // observable value is already true — no "upload your file" flash.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    await act(async () => {
      deferred.resolve([]);
      await deferred.promise;
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, WAIT);
  });

  it('starts with isLoading=true while auth itself is still resolving', async () => {
    // Auth hasn't decided yet — we don't know if a user is coming back.
    authState.user = null;
    authState.loading = true;

    const { result, rerender } = renderHook(() => usePortfolio(), { wrapper });

    // Skeleton on, no stale guest hydrate (guest-load gate honours authLoading).
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    // Auth resolves to "really a guest". isLoading must clear so the dashboard
    // can fall through to the file-upload empty state. The mock returns the
    // same authState object reference, so we need rerender() to push the
    // change into React.
    await act(async () => {
      authState.loading = false;
      rerender();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, WAIT);
  });
});
