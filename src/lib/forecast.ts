export function generateForecast(
  snapshots: { date: Date; total: number }[],
  monthsForward: number = 12,
): { date: Date; forecast: number; upper: number; lower: number }[] {
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

  // Standard deviation (sample)
  const stdDev =
    residuals.length > 1
      ? Math.sqrt(
          residuals.reduce((sum, r) => sum + r * r, 0) /
            (residuals.length - 1),
        )
      : 0;

  const points: { date: Date; forecast: number; upper: number; lower: number }[] = [];

  for (let m = 1; m <= monthsForward; m++) {
    const futureDate = new Date(last.date);
    futureDate.setMonth(futureDate.getMonth() + m);
    const predicted = last.total * Math.pow(1 + monthlyRate, m);

    // Confidence band widens over time
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
