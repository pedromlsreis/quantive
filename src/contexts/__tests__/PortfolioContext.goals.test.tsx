import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mirrors the mocking style of PortfolioContext.logout.test.tsx so the
// provider boots in jsdom without touching Supabase or auth.

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
  currency: { code: 'EUR' as const, symbol: '€', position: 'after' as const, name: 'Euro', locale: 'de-DE' },
  allCurrencies: [],
  setCurrency: () => {},
};

const fxMock = {
  convertAt: (v: number) => v,
  rates: {},
  isLoading: false,
};

const entitlementsMock = { has: () => false };

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/contexts/KeySessionContext', () => ({ useKeySession: () => keySessionMock }));
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => currencyMock,
}));
vi.mock('@/hooks/useFxRates', () => ({ useFxRates: () => fxMock }));
vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => entitlementsMock,
  devPlanOverride: () => null,
}));

vi.mock('@/integrations/supabase/client', () => {
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

beforeEach(() => {
  localStorage.clear();
  authState.user = null;
  authState.loading = false;
});

describe('PortfolioContext — goals CRUD', () => {
  it('addGoal creates a goal with a stable id and exposes it via goals[]', async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });

    await act(async () => { await Promise.resolve(); });

    let created;
    act(() => {
      created = result.current.addGoal({
        name: 'Reach €100k',
        targetAmount: 100_000,
        targetCurrency: 'EUR',
        targetDate: '2027-12-31',
      });
    });

    expect(created!.id).toBeTruthy();
    expect(result.current.goals).toHaveLength(1);
    expect(result.current.goals[0].name).toBe('Reach €100k');
    expect(result.current.goals[0].targetAmount).toBe(100_000);
    expect(result.current.goals[0].targetCurrency).toBe('EUR');
    expect(result.current.goals[0].createdAt).toBeTruthy();
  });

  it('updateGoal mutates an existing goal in place', async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(async () => { await Promise.resolve(); });

    let id = '';
    act(() => {
      const g = result.current.addGoal({
        name: 'Original',
        targetAmount: 50_000,
        targetCurrency: 'EUR',
        targetDate: '2027-12-31',
      });
      id = g.id;
    });

    act(() => {
      result.current.updateGoal(id, { name: 'Renamed', targetAmount: 75_000 });
    });

    expect(result.current.goals[0].name).toBe('Renamed');
    expect(result.current.goals[0].targetAmount).toBe(75_000);
    expect(result.current.goals[0].targetCurrency).toBe('EUR'); // unchanged
  });

  it('archiveGoal hides the goal from goals[] but keeps it in data.goals', async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(async () => { await Promise.resolve(); });

    let id = '';
    act(() => {
      const g = result.current.addGoal({
        name: 'To archive',
        targetAmount: 100,
        targetCurrency: 'EUR',
        targetDate: '2027-12-31',
      });
      id = g.id;
    });
    expect(result.current.goals).toHaveLength(1);

    act(() => {
      result.current.archiveGoal(id);
    });

    expect(result.current.goals).toHaveLength(0);
    // The blob still carries it (preserved-but-locked on downgrade contract).
    expect(result.current.data?.goals).toHaveLength(1);
    expect(result.current.data?.goals?.[0].archivedAt).toBeTruthy();
  });

  it('goals[] is sorted by createdAt ascending', async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      result.current.addGoal({ name: 'First', targetAmount: 1, targetCurrency: 'EUR', targetDate: '2027-01-01' });
    });
    // Advance the clock slightly so createdAt differs.
    await new Promise((r) => setTimeout(r, 5));
    act(() => {
      result.current.addGoal({ name: 'Second', targetAmount: 2, targetCurrency: 'EUR', targetDate: '2027-01-01' });
    });

    expect(result.current.goals.map(g => g.name)).toEqual(['First', 'Second']);
  });

  it('round-trips through localStorage for guests', async () => {
    authState.user = null;
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      result.current.addGoal({
        name: 'Persisted',
        targetAmount: 10_000,
        targetCurrency: 'USD',
        targetDate: '2030-06-30',
      });
    });

    const cached = localStorage.getItem('portfolio-data');
    expect(cached).toBeTruthy();
    const parsed = JSON.parse(cached!);
    expect(parsed.goals).toHaveLength(1);
    expect(parsed.goals[0].name).toBe('Persisted');
    expect(parsed.goals[0].targetCurrency).toBe('USD');
  });

  it('treats legacy snapshots without a goals field as []', async () => {
    // Seed a legacy blob (no goals key) before mounting the provider.
    localStorage.setItem(
      'portfolio-data',
      JSON.stringify({
        facts: [
          { date: '2026-01-15T00:00:00.000Z', idSource: 'Checking', sourceVl: 1234, currency: 'EUR' },
        ],
        refSources: [{ idSource: 'Checking', volatType: 'Cash', transferableInDays: true }],
        // intentionally no `goals`
      }),
    );
    authState.user = null;

    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.goals).toEqual([]);
    expect(result.current.data?.goals).toEqual([]);
  });
});
