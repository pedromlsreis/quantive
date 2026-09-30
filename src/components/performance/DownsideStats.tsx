import { useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useFormat } from '@/hooks/useFormat';
import { formatDate, duration } from '@/lib/formatters';
import { useHistoryFloor } from '@/hooks/useHistoryFloor';
import { useEntitlements } from '@/hooks/useEntitlements';
import { computeDownsideStats } from '@/lib/drawdownStats';

/** "2026-03-05" → "5 Mar 2026" (the product's English dates). */
function isoDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return formatDate(new Date(y, m - 1, d));
}

function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail: React.ReactNode }) {
  return (
    <div className="q-stat">
      <dt className="q-stat-label">{label}</dt>
      <dd className="q-stat-value num">{value}</dd>
      <dd className="q-stat-detail">{detail}</dd>
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
  const f = useFormat();
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
      <section className="q-sec" aria-labelledby="downside-title">
        <div className="q-sec-head"><h2 className="q-h2" id="downside-title">Highs and lows</h2></div>
        <p className="q-body">
          {"Once you've recorded a few months of values, this shows your largest decline, how long it took to recover, and your best and worst year."}
        </p>
      </section>
    );
  }

  const { drawdown, longestDecline, rolling12m } = stats;
  // On Free the window, not the user's history, is what's too short.
  const truncated = historyFloor !== null && allSnapshots.some((s) => s.date < historyFloor);
  const noYear = truncated ? 'Needs more than the 12 months the free plan shows.' : 'Needs at least a year of history.';

  const drawdownDetail =
    drawdown.maxDrawdownPct > 0 ? (
      <>
        <span className="num">{f.money(drawdown.maxDrawdownAbs)}</span> off the high on {isoDate(drawdown.peakDate)},
        down to {isoDate(drawdown.troughDate)}.{' '}
        {drawdown.stillUnderwater
          ? 'Not yet recovered.'
          : `Recovered ${isoDate(drawdown.recoveryDate)}, ${duration(drawdown.recoveryDays ?? 0)} later.`}
      </>
    ) : (
      'Never closed a month below an earlier high.'
    );

  const declineDetail =
    longestDecline.days > 0 ? (
      <>
        Below the high set on {isoDate(longestDecline.fromDate)}
        {longestDecline.ongoing ? ', still going at your latest entry.' : `, until ${isoDate(longestDecline.toDate)}.`}
      </>
    ) : (
      'Every entry matched or beat the one before it.'
    );

  return (
    <section className="q-sec" aria-labelledby="downside-title">
      <div className="q-sec-head">
        <div>
          <h2 className="q-h2" id="downside-title">Highs and lows</h2>
          <div className="q-sec-sub">
            {hasFullHistory ? 'Computed across your full history.' : 'Computed across the last 12 months.'}{' '}
            Figures include money you added or withdrew.
          </div>
        </div>
      </div>

      <dl className="q-stats">
        <Stat
          label="Maximum drawdown"
          value={drawdown.maxDrawdownPct > 0 ? f.pct(-drawdown.maxDrawdownPct) : 'None'}
          detail={drawdownDetail}
        />
        <Stat
          label="Longest decline"
          value={longestDecline.days > 0 ? duration(longestDecline.days) : 'None'}
          detail={declineDetail}
        />
        <Stat
          label="Best 12 months"
          value={rolling12m.best ? f.pct(rolling12m.best.pct, { signed: true }) : '—'}
          detail={rolling12m.best ? `Year to ${isoDate(rolling12m.best.endDate)}.` : noYear}
        />
        <Stat
          label="Worst 12 months"
          value={rolling12m.worst ? f.pct(rolling12m.worst.pct, { signed: true }) : '—'}
          detail={rolling12m.worst ? `Year to ${isoDate(rolling12m.worst.endDate)}.` : noYear}
        />
      </dl>
    </section>
  );
}
