/**
 * "All portfolios": one read-only view of every portfolio the user can open,
 * each counted at the user's share of it. Pure; PortfolioContext supplies the
 * portfolios and shows the result like any other portfolio, so every page
 * (overview, allocations, forecast, performance) works on the total.
 *
 * Shares are private to the user: they are saved in the personal portfolio's
 * encrypted blob (encryption.md §9.1), never in a shared one, so a partner
 * neither sees nor changes them.
 */

import type { CurrencyCode } from '@/lib/currencies';
import { toIsoDate } from '@/lib/fxConvert';
import type { FactRow, PortfolioData } from '@/lib/types';

export const ALL_PORTFOLIOS_ID = 'all';
export const ALL_PORTFOLIOS_NAME = 'All portfolios';

/** A portfolio counts in full until the user sets a share. */
export const DEFAULT_SHARE = 100;

/** Extra portfolio id → the user's share of it, in percent (0–100). */
export type PortfolioShares = Readonly<Record<string, number>>;

export interface PortfolioPart {
  id: string;
  name: string;
  data: PortfolioData | null;
  /** Percent, 0–100. At 0 the portfolio is left out. */
  share: number;
}

/** Shares are kept to two decimals, so 33.33% is as precise as it gets. */
function roundShare(value: number): number {
  return Math.round(value * 100) / 100;
}

export function shareOf(shares: PortfolioShares | null, portfolioId: string): number {
  return shares?.[portfolioId] ?? DEFAULT_SHARE;
}

/** The shares map from a decoded personal blob. Anything malformed is dropped, never thrown. */
export function coerceShares(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [id, raw] of Object.entries(value)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    out[id] = roundShare(Math.min(100, Math.max(0, raw)));
  }
  return out;
}

export type ShareInput = { value: number; error: null } | { value: null; error: string };

/** A share typed by the user: "50", "50%", "33.33" or "33,33". */
export function parseShareInput(text: string): ShareInput {
  const cleaned = text.trim().replace(/\s*%$/, '').replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) return { value: null, error: 'Enter your share as a number from 0 to 100.' };
  const value = Number(cleaned);
  if (value > 100) return { value: null, error: "A share can't be more than 100%." };
  return { value: roundShare(value), error: null };
}

/**
 * A source's name in the combined view. Portfolios can hold sources with the
 * same name, so each is prefixed with its portfolio's.
 */
export function combinedSourceName(portfolioName: string, idSource: string): string {
  return `${portfolioName} · ${idSource.trim()}`;
}

/**
 * The parts, renamed where needed so no two portfolios share a name or a
 * combined source name. Names are unique only within one user's own list: a
 * joined portfolio can carry the name of one the user owns, and a name or a
 * source can contain the separator. A later duplicate gets " (2)", " (3)"...
 */
export function withDistinctNames(parts: readonly PortfolioPart[]): PortfolioPart[] {
  const names = new Set<string>();
  const ids = new Set<string>();
  return parts.map((part) => {
    const sources = new Set([
      ...(part.data?.refSources.map((s) => s.idSource) ?? []),
      ...(part.data?.facts.map((f) => f.idSource) ?? []),
    ]);
    const taken = (name: string) =>
      names.has(name.toLocaleLowerCase()) || [...sources].some((s) => ids.has(combinedSourceName(name, s)));
    let name = part.name;
    for (let n = 2; taken(name); n += 1) name = `${part.name} (${n})`;
    names.add(name.toLocaleLowerCase());
    for (const s of sources) ids.add(combinedSourceName(name, s));
    return name === part.name ? part : { ...part, name };
  });
}

/**
 * The earliest and latest fact times, in ms; null without facts. A loop, not
 * Math.min(...): the combined view copies every portfolio's balances onto each
 * entry day, which can pass the number of arguments an engine accepts.
 */
