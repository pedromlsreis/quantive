import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

const USER = 'u1';

const authState: {
  user: { id: string; email_confirmed_at: string } | null;
  loading: boolean;
  subscription: { subscribed: boolean; productId: string | null; familyBeta: boolean };
} = {
  user: { id: USER, email_confirmed_at: '2026-01-01T00:00:00Z' },
  loading: false,
  subscription: { subscribed: false, productId: null, familyBeta: true },
};

const portfolioKeys = new Map<string, Uint8Array>();
const keySessionMock = {
  status: 'unlocked-encrypted' as const,
  getDataKey: () => new Uint8Array(32),
  getPortfolioKey: (id: string) => portfolioKeys.get(id) ?? null,
  setPortfolioKey: (id: string, key: Uint8Array) => { portfolioKeys.set(id, key); },
  forgetPortfolioKey: (id: string) => { portfolioKeys.delete(id); },
};

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/contexts/KeySessionContext', () => ({ useKeySession: () => keySessionMock }));
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ currency: { code: 'EUR', symbol: '€', position: 'after' }, allCurrencies: [], setCurrency: () => {} }),
}));
vi.mock('@/hooks/useFxRates', () => ({ useFxRates: () => ({ convertAt: (v: number) => v, rates: {}, isLoading: false }) }));
vi.mock('@/hooks/useEntitlements', () => ({ useEntitlements: () => ({ has: () => true }), devPlanOverride: () => null }));

// Personal snapshot: none, so the personal portfolio opens empty.
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = () => Promise.resolve({ data: [], error: null });
  return { supabase: { from: () => chain } };
});

vi.mock('@/lib/portfolios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/portfolios')>();
  return {
    ...actual,
    listPortfolios: vi.fn(),
    fetchPortfolio: vi.fn(),
    savePortfolio: vi.fn(),
    createPortfolio: vi.fn(),
    deletePortfolio: vi.fn(),
  };
});

vi.mock('@/lib/analytics', () => ({
  analytics: new Proxy({}, { get: () => vi.fn() }),
  clearAttribution: vi.fn(),
}));

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('sonner', () => ({ toast }));

import {
  createPortfolio as createPortfolioRemote,
  fetchPortfolio,
  listPortfolios,
  savePortfolio,
  type LoadedPortfolio,
} from '@/lib/portfolios';
import { PortfolioProvider, usePortfolio } from '@/contexts/PortfolioContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <PortfolioProvider>{children}</PortfolioProvider>;

function loaded(id: string, name: string, revision = 1, value = 100): LoadedPortfolio {
  return {
    meta: { id, name, ownerId: USER, revision, keyEpoch: 1 },
    portfolioKey: new Uint8Array(32).fill(id.length),
    content: {
      facts: [{ date: '2026-01-31T00:00:00.000Z', idSource: 'Joint account', sourceVl: value, currency: 'EUR' }],
      refSources: [{ idSource: 'Joint account', volatType: 'Non-volatile', transferableInDays: true }],
      goals: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  portfolioKeys.clear();
  localStorage.clear();
  authState.user = { id: USER, email_confirmed_at: '2026-01-01T00:00:00Z' };
  vi.mocked(listPortfolios).mockImplementation(async () => ({ loaded: [loaded('p1', 'Joint')], failed: 0 }));
  vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) => (id === 'p1' ? loaded('p1', 'Joint') : null));
  vi.mocked(savePortfolio).mockImplementation(async (_client, { meta }) => ({ status: 'ok', revision: meta.revision + 1 }));
});

async function renderLoaded() {
  const handle = renderHook(() => usePortfolio(), { wrapper });
  await waitFor(() => expect(handle.result.current.isLoading).toBe(false));
  return handle;
}

