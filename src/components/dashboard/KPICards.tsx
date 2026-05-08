import { motion } from 'framer-motion';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { TrendingUp, TrendingDown, Wallet, BarChart3, Coins, Droplets } from 'lucide-react';
import { formatPercent } from '@/lib/formatters';
import { HelpHint } from '@/components/ui/help-hint';
import { staggerContainer, staggerItem, springTransition } from '@/lib/motion';

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
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      {change !== undefined && change !== 0 && (
        <div className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${change >= 0 ? 'text-accent' : 'text-destructive'}`}>
          {change >= 0
            ? <TrendingUp className="h-3.5 w-3.5" />
            : <TrendingDown className="h-3.5 w-3.5" />}
          <span>{formatPercent(change)}</span>
        </div>
      )}
      {subtitle && <p className="mt-1 text-xs text-muted-foreground/70">{subtitle}</p>}
    </>
  );

  const cardClass =
    'flex h-full min-w-0 w-full flex-col rounded-xl border border-border bg-card p-5 text-left transition-colors duration-150 hover:border-primary/20 hover:bg-card/80';

  if (!formula) {
    return (
      <motion.div
        className={cardClass}
        variants={staggerItem}
        whileHover={{ scale: 1.012, transition: springTransition }}
        whileTap={{ scale: 0.988 }}
      >
        {inner}
      </motion.div>
    );
  }

  return (
    <motion.div variants={staggerItem} className="overflow-visible">
      <HelpHint
        side="bottom"
        maxWidthClass="max-w-[280px]"
        triggerWrapperClassName="block h-full"
        content={formula}
      >
        <motion.button
          type="button"
          className={`${cardClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`}
          whileHover={{ scale: 1.012, transition: springTransition }}
          whileTap={{ scale: 0.988 }}
        >
          {inner}
        </motion.button>
      </HelpHint>
    </motion.div>
  );
}

export function KPICards() {
  const { kpis } = usePortfolio();
  const { fmt } = useCurrencyFormatter();

  return (
    <motion.div
      className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
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
        subtitle={
          kpis.volatilityDataAvailable
            ? `${kpis.volatilePercent.toFixed(0)}% volatile`
            : 'volatility data unavailable'
        }
        formula="Liquid % = total value of transferable-in-days sources ÷ net worth × 100. Volatile % same logic for volatile-type sources."
      />
    </motion.div>
  );
}
