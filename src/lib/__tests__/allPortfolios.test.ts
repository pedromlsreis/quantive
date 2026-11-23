import { describe, it, expect } from 'vitest';
import {
  coerceShares,
  combinedStart,
  combinePortfolios,
  combinedSourceName,
  factTimeBounds,
  parseShareInput,
  shareOf,
  summariseParts,
  withDistinctNames,
  type PortfolioPart,
} from '@/lib/allPortfolios';
import type { CurrencyCode } from '@/lib/currencies';
import type { FactRow, PortfolioData } from '@/lib/types';

const day = (m: number, d: number) => new Date(2026, m, d);
const fact = (date: Date, idSource: string, sourceVl: number, currency: CurrencyCode = 'EUR'): FactRow =>
  ({ date, idSource, sourceVl, currency });
const portfolio = (facts: FactRow[]): PortfolioData => ({
  facts,
  refSources: [...new Set(facts.map((f) => f.idSource))].map((idSource) => ({
    idSource,
    volatType: 'Non-volatile',
    transferableInDays: true,
    category: 'Bank',
  })),
  goals: [],
});
const part = (id: string, name: string, data: PortfolioData | null, share = 100): PortfolioPart => ({ id, name, data, share });

/** Totals per day, as the overview's snapshots would add them up (single currency). */
function totals(data: PortfolioData | null): Array<[string, number]> {
  const byDay = new Map<string, number>();
  for (const f of data?.facts ?? []) {
    const key = f.date.toDateString();
    byDay.set(key, (byDay.get(key) ?? 0) + f.sourceVl);
  }
  return [...byDay.entries()];
}