export function factTimeBounds(facts: readonly { date: Date }[]): [number, number] | null {
  if (facts.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const f of facts) {
    const t = f.date.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return [min, max];
}

interface EntryDay {
  /** YYYY-MM-DD, so keys sort in date order. */
  key: string;
  date: Date;
  facts: FactRow[];
}

/**
 * A portfolio's entries grouped by calendar day, oldest first. A day holding
 * facts at two timestamps (an imported UTC-midnight row beside a composer
 * entry at local midnight) is two snapshots in that portfolio's own view, so
 * only the later one counts here, as it does there.
 */
function entryDays(data: PortfolioData): EntryDay[] {
  const days = new Map<string, EntryDay & { time: number }>();
  for (const fact of data.facts) {
    const key = toIsoDate(fact.date);
    const time = fact.date.getTime();
    let day = days.get(key);
    if (!day || time > day.time) {
      day = { key, date: new Date(fact.date.getFullYear(), fact.date.getMonth(), fact.date.getDate()), facts: [], time };
      days.set(key, day);
    }
    if (time === day.time) day.facts.push(fact);
  }
  return [...days.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map(({ key, date, facts }) => ({ key, date, facts }));
}

function counted(parts: readonly PortfolioPart[]): Array<{ part: PortfolioPart; days: EntryDay[] }> {
  return parts
    .filter((p) => p.share > 0 && p.data !== null)
    .map((part) => ({ part, days: entryDays(part.data!) }));
}

/** The first day every counted portfolio with entries has one: the latest of their first days. */
function startKey(included: Array<{ days: EntryDay[] }>): string {
  return included.reduce((latest, { days }) => (days.length > 0 && days[0].key > latest ? days[0].key : latest), '');
}

/**
 * The day the combined history starts, when that cuts some portfolio's
 * earlier entries out of it; null when no history is left out.
 */
export function combinedStart(parts: readonly PortfolioPart[]): Date | null {
  const withEntries = counted(parts).filter(({ days }) => days.length > 0);
  const start = startKey(withEntries);
  const cut = withEntries.some(({ days }) => days[0].key < start);
  return cut ? withEntries.flatMap(({ days }) => days).find((d) => d.key === start)!.date : null;
}

/**
 * Every counted portfolio as one PortfolioData, values scaled by the share.
 *
 * Portfolios are measured on different days. On each day any of them has an
 * entry, every portfolio contributes its latest entry on or before that day,
 * so a total never drops a portfolio just because it wasn't measured that
 * day. Carried facts keep their own currency, so they are valued at the
 * day's exchange rate.
 *
 * The series starts on the first day every counted portfolio has an entry
 * (combinedStart). Earlier days would hold only some portfolios, and the jump
 * when the rest arrive would read as growth in every pace, year-change and
 * forecast figure.
 *
 * Null when no counted portfolio has an entry. Goals stay with their portfolio.
 */
export function combinePortfolios(parts: readonly PortfolioPart[]): PortfolioData | null {
  const included = counted(parts);
  const start = startKey(included);
  const keys = [...new Set(included.flatMap(({ days }) => days.map((d) => d.key)))].filter((k) => k >= start).sort();
  if (keys.length === 0) return null;

  const dates = new Map(included.flatMap(({ days }) => days.map((d) => [d.key, d.date] as const)));
  const cursors = included.map(() => -1);
  const facts: FactRow[] = [];
  for (const key of keys) {
    const date = dates.get(key)!;
    included.forEach(({ part, days }, i) => {
      while (cursors[i] + 1 < days.length && days[cursors[i] + 1].key <= key) cursors[i] += 1;
      if (cursors[i] < 0) return;
      for (const f of days[cursors[i]].facts) {
        facts.push({
          date,
          idSource: combinedSourceName(part.name, f.idSource),
          sourceVl: (f.sourceVl * part.share) / 100,
          currency: f.currency,
        });
      }
    });
  }

  const refSources = included.flatMap(({ part }) =>
    part.data!.refSources.map((rs) => ({ ...rs, idSource: combinedSourceName(part.name, rs.idSource) })),
  );
  return { facts, refSources, goals: [] };
}

export interface PartSummary {
  id: string;
  name: string;
  share: number;
  /** The day of the portfolio's latest entry; null before its first. */
  lastEntry: Date | null;
  /** The whole portfolio at its latest entry, in the display currency. Null without entries; NaN while a rate is missing. */
  value: number | null;
  /** The value at the user's share: what the portfolio adds to the total. */
  counted: number | null;
}

/**
 * Each portfolio's latest value and what it adds to the total. Values are
 * converted on `asOf`, the latest entry among counted portfolios, which is
 * the day the combined view's latest total is valued on, so the rows add up
 * to that total. A portfolio left out at 0% with a newer entry is valued on
 * its own day.
 */
export function summariseParts(
  parts: readonly PortfolioPart[],
  convert: (value: number, currency: CurrencyCode, date: Date) => number,
): { asOf: Date | null; rows: PartSummary[]; total: number } {
  const latest = new Map(
    parts.map((p) => {
      const days = p.data ? entryDays(p.data) : [];
      return [p.id, days.length > 0 ? days[days.length - 1] : null] as const;
    }),
  );
  let asOf: Date | null = null;
  for (const p of parts) {
    const day = latest.get(p.id);
    if (p.share > 0 && day && (!asOf || day.date > asOf)) asOf = day.date;
  }

  const rows = parts.map((p): PartSummary => {
    const day = latest.get(p.id) ?? null;
    if (!day) return { id: p.id, name: p.name, share: p.share, lastEntry: null, value: null, counted: null };
    const at = asOf && asOf > day.date ? asOf : day.date;
    const value = day.facts.reduce((sum, f) => sum + convert(f.sourceVl, f.currency, at), 0);
    return { id: p.id, name: p.name, share: p.share, lastEntry: day.date, value, counted: (value * p.share) / 100 };
  });
  const total = rows.reduce((sum, r) => sum + (r.counted ?? 0), 0);
  return { asOf, rows, total };
}
