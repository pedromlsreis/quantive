/**
 * @module forecast
 * Generates net worth forecast projections using Compound Annual Growth Rate (CAGR).
 * Includes a range band sized from the spread of the history around its own trend.
 */

/** A single forecast data point with its range bounds. */
export interface ForecastPoint {
  /** The projected future date. */
  date: Date;
  /** The central forecast value. */
  forecast: number;
  /** Upper edge of the range band. */
  upper: number;
  /** Lower edge of the range band. */
  lower: number;
}

/**
 * Generate net worth forecast points from historical snapshots.
 *
 * Uses CAGR to project forward, then widens the band over time from the
 * standard deviation of historical residuals (±1.96σ). This is a heuristic
 * range, not a statistical 95% interval, so user-facing copy calls it "a range
 * from your own history".
 *
 * @param snapshots - Historical data points with date and total net worth.
 * @param monthsForward - Number of months to forecast (default: 12).
 * @returns Array of forecast points, empty if fewer than 2 snapshots.
 */
export function generateForecast(
  snapshots: { date: Date; total: number }[],
  monthsForward: number = 12,
): ForecastPoint[] {
  if (snapshots.length < 2) return [];

  // Ensure snapshots are sorted by date
  const sorted = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const totalMonths =
    (last.date.getFullYear() - first.date.getFullYear()) * 12 +
    (last.date.getMonth() - first.date.getMonth());

  if (totalMonths <= 0) return [];

  // CAGR (protect against invalid or negative values)
  const years = totalMonths / 12;
  const validForCAGR = first.total > 0 && last.total > 0;

  const cagr = validForCAGR
    ? Math.pow(last.total / first.total, 1 / years) - 1
    : 0;

  const monthlyRate = Math.pow(1 + cagr, 1 / 12) - 1;

  // Residuals around the fitted trend size the range band
  const residuals: number[] = [];

  for (const s of sorted) {
    const monthsFromStart =
      (s.date.getFullYear() - first.date.getFullYear()) * 12 +
      (s.date.getMonth() - first.date.getMonth());

    const projected = first.total * Math.pow(1 + monthlyRate, monthsFromStart);
    residuals.push(s.total - projected);
  }

  // Sample standard deviation of residuals
  const stdDev =
    residuals.length > 1
      ? Math.sqrt(
          residuals.reduce((sum, r) => sum + r * r, 0) /
            (residuals.length - 1),
        )
      : 0;

  const points: ForecastPoint[] = [];

  for (let m = 1; m <= monthsForward; m++) {
    const futureDate = new Date(last.date);
    futureDate.setMonth(futureDate.getMonth() + m);
    const predicted = last.total * Math.pow(1 + monthlyRate, m);

    // Band widens over time (√(1 + m/3) factor)
    const spread = stdDev * 1.96 * Math.sqrt(1 + m / 3);
    points.push({
      date: futureDate,
      forecast: Math.max(0, predicted),
      upper: Math.max(0, predicted + spread),
      lower: Math.max(0, predicted - spread),
    });
  }

  return points;
}
