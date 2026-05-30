/**
 * @module drawdownStats
 *
 * Pure, client-side downside analytics derived entirely from in-memory
 * snapshots — no new data, no server involvement. These are the cheap,
 * high-signal numbers the analytically minded reach for when sizing up a
 * track record:
 *
 *   - **Maximum drawdown**: the largest peak-to-trough decline the portfolio
 *     ever suffered, expressed as a percentage and absolute amount, with the
 *     dates of the peak and trough and how long recovery took (or whether the
 *     portfolio is still underwater today).
 *   - **Longest decline stretch**: the longest run of time the portfolio spent
 *     below a prior high-water mark — the "how long was I in the red" number.
 *   - **Best / worst rolling 12-month period**: the strongest and weakest
 *     trailing-year return across the whole history.
 *
 * All figures are computed on the canonical base-currency `total` carried by
 * each `Snapshot` (FX already honoured at rate-of-day upstream — see
 * `monthlyAggregate.ts`). No DOM, no React. Tested in isolation.
 *
 * Design notes:
 *   - Drawdown and the underwater stretch run on the *raw* snapshot series
 *     (every recorded date), so an intra-month trough is not hidden by
 *     month-end aggregation.
 *   - Rolling 12-month returns run on month-end rows (via
 *     `computeMonthlyRows`) because "a 12-month return" only makes sense on a
 *     regularly spaced series; comparing two arbitrary snapshots 11 or 13
 *     months apart would muddy the figure.
 */

import type { Snapshot } from './types';
import { computeMonthlyRows } from './monthlyAggregate';

/** A peak-to-trough decline and its recovery, all dates as ISO "YYYY-MM-DD". */
export interface DrawdownResult {
  /** Largest peak-to-trough decline as a positive percentage (e.g. 12.5 means −12.5%). 0 when never down. */
  maxDrawdownPct: number;
  /** Absolute peak-to-trough decline in base currency, as a positive number. 0 when never down. */
  maxDrawdownAbs: number;
  /** Net worth at the peak that preceded the worst trough. */
  peakValue: number;
  /** ISO date of that peak. `null` when there was never a decline. */
  peakDate: string | null;
  /** Net worth at the worst trough. */
  troughValue: number;
  /** ISO date of the worst trough. `null` when there was never a decline. */
  troughDate: string | null;
  /**
   * ISO date the portfolio first regained the prior peak after the worst
   * trough. `null` when it has not yet recovered (still underwater).
   */
  recoveryDate: string | null;
  /**
   * Calendar days from trough to recovery. `null` when still underwater.
   * Note: peak→trough is the *decline*; trough→recovery is the *recovery*.
   */
  recoveryDays: number | null;
  /** True when the portfolio has not regained the pre-trough peak. */
  stillUnderwater: boolean;
}

/** The longest run spent below a prior high-water mark. */
export interface DeclineStretch {
  /** Calendar days from the high-water mark to the point it was next reclaimed (or today). 0 when never underwater. */
  days: number;
  /** ISO date of the high-water mark the stretch started from. `null` when never underwater. */
  fromDate: string | null;
  /**
   * ISO date the stretch ended — either when the high was reclaimed, or the
   * latest snapshot date when the stretch is ongoing. `null` when never underwater.
   */
  toDate: string | null;
  /** True when this longest stretch is the one still in progress today. */
  ongoing: boolean;
}

/** A single rolling 12-month return window. */
export interface RollingReturn {
  /** Percentage return over the trailing 12 months (e.g. 8.4 means +8.4%). */
  pct: number;
  /** ISO month-end date at the *start* of the 12-month window. */
  startDate: string;
  /** ISO month-end date at the *end* of the 12-month window. */
  endDate: string;
}

/** Best and worst trailing-year windows. `null` when under 13 month-end rows. */
export interface RollingReturnExtremes {
  best: RollingReturn | null;
  worst: RollingReturn | null;
}

/** Everything the downside panel needs, in one pass-friendly bundle. */
export interface DownsideStats {
  drawdown: DrawdownResult;
  longestDecline: DeclineStretch;
  rolling12m: RollingReturnExtremes;
  /** Number of distinct snapshot dates the stats were computed from. */
  sampleSize: number;
}

