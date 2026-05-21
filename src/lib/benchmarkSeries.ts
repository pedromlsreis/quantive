// Pure math for benchmark overlay charts.
//
// Responsibilities:
//   * Rebase any value series to 100 at the period start (`rebaseToHundred`).
//   * Intersect a benchmark series with a user's snapshot dates so the
//     overlay only shows dates we have user data for (`intersectByDate`).
//   * Decide whether a series is stale relative to "today" based on series
//     cadence (`isStale`).
//
// No React, no Supabase. Tested in isolation.

export type SeriesId = 'inflation_eu' | 'sp500';

export type BenchmarkPoint = {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Index value as published by upstream (pre-rebasing). */
  value: number;
};

export type BenchmarkSeries = {
  id: SeriesId;
  /** Sorted ascending by date. May be empty. */
  points: BenchmarkPoint[];
};

export type RebasedPoint = {
  date: string;
  /** Original value as published — kept for tooltip detail. */
  raw: number;
  /** Rebased value where the first point in the input is 100. */
  rebased: number;
};

/**
 * Rebases a series so the first point becomes 100. Subsequent points scale
 * proportionally: `100 * value / firstValue`. Returns an empty array for
 * empty input; throws if the first value is non-positive (an index that
 * starts at 0 has no meaningful return rebase).
 */
export function rebaseToHundred(points: BenchmarkPoint[]): RebasedPoint[] {
  if (points.length === 0) return [];
  const first = points[0].value;
  if (!Number.isFinite(first) || first <= 0) {
    throw new Error('rebaseToHundred: first value must be a positive finite number');
  }
  return points.map((p) => ({
    date: p.date,
    raw: p.value,
    rebased: (p.value / first) * 100,
  }));
}

/**
 * Intersects a benchmark series with a sorted list of user snapshot dates.
 *
 * For each snapshot date, picks the most recent benchmark observation on or
 * before that date — the standard "value as of date" lookup. Used to overlay
 * a daily series (SP500) on weekly/monthly user snapshots, and to pad a
 * monthly series (HICP) across every user snapshot in the same month.
 *
 * Returns one BenchmarkPoint per snapshot date that has a defined lookup.
 * Snapshot dates earlier than the benchmark's first observation are skipped.
 */
export function intersectByDate(
  series: BenchmarkSeries,
  snapshotDates: string[],
): BenchmarkPoint[] {
  if (series.points.length === 0 || snapshotDates.length === 0) return [];

  const sortedSnap = [...snapshotDates].sort();
  const sortedSeries = [...series.points].sort((a, b) => a.date.localeCompare(b.date));

  const out: BenchmarkPoint[] = [];
  let cursor = 0;
  let lastValue: number | null = null;
  let lastDate: string | null = null;

  for (const snap of sortedSnap) {
    // Advance the cursor through series rows that are <= snap, keeping the
    // most recent as our running "value as of snap".
    while (cursor < sortedSeries.length && sortedSeries[cursor].date <= snap) {
      lastValue = sortedSeries[cursor].value;
      lastDate = sortedSeries[cursor].date;
      cursor++;
    }
    if (lastValue == null || lastDate == null) continue; // snap before series starts
    out.push({ date: snap, value: lastValue });
  }

  return out;
}

/**
 * Returns the most recent date in the series, or null if empty.
 */
export function lastDate(series: BenchmarkSeries): string | null {
  if (series.points.length === 0) return null;
  let max = series.points[0].date;
  for (const p of series.points) {
    if (p.date > max) max = p.date;
  }
  return max;
}

export type StaleThresholdDays = {
  /** Daily series threshold — anything > this many days behind is stale. Default 3. */
  daily: number;
  /** Monthly series threshold — anything > this many days behind is stale. Default 45. */
  monthly: number;
};

export const DEFAULT_STALE_THRESHOLDS: StaleThresholdDays = {
  daily: 3,
  monthly: 45,
};

/**
 * Returns true if the series' most recent observation is older than the
 * threshold for its cadence. `now` is injectable for tests.
 */
export function isStale(
  series: BenchmarkSeries,
  now: Date,
  thresholds: StaleThresholdDays = DEFAULT_STALE_THRESHOLDS,
): boolean {
  const latest = lastDate(series);
  if (!latest) return false; // empty series — UI will show a different message
  const cadence: 'daily' | 'monthly' = series.id === 'sp500' ? 'daily' : 'monthly';
  const limit = cadence === 'daily' ? thresholds.daily : thresholds.monthly;
  // Subtracting `now` (local Date, ms-since-epoch) from a UTC-midnight epoch
  // is intentional and correct: both sides are absolute ms-since-epoch, so
  // the timezone offset cancels out. Do NOT "fix" this by reading
  // latest as local-midnight — that would *introduce* a TZ skew.
  const ageMs = now.getTime() - new Date(`${latest}T00:00:00Z`).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > limit;
}

/**
 * Period selector — the user picks one of these, we map it to a cutoff date.
 */
export type BenchmarkPeriod = '3y' | '1y' | '6m';

export function periodCutoff(period: BenchmarkPeriod, now: Date): string {
  const d = new Date(now);
  if (period === '6m') {
    d.setMonth(d.getMonth() - 6);
  } else {
    const years = period === '3y' ? 3 : 1;
    d.setFullYear(d.getFullYear() - years);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Filter both the user series and the benchmark series to dates >= cutoff.
 * Pure — returns new arrays.
 */
export function filterByPeriod<T extends { date: string }>(
  points: T[],
  cutoff: string | null,
): T[] {
  if (cutoff === null) return [...points];
  return points.filter((p) => p.date >= cutoff);
}
