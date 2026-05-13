import type { ForecastPoint } from '@/lib/forecast';

/**
 * Generate forecast points with a user-chosen CAGR. Mirrors the band-widening
 * heuristic from generateForecast but uses an override instead of a fitted
 * CAGR so users can compare conservative/base/optimistic scenarios.
 */
export function generateScenarioForecast(
  snapshots: { date: Date; total: number }[],
  monthsForward: number,
  annualRate: number,
): ForecastPoint[] {
  if (snapshots.length < 2) return [];
  const sorted = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());
  const last = sorted[sorted.length - 1];
  const first = sorted[0];

  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;

  const totalMonths =
    (last.date.getFullYear() - first.date.getFullYear()) * 12 +
    (last.date.getMonth() - first.date.getMonth());
  const histCagr = totalMonths > 0 && first.total > 0 && last.total > 0
    ? Math.pow(last.total / first.total, 12 / totalMonths) - 1
    : annualRate;
  const histMonthly = Math.pow(1 + histCagr, 1 / 12) - 1;
  const residuals: number[] = [];
  for (const s of sorted) {
    const m =
      (s.date.getFullYear() - first.date.getFullYear()) * 12 +
      (s.date.getMonth() - first.date.getMonth());
    residuals.push(s.total - first.total * Math.pow(1 + histMonthly, m));
  }
  const stdDev =
    residuals.length > 1
      ? Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / (residuals.length - 1))
      : 0;

  const points: ForecastPoint[] = [];
  for (let m = 1; m <= monthsForward; m++) {
    const futureDate = new Date(last.date);
    futureDate.setMonth(futureDate.getMonth() + m);
    const predicted = last.total * Math.pow(1 + monthlyRate, m);
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
