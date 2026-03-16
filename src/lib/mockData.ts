import { PortfolioData, FactRow, RefSource } from './types';

function monthDate(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

const sources = ['Savings Account', 'ETF World', 'ETF Bonds', 'Crypto BTC', 'Real Estate Fund', 'Pension Plan'];

const refSources: RefSource[] = [
  { idSource: 'Savings Account', volatType: 'Non-Volatile', transferableInDays: true },
  { idSource: 'ETF World', volatType: 'Volatile', transferableInDays: true },
  { idSource: 'ETF Bonds', volatType: 'Non-Volatile', transferableInDays: true },
  { idSource: 'Crypto BTC', volatType: 'Highly Volatile', transferableInDays: true },
  { idSource: 'Real Estate Fund', volatType: 'Volatile', transferableInDays: false },
  { idSource: 'Pension Plan', volatType: 'Non-Volatile', transferableInDays: false },
];

// Base values and monthly growth multipliers per source
const baseValues: Record<string, number> = {
  'Savings Account': 15000,
  'ETF World': 25000,
  'ETF Bonds': 10000,
  'Crypto BTC': 5000,
  'Real Estate Fund': 20000,
  'Pension Plan': 30000,
};

const growthRates: Record<string, number> = {
  'Savings Account': 0.002,
  'ETF World': 0.008,
  'ETF Bonds': 0.003,
  'Crypto BTC': 0.02,
  'Real Estate Fund': 0.005,
  'Pension Plan': 0.004,
};

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
        const noise = 1 + (Math.sin(monthsElapsed * 1.7 + src.length) * 0.03);
        const value = base * Math.pow(1 + rate, monthsElapsed) * noise;
        facts.push({
          date: monthDate(y, m),
          idSource: src,
          sourceVl: Math.round(value * 100) / 100,
        });
      }
      monthsElapsed++;
    }
  }

  return { facts, refSources };
}
