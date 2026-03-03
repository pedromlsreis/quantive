import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { setActiveCurrency, formatFullCurrency, formatCurrency } from '@/lib/formatters';
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
  const { snapshots } = usePortfolio();
  const { currency } = useCurrency();
  setActiveCurrency(currency.code, currency.symbol, currency.locale);

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
      return {
        year,
        startValue,
        endValue,
        gain,
        gainPct: startValue > 0 ? (gain / startValue) * 100 : 0,
        days,
        perDay: gain / days,
      };
    })
    .reverse();

  const perDayLabel = currency.symbol === 'NOK' ? 'kr/day' : `${currency.symbol}/day`;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">Earnings Per Year</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 text-left font-medium">Year</th>
              <th className="hidden pb-2 text-right font-medium sm:table-cell">Start</th>
              <th className="hidden pb-2 text-right font-medium sm:table-cell">End</th>
              <th className="pb-2 text-right font-medium">Gain</th>
              <th className="pb-2 text-right font-medium">%</th>
              <th className="pb-2 text-right font-medium">{perDayLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isPositive = row.gain >= 0;
              const Icon = row.gain === 0 ? Minus : isPositive ? TrendingUp : TrendingDown;
              const colorClass = row.gain === 0
                ? 'text-muted-foreground'
                : isPositive ? 'text-accent' : 'text-destructive';

              return (
                <tr key={row.year} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 font-semibold text-foreground">{row.year}</td>
                  <td className="hidden py-2.5 text-right text-muted-foreground sm:table-cell">{formatFullCurrency(row.startValue)}</td>
                  <td className="hidden py-2.5 text-right text-foreground sm:table-cell">{formatFullCurrency(row.endValue)}</td>
                  <td className={`py-2.5 text-right font-semibold ${colorClass}`}>
                    <span className="inline-flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      {isPositive ? '+' : ''}{formatCurrency(row.gain)}
                    </span>
                  </td>
                  <td className={`py-2.5 text-right font-medium ${colorClass}`}>
                    {isPositive ? '+' : ''}{row.gainPct.toFixed(1)}%
                  </td>
                  <td className={`py-2.5 text-right font-medium ${colorClass}`}>
                    {isPositive ? '+' : ''}{formatCurrency(row.perDay)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