describe('combinePortfolios', () => {
  it('carries each portfolio forward to the days only the other was measured on', () => {
    const personal = portfolio([fact(day(0, 1), 'Savings', 100), fact(day(1, 1), 'Savings', 120)]);
    const joint = portfolio([fact(day(0, 15), 'House', 1000), fact(day(1, 15), 'House', 1100)]);
    const combined = combinePortfolios([part('personal', 'Personal', personal), part('p1', 'Joint', joint)]);
    // Starts on Joint's first day, with Personal's 1 Jan entry carried into it.
    expect(totals(combined)).toEqual([
      [day(0, 15).toDateString(), 1100],
      [day(1, 1).toDateString(), 1120],
      [day(1, 15).toDateString(), 1220],
    ]);
  });

  it("starts once every counted portfolio has an entry, so a new portfolio isn't growth", () => {
    const personal = portfolio([fact(new Date(2024, 0, 1), 'Savings', 100_000), fact(day(9, 1), 'Savings', 130_000)]);
    const joint = portfolio([fact(day(9, 20), 'House', 200_000)]);
    const combined = combinePortfolios([part('personal', 'Personal', personal), part('p1', 'Joint', joint, 50)]);
    expect(totals(combined)).toEqual([[day(9, 20).toDateString(), 230_000]]);
    expect(combinedStart([part('personal', 'Personal', personal), part('p1', 'Joint', joint, 50)])).toEqual(day(9, 20));
  });

  it('leaves the start alone when no history is cut, and ignores portfolios left out', () => {
    const personal = portfolio([fact(day(0, 1), 'Savings', 100)]);
    const joint = portfolio([fact(day(0, 1), 'House', 1000)]);
    const later = portfolio([fact(day(5, 1), 'Shares', 10)]);
    expect(combinedStart([part('personal', 'Personal', personal), part('p1', 'Joint', joint)])).toBeNull();
    // At 0% a later portfolio doesn't move the start.
    expect(combinedStart([part('personal', 'Personal', personal), part('p2', 'Later', later, 0)])).toBeNull();
  });

  it('counts a portfolio at the share of it', () => {
    const joint = portfolio([fact(day(0, 1), 'House', 300_000), fact(day(0, 1), 'Mortgage', -200_000)]);
    const combined = combinePortfolios([part('p1', 'Joint', joint, 50)]);
    expect(combined!.facts.map((f) => [f.idSource, f.sourceVl])).toEqual([
      ['Joint · House', 150_000],
      ['Joint · Mortgage', -100_000],
    ]);
  });

  it('leaves out a portfolio at 0% and one without content', () => {
    const personal = portfolio([fact(day(0, 1), 'Savings', 100)]);
    const company = portfolio([fact(day(0, 20), 'Shares', 5000)]);
    const combined = combinePortfolios([
      part('personal', 'Personal', personal),
      part('p1', 'Company', company, 0),
      part('p2', 'Empty', null),
    ]);
    expect(totals(combined)).toEqual([[day(0, 1).toDateString(), 100]]);
    expect(combined!.refSources.map((s) => s.idSource)).toEqual(['Personal · Savings']);
  });

  it('is null when nothing counted has an entry', () => {
    expect(combinePortfolios([])).toBeNull();
    expect(combinePortfolios([part('p1', 'Joint', portfolio([fact(day(0, 1), 'House', 1)]), 0)])).toBeNull();
    expect(combinePortfolios([part('p1', 'Joint', { facts: [], refSources: [], goals: [] })])).toBeNull();
  });

  it('keeps each fact in its own currency, so carried facts are valued at the later day', () => {
    const personal = portfolio([fact(day(0, 1), 'Savings', 100, 'EUR'), fact(day(1, 1), 'Savings', 100, 'EUR')]);
    const us = portfolio([fact(day(0, 10), 'Brokerage', 1000, 'USD')]);
    const combined = combinePortfolios([part('personal', 'Personal', personal), part('p1', 'US', us)]);
    const carried = combined!.facts.filter((f) => f.date.getTime() === day(1, 1).getTime());
    expect(carried.map((f) => [f.idSource, f.sourceVl, f.currency])).toEqual([
      ['Personal · Savings', 100, 'EUR'],
      ['US · Brokerage', 1000, 'USD'],
    ]);
  });

  it('counts only the later snapshot when one portfolio has two on a calendar day', () => {
    // An imported row (here 01:00) beside a composer entry at local midnight, same day.
    const personal = portfolio([
      fact(new Date(2026, 0, 1, 0, 0), 'Savings', 100),
      fact(new Date(2026, 0, 1, 1, 0), 'Savings', 120),
      fact(new Date(2026, 0, 1, 1, 0), 'Brokerage', 30),
    ]);
    const combined = combinePortfolios([part('personal', 'Personal', personal)]);
    expect(totals(combined)).toEqual([[day(0, 1).toDateString(), 150]]);
  });

  it('merges days by calendar day and dates them at local midnight', () => {
    const personal = portfolio([fact(new Date(2026, 0, 1, 23, 0), 'Savings', 100)]);
    const joint = portfolio([fact(day(0, 1), 'House', 1000)]);
    const combined = combinePortfolios([part('personal', 'Personal', personal), part('p1', 'Joint', joint)]);
    expect(new Set(combined!.facts.map((f) => f.date.getTime()))).toEqual(new Set([day(0, 1).getTime()]));
  });

  it('keeps source metadata, prefixes names, and carries no goals', () => {
    const personal: PortfolioData = {
      ...portfolio([fact(day(0, 1), ' Savings ', 100)]),
      goals: [{ id: 'g', name: 'House', targetAmount: 1, targetCurrency: 'EUR', targetDate: '2030-01-01', createdAt: '2026-01-01' }],
    };
    personal.refSources[0].isPaused = true;
    const combined = combinePortfolios([part('personal', 'Personal', personal)]);
    expect(combined!.refSources).toEqual([
      { idSource: 'Personal · Savings', volatType: 'Non-volatile', transferableInDays: true, category: 'Bank', isPaused: true },
    ]);
    expect(combined!.facts[0].idSource).toBe('Personal · Savings');
    expect(combined!.goals).toEqual([]);
  });
});

describe('summariseParts', () => {
  // EUR at par; USD worth 0.9 on 1 Feb and 0.8 on any other day.
  const convert = (value: number, currency: CurrencyCode, date: Date) =>
    currency === 'USD' ? value * (date.getTime() === day(1, 1).getTime() ? 0.9 : 0.8) : value;

  it('values every counted portfolio on the latest entry day, so the rows add up to the total', () => {
    const personal = portfolio([fact(day(1, 1), 'Savings', 100)]);
    const us = portfolio([fact(day(0, 10), 'Brokerage', 1000, 'USD')]);
    const { asOf, rows, total } = summariseParts(
      [part('personal', 'Personal', personal), part('p1', 'US', us, 50)],
      convert,
    );
    expect(asOf).toEqual(day(1, 1));
    expect(rows.map((r) => [r.id, r.lastEntry, r.value, r.counted])).toEqual([
      ['personal', day(1, 1), 100, 100],
      ['p1', day(0, 10), 900, 450],
    ]);
    expect(total).toBe(550);
  });

  it('shows a portfolio without entries and one left out at 0%', () => {
    const personal = portfolio([fact(day(0, 1), 'Savings', 100)]);
    const company = portfolio([fact(day(2, 1), 'Shares', 1000, 'USD')]);
    const { asOf, rows, total } = summariseParts(
      [part('personal', 'Personal', personal), part('p1', 'Company', company, 0), part('p2', 'New', null)],
      convert,
    );
    expect(asOf).toEqual(day(0, 1));
    // Newer than asOf, so valued on its own day.
    expect(rows[1]).toMatchObject({ value: 800, counted: 0, lastEntry: day(2, 1) });
    expect(rows[2]).toMatchObject({ value: null, counted: null, lastEntry: null });
    expect(total).toBe(100);
  });

  it('is NaN while a rate is missing, rather than a total that silently drops a portfolio', () => {
    const us = portfolio([fact(day(0, 1), 'Brokerage', 1000, 'USD')]);
    const { total } = summariseParts([part('p1', 'US', us)], () => NaN);
    expect(total).toBeNaN();
  });
});

