import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { PortfolioData, EnrichedFact, FilterState, Snapshot, KPIData, FactRow, RefSource } from '@/lib/types';
import { generateMockData } from '@/lib/mockData';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useKeySession } from './KeySessionContext';
import { sanitizeSourceName } from '@/lib/utils';
import {
  attemptCloudSync,
  decodeSnapshot,
  upsertEncryptedSnapshot,
  type SnapshotRow,
} from '@/lib/cloudSync';
import { useCurrency, type CurrencyCode } from './CurrencyContext';
import { useFxRates } from '@/hooks/useFxRates';

// Currencies the app knows how to value. Anything else loaded from old data
// or a malformed Excel gets coerced to EUR (the historical default).
const SUPPORTED_CURRENCIES: ReadonlySet<CurrencyCode> = new Set(['EUR', 'USD', 'GBP', 'NOK']);
function coerceCurrency(value: unknown): CurrencyCode {
  return SUPPORTED_CURRENCIES.has(value as CurrencyCode) ? (value as CurrencyCode) : 'EUR';
}

const STORAGE_KEY = 'portfolio-data';
const MOCK_FLAG_KEY = 'portfolio-data-is-mock'; // Track ephemeral mock data

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
    console.warn(`[${context}] Skipping fact #${index}: invalid date "${String(val)}"`);
  }
  return d;
}

/** The shape we expect a snapshot's parsed JSON to have. Validated lazily — facts/refSources are arrays of unknown until normalised. */
type RawCloudPortfolio = {
  facts: Array<Record<string, unknown>>;
  refSources: RefSource[];
};

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
  updateRefSource: (idSource: string, patch: { volatType?: string; isLiquid?: boolean }) => void;
  isLoading: boolean;
  isMockData: boolean;
  syncStatus: SyncStatus;
  retrySync: () => void;
  /** All snapshots, unaffected by date-range filter — used by NetWorthChart for its own period selector. */
  allSnapshots: Snapshot[];
  /** Maps source name → currency of that source's most recent fact. Used by the modal to default new measurements to the same currency. */
  lastCurrencyBySource: Map<string, CurrencyCode>;
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
  const [data, setData] = useState<PortfolioData | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [isLoading, setIsLoading] = useState(false);
  const [isMockData, setIsMockData] = useState(false);
  const { user } = useAuth();
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

  const setDefaultDateRange = useCallback((parsed: PortfolioData) => {
    const dates = parsed.facts.map(f => f.date.getTime());
    if (dates.length === 0) return;
    const maxDate = new Date(Math.max(...dates));
    const twoYearsAgo = new Date(maxDate);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const minDate = new Date(Math.min(...dates));
    setFilters(prev => ({
      ...prev,
      dateRange: [twoYearsAgo < minDate ? minDate : twoYearsAgo, maxDate],
    }));
  }, []);

  // Save data to cloud when user is authenticated AND email confirmed
  const saveToCloud = useCallback(async (portfolioData: PortfolioData) => {
    if (!user) return;
    if (!user.email_confirmed_at) {
      toast.info('Please confirm your email to enable cloud sync.', { id: 'email-confirm' });
      // Stash data so we can retry once email is confirmed
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
    if (!user) return;
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
            console.warn(`[cloud-load] Skipped ${skipped}/${cloudData.facts.length} facts with invalid dates`);
            toast.warning(`${skipped} record${skipped > 1 ? 's' : ''} had invalid dates and were skipped.`, {
              id: 'cloud-date-warning',
            });
          }

          if (parsedFacts.length === 0) {
            console.warn('[cloud-load] No valid facts after date validation — skipping cloud data');
            return;
          }

          const validData: PortfolioData = { facts: parsedFacts, refSources: cloudData.refSources };
          setData(validData);
          setIsMockData(false);
          setDefaultDateRange(validData);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(validData));
          localStorage.setItem(MOCK_FLAG_KEY, 'false'); // mark as real data
        }
      } catch (e) {
        console.error('Failed to load from cloud:', e);
      }
    };
    loadFromCloud();
  }, [user, keySession, setDefaultDateRange]);

  // Load from localStorage for guests
  useEffect(() => {
    if (user) return; // cloud load handles authenticated users
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
          console.warn(`[local-cache] Skipped ${skipped}/${parsed.facts.length} facts with invalid dates`);
        }

        if (validFacts.length > 0) {
          const validData = { ...parsed, facts: validFacts };
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
  }, [setDefaultDateRange, user]);

  const loadFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      // exceljs (~700 KB) is heavy — load it only when a user actually drops a spreadsheet.
      const { parsePortfolioExcel } = await import('@/lib/dataProcessor');
      const parsed = await parsePortfolioExcel(buffer);
      setData(parsed);
      setIsMockData(false);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      localStorage.setItem(MOCK_FLAG_KEY, 'false'); // mark as real data
      setDefaultDateRange(parsed);
      saveToCloud(parsed);
      toast.success(`Loaded ${parsed.facts.length} records from ${file.name}`);
    } catch (e: unknown) {
      console.error('Failed to parse file:', e);
      const msg = e instanceof Error ? e.message : 'Failed to parse Excel file. Check the format and try again.';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [saveToCloud, setDefaultDateRange]);

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

        // Persist
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
        localStorage.setItem(MOCK_FLAG_KEY, 'false');
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
        const newData: PortfolioData = { facts: newFacts, refSources: newRefSources };

        // Persist as real data
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
        localStorage.setItem(MOCK_FLAG_KEY, 'false');
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
          facts: [...remainingFacts, ...newFacts],
          refSources: newRefSources,
        };

        // Persist
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
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
        facts: [...prev.facts, ...newFacts],
        refSources: newRefSources,
      };

      // Persist
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
      setDefaultDateRange(updatedData);
      saveToCloud(updatedData);
      toast.success(`Added measurement with ${entries.length} source${entries.length > 1 ? 's' : ''}`);
      return updatedData;
    });
  }, [isMockData, saveToCloud, setDefaultDateRange]);

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      saveToCloud(updated);
      return updated;
    });
  }, [saveToCloud]);

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
      });
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
      });
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
    updateRefSource,
    isLoading,
    isMockData,
    syncStatus,
    retrySync,
    lastCurrencyBySource,
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}
