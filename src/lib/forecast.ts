export function generateForecast(
  snapshots: { date: Date; total: number }[],
  monthsForward: number = 12,
): { date: Date; forecast: number; upper: number; lower: number }[] {
  if (snapshots.length < 2) return [];

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  const totalMonths =
    (last.date.getFullYear() - first.date.getFullYear()) * 12 +
    (last.date.getMonth() - first.date.getMonth());
  if (totalMonths === 0) return [];

  // #10: CAGR-based forecast (replaces OLS)
  // CAGR = (lastValue / firstValue)^(1/years) - 1
  const years = totalMonths / 12;
  const cagr =
    last.total <= 0 || first.total <= 0
      ? 0
      : Math.pow(last.total / first.total, 1 / years) - 1;
  const monthlyRate = Math.pow(1 + cagr, 1 / 12) - 1;

  // Compute residuals (actual vs CAGR-projected) for confidence band
  const residuals: number[] = [];
  for (const s of snapshots) {
    const monthsFromStart =
      (s.date.getFullYear() - first.date.getFullYear()) * 12 +
      (s.date.getMonth() - first.date.getMonth());
    const projected = first.total * Math.pow(1 + monthlyRate, monthsFromStart);
    residuals.push(s.total - projected);
  }
  const stdDev = Math.sqrt(
    residuals.reduce((sum, r) => sum + r * r, 0) / Math.max(1, residuals.length - 1),
  );

  const points: { date: Date; forecast: number; upper: number; lower: number }[] = [];

  for (let m = 1; m <= monthsForward; m++) {
    const futureDate = new Date(last.date);
    futureDate.setMonth(futureDate.getMonth() + m);
    const predicted = last.total * Math.pow(1 + monthlyRate, m);
    // Widen confidence band further into the future
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
