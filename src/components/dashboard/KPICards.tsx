import { usePortfolio } from '@/contexts/PortfolioContext';
import { TrendingUp, TrendingDown, Wallet, BarChart3, Coins, Droplets } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/formatters';

interface KPICardProps {
  label: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  subtitle?: string;
}

function KPICard({ label, value, change, icon, subtitle }: KPICardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-card/80">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="rounded-lg bg-primary/10 p-2">{icon}</div>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      {change !== undefined && change !== 0 && (
        <div className={`mt-1 flex items-center gap-1 text-sm ${change >= 0 ? 'text-accent' : 'text-destructive'}`}>
          {change >= 0 ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          <span>{formatPercent(change)}</span>
        </div>
      )}
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function KPICards() {
  const { kpis } = usePortfolio();

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KPICard
        label="Net Worth"
        value={formatCurrency(kpis.currentNetWorth)}
        change={kpis.momChange}
        icon={<Wallet className="h-4 w-4 text-primary" />}
        subtitle="Month-over-month"
      />
      <KPICard
        label="Year-over-Year"
        value={formatPercent(kpis.yoyChange)}
        change={kpis.yoyChange}
        icon={<BarChart3 className="h-4 w-4 text-primary" />}
      />
      <KPICard
        label="Sources"
        value={String(kpis.sourceCount)}
        icon={<Coins className="h-4 w-4 text-primary" />}
        subtitle={`${kpis.cryptoPercent.toFixed(0)}% crypto`}
      />
      <KPICard
        label="Liquid Assets"
        value={`${kpis.liquidPercent.toFixed(0)}%`}
        icon={<Droplets className="h-4 w-4 text-primary" />}
        subtitle={`${kpis.volatilePercent.toFixed(0)}% volatile`}
      />
    </div>
  );
}
