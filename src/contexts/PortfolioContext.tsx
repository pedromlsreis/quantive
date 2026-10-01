import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { PortfolioData, EnrichedFact, FilterState, Snapshot, KPIData, FactRow, RefSource, Goal } from '@/lib/types';
import { generateMockData } from '@/lib/mockData';
import { toast } from 'sonner';
import { formatDate } from '@/lib/formatters';
import { analytics } from '@/lib/analytics';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useKeySession } from './KeySessionContext';
import { devPlanOverride } from '@/hooks/useEntitlements';
import { planHas, resolvePlanForStatus } from '@/lib/billing/plans';
import { sanitizeSourceName } from '@/lib/utils';
import {
  attemptCloudSync,
  decodeSnapshot,
  upsertEncryptedSnapshot,
  type SnapshotRow,
} from '@/lib/cloudSync';
import { useCurrency, type CurrencyCode } from './CurrencyContext';
import { useFxRates } from '@/hooks/useFxRates';
import { coerceCurrency } from '@/lib/fxConvert';
import { clearAttribution } from '@/lib/analytics';
import {
  MAX_EXTRA_PORTFOLIOS,
  PERSONAL_PORTFOLIO_ID,
  PERSONAL_PORTFOLIO_NAME,
  PortfolioLimitError,
  createPortfolio as createPortfolioRemote,
  deletePortfolio as deletePortfolioRemote,
  fetchPortfolio,
  listPortfolios,
  openRevision,
  portfolioNameTaken,
  rotatePortfolioKey,
  sanitizePortfolioName,
  savePortfolio,
  type ExtraPortfolioMeta,
  type LoadedPortfolio,
  type SaveOutcome,
} from '@/lib/portfolios';
import {
  applyOp,
  type GoalPatch,
  type NewEntry,
  type OpResult,
  type PortfolioOp,
  type SourcePatch,
} from '@/lib/portfolioOps';
import { PortfolioSync, type RotateOutcome, type SyncDoc, type SyncState } from '@/lib/portfolioSync';
import { removeMember } from '@/lib/portfolioSharing';

const STORAGE_KEY = 'portfolio-data';
const MOCK_FLAG_KEY = 'portfolio-data-is-mock'; // Track ephemeral mock data
// Per-user / cross-user client caches wiped by the user-id watcher on
// sign-out and account-switch. Mirrors the encryption.md §8.3 contract:
// nothing user-tied survives an identity transition in this browser.
const ADD_MEASUREMENT_DRAFT_KEY = 'add-measurement-draft';
const CUSTOM_MILESTONES_KEY = 'portfolio-custom-milestones';
const RECOVERY_OFFERED_PREFIX = 'recovery-offered:';
const ONBOARDING_DISMISSED_PREFIX = 'onboarding-dismissed:';
// The portfolio a signed-in user last had open. Holds an id, not data, but
// it is keyed to the user, so the watcher wipes it like the others.
const ACTIVE_PORTFOLIO_PREFIX = 'active-portfolio:';

function readActivePortfolioId(userId: string): string | null {
  try { return localStorage.getItem(`${ACTIVE_PORTFOLIO_PREFIX}${userId}`); } catch { return null; }
}

function writeActivePortfolioId(userId: string, portfolioId: string): void {
  try { localStorage.setItem(`${ACTIVE_PORTFOLIO_PREFIX}${userId}`, portfolioId); } catch { /* storage unavailable */ }
}

// How often returning to the tab may refetch an extra portfolio.
const FOCUS_REFRESH_INTERVAL_MS = 15_000;

/**
 * Why an extra portfolio takes no edits. Without Family it stays readable
 * and exportable as CSV: an owned one needs the owner's own plan
 * ('needs_family'), a joined one needs the owner's plan to still cover this
 * partner ('owner_needs_family'). Client-side, like every plan gate; the
 * server blocks new invites (has_family).
 */
export type ReadOnlyReason = 'needs_family' | 'owner_needs_family';

/** What the signed-in user's plan allows, or null until check-subscription answers. */
type FamilyAccess = { userId: string; ownsFamily: boolean; coveredAsPartner: boolean } | null;

function readOnlyReason(meta: ExtraPortfolioMeta | undefined, access: FamilyAccess): ReadOnlyReason | null {
  if (!meta || !access) return null;
  if (meta.ownerId === access.userId) return access.ownsFamily ? null : 'needs_family';
  return access.coveredAsPartner ? null : 'owner_needs_family';
}

export const READ_ONLY_MESSAGES: Record<ReadOnlyReason, string> = {
  needs_family: 'Editing this portfolio needs the Family plan. You can still view it and export it as CSV.',
  owner_needs_family: "The Family plan that shares this portfolio has ended, so it's read-only. You can still view it and export it as CSV.",
};

/** An extra-portfolio write needs keys that a lock has zeroed. */
class PortfolioLockedError extends Error {
  constructor() {
    super('portfolio keys are locked');
    this.name = 'PortfolioLockedError';
  }
}

/**
 * Safely parse a date value, returning null for invalid dates.
 * Prevents silent NaN dates from cloud/localStorage.
 */
