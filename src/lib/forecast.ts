/**
 * @module forecast
 * Generates net worth forecast projections using Compound Annual Growth Rate (CAGR).
 * Includes confidence intervals based on historical residual standard deviation.
 */

/** A single forecast data point with confidence bounds. */
export interface ForecastPoint {
  /** The projected future date. */
  date: Date;
  /** The central forecast value. */
  forecast: number;
  /** Upper bound of the 95% confidence interval. */
  upper: number;
  /** Lower bound of the 95% confidence interval. */
  lower: number;
}

/**
 * Generate net worth forecast points from historical snapshots.
 *
 * Uses CAGR to project forward, then widens confidence bands over time
 * based on the standard deviation of historical residuals (±1.96σ for ~95% CI).
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

  // Compute residuals for confidence interval
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

    // Confidence band widens over time (√(1 + m/3) factor)
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
