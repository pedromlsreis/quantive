/**
 * @module dashboardData
 * Pure derivations behind the overview: the change since the previous entry,
 * what moved between the last two entries, calendar-year rows and chart
 * ticks. No React, no storage; everything is recomputed from snapshots.
 */
import type { FactRow, Snapshot } from '@/lib/types';

export interface EntryChange {
  latest: Snapshot;
  previous: Snapshot | null;
  /** Latest total minus the previous entry's total (0 without a previous entry). */
  change: number;
  /** Change as a percentage of the previous total; null when undefined. */
  changePct: number | null;
}

/** The latest entry and its change against the one before it. */
export function latestChange(snapshots: Snapshot[]): EntryChange | null {
  const finite = snapshots.filter((s) => Number.isFinite(s.total));
  if (!finite.length) return null;
  const latest = finite[finite.length - 1];
  const previous = finite.length > 1 ? finite[finite.length - 2] : null;
  const change = previous ? latest.total - previous.total : 0;
  const changePct = previous && previous.total > 0 ? (change / previous.total) * 100 : null;
  return { latest, previous, change, changePct };
}

/** Change over roughly the last 12 months, measured from the entry nearest a year back. */
export function changeOverYear(snapshots: Snapshot[]): { from: Snapshot; change: number; changePct: number | null; fullYear: boolean } | null {
  const finite = snapshots.filter((s) => Number.isFinite(s.total));
  if (finite.length < 2) return null;
  const latest = finite[finite.length - 1];
  const target = new Date(latest.date);
  target.setFullYear(target.getFullYear() - 1);
  // The earliest entry on or after the date a year back; with less history,
  // the first entry (and the label says "since").
  const from = finite.find((s) => s.date >= target) ?? finite[0];
  const start = from === latest ? finite[0] : from;
  const fullYear = finite[0].date <= target;
  const change = latest.total - start.total;
  return { from: start, change, changePct: start.total > 0 ? (change / start.total) * 100 : null, fullYear };
}

export interface MovedRow {
  name: string;
  /** Value in the display currency at the latest entry. */
  now: number;
  /** Change in the display currency since the previous entry. */
  change: number;
  /** The native balance held; only the exchange rate moved the converted value. */
  fxOnly: boolean;
}

/** A source's native value and currency as of a date (its latest fact on or before it). */
function nativeAt(facts: FactRow[], name: string, date: Date): { value: number; currency: string } | null {
  let best: FactRow | null = null;
  for (const f of facts) {
    if (f.idSource !== name || f.date > date) continue;
    if (!best || f.date > best.date) best = f;
  }
  return best ? { value: best.sourceVl, currency: best.currency } : null;
}

/**
 * Sources whose value changed between the previous and the latest entry,
 * largest absolute change first. "Unchanged" is judged in each source's own
 * currency: a USD account whose balance held but whose euro value moved is
 * listed as exchange-rate-only and not counted as unchanged.
 */
export function whatMoved(previous: Snapshot, latest: Snapshot, facts: FactRow[]): { moved: MovedRow[]; unchanged: number } {
  const prevByName = new Map(previous.sources.map((s) => [s.name, s.value]));
  const moved: MovedRow[] = [];
  let unchanged = 0;
  for (const s of latest.sources) {
    const before = prevByName.get(s.name) ?? 0;
    const a = nativeAt(facts, s.name, previous.date);
    const b = nativeAt(facts, s.name, latest.date);
    const nativeHeld = !!a && !!b && a.currency === b.currency && Math.abs(a.value - b.value) < 0.005;
    const change = s.value - before;
    if (nativeHeld && Math.abs(change) < 0.5) {
      unchanged++;
      continue;
    }
    moved.push({ name: s.name, now: s.value, change, fxOnly: nativeHeld });
  }
  moved.sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
  return { moved, unchanged };
}

export interface YearRow {
  year: number;
  start: number;
  end: number;
  change: number;
  changePct: number | null;
  /** Set when the year's entries don't span it: its first or last entry date. */
  from?: Date;
  to?: Date;
}

/**
 * Calendar-year rows, newest first. A year starts from the previous year's
 * last entry (or its own first entry for the first year) and ends at its last.
 */
export function yearByYear(snapshots: Snapshot[], now: Date = new Date()): YearRow[] {
  const finite = snapshots.filter((s) => Number.isFinite(s.total));
  if (finite.length < 2) return [];
  const byYear = new Map<number, { first: Snapshot; last: Snapshot }>();
  for (const s of finite) {
    const y = s.date.getFullYear();
    const e = byYear.get(y);
    if (!e) byYear.set(y, { first: s, last: s });
    else {
      if (s.date < e.first.date) e.first = s;
      if (s.date > e.last.date) e.last = s;
    }
  }
  const years = [...byYear.entries()].sort(([a], [b]) => a - b);
  return years
    .map(([year, { first, last }], i) => {
      const start = i > 0 ? years[i - 1][1].last.total : first.total;
      const change = last.total - start;
      const row: YearRow = { year, start, end: last.total, change, changePct: start > 0 ? (change / start) * 100 : null };
      if (i === 0 && (first.date.getMonth() > 0 || first.date.getDate() > 1)) row.from = first.date;
      const endOfYear = last.date.getMonth() === 11 && last.date.getDate() >= 28;
      if (!endOfYear && year >= now.getFullYear()) row.to = last.date;
      return row;
    })
    .reverse();
}

/** At most `target + 1` round tick values (1, 2 or 5 × 10ⁿ steps) covering [min, max]. */
export function niceTicks(min: number, max: number, target = 5): { ticks: number[]; lo: number; hi: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [], lo: 0, hi: 1 };
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, target - 1);
  const base = 10 ** Math.floor(Math.log10(raw)) / 10;
  // The finest round step that still fits the tick budget.
  // No 2.5 steps: compact labels like "122.5k" would round to a wrong "123k".
  for (const m of [1, 2, 5, 10, 20, 50, 100, 200, 500]) {
    const step = m * base;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const n = Math.round((hi - lo) / step) + 1;
    if (n <= target + 1) {
      return { ticks: Array.from({ length: n }, (_, i) => Math.round((lo + i * step) / base) * base), lo, hi };
    }
  }
  return { ticks: [min, max], lo: min, hi: max };
}