function safeDate(val: unknown): Date | null {
  // Extra portfolios store calendar days (portfolios.ts encodeContent), which
  // `new Date` would read as UTC midnight.
  const day = typeof val === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(val) : null;
  const d = day
    ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    : val instanceof Date ? val : new Date(val as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse date and warn on invalid — returns Date or null.
 */
function safeDateWithWarning(val: unknown, context: string, index: number): Date | null {
  const d = safeDate(val);
  if (!d) {
    console.debug(`[${context}] Skipping fact #${index}: invalid date "${String(val)}"`);
  }
  return d;
}

/** The shape we expect a snapshot's parsed JSON to have. Validated lazily — facts/refSources are arrays of unknown until normalised. */
type RawCloudPortfolio = {
  facts: Array<Record<string, unknown>>;
  refSources: RefSource[];
  /** Optional in legacy blobs — see `coerceGoals` for normalisation. */
  goals?: unknown;
};

/**
 * Defensive normaliser for the goals array on a freshly-decoded snapshot.
 * Treats anything malformed as an empty list rather than throwing, so a
 * single corrupt goal entry can't black-hole the whole portfolio load.
 */
function coerceGoals(value: unknown): Goal[] {
  if (!Array.isArray(value)) return [];
  const out: Goal[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : null;
    const name = typeof r.name === 'string' ? r.name : null;
    const targetAmount = typeof r.targetAmount === 'number' ? r.targetAmount : Number(r.targetAmount);
    const targetCurrency = coerceCurrency(r.targetCurrency);
    const targetDate = typeof r.targetDate === 'string' ? r.targetDate : null;
    const createdAt = typeof r.createdAt === 'string' ? r.createdAt : null;
    if (!id || !name || !targetDate || !createdAt) continue;
    if (!Number.isFinite(targetAmount)) continue;
    const archivedAt = typeof r.archivedAt === 'string' ? r.archivedAt : undefined;
    out.push({ id, name, targetAmount, targetCurrency, targetDate, createdAt, archivedAt });
  }
  return out;
}

/**
 * Validated facts, sources and goals from a decoded blob. Facts with an
 * invalid date are dropped and counted.
 */
function normalisePortfolio(raw: Partial<RawCloudPortfolio>, context: string): { data: PortfolioData; skipped: number } {
  const rawFacts = Array.isArray(raw.facts) ? raw.facts : [];
  const facts = rawFacts
    .map((f, i): FactRow | null => {
      const date = safeDateWithWarning(f.date, context, i);
      if (!date) return null;
      return {
        date,
        idSource: String(f.idSource ?? ''),
        sourceVl: Number(f.sourceVl ?? 0),
        currency: coerceCurrency(f.currency),
      };
    })
    .filter((f): f is FactRow => f !== null);
  return {
    data: {
      facts,
      refSources: Array.isArray(raw.refSources) ? raw.refSources : [],
      goals: coerceGoals(raw.goals),
    },
    skipped: rawFacts.length - facts.length,
  };
}

/** An extra portfolio's content, or null while it is still empty (the dashboard then shows its first-entry state). */
function extraPortfolioData(content: Record<string, unknown>): PortfolioData | null {
  const { data } = normalisePortfolio(content as Partial<RawCloudPortfolio>, 'portfolio-load');
  const empty = data.facts.length === 0 && data.refSources.length === 0 && data.goals.length === 0;
  return empty ? null : data;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'synced';

interface PortfolioContextType {
  data: PortfolioData | null;
  enrichedFacts: EnrichedFact[];
  filters: FilterState;
  updateFilters: (partial: Partial<FilterState>) => void;
  snapshots: Snapshot[];
  kpis: KPIData;
  allSources: string[];
  allVolatTypes: string[];
  dateRange: [Date, Date] | null;
  loadFile: (file: File) => Promise<void>;
  loadMockData: () => void;
  clearData: () => void;
  addMeasurement: (entries: NewEntry[], opts?: { date?: Date }) => void;
  /**
   * Patch the value and/or currency of a single measurement, identified by
   * its (date, idSource) composite key. Idempotent: if no matching fact
   * exists the call is a silent no-op. If multiple facts share the key
   * (legacy duplicates from spreadsheet imports), all matches are updated
   * to the same patched values — they were already indistinguishable.
   * Re-encrypts and syncs through the existing cloud-save path.
   */
  updateMeasurement: (
    date: Date,
    idSource: string,
    patch: { sourceVl?: number; currency?: CurrencyCode },
  ) => void;
  /**
   * Hard-delete every fact matching the (date, idSource) composite key.
   * Idempotent. Re-encrypts and syncs. Does not touch refSources — a source
   * with no remaining facts stays in the metadata table; lifecycle of
   * refSources is a separate concern (see the "Rename, merge, archive
   * sources" wishlist item).
   */
  deleteMeasurement: (date: Date, idSource: string) => void;
  updateRefSource: (idSource: string, patch: SourcePatch) => void;
  /**
   * Rename a source across the portfolio. Rewrites the `refSource` entry and
   * every `fact` whose `idSource` matches, then re-encrypts and syncs. The
   * new name is run through `sanitizeSourceName` (trim, collapse whitespace,
   * 100-char cap, reject control chars). No-op if the new name resolves to
   * the same trimmed value as the current one. If a different source already
   * uses the new name (case-insensitive), the call is rejected with a toast
   * — there's no merge UI yet, and silently collapsing two sources would
   * lose user intent.
   */
  renameSource: (oldId: string, newName: string) => void;
  isLoading: boolean;
  isMockData: boolean;
  syncStatus: SyncStatus;
  retrySync: () => void;
  /** All snapshots, unaffected by date-range filter — used by NetWorthChart for its own period selector. */
  allSnapshots: Snapshot[];
  /** Maps source name → currency of that source's most recent fact. Used by the modal to default new measurements to the same currency. */
  lastCurrencyBySource: Map<string, CurrencyCode>;
  /**
   * Active (non-archived) goals, sorted by `createdAt` ascending. Stored
   * inside the encrypted portfolio blob — `[]` when there's no data yet or
   * the legacy blob has no `goals` field.
   */
  goals: Goal[];
  /** Persist a new goal. Generates the id and createdAt. */
  addGoal: (input: { name: string; targetAmount: number; targetCurrency: CurrencyCode; targetDate: string }) => Goal;
  /** Patch an existing goal in place (e.g. rename, retarget). Silently no-ops if the id is unknown. */
  updateGoal: (id: string, patch: GoalPatch) => void;
  /** Soft-delete: stamps `archivedAt`. Archived goals don't surface on the goals page but stay in the blob. */
  archiveGoal: (id: string) => void;
  /**
   * The portfolio on screen: PERSONAL_PORTFOLIO_ID, or the id of an extra
   * portfolio (Family). Every read and mutation above applies to it.
   */
  activePortfolioId: string;
  activePortfolioName: string;
  /** Extra portfolios the user can open, oldest first. Empty without Family. */
  extraPortfolios: ExtraPortfolioMeta[];
  switchPortfolio: (portfolioId: string) => Promise<void>;
  /** Creates an extra portfolio and opens it. Resolves false (after a toast) on failure. */
  createPortfolio: (name: string) => Promise<boolean>;
  renamePortfolio: (portfolioId: string, name: string) => Promise<boolean>;
  /** Owner only. Deletes the portfolio and every entry in it. */
  deletePortfolio: (portfolioId: string) => Promise<boolean>;
  /** After accepting an invite: loads the joined portfolio and opens it. */
  openJoinedPortfolio: (portfolioId: string) => Promise<boolean>;
  /** Partner only. Leaves a portfolio shared with them. */
  leavePortfolio: (portfolioId: string) => Promise<boolean>;
  /** Owner only. Removes the partner and re-encrypts under a new key. */
  removePartner: (portfolioId: string, partnerId: string) => Promise<boolean>;
  /** Saves an earlier version (portfolio_revisions) as the current one. */
  restorePortfolioVersion: (portfolioId: string, revision: number) => Promise<boolean>;
  /** Why the portfolio on screen takes no edits, or null when it does. Edits are refused with a toast. */
  readOnlyReason: ReadOnlyReason | null;
}

const defaultFilters: FilterState = {
  dateRange: [null, null],
  sources: [],
  volatTypes: [],
  liquidFilter: 'all',
};

const defaultKpis: KPIData = {
  currentNetWorth: 0,
  momChange: 0,
  yoyChange: 0,
  yoyNetWorth: 0,
  sourceCount: 0,
  volatilityDataAvailable: false,
  volatilePercent: 0,
  liquidPercent: 0,
};

const PortfolioContext = createContext<PortfolioContextType | null>(null);

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}

function findClosestSnapshot(snapshots: Snapshot[], targetDate: Date, exclude?: Snapshot): Snapshot | null {
  if (snapshots.length === 0) return null;
  let closest: Snapshot | null = null;
  let minDiff = Infinity;

  for (const s of snapshots) {
    if (exclude && s.date.getTime() === exclude.date.getTime()) continue;
    const diff = Math.abs(s.date.getTime() - targetDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closest = s;
    }
  }

  if (!closest || minDiff > 45 * 24 * 60 * 60 * 1000) return null;
  return closest;
}

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, subscription, subscriptionChecked } = useAuth();
  const [data, setData] = useState<PortfolioData | null>(null);
  // The same value, readable synchronously: each edit applies to the latest
  // data even when several land before a render.
  const dataRef = useRef<PortfolioData | null>(null);
  const commitData = useCallback((next: PortfolioData | null) => {
    dataRef.current = next;
    setData(next);
  }, []);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [isLoading, setIsLoading] = useState(false);
  // True while we're awaiting the first cloud snapshot for the current user.
  // Seeded true when a session might still resolve to an authed user (auth
  // restore in progress, or user already present at mount), so the dashboard
  // shows the skeleton on F5 instead of flashing "upload your file" before
  // cloud-load resolves. Also flipped true on guest → authed sign-in (see the
  // user-id watcher below) so stale guest preview / mock data can't leak past
  // login. The cloud-load effect clears it on success/error/no-user.
  const [isCloudLoading, setIsCloudLoading] = useState<boolean>(() => !!user || authLoading);
  const [isMockData, setIsMockData] = useState(false);

  const [activePortfolioId, setActivePortfolioId] = useState<string>(PERSONAL_PORTFOLIO_ID);
  const [extraPortfolios, setExtraPortfolios] = useState<ExtraPortfolioMeta[]>([]);
  // Mirrors for callbacks that run after a render (saves, conflict reloads),
  // so they read the current portfolio rather than the one they closed over.
  const activePortfolioIdRef = useRef<string>(PERSONAL_PORTFOLIO_ID);
  const extraMetaRef = useRef(new Map<string, ExtraPortfolioMeta>());
  const syncsRef = useRef(new Map<string, PortfolioSync>());
  const switchPortfolioRef = useRef<(portfolioId: string) => Promise<void>>(async () => {});
  // Bumped by every load and switch; a load that finishes after a newer one started is dropped.
  const loadSeqRef = useRef(0);
  const goalCrossedRef = useRef<Set<string>>(new Set());

  // The retired milestones panel stored user-set thresholds in plaintext for
  // signed-in users and nothing wiped them on tab close. Drop any leftover.
  useEffect(() => {
    try { localStorage.removeItem(CUSTOM_MILESTONES_KEY); } catch { /* storage unavailable */ }
  }, []);

  // Render-time identity guard. The useEffect-based watcher below cleans up
  // localStorage + analytics on sign-out / account-switch, but effects run
  // *after* the render commits — leaving a one-frame window where consumers
  // see the new `user` paired with the previous user's `data`. On a slow
  // mobile JS thread that window is long enough to render a stale dashboard
  // before the watcher fires. This conditional setState during render is
  // React's documented "reset state when a prop changes" pattern: when the
  // identity differs, React throws away this render and immediately re-runs
  // it with the cleared state, so the stale combination is never observable.
  const [lastSeenUserId, setLastSeenUserId] = useState<string | null>(user?.id ?? null);
  if (lastSeenUserId !== (user?.id ?? null)) {
    setLastSeenUserId(user?.id ?? null);
    dataRef.current = null;
    setData(null);
    setIsMockData(false);
    setFilters(defaultFilters);
    setActivePortfolioId(PERSONAL_PORTFOLIO_ID);
    setExtraPortfolios([]);
    // Arm the skeleton if we're entering an authed identity (a real cloud
    // fetch is about to happen). On sign-out (user → null) we leave it false
    // so the dashboard can fall through to the file-upload empty state.
    setIsCloudLoading(user != null);
  }

  // Inline entitlement read for `history.full`. We cannot call useEntitlements
  // here because it itself depends on usePortfolio (for the demo isMockData
  // short-circuit), and PortfolioProvider's own render is the first time the
  // PortfolioContext value exists — calling useEntitlements at this site would
  // recurse into a null context. Mirrors useEntitlements semantics: demo data
  // unlocks everything, dev override wins over the real plan.
  const keySession = useKeySession();
  // Stable callbacks (useCallback with no deps), safe in dependency arrays.
  const { getDataKey, getPortfolioKey, setPortfolioKey, forgetPortfolioKey } = keySession;
  const { currency: displayCurrency } = useCurrency();
  // Each fact carries its own `currency`. We convert per fact at the rate
  // valid on its snapshot date — historical values use historical rates,
  // not today's. Missing rates surface as NaN and render as "—" via the
  // formatters.
  const { convertAt: fxConvertAt } = useFxRates();

  // Track pending cloud save when email is not yet confirmed
  const pendingCloudSaveRef = useRef<PortfolioData | null>(null);
  // Last attempted payload — held for manual retry after a sync failure
  const lastAttemptRef = useRef<PortfolioData | null>(null);
  // Monotonically increasing id; only the latest in-flight call mutates state.
  // Stops overlapping saves from clobbering each other's status.
  const requestIdRef = useRef(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  const hasFullHistory = useMemo(() => {
    const override = devPlanOverride();
    const plan = override ?? resolvePlanForStatus(subscription);
    // Match useEntitlements:
    //   - dev override wins over demo unlock (Playwright Free-tier specs);
    //   - demo unlock only applies to unauthed sessions (signed-in Free users
    //     who load demo data don't get Pro entitlements over their demo view).
    if (override) return planHas(plan, 'history.full');
    if (isMockData && !user) return true;
    return planHas(plan, 'history.full');
  }, [isMockData, user, subscription]);

  // Until check-subscription answers for this user, nothing is read-only,
  // so a Family portfolio never flashes read-only while it loads.
  const familyAccess = useMemo<FamilyAccess>(() => {
    if (!user || !subscriptionChecked) return null;
    const plan = devPlanOverride() ?? resolvePlanForStatus(subscription);
    return { userId: user.id, ownsFamily: planHas(plan, 'portfolios.multiple'), coveredAsPartner: subscription.familyMember };
  }, [user, subscriptionChecked, subscription]);
  const familyAccessRef = useRef(familyAccess);
  useEffect(() => { familyAccessRef.current = familyAccess; }, [familyAccess]);
  // Refuses an edit to a read-only portfolio, with a toast. True when refused.
  const refuseReadOnly = useCallback((portfolioId: string): boolean => {
    const reason = readOnlyReason(extraMetaRef.current.get(portfolioId), familyAccessRef.current);
    if (reason) toast.error(READ_ONLY_MESSAGES[reason]);
    return reason !== null;
  }, []);
  const setDefaultDateRange = useCallback((parsed: PortfolioData) => {
    const dates = parsed.facts.map(f => f.date.getTime());
    if (dates.length === 0) return;
    const maxDate = new Date(Math.max(...dates));
    // Free tier: default window is the rolling 12 months. Pro: 2 years.
    const lookbackMonths = hasFullHistory ? 24 : 12;
    const defaultStart = new Date(maxDate);
    defaultStart.setMonth(defaultStart.getMonth() - lookbackMonths);
    const minDate = new Date(Math.min(...dates));
    setFilters(prev => ({
      ...prev,
      dateRange: [defaultStart < minDate ? minDate : defaultStart, maxDate],
    }));
  }, [hasFullHistory]);

  // Clamp the active filter when entitlements change (e.g. logout, downgrade)
  // so a previously Pro user doesn't keep seeing older data.
  useEffect(() => {
    if (hasFullHistory) return;
    const floor = new Date();
    floor.setMonth(floor.getMonth() - 12);
    floor.setHours(0, 0, 0, 0);
    setFilters(prev => {
      if (!prev.dateRange[0] || prev.dateRange[0] >= floor) return prev;
      return { ...prev, dateRange: [floor, prev.dateRange[1]] };
    });
  }, [hasFullHistory]);

  // Wipe every user-tied client cache when the auth user changes. Mirrors
  // the KeySessionContext pattern (KeySessionContext.tsx:151-161). Owning
  // the cleanup here means every sign-out path inherits it — UI surfaces
  // (ProfileMenu, RequireUnlock, SettingsPage delete-account) no longer
  // need to remember to call clearData() before signOut().
  //
  // Fires on: signed-in → signed-out, account A → account B. Does NOT fire
  // on first mount or on identity-stable rerenders.
  const previousUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    const previousUserId = previousUserIdRef.current;
    if (previousUserId !== null && previousUserId !== currentUserId) {
      dataRef.current = null;
      setData(null);
      setIsMockData(false);
      setFilters(defaultFilters);
      lastAttemptRef.current = null;
      pendingCloudSaveRef.current = null;
      // Invalidate any in-flight cloud save so its callback can't re-write status.
      requestIdRef.current += 1;
      setSyncStatus('idle');
      // Portfolio keys are zeroed by KeySessionContext; drop what refers to them.
      loadSeqRef.current += 1;
      activePortfolioIdRef.current = PERSONAL_PORTFOLIO_ID;
      extraMetaRef.current.clear();
      syncsRef.current.forEach((sync) => sync.dispose());
      syncsRef.current.clear();
      goalCrossedRef.current = new Set();
      setActivePortfolioId(PERSONAL_PORTFOLIO_ID);
      setExtraPortfolios([]);
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(MOCK_FLAG_KEY);
        localStorage.removeItem(ADD_MEASUREMENT_DRAFT_KEY);
        localStorage.removeItem(CUSTOM_MILESTONES_KEY);
        localStorage.removeItem(`${RECOVERY_OFFERED_PREFIX}${previousUserId}`);
        localStorage.removeItem(`${ONBOARDING_DISMISSED_PREFIX}${previousUserId}`);
        localStorage.removeItem(`${ACTIVE_PORTFOLIO_PREFIX}${previousUserId}`);
        // Set by AuthContext's welcome-email effect; per tab, but still keyed to the previous user.
        sessionStorage.removeItem(`welcome-invoked:${previousUserId}`);
        clearAttribution();
      } catch {
        // Storage unavailable; nothing to clean up.
      }
      // Switching into another authed identity → arm the skeleton until that
      // user's cloud snapshot resolves.
      if (currentUserId !== null) setIsCloudLoading(true);
    } else if (previousUserId === null && currentUserId !== null) {
      // Guest → authed sign-in. Drop any guest preview (mock data, or a
      // localStorage cache loaded before login) so the dashboard can't render
      // it while we fetch the real cloud snapshot. Without this the user sees
      // stale numbers on every login until they F5.
      dataRef.current = null;
      setData(null);
      setIsMockData(false);
      setFilters(defaultFilters);
      setIsCloudLoading(true);
      // Also drop any guest-era plaintext caches that the modal/dashboard
      // could otherwise replay into the newly-authed session. The
      // identity-change branch above handles A→B and A→null; this branch
      // closes the null→A case for the same hygiene contract.
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(MOCK_FLAG_KEY);
        localStorage.removeItem(ADD_MEASUREMENT_DRAFT_KEY);
      } catch {
        // Storage unavailable; nothing to clean up.
      }
    }
    previousUserIdRef.current = currentUserId;
  }, [user?.id]);

  // Defence-in-depth for tab-close without explicit sign-out. JS gives no
  // guarantee here, but raises the bar against another user opening the
  // browser and seeing the previous tab's plaintext cache. Guests keep
  // their cache (offline-first ergonomics); only authed-user keys go.
  useEffect(() => {
    if (!user) return;
    const handler = () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(MOCK_FLAG_KEY);
        localStorage.removeItem(ADD_MEASUREMENT_DRAFT_KEY);
      } catch {
        // ignore
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [user]);

  // ── Extra portfolios (Family) ───────────────────────────────────────────
  //
  // The personal portfolio keeps the portfolio_snapshots path. Extra ones are
  // listed at unlock (their names are inside the ciphertext) and each gets a
  // PortfolioSync, which queues edits as ops, saves them one write at a time
  // and replays them when a partner or another device saved first. See
  // docs/security/encryption.md §9.3, src/lib/portfolios.ts and
  // src/lib/portfolioSync.ts.

  const putExtraMeta = useCallback((meta: ExtraPortfolioMeta) => {
    extraMetaRef.current.set(meta.id, meta);
    setExtraPortfolios(Array.from(extraMetaRef.current.values()));
  }, []);

  const removeExtra = useCallback((portfolioId: string) => {
    extraMetaRef.current.delete(portfolioId);
    syncsRef.current.get(portfolioId)?.dispose();
    syncsRef.current.delete(portfolioId);
    forgetPortfolioKey(portfolioId);
    setExtraPortfolios(Array.from(extraMetaRef.current.values()));
  }, [forgetPortfolioKey]);

  // Keep the key already in memory unless the epoch moved: a save in flight
  // may still be encrypting with it, and replacing it would zero it.
  const adoptPortfolioKey = useCallback((loaded: LoadedPortfolio) => {
    const known = extraMetaRef.current.get(loaded.meta.id);
    if (getPortfolioKey(loaded.meta.id) && known?.keyEpoch === loaded.meta.keyEpoch) {
      loaded.portfolioKey.fill(0);
    } else {
      setPortfolioKey(loaded.meta.id, loaded.portfolioKey);
    }
  }, [getPortfolioKey, setPortfolioKey]);

  const activate = useCallback((portfolioId: string) => {
    activePortfolioIdRef.current = portfolioId;
    setActivePortfolioId(portfolioId);
    if (user) writeActivePortfolioId(user.id, portfolioId);
  }, [user]);

  const applyLoadedData = useCallback((next: PortfolioData) => {
    commitData(next);
    setIsMockData(false);
    setDefaultDateRange(next);
  }, [commitData, setDefaultDateRange]);

  // Fetch and decode the personal snapshot. null when there is none, when it
  // can't be decrypted (a toast says so), or when it holds no valid facts.
  // Authed users: cloud is the source of truth post-decode; nothing is
  // mirrored into localStorage (see encryption.md §8.6).
  const loadPersonalData = useCallback(async (userId: string): Promise<PortfolioData | null> => {
    const { data: rows } = await supabase
      .from('portfolio_snapshots')
      .select('data, encrypted_data, nonce, enc_version')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (!rows || rows.length === 0) return null;

    const row = rows[0] as unknown as SnapshotRow;
    let cloudData: RawCloudPortfolio;
    try {
      const decoded = await decodeSnapshot(row, { userId, dataKey: getDataKey() });
      cloudData = decoded.data as RawCloudPortfolio;
    } catch (e) {
      console.error('[cloud-load] failed to decode snapshot:', e);
      toast.error("Couldn't decrypt your saved data. Sign out and back in to retry.");
      return null;
    }

    const { data: validData, skipped } = normalisePortfolio(cloudData, 'cloud-load');
    if (skipped > 0) {
      console.debug(`[cloud-load] Skipped ${skipped}/${validData.facts.length + skipped} facts with invalid dates`);
      toast.warning(`${skipped} ${skipped > 1 ? 'rows' : 'row'} had an invalid date and ${skipped > 1 ? 'were' : 'was'} skipped.`, {
        id: 'cloud-date-warning',
      });
    }
    if (validData.facts.length === 0) {
      console.debug('[cloud-load] No valid facts after date validation — skipping cloud data');
      return null;
    }
    return validData;
  }, [getDataKey]);

  // Callbacks a sync makes after renders; each reaches the current state
  // through syncHandlersRef, like the savers did before.
  const syncHandlers = useMemo(() => {
    const requireKeys = () => {
      const dk = getDataKey();
      if (!user || !dk) throw new PortfolioLockedError();
      return { userId: user.id, dk };
    };
    return {
      save: async (portfolioId: string, meta: ExtraPortfolioMeta, next: PortfolioData | null): Promise<SaveOutcome> => {
        const portfolioKey = getPortfolioKey(portfolioId);
        if (!portfolioKey) throw new PortfolioLockedError();
        return savePortfolio(supabase, { meta, portfolioKey, data: next });
      },
      rotate: async (portfolioId: string, meta: ExtraPortfolioMeta, next: PortfolioData | null): Promise<RotateOutcome> => {
        const { userId, dk } = requireKeys();
        const { outcome, portfolioKey } = await rotatePortfolioKey(supabase, { meta, userId, dataKey: dk, data: next });
        if (outcome.status === 'ok' && portfolioKey) setPortfolioKey(portfolioId, portfolioKey);
        return outcome;
      },
      fetch: async (portfolioId: string): Promise<SyncDoc | null> => {
        const { userId, dk } = requireKeys();
        const loaded = await fetchPortfolio(supabase, userId, dk, portfolioId);
        if (!loaded) return null;
        adoptPortfolioKey(loaded);
        return { meta: loaded.meta, data: extraPortfolioData(loaded.content) };
      },
      onView: (portfolioId: string, doc: SyncDoc) => {
        putExtraMeta(doc.meta);
        if (activePortfolioIdRef.current !== portfolioId) return;
        commitData(doc.data);
        if (doc.data) setDefaultDateRange(doc.data);
      },
      onSaved: (_portfolioId: string, meta: ExtraPortfolioMeta) => putExtraMeta(meta),
      onState: (portfolioId: string, state: SyncState) => {
        if (activePortfolioIdRef.current !== portfolioId) return;
        setSyncStatus(state);
        if (state === 'synced') setTimeout(() => setSyncStatus(prev => (prev === 'synced' ? 'idle' : prev)), 2000);
      },
      onDropped: (_portfolioId: string, messages: string[]) => {
        for (const message of new Set(messages)) toast.warning(message);
      },
      onForbidden: (portfolioId: string) => {
        toast.error('You no longer have access to this portfolio.', { id: 'portfolio-forbidden' });
        if (activePortfolioIdRef.current === portfolioId) void switchPortfolioRef.current(PERSONAL_PORTFOLIO_ID);
        removeExtra(portfolioId);
      },
      onError: (portfolioId: string, error: unknown, transient: boolean) => {
        if (error instanceof PortfolioLockedError) {
          toast.info('Unlock your data to sync this change.', { id: 'sync-locked' });
          return;
        }
        console.error(`[portfolios] sync failed for ${portfolioId}:`, error);
        analytics.cloudSyncFailed({ reason: transient ? 'transient' : 'terminal' });
        if (activePortfolioIdRef.current !== portfolioId) return;
        toast.error("Couldn't sync. Your changes stay in this tab; use Retry at the top of the page.", {
          id: 'cloud-sync-error',
        });
      },
    };
  }, [user, getDataKey, getPortfolioKey, setPortfolioKey, adoptPortfolioKey, putExtraMeta, commitData, setDefaultDateRange, removeExtra]);

  const syncHandlersRef = useRef(syncHandlers);
  useEffect(() => { syncHandlersRef.current = syncHandlers; }, [syncHandlers]);

  // The sync for a loaded portfolio: created on first sight, otherwise given
  // the fresher stored version (ignored while it's mid-write).
  const ensureSync = useCallback((loaded: LoadedPortfolio): PortfolioSync => {
    const portfolioId = loaded.meta.id;
    const doc: SyncDoc = { meta: loaded.meta, data: extraPortfolioData(loaded.content) };
    const existing = syncsRef.current.get(portfolioId);
    if (existing) {
      existing.adopt(doc);
      return existing;
    }
    const h = () => syncHandlersRef.current;
    const sync = new PortfolioSync(doc, {
      save: (meta, next) => h().save(portfolioId, meta, next),
      rotate: (meta, next) => h().rotate(portfolioId, meta, next),
      fetch: () => h().fetch(portfolioId),
      onView: (view) => h().onView(portfolioId, view),
      onSaved: (meta) => h().onSaved(portfolioId, meta),
      onState: (state) => h().onState(portfolioId, state),
      onDropped: (messages) => h().onDropped(portfolioId, messages),
      onForbidden: () => h().onForbidden(portfolioId),
      onError: (error, transient) => h().onError(portfolioId, error, transient),
      delay: (ms) => new Promise(r => setTimeout(r, ms)),
    });
    syncsRef.current.set(portfolioId, sync);
    return sync;
  }, []);

  // Every extra portfolio the user can open, with keys adopted, syncs
  // attached and the list replaced. Empty without Family, and before the
  // portfolios migration exists. Owned portfolios a partner has left are
  // re-keyed here (encryption.md §8.9).
  const loadExtraPortfolios = useCallback(async (userId: string): Promise<LoadedPortfolio[]> => {
    const dk = getDataKey();
    if (!dk) return [];
    let loaded: LoadedPortfolio[] = [];
    try {
      const result = await listPortfolios(supabase, userId, dk);
      loaded = result.loaded;
      if (result.failed > 0) {
        toast.error(
          `${result.failed} ${result.failed > 1 ? "portfolios couldn't be decrypted and are" : "portfolio couldn't be decrypted and is"} hidden.`,
          { id: 'portfolio-decrypt-error' },
        );
      }
    } catch (e) {
      console.debug('[cloud-load] extra portfolios unavailable:', e);
    }
    const listed = new Set(loaded.map((p) => p.meta.id));
    for (const id of extraMetaRef.current.keys()) {
      if (!listed.has(id)) {
        forgetPortfolioKey(id);
        syncsRef.current.get(id)?.dispose();
        syncsRef.current.delete(id);
      }
    }
    loaded.forEach(adoptPortfolioKey);
    const syncs = loaded.map(ensureSync);
    extraMetaRef.current = new Map(syncs.map((s) => [s.doc.meta.id, s.doc.meta]));
    setExtraPortfolios(syncs.map((s) => s.doc.meta));
    for (const sync of syncs) {
      const { meta } = sync.doc;
      if (meta.rotationDue && meta.ownerId === userId) void sync.requestRotation();
      else void sync.flush();
    }
    return loaded;
  }, [getDataKey, forgetPortfolioKey, adoptPortfolioKey, ensureSync]);

  const switchPortfolio = useCallback(async (portfolioId: string) => {
    if (!user || portfolioId === activePortfolioIdRef.current) return;
    if (portfolioId !== PERSONAL_PORTFOLIO_ID && !extraMetaRef.current.has(portfolioId)) return;
    const dk = getDataKey();
    if (!dk) {
      toast.info('Unlock your data to switch portfolios.', { id: 'sync-locked' });
      return;
    }

    const seq = ++loadSeqRef.current;
    // Reset in the same batch as the id change, so no render pairs the new
    // portfolio's name with the previous one's numbers.
    activate(portfolioId);
    commitData(null);
    setIsMockData(false);
    setFilters(defaultFilters);
    setSyncStatus('idle');
    lastAttemptRef.current = null;
    requestIdRef.current += 1;
    goalCrossedRef.current = new Set();
    setIsCloudLoading(true);

    try {
      let next: PortfolioData | null;
      if (portfolioId === PERSONAL_PORTFOLIO_ID) {
        next = await loadPersonalData(user.id);
      } else {
        const loaded = await fetchPortfolio(supabase, user.id, dk, portfolioId);
        if (loaded) {
          adoptPortfolioKey(loaded);
          const sync = ensureSync(loaded);
          putExtraMeta(sync.doc.meta);
          next = sync.doc.data;
        } else {
          toast.error('You no longer have access to this portfolio.', { id: 'portfolio-forbidden' });
          removeExtra(portfolioId);
          activate(PERSONAL_PORTFOLIO_ID);
          next = await loadPersonalData(user.id);
        }
      }
      if (seq === loadSeqRef.current && next) applyLoadedData(next);
    } catch (e) {
      console.error('[portfolios] switch failed:', e);
      toast.error("Couldn't open this portfolio. Try again.");
    } finally {
      if (seq === loadSeqRef.current) setIsCloudLoading(false);
    }
  }, [user, getDataKey, activate, commitData, loadPersonalData, adoptPortfolioKey, ensureSync, putExtraMeta, removeExtra, applyLoadedData]);

  // Sync callbacks can outlive the render they were made in.
  useEffect(() => { switchPortfolioRef.current = switchPortfolio; }, [switchPortfolio]);

  const createPortfolio = useCallback(async (rawName: string): Promise<boolean> => {
    const dk = getDataKey();
    if (!user || !dk) {
      toast.info('Unlock your data to create a portfolio.', { id: 'sync-locked' });
      return false;
    }
    const { value: name, error } = sanitizePortfolioName(rawName);
    if (error) {
      toast.error(error);
      return false;
    }
    if (portfolioNameTaken(name, Array.from(extraMetaRef.current.values()))) {
      toast.error(`A portfolio called "${name}" already exists. Pick another name.`);
      return false;
    }
    try {
      const created = await createPortfolioRemote(supabase, user.id, dk, name);
      adoptPortfolioKey(created);
      ensureSync(created);
      putExtraMeta(created.meta);
      analytics.portfolioCreated();
      await switchPortfolio(created.meta.id);
      return true;
    } catch (e) {
      if (e instanceof PortfolioLimitError) {
        toast.error(`You can have up to ${MAX_EXTRA_PORTFOLIOS} portfolios besides ${PERSONAL_PORTFOLIO_NAME}.`);
      } else {
        console.error('[portfolios] create failed:', e);
        toast.error("Couldn't create the portfolio. Try again.");
      }
      return false;
    }
  }, [user, getDataKey, adoptPortfolioKey, ensureSync, putExtraMeta, switchPortfolio]);

  // The name is inside the ciphertext, so a rename is an edit queued on the
  // portfolio's sync like any other.
  const renamePortfolio = useCallback(async (portfolioId: string, rawName: string): Promise<boolean> => {
    const sync = syncsRef.current.get(portfolioId);
    if (!user || !sync || refuseReadOnly(portfolioId)) return false;
    const { value: name, error } = sanitizePortfolioName(rawName);
    if (error) {
      toast.error(error);
      return false;
    }
    if (portfolioNameTaken(name, Array.from(extraMetaRef.current.values()), portfolioId)) {
      toast.error(`A portfolio called "${name}" already exists. Pick another name.`);
      return false;
    }
    if (!sync.rename(name)) return true;
    putExtraMeta(sync.doc.meta);
    if ((await sync.flush()) === 'synced') return true;
    toast.error("Couldn't rename the portfolio. Try again.");
    return false;
  }, [user, putExtraMeta, refuseReadOnly]);

  const deletePortfolio = useCallback(async (portfolioId: string): Promise<boolean> => {
    if (!user || !extraMetaRef.current.has(portfolioId)) return false;
    try {
      await deletePortfolioRemote(supabase, portfolioId);
    } catch (e) {
      console.error('[portfolios] delete failed:', e);
      toast.error("Couldn't delete the portfolio. Try again.");
      return false;
    }
    if (activePortfolioIdRef.current === portfolioId) await switchPortfolio(PERSONAL_PORTFOLIO_ID);
    removeExtra(portfolioId);
    return true;
  }, [user, switchPortfolio, removeExtra]);

  // After accepting an invite: list again so the joined portfolio has its
  // key and sync, then open it.
  const openJoinedPortfolio = useCallback(async (portfolioId: string): Promise<boolean> => {
    if (!user) return false;
    await loadExtraPortfolios(user.id);
    if (!extraMetaRef.current.has(portfolioId)) return false;
    await switchPortfolio(portfolioId);
    return true;
  }, [user, loadExtraPortfolios, switchPortfolio]);

  // The partner leaves a portfolio they were invited to. The owner's browser
  // re-keys it on its next load.
  const leavePortfolio = useCallback(async (portfolioId: string): Promise<boolean> => {
    if (!user || !extraMetaRef.current.has(portfolioId)) return false;
    try {
      await removeMember(supabase, portfolioId, user.id);
    } catch (e) {
      console.error('[portfolios] leave failed:', e);
      toast.error("Couldn't leave the portfolio. Try again.");
      return false;
    }
    analytics.portfolioLeft();
    if (activePortfolioIdRef.current === portfolioId) await switchPortfolio(PERSONAL_PORTFOLIO_ID);
    removeExtra(portfolioId);
    return true;
  }, [user, switchPortfolio, removeExtra]);

  // The owner removes the partner, then re-keys straight away so the key the
  // partner held opens nothing written from now on (encryption.md §8.9).
  const removePartner = useCallback(async (portfolioId: string, partnerId: string): Promise<boolean> => {
    const sync = syncsRef.current.get(portfolioId);
    if (!user || !sync) return false;
    try {
      await removeMember(supabase, portfolioId, partnerId);
    } catch (e) {
      console.error('[portfolios] remove partner failed:', e);
      toast.error("Couldn't remove your partner. Try again.");
      return false;
    }
    analytics.partnerRemoved();
    putExtraMeta({ ...sync.doc.meta, rotationDue: true });
    if ((await sync.requestRotation()) !== 'synced') {
      // rotation_due stays set on the server, so the next load tries again.
      toast.warning("Your partner no longer has access. Re-encrypting the portfolio didn't finish; it will retry next time you open Quantive.");
    }
    return true;
  }, [user, putExtraMeta]);

  // Puts back an earlier version as a new save, so the restore can itself be
  // undone from the same list.
  const restorePortfolioVersion = useCallback(async (portfolioId: string, revision: number): Promise<boolean> => {
    const sync = syncsRef.current.get(portfolioId);
    const dk = getDataKey();
    const currentKey = getPortfolioKey(portfolioId);
    if (!user || !sync || !dk || !currentKey || refuseReadOnly(portfolioId)) return false;
    try {
      const content = await openRevision(supabase, { userId: user.id, dataKey: dk, meta: sync.doc.meta, currentKey, revision });
      // An empty version (as created) shows the first-entry state, as on load.
      const restored = extraPortfolioData(content);
      sync.apply({ type: 'replaceAll', data: restored ?? { facts: [], refSources: [], goals: [] } });
      if (activePortfolioIdRef.current === portfolioId) {
        commitData(restored ? sync.doc.data : null);
        if (restored) setDefaultDateRange(restored);
      }
      if ((await sync.flush()) !== 'synced') return false;
      analytics.portfolioVersionRestored();
      return true;
    } catch (e) {
      console.error('[portfolios] restore failed:', e);
      toast.error("Couldn't restore that version. Try again.");
      return false;
    }
  }, [user, getDataKey, getPortfolioKey, commitData, setDefaultDateRange, refuseReadOnly]);

  // Save the personal portfolio when the user is authenticated AND their
  // email is confirmed. Extra portfolios save through their sync.
  const saveToCloud = useCallback(async (portfolioData: PortfolioData) => {
    if (!user) return;
    if (!user.email_confirmed_at) {
      // EmailConfirmationBanner already conveys this state persistently in
      // both shell and non-shell routes, with a Resend action. Firing a toast
      // here on every save attempt is duplicative. Silent stash + retry once
      // email_confirmed_at flips (see effect below).
      pendingCloudSaveRef.current = portfolioData;
      return;
    }

    const myId = ++requestIdRef.current;
    const isLatest = () => requestIdRef.current === myId;

    lastAttemptRef.current = portfolioData;

    // Every authenticated user has user_keys and saves go
    // through the v1 encrypted path. 'locked' users (session restored, DK
    // not in memory) cannot save remotely until they re-unlock; the global
    // RequireUnlock modal prompts them.
    if (keySession.status === 'locked') {
      toast.info('Unlock your data to sync this change.', {
        id: 'sync-locked',
      });
      return;
    }

    const dk = keySession.getDataKey();
    if (!dk) {
      // Defensive: status said unlocked-encrypted but DK is gone. Surface
      // and bail — the user will be re-prompted on next save attempt.
      toast.error("Couldn't sync this change. Unlock your data again to retry.");
      return;
    }

    const outcome = await attemptCloudSync(portfolioData, {
      upsert: (p) => upsertEncryptedSnapshot(supabase, user.id, p, dk),
      isLatest,
      delay: (ms) => new Promise(r => setTimeout(r, ms)),
      onStatus: setSyncStatus,
      onError: (reason) => analytics.cloudSyncFailed({ reason }),
    });

    if (outcome === 'synced') {
      // Brief green-check confirmation, then return to idle. Guarded so a
      // newer in-flight save isn't yanked back to idle by this stale timer.
      setTimeout(() => {
        setSyncStatus(prev => (prev === 'synced' ? 'idle' : prev));
      }, 2000);
    } else if (outcome === 'error') {
      toast.error("Couldn't sync. Your changes stay in this tab; use Retry at the top of the page.", {
        id: 'cloud-sync-error',
      });
    }
    // outcome === null: superseded by a newer call; do nothing.
  }, [user, keySession]);

  const retrySync = useCallback(() => {
    const portfolioId = activePortfolioIdRef.current;
    if (user && portfolioId !== PERSONAL_PORTFOLIO_ID) {
      void syncsRef.current.get(portfolioId)?.flush();
      return;
    }
    if (!lastAttemptRef.current) return;
    saveToCloud(lastAttemptRef.current);
  }, [user, saveToCloud]);

  // Retry pending cloud save once the user confirms their email
  useEffect(() => {
    if (user?.email_confirmed_at && pendingCloudSaveRef.current) {
      saveToCloud(pendingCloudSaveRef.current);
      pendingCloudSaveRef.current = null;
      toast.success('Email confirmed. Your data is synced.', { id: 'email-synced' });
    }
  }, [user?.email_confirmed_at, saveToCloud]);

  // Load from cloud when user signs in.
  //
  // Gated on keySession.status: while 'locked' we defer the load until the
  // user unlocks (otherwise we'd try to decrypt without a DK). Once status
  // flips to 'unlocked-encrypted', this effect re-fires and the load proceeds.
  useEffect(() => {
    if (!user) {
      // Only drop the skeleton once auth is *confirmed* guest. While auth is
      // still restoring a session we don't yet know if a user is coming back,
      // so keep the skeleton armed to avoid flashing "upload your file".
      if (!authLoading) setIsCloudLoading(false);
      return;
    }
    if (keySession.status === 'locked') return;

    const loadFromCloud = async () => {
      const seq = ++loadSeqRef.current;
      try {
        const extras = await loadExtraPortfolios(user.id);
        if (seq !== loadSeqRef.current) return;
        // Reopen the portfolio the user last had open, if it's still theirs.
        // Its sync's view keeps any edits not saved before a lock.
        const remembered = readActivePortfolioId(user.id);
        const target = extras.find((p) => p.meta.id === remembered);
        if (target) {
          activate(target.meta.id);
          const next = syncsRef.current.get(target.meta.id)?.doc.data ?? null;
          if (next) applyLoadedData(next);
          return;
        }
        const personal = await loadPersonalData(user.id);
        if (seq !== loadSeqRef.current) return;
        activate(PERSONAL_PORTFOLIO_ID);
        if (personal) applyLoadedData(personal);
      } catch (e) {
        console.error('Failed to load from cloud:', e);
      } finally {
        if (seq === loadSeqRef.current) setIsCloudLoading(false);
      }
    };
    loadFromCloud();
    // Depends on `keySession.status` (not the whole `keySession` object).
    // The provider value is a fresh object on every KeySessionProvider
    // render, so a `keySession` dep would re-fire this effect on every
    // ancestor re-render — three loads at sign-in instead of one, all
    // returning the same row (see diagnostic logs captured 2026-05-24).
    // The effect only reads `status` (for the early return) and
    // `getDataKey()` (a stable useCallback), so `status` is the only
    // identity we actually care about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, keySession.status, setDefaultDateRange]);

  // A partner's (or another device's) saves show up when this tab comes
  // back into view. There's no realtime channel; this is the v1 refresh.
  useEffect(() => {
    if (!user || keySession.status === 'locked') return;
    let lastCheck = 0;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const portfolioId = activePortfolioIdRef.current;
      const sync = syncsRef.current.get(portfolioId);
      if (!sync || !sync.settled) return;
      const now = Date.now();
      if (now - lastCheck < FOCUS_REFRESH_INTERVAL_MS) return;
      lastCheck = now;
      const handlers = syncHandlersRef.current;
      handlers.fetch(portfolioId).then((latest) => {
        if (!latest) {
          handlers.onForbidden(portfolioId);
          return;
        }
        const current = sync.doc.meta;
        if (latest.meta.revision === current.revision && latest.meta.keyEpoch === current.keyEpoch) return;
        if (sync.adopt(latest)) handlers.onView(portfolioId, sync.doc);
      }).catch(() => {
        // Offline or locked: the next focus tries again.
      });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user, keySession.status]);

  // Load from localStorage for guests
  useEffect(() => {
    if (user) return; // cloud load handles authenticated users
    // Critical: hold off while auth is still resolving. Without this gate a
    // page load with a prior user's cache flashes that data to whoever
    // opened the tab before getSession() returns. See H3 in
    // docs/logout-data-leak-remediation.md.
    if (authLoading) return;
    try {
      // if previous data was mock (ephemeral), clear it and don't reload
      const wasMock = localStorage.getItem(MOCK_FLAG_KEY) === 'true';
      if (wasMock) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(MOCK_FLAG_KEY);
        return;
      }

      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as RawCloudPortfolio;

        // Validate dates when loading from localStorage
        const validFacts: FactRow[] = parsed.facts
          .map((f, i): FactRow | null => {
            const date = safeDateWithWarning(f.date, 'local-cache', i);
            if (!date) return null;
            return {
              date,
              idSource: String(f.idSource ?? ''),
              sourceVl: Number(f.sourceVl ?? 0),
              currency: coerceCurrency(f.currency),
            };
          })
          .filter((f): f is FactRow => f !== null);

        const skipped = parsed.facts.length - validFacts.length;
        if (skipped > 0) {
          console.debug(`[local-cache] Skipped ${skipped}/${parsed.facts.length} facts with invalid dates`);
        }

        if (validFacts.length > 0) {
          const validData: PortfolioData = {
            ...parsed,
            facts: validFacts,
            goals: coerceGoals(parsed.goals),
          };
          commitData(validData);
          setIsMockData(false);
          setDefaultDateRange(validData);
        } else {
          // All dates were invalid — clear stale cache
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(MOCK_FLAG_KEY);
        }
      }
    } catch (e) {
      console.error('Failed to load cached data:', e);
    }
  }, [setDefaultDateRange, user, authLoading, commitData]);

  // ── Edits ───────────────────────────────────────────────────────────────
  //
  // Every edit is a PortfolioOp (src/lib/portfolioOps.ts). In an extra
  // portfolio the op goes to its sync, which saves it and replays it if
  // someone else saved first. Otherwise it applies to what's on screen and
  // the personal path saves the result: guests to localStorage, signed-in
  // users to the cloud.
  const mutate = useCallback((op: PortfolioOp, opts: { replacingDemo?: boolean } = {}): OpResult => {
    const portfolioId = activePortfolioIdRef.current;
    if (user && portfolioId !== PERSONAL_PORTFOLIO_ID) {
      if (refuseReadOnly(portfolioId)) return { data: dataRef.current, changed: false };
      const sync = syncsRef.current.get(portfolioId);
      if (!sync) {
        toast.error("Couldn't save this change. Open the portfolio again and retry.");
        return { data: dataRef.current, changed: false };
      }
      const result = sync.apply(op);
      if (result.rejection) toast.error(result.rejection);
      if (result.changed) commitData(sync.doc.data);
      return result;
    }

    // Demo data is replaced, not added to.
    const result = applyOp(opts.replacingDemo ? null : dataRef.current, op);
    if (result.rejection) toast.error(result.rejection);
    if (!result.changed || !result.data) return result;
    commitData(result.data);
    if (!user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
      localStorage.setItem(MOCK_FLAG_KEY, 'false');
    }
    saveToCloud(result.data);
    return result;
  }, [user, commitData, saveToCloud, refuseReadOnly]);

  const loadFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      // exceljs (~700 KB) is heavy — load it only when a user actually drops a spreadsheet.
      const { parsePortfolioExcel } = await import('@/lib/dataProcessor');
      const parsed = await parsePortfolioExcel(buffer);
      // Guests keep a local cache for offline-first reload; authed users go
      // cloud-only (encryption.md §8.6). mutate handles both.
      mutate({ type: 'replaceAll', data: parsed });
      setIsMockData(false);
      setDefaultDateRange(parsed);
      analytics.fileUploaded({ rowCount: parsed.facts.length, sourceCount: parsed.refSources.length });
      toast.success(`Imported ${parsed.facts.length} values from ${file.name}`);
    } catch (e: unknown) {
      console.error('Failed to parse file:', e);
      const msg = e instanceof Error ? e.message : 'Failed to parse spreadsheet. Check the format and try again.';
      const reason = !(e instanceof Error)
        ? 'unknown'
        : msg.includes('no sheets')
          ? 'no_sheets'
          : msg.includes('No data found')
            ? 'no_data'
            : msg.includes('No valid fact records')
              ? 'no_valid_facts'
              : 'parse_error';
      analytics.fileUploadFailed({ reason });
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [mutate, setDefaultDateRange]);

  const loadMockData = useCallback(() => {
    // Demo data replaces what's on screen; an extra portfolio's entries are real.
    if (activePortfolioIdRef.current !== PERSONAL_PORTFOLIO_ID) return;
    const mock = generateMockData();
    commitData(mock);
    setIsMockData(true);
    setDefaultDateRange(mock);
    // flag as mock so localStorage cache is cleared on next visit
    localStorage.setItem(MOCK_FLAG_KEY, 'true');
    // Do NOT save mock data to STORAGE_KEY — it's ephemeral
    // (No toast: the persistent DemoBanner already signals that demo data is loaded.)
  }, [setDefaultDateRange, commitData]);

  const clearData = useCallback(() => {
    analytics.dataCleared();
    commitData(null);
    setIsMockData(false);
    setFilters(defaultFilters);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(MOCK_FLAG_KEY); // Clean up mock flag
  }, [commitData]);

  const addMeasurement = useCallback((
    entries: NewEntry[],
    opts?: { date?: Date },
  ) => {
    if (entries.length === 0) return;
    const clean = entries.map(e => ({ ...e, name: sanitizeSourceName(e.name).value })).filter(e => e.name.length > 0);

    // Default to today; callers may pass a back-dated value for spreadsheet
    // migrators. Clamp to the past — future dates would distort forecasts.
    const date = opts?.date ? new Date(opts.date) : new Date();
    // Normalize to start of day for consistency with Excel ingestion
    date.setHours(0, 0, 0, 0);
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    if (date.getTime() > todayMidnight.getTime()) date.setTime(todayMidnight.getTime());

    const result = mutate({ type: 'addEntries', date, entries: clean }, { replacingDemo: isMockData });
    if (!result.changed) return;
    if (isMockData) setIsMockData(false);
    if (result.data) setDefaultDateRange(result.data);
    analytics.measurementAdded({ count: clean.length });
  }, [isMockData, mutate, setDefaultDateRange]);

  const updateRefSource = useCallback((
    idSource: string,
    patch: SourcePatch,
  ) => {
    mutate({ type: 'updateSource', idSource, patch });
  }, [mutate]);

  const renameSource = useCallback((oldId: string, newName: string) => {
    const oldTrimmed = oldId.trim();
    const sanitized = sanitizeSourceName(newName);
    if (sanitized.error) {
      toast.error(sanitized.error);
      return;
    }
    const next = sanitized.value;
    if (next === oldTrimmed) return;
    // Picking a name another source already uses would silently merge two
    // sources' history; the op rejects it and mutate shows why.
    const { changed } = mutate({ type: 'renameSource', from: oldTrimmed, to: next });
    if (!changed) return;
    // Source-filter state holds names by string id — keep it in sync so a
    // currently-applied filter doesn't silently drop the renamed source.
    setFilters(prev => {
      if (!prev.sources.includes(oldTrimmed)) return prev;
      return { ...prev, sources: prev.sources.map(s => (s === oldTrimmed ? next : s)) };
    });
  }, [mutate]);

  // ── Individual measurement edit / delete ────────────────────────────────
  //
  // Facts have no stable id today — the (date, idSource) tuple is the
  // identifier, mirroring the addMeasurement "replace day" semantics. If a
  // legacy spreadsheet ingest produced duplicates on the same (date, source),
  // edit fans out to all of them and delete removes all of them. Acceptable:
  // the duplicates were already indistinguishable to every other consumer.

  const updateMeasurement = useCallback(
    (date: Date, idSource: string, patch: { sourceVl?: number; currency?: CurrencyCode }) => {
      if (mutate({ type: 'updateEntry', date, idSource, patch }).changed) analytics.measurementEdited();
    },
    [mutate],
  );

  // Re-insert a set of previously-removed facts. Powers the delete-undo toast.
  // Idempotent and non-clobbering: a fact is only restored if its (date,
  // idSource) key is currently absent, so a double-tap on Undo is a no-op and
  // an undo that lands after the user has already re-entered a value for the
  // same slot won't overwrite the newer value.
  const restoreFacts = useCallback((facts: FactRow[]) => {
    if (facts.length === 0) return;
    const result = mutate({ type: 'restoreEntries', facts });
    if (!result.changed) return;
    if (result.data) setDefaultDateRange(result.data);
    analytics.measurementRestored();
  }, [mutate, setDefaultDateRange]);

  const deleteMeasurement = useCallback(
    (date: Date, idSource: string) => {
      const dateKey = date.getTime();
      const target = idSource.trim();
      // Snapshot the facts we're about to remove so the undo toast can put
      // them back verbatim (value + currency + any legacy duplicates).
      const removed = (dataRef.current?.facts ?? []).filter(
        f => f.date.getTime() === dateKey && f.idSource.trim() === target,
      );
      const result = mutate({ type: 'deleteEntry', date, idSource });
      if (!result.changed) return;
      // Date range may have shrunk if we removed the only fact for the
      // earliest or latest date — recompute so charts don't keep showing
      // an empty edge.
      if (result.data) setDefaultDateRange(result.data);
      analytics.measurementDeleted();
      toast.success(`Entry from ${formatDate(date)} deleted`, {
        action: { label: 'Undo', onClick: () => restoreFacts(removed) },
        duration: 6000,
      });
    },
    [mutate, setDefaultDateRange, restoreFacts],
  );

  // ── Goals ───────────────────────────────────────────────────────────────
  //
  // Goals live inside the same encrypted portfolio blob (see types.ts), so
  // every goal edit is an op like any other.

  const addGoal = useCallback(
    (input: { name: string; targetAmount: number; targetCurrency: CurrencyCode; targetDate: string }): Goal => {
      const goal: Goal = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        targetAmount: input.targetAmount,
        targetCurrency: input.targetCurrency,
        targetDate: input.targetDate,
        createdAt: new Date().toISOString(),
      };
      // With no portfolio yet the op starts an empty one, so the goal still
      // has a home; goals don't need entries to exist.
      mutate({ type: 'addGoal', goal });
      analytics.goalCreated();
      return goal;
    },
    [mutate],
  );

  const updateGoal = useCallback(
    (id: string, patch: GoalPatch) => {
      mutate({ type: 'updateGoal', id, patch });
    },
    [mutate],
  );

  const archiveGoal = useCallback((id: string) => {
    mutate({ type: 'archiveGoal', id, archivedAt: new Date().toISOString() });
  }, [mutate]);

  const updateFilters = useCallback((partial: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...partial }));
  }, []);

  const enrichedFacts = useMemo<EnrichedFact[]>(() => {
    if (!data) return [];
    const sourceMap = new Map(data.refSources.map(s => [s.idSource.trim(), s]));

    return data.facts.map(f => {
      const source = sourceMap.get(f.idSource.trim());
      return {
        ...f,
        volatType: source?.volatType ?? 'Unknown',
        isLiquid: source?.transferableInDays ?? false,
      };
    });
  }, [data]);

  const allSources = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.facts.map(f => f.idSource))].sort();
  }, [data]);

  const allVolatTypes = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.refSources.map(s => s.volatType))].sort();
  }, [data]);

  const dateRange = useMemo<[Date, Date] | null>(() => {
    if (!enrichedFacts.length) return null;
    const dates = enrichedFacts.map(f => f.date.getTime());
    return [new Date(Math.min(...dates)), new Date(Math.max(...dates))];
  }, [enrichedFacts]);

  const filteredFacts = useMemo(() => {
    let result = enrichedFacts;
    const [startDate, endDate] = filters.dateRange;
    if (startDate) result = result.filter(f => f.date >= startDate);
    if (endDate) result = result.filter(f => f.date <= endDate);
    if (filters.sources.length > 0) result = result.filter(f => filters.sources.includes(f.idSource));
    if (filters.volatTypes.length > 0) result = result.filter(f => filters.volatTypes.includes(f.volatType));
    if (filters.liquidFilter !== 'all') result = result.filter(f => f.isLiquid === (filters.liquidFilter === 'liquid'));
    return result;
  }, [enrichedFacts, filters]);

  // Drop snapshots whose total can't be computed — fxConvertAt returns NaN
  // when fx_rates haven't loaded yet, or when a fact's currency has no rate
  // available on its snapshot date. NaN propagates through every downstream
  // arithmetic (kpis, charts, yearly earnings) so it's far cleaner to hide
  // the broken date until it can be valued correctly than to render "€NaN"
  // across the dashboard.
  const snapshots = useMemo<Snapshot[]>(() => {
    const grouped = new Map<number, EnrichedFact[]>();
    filteredFacts.forEach(f => {
      const key = f.date.getTime();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(f);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, facts]) => {
        const snapDate = new Date(ts);
        const sources = facts.map(f => ({
          name: f.idSource,
          value: fxConvertAt(f.sourceVl, f.currency, displayCurrency.code, snapDate),
          volatType: f.volatType,
          isLiquid: f.isLiquid,
        }));
        return {
          date: snapDate,
          total: sources.reduce((sum, s) => sum + s.value, 0),
          sources,
        };
      })
      .filter(snap => Number.isFinite(snap.total));
  }, [filteredFacts, fxConvertAt, displayCurrency.code]);

  const allSnapshots = useMemo<Snapshot[]>(() => {
    const grouped = new Map<number, EnrichedFact[]>();
    enrichedFacts.forEach(f => {
      const key = f.date.getTime();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(f);
    });
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, facts]) => {
        const snapDate = new Date(ts);
        const sources = facts.map(f => ({
          name: f.idSource,
          value: fxConvertAt(f.sourceVl, f.currency, displayCurrency.code, snapDate),
          volatType: f.volatType,
          isLiquid: f.isLiquid,
        }));
        return {
          date: snapDate,
          total: sources.reduce((sum, s) => sum + s.value, 0),
          sources,
        };
      })
      .filter(snap => Number.isFinite(snap.total));
  }, [enrichedFacts, fxConvertAt, displayCurrency.code]);

  // Most recent currency per source — drives the modal's defaults so a row
  // pre-seeded for an existing source starts in the same currency it was last
  // recorded in.
  const lastCurrencyBySource = useMemo<Map<string, CurrencyCode>>(() => {
    const acc = new Map<string, { ts: number; ccy: CurrencyCode }>();
    if (!data) return new Map();
    for (const f of data.facts) {
      const key = f.idSource.trim();
      const ts = f.date.getTime();
      const prev = acc.get(key);
      if (!prev || ts > prev.ts) acc.set(key, { ts, ccy: f.currency });
    }
    return new Map(Array.from(acc.entries()).map(([k, v]) => [k, v.ccy]));
  }, [data]);

  const kpis = useMemo<KPIData>(() => {
    if (snapshots.length === 0) return defaultKpis;

    const latest = snapshots[snapshots.length - 1];
    const currentNetWorth = latest.total;

    const oneMonthAgo = new Date(latest.date);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const momSnapshot = findClosestSnapshot(snapshots, oneMonthAgo, latest);
    const momChange = momSnapshot ? ((currentNetWorth - momSnapshot.total) / momSnapshot.total) * 100 : 0;

    const oneYearAgo = new Date(latest.date);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const yoySnapshot = findClosestSnapshot(snapshots, oneYearAgo, latest);
    const yoyChange = yoySnapshot ? ((currentNetWorth - yoySnapshot.total) / yoySnapshot.total) * 100 : 0;
    const yoyNetWorth = yoySnapshot ? yoySnapshot.total : 0;

    const sourceCount = latest.sources.length;
    const volatilityDataAvailable = latest.sources.some(s => s.volatType.toLowerCase() !== 'unknown');
    const volatileTotal = latest.sources
      .filter(s => s.volatType.toLowerCase().includes('volatile') && !s.volatType.toLowerCase().includes('non'))
      .reduce((sum, s) => sum + s.value, 0);
    const liquidTotal = latest.sources.filter(s => s.isLiquid).reduce((sum, s) => sum + s.value, 0);

    return {
      currentNetWorth,
      momChange,
      yoyChange,
      yoyNetWorth,
      sourceCount,
      volatilityDataAvailable,
      volatilePercent: currentNetWorth > 0 ? (volatileTotal / currentNetWorth) * 100 : 0,
      liquidPercent: currentNetWorth > 0 ? (liquidTotal / currentNetWorth) * 100 : 0,
    };
  }, [snapshots]);

  // Active goals only (archived are still in the blob but hidden from the UI).
  // Sorted by createdAt ascending so the staged-gate "first goal" rule reads
  // off index 0 consistently.
  const goals = useMemo<Goal[]>(() => {
    const all = data?.goals ?? [];
    return all
      .filter(g => !g.archivedAt)
      .sort((a, b) => {
        const ta = Date.parse(a.createdAt);
        const tb = Date.parse(b.createdAt);
        if (ta !== tb) return ta - tb;
        return a.id < b.id ? -1 : 1;
      });
  }, [data]);

  // Live "you just crossed the line" emitter for goal_completed.
  // Compares the most recent snapshot total against each active goal's target
  // (in the goal's targetCurrency) and fires the analytics event the first
  // time a given goal id is observed crossed in this session. Honours the
  // "no portfolio data in events" rule — the event payload is empty.
  // (Agent A added a creation-time emitter on GoalsPage; this complements it.)
  useEffect(() => {
    if (!allSnapshots.length || !goals.length) return;
    const latest = allSnapshots[allSnapshots.length - 1];
    if (!latest) return;
    for (const goal of goals) {
      if (goalCrossedRef.current.has(goal.id)) continue;
      // Convert latest total from display currency back to the goal's
      // targetCurrency at the most recent snapshot date. fxConvertAt handles
      // same-currency as identity and returns NaN if rates are missing.
      const totalInTarget = fxConvertAt(
        latest.total,
        displayCurrency.code,
        goal.targetCurrency,
        latest.date,
      );
      if (!Number.isFinite(totalInTarget)) continue;
      if (totalInTarget >= goal.targetAmount) {
        goalCrossedRef.current.add(goal.id);
        analytics.goalCompleted();
      }
    }
  }, [allSnapshots, goals, fxConvertAt, displayCurrency.code]);

  const activePortfolioName = activePortfolioId === PERSONAL_PORTFOLIO_ID
    ? PERSONAL_PORTFOLIO_NAME
    : extraPortfolios.find((p) => p.id === activePortfolioId)?.name ?? '';

  const value = {
    data,
    enrichedFacts,
    filters,
    updateFilters,
    snapshots,
    allSnapshots,
    kpis,
    allSources,
    allVolatTypes,
    dateRange,
    loadFile,
    loadMockData,
    clearData,
    addMeasurement,
    updateMeasurement,
    deleteMeasurement,
    updateRefSource,
    renameSource,
    isLoading: isLoading || isCloudLoading,
    isMockData,
    syncStatus,
    retrySync,
    lastCurrencyBySource,
    goals,
    addGoal,
    updateGoal,
    archiveGoal,
    activePortfolioId,
    activePortfolioName,
    extraPortfolios,
    switchPortfolio,
    createPortfolio,
    renamePortfolio,
    deletePortfolio,
    openJoinedPortfolio,
    leavePortfolio,
    removePartner,
    restorePortfolioVersion,
    readOnlyReason: readOnlyReason(extraPortfolios.find((p) => p.id === activePortfolioId), familyAccess),
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}
