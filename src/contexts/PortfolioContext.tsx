import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { PortfolioData, EnrichedFact, FilterState, Snapshot, KPIData } from '@/lib/types';
import { parsePortfolioExcel } from '@/lib/dataProcessor';
import { generateMockData } from '@/lib/mockData';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'portfolio-data';

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
  isLoading: boolean;
}

const defaultFilters: FilterState = {
  dateRange: [null, null],
  sources: [],
  volatTypes: [],
  cryptoFilter: 'all',
  liquidFilter: 'all',
};

const defaultKpis: KPIData = {
  currentNetWorth: 0,
  momChange: 0,
  yoyChange: 0,
  yoyNetWorth: 0,
  sourceCount: 0,
  volatilePercent: 0,
  cryptoPercent: 0,
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
  const { user } = useAuth();

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

  // Save data to cloud when user is authenticated
  const saveToCloud = useCallback(async (portfolioData: PortfolioData) => {
    if (!user) return;
    try {
      const { data: existing } = await supabase
        .from('portfolio_snapshots')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('portfolio_snapshots')
          .update({ data: portfolioData as any })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('portfolio_snapshots')
          .insert({ user_id: user.id, data: portfolioData as any });
      }
    } catch (e) {
      console.error('Failed to sync to cloud:', e);
    }
  }, [user]);

  // Load from cloud when user signs in
  useEffect(() => {
    if (!user) return;
    const loadFromCloud = async () => {
      try {
        const { data: rows } = await supabase
          .from('portfolio_snapshots')
          .select('data')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (rows && rows.length > 0) {
          const cloudData = rows[0].data as any;
          cloudData.facts = cloudData.facts.map((f: any) => ({ ...f, date: new Date(f.date) }));
          setData(cloudData);
          setDefaultDateRange(cloudData);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
        }
      } catch (e) {
        console.error('Failed to load from cloud:', e);
      }
    };
    loadFromCloud();
  }, [user, setDefaultDateRange]);

  // Load from localStorage for guests
  useEffect(() => {
    if (user) return; // cloud load handles authenticated users
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.facts = parsed.facts.map((f: any) => ({ ...f, date: new Date(f.date) }));
        setData(parsed);
        setDefaultDateRange(parsed);
      }
    } catch (e) {
      console.error('Failed to load cached data:', e);
    }
  }, [setDefaultDateRange, user]);

  const loadFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parsePortfolioExcel(buffer);
      setData(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      setDefaultDateRange(parsed);
      saveToCloud(parsed);
      toast.success(`Loaded ${parsed.facts.length} records from ${file.name}`);
    } catch (e: any) {
      console.error('Failed to parse file:', e);
      toast.error(e.message || 'Failed to parse Excel file.');
    } finally {
      setIsLoading(false);
    }
  }, [saveToCloud, setDefaultDateRange]);

  const loadMockData = useCallback(() => {
    const mock = generateMockData();
    setData(mock);
    setDefaultDateRange(mock);
    toast.success('Loaded demo data');
  }, [setDefaultDateRange]);

  const clearData = useCallback(() => {
    setData(null);
    setFilters(defaultFilters);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const updateFilters = useCallback((partial: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...partial }));
  }, []);

  const enrichedFacts = useMemo<EnrichedFact[]>(() => {
    if (!data) return [];
    const sourceMap = new Map(data.refSources.map(s => [s.idSource.trim(), s]));
    const volatMap = new Map(data.refVolatTypes.map(v => [v.idVolatType, v.volatTypeDsc]));

    // Normalize volatility type descriptions to deduplicate (e.g. "Volatile" and "Volatile" with different IDs)
    const normalizedVolatMap = new Map<number, string>();
    const seenVolatLabels = new Map<string, string>();
    for (const [id, dsc] of volatMap.entries()) {
      const normalized = dsc.trim();
      if (seenVolatLabels.has(normalized.toLowerCase())) {
        normalizedVolatMap.set(id, seenVolatLabels.get(normalized.toLowerCase())!);
      } else {
        seenVolatLabels.set(normalized.toLowerCase(), normalized);
        normalizedVolatMap.set(id, normalized);
      }
    }

    return data.facts.map(f => {
      const source = sourceMap.get(f.idSource.trim());
      return {
        ...f,
        volatType: source ? (normalizedVolatMap.get(source.idVolatType) || 'Unknown') : 'Unknown',
        isCrypto: source?.isCrypto ?? false,
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
    return data.refVolatTypes.map(v => v.volatTypeDsc);
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
    if (filters.cryptoFilter !== 'all') result = result.filter(f => f.isCrypto === (filters.cryptoFilter === 'crypto'));
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
      .map(([ts, facts]) => ({
        date: new Date(ts),
        total: facts.reduce((sum, f) => sum + f.sourceVl, 0),
        sources: facts.map(f => ({
          name: f.idSource,
          value: f.sourceVl,
          volatType: f.volatType,
          isCrypto: f.isCrypto,
          isLiquid: f.isLiquid,
        })),
      }));
  }, [filteredFacts]);

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
    const volatileTotal = latest.sources.filter(s => s.volatType.toLowerCase().includes('volatile') && !s.volatType.toLowerCase().includes('non')).reduce((sum, s) => sum + s.value, 0);
    const cryptoTotal = latest.sources.filter(s => s.isCrypto).reduce((sum, s) => sum + s.value, 0);
    const liquidTotal = latest.sources.filter(s => s.isLiquid).reduce((sum, s) => sum + s.value, 0);

    return {
      currentNetWorth,
      momChange,
      yoyChange,
      yoyNetWorth,
      sourceCount,
      volatilePercent: currentNetWorth > 0 ? (volatileTotal / currentNetWorth) * 100 : 0,
      cryptoPercent: currentNetWorth > 0 ? (cryptoTotal / currentNetWorth) * 100 : 0,
      liquidPercent: currentNetWorth > 0 ? (liquidTotal / currentNetWorth) * 100 : 0,
    };
  }, [snapshots]);

  const value = {
    data,
    enrichedFacts,
    filters,
    updateFilters,
    snapshots,
    kpis,
    allSources,
    allVolatTypes,
    dateRange,
    loadFile,
    loadMockData,
    clearData,
    isLoading,
  };

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}
