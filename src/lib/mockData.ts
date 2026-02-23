import { PortfolioData, FactRow, RefSource, RefVolatType } from './types';

function monthDate(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

const sources = ['Savings Account', 'ETF World', 'ETF Bonds', 'Crypto BTC', 'Real Estate Fund', 'Pension Plan'];

const refSources: RefSource[] = [
  { idSource: 'Savings Account', idVolatType: 1, isCrypto: false, transferableInDays: true },
  { idSource: 'ETF World', idVolatType: 2, isCrypto: false, transferableInDays: true },
  { idSource: 'ETF Bonds', idVolatType: 1, isCrypto: false, transferableInDays: true },
  { idSource: 'Crypto BTC', idVolatType: 3, isCrypto: true, transferableInDays: true },
  { idSource: 'Real Estate Fund', idVolatType: 2, isCrypto: false, transferableInDays: false },
  { idSource: 'Pension Plan', idVolatType: 1, isCrypto: false, transferableInDays: false },
];

const refVolatTypes: RefVolatType[] = [
  { idVolatType: 1, volatTypeDsc: 'Non-Volatile' },
  { idVolatType: 2, volatTypeDsc: 'Volatile' },
  { idVolatType: 3, volatTypeDsc: 'Highly Volatile' },
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
  const startYear = 2022;
  const endYear = 2025;

  for (let y = startYear; y <= endYear; y++) {
    const maxMonth = y === endYear ? 2 : 12;
    for (let m = 1; m <= maxMonth; m++) {
      const monthsElapsed = (y - startYear) * 12 + (m - 1);
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
    }
  }

  return { facts, refSources, refVolatTypes };
}
