import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mirrors PortfolioContext.goals.test.tsx — boots the provider in jsdom
// without touching Supabase, auth, or analytics.

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

// vi.mock factories are hoisted; use vi.hoisted so the spies are too.
const { measurementEdited, measurementDeleted, measurementRestored } = vi.hoisted(() => ({
  measurementEdited: vi.fn(),
  measurementDeleted: vi.fn(),
  measurementRestored: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  analytics: {
    dataCleared: vi.fn(),
    measurementAdded: vi.fn(),
    measurementEdited,
    measurementDeleted,
    measurementRestored,
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

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

/**
 * Find the most recent toast that carries an Undo action and invoke it. We
 * scan for the action rather than taking the last toast because other
 * mutations (e.g. addMeasurement) fire their own action-less success toasts.
 */
function clickUndo() {
  for (let i = toastSuccess.mock.calls.length - 1; i >= 0; i--) {
    const opts = toastSuccess.mock.calls[i]?.[1] as { action?: { onClick?: () => void } } | undefined;
    if (opts?.action?.onClick) {
      opts.action.onClick();
      return;
    }
  }
}

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
  measurementRestored.mockClear();
  toastSuccess.mockClear();
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
    // Funnel hygiene: phantom no-op edits must not pollute analytics.
    expect(measurementEdited).not.toHaveBeenCalled();
  });

  it('updateMeasurement does not fire analytics when value+currency are unchanged', async () => {
    seedBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => {
      // Same values as the seed — should short-circuit.
      result.current.updateMeasurement(
        new Date('2026-01-15T00:00:00.000Z'),
        'Checking',
        { sourceVl: 1000, currency: 'EUR' },
      );
    });
    expect(measurementEdited).not.toHaveBeenCalled();
  });

  it('updateMeasurement does not fire analytics when data is null', async () => {
    // No seedBlob — provider mounts with data === null.
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.data).toBeNull();

    act(() => {
      result.current.updateMeasurement(new Date('2026-01-15T00:00:00.000Z'), 'Checking', { sourceVl: 42 });
    });
    expect(measurementEdited).not.toHaveBeenCalled();
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
    expect(measurementDeleted).not.toHaveBeenCalled();
  });

  it('deleteMeasurement does not fire analytics when data is null', async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.data).toBeNull();

    act(() => {
      result.current.deleteMeasurement(new Date('2026-01-15T00:00:00.000Z'), 'Checking');
    });
    expect(measurementDeleted).not.toHaveBeenCalled();
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

  it('deleteMeasurement offers an Undo that restores the exact fact', async () => {
    seedBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const targetDate = new Date('2026-01-15T00:00:00.000Z');
    act(() => {
      result.current.deleteMeasurement(targetDate, 'Checking');
    });
    expect(result.current.data!.facts).toHaveLength(3);

    // The toast carries an Undo action — invoking it puts the fact back verbatim.
    act(() => { clickUndo(); });

    const restored = result.current.data!.facts.find(
      f => f.idSource === 'Checking' && f.date.getTime() === targetDate.getTime(),
    );
    expect(result.current.data!.facts).toHaveLength(4);
    expect(restored).toMatchObject({ sourceVl: 1000, currency: 'EUR' });
    expect(measurementRestored).toHaveBeenCalledTimes(1);
  });

  it('Undo restores every duplicate fact for a (date, source) key', async () => {
    // Legacy spreadsheet ingest can leave two facts on the same (date, source).
    localStorage.setItem(
      'portfolio-data',
      JSON.stringify({
        facts: [
          { date: '2026-01-15T00:00:00.000Z', idSource: 'Checking', sourceVl: 1000, currency: 'EUR' },
          { date: '2026-01-15T00:00:00.000Z', idSource: 'Checking', sourceVl: 1000, currency: 'EUR' },
        ],
        refSources: [{ idSource: 'Checking', volatType: 'Stable', transferableInDays: true }],
        goals: [],
      }),
    );
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => {
      result.current.deleteMeasurement(new Date('2026-01-15T00:00:00.000Z'), 'Checking');
    });
    expect(result.current.data!.facts).toHaveLength(0);

    act(() => { clickUndo(); });
    expect(result.current.data!.facts.filter(f => f.idSource === 'Checking')).toHaveLength(2);
  });

  it('Undo is non-clobbering: a value re-entered for the slot survives undo', async () => {
    // Build the whole scenario through addMeasurement so every (date, source)
    // key is normalised the same way — avoids a UTC-vs-local-midnight mismatch
    // between a seeded ISO blob and addMeasurement's start-of-day clamp.
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(async () => { await Promise.resolve(); });

    const targetDate = new Date('2026-01-15T12:00:00.000Z');
    act(() => {
      result.current.addMeasurement([{ name: 'Checking', value: 1000, currency: 'EUR' }], { date: targetDate });
    });
    const seeded = result.current.data!.facts.find(f => f.idSource === 'Checking')!;

    act(() => {
      result.current.deleteMeasurement(seeded.date, 'Checking');
    });
    // User re-enters a fresh value on the same slot before clicking Undo.
    act(() => {
      result.current.addMeasurement([{ name: 'Checking', value: 7777, currency: 'EUR' }], { date: targetDate });
    });

    act(() => { clickUndo(); });

    // The newer value wins; the stale undo does not overwrite it, and the
    // analytics restore event does not fire on a no-op undo.
    const checkingJan = result.current.data!.facts.filter(f => f.idSource === 'Checking');
    expect(checkingJan).toHaveLength(1);
    expect(checkingJan[0].sourceVl).toBe(7777);
    expect(measurementRestored).not.toHaveBeenCalled();
  });

  it('Undo is idempotent: a second click after a restore is a no-op', async () => {
    seedBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => {
      result.current.deleteMeasurement(new Date('2026-01-15T00:00:00.000Z'), 'Checking');
    });
    act(() => { clickUndo(); });
    act(() => { clickUndo(); });

    expect(result.current.data!.facts.filter(f => f.idSource === 'Checking')).toHaveLength(2);
    // Restore fired exactly once — the second click hit the present-key guard.
    expect(measurementRestored).toHaveBeenCalledTimes(1);
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
