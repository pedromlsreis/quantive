import { usePortfolio } from '@/contexts/PortfolioContext';
import { formatFullCurrency } from '@/lib/formatters';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface YearRow {
  year: number;
  startValue: number;
  endValue: number;
  gain: number;
  gainPct: number;
  days: number;
  eurPerDay: number;
}

export function YearlyEarnings() {
  const { snapshots } = usePortfolio();

  if (snapshots.length < 2) return null;

  // Group snapshots by year
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

  const rows: YearRow[] = Array.from(byYear.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, { first, last }]) => {
      const gain = last.total - first.total;
      const days = Math.max(1, Math.round((last.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24)));
      return {
        year,
        startValue: first.total,
        endValue: last.total,
        gain,
        gainPct: first.total > 0 ? (gain / first.total) * 100 : 0,
        days,
        eurPerDay: gain / days,
      };
    });

  const maxAbsGain = Math.max(...rows.map(r => Math.abs(r.gain)), 1);

  return (
    <TooltipProvider>
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          Earnings Per Year
        </h3>
        <div className="space-y-3">
          {rows.map(row => {
            const isPositive = row.gain >= 0;
            const barWidth = Math.abs(row.gain) / maxAbsGain * 100;
            return (
              <Tooltip key={row.year}>
                <TooltipTrigger asChild>
                  <div className="group cursor-default rounded-lg border border-border/50 bg-secondary/30 p-4 transition-colors hover:bg-secondary/60">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-foreground">{row.year}</span>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className={`flex items-center gap-1 text-sm font-semibold ${isPositive ? 'text-accent' : 'text-destructive'}`}>
                            {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {isPositive ? '+' : ''}{formatFullCurrency(row.gain)}
                          </div>
                          <span className={`text-xs ${isPositive ? 'text-accent/70' : 'text-destructive/70'}`}>
                            {isPositive ? '+' : ''}{row.gainPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-px h-8 bg-border" />
                        <div className="text-right min-w-[100px]">
                          <div className={`text-sm font-semibold ${isPositive ? 'text-accent' : 'text-destructive'}`}>
                            {isPositive ? '+' : ''}{formatFullCurrency(row.eurPerDay)}
                          </div>
                          <span className="text-xs text-muted-foreground">per day avg</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 w-full rounded-full bg-secondary">
                      <div
                        className={`h-1.5 rounded-full transition-all ${isPositive ? 'bg-accent' : 'bg-destructive'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[300px] text-xs leading-relaxed">
                  Start: {formatFullCurrency(row.startValue)} → End: {formatFullCurrency(row.endValue)}.
                  Gain = End − Start. €/day = Gain ÷ {row.days} days measured.
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
