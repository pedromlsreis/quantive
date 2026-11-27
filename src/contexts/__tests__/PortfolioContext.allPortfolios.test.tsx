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
  status: 'unlocked-encrypted' as 'unlocked-encrypted' | 'locked',
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
    createPortfolio: vi.fn(),
    openRevision: vi.fn(),
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
import {
  createPortfolio as createPortfolioRemote,
  fetchPortfolio,
  listPortfolios,
  openRevision,
  rotatePortfolioKey,
  savePortfolio,
  type LoadedPortfolio,
} from '@/lib/portfolios';
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
  keySessionMock.status = 'unlocked-encrypted';
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

type Portfolio = ReturnType<typeof usePortfolio>;

/** Signs the tab out, then in as u2, whose last view was All portfolios: Personal at 100 plus 30% of Joint. */
async function signInSecondAccount(rerender: () => void, current: () => Portfolio) {
  authState.user = null;
  rerender();
  await waitFor(() => expect(current().activePortfolioId).toBe('personal'));
  db.personal = personalBlob({ p1: 30 });
  localStorage.setItem('active-portfolio:u2', 'all');
  authState.user = { id: 'u2', email_confirmed_at: '2026-01-01T00:00:00Z' };
  rerender();
  await waitFor(() => expect(totals(current().allSnapshots)).toEqual([400]));
}

/** A focus refresh with nothing new: All portfolios rebuilds from memory. Resolves once it has. */
async function rebuildAllView(current: () => Portfolio) {
  const shown = current().data;
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(current().data).not.toBe(shown));
}

/** As KeySession's lock(): the data key and every portfolio key go, so a snapshot read meanwhile can't be decrypted. */
function lock(rerender: () => void) {
  keySessionMock.status = 'locked';
  keyState.dk = null;
  portfolioKeys.clear();
  db.undecryptable = true;
  rerender();
}

/** The unlock: a data key again, and the cloud load reruns. */
function unlock(rerender: () => void) {
  keySessionMock.status = 'unlocked-encrypted';
  keyState.dk = new Uint8Array(32);
  db.undecryptable = false;
  rerender();
}

/** Joint open after a lock and an unlock whose list failed: the lock dropped its key and nothing brought it back. */
async function openJointWithoutKey() {
  const handle = await openPersonal();
  await act(async () => { await handle.result.current.switchPortfolio('p1'); });
  lock(handle.rerender);
  vi.mocked(listPortfolios).mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const lists = vi.mocked(listPortfolios).mock.calls.length;
  unlock(handle.rerender);
  await waitFor(() => expect(listPortfolios).toHaveBeenCalledTimes(lists + 1));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return handle;
}

/** An auth event (the tab regains focus) reruns the cloud load; resolves once its list was requested. */
async function rerunCloudLoad(rerender: () => void) {
  const lists = vi.mocked(listPortfolios).mock.calls.length;
  authState.user = { ...authState.user! };
  rerender();
  await waitFor(() => expect(listPortfolios).toHaveBeenCalledTimes(lists + 1));
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

  // Value: protects=a partner's newer entry becomes the latest figure the pages show (Allocations and search read the last date-filtered snapshot);
  // fails_when=a refresh keeps the previous date range, so the newer entry is filtered out and the pages show the older total;
  // why_new=the focus test above checks allSnapshots, which the date filter doesn't touch; seam=none; no_claim=none beyond protects (portfolio fetch mocked; unit only)
  it("shows a partner's newer entry as the latest figure", async () => {
    const { result } = await openAll();
    const later = joint(7);
    (later.content as { facts: unknown[] }).facts.push({ date: '2026-03-31', idSource: 'House', sourceVl: 1200, currency: 'EUR' });
    vi.mocked(fetchPortfolio).mockResolvedValueOnce(later);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(totals(result.current.allSnapshots)).toEqual([600, 700]));
    const shown = totals(result.current.snapshots);
    expect(shown[shown.length - 1]).toBe(700);
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
  // fails_when=personal saves run side by side, so a slow first write lets the first payload land last;
  // why_new=no other test overlaps two personal saves; seam=none; no_claim=real request ordering (Supabase client and upsert mocked; unit only)
  it('writes personal saves in order, skipping one a newer save overtook', async () => {
    const { result } = await openPersonal();
    // Only the first save's write is slow. Held at its read instead, it would
    // see the newer saves and write nothing.
    const [firstWrite] = gateUpserts(1);
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(upsertEncryptedSnapshot).toHaveBeenCalledTimes(1));
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 160, currency: 'EUR' }]); });
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 175, currency: 'EUR' }]); });
    // The newer saves get as far as they can while the first write is held.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { firstWrite.resolve(); });
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

