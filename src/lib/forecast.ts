export function linearRegression(data: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: data[0]?.y || 0 };

  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export function generateForecast(
  snapshots: { date: Date; total: number }[],
  monthsForward: number = 6
): { date: Date; forecast: number }[] {
  if (snapshots.length < 2) return [];

  const baseTime = snapshots[0].date.getTime();
  const msPerDay = 24 * 60 * 60 * 1000;

  const data = snapshots.map(s => ({
    x: (s.date.getTime() - baseTime) / msPerDay,
    y: s.total,
  }));

  const { slope, intercept } = linearRegression(data);

  const lastDate = snapshots[snapshots.length - 1].date;
  const points: { date: Date; forecast: number }[] = [];

  for (let m = 1; m <= monthsForward; m++) {
    const futureDate = new Date(lastDate);
    futureDate.setMonth(futureDate.getMonth() + m);
    const x = (futureDate.getTime() - baseTime) / msPerDay;
    points.push({ date: futureDate, forecast: Math.max(0, slope * x + intercept) });
  }

  return points;
}
