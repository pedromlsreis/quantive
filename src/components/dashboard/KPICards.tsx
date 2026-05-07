import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { TrendingUp, TrendingDown, Wallet, BarChart3, Coins, Droplets } from 'lucide-react';
import { formatPercent } from '@/lib/formatters';
import { HelpHint } from '@/components/ui/help-hint';

interface KPICardProps {
  label: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  subtitle?: string;
  formula?: string;
}

function KPICard({ label, value, change, icon, subtitle, formula }: KPICardProps) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="rounded-lg bg-primary/10 p-2">{icon}</div>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      {change !== undefined && change !== 0 && (
        <div className={`mt-1 flex items-center gap-1 text-sm ${change >= 0 ? 'text-accent' : 'text-destructive'}`}>
          {change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          <span>{formatPercent(change)}</span>
        </div>
      )}
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </>
  );

  if (!formula) {
    return (
      <div className="min-w-0 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-card/80">
        {inner}
      </div>
    );
  }

  return (
    <HelpHint
      side="bottom"
      maxWidthClass="max-w-[280px]"
      triggerWrapperClassName="block"
      content={formula}
    >
      <button
        type="button"
        className="min-w-0 w-full rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-card/80 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {inner}
      </button>
    </HelpHint>
  );
}

export function KPICards() {
  const { kpis } = usePortfolio();
  const { fmt } = useCurrencyFormatter();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <KPICard
        label="Net Worth"
        value={fmt(kpis.currentNetWorth)}
        change={kpis.momChange}
        icon={<Wallet className="h-4 w-4 text-primary" />}
        subtitle="vs. last month"
        formula="Sum of all source values at the latest snapshot. MoM % = (current − 1 month ago) ÷ 1 month ago × 100."
      />
      <KPICard
        label="Year-over-Year"
        value={fmt(kpis.yoyNetWorth)}
        change={kpis.yoyChange}
        icon={<BarChart3 className="h-4 w-4 text-primary" />}
        subtitle="Net worth 12 months ago"
        formula="(Current net worth − net worth 12 months ago) ÷ net worth 12 months ago × 100. Closest snapshot within 45 days is used."
      />
      <KPICard
        label="Sources"
        value={String(kpis.sourceCount)}
        icon={<Coins className="h-4 w-4 text-primary" />}
        subtitle="Distinct sources tracked"
        formula="Count of distinct sources in the latest snapshot."
      />
      <KPICard
        label="Liquid Assets"
        value={`${kpis.liquidPercent.toFixed(0)}%`}
        icon={<Droplets className="h-4 w-4 text-primary" />}
        subtitle={kpis.volatilityDataAvailable ? `${kpis.volatilePercent.toFixed(0)}% volatile` : 'volatility data unavailable'}
        formula="Liquid % = total value of transferable-in-days sources ÷ net worth × 100. Volatile % same logic for volatile-type sources."
      />
    </div>
  );
}