describe('a request that outlives its account', () => {
  // Value: protects=a personal save still reading when the tab's account changes neither writes nor changes the next account's shares;
  // fails_when=the save checks it's current only before it starts, so it adopts what it read (here, no shares) into the next account and sends the first account's entries;
  // why_new=the account test under shares switches between share saves, never during a personal save; seam=none; no_claim=the row policy that would refuse that write (Supabase client and upsert mocked; unit only)
  it('writes nothing from a personal save still reading when the account changes', async () => {
    db.personal = null; // The first account has no snapshot, so its read has nothing to decrypt.
    const { result, rerender } = await openPersonal();
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    act(() => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(db.reads).toBe(before + 1));
    db.hold = null;
    await signInSecondAccount(rerender, () => result.current);
    db.personal = null; // What the first account's read finds.
    await act(async () => { slowRead.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(upsertEncryptedSnapshot).not.toHaveBeenCalled();
    db.personal = personalBlob({ p1: 30 });
    await rebuildAllView(() => result.current);
    expect(result.current.portfolioParts.map((p) => [p.id, p.share])).toEqual([['personal', 100], ['p1', 30]]);
    expect(totals(result.current.allSnapshots)).toEqual([400]);
  });

  // Value: protects=an All portfolios read still in flight when the tab's account changes leaves the next account's view and messages alone;
  // fails_when=the read adopts its shares, sets the view's Personal part, or shows its decryption error to the next account;
  // why_new=the test above is a save; this is the read that opens the view; seam=none; no_claim=decryption with the next account's key (decode mocked; unit only)
  it.each([
    ['has no snapshot', () => { db.personal = null; }],
    ["has a snapshot the next account's key can't open", () => { db.undecryptable = true; }],
  ])('keeps nothing from an All portfolios read in flight when the account changes (the first account %s)', async (_case, firstAccountRow) => {
    const { result, rerender } = await openPersonal();
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('all'); });
    await waitFor(() => expect(db.reads).toBe(before + 1));
    db.hold = null;
    await signInSecondAccount(rerender, () => result.current);
    toast.error.mockClear();
    firstAccountRow();
    await act(async () => { slowRead.resolve(); await opening; });
    expect(toast.error).not.toHaveBeenCalled();
    db.personal = personalBlob({ p1: 30 });
    db.undecryptable = false;
    await rebuildAllView(() => result.current);
    expect(totals(result.current.allSnapshots)).toEqual([400]);
  });

  // Value: protects=a portfolio list request still in flight when the tab's account changes leaves the next account's portfolios and messages alone;
  // fails_when=the late list shows its decrypt error and runs its cleanup on the next account, forgetting its portfolios and disposing their syncs;
  // why_new=the tests above cover the personal snapshot; this is the extra-portfolio list; seam=none; no_claim=decryption with a zeroed key (list mocked; unit only)
  it('keeps nothing from a portfolio list still loading when the account changes', async () => {
    const { result, rerender } = await openPersonal();
    // The next list request hangs, then answers as a list read with a zeroed key would.
    const slowList = deferred();
    vi.mocked(listPortfolios).mockImplementationOnce(async () => { await slowList.promise; return { loaded: [], failed: 1 }; });
    authState.user = { ...authState.user! }; // An auth event reruns the cloud load.
    rerender();
    await waitFor(() => expect(listPortfolios).toHaveBeenCalledTimes(2));
    await signInSecondAccount(rerender, () => result.current);
    toast.error.mockClear();
    await act(async () => { slowList.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.extraPortfolios.map((p) => p.id)).toEqual(['p1']);
    await rebuildAllView(() => result.current);
    expect(totals(result.current.allSnapshots)).toEqual([400]);
  });

  // Value: protects=a portfolio switch still reading when the tab's account changes shows the next session no error;
  // fails_when=the overtaken switch's catch shows "Couldn't open this portfolio" on the signed-out screen or to the next account;
  // why_new=the tests above cover the read that opens All portfolios; this is a switch to Personal; seam=none; no_claim=decryption with the next account's key (decode mocked; unit only)
  it('shows no error for a switch still reading when the account changes', async () => {
    const { result, rerender } = await openPersonal();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('personal'); });
    await waitFor(() => expect(db.reads).toBe(before + 1));
    db.hold = null;
    await signInSecondAccount(rerender, () => result.current);
    toast.error.mockClear();
    db.undecryptable = true; // The first account's snapshot doesn't open with the next account's key.
    await act(async () => { slowRead.resolve(); await opening; });
    expect(toast.error).not.toHaveBeenCalled();
  });

  // Value: protects=a switch to All portfolios that an account change overtook while it refreshed the shared portfolios reads nothing for the next account;
  // fails_when=the old switch goes on to read Personal under the next account's session, finds no row, and keeps no shares and no Personal figures as theirs;
  // why_new=the read test above starts its read before the change; here the change lands before the read starts; seam=none; no_claim=the row policy that hides the first account's snapshot (Supabase client mocked; unit only)
  it('reads nothing for the next account from an All portfolios switch overtaken while refreshing', async () => {
    const { result, rerender } = await openPersonal();
    const slowFetch = deferred();
    vi.mocked(fetchPortfolio).mockImplementationOnce(async () => { await slowFetch.promise; return joint(); });
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('all'); });
    await waitFor(() => expect(fetchPortfolio).toHaveBeenCalledTimes(1));
    await signInSecondAccount(rerender, () => result.current);
    db.personal = null; // What a read of the first account's snapshot finds under the next account's session.
    const reads = db.reads;
    await act(async () => { slowFetch.resolve(); await opening; });
    expect(db.reads).toBe(reads);
    db.personal = personalBlob({ p1: 30 });
    await rebuildAllView(() => result.current);
    expect(totals(result.current.allSnapshots)).toEqual([400]);
  });
});

