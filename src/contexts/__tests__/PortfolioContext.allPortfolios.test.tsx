import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

const USER = 'u1';

const authState: {
  user: { id: string; email_confirmed_at: string } | null;
  loading: boolean;
  subscription: { subscribed: boolean; productId: string | null; familyBeta: boolean; familyMember: boolean };
  subscriptionChecked: boolean;
} = {
  user: { id: USER, email_confirmed_at: '2026-01-01T00:00:00Z' },
  loading: false,
  subscription: { subscribed: false, productId: null, familyBeta: true, familyMember: false },
  subscriptionChecked: true,
};

// lock() wipes the key in place, then drops it; tests lock through keyState.
const keyState = { dk: new Uint8Array(32) as Uint8Array | null };
const portfolioKeys = new Map<string, Uint8Array>();
const keySessionMock = {
  status: 'unlocked-encrypted' as const,
  getDataKey: () => keyState.dk,
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

// The personal snapshot, as its decrypted JSON. The upsert stores what it's
// given, so a save followed by a read round-trips like the real row.
// `hold` keeps a read that starts while it's set open until the test
// releases it; `reads` counts the reads started.
const db = vi.hoisted(() => ({
  personal: null as Record<string, unknown> | null,
  undecryptable: false,
  readError: false,
  hold: null as Promise<void> | null,
  reads: 0,
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = async () => {
    db.reads += 1;
    if (db.hold) await db.hold;
    return db.readError
      ? { data: null, error: { message: 'network error' } }
      : { data: db.personal ? [{ data: null, encrypted_data: '\\x00', nonce: '\\x00', enc_version: 1 }] : [], error: null };
  };
  return { supabase: { from: () => chain } };
});

vi.mock('@/lib/cloudSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cloudSync')>();
  return {
    ...actual,
    decodeSnapshot: vi.fn(async () => {
      if (db.undecryptable) throw new Error('authentication tag mismatch');
      return { kind: 'encrypted', data: JSON.parse(JSON.stringify(db.personal)) };
    }),
    upsertEncryptedSnapshot: vi.fn(async (_client: unknown, _userId: string, payload: unknown) => {
      db.personal = JSON.parse(JSON.stringify(payload));
    }),
  };
});

vi.mock('@/lib/portfolios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/portfolios')>();
  return {
    ...actual,
    listPortfolios: vi.fn(),
    fetchPortfolio: vi.fn(),
    savePortfolio: vi.fn(),
    rotatePortfolioKey: vi.fn(),
  };
});

vi.mock('@/lib/portfolioSharing', () => ({ removeMember: vi.fn() }));

