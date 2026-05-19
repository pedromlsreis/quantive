/**
 * @module monthlyAggregate
 *
 * Pure derivation of month-end rows from in-memory snapshots. The "month-end"
 * value for a calendar month is the total of the latest snapshot whose date is
 * on or before the last calendar day of that month. Month-over-month and
 * year-over-year deltas are computed against the closest preceding month-end
 * row (not a fixed N-month gap), so missing months don't break the chain.
 *
 * FX is honoured at *rate-of-day* — each snapshot already carries its
 * own base-currency total computed at its own date's rate via
 * `PortfolioContext.allSnapshots`, so the aggregation here treats `total` as
 * the canonical base-currency figure for that snapshot date.
 *
 * No DOM, no React. Tested in isolation.
 */

import type { Snapshot } from './types';

/** A single month-end row, ready for table render or CSV export. */
export interface MonthlyRow {
  /** ISO 8601 date of the last calendar day of the month (UTC-safe). */
  monthEnd: string;
  /** Calendar month label, e.g. "2026-05". */
  monthKey: string;
  /** Net worth at month-end (in the display currency from the source snapshot). */
  netWorth: number;
  /** Absolute change from the previous month-end. `null` when no prior row exists. */
  deltaMonthAbs: number | null;
  /** Percentage change from the previous month-end (e.g. 1.8 means +1.8%). */
  deltaMonthPct: number | null;
  /** Absolute change from the same month one year ago. `null` if not available. */
  deltaYearAbs: number | null;
  /** Percentage change from the same month one year ago. */
  deltaYearPct: number | null;
  /** Annualised growth from the earliest available month-end to this one (e.g. 7.2 means 7.2%). */
  annualisedPct: number | null;
  /**
   * The source snapshot date that supplied this month-end value — useful for
   * tooltips ("value as of N days before month-end") and debugging.
   */
  sourceDate: string;
}