describe('a portfolio list that fails to load', () => {
  // Value: protects=an unsaved edit in a shared portfolio survives a cloud-load rerun whose portfolio list fails (offline, the tab regains focus);
  // fails_when=the failed list runs the cleanup, disposing the portfolio's sync with its unsaved edit, and the view moves to Personal;
  // why_new=no test fails the portfolio list on a rerun; seam=none; no_claim=a real offline browser (list and save mocked; unit only)
  it("keeps a shared portfolio's unsaved edit when the list fails on a reload", async () => {
    const { result, rerender } = await openPersonal();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    // The edit can't save: it stays in the tab.
    vi.mocked(savePortfolio).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { result.current.addMeasurement([{ name: 'House', value: 2000, currency: 'EUR' }]); });
    await waitFor(() => expect(result.current.syncStatus).toBe('error'));
    // The tab regains focus offline: an auth event reruns the cloud load, and the list fails.
    vi.mocked(listPortfolios).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const lists = vi.mocked(listPortfolios).mock.calls.length;
    authState.user = { ...authState.user! };
    rerender();
    await waitFor(() => expect(listPortfolios).toHaveBeenCalledTimes(lists + 1));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(result.current.activePortfolioId).toBe('p1');
    expect(result.current.extraPortfolios.map((p) => p.id)).toEqual(['p1']);
    // Back online, Retry saves the edit.
    await act(async () => { result.current.retrySync(); });
    const saves = vi.mocked(savePortfolio).mock.calls;
    await waitFor(() => expect(saves[saves.length - 1][1].data?.facts.map((f) => f.sourceVl)).toContain(2000));
  });

  // Value: protects=a shared portfolio the user just picked shows its figures when a reload whose list fails overtakes the switch;
  // fails_when=the reload leaves the portfolio open with no data and no error, an empty state whose import would replace its content;
  // why_new=the test above has the portfolio already open; here the switch to it is still reading; seam=none; no_claim=a real offline browser (list and fetch mocked; unit only)
  it('shows a shared portfolio from memory when a reload whose list fails overtakes the switch to it', async () => {
    vi.mocked(listPortfolios).mockImplementation(async () => ({ loaded: [joint(), joint(1, 500, 'p2', 'Company')], failed: 0 }));
    const slowFetch = deferred();
    vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) => {
      if (id !== 'p2') return id === 'p1' ? joint() : null;
      await slowFetch.promise;
      throw new TypeError('Failed to fetch');
    });
    const { result, rerender } = await openPersonal();
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('p2'); });
    await waitFor(() => expect(fetchPortfolio).toHaveBeenCalled());
    // Offline, the tab regains focus before the portfolio arrives.
    vi.mocked(listPortfolios).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await rerunCloudLoad(rerender);
    await act(async () => { slowFetch.resolve(); await opening; });
    expect(result.current.activePortfolioId).toBe('p2');
    expect(result.current.data?.facts.map((f) => f.sourceVl)).toEqual([500]);
  });

  // Value: protects=All portfolios shows its totals when a reload whose list fails overtakes the switch to it;
  // fails_when=the reload leaves the view open with no data;
  // why_new=the test above covers an extra portfolio; All portfolios is built from every portfolio in memory; seam=none; no_claim=a real offline browser (list mocked; unit only)
  it('shows All portfolios when a reload whose list fails overtakes the switch to it', async () => {
    const { result, rerender } = await openPersonal();
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('all'); });
    await waitFor(() => expect(db.reads).toBe(before + 1));
    db.hold = null;
    vi.mocked(listPortfolios).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await rerunCloudLoad(rerender);
    await act(async () => { slowRead.resolve(); await opening; });
    expect(result.current.activePortfolioId).toBe('all');
    await waitFor(() => expect(totals(result.current.allSnapshots)).toEqual([600]));
  });

  // Value: protects=an edit in a shared portfolio saves after an unlock whose portfolio list fails;
  // fails_when=the save finds no portfolio key (the lock dropped it, the failed list didn't bring it back) and asks an unlocked user to unlock, never saving;
  // why_new=no test unlocks with the list failing; seam=none; no_claim=key unwrapping (fetch mocked; unit only)
  it("saves a shared portfolio's edit after an unlock whose list fails", async () => {
    const { result, rerender } = await openPersonal();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    lock(rerender);
    vi.mocked(listPortfolios).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const lists = vi.mocked(listPortfolios).mock.calls.length;
    unlock(rerender);
    await waitFor(() => expect(listPortfolios).toHaveBeenCalledTimes(lists + 1));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(result.current.activePortfolioId).toBe('p1');
    toast.info.mockClear();
    await act(async () => { result.current.addMeasurement([{ name: 'House', value: 2000, currency: 'EUR' }]); });
    const saves = vi.mocked(savePortfolio).mock.calls;
    await waitFor(() => expect(saves[saves.length - 1][1].data?.facts.map((f) => f.sourceVl)).toContain(2000));
    expect(toast.info).not.toHaveBeenCalledWith('Unlock your data to sync this change.', expect.anything());
  });

  // Value: protects=a shared portfolio's unsaved edit survives a lock while the portfolio list loads, and saves after the unlock;
  // fails_when=the list read with the zeroed key counts every portfolio as undecryptable, and the cleanup disposes the sync with its edit; or the load goes on to decrypt Personal with no key;
  // why_new=the account-change test above covers a list that outlives its account; a lock keeps the account; seam=none; no_claim=decryption with a zeroed key (list and decode mocked; unit only)
  it("keeps a shared portfolio's unsaved edit when the tab locks while the list loads", async () => {
    const { result, rerender } = await openPersonal();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    // The edit can't save: it stays in the tab.
    vi.mocked(savePortfolio).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { result.current.addMeasurement([{ name: 'House', value: 2000, currency: 'EUR' }]); });
    await waitFor(() => expect(result.current.syncStatus).toBe('error'));
    await act(async () => { await result.current.switchPortfolio('personal'); });
    // The next list request hangs, then answers as a list read with a zeroed key would.
    const slowList = deferred();
    vi.mocked(listPortfolios).mockImplementationOnce(async () => { await slowList.promise; return { loaded: [], failed: 1 }; });
    await rerunCloudLoad(rerender);
    lock(rerender);
    toast.error.mockClear();
    await act(async () => { slowList.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.extraPortfolios.map((p) => p.id)).toEqual(['p1']);
    // The unlock lists the portfolio again, and its edit saves.
    unlock(rerender);
    const saves = vi.mocked(savePortfolio).mock.calls;
    await waitFor(() => expect(saves[saves.length - 1][1].data?.facts.map((f) => f.sourceVl)).toContain(2000));
  });
});

