import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mirrors PortfolioContext.goals.test.tsx — boots the provider in jsdom
// without touching Supabase, auth, or analytics.

const authState: { user: { id: string } | null; loading: boolean } = {
  user: null,
  loading: false,
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
vi.mock('@/hooks/useEntitlements', () => ({ useEntitlements: () => entitlementsMock }));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = () => Promise.resolve({ data: [], error: null });
  return { supabase: { from: () => chain } };
});

// vi.mock factories are hoisted; use vi.hoisted so the spies are too.
const { measurementEdited, measurementDeleted } = vi.hoisted(() => ({
  measurementEdited: vi.fn(),
  measurementDeleted: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  analytics: {
    dataCleared: vi.fn(),
    measurementAdded: vi.fn(),
    measurementEdited,
    measurementDeleted,
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

function seedBlob() {
  // Two sources across two dates — enough to exercise both delete-one-of-many
  // and delete-last-for-source paths.
  localStorage.setItem(
    'portfolio-data',
    JSON.stringify({
      facts: [
        { date: '2026-01-15T00:00:00.000Z', idSource: 'Checking', sourceVl: 1000, currency: 'EUR' },
        { date: '2026-01-15T00:00:00.000Z', idSource: 'Brokerage', sourceVl: 5000, currency: 'USD' },
        { date: '2026-02-15T00:00:00.000Z', idSource: 'Checking', sourceVl: 1100, currency: 'EUR' },
        { date: '2026-02-15T00:00:00.000Z', idSource: 'Brokerage', sourceVl: 5200, currency: 'USD' },
      ],
      refSources: [
        { idSource: 'Checking', volatType: 'Stable', transferableInDays: true },
        { idSource: 'Brokerage', volatType: 'Volatile', transferableInDays: false },
      ],
      goals: [],
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  authState.user = null;
  authState.loading = false;
  measurementEdited.mockClear();
  measurementDeleted.mockClear();
});

describe('PortfolioContext — measurement edit/delete', () => {
  it('updateMeasurement patches sourceVl on the matching fact only', async () => {
    seedBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const targetDate = new Date('2026-01-15T00:00:00.000Z');
    act(() => {
      result.current.updateMeasurement(targetDate, 'Checking', { sourceVl: 1234.56 });
    });

    const facts = result.current.data!.facts;
    const checkingJan = facts.find(f => f.idSource === 'Checking' && f.date.getTime() === targetDate.getTime());
    expect(checkingJan?.sourceVl).toBe(1234.56);

    // Sibling fact for the same date but different source must stay untouched.
    const brokerageJan = facts.find(f => f.idSource === 'Brokerage' && f.date.getTime() === targetDate.getTime());
    expect(brokerageJan?.sourceVl).toBe(5000);

    // Fact for the same source but a different date must stay untouched.
    const checkingFeb = facts.find(f => f.idSource === 'Checking' && f.date.getTime() === new Date('2026-02-15T00:00:00.000Z').getTime());
    expect(checkingFeb?.sourceVl).toBe(1100);

    expect(measurementEdited).toHaveBeenCalledTimes(1);
  });

  it('updateMeasurement can patch currency independently of value', async () => {
    seedBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const targetDate = new Date('2026-01-15T00:00:00.000Z');
    act(() => {
      result.current.updateMeasurement(targetDate, 'Checking', { currency: 'GBP' });
    });

    const fact = result.current.data!.facts.find(
      f => f.idSource === 'Checking' && f.date.getTime() === targetDate.getTime(),
    );
    expect(fact?.currency).toBe('GBP');
    expect(fact?.sourceVl).toBe(1000); // unchanged
  });

  it('updateMeasurement is a silent no-op when no fact matches', async () => {
    seedBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const before = result.current.data!.facts.length;
    act(() => {
      result.current.updateMeasurement(new Date('2099-06-01T00:00:00.000Z'), 'Checking', { sourceVl: 0 });
    });
    expect(result.current.data!.facts).toHaveLength(before);
  });

  it('deleteMeasurement removes exactly the matching fact', async () => {
    seedBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const targetDate = new Date('2026-01-15T00:00:00.000Z');
    act(() => {
      result.current.deleteMeasurement(targetDate, 'Checking');
    });

    const facts = result.current.data!.facts;
    expect(facts).toHaveLength(3);
    expect(facts.find(f => f.idSource === 'Checking' && f.date.getTime() === targetDate.getTime())).toBeUndefined();
    // Other facts intact.
    expect(facts.find(f => f.idSource === 'Brokerage' && f.date.getTime() === targetDate.getTime())).toBeDefined();
    expect(facts.filter(f => f.idSource === 'Checking')).toHaveLength(1);

    expect(measurementDeleted).toHaveBeenCalledTimes(1);
  });

  it('deleteMeasurement is a no-op when no fact matches', async () => {
    seedBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const before = result.current.data!.facts.length;
    act(() => {
      result.current.deleteMeasurement(new Date('2099-06-01T00:00:00.000Z'), 'Checking');
    });
    expect(result.current.data!.facts).toHaveLength(before);
  });

  it('deleteMeasurement leaves refSources alone (orphan metadata is intentional)', async () => {
    seedBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => {
      result.current.deleteMeasurement(new Date('2026-01-15T00:00:00.000Z'), 'Checking');
      result.current.deleteMeasurement(new Date('2026-02-15T00:00:00.000Z'), 'Checking');
    });

    // All Checking facts are gone, but its refSource entry persists so a
    // future measurement re-attaches volatility/liquidity metadata cleanly.
    expect(result.current.data!.facts.filter(f => f.idSource === 'Checking')).toHaveLength(0);
    expect(result.current.data!.refSources.find(r => r.idSource === 'Checking')).toBeDefined();
  });

  it('round-trips edits through localStorage for guests', async () => {
    seedBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => {
      result.current.updateMeasurement(new Date('2026-01-15T00:00:00.000Z'), 'Checking', { sourceVl: 999 });
    });

    const cached = JSON.parse(localStorage.getItem('portfolio-data')!) as { facts: Array<{ idSource: string; sourceVl: number; date: string }> };
    const persisted = cached.facts.find(f => f.idSource === 'Checking' && f.date === '2026-01-15T00:00:00.000Z');
    expect(persisted?.sourceVl).toBe(999);
  });

  it('matches by trimmed idSource so whitespace variants resolve to the same fact', async () => {
    // Pre-fix-of-defence: seed a fact whose idSource has surrounding whitespace
    // (legacy spreadsheet ingest could produce these).
    localStorage.setItem(
      'portfolio-data',
      JSON.stringify({
        facts: [
          { date: '2026-01-15T00:00:00.000Z', idSource: '  Checking  ', sourceVl: 1000, currency: 'EUR' },
        ],
        refSources: [{ idSource: 'Checking', volatType: 'Stable', transferableInDays: true }],
        goals: [],
      }),
    );

    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => {
      result.current.updateMeasurement(new Date('2026-01-15T00:00:00.000Z'), 'Checking', { sourceVl: 42 });
    });

    expect(result.current.data!.facts[0].sourceVl).toBe(42);
  });
});