interface Point {
  date: Date;
  value: number;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Sort ascending by date and drop non-finite totals. */
function toPoints(snapshots: Snapshot[]): Point[] {
  return snapshots
    .filter((s) => Number.isFinite(s.total))
    .map((s) => ({ date: s.date, value: s.total }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

const EMPTY_DRAWDOWN: DrawdownResult = {
  maxDrawdownPct: 0,
  maxDrawdownAbs: 0,
  peakValue: 0,
  peakDate: null,
  troughValue: 0,
  troughDate: null,
  recoveryDate: null,
  recoveryDays: null,
  stillUnderwater: false,
};

const EMPTY_STRETCH: DeclineStretch = {
  days: 0,
  fromDate: null,
  toDate: null,
  ongoing: false,
};

/**
 * Maximum drawdown over the whole series. Walks the points tracking the
 * running peak; whenever the current value sits below the peak, the drop is a
 * candidate. The deepest drop wins. Recovery is then resolved forward from the
 * winning trough: the first later point that reaches or exceeds the pre-trough
 * peak. A flat or strictly rising series returns the zero result.
 *
 * Peaks update on a value that *matches or exceeds* the running high, so when
 * the portfolio returns to a prior high and then falls, the reported peak date
 * is the most recent visit to that high — the one the user remembers right
 * before the decline, not an older plateau start.
 */
export function computeMaxDrawdown(points: Point[]): DrawdownResult {
  if (points.length < 2) return EMPTY_DRAWDOWN;

  let peakValue = points[0].value;
  let peakIdx = 0;

  let worstDropAbs = 0;
  let bestPeakValue = points[0].value;
  let bestPeakIdx = 0;
  let bestTroughIdx = -1;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.value >= peakValue) {
      peakValue = p.value;
      peakIdx = i;
      continue;
    }
    const dropAbs = peakValue - p.value;
    if (dropAbs > worstDropAbs) {
      worstDropAbs = dropAbs;
      bestPeakValue = peakValue;
      bestPeakIdx = peakIdx;
      bestTroughIdx = i;
    }
  }

  if (bestTroughIdx === -1 || worstDropAbs <= 0) return EMPTY_DRAWDOWN;

  const peak = points[bestPeakIdx];
  const trough = points[bestTroughIdx];

  // Resolve recovery: first point after the trough that regains the peak.
  let recoveryDate: string | null = null;
  let recoveryDays: number | null = null;
  for (let i = bestTroughIdx + 1; i < points.length; i++) {
    if (points[i].value >= bestPeakValue) {
      recoveryDate = toIso(points[i].date);
      recoveryDays = daysBetween(trough.date, points[i].date);
      break;
    }
  }

  return {
    maxDrawdownPct: bestPeakValue > 0 ? (worstDropAbs / bestPeakValue) * 100 : 0,
    maxDrawdownAbs: worstDropAbs,
    peakValue: bestPeakValue,
    peakDate: toIso(peak.date),
    troughValue: trough.value,
    troughDate: toIso(trough.date),
    recoveryDate,
    recoveryDays,
    stillUnderwater: recoveryDate === null,
  };
}

/**
 * Longest stretch spent below a high-water mark — the "how long was I under
 * the prior high" number. Each time a new all-time high is set, any open
 * underwater stretch closes (measured high→reclaim). A stretch still open at
 * the end of the series is measured high→latest-snapshot and flagged ongoing.
 * The longest of all stretches wins; ties keep the earlier one.
 */
export function computeLongestDecline(points: Point[]): DeclineStretch {
  if (points.length < 2) return EMPTY_STRETCH;

  let highValue = points[0].value;
  let highIdx = 0;
  let underwater = false;

  let best = EMPTY_STRETCH;

  const consider = (fromIdx: number, toIdx: number, ongoing: boolean) => {
    const days = daysBetween(points[fromIdx].date, points[toIdx].date);
    if (days > best.days) {
      best = {
        days,
        fromDate: toIso(points[fromIdx].date),
        toDate: toIso(points[toIdx].date),
        ongoing,
      };
    }
  };

  for (let i = 1; i < points.length; i++) {
    if (points[i].value >= highValue) {
      // Reclaimed (or matched) the high — close any open underwater stretch.
      if (underwater) {
        consider(highIdx, i, false);
        underwater = false;
      }
      highValue = points[i].value;
      highIdx = i;
    } else {
      underwater = true;
    }
  }

  // A stretch still open at the end runs to the latest snapshot.
  if (underwater) {
    consider(highIdx, points.length - 1, true);
  }

  return best;
}

/**
 * Best and worst trailing 12-month returns across the history. Operates on
 * month-end rows: for each row that has a row exactly 12 months earlier, the
 * return is (now / then − 1). Requires both endpoints positive. Returns nulls
 * when there isn't at least one full 12-month span with positive endpoints.
 */
export function computeRolling12mExtremes(snapshots: Snapshot[]): RollingReturnExtremes {
  const rows = computeMonthlyRows(snapshots);
  if (rows.length < 13) return { best: null, worst: null };

  const byMonth = new Map<string, (typeof rows)[number]>();
  rows.forEach((r) => byMonth.set(r.monthKey, r));

  let best: RollingReturn | null = null;
  let worst: RollingReturn | null = null;

  for (const row of rows) {
    const [y, m] = row.monthKey.split('-').map(Number);
    const priorKey = `${y - 1}-${String(m).padStart(2, '0')}`;
    const prior = byMonth.get(priorKey);
    if (!prior || prior.netWorth <= 0 || row.netWorth <= 0) continue;

    const pct = (row.netWorth / prior.netWorth - 1) * 100;
    const window: RollingReturn = {
      pct,
      startDate: prior.monthEnd,
      endDate: row.monthEnd,
    };
    if (best === null || pct > best.pct) best = window;
    if (worst === null || pct < worst.pct) worst = window;
  }

  return { best, worst };
}

/**
 * One-shot bundle of every downside statistic for a snapshot series. Tolerant
 * of empty/short input — the individual computations each return their neutral
 * "no data" shape, so callers can render placeholders without branching on
 * length themselves.
 */
export function computeDownsideStats(snapshots: Snapshot[]): DownsideStats {
  const points = toPoints(snapshots);
  return {
    drawdown: computeMaxDrawdown(points),
    longestDecline: computeLongestDecline(points),
    rolling12m: computeRolling12mExtremes(snapshots),
    sampleSize: points.length,
  };
}