describe('loading', () => {
  it('lists extra portfolios at unlock and opens Personal by default', async () => {
    const { result } = await renderLoaded();
    expect(result.current.activePortfolioId).toBe('personal');
    expect(result.current.activePortfolioName).toBe('Personal');
    expect(result.current.extraPortfolios.map((p) => p.name)).toEqual(['Joint']);
    expect(portfolioKeys.has('p1')).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('reopens the portfolio the user last had open', async () => {
    localStorage.setItem(`active-portfolio:${USER}`, 'p1');
    const { result } = await renderLoaded();
    expect(result.current.activePortfolioId).toBe('p1');
    expect(result.current.activePortfolioName).toBe('Joint');
    expect(result.current.data?.facts).toHaveLength(1);
  });

  it('opens Personal when the table is missing (migration not applied)', async () => {
    vi.mocked(listPortfolios).mockRejectedValue(new Error('relation "portfolio_members" does not exist'));
    const { result } = await renderLoaded();
    expect(result.current.activePortfolioId).toBe('personal');
    expect(result.current.extraPortfolios).toEqual([]);
  });
});

describe('switching', () => {
  it('opens the fetched portfolio and remembers it', async () => {
    const { result } = await renderLoaded();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    expect(result.current.activePortfolioId).toBe('p1');
    expect(result.current.data?.facts[0].sourceVl).toBe(100);
    expect(localStorage.getItem(`active-portfolio:${USER}`)).toBe('p1');

    await act(async () => { await result.current.switchPortfolio('personal'); });
    expect(result.current.activePortfolioId).toBe('personal');
    expect(result.current.data).toBeNull();
  });

  it('keeps demo data out of an extra portfolio', async () => {
    const { result } = await renderLoaded();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    act(() => result.current.loadMockData());
    expect(result.current.isMockData).toBe(false);
  });
});

describe('saving', () => {
  it('saves edits in an extra portfolio against the latest revision', async () => {
    const { result } = await renderLoaded();
    await act(async () => { await result.current.switchPortfolio('p1'); });

    await act(async () => { result.current.addMeasurement([{ name: 'Joint account', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(savePortfolio).toHaveBeenCalledTimes(1));
    expect(vi.mocked(savePortfolio).mock.calls[0][1].meta).toMatchObject({ id: 'p1', revision: 1, name: 'Joint' });

    await act(async () => { result.current.addMeasurement([{ name: 'Joint account', value: 175, currency: 'EUR' }]); });
    await waitFor(() => expect(savePortfolio).toHaveBeenCalledTimes(2));
    expect(vi.mocked(savePortfolio).mock.calls[1][1].meta.revision).toBe(2);
  });

  it('on a conflict, warns and replaces the view with the stored version', async () => {
    const { result } = await renderLoaded();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    vi.mocked(savePortfolio).mockResolvedValueOnce({ status: 'conflict', revision: 4 });
    vi.mocked(fetchPortfolio).mockResolvedValueOnce(loaded('p1', 'Joint', 4, 999));

    await act(async () => { result.current.addMeasurement([{ name: 'Joint account', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    await waitFor(() => expect(result.current.data?.facts.map((f) => f.sourceVl)).toEqual([999]));
    expect(result.current.extraPortfolios[0].revision).toBe(4);
  });

  it('leaves the portfolio when access is gone', async () => {
    const { result } = await renderLoaded();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    vi.mocked(savePortfolio).mockResolvedValueOnce({ status: 'forbidden' });

    await act(async () => { result.current.addMeasurement([{ name: 'Joint account', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(result.current.activePortfolioId).toBe('personal'));
    expect(result.current.extraPortfolios).toEqual([]);
    expect(portfolioKeys.has('p1')).toBe(false);
  });
});

describe('managing', () => {
  it('creates a portfolio and opens it', async () => {
    vi.mocked(createPortfolioRemote).mockResolvedValue({ ...loaded('p2', 'Company'), content: { facts: [], refSources: [], goals: [] } });
    vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) =>
      id === 'p2' ? { ...loaded('p2', 'Company'), content: { facts: [], refSources: [], goals: [] } } : loaded('p1', 'Joint'));
    const { result } = await renderLoaded();

    let ok = false;
    await act(async () => { ok = await result.current.createPortfolio('  Company '); });
    expect(ok).toBe(true);
    expect(vi.mocked(createPortfolioRemote).mock.calls[0][3]).toBe('Company');
    expect(result.current.activePortfolioId).toBe('p2');
    expect(result.current.data).toBeNull();
  });

  it('refuses a name that is already used, without calling the server', async () => {
    const { result } = await renderLoaded();
    let ok = true;
    await act(async () => { ok = await result.current.createPortfolio('personal'); });
    expect(ok).toBe(false);
    await act(async () => { ok = await result.current.createPortfolio('JOINT'); });
    expect(ok).toBe(false);
    expect(createPortfolioRemote).not.toHaveBeenCalled();
  });

  it('renames from the stored copy', async () => {
    const { result } = await renderLoaded();
    let ok = false;
    await act(async () => { ok = await result.current.renamePortfolio('p1', 'Household'); });
    expect(ok).toBe(true);
    expect(vi.mocked(savePortfolio).mock.calls[0][1].meta).toMatchObject({ name: 'Household', revision: 1 });
    expect(result.current.extraPortfolios[0]).toMatchObject({ name: 'Household', revision: 2 });
  });
});

describe('user switch', () => {
  it('resets to Personal and forgets the remembered portfolio', async () => {
    localStorage.setItem(`active-portfolio:${USER}`, 'p1');
    const { result, rerender } = await renderLoaded();
    expect(result.current.activePortfolioId).toBe('p1');

    authState.user = null;
    rerender();
    await waitFor(() => expect(result.current.activePortfolioId).toBe('personal'));
    expect(result.current.extraPortfolios).toEqual([]);
    expect(localStorage.getItem(`active-portfolio:${USER}`)).toBeNull();
  });
});
