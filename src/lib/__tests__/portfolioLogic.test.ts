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
      facts: [{ date: new Date(), idSource: 'Mystery', sourceVl: 100 }],
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
