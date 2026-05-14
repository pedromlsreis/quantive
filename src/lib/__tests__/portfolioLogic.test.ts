import { describe, it, expect, beforeEach } from 'vitest';
import { generateMockData } from '@/lib/mockData';
import type { PortfolioData, Snapshot, KPIData, EnrichedFact } from '@/lib/types';

/**
 * Unit tests for core portfolio computation logic extracted from PortfolioContext.
 * Tests snapshot grouping, KPI calculation, filtering, and enrichment.
 */

/** Enrich facts by joining with refSources. */
function enrichFacts(data: PortfolioData): EnrichedFact[] {
  const sourceMap = new Map(data.refSources.map(s => [s.idSource.trim(), s]));
  return data.facts.map(f => {
    const source = sourceMap.get(f.idSource.trim());
    return {
      ...f,
      volatType: source?.volatType ?? 'Unknown',
      isLiquid: source?.transferableInDays ?? false,
    };
  });
}

/** Group enriched facts into date-keyed snapshots. */
function buildSnapshots(facts: EnrichedFact[]): Snapshot[] {
  const grouped = new Map<number, EnrichedFact[]>();
  facts.forEach(f => {
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
        isLiquid: f.isLiquid,
      })),
    }));
}

describe('enrichFacts', () => {
  it('maps volatType and isLiquid from refSources', () => {
    const data = generateMockData();
    const enriched = enrichFacts(data);

    expect(enriched.length).toBe(data.facts.length);
    const savings = enriched.find(e => e.idSource === 'Savings Account');
    expect(savings).toBeDefined();
    expect(savings!.volatType).toBe('Non-Volatile');
    expect(savings!.isLiquid).toBe(true);
  });

  it('defaults to Unknown / false for unmatched sources', () => {
    const data: PortfolioData = {
      facts: [{ date: new Date(), idSource: 'Mystery', sourceVl: 100, currency: 'EUR' }],
      refSources: [],
    };
    const enriched = enrichFacts(data);
    expect(enriched[0].volatType).toBe('Unknown');
    expect(enriched[0].isLiquid).toBe(false);
  });
});

describe('buildSnapshots', () => {
  it('groups facts by date and sums totals', () => {
    const data = generateMockData();
    const enriched = enrichFacts(data);
    const snapshots = buildSnapshots(enriched);

    expect(snapshots.length).toBeGreaterThan(0);

    // Each snapshot should have 6 sources (mock data has 6)
    snapshots.forEach(s => {
      expect(s.sources.length).toBe(6);
      const summedTotal = s.sources.reduce((sum, src) => sum + src.value, 0);
      expect(s.total).toBeCloseTo(summedTotal, 2);
    });
  });

  it('returns snapshots sorted by date ascending', () => {
    const data = generateMockData();
    const snapshots = buildSnapshots(enrichFacts(data));
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i].date.getTime()).toBeGreaterThanOrEqual(snapshots[i - 1].date.getTime());
    }
  });
});

/** Mirror of the KPI computation in PortfolioContext. */
function computeKpis(snapshots: Snapshot[]): Pick<KPIData, 'volatilePercent' | 'volatilityDataAvailable' | 'liquidPercent'> {
  if (snapshots.length === 0) return { volatilePercent: 0, volatilityDataAvailable: false, liquidPercent: 0 };
  const latest = snapshots[snapshots.length - 1];
  const currentNetWorth = latest.total;
  const volatilityDataAvailable = latest.sources.some(s => s.volatType.toLowerCase() !== 'unknown');
  const volatileTotal = latest.sources
    .filter(s => s.volatType.toLowerCase().includes('volatile') && !s.volatType.toLowerCase().includes('non'))
    .reduce((sum, s) => sum + s.value, 0);
  const liquidTotal = latest.sources.filter(s => s.isLiquid).reduce((sum, s) => sum + s.value, 0);
  return {
    volatilityDataAvailable,
    volatilePercent: currentNetWorth > 0 ? (volatileTotal / currentNetWorth) * 100 : 0,
    liquidPercent: currentNetWorth > 0 ? (liquidTotal / currentNetWorth) * 100 : 0,
  };
}

describe('computeKpis', () => {
  it('reports volatilityDataAvailable=true and non-zero volatilePercent with known volatility types', () => {
    const data = generateMockData();
    const snapshots = buildSnapshots(enrichFacts(data));
    const kpis = computeKpis(snapshots);

    expect(kpis.volatilityDataAvailable).toBe(true);
    expect(kpis.volatilePercent).toBeGreaterThan(0);
  });

  it('reports volatilityDataAvailable=false and 0% volatile when all sources have Unknown volatility', () => {
    const snapshot: Snapshot = {
      date: new Date(),
      total: 1000,
      sources: [
        { name: 'A', value: 600, volatType: 'Unknown', isLiquid: true },
        { name: 'B', value: 400, volatType: 'Unknown', isLiquid: false },
      ],
    };
    const kpis = computeKpis([snapshot]);

    expect(kpis.volatilityDataAvailable).toBe(false);
    expect(kpis.volatilePercent).toBe(0);
  });

  it('counts Highly Volatile as volatile and Non-Volatile as non-volatile', () => {
    const snapshot: Snapshot = {
      date: new Date(),
      total: 1000,
      sources: [
        { name: 'A', value: 200, volatType: 'Highly Volatile', isLiquid: true },
        { name: 'B', value: 300, volatType: 'Volatile', isLiquid: true },
        { name: 'C', value: 500, volatType: 'Non-Volatile', isLiquid: false },
      ],
    };
    const kpis = computeKpis([snapshot]);

    expect(kpis.volatilityDataAvailable).toBe(true);
    expect(kpis.volatilePercent).toBeCloseTo(50, 5); // (200+300)/1000 * 100
  });

  it('returns 0% liquid when no sources are liquid', () => {
    const snapshot: Snapshot = {
      date: new Date(),
      total: 500,
      sources: [{ name: 'A', value: 500, volatType: 'Non-Volatile', isLiquid: false }],
    };
    expect(computeKpis([snapshot]).liquidPercent).toBe(0);
  });
});

describe('filter logic', () => {
  it('filters by liquid status', () => {
    const data = generateMockData();
    const enriched = enrichFacts(data);
    const liquidOnly = enriched.filter(f => f.isLiquid);
    const nonLiquidOnly = enriched.filter(f => !f.isLiquid);

    expect(liquidOnly.length).toBeGreaterThan(0);
    expect(nonLiquidOnly.length).toBeGreaterThan(0);
    expect(liquidOnly.length + nonLiquidOnly.length).toBe(enriched.length);
  });

  it('filters by volatType', () => {
    const data = generateMockData();
    const enriched = enrichFacts(data);
    const volatile = enriched.filter(f => f.volatType === 'Volatile');
    expect(volatile.length).toBeGreaterThan(0);
    const volatileSourceNames = new Set(volatile.map(f => f.idSource));
    expect(volatileSourceNames.has('ETF World')).toBe(true);
  });

  it('filters by date range', () => {
    const data = generateMockData();
    const enriched = enrichFacts(data);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const recent = enriched.filter(f => f.date >= cutoff);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThan(enriched.length);
  });
});