describe('a lock during a key fetch', () => {
  // Value: protects=a save never encrypts under a portfolio key unwrapped after a lock zeroed the data key mid-fetch (a server could wrap one for the zero key);
  // fails_when=the save adopts the fetched key and writes the portfolio under it, or keeps the key in memory;
  // why_new=the unlock test above has no lock during the save's own key fetch; seam=none; no_claim=key unwrapping (fetch mocked; unit only)
  it('drops the key a save fetched when the tab locked during the fetch', async () => {
    const { result, rerender } = await openJointWithoutKey();
    // The save's key fetch answers only after the tab locked.
    const slowFetch = deferred();
    const fetched = joint();
    vi.mocked(fetchPortfolio).mockImplementationOnce(async () => { await slowFetch.promise; return fetched; });
    const fetches = vi.mocked(fetchPortfolio).mock.calls.length;
    await act(async () => { result.current.addMeasurement([{ name: 'House', value: 2000, currency: 'EUR' }]); });
    await waitFor(() => expect(fetchPortfolio).toHaveBeenCalledTimes(fetches + 1));
    lock(rerender);
    toast.info.mockClear();
    await act(async () => { slowFetch.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(savePortfolio).not.toHaveBeenCalled();
    expect(portfolioKeys.has('p1')).toBe(false);
    expect(fetched.portfolioKey.every((b) => b === 0)).toBe(true);
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Unlock your data to sync this change.', expect.anything()));
  });

  // Value: protects=a save whose key fetch failed because a lock zeroed the data key mid-fetch asks the user to unlock;
  // fails_when=the failed unwrap reads as a sync failure ("Couldn't sync…") instead of a lock;
  // why_new=the test above has the fetch answer; here the unwrap fails, as with an honest server; seam=none; no_claim=key unwrapping (fetch mocked; unit only)
  it('asks to unlock when a lock makes the key fetch for a save fail', async () => {
    const { result, rerender } = await openJointWithoutKey();
    const slowFetch = deferred();
    vi.mocked(fetchPortfolio).mockImplementationOnce(async () => { await slowFetch.promise; throw new Error('authentication tag mismatch'); });
    const fetches = vi.mocked(fetchPortfolio).mock.calls.length;
    await act(async () => { result.current.addMeasurement([{ name: 'House', value: 2000, currency: 'EUR' }]); });
    await waitFor(() => expect(fetchPortfolio).toHaveBeenCalledTimes(fetches + 1));
    lock(rerender);
    toast.info.mockClear();
    toast.error.mockClear();
    await act(async () => { slowFetch.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Unlock your data to sync this change.', expect.anything()));
  });

  // Value: protects=a switch never keeps a portfolio key unwrapped after a lock zeroed the data key mid-fetch, and shows no error over the lock;
  // fails_when=the switch adopts the fetched key, or says "Couldn't open this portfolio";
  // why_new=the tests above cover the save's key fetch; this is the switch's; seam=none; no_claim=key unwrapping (fetch mocked; unit only)
  it('drops the key a switch fetched when the tab locked during the fetch', async () => {
    const { result, rerender } = await openPersonal();
    const slowFetch = deferred();
    const fetched = joint();
    vi.mocked(fetchPortfolio).mockImplementationOnce(async () => { await slowFetch.promise; return fetched; });
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('p1'); });
    await waitFor(() => expect(fetchPortfolio).toHaveBeenCalledTimes(1));
    lock(rerender);
    toast.error.mockClear();
    await act(async () => { slowFetch.resolve(); await opening; });
    expect(portfolioKeys.has('p1')).toBe(false);
    expect(fetched.portfolioKey.every((b) => b === 0)).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('a lock while Personal loads', () => {
  // Value: protects=a lock while a switch reads Personal shows no decryption error and pauses nothing, and Personal opens and takes entries after the unlock;
  // fails_when=the read finds no key and says "Couldn't decrypt your saved data", and the switch adds that Personal failed to load;
  // why_new=the lock tests above lock during a key fetch or the list, never during the personal snapshot read; seam=none; no_claim=decryption with no key (decode mocked; unit only)
  it('shows no error when the tab locks while a switch reads Personal', async () => {
    const { result, rerender } = await openPersonal();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('personal'); });
    await waitFor(() => expect(db.reads).toBe(before + 1));
    db.hold = null;
    lock(rerender);
    toast.error.mockClear();
    await act(async () => { slowRead.resolve(); await opening; });
    expect(toast.error).not.toHaveBeenCalled();
    unlock(rerender);
    await waitFor(() => expect(result.current.data?.facts.map((f) => f.sourceVl)).toEqual([100]));
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(storedValues()).toEqual([100, 150]));
  });

  // Value: protects=a lock while a reload reads Personal shows no decryption error over the lock;
  // fails_when=the reload's read finds no key and says "Couldn't decrypt your saved data. Sign out and back in to retry.";
  // why_new=the test above is a switch; this is the cloud load each auth event reruns; seam=none; no_claim=decryption with no key (decode mocked; unit only)
  it('shows no error when the tab locks while a reload reads Personal', async () => {
    const { result, rerender } = await openPersonal();
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    await rerunCloudLoad(rerender);
    await waitFor(() => expect(db.reads).toBe(before + 1));
    db.hold = null;
    lock(rerender);
    toast.error.mockClear();
    await act(async () => { slowRead.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.data?.facts.map((f) => f.sourceVl)).toEqual([100]);
  });

  // Value: protects=a lock while All portfolios reads Personal shows no error, and the view opens after the unlock;
  // fails_when=the read finds no key and says "Couldn't decrypt your saved data", then the view says Personal couldn't load;
  // why_new=the tests above read Personal to show it; All portfolios reads it for the total; seam=none; no_claim=decryption with no key (decode mocked; unit only)
  it('shows no error when the tab locks while All portfolios reads Personal', async () => {
    const { result, rerender } = await openPersonal();
    const slowRead = deferred();
    db.hold = slowRead.promise;
    const before = db.reads;
    let opening!: Promise<void>;
    act(() => { opening = result.current.switchPortfolio('all'); });
    await waitFor(() => expect(db.reads).toBe(before + 1));
    db.hold = null;
    lock(rerender);
    toast.error.mockClear();
    await act(async () => { slowRead.resolve(); await opening; });
    expect(toast.error).not.toHaveBeenCalled();
    unlock(rerender);
    await waitFor(() => expect(totals(result.current.allSnapshots)).toEqual([600]));
  });
});

describe('a portfolio list that lands after a newer one', () => {
  // Value: protects=an older portfolio list that lands after the newer one an invite ran leaves the portfolios alone, so the joined portfolio keeps its unsaved edit;
  // fails_when=the older list, read before the user joined, runs its cleanup and disposes the joined portfolio's sync with its edit;
  // why_new=the tests above fail or interrupt one list; here two lists overlap and land out of order; seam=none; no_claim=real request timing (list and save mocked; unit only)
  it("keeps a joined portfolio's unsaved edit when an older list lands last", async () => {
    const { result, rerender } = await openPersonal();
    // A reload's list hangs: it was read before the user joined Company.
    const slowList = deferred();
    vi.mocked(listPortfolios).mockImplementationOnce(async () => { await slowList.promise; return { loaded: [joint()], failed: 0 }; });
    await rerunCloudLoad(rerender);
    const company = () => joint(1, 500, 'p2', 'Company');
    vi.mocked(listPortfolios).mockImplementation(async () => ({ loaded: [joint(), company()], failed: 0 }));
    vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) => (id === 'p1' ? joint() : id === 'p2' ? company() : null));
    await act(async () => { await result.current.openJoinedPortfolio('p2'); });
    expect(result.current.activePortfolioId).toBe('p2');
    // The edit can't save yet: it stays in the tab.
    vi.mocked(savePortfolio).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { result.current.addMeasurement([{ name: 'House', value: 700, currency: 'EUR' }]); });
    await waitFor(() => expect(result.current.syncStatus).toBe('error'));
    await act(async () => { slowList.resolve(); await new Promise((r) => setTimeout(r, 0)); });
    expect(result.current.extraPortfolios.map((p) => p.id)).toEqual(['p1', 'p2']);
    await act(async () => { result.current.retrySync(); });
    const saves = vi.mocked(savePortfolio).mock.calls;
    await waitFor(() => expect(saves[saves.length - 1][1].data?.facts.map((f) => f.sourceVl)).toContain(700));
  });
});

describe('a shared portfolio whose content is malformed', () => {
  // Value: protects=a shared portfolio whose decrypted content holds malformed entries or fields can't keep Personal from opening, or itself from being listed, and its sources keep their names;
  // fails_when=normalising a null fact, or coercing an object-valued field, throws inside the list, the cloud load stops there, and Personal refuses every entry as still loading, on every load;
  // why_new=no test feeds the list content that decrypts but isn't the expected shape; seam=none; no_claim=the client that wrote it (list and fetch mocked; unit only)
  it('opens Personal and the portfolio when its content has malformed entries', async () => {
    // A JSON object whose toString isn't a function makes String(), Number() and new Date() throw.
    const unprintable = { toString: null };
    const malformed = (): LoadedPortfolio => {
      const p = joint();
      return {
        ...p,
        content: {
          ...p.content,
          facts: [
            null,
            { date: '2026-01-31', idSource: unprintable, sourceVl: 5, currency: 'EUR' },
            { date: unprintable, idSource: 'House', sourceVl: 7 },
            ...(p.content.facts as unknown[]),
          ],
          refSources: [
            {},
            { idSource: 'Odd', volatType: 5, transferableInDays: { formula: 'A1' }, category: 3 },
            { idSource: 'Flags', volatType: 'Volatile', transferableInDays: 'false', isPaused: 'no' },
            ...(p.content.refSources as unknown[]),
          ],
          goals: [{ id: 'g1', name: 'House deposit', targetAmount: unprintable, targetCurrency: 'EUR', targetDate: '2027-01-01', createdAt: '2026-01-01' }],
        },
      };
    };
    vi.mocked(listPortfolios).mockImplementation(async () => ({ loaded: [malformed()], failed: 0 }));
    vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) => (id === 'p1' ? malformed() : null));
    const { result } = await openPersonal();
    expect(result.current.extraPortfolios.map((p) => p.id)).toEqual(['p1']);
    await act(async () => { result.current.addMeasurement([{ name: 'Savings', value: 150, currency: 'EUR' }]); });
    await waitFor(() => expect(storedValues()).toEqual([100, 150]));
    await act(async () => { await result.current.switchPortfolio('p1'); });
    expect(result.current.data?.facts.map((f) => f.sourceVl)).toEqual([1000]);
    expect(result.current.data?.refSources.map((s) => [s.idSource, s.volatType, s.transferableInDays, s.category, s.isPaused])).toEqual([
      ['Odd', 'Unknown', false, undefined, undefined],
      ['Flags', 'Volatile', false, undefined, undefined],
      ['House', 'Non-volatile', false, undefined, undefined],
    ]);
    expect(result.current.goals).toEqual([]);
  });
});

