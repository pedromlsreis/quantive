import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mutable auth state — flipped by tests to simulate sign-in / sign-out.
const authState: { user: { id: string } | null; loading: boolean } = {
  user: null,
  loading: false,
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
vi.mock('@/hooks/useEntitlements', () => ({ useEntitlements: () => entitlementsMock }));

vi.mock('@/integrations/supabase/client', () => {
  // Permissive thenable chain — cloud-load reads .from(...).select(...).eq(...).order(...).limit(1)
  // and the test never seeds rows, so always return empty.
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = () => Promise.resolve({ data: [], error: null });
  return { supabase: { from: () => chain } };
});

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