describe('shares', () => {
  it('defaults to 100% for a portfolio without one', () => {
    expect(shareOf({ p1: 50 }, 'p1')).toBe(50);
    expect(shareOf({ p1: 50 }, 'p2')).toBe(100);
    expect(shareOf(null, 'p1')).toBe(100);
  });

  it('drops malformed entries from a decoded blob and clamps the rest', () => {
    expect(coerceShares({ a: 50, b: '50', c: NaN, d: -1, e: 150, f: 33.333 })).toEqual({ a: 50, d: 0, e: 100, f: 33.33 });
    expect(coerceShares(undefined)).toEqual({});
    expect(coerceShares([50])).toEqual({});
  });

  it.each([
    ['50', 50],
    [' 50 % ', 50],
    ['33,33', 33.33],
    ['33.333', 33.33],
    ['0', 0],
    ['.5', 0.5],
    ['100', 100],
  ])('reads %j as %d', (text, value) => {
    expect(parseShareInput(text)).toEqual({ value, error: null });
  });

  it.each(['', 'half', '-5', '1e2', '50.5.5'])('refuses %j', (text) => {
    expect(parseShareInput(text).value).toBeNull();
  });

  it('refuses more than 100%', () => {
    expect(parseShareInput('100.01')).toEqual({ value: null, error: "A share can't be more than 100%." });
  });

  it('prefixes a source with its portfolio', () => {
    expect(combinedSourceName('Joint', '  House ')).toBe('Joint · House');
  });
});

describe('withDistinctNames', () => {
  // Value: protects=two portfolios with the same name (one owned, one joined) keep separate sources in the combined view;
  // fails_when=both prefix their sources with the same name, so the Sources page and Allocations merge them;
  // why_new=every other test uses distinct portfolio names; seam=none; no_claim=none beyond protects (pure unit)
  it('renames a later portfolio that repeats a name, ignoring case', () => {
    const house = portfolio([fact(day(0, 15), 'House', 1000)]);
    const parts = withDistinctNames([part('p1', 'Joint', house), part('p2', 'joint', house)]);
    expect(parts.map((p) => p.name)).toEqual(['Joint', 'joint (2)']);
    expect(combinePortfolios(parts)!.refSources.map((s) => s.idSource)).toEqual(['Joint · House', 'joint (2) · House']);
  });

  // Value: protects=a portfolio and source name that contain the separator never rebuild another portfolio's source name;
  // fails_when=only the names are compared, so 'A' + 'B · C' and 'A · B' + 'C' both become 'A · B · C';
  // why_new=the repeat test covers equal names only; seam=none; no_claim=none beyond protects (pure unit)
  it('renames a portfolio whose sources would collide with another portfolio\'s', () => {
    const parts = withDistinctNames([
      part('p1', 'A', portfolio([fact(day(0, 15), 'B · C', 1)])),
      part('p2', 'A · B', portfolio([fact(day(0, 15), 'C', 2)])),
    ]);
    expect(parts.map((p) => p.name)).toEqual(['A', 'A · B (2)']);
  });

  it('leaves distinct names, and portfolios without entries, as they are', () => {
    const input = [part('personal', 'Personal', null), part('p1', 'Joint', portfolio([fact(day(0, 15), 'House', 1)]))];
    expect(withDistinctNames(input)).toEqual(input);
  });
});

describe('factTimeBounds', () => {
  // Value: protects=the date range of a combined view with more balances than an engine accepts as arguments;
  // fails_when=the bounds come from Math.min(...)/Math.max(...), which throws a RangeError past about 125,000 facts in V8 (65,536 in Safari);
  // why_new=no other test builds a view this large; seam=none; no_claim=Safari itself (Node only)
  it('finds the earliest and latest fact among more facts than a spread accepts', () => {
    const facts = Array.from({ length: 200_000 }, (_, i) => ({ date: day(0, 1 + (i % 365)) }));
    expect(factTimeBounds(facts)).toEqual([day(0, 1).getTime(), day(0, 365).getTime()]);
  });

  it('is null without facts', () => {
    expect(factTimeBounds([])).toBeNull();
  });
});
