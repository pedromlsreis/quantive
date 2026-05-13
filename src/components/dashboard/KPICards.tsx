import { useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { HelpHint } from '@/components/ui/help-hint';
import { generateForecast } from '@/lib/forecast';

/** "+1.04%" / "-1.04%" — 2 decimals to match the prototype's DeltaBadge. */
function fmtDelta(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function DeltaBadge({ value }: { value: number }) {
  if (!Number.isFinite(value) || value === 0) {
    return <span style={{ color: 'var(--fg-subtle)' }}>—</span>;
  }
  const pos = value > 0;
  return (
    <span className={`q-delta ${pos ? 'q-delta--pos' : 'q-delta--neg'}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        {pos ? (
          <path d="M2 7l3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      <span className="num">{fmtDelta(value)}</span>
    </span>
  );
}

function CardShell({
  children,
  formula,
}: {
  children: React.ReactNode;
  formula?: string;
}) {
  const card = <div className="q-card q-card--p-lg h-full">{children}</div>;
  if (!formula) return card;
  return (
    <HelpHint
      side="bottom"
      maxWidthClass="max-w-[280px]"
      content={formula}
      triggerWrapperClassName="block h-full"
    >
      {card}
    </HelpHint>
  );
}

/**
 * Locale-aware full euro display: `€437.573` in de-DE, `$437,573` in en-US.
 * No decimals — matches the prototype's "€437.573" headline number.
 */
function fmtFullNoDecimals(value: number, symbol: string, locale: string): string {
  return `${symbol}${value.toLocaleString(locale, { maximumFractionDigits: 0 })}`;
}

/**
 * Locale-aware compact: `€290,5k` / `€1,2M` in de-DE, `€290.5k` / `€1.2M` in en-US.
 * Matches the prototype's compact format on Liquid Assets and Forecast cards.
 */
function fmtCompact(value: number, symbol: string, locale: string): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${symbol}${(value / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}M`;
  }
  if (abs >= 1_000) {
    return `${symbol}${(value / 1_000).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}k`;
  }
  return `${symbol}${value.toLocaleString(locale, { maximumFractionDigits: 0 })}`;
}

export function KPICards() {
  const { kpis, snapshots } = usePortfolio();
  const { currency } = useCurrencyFormatter();
  const { symbol, locale } = currency;

  // Liquid Assets in € (kpis only exposes %)
  const liquidValue = useMemo(() => {
    if (!snapshots.length) return 0;
    return snapshots[snapshots.length - 1].sources
      .filter((s) => s.isLiquid)
      .reduce((sum, s) => sum + s.value, 0);
  }, [snapshots]);

  // Distinct categories proxy (volatility types)
  const categoryCount = useMemo(() => {
    if (!snapshots.length) return 0;
    const set = new Set(
      snapshots[snapshots.length - 1].sources
        .map((s) => s.volatType)
        .filter((v) => v && v.toLowerCase() !== 'unknown'),
    );
    return set.size;
  }, [snapshots]);

  // 5-year forecast (median) using historical CAGR
  const forecast5y = useMemo(() => {
    if (snapshots.length < 2) return { value: 0, cagr: 0 };
    const points = generateForecast(snapshots, 60);
    const last = points[points.length - 1];
    const first = snapshots[0];
    const latest = snapshots[snapshots.length - 1];
    const months =
      (latest.date.getFullYear() - first.date.getFullYear()) * 12 +
      (latest.date.getMonth() - first.date.getMonth());
    const cagr =
      months > 0 && first.total > 0 && latest.total > 0
        ? (Math.pow(latest.total / first.total, 12 / months) - 1) * 100
        : 0;
    return { value: last?.forecast ?? 0, cagr };
  }, [snapshots]);

  return (
    <div className="q-grid q-grid--kpi q-stagger">
      {/* Card 1 — Net Worth (1.5fr, headline) */}
      <CardShell formula="Sum of all source values at the latest snapshot. MoM and YoY % vs. the matched historical snapshots.">
        <div className="q-metric">
          <div className="q-metric-eyebrow">Net Worth</div>
          <div className="q-metric-value q-metric-value--xl num">
            {fmtFullNoDecimals(kpis.currentNetWorth, symbol, locale)}
          </div>
          <div className="q-metric-meta">
            <DeltaBadge value={kpis.momChange} />
            <span className="q-metric-sub">vs. last month</span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <DeltaBadge value={kpis.yoyChange} />
            <span className="q-metric-sub">YoY</span>
          </div>
        </div>
      </CardShell>

      {/* Card 2 — Liquid Assets */}
      <CardShell formula="Total value of sources flagged as transferable-in-days. Caption shows what fraction of net worth that represents.">
        <div className="q-metric">
          <div className="q-metric-eyebrow">Liquid Assets</div>
          <div className="q-metric-value q-metric-value--lg num">
            {fmtCompact(liquidValue, symbol, locale)}
          </div>
          <div className="q-metric-meta">
            <span className="q-metric-sub">{Math.round(kpis.liquidPercent)}% of assets</span>
          </div>
        </div>
      </CardShell>

      {/* Card 3 — Sources */}
      <CardShell formula="Distinct sources tracked in the latest snapshot, grouped by their volatility category.">
        <div className="q-metric">
          <div className="q-metric-eyebrow">Sources</div>
          <div className="q-metric-value q-metric-value--lg num">{kpis.sourceCount}</div>
          <div className="q-metric-meta">
            <span className="q-metric-sub">
              across {categoryCount} {categoryCount === 1 ? 'category' : 'categories'}
            </span>
          </div>
        </div>
      </CardShell>

      {/* Card 4 — Forecast (5y) */}
      <CardShell formula="Median 5-year projection from a CAGR fitted to your full history. See the Forecast page for scenarios and confidence bands.">
        <div className="q-metric">
          <div className="q-metric-eyebrow">Forecast (5y)</div>
          <div className="q-metric-value q-metric-value--lg num">
            {forecast5y.value > 0 ? fmtCompact(forecast5y.value, symbol, locale) : '—'}
          </div>
          <div className="q-metric-meta">
            {forecast5y.cagr > 0 ? (
              <span className="q-badge q-badge--accent">CAGR {forecast5y.cagr.toFixed(1)}%</span>
            ) : (
              <span className="q-metric-sub">Need more history</span>
            )}
          </div>
        </div>
      </CardShell>
    </div>
  );
}