function lastDayOfMonth(year: number, monthIndex: number): Date {
  // monthIndex is 0-based. Day 0 of next month = last day of this month.
  // Set to end-of-day so the comparison with snapshot dates (which may have
  // been parsed from ISO strings as UTC midnight, landing a few hours into
  // local time) is timezone-tolerant.
  return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Aggregate snapshots into month-end rows. Returns rows sorted ascending by
 * month — callers that want newest-first should reverse the array (the
 * `MonthSummaryTable` does so explicitly for clarity).
 *
 * Empty snapshots → empty array. A single snapshot produces one row with all
 * deltas null. The function is intentionally tolerant to unsorted input.
 */
export function computeMonthlyRows(snapshots: Snapshot[]): MonthlyRow[] {
  if (!snapshots.length) return [];
  const sorted = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Walk months from first snapshot's month through last snapshot's month and,
  // for each, find the latest snapshot whose date is <= last-day-of-month.
  const first = sorted[0].date;
  const last = sorted[sorted.length - 1].date;

  const rows: MonthlyRow[] = [];
  let cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  const endCursor = new Date(last.getFullYear(), last.getMonth(), 1);

  let snapIdx = 0;
  let lastTotal: number | null = null;
  let lastSnapDate: Date | null = null;

  while (cursor.getTime() <= endCursor.getTime()) {
    const monthEnd = lastDayOfMonth(cursor.getFullYear(), cursor.getMonth());
    // Advance the snapshot pointer to the last snapshot on or before monthEnd.
    while (snapIdx + 1 < sorted.length && sorted[snapIdx + 1].date.getTime() <= monthEnd.getTime()) {
      snapIdx++;
    }
    const candidate = sorted[snapIdx];
    if (candidate && candidate.date.getTime() <= monthEnd.getTime()) {
      lastTotal = candidate.total;
      lastSnapDate = candidate.date;
    }
    // Only emit a row once we have a snapshot covering this month-end.
    if (lastTotal !== null && lastSnapDate !== null) {
      rows.push({
        monthEnd: toIso(monthEnd),
        monthKey: monthKey(cursor),
        netWorth: lastTotal,
        deltaMonthAbs: null,
        deltaMonthPct: null,
        deltaYearAbs: null,
        deltaYearPct: null,
        annualisedPct: null,
        sourceDate: toIso(lastSnapDate),
      });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  // Fill deltas using the rows themselves — keyed by monthKey for the
  // YoY lookup so a missing month is treated as "no comparison" rather
  // than reaching for the wrong row.
  const byMonth = new Map<string, MonthlyRow>();
  rows.forEach((r) => byMonth.set(r.monthKey, r));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i > 0) {
      const prev = rows[i - 1];
      if (prev.netWorth !== 0) {
        row.deltaMonthAbs = row.netWorth - prev.netWorth;
        row.deltaMonthPct = ((row.netWorth - prev.netWorth) / prev.netWorth) * 100;
      } else {
        row.deltaMonthAbs = row.netWorth - prev.netWorth;
        row.deltaMonthPct = null;
      }
    }
    // YoY: same calendar month, one year prior.
    const [y, m] = row.monthKey.split('-').map(Number);
    const yoyKey = `${y - 1}-${String(m).padStart(2, '0')}`;
    const yoy = byMonth.get(yoyKey);
    if (yoy && yoy.netWorth !== 0) {
      row.deltaYearAbs = row.netWorth - yoy.netWorth;
      row.deltaYearPct = ((row.netWorth - yoy.netWorth) / yoy.netWorth) * 100;
    }
    // Annualised: CAGR from first row to this row. Only meaningful when the
    // spread is ≥12 months and both endpoints are positive.
    const firstRow = rows[0];
    const monthsApart =
      (y - Number(firstRow.monthKey.slice(0, 4))) * 12 +
      (m - Number(firstRow.monthKey.slice(5, 7)));
    if (monthsApart >= 12 && firstRow.netWorth > 0 && row.netWorth > 0) {
      const years = monthsApart / 12;
      const cagr = Math.pow(row.netWorth / firstRow.netWorth, 1 / years) - 1;
      row.annualisedPct = cagr * 100;
    }
  }

  return rows;
}

/**
 * Free-tier mask: rows older than 12 months from today's month-end are
 * flagged as redacted. Returns the same row order (ascending). The actual
 * redaction (zeroing the displayed value, swapping the renderer) is the
 * UI's job — this function only labels.
 */
export function applyFreeTierMask(rows: MonthlyRow[], now: Date = new Date()): Array<MonthlyRow & { redacted: boolean }> {
  const floor = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  return rows.map((r) => ({
    ...r,
    redacted: new Date(r.monthEnd).getTime() < floor.getTime(),
  }));
}

/**
 * RFC 4180 CSV — same shape as `exporter.buildPortfolioCsv` but for month-end
 * rows. Numeric columns are unformatted so the file imports cleanly into
 * pandas/R/Sheets. Free-tier redacted rows are emitted with empty value cells
 * so the row count matches what the user saw on-screen.
 */
export function buildMonthlyCsv(
  rows: Array<MonthlyRow & { redacted?: boolean }>,
): string {
  const header = [
    'MONTH_END',
    'NET_WORTH',
    'DELTA_MONTH_ABS',
    'DELTA_MONTH_PCT',
    'DELTA_YEAR_ABS',
    'DELTA_YEAR_PCT',
    'ANNUALISED_PCT',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    if (r.redacted) {
      lines.push([r.monthEnd, '', '', '', '', '', ''].join(','));
      continue;
    }
    const fmt = (n: number | null): string => (n == null ? '' : Number.isFinite(n) ? String(n) : '');
    lines.push([
      r.monthEnd,
      fmt(r.netWorth),
      fmt(r.deltaMonthAbs),
      fmt(r.deltaMonthPct),
      fmt(r.deltaYearAbs),
      fmt(r.deltaYearPct),
      fmt(r.annualisedPct),
    ].join(','));
  }
  return lines.join('\r\n');
}
