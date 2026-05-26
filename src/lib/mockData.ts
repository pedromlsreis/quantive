/**
 * @module mockData
 * Generates deterministic mock portfolio data for the demo mode.
 * Produces 6 financial sources across ~3.5 years of monthly snapshots
 * with realistic growth rates and sinusoidal noise.
 */

import { PortfolioData, FactRow, RefSource, Snapshot, EnrichedFact, Goal } from './types';

/** Create a Date for the 1st of the given month (1-indexed). */
function monthDate(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

/** The 6 mock financial source names. */
const sources: readonly string[] = [
  'Savings Account',
  'ETF World',
  'ETF Bonds',
  'Crypto BTC',
  'Real Estate Fund',
  'Pension Plan',
];

/** Reference metadata for each mock source. */
const refSources: RefSource[] = [
  { idSource: 'Savings Account', volatType: 'Non-Volatile', transferableInDays: true },
  { idSource: 'ETF World', volatType: 'Volatile', transferableInDays: true },
  { idSource: 'ETF Bonds', volatType: 'Non-Volatile', transferableInDays: true },
  { idSource: 'Crypto BTC', volatType: 'Highly Volatile', transferableInDays: true },
  { idSource: 'Real Estate Fund', volatType: 'Volatile', transferableInDays: false },
  { idSource: 'Pension Plan', volatType: 'Non-Volatile', transferableInDays: false },
];

/** Starting monetary values for each source. */
const baseValues: Readonly<Record<string, number>> = {
  'Savings Account': 15000,
  'ETF World': 25000,
  'ETF Bonds': 10000,
  'Crypto BTC': 5000,
  'Real Estate Fund': 20000,
  'Pension Plan': 30000,
};

/** Monthly compound growth rates per source. */
const growthRates: Readonly<Record<string, number>> = {
  'Savings Account': 0.002,
  'ETF World': 0.008,
  'ETF Bonds': 0.003,
  'Crypto BTC': 0.02,
  'Real Estate Fund': 0.005,
  'Pension Plan': 0.004,
};

/**
 * Generate a complete mock PortfolioData dataset.
 * Creates monthly snapshots going back ~3.5 years from the current month.
 * Values follow compound growth with sinusoidal noise for realism.
 */
export function generateMockData(): PortfolioData {
  const facts: FactRow[] = [];
  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1; // 1-indexed
  const startDate = new Date(endYear, endMonth - 1, 1);
  startDate.setMonth(startDate.getMonth() - 42); // 3.5 years back
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1;

  let monthsElapsed = 0;
  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 1;
    const mEnd = y === endYear ? endMonth : 12;
    for (let m = mStart; m <= mEnd; m++) {
      for (const src of sources) {
        const base = baseValues[src];
        const rate = growthRates[src];
        // Deterministic noise via sin() keyed to elapsed months and source name length
        const noise = 1 + (Math.sin(monthsElapsed * 1.7 + src.length) * 0.03);
        const value = base * Math.pow(1 + rate, monthsElapsed) * noise;
        facts.push({
          date: monthDate(y, m),
          idSource: src,
          sourceVl: Math.round(value * 100) / 100,
          currency: 'EUR',
        });
      }
      monthsElapsed++;
    }
  }

  return { facts, refSources, goals: generateMockGoals() };
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateMockGoals(): Goal[] {
  const now = new Date();
  const endOfYear = new Date(now.getFullYear(), 11, 31);
  const sixMonthsOut = new Date(now);
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
  const retirementYear = now.getFullYear() + 25;

  return [
    {
      id: 'demo-goal-savings',
      name: 'Hit €120k by year-end',
      targetAmount: 120000,
      targetCurrency: 'EUR',
      targetDate: isoDate(endOfYear),
      createdAt: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
    },
    {
      id: 'demo-goal-emergency',
      name: 'Six-month emergency fund',
      targetAmount: 18000,
      targetCurrency: 'EUR',
      targetDate: isoDate(sixMonthsOut),
      createdAt: new Date(now.getFullYear() - 1, 6, 1).toISOString(),
    },
    {
      id: 'demo-goal-retirement',
      name: `Retire by ${retirementYear}`,
      targetAmount: 1000000,
      targetCurrency: 'EUR',
      targetDate: `${retirementYear}-01-01`,
      createdAt: new Date(now.getFullYear() - 2, 0, 1).toISOString(),
    },
  ];
}

/**
 * Group a PortfolioData into Snapshot[] (one entry per unique date with
 * summed totals and per-source breakdowns). Mirrors the snapshot derivation
 * in PortfolioContext, extracted so marketing surfaces can render dashboard
 * components without mounting the full provider stack.
 */
export function toSnapshots(data: PortfolioData): Snapshot[] {
  const sourceMap = new Map(data.refSources.map(s => [s.idSource.trim(), s]));
  const enriched: EnrichedFact[] = data.facts.map(f => {
    const source = sourceMap.get(f.idSource.trim());
    return {
      ...f,
      volatType: source?.volatType ?? 'Unknown',
      isLiquid: source?.transferableInDays ?? false,
    };
  });

  const grouped = new Map<number, EnrichedFact[]>();
  enriched.forEach(f => {
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
