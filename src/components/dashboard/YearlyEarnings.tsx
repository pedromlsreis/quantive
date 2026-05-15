import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { formatPercent } from '@/lib/formatters';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface YearRow {
  year: number;
  startValue: number;
  endValue: number;
  gain: number;
  gainPct: number;
  days: number;
  perDay: number;
}

export function YearlyEarnings() {
  const { allSnapshots: snapshots } = usePortfolio();
  const { fmt, fmtFull, currency } = useCurrencyFormatter();

  if (snapshots.length < 2) return null;

  const byYear = new Map<number, { first: typeof snapshots[0]; last: typeof snapshots[0] }>();
  for (const snap of snapshots) {
    const y = snap.date.getFullYear();
    const entry = byYear.get(y);
    if (!entry) {
      byYear.set(y, { first: snap, last: snap });
    } else {
      if (snap.date < entry.first.date) entry.first = snap;
      if (snap.date > entry.last.date) entry.last = snap;
    }
  }

  const sortedYears = Array.from(byYear.entries()).sort(([a], [b]) => a - b);

  const rows: YearRow[] = sortedYears
    .map(([year, { first, last }], idx) => {
      const prevEnd = idx > 0 ? sortedYears[idx - 1][1].last.total : first.total;
      const startValue = prevEnd;
      const endValue = last.total;
      const gain = endValue - startValue;
      const yearStart = new Date(year, 0, 1);
      const days = Math.max(1, Math.round((last.date.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)));
      return { year, startValue, endValue, gain, gainPct: startValue > 0 ? (gain / startValue) * 100 : 0, days, perDay: gain / days };
    })
    .reverse();

  const perDayLabel = `${currency.symbol}/day`;

  return (
    <div className="q-card q-card--p-lg">
      <div className="q-section-head">
        <h2>Earnings per year</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="q-table">
          <thead>
            <tr>
              <th>Year</th>
              <th className="hidden sm:table-cell" style={{ textAlign: 'right' }}>Start</th>
              <th className="hidden sm:table-cell" style={{ textAlign: 'right' }}>End</th>
              <th style={{ textAlign: 'right' }}>Gain</th>
              <th style={{ textAlign: 'right' }}>%</th>
              <th style={{ textAlign: 'right' }}>{perDayLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isPositive = row.gain >= 0;
              const Icon = row.gain === 0 ? Minus : isPositive ? TrendingUp : TrendingDown;
              const color = row.gain === 0 ? 'var(--fg-muted)' : isPositive ? 'var(--positive)' : 'var(--negative)';
              return (
                <tr key={row.year}>
                  <td style={{ fontWeight: 500 }}>{row.year}</td>
                  <td className="num hidden sm:table-cell" style={{ color: 'var(--fg-muted)' }}>{fmtFull(row.startValue)}</td>
                  <td className="num hidden sm:table-cell">{fmtFull(row.endValue)}</td>
                  <td className="num" style={{ color, fontWeight: 500 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                      <Icon className="h-3 w-3" />
                      {isPositive ? '+' : ''}{fmt(row.gain)}
                    </span>
                  </td>
                  <td className="num" style={{ color, fontWeight: 500 }}>{isPositive ? '+' : ''}{row.gainPct.toFixed(1)}%</td>
                  <td className="num" style={{ color, fontWeight: 500 }}>{isPositive ? '+' : ''}{fmt(row.perDay)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