describe('a key from an older epoch', () => {
  // Value: protects=a key from an older epoch than the tab knows is refused even when the tab holds no key for that portfolio;
  // fails_when=the retired check runs only while a key is held, so a save after a lock adopts the retired key and writes under it at the newer epoch;
  // why_new=the rotation test in PortfolioContext.portfolios.test.tsx holds the new key when the late read lands; seam=none; no_claim=how a retired key reaches a tab holding none (fetch mocked; unit only)
  it('refuses a retired key for a save when the tab holds no key', async () => {
    const atEpoch = (keyEpoch: number, fill: number): LoadedPortfolio => {
      const p = joint(keyEpoch);
      return { ...p, meta: { ...p.meta, keyEpoch }, portfolioKey: new Uint8Array(32).fill(fill) };
    };
    vi.mocked(listPortfolios).mockImplementation(async () => ({ loaded: [atEpoch(2, 7)], failed: 0 }));
    vi.mocked(fetchPortfolio).mockImplementation(async (_c, _u, _dk, id) => (id === 'p1' ? atEpoch(2, 7) : null));
    const { result } = await openJointWithoutKey();
    const retired = atEpoch(1, 3);
    vi.mocked(fetchPortfolio).mockImplementation(async () => retired);
    await act(async () => { result.current.addMeasurement([{ name: 'House', value: 2000, currency: 'EUR' }]); });
    await waitFor(() => expect(retired.portfolioKey.every((b) => b === 0)).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(savePortfolio).not.toHaveBeenCalled();
    expect(portfolioKeys.has('p1')).toBe(false);
  });
});

describe('a lock or an account change while a key is made or used', () => {
  // Value: protects=a version restore that a lock interrupted applies nothing it read, since it read with keys the lock zeroed;
  // fails_when=the restore applies the version it read, and the unlock then saves it as the portfolio's content;
  // why_new=the lock tests above cover key fetches for saves, switches and syncs, not the restore's own read; seam=none; no_claim=decryption with zeroed keys (openRevision mocked; unit only)
  it('applies nothing from a version restore a lock interrupted', async () => {
    const { result, rerender } = await openPersonal();
    await act(async () => { await result.current.switchPortfolio('p1'); });
    const slowRevision = deferred();
    vi.mocked(openRevision).mockImplementationOnce(async () => {
      await slowRevision.promise;
      return { facts: [{ date: '2026-01-31', idSource: 'House', sourceVl: 666, currency: 'EUR' }], refSources: [], goals: [] };
    });
    let restoring!: Promise<boolean>;
    act(() => { restoring = result.current.restorePortfolioVersion('p1', 1); });
    await waitFor(() => expect(openRevision).toHaveBeenCalledTimes(1));
    lock(rerender);
    toast.error.mockClear();
    let ok = true;
    await act(async () => { slowRevision.resolve(); ok = await restoring; });
    expect(ok).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.data?.facts.map((f) => f.sourceVl)).toEqual([1000]);
    unlock(rerender);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(vi.mocked(savePortfolio).mock.calls.some(([, { data }]) => data?.facts.some((f) => f.sourceVl === 666))).toBe(false);
  });

  // Value: protects=the key of a portfolio created while the tab locked never outlives the lock, and the create still counts as done;
  // fails_when=the create installs the new key and portfolio in the tab after the lock cleared every key;
  // why_new=no test locks during a create; seam=none; no_claim=the server-side create (create mocked; unit only)
  it('drops the key of a portfolio created while the tab locked', async () => {
    const { result, rerender } = await openPersonal();
    const slowCreate = deferred();
    const created = joint(1, 0, 'p2', 'Company');
    vi.mocked(createPortfolioRemote).mockImplementationOnce(async () => { await slowCreate.promise; return created; });
    let creating!: Promise<boolean>;
    act(() => { creating = result.current.createPortfolio('Company'); });
    await waitFor(() => expect(createPortfolioRemote).toHaveBeenCalledTimes(1));
    lock(rerender);
    let ok = false;
    await act(async () => { slowCreate.resolve(); ok = await creating; });
    expect(ok).toBe(true);
    expect(portfolioKeys.has('p2')).toBe(false);
    expect(created.portfolioKey.every((b) => b === 0)).toBe(true);
  });

  // Value: protects=a portfolio the first account created while another account signed in never shows up in the next account's session;
  // fails_when=the create's continuation installs the first account's portfolio in the next session, switches to it and says access is gone;
  // why_new=the test above keeps the account; seam=none; no_claim=the server-side create or its row policy (create and fetch mocked; unit only)
  it('leaves the next account alone when a create finishes after an account change', async () => {
    const { result, rerender } = await openPersonal();
    const slowCreate = deferred();
    const created = joint(1, 0, 'p2', 'Company');
    vi.mocked(createPortfolioRemote).mockImplementationOnce(async () => { await slowCreate.promise; return created; });
    let creating!: Promise<boolean>;
    act(() => { creating = result.current.createPortfolio('Company'); });
    await waitFor(() => expect(createPortfolioRemote).toHaveBeenCalledTimes(1));
    await signInSecondAccount(rerender, () => result.current);
    toast.error.mockClear();
    let ok = true;
    await act(async () => { slowCreate.resolve(); ok = await creating; });
    expect(ok).toBe(false);
    expect(result.current.activePortfolioId).toBe('all');
    expect(result.current.extraPortfolios.map((p) => p.id)).toEqual(['p1']);
    expect(portfolioKeys.has('p2')).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  // Value: protects=the new key of a rotation that a lock interrupted never outlives the lock;
  // fails_when=the rotate handler installs the new key after the lock cleared every key;
  // why_new=the lock tests above cover keys a fetch unwrapped, not a key a rotation made; seam=none; no_claim=the server-side rotation (rotation mocked; unit only)
  it('drops the new key of a rotation the tab locked during', async () => {
    const { result, rerender } = await openPersonal();
    const slowRotation = deferred();
    const newKey = new Uint8Array(32).fill(9);
    vi.mocked(rotatePortfolioKey).mockImplementationOnce(async () => {
      await slowRotation.promise;
      return { outcome: { status: 'ok', revision: 2, keyEpoch: 2 }, portfolioKey: newKey };
    });
    let removing!: Promise<boolean>;
    act(() => { removing = result.current.removePartner('p1', 'u2'); });
    await waitFor(() => expect(rotatePortfolioKey).toHaveBeenCalledTimes(1));
    lock(rerender);
    await act(async () => { slowRotation.resolve(); await removing; });
    expect(portfolioKeys.has('p1')).toBe(false);
    expect(newKey.every((b) => b === 0)).toBe(true);
  });
});
