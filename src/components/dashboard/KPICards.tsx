import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { formatPercent } from '@/lib/formatters';
import { HelpHint } from '@/components/ui/help-hint';

interface KPICardProps {
  label: string;
  value: string;
  change?: number;
  subtitle?: string;
  formula?: string;
  size?: 'xl' | 'lg';
}

function DeltaBadge({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <span className={`q-delta ${pos ? 'q-delta--pos' : 'q-delta--neg'}`}>
      {pos ? '▲' : '▼'} {formatPercent(Math.abs(value))}
    </span>
  );
}

function KPICard({ label, value, change, subtitle, formula, size = 'lg' }: KPICardProps) {
  const content = (
    <div className="q-metric">
      <div className="q-metric-eyebrow">{label}</div>
      <div className={`q-metric-value q-metric-value--${size} num`}>{value}</div>
      <div className="q-metric-meta">
        {change !== undefined && change !== 0 && <DeltaBadge value={change} />}
        {subtitle && <span className="q-metric-sub">{subtitle}</span>}
      </div>
    </div>
  );

  const card = (
    <div className="q-card q-card--p-lg q-card--interactive h-full">
      {content}
    </div>
  );

  if (!formula) return card;

  return (
    <HelpHint side="bottom" maxWidthClass="max-w-[280px]" content={formula}>
      {card}
    </HelpHint>
  );
}

export function KPICards() {
  const { kpis } = usePortfolio();
  const { fmt } = useCurrencyFormatter();

  return (
    <div className="q-grid q-grid--kpi q-stagger">
      <KPICard
        label="Net Worth"
        value={fmt(kpis.currentNetWorth)}
        change={kpis.momChange}
        subtitle="vs. last month"
        formula="Sum of all source values at the latest snapshot. MoM % = (current − 1 month ago) ÷ 1 month ago × 100."
        size="xl"
      />
      <KPICard
        label="Year-over-Year"
        value={fmt(kpis.yoyNetWorth)}
        change={kpis.yoyChange}
        subtitle="Net worth 12 months ago"
        formula="(Current net worth − net worth 12 months ago) ÷ net worth 12 months ago × 100."
      />
      <KPICard
        label="Sources"
        value={String(kpis.sourceCount)}
        subtitle="Distinct sources tracked"
        formula="Count of distinct sources in the latest snapshot."
      />
      <KPICard
        label="Liquid Assets"
        value={`${kpis.liquidPercent.toFixed(0)}%`}
        subtitle={
          kpis.volatilityDataAvailable
            ? `${kpis.volatilePercent.toFixed(0)}% volatile`
            : 'volatility data unavailable'
        }
        formula="Liquid % = total value of transferable-in-days sources ÷ net worth × 100."
      />
    </div>
  );
}
