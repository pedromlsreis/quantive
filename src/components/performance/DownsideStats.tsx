import { useMemo } from 'react';
import { TrendingDown, ArrowDownRight, ArrowUpRight, Hourglass } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useHistoryFloor } from '@/hooks/useHistoryFloor';
import { useEntitlements } from '@/hooks/useEntitlements';
import { computeDownsideStats } from '@/lib/drawdownStats';

/** Format an ISO "YYYY-MM-DD" as e.g. "5 Mar 2026". */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A plain-English span of days, e.g. "47 days" or "1 year, 2 months". */
function formatDuration(days: number): string {
  if (days <= 0) return '0 days';
  if (days < 60) return `${days} ${days === 1 ? 'day' : 'days'}`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const yearPart = `${years} ${years === 1 ? 'year' : 'years'}`;
  if (remMonths === 0) return yearPart;
  return `${yearPart}, ${remMonths} ${remMonths === 1 ? 'month' : 'months'}`;
}

function formatPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

const POSITIVE = 'var(--positive, #16a34a)';
const NEGATIVE = 'var(--negative, #dc2626)';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  detail: React.ReactNode;
}

function StatCard({ icon, label, value, valueColor, detail }: StatCardProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-2)',
        padding: 'var(--s-4)',
        border: '1px solid var(--border-raw)',
        borderRadius: 'var(--radius-md, 8px)',
        background: 'var(--surface-soft)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', color: 'var(--fg-subtle)' }}>
        {icon}
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>{label}</span>
      </div>
      <div
        style={{
          fontSize: 'var(--text-2xl, 24px)',
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: valueColor ?? 'var(--fg)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', lineHeight: 1.5 }}>
        {detail}
      </p>
    </div>
  );
}

/**
 * Downside and drawdown panel for the Performance page. Derives maximum
 * drawdown, the longest stretch under a prior high, and the best/worst rolling
 * 12-month return entirely from in-memory snapshots.
 *
 * Free-tier users see stats over their visible window (the last 12 months,
 * matching the history floor applied to the chart and table); Pro computes
 * over the full history. The figures are derived numbers only, never raw
 * holdings, so nothing here leaves the device.
 */
export function DownsideStats() {
  const { allSnapshots } = usePortfolio();
  const { fmtFull } = useCurrencyFormatter();
  const historyFloor = useHistoryFloor();
  const { has } = useEntitlements();
  const hasFullHistory = has('history.full');

  const visibleSnapshots = useMemo(
    () => (historyFloor ? allSnapshots.filter((s) => s.date >= historyFloor) : allSnapshots),
    [allSnapshots, historyFloor],
  );

  const stats = useMemo(() => computeDownsideStats(visibleSnapshots), [visibleSnapshots]);

  // Need at least two snapshots for any of these to mean anything.
  if (stats.sampleSize < 2) {
    return (
      <section className="q-card q-card--p-lg">
        <div className="q-section-head">
          <h2>Drawdown and downside</h2>
        </div>
        <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}>
          Once you've recorded a few months of values, this shows your largest decline, how long it took to recover, and your best and worst year.
        </p>
      </section>
    );
  }

  const { drawdown, longestDecline, rolling12m } = stats;

  const drawdownValue = drawdown.maxDrawdownPct > 0 ? `−${drawdown.maxDrawdownPct.toFixed(1)}%` : 'None';
  const drawdownDetail =
    drawdown.maxDrawdownPct > 0 ? (
      <>
        <span className="num">{fmtFull(drawdown.maxDrawdownAbs)}</span> off the high on {formatDate(drawdown.peakDate)},
        down to {formatDate(drawdown.troughDate)}.{' '}
        {drawdown.stillUnderwater
          ? 'Not yet recovered.'
          : `Recovered ${formatDate(drawdown.recoveryDate)}, ${formatDuration(drawdown.recoveryDays ?? 0)} later.`}
      </>
    ) : (
      'Your portfolio has never closed a month below an earlier high.'
    );

  const declineValue = longestDecline.days > 0 ? formatDuration(longestDecline.days) : 'None';
  const declineDetail =
    longestDecline.days > 0 ? (
      <>
        Below the high set on {formatDate(longestDecline.fromDate)}
        {longestDecline.ongoing
          ? ', still going as of your latest entry.'
          : `, until ${formatDate(longestDecline.toDate)}.`}
      </>
    ) : (
      'Every snapshot matched or beat the one before it.'
    );

  return (
    <section className="q-card q-card--p-lg">
      <div className="q-section-head">
        <h2 style={{ margin: 0 }}>Drawdown and downside</h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', margin: '4px 0 0' }}>
          {hasFullHistory
            ? 'Computed across your full history.'
            : 'Computed across the last 12 months. Pro extends these to your full history.'}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--s-4)',
          marginTop: 'var(--s-4)',
        }}
      >
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Maximum drawdown"
          value={drawdownValue}
          valueColor={drawdown.maxDrawdownPct > 0 ? NEGATIVE : undefined}
          detail={drawdownDetail}
        />

        <StatCard
          icon={<Hourglass className="h-4 w-4" />}
          label="Longest decline"
          value={declineValue}
          detail={declineDetail}
        />

        <StatCard
          icon={<ArrowUpRight className="h-4 w-4" />}
          label="Best 12 months"
          value={rolling12m.best ? formatPct(rolling12m.best.pct) : '—'}
          valueColor={rolling12m.best ? POSITIVE : undefined}
          detail={
            rolling12m.best
              ? `Year to ${formatDate(rolling12m.best.endDate)}.`
              : 'Needs at least a year of history.'
          }
        />

        <StatCard
          icon={<ArrowDownRight className="h-4 w-4" />}
          label="Worst 12 months"
          value={rolling12m.worst ? formatPct(rolling12m.worst.pct) : '—'}
          valueColor={rolling12m.worst && rolling12m.worst.pct < 0 ? NEGATIVE : undefined}
          detail={
            rolling12m.worst
              ? `Year to ${formatDate(rolling12m.worst.endDate)}.`
              : 'Needs at least a year of history.'
          }
        />
      </div>
    </section>
  );
}
