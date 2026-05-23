import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { PortfolioData, EnrichedFact, FilterState, Snapshot, KPIData, FactRow, RefSource, Goal } from '@/lib/types';
import { generateMockData } from '@/lib/mockData';
import { toast } from 'sonner';
import { analytics } from '@/lib/analytics';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useKeySession } from './KeySessionContext';
import { useEntitlements } from '@/hooks/useEntitlements';
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

const STORAGE_KEY = 'portfolio-data';
const MOCK_FLAG_KEY = 'portfolio-data-is-mock'; // Track ephemeral mock data
// Per-user / cross-user client caches wiped by the user-id watcher on
// sign-out and account-switch. Mirrors the encryption.md §8.3 contract:
// nothing user-tied survives an identity transition in this browser.
const ADD_MEASUREMENT_DRAFT_KEY = 'add-measurement-draft';
const CUSTOM_MILESTONES_KEY = 'portfolio-custom-milestones';
const RECOVERY_OFFERED_PREFIX = 'recovery-offered:';

/**
 * Safely parse a date value, returning null for invalid dates.
 * Prevents silent NaN dates from cloud/localStorage.
 */
function safeDate(val: unknown): Date | null {
  const d = val instanceof Date ? val : new Date(val as string | number);
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
  addMeasurement: (entries: { name: string; value: number; currency: CurrencyCode; isLiquid?: boolean; volatType?: string }[]) => void;
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
  updateRefSource: (idSource: string, patch: { volatType?: string; isLiquid?: boolean }) => void;
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
  updateGoal: (id: string, patch: Partial<Pick<Goal, 'name' | 'targetAmount' | 'targetCurrency' | 'targetDate'>>) => void;
  /** Soft-delete: stamps `archivedAt`. Archived goals don't surface on the goals page but stay in the blob. */
  archiveGoal: (id: string) => void;
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
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<PortfolioData | null>(null);
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
    setData(null);
    setIsMockData(false);
    setFilters(defaultFilters);
    // Arm the skeleton iff we're entering an authed identity (a real cloud
    // fetch is about to happen). On sign-out (user → null) we leave it false
    // so the dashboard can fall through to the file-upload empty state.
    setIsCloudLoading(user != null);
  }

  const { has } = useEntitlements();
  const keySession = useKeySession();
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

  const hasFullHistory = has('history.full');
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
      setData(null);
      setIsMockData(false);
      setFilters(defaultFilters);
      lastAttemptRef.current = null;
      pendingCloudSaveRef.current = null;
      // Invalidate any in-flight cloud save so its callback can't re-write status.
      requestIdRef.current += 1;
      setSyncStatus('idle');
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(MOCK_FLAG_KEY);
        localStorage.removeItem(ADD_MEASUREMENT_DRAFT_KEY);
        localStorage.removeItem(CUSTOM_MILESTONES_KEY);
        localStorage.removeItem(`${RECOVERY_OFFERED_PREFIX}${previousUserId}`);
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
      setData(null);
      setIsMockData(false);
      setFilters(defaultFilters);
      setIsCloudLoading(true);
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

  // Save data to cloud when user is authenticated AND email confirmed
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
      toast.info('Unlock your encrypted data to enable cloud sync.', {
        id: 'sync-locked',
      });
      return;
    }

    const dk = keySession.getDataKey();
    if (!dk) {
      // Defensive: status said unlocked-encrypted but DK is gone. Surface
      // and bail — the user will be re-prompted on next save attempt.
      toast.error('Encrypted session is missing its data key. Please re-unlock.');
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
      toast.error('Cloud sync failed. Your data is saved locally — click Retry in the header.', {
        id: 'cloud-sync-error',
      });
    }
    // outcome === null: superseded by a newer call; do nothing.
  }, [user, keySession]);

  const retrySync = useCallback(() => {
    if (!lastAttemptRef.current) return;
    saveToCloud(lastAttemptRef.current);
  }, [saveToCloud]);

  // Retry pending cloud save once the user confirms their email
  useEffect(() => {
    if (user?.email_confirmed_at && pendingCloudSaveRef.current) {
      saveToCloud(pendingCloudSaveRef.current);
      pendingCloudSaveRef.current = null;
      toast.success('Email confirmed — data synced to cloud!', { id: 'email-synced' });
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
      try {
        const { data: rows } = await supabase
          .from('portfolio_snapshots')
          .select('data, encrypted_data, nonce, enc_version')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (rows && rows.length > 0) {
          const row = rows[0] as unknown as SnapshotRow;
          let cloudData: RawCloudPortfolio;
          try {
            const decoded = await decodeSnapshot(row, {
              userId: user.id,
              dataKey: keySession.getDataKey(),
            });
            cloudData = decoded.data as RawCloudPortfolio;
          } catch (e) {
            console.error('[cloud-load] failed to decode snapshot:', e);
            toast.error('Could not decrypt your saved data. Try signing out and back in.');
            return;
          }

          // Validate dates on cloud load, filter out invalid ones
          const parsedFacts: FactRow[] = cloudData.facts
            .map((f, i): FactRow | null => {
              const date = safeDateWithWarning(f.date, 'cloud-load', i);
              if (!date) return null;
              return {
                date,
                idSource: String(f.idSource ?? ''),
                sourceVl: Number(f.sourceVl ?? 0),
                currency: coerceCurrency(f.currency),
              };
            })
            .filter((f): f is FactRow => f !== null);

          const skipped = cloudData.facts.length - parsedFacts.length;
          if (skipped > 0) {
            console.debug(`[cloud-load] Skipped ${skipped}/${cloudData.facts.length} facts with invalid dates`);
            toast.warning(`${skipped} record${skipped > 1 ? 's' : ''} had invalid dates and were skipped.`, {
              id: 'cloud-date-warning',
            });
          }

          if (parsedFacts.length === 0) {
            console.debug('[cloud-load] No valid facts after date validation — skipping cloud data');
            return;
          }

          const validData: PortfolioData = {
            facts: parsedFacts,
            refSources: cloudData.refSources,
            goals: coerceGoals(cloudData.goals),
          };
          setData(validData);
          setIsMockData(false);
          setDefaultDateRange(validData);
          // Authed users: cloud is the source of truth post-decode; do NOT
          // mirror plaintext into localStorage (see encryption.md §8.3).
        }
      } catch (e) {
        console.error('Failed to load from cloud:', e);
      } finally {
        setIsCloudLoading(false);
      }
    };
    loadFromCloud();
  }, [user, authLoading, keySession, setDefaultDateRange]);

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
          setData(validData);
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
  }, [setDefaultDateRange, user, authLoading]);

  const loadFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      // exceljs (~700 KB) is heavy — load it only when a user actually drops a spreadsheet.
      const { parsePortfolioExcel } = await import('@/lib/dataProcessor');
      const parsed = await parsePortfolioExcel(buffer);
      setData(parsed);
      setIsMockData(false);
      // Guests rely on the local cache for offline-first reload. Authed
      // users go cloud-only — see encryption.md §8.3.
      if (!user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        localStorage.setItem(MOCK_FLAG_KEY, 'false');
      }
      setDefaultDateRange(parsed);
      saveToCloud(parsed);
      analytics.fileUploaded({ rowCount: parsed.facts.length, sourceCount: parsed.refSources.length });
      toast.success(`Loaded ${parsed.facts.length} records from ${file.name}`);
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
  }, [saveToCloud, setDefaultDateRange, user]);

  const loadMockData = useCallback(() => {
    const mock = generateMockData();
    setData(mock);
    setIsMockData(true);
    setDefaultDateRange(mock);
    // flag as mock so localStorage cache is cleared on next visit
    localStorage.setItem(MOCK_FLAG_KEY, 'true');
    // Do NOT save mock data to STORAGE_KEY — it's ephemeral
    // (No toast: the persistent DemoBanner already signals that demo data is loaded.)
  }, [setDefaultDateRange]);

  const clearData = useCallback(() => {
    analytics.dataCleared();
    setData(null);
    setIsMockData(false);
    setFilters(defaultFilters);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(MOCK_FLAG_KEY); // Clean up mock flag
  }, []);

  // Helper function for formatting dates
  const format = (d: Date, fmt: string): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    if (fmt === 'dd MMM yyyy') return `${day} ${month} ${year}`;
    return `${day} ${month} ${year}`;
  };

  const addMeasurement = useCallback((entries: { name: string; value: number; currency: CurrencyCode; isLiquid?: boolean; volatType?: string }[]) => {
    if (entries.length === 0) return;
    entries = entries.map(e => ({ ...e, name: sanitizeSourceName(e.name).value })).filter(e => e.name.length > 0);

    const now = new Date();
    // Normalize to start of day for consistency with Excel ingestion
    now.setHours(0, 0, 0, 0);
    const nowKey = now.getTime();

    setData(prev => {
      // If no existing data, create a new dataset
      if (!prev) {
        const newFacts: FactRow[] = entries.map(e => ({
          date: now,
          idSource: e.name,
          sourceVl: e.value,
          currency: e.currency,
        }));
        const newRefSources: RefSource[] = entries.map(e => ({
          idSource: e.name,
          volatType: e.volatType?.trim() || 'Unknown',
          transferableInDays: e.isLiquid ?? false,
        }));
        const newData: PortfolioData = { facts: newFacts, refSources: newRefSources };

        // Persist (guests only — authed users go cloud-only)
        if (!user) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
          localStorage.setItem(MOCK_FLAG_KEY, 'false');
        }
        setDefaultDateRange(newData);
        saveToCloud(newData);
        toast.success(`Added measurement with ${entries.length} source${entries.length > 1 ? 's' : ''}`);
        return newData;
      }

      // If previous data is mock, replace instead of append
      // Clear mock flag and use only the new real entries
      if (isMockData) {
        const newFacts: FactRow[] = entries.map(e => ({
          date: now,
          idSource: e.name,
          sourceVl: e.value,
          currency: e.currency,
        }));
        const newRefSources: RefSource[] = entries.map(e => ({
          idSource: e.name,
          volatType: e.volatType?.trim() || 'Unknown',
          transferableInDays: e.isLiquid ?? false,
        }));
        const newData: PortfolioData = { ...prev, facts: newFacts, refSources: newRefSources };

        // Persist as real data (guests only)
        if (!user) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
          localStorage.setItem(MOCK_FLAG_KEY, 'false');
        }
        setDefaultDateRange(newData);
        saveToCloud(newData);
        setIsMockData(false); // Clear the mock flag
        toast.success(`Added first real measurement — replaced demo data`);
        return newData;
      }

      // Check if this measurement's date already exists
      // If so, replace the entire day's snapshot instead of adding/merging
      const existingDateFacts = prev.facts.filter(f => f.date.getTime() === nowKey);
      
      if (existingDateFacts.length > 0) {
        // Replace: filter out facts for this date and add new ones
        const remainingFacts = prev.facts.filter(f => f.date.getTime() !== nowKey);
        const newFacts = entries.map(e => ({
          date: now,
          idSource: e.name,
          sourceVl: e.value,
          currency: e.currency,
        }));

        // Add any new data sources to refSources
        const existingSourceNames = new Set(prev.refSources.map(s => s.idSource));
        const newRefSources = [...prev.refSources];
        for (const e of entries) {
          if (!existingSourceNames.has(e.name)) {
            newRefSources.push({
              idSource: e.name,
              volatType: e.volatType?.trim() || 'Unknown',
              transferableInDays: e.isLiquid ?? false,
            });
          }
        }

        const updatedData: PortfolioData = {
          ...prev,
          facts: [...remainingFacts, ...newFacts],
          refSources: newRefSources,
        };

        // Persist (guests only)
        if (!user) localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
        setDefaultDateRange(updatedData);
        saveToCloud(updatedData);
        toast.success(`Updated measurement for ${format(now, 'dd MMM yyyy')}`);
        return updatedData;
      }

      // Normal append for new dates
      const newFacts = entries.map(e => ({
        date: now,
        idSource: e.name,
        sourceVl: e.value,
        currency: e.currency,
      }));

      // Add any new data sources to refSources
      const existingSourceNames = new Set(prev.refSources.map(s => s.idSource));
      const newRefSources = [...prev.refSources];
      for (const e of entries) {
        if (!existingSourceNames.has(e.name)) {
          newRefSources.push({
            idSource: e.name,
            volatType: e.volatType?.trim() || 'Unknown',
            transferableInDays: e.isLiquid ?? false,
          });
        }
      }

      const updatedData: PortfolioData = {
        ...prev,
        facts: [...prev.facts, ...newFacts],
        refSources: newRefSources,
      };

      // Persist (guests only)
      if (!user) localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
      setDefaultDateRange(updatedData);
      saveToCloud(updatedData);
      toast.success(`Added measurement with ${entries.length} source${entries.length > 1 ? 's' : ''}`);
      return updatedData;
    });
    analytics.measurementAdded({ count: entries.length });
  }, [user, isMockData, saveToCloud, setDefaultDateRange]);

  const updateRefSource = useCallback((idSource: string, patch: { volatType?: string; isLiquid?: boolean }) => {
    setData(prev => {
      if (!prev) return prev;
      const target = idSource.trim();
      let changed = false;
      const newRefSources = prev.refSources.map(rs => {
        if (rs.idSource.trim() !== target) return rs;
        changed = true;
        return {
          ...rs,
          volatType: patch.volatType !== undefined ? (patch.volatType.trim() || 'Unknown') : rs.volatType,
          transferableInDays: patch.isLiquid !== undefined ? patch.isLiquid : rs.transferableInDays,
        };
      });
      if (!changed) return prev;
      const updated: PortfolioData = { ...prev, refSources: newRefSources };
      if (!user) localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      saveToCloud(updated);
      return updated;
    });
  }, [user, saveToCloud]);

  // ── Individual measurement edit / delete ────────────────────────────────
  //
  // Facts have no stable id today — the (date, idSource) tuple is the
  // identifier, mirroring the addMeasurement "replace day" semantics. If a
  // legacy spreadsheet ingest produced duplicates on the same (date, source),
  // edit fans out to all of them and delete removes all of them. Acceptable:
  // the duplicates were already indistinguishable to every other consumer.

  // Analytics is called inside the setData updater (not after it) so phantom
  // events don't fire on no-op paths (null data, no fact match, identical
  // value+currency). The codebase does not use <StrictMode> (see main.tsx),
  // so the updater runs exactly once per call. If StrictMode is ever enabled
  // these events would double-fire in dev — guard with a closure flag then.
  const updateMeasurement = useCallback(
    (date: Date, idSource: string, patch: { sourceVl?: number; currency?: CurrencyCode }) => {
      const dateKey = date.getTime();
      const target = idSource.trim();
      setData(prev => {
        if (!prev) return prev;
        let changed = false;
        const nextFacts = prev.facts.map(f => {
          if (f.date.getTime() !== dateKey || f.idSource.trim() !== target) return f;
          const nextValue = patch.sourceVl !== undefined ? patch.sourceVl : f.sourceVl;
          const nextCurrency = patch.currency !== undefined ? patch.currency : f.currency;
          if (nextValue === f.sourceVl && nextCurrency === f.currency) return f;
          changed = true;
          return { ...f, sourceVl: nextValue, currency: nextCurrency };
        });
        if (!changed) return prev;
        const updated: PortfolioData = { ...prev, facts: nextFacts };
        if (!user) localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        saveToCloud(updated);
        analytics.measurementEdited();
        return updated;
      });
    },
    [user, saveToCloud],
  );

  const deleteMeasurement = useCallback(
    (date: Date, idSource: string) => {
      const dateKey = date.getTime();
      const target = idSource.trim();
      setData(prev => {
        if (!prev) return prev;
        const nextFacts = prev.facts.filter(
          f => !(f.date.getTime() === dateKey && f.idSource.trim() === target),
        );
        if (nextFacts.length === prev.facts.length) return prev;
        const updated: PortfolioData = { ...prev, facts: nextFacts };
        if (!user) localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        // Date range may have shrunk if we removed the only fact for the
        // earliest or latest date — recompute so charts don't keep showing
        // an empty edge.
        setDefaultDateRange(updated);
        saveToCloud(updated);
        analytics.measurementDeleted();
        return updated;
      });
    },
    [user, saveToCloud, setDefaultDateRange],
  );

  // ── Goals ───────────────────────────────────────────────────────────────
  //
  // Goals live inside the same encrypted portfolio blob (see types.ts).
  // Every CRUD call mutates `data`, persists the new blob (guests:
  // localStorage; authed: cloud), and lets the existing sync plumbing carry
  // the bytes. There is no separate goals table — every goal edit rewrites
  // the whole blob, so concurrent tabs can clobber (acceptable for solo
  // users; revisit if multi-device editing becomes a real workflow).

  /** Internal helper: persist a portfolio mutation that doesn't touch the date range. */
  const persistGoalsChange = useCallback((updated: PortfolioData) => {
    if (!user) localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    saveToCloud(updated);
  }, [user, saveToCloud]);

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
      setData(prev => {
        // No portfolio yet — create an empty one so the goal still has a home.
        // The user will get FileUpload prompts on the dashboard, but goals
        // don't require uploaded snapshots to exist.
        const base: PortfolioData = prev ?? { facts: [], refSources: [], goals: [] };
        const goals = [...(base.goals ?? []), goal];
        const updated: PortfolioData = { ...base, goals };
        persistGoalsChange(updated);
        return updated;
      });
      analytics.goalCreated();
      return goal;
    },
    [persistGoalsChange],
  );

  const updateGoal = useCallback(
    (id: string, patch: Partial<Pick<Goal, 'name' | 'targetAmount' | 'targetCurrency' | 'targetDate'>>) => {
      setData(prev => {
        if (!prev) return prev;
        const goals = prev.goals ?? [];
        let changed = false;
        const next = goals.map(g => {
          if (g.id !== id) return g;
          changed = true;
          return {
            ...g,
            name: patch.name !== undefined ? patch.name.trim() : g.name,
            targetAmount: patch.targetAmount !== undefined ? patch.targetAmount : g.targetAmount,
            targetCurrency: patch.targetCurrency !== undefined ? patch.targetCurrency : g.targetCurrency,
            targetDate: patch.targetDate !== undefined ? patch.targetDate : g.targetDate,
          };
        });
        if (!changed) return prev;
        const updated: PortfolioData = { ...prev, goals: next };
        persistGoalsChange(updated);
        return updated;
      });
    },
    [persistGoalsChange],
  );

  const archiveGoal = useCallback((id: string) => {
    setData(prev => {
      if (!prev) return prev;
      const goals = prev.goals ?? [];
      let changed = false;
      const next = goals.map(g => {
        if (g.id !== id || g.archivedAt) return g;
        changed = true;
        return { ...g, archivedAt: new Date().toISOString() };
      });
      if (!changed) return prev;
      const updated: PortfolioData = { ...prev, goals: next };
      persistGoalsChange(updated);
      return updated;
    });
  }, [persistGoalsChange]);

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
  const goalCrossedRef = useRef<Set<string>>(new Set());
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
    isLoading: isLoading || isCloudLoading,
    isMockData,
    syncStatus,
    retrySync,
    lastCurrencyBySource,
    goals,
    addGoal,
    updateGoal,
    archiveGoal,
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}