const { analytics } = vi.hoisted(() => ({
  analytics: { allPortfoliosOpened: vi.fn(), portfolioShareSet: vi.fn(), cloudSyncFailed: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock('@/lib/analytics', () => ({
  analytics: new Proxy(analytics, { get: (target, key: string) => (target[key] ??= vi.fn()) }),
  clearAttribution: vi.fn(),
}));

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('sonner', () => ({ toast }));

import { upsertEncryptedSnapshot } from '@/lib/cloudSync';
import { fetchPortfolio, listPortfolios, savePortfolio, type LoadedPortfolio } from '@/lib/portfolios';
import { removeMember } from '@/lib/portfolioSharing';
import { PortfolioProvider, usePortfolio } from '@/contexts/PortfolioContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <PortfolioProvider>{children}</PortfolioProvider>;

/** Personal: Savings at 100 on 1 January. */
function personalBlob(shares?: Record<string, number>, value = 100): Record<string, unknown> {
  return JSON.parse(JSON.stringify({
    facts: [{ date: new Date(2026, 0, 1), idSource: 'Savings', sourceVl: value, currency: 'EUR' }],
    refSources: [{ idSource: 'Savings', volatType: 'Non-volatile', transferableInDays: true }],
    goals: [],
    ...(shares ? { portfolioShares: shares } : {}),
  }));
}

/** Joint: House at `value` on 31 January. */
function joint(revision = 1, value = 1000, id = 'p1', name = 'Joint'): LoadedPortfolio {
  return {
    meta: { id, name, ownerId: USER, revision, keyEpoch: 1, rotationDue: false },
    portfolioKey: new Uint8Array(32).fill(1),
    content: {
      facts: [{ date: '2026-01-31', idSource: 'House', sourceVl: value, currency: 'EUR' }],
      refSources: [{ idSource: 'House', volatType: 'Non-volatile', transferableInDays: false }],
      goals: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  portfolioKeys.clear();
  localStorage.clear();
  authState.user = { id: USER, email_confirmed_at: '2026-01-01T00:00:00Z' };
  authState.subscription = { subscribed: false, productId: null, familyBeta: true, familyMember: false };
  db.personal = personalBlob({ p1: 50 });
  db.undecryptable = false;
  db.readError = false;
  db.hold = null;
  db.reads = 0;
  keyState.dk = new Uint8Array(32);
  vi.mocked(listPortfolios).mockImplementation(async () => ({ loaded: [joint()], failed: 0 }));
  vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) => (id === 'p1' ? joint() : null));
  vi.mocked(savePortfolio).mockImplementation(async (_client, { meta }) => ({ status: 'ok', revision: meta.revision + 1 }));
  vi.mocked(removeMember).mockResolvedValue();
});

async function openAll() {
  const handle = renderHook(() => usePortfolio(), { wrapper });
  await waitFor(() => expect(handle.result.current.isLoading).toBe(false));
  await act(async () => { await handle.result.current.switchPortfolio('all'); });
  return handle;
}

const totals = (snapshots: { total: number }[]) => snapshots.map((s) => s.total);
const storedValues = () => (db.personal?.facts as { sourceVl: number }[]).map((f) => f.sourceVl);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Each of the next upserts waits for its own gate, then stores its payload. */
function gateUpserts(count: number) {
  const gates = Array.from({ length: count }, deferred);
  for (const gate of gates) {
    vi.mocked(upsertEncryptedSnapshot).mockImplementationOnce(async (_client, _userId, payload) => {
      await gate.promise;
      db.personal = JSON.parse(JSON.stringify(payload));
    });
  }
  return gates;
}

async function openPersonal() {
  const handle = renderHook(() => usePortfolio(), { wrapper });
  await waitFor(() => expect(handle.result.current.isLoading).toBe(false));
  return handle;
}

describe('All portfolios', () => {
  it("adds up Personal and each extra portfolio at the user's share, carrying each forward", async () => {
    const { result } = await openAll();
    expect(result.current.activePortfolioId).toBe('all');
    expect(result.current.activePortfolioName).toBe('All portfolios');
    expect(result.current.readOnlyReason).toBe('all_portfolios');
    // Starts on 31 Jan, Joint's first entry: Personal's 1 Jan entry carried in, plus half of Joint.
    expect(totals(result.current.allSnapshots)).toEqual([600]);
    expect(result.current.allSources).toEqual(['Joint · House', 'Personal · Savings']);
    expect(result.current.portfolioParts.map((p) => [p.id, p.share])).toEqual([['personal', 100], ['p1', 50]]);
    expect(result.current.goals).toEqual([]);
    expect(localStorage.getItem(`active-portfolio:${USER}`)).toBe('all');
    expect(analytics.allPortfoliosOpened).toHaveBeenCalledTimes(1);
  });

  it('reopens after a reload when it was the last view', async () => {
    localStorage.setItem(`active-portfolio:${USER}`, 'all');
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activePortfolioId).toBe('all');
    expect(totals(result.current.allSnapshots)).toEqual([600]);
  });

  // Value: protects=a reload with All portfolios remembered but no extra portfolio left opens Personal, editable;
  // fails_when=the reload reopens All portfolios with only Personal in it, read-only and with prefixed source names;
  // why_new=the reload test above always has an extra portfolio; seam=none; no_claim=none beyond protects (portfolio list mocked; unit only)
  it('opens Personal on reload when it was the last view but no extra portfolio is left', async () => {
    localStorage.setItem(`active-portfolio:${USER}`, 'all');
    vi.mocked(listPortfolios).mockResolvedValue({ loaded: [], failed: 0 });
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activePortfolioId).toBe('personal');
    expect(result.current.readOnlyReason).toBeNull();
    expect(totals(result.current.allSnapshots)).toEqual([100]);
  });

  it('is not offered without an extra portfolio', async () => {
    vi.mocked(listPortfolios).mockResolvedValue({ loaded: [], failed: 0 });
    const { result } = await openAll();
    expect(result.current.activePortfolioId).toBe('personal');
    expect(result.current.portfolioParts).toEqual([]);
  });

  it('refuses edits and says where they go', async () => {
    const { result } = await openAll();
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/open the portfolio it belongs to/));
    act(() => result.current.renameSource('Personal · Savings', 'Cash'));
    expect(savePortfolio).not.toHaveBeenCalled();
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
    expect(totals(result.current.allSnapshots)).toEqual([600]);
  });

  it("picks up a partner's save when the window regains focus", async () => {
    const { result } = await openAll();
    vi.mocked(fetchPortfolio).mockResolvedValueOnce(joint(7, 2000));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(totals(result.current.allSnapshots)).toEqual([1100]));
  });

  it('returns to Personal when the last extra portfolio goes', async () => {
    const { result } = await openAll();
    await act(async () => { await result.current.leavePortfolio('p1'); });
    await waitFor(() => expect(result.current.activePortfolioId).toBe('personal'));
    expect(result.current.portfolioParts).toEqual([]);
  });

  // Value: protects=opening All portfolios after the only extra portfolio's access was revoked ends on Personal with the no-access toast;
  // fails_when=the open carries on over the switch to Personal, or the revoked portfolio stays listed;
  // why_new=the leave test removes access through leavePortfolio, not a refused fetch; seam=none; no_claim=server-side revocation (fetchPortfolio mocked; unit only)
  it('opens Personal when access to the only extra portfolio was revoked', async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    vi.mocked(fetchPortfolio).mockResolvedValue(null);
    await act(async () => { await result.current.switchPortfolio('all'); });
    await waitFor(() => expect(totals(result.current.allSnapshots)).toEqual([100]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activePortfolioId).toBe('personal');
    expect(result.current.extraPortfolios).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('You no longer have access to this portfolio.', expect.anything());
    // The overtaken open leaves nothing behind: Personal's own names, no "opened" event.
    expect(result.current.allSources).toEqual(['Savings']);
    expect(analytics.allPortfoliosOpened).not.toHaveBeenCalled();
  });

  // Value: protects=renaming an extra portfolio while All portfolios is open renames its sources and its row there straight away;
  // fails_when=renamePortfolio stops calling refreshAll, leaving the old prefix until the next focus refresh;
  // why_new=the rename test in PortfolioContext.portfolios runs in Personal; seam=none; no_claim=none beyond protects (sync save mocked; unit only)
  it('shows a renamed portfolio under its new name straight away', async () => {
    const { result } = await openAll();
    let ok = false;
    await act(async () => { ok = await result.current.renamePortfolio('p1', 'Household'); });
    expect(ok).toBe(true);
    expect(result.current.allSources).toEqual(['Household · House', 'Personal · Savings']);
    expect(result.current.portfolioParts.map((p) => p.name)).toEqual(['Personal', 'Household']);
  });

  // Value: protects=a joined portfolio named like one the user owns keeps its own sources in the view;
  // fails_when=the view passes the names through, so both portfolios' sources merge under one name;
  // why_new=the pure withDistinctNames tests don't cover the view using it; seam=none; no_claim=none beyond protects (portfolio list mocked; unit only)
  it('keeps two portfolios with the same name apart', async () => {
    vi.mocked(listPortfolios).mockImplementation(async () => ({ loaded: [joint(), joint(1, 500, 'p2', 'Joint')], failed: 0 }));
    vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) =>
      (id === 'p1' ? joint() : id === 'p2' ? joint(1, 500, 'p2', 'Joint') : null));
    const { result } = await openAll();
    expect(result.current.portfolioParts.map((p) => p.name)).toEqual(['Personal', 'Joint', 'Joint (2)']);
    expect(result.current.allSources).toHaveLength(3);
    expect(result.current.allSources).toEqual(expect.arrayContaining(['Joint · House', 'Joint (2) · House', 'Personal · Savings']));
  });

  it('keeps the personal figures it last read, and says so, when reading them fails', async () => {
    const { result } = await openAll();
    db.readError = true;
    await act(async () => { await result.current.switchPortfolio('p1'); });
    await act(async () => { await result.current.switchPortfolio('all'); });
    expect(totals(result.current.allSnapshots)).toEqual([600]);
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Couldn't load your personal portfolio/), expect.anything());
  });

  // Value: protects=All portfolios never counts every portfolio in full because the shares couldn't be read;
  // fails_when=a failed personal read, in a tab that never read the shares, opens the view with every share at 100%;
  // why_new=the failed-read test above opened the view once first, so its shares were known; seam=none; no_claim=none beyond protects (Supabase client mocked; unit only)
  it("won't open when the shares were never read, and goes back", async () => {
    localStorage.setItem(`active-portfolio:${USER}`, 'p1');
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activePortfolioId).toBe('p1');
    db.readError = true;
    await act(async () => { await result.current.switchPortfolio('all'); });
    await waitFor(() => expect(result.current.activePortfolioId).toBe('p1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.portfolioParts).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/share of each portfolio/), expect.anything());
  });

  // Value: protects=a refused view never stays on screen at 100% when the portfolio to go back to was just revoked;
  // fails_when=the switch back targets the revoked portfolio and does nothing, leaving All portfolios with every share in full;
  // why_new=the refusal test above goes back to a portfolio that still exists; seam=none; no_claim=server-side revocation (fetchPortfolio mocked; unit only)
  it('opens Personal when the shares are unreadable and the previous portfolio just went', async () => {
    localStorage.setItem(`active-portfolio:${USER}`, 'p1');
    vi.mocked(listPortfolios).mockResolvedValue({ loaded: [joint(), joint(1, 500, 'p2', 'Company')], failed: 0 });
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activePortfolioId).toBe('p1');
    db.readError = true;
    vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) => (id === 'p2' ? joint(1, 500, 'p2', 'Company') : null));
    await act(async () => { await result.current.switchPortfolio('all'); });
    await waitFor(() => expect(result.current.activePortfolioId).toBe('personal'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  // Value: protects=All portfolios never shows every portfolio in full while its shares are unread, even when the way back is blocked;
  // fails_when=a revoked portfolio's refresh rebuilds the opening view with unread shares, and a lock stops the switch back;
  // why_new=the test above can switch back; this one can't, so only the view's own guard keeps the 100% totals off screen; seam=none; no_claim=the unlock flow (key session mocked; unit only)
  it('shows no totals at 100% when the shares are unread and a lock blocks the way back', async () => {
    localStorage.setItem(`active-portfolio:${USER}`, 'p1');
    vi.mocked(listPortfolios).mockResolvedValue({ loaded: [joint(), joint(1, 500, 'p2', 'Company')], failed: 0 });
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    db.readError = true;
    vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) => {
      if (id === 'p2') return joint(1, 500, 'p2', 'Company');
      keyState.dk = null; // Locked while the refresh runs.
      return null;
    });
    await act(async () => { await result.current.switchPortfolio('all'); });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  // Value: protects=All portfolios' combined copy never becomes editable as Personal when the cloud load reruns;
  // fails_when=a rerun that lists no extra portfolio opens an empty Personal but keeps the combined data on screen, and the next entry saves it into Personal;
  // why_new=no test reruns the cloud load over an open view; seam=none; no_claim=Supabase's own auth events (auth mocked; unit only)
  it('never leaves the combined view editable as Personal when a rerun lists no extra portfolio', async () => {
    db.personal = null;
    const { result, rerender } = await openAll();
    expect(result.current.data).not.toBeNull();
    vi.mocked(listPortfolios).mockResolvedValue({ loaded: [], failed: 0 });
    // The same person as a new object, as Supabase sends on every auth event.
    authState.user = { ...authState.user! };
    rerender();
    await waitFor(() => expect(result.current.activePortfolioId).toBe('personal'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  it('forgets the view and the shares on sign-out', async () => {
    const { result, rerender } = await openAll();
    authState.user = null;
    rerender();
    await waitFor(() => expect(result.current.activePortfolioId).toBe('personal'));
    expect(result.current.portfolioParts).toEqual([]);
    expect(localStorage.getItem(`active-portfolio:${USER}`)).toBeNull();
  });
});

describe('shares', () => {
  it('counts a new share at once and saves it into the personal blob', async () => {
    const { result } = await openAll();
    let ok = false;
    await act(async () => { ok = await result.current.setPortfolioShare('p1', 25); });
    expect(ok).toBe(true);
    expect(totals(result.current.allSnapshots)).toEqual([350]);
    expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1);
    expect(db.personal).toMatchObject({ portfolioShares: { p1: 25 }, facts: [{ idSource: 'Savings', sourceVl: 100 }] });
    expect(analytics.portfolioShareSet).toHaveBeenCalledTimes(1);
  });

  it('reads the latest blob first, so entries and shares saved on another device survive', async () => {
    const { result } = await openAll();
    // Another device, after this view opened: a new personal value and a share of a portfolio this tab never saw.
    db.personal = personalBlob({ p1: 50, p9: 10 }, 300);
    await act(async () => { await result.current.setPortfolioShare('p1', 100); });
    expect(db.personal).toMatchObject({ portfolioShares: { p1: 100, p9: 10 }, facts: [{ sourceVl: 300 }] });
    expect(totals(result.current.allSnapshots)).toEqual([1300]);
  });

  // Value: protects=a share changed while the previous share save is in flight is saved, not reverted;
  // fails_when=a finished save marks every share saved, so the newer one reverts to the stored value and is never written;
  // why_new=the other share tests set one share at a time; seam=none; no_claim=real request ordering (Supabase client and upsert mocked; unit only)
  it('saves a share changed while the previous save is in flight', async () => {
    const { result } = await openAll();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(upsertEncryptedSnapshot).mockImplementationOnce(async (_client, _userId, payload) => {
      await gate;
      db.personal = JSON.parse(JSON.stringify(payload));
    });
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => { first = result.current.setPortfolioShare('p1', 25); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
    act(() => { second = result.current.setPortfolioShare('p1', 30); });
    await act(async () => {
      release();
      await Promise.all([first, second]);
    });
    expect(db.personal?.portfolioShares).toEqual({ p1: 30 });
    expect(totals(result.current.allSnapshots)).toEqual([400]);
  });

  // Value: protects=a user without a personal snapshot (only shared portfolios) can save a share, and Personal stays empty;
  // fails_when=the share save gives up, or writes a snapshot Personal then reads as entries, when Personal was never saved;
  // why_new=every other share test starts from a stored personal snapshot; seam=none; no_claim=the server accepting the new row (Supabase client and upsert mocked; unit only)
  it('saves a share before the personal portfolio has a snapshot', async () => {
    db.personal = null;
    const { result } = await openAll();
    expect(totals(result.current.allSnapshots)).toEqual([1000]);
    let ok = false;
    await act(async () => { ok = await result.current.setPortfolioShare('p1', 40); });
    expect(ok).toBe(true);
    expect(db.personal).toMatchObject({ facts: [], portfolioShares: { p1: 40 } });
    expect(totals(result.current.allSnapshots)).toEqual([400]);
    await act(async () => { await result.current.switchPortfolio('personal'); });
    expect(result.current.data).toBeNull();
  });

  it('leaves a personal blob it cannot decrypt untouched', async () => {
    db.undecryptable = true;
    const { result } = await openAll();
    let ok = true;
    await act(async () => { ok = await result.current.setPortfolioShare('p1', 30); });
    expect(ok).toBe(false);
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Couldn't save your share/), expect.anything());
  });

  it('keeps a share whose save failed, and Retry saves it', async () => {
    const { result } = await openAll();
    vi.mocked(upsertEncryptedSnapshot).mockRejectedValueOnce(new Error('400'));
    await act(async () => { await result.current.setPortfolioShare('p1', 10); });
    expect(result.current.syncStatus).toBe('error');
    expect(totals(result.current.allSnapshots)).toEqual([200]);

    await act(async () => { result.current.retrySync(); });
    await waitFor(() => expect(db.personal).toMatchObject({ portfolioShares: { p1: 10 } }));
  });

  it('keeps a share whose save failed when Personal is read again', async () => {
    const { result } = await openAll();
    vi.mocked(upsertEncryptedSnapshot).mockRejectedValueOnce(new Error('400'));
    await act(async () => { await result.current.setPortfolioShare('p1', 10); });
    await act(async () => { await result.current.switchPortfolio('personal'); });
    await act(async () => { await result.current.switchPortfolio('all'); });
    expect(totals(result.current.allSnapshots)).toEqual([200]);
    await act(async () => { result.current.retrySync(); });
    await waitFor(() => expect(db.personal).toMatchObject({ portfolioShares: { p1: 10 } }));
  });

  // Value: protects=a share whose save failed is saved once All portfolios opens again;
  // fails_when=reopening the view leaves the share unsaved with no Retry on screen, and a reload reverts it;
  // why_new=the Retry tests above press Retry; this one never does; seam=none; no_claim=none beyond protects (upsert mocked; unit only)
  it('saves a share whose save failed when the view opens again', async () => {
    const { result } = await openAll();
    vi.mocked(upsertEncryptedSnapshot).mockRejectedValueOnce(new Error('400'));
    await act(async () => { await result.current.setPortfolioShare('p1', 10); });
    expect(db.personal?.portfolioShares).toEqual({ p1: 50 });
    await act(async () => { await result.current.switchPortfolio('p1'); });
    await act(async () => { await result.current.switchPortfolio('all'); });
    await waitFor(() => expect(db.personal?.portfolioShares).toEqual({ p1: 10 }));
  });

  // Value: protects=a share that can't save because the data is locked leaves Retry on screen;
  // fails_when=the locked early return leaves the status idle, so nothing offers to save the share after unlocking;
  // why_new=the lock test above locks during the read, after the save started; seam=none; no_claim=the unlock flow (key session mocked; unit only)
  it('offers Retry for a share that could not save while locked', async () => {
    const { result } = await openAll();
    keyState.dk = null;
    await act(async () => { await result.current.setPortfolioShare('p1', 10); });
    expect(result.current.syncStatus).toBe('error');
    expect(toast.info).toHaveBeenCalledWith('Unlock your data to sync this change.', expect.anything());
  });

  // Value: protects=setting a share changes only the shares in the stored personal blob;
  // fails_when=the share save writes back the cleaned-up copy, dropping a row with a bad date and a field a newer build wrote;
  // why_new=the other share tests store only clean rows; seam=none; no_claim=real decryption (decode mocked; unit only)
  it('writes the personal blob back as stored, changing only the shares', async () => {
    const blob = personalBlob({ p1: 50 });
    db.personal = {
      ...blob,
      facts: [...(blob.facts as unknown[]), { date: 'not a date', idSource: 'Savings', sourceVl: 5, currency: 'EUR' }],
      futureField: { kept: true },
    };
    const { result } = await openAll();
    await act(async () => { await result.current.setPortfolioShare('p1', 25); });
    expect(db.personal).toMatchObject({ futureField: { kept: true }, portfolioShares: { p1: 25 } });
    expect(db.personal?.facts).toHaveLength(2);
  });

  it("never writes one account's unsaved shares into the next account's blob", async () => {
    const { result, rerender } = await openAll();
    vi.mocked(upsertEncryptedSnapshot).mockRejectedValueOnce(new Error('400'));
    await act(async () => { await result.current.setPortfolioShare('p1', 10); });

    authState.user = null;
    rerender();
    await waitFor(() => expect(result.current.activePortfolioId).toBe('personal'));
    // Another account on the same tab, with a portfolio of its own.
    vi.mocked(listPortfolios).mockResolvedValue({ loaded: [joint(1, 1000, 'p2', 'Company')], failed: 0 });
    vi.mocked(fetchPortfolio).mockResolvedValue(joint(1, 1000, 'p2', 'Company'));
    db.personal = personalBlob();
    authState.user = { id: 'u2', email_confirmed_at: '2026-01-01T00:00:00Z' };
    rerender();
    await waitFor(() => expect(result.current.extraPortfolios.map((p) => p.id)).toEqual(['p2']));
    await act(async () => { await result.current.switchPortfolio('all'); });
    await act(async () => { await result.current.setPortfolioShare('p2', 30); });
    expect(db.personal?.portfolioShares).toEqual({ p2: 30 });
  });

  // Value: protects=a share save never encrypts with a key a lock wiped while its read was in flight;
  // fails_when=the writer encrypts with the key it read before awaiting the stored row;
  // why_new=the other share tests never lock; seam=none; no_claim=libsodium itself (upsert mocked; unit only)
  it('never writes a share save after a lock during its read', async () => {
    db.personal = null; // No row: nothing is decrypted before the write.
    const { result } = await openAll();
    let release!: () => void;
    db.hold = new Promise<void>((resolve) => { release = resolve; });
    let save!: Promise<boolean>;
    act(() => { save = result.current.setPortfolioShare('p1', 40); });
    keyState.dk!.fill(0);
    keyState.dk = null;
    let ok = true;
    await act(async () => { release(); ok = await save; });
    expect(ok).toBe(false);
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('Unlock your data to sync this change.', expect.anything());
  });

  // Value: protects=a personal save's retry never encrypts with a key a lock wiped during the retry delay;
  // fails_when=the retry reuses the key read before the first attempt;
  // why_new=no test locks between a failed attempt and its retry; seam=none; no_claim=libsodium itself (upsert mocked; unit only)
  it('never retries a personal save with a key a lock wiped during the retry delay', async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    vi.mocked(upsertEncryptedSnapshot).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
    keyState.dk!.fill(0);
    keyState.dk = null;
    await waitFor(() => expect(result.current.syncStatus).toBe('error'), { timeout: 5000 });
    expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1);
  }, 10_000);

  // Value: protects=a personal save from a tab opened earlier keeps a share set on another device since;
  // fails_when=the personal save writes back the shares this tab read at load;
  // why_new=the existing personal-save test has the share stored from the start; seam=none; no_claim=real request ordering (Supabase mocked; unit only)
  it('keeps a share set on another device when Personal is saved', async () => {
    db.personal = personalBlob();
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    db.personal = personalBlob({ p1: 50 });
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
    expect(db.personal).toMatchObject({ portfolioShares: { p1: 50 } });
  });

  it('ignores a share of a portfolio the user has no access to', async () => {
    const { result } = await openAll();
    let ok = true;
    await act(async () => { ok = await result.current.setPortfolioShare('elsewhere', 10); });
    expect(ok).toBe(false);
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the shares when the personal portfolio is saved', async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activePortfolioId).toBe('personal');
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
    expect(db.personal).toMatchObject({ portfolioShares: { p1: 50 } });
  });
});

describe('personal writes', () => {
  // Value: protects=an older personal save never lands over a newer one, and a save a newer one overtook is not sent;
  // fails_when=personal saves run side by side, so a slow first read lets the first payload land last;
  // why_new=no other test overlaps two personal saves; seam=none; no_claim=real request ordering (Supabase client and upsert mocked; unit only)
  it('writes personal saves in order, skipping one a newer save overtook', async () => {
    const { result } = await openPersonal();
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    // Only the first save's read is slow.
    await waitFor(() => expect(db.reads).toBe(before + 1));
    db.hold = null;
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 160, currency: 'EUR' }]); });
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 175, currency: 'EUR' }]); });
    await act(async () => { slowRead.resolve(); });
    await waitFor(() => expect(result.current.syncStatus).toBe('synced'));
    expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(2);
    expect(storedValues()).toEqual([100, 175]);
  });

  // Value: protects=an entry saved just before opening All portfolios is written, and the view counts it;
  // fails_when=the save skips its write once the switch makes it stale, or the view reads Personal before that write lands;
  // why_new=no other test switches portfolio while a personal save is in flight; seam=none; no_claim=real request ordering (Supabase client and upsert mocked; unit only)
  it('writes an entry saved just before opening All portfolios, and counts it there', async () => {
    const { result } = await openPersonal();
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(db.reads).toBe(before + 1));
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('all'); });
    // The switch gets as far as it can while the save's read is held.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { slowRead.resolve(); await opening; });
    expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1);
    expect(storedValues()).toEqual([100, 150]);
    expect(totals(result.current.allSnapshots)).toEqual([600, 650]);
  });

  // Value: protects=a share set while an entry's save is in flight keeps that entry;
  // fails_when=the share save reads the snapshot before the entry's write lands and writes the older entries back;
  // why_new=the share tests never overlap a personal save; seam=none; no_claim=saves from another device (Supabase client and upsert mocked; unit only)
  it('saves a share only after an entry saved just before it', async () => {
    const { result } = await openPersonal();
    const [entryWrite, shareWrite] = gateUpserts(2);
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('all'); });
    let share!: Promise<boolean>;
    act(() => { share = result.current.setPortfolioShare('p1', 25); });
    // The share save gets as far as it can while the entry's write is held.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { entryWrite.resolve(); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(2));
    await act(async () => { shareWrite.resolve(); await Promise.all([share, opening]); });
    expect(storedValues()).toEqual([100, 150]);
    expect(db.personal?.portfolioShares).toEqual({ p1: 25 });
    expect(totals(result.current.allSnapshots)).toEqual([350, 400]);
  });

  // Value: protects=Personal reopened while an entry's save is in flight shows that entry, so the next edit can't drop it;
  // fails_when=the reopen reads the snapshot before the write lands, and the next save sends the older entries;
  // why_new=no other test reopens Personal during a save; seam=none; no_claim=saves from another device (Supabase client and upsert mocked; unit only)
  it('shows an entry saved just before switching away when Personal opens again', async () => {
    const { result } = await openPersonal();
    const [entryWrite] = gateUpserts(1);
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.switchPortfolio('p1'); });
    let reopening!: Promise<void>;
    act(() => { reopening = result.current.switchPortfolio('personal'); });
    await act(async () => { entryWrite.resolve(); await reopening; });
    expect(result.current.data?.facts.map((f) => f.sourceVl)).toEqual([100, 150]);
  });

  // Value: protects=a personal save for an account that can't hold shares (no extra portfolio, no Family access) goes straight to the write;
  // fails_when=every personal save first reads and decrypts the whole snapshot;
  // why_new=the other personal-save tests list an extra portfolio; seam=none; no_claim=none beyond protects (Supabase client mocked; unit only)
  it('saves Personal without reading the snapshot first for an account without Family', async () => {
    authState.subscription = { subscribed: false, productId: null, familyBeta: false, familyMember: false };
    vi.mocked(listPortfolios).mockResolvedValue({ loaded: [], failed: 0 });
    const { result } = await openPersonal();
    const before = db.reads;
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
    expect(db.reads).toBe(before);
    expect(storedValues()).toEqual([100, 150]);
  });

  // Value: protects=a Family account whose tab lists no extra portfolio still keeps a share set on another device when it saves Personal;
  // fails_when=the shares read is skipped whenever no extra portfolio is listed, so the save erases that share;
  // why_new=the Free test above skips the read; this one is the Family case it must not; seam=none; no_claim=none beyond protects (Supabase client mocked; unit only)
  it('keeps a share set elsewhere when a Family account with no extra portfolio listed saves Personal', async () => {
    db.personal = personalBlob();
    vi.mocked(listPortfolios).mockResolvedValue({ loaded: [], failed: 0 });
    const { result } = await openPersonal();
    db.personal = personalBlob({ p9: 10 });
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
    expect(db.personal).toMatchObject({ portfolioShares: { p9: 10 } });
  });

  // Value: protects=an entry whose save fails after a portfolio switch is reported, and Personal reopens on it with Retry;
  // fails_when=a save the switch made stale skips its retry and its error, so the entry is lost with no message;
  // why_new=the switch tests above cover saves that land; seam=none; no_claim=real network failures (upsert mocked; unit only)
  it('reports an entry whose save fails after a switch, and Personal reopens on it with Retry', async () => {
    const { result } = await openPersonal();
    const failing = deferred();
    vi.mocked(upsertEncryptedSnapshot).mockImplementationOnce(async () => {
      await failing.promise;
      throw new Error('400');
    });
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.switchPortfolio('p1'); });
    await act(async () => { failing.resolve(); });
    // Its own toast id, so another view's sync error can't replace it.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/open Personal and use Retry/), { id: 'personal-sync-error' }));
    expect(result.current.syncStatus).toBe('idle');
    await act(async () => { await result.current.switchPortfolio('personal'); });
    expect(result.current.data?.facts.map((f) => f.sourceVl)).toEqual([100, 150]);
    expect(result.current.syncStatus).toBe('error');
    await act(async () => { result.current.retrySync(); });
    await waitFor(() => expect(storedValues()).toEqual([100, 150]));
  });

  // Value: protects=a Personal that failed to load refuses entries, so one entry can't replace the stored history, until a read succeeds;
  // fails_when=the failed load leaves an empty, editable Personal and the next entry is saved over the history;
  // why_new=no other test edits after a failed load; seam=none; no_claim=none beyond protects (Supabase client mocked; unit only)
  it('refuses entries in Personal after its load failed, until it loads', async () => {
    db.readError = true;
    const { result } = await openPersonal();
    expect(result.current.data).toBeNull();
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/changes are paused/), { id: 'personal-load-failed' });
    db.readError = false;
    await act(async () => { await result.current.switchPortfolio('p1'); });
    await act(async () => { await result.current.switchPortfolio('personal'); });
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(storedValues()).toEqual([100, 150]));
  });

  // Value: protects=a reload into All portfolios whose personal read fails can't lead to an entry overwriting Personal's history;
  // fails_when=the refused view falls through to an empty, editable Personal;
  // why_new=the test above fails a plain Personal load, not the All portfolios fall-through; seam=none; no_claim=none beyond protects (Supabase client mocked; unit only)
  it('refuses entries after a reload into All portfolios whose personal read fails', async () => {
    localStorage.setItem(`active-portfolio:${USER}`, 'all');
    db.readError = true;
    const { result } = await openPersonal();
    expect(result.current.activePortfolioId).toBe('personal');
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
  });

  // Value: protects=an All portfolios read that a switch to Personal overtook can't lift Personal's failed-load refusal;
  // fails_when=any successful personal read clears the refusal, so the late All read leaves the empty Personal editable;
  // why_new=the refusal tests above run one load at a time; seam=none; no_claim=real request timing (Supabase client mocked; unit only)
  it('keeps refusing entries when an overtaken All portfolios read lands after Personal failed to load', async () => {
    const { result } = await openPersonal();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('all'); });
    await waitFor(() => expect(db.reads).toBe(before + 1));
    db.hold = null;
    db.readError = true;
    await act(async () => { await result.current.switchPortfolio('personal'); });
    db.readError = false;
    await act(async () => { slowRead.resolve(); await opening; });
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
    expect(storedValues()).toEqual([100]);
  });

  // Value: protects=a cloud load that a rerun overtook can't lift the rerun's failed-load refusal;
  // fails_when=the overtaken load's late successful read clears the refusal over an empty Personal;
  // why_new=the test above overlaps a switch, not two cloud loads; seam=none; no_claim=Supabase's own auth events (auth mocked; unit only)
  it('keeps refusing entries when an overtaken cloud load lands after the current one failed', async () => {
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const { result, rerender } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(db.reads).toBe(1));
    db.hold = null;
    db.readError = true;
    authState.user = { ...authState.user! };
    rerender();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/changes are paused/), { id: 'personal-load-failed' }));
    db.readError = false;
    await act(async () => { slowRead.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
  });

  // Value: protects=a Personal that loaded correctly stays editable when a rerun of the cloud load fails;
  // fails_when=any failed read pauses edits, refusing safe entries over correct data until the page reloads;
  // why_new=the refusal tests fail the load that opens Personal, not a later rerun; seam=none; no_claim=Supabase's own auth events (auth mocked; unit only)
  it('accepts entries on a loaded Personal when a rerun of the cloud load fails', async () => {
    const { result, rerender } = await openPersonal();
    const before = db.reads;
    db.readError = true;
    authState.user = { ...authState.user! };
    rerender();
    await waitFor(() => expect(db.reads).toBe(before + 1));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    db.readError = false;
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(storedValues()).toEqual([100, 150]));
  });

  // Value: protects=an entry made while a rerun of the cloud load is reading stays on screen and is never saved over;
  // fails_when=the rerun applies the older copy it read after the entry, and the next entry builds on that copy;
  // why_new=no other test edits during a rerun; seam=none; no_claim=real request timing (Supabase client mocked; unit only)
  it('keeps an entry made while a rerun of the cloud load was reading', async () => {
    authState.subscription = { subscribed: false, productId: null, familyBeta: false, familyMember: false };
    vi.mocked(listPortfolios).mockResolvedValue({ loaded: [], failed: 0 });
    const { result, rerender } = await openPersonal();
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    authState.user = { ...authState.user! };
    rerender();
    await waitFor(() => expect(db.reads).toBe(before + 1));
    const [entryWrite] = gateUpserts(1);
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await act(async () => { slowRead.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(result.current.data?.facts.map((f) => f.sourceVl)).toEqual([100, 150]);
    await act(async () => { entryWrite.resolve(); });
    await waitFor(() => expect(storedValues()).toEqual([100, 150]));
  });

  // Value: protects=demo data opened over an empty Personal survives a rerun of the cloud load;
  // fails_when=the rerun clears an empty Personal's screen, wiping the demo while the demo banner stays;
  // why_new=no other test reruns the load over demo data; seam=none; no_claim=Supabase's own auth events (auth mocked; unit only)
  it('keeps demo data on an empty Personal when the cloud load reruns', async () => {
    db.personal = null;
    const { result, rerender } = await openPersonal();
    act(() => { result.current.loadMockData(); });
    const demo = result.current.data;
    expect(demo).not.toBeNull();
    const before = db.reads;
    authState.user = { ...authState.user! };
    rerender();
    await waitFor(() => expect(db.reads).toBe(before + 1));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(result.current.data).toBe(demo);
  });

  // Value: protects=a personal snapshot that can't be decrypted counts as a failed load, so entries can't overwrite it;
  // fails_when=an undecryptable snapshot reads as an empty Personal and the next entry is saved over it;
  // why_new=the refusal tests above fail the read itself, not the decryption; seam=none; no_claim=libsodium itself (decode mocked; unit only)
  it("refuses entries when the personal snapshot can't be decrypted", async () => {
    db.undecryptable = true;
    const { result } = await openPersonal();
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/changes are paused/), { id: 'personal-load-failed' });
  });

  // Value: protects=a revoked portfolio's late "no access" fallback never opens Personal under a newer switch;
  // fails_when=the overtaken switch activates Personal, so the newer switch's portfolio data lands as editable Personal and the next entry saves it there;
  // why_new=the revocation test above has one switch at a time; seam=none; no_claim=server-side revocation timing (fetchPortfolio mocked; unit only)
  it('never opens Personal under a newer switch when a revoked portfolio was overtaken', async () => {
    vi.mocked(listPortfolios).mockResolvedValue({ loaded: [joint(), joint(1, 700, 'p3', 'Old')], failed: 0 });
    const { result } = await openPersonal();
    const revoked = deferred();
    const opened = deferred();
    vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) => {
      if (id === 'p3') { await revoked.promise; return null; }
      await opened.promise;
      return joint();
    });
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = result.current.switchPortfolio('p3'); });
    act(() => { second = result.current.switchPortfolio('p1'); });
    await act(async () => { revoked.resolve(); await first; });
    await act(async () => { opened.resolve(); await second; });
    expect(result.current.activePortfolioId).toBe('p1');
    await act(async () => { result.current.addMeasurement([{ name: 'House', value: 1100, currency: 'EUR' }]); });
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
    expect(storedValues()).toEqual([100]);
  });

  // Value: protects=an entry submitted while Personal is still loading can't replace the history the load is reading;
  // fails_when=mutate accepts the entry on the empty screen and saves it as the whole snapshot, and the load's read is then discarded;
  // why_new=the refusal tests above cover a failed load, not one still in flight; seam=none; no_claim=real request timing (Supabase client mocked; unit only)
  it('refuses entries while Personal is still loading', async () => {
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(db.reads).toBe(1));
    await act(async () => { result.current.addMeasurement([{ name: 'Cash', value: 5, currency: 'EUR' }]); });
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/still loading/), { id: 'personal-loading' });
    await act(async () => { slowRead.resolve(); });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
    expect(result.current.data?.facts.map((f) => f.sourceVl)).toEqual([100]);
  });

  // Value: protects=an empty Personal that loaded fine stays editable when a rerun of the cloud load fails;
  // fails_when=the "already on screen" check reads the data, so an empty but loaded Personal counts as unloaded and a new user's first entry is paused;
  // why_new=the loaded-Personal rerun test above has data on screen; seam=none; no_claim=Supabase's own auth events (auth mocked; unit only)
  it('accepts entries on an empty Personal that loaded fine when a rerun fails', async () => {
    db.personal = null;
    const { result, rerender } = await openPersonal();
    const before = db.reads;
    db.readError = true;
    authState.user = { ...authState.user! };
    rerender();
    await waitFor(() => expect(db.reads).toBe(before + 1));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    db.readError = false;
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
  });

  // Value: protects=All portfolios keeps counting a Personal entry whose save failed, as Personal shows it, after a share save;
  // fails_when=the share save resets the view's personal part to the server copy, so the unsaved entry drops out of the total;
  // why_new=the failed-save test above never opens the view; seam=none; no_claim=none beyond protects (upsert mocked; unit only)
  it('keeps counting an unsaved Personal entry after a share save', async () => {
    const { result } = await openPersonal();
    vi.mocked(upsertEncryptedSnapshot).mockRejectedValueOnce(new Error('400'));
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(result.current.syncStatus).toBe('error'));
    await act(async () => { await result.current.switchPortfolio('all'); });
    expect(totals(result.current.allSnapshots)).toEqual([600, 650]);
    await act(async () => { await result.current.setPortfolioShare('p1', 25); });
    expect(totals(result.current.allSnapshots)).toEqual([350, 400]);
    expect(storedValues()).toEqual([100]);
  });
});
