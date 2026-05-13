import { useMemo, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { Treemap } from '@/components/charts/Treemap';
import { Donut } from '@/components/charts/Donut';
import { AllocationBars } from '@/components/charts/AllocationBars';
import { QTabs } from '@/components/ui/q-tabs';
import { SourceDetail } from '@/lib/types';
import { toTitleCase } from '@/lib/utils';

type View = 'treemap' | 'bars' | 'donut';

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'treemap', label: 'Treemap' },
  { value: 'bars',    label: 'Bars'    },
  { value: 'donut',   label: 'Donut'   },
];

function aggregateBy(
  sources: SourceDetail[],
  keyFn: (s: SourceDetail) => string,
): { name: string; value: number }[] {
  const groups = new Map<string, number>();
  sources.forEach((s) => {
    const key = keyFn(s);
    groups.set(key, (groups.get(key) || 0) + s.value);
  });
  return Array.from(groups.entries())
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function fmtCompact(v: number, fmt: (n: number) => string): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return fmt(Math.round(v / 100_000) / 10) + 'M';
  if (abs >= 1_000)     return fmt(Math.round(v / 100) / 10).replace(/\.0$/, '') + 'k';
  return fmt(v);
}

const AllocationsPage = () => {
  const { data, isLoading, snapshots } = usePortfolio();
  const { fmt, fmtFull } = useCurrencyFormatter();
  const [view, setView] = useState<View>('treemap');

  const aggregates = useMemo(() => {
    if (!snapshots.length) return null;
    const latest = snapshots[snapshots.length - 1];
    const positiveSources = latest.sources.filter((s) => s.value > 0);
    const totalAssets = positiveSources.reduce((sum, s) => sum + s.value, 0);

    return {
      latest,
      positiveSources,
      totalAssets,
      byVolatility: aggregateBy(latest.sources, (s) => toTitleCase(s.volatType)),
      byLiquidity:  aggregateBy(latest.sources, (s) => (s.isLiquid ? 'Liquid' : 'Non-liquid')),
      byCategory:   aggregateBy(latest.sources, (s) => toTitleCase(s.volatType)),
    };
  }, [snapshots]);

  if (isLoading) return <DashboardSkeleton />;
  if (!data) return <FileUpload />;
  if (!aggregates) return null;

  const { latest, positiveSources, totalAssets, byVolatility, byLiquidity, byCategory } = aggregates;
  const treemapData = positiveSources.map((s) => ({ id: s.name, name: s.name, value: Math.round(s.value) }));

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
          Allocations
        </h1>
        <p style={{ color: 'var(--fg-subtle)', fontSize: 14, margin: '6px 0 0' }}>
          How {fmtCompact(totalAssets, fmt)} of assets is distributed across {latest.sources.length} sources.
        </p>
      </div>

      {/* Portfolio map */}
      <div className="q-card q-card--p-lg">
        <div className="q-section-head">
          <div>
            <h2>Portfolio map</h2>
            <div className="q-section-sub">Each rectangle is a source. Area = current value.</div>
          </div>
          <QTabs<View> value={view} onChange={setView} options={VIEW_OPTIONS} size="sm" ariaLabel="View mode" />
        </div>
        {view === 'treemap' && <Treemap data={treemapData} height={360} />}
        {view === 'bars' && (
          <AllocationBars
            data={positiveSources
              .map((s) => ({ name: s.name, value: Math.round(s.value) }))
              .sort((a, b) => b.value - a.value)}
            fmt={fmt}
          />
        )}
        {view === 'donut' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Donut data={byCategory} size={280} thickness={36} />
          </div>
        )}
      </div>

      {/* By volatility + By liquidity */}
      <div className="q-grid q-grid--2">
        <div className="q-card q-card--p-lg">
          <h3 style={{ fontSize: 14, margin: 0, marginBottom: 12, fontWeight: 500 }}>By volatility</h3>
          <AllocationBars data={byVolatility} fmt={fmt} />
        </div>
        <div className="q-card q-card--p-lg">
          <h3 style={{ fontSize: 14, margin: 0, marginBottom: 12, fontWeight: 500 }}>By liquidity</h3>
          <AllocationBars data={byLiquidity} fmt={fmt} />
        </div>
      </div>

      {/* Full source table */}
      <div className="q-card q-card--p-none" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="q-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Volatility</th>
                <th>Liquid</th>
                <th className="num">Value</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {latest.sources.map((s, i) => {
                const pct = totalAssets > 0 ? (Math.abs(s.value) / totalAssets) * 100 : 0;
                return (
                  <tr key={s.name + i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 4, height: 22, borderRadius: 2, background: `var(--series-${(i % 8) + 1})`, flexShrink: 0 }} />
                        <span style={{ fontWeight: 500 }}>{s.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="q-badge q-badge--neutral">{toTitleCase(s.volatType)}</span>
                    </td>
                    <td>
                      {s.isLiquid
                        ? <Check size={14} style={{ color: 'var(--positive)' }} />
                        : <Lock  size={14} style={{ color: 'var(--fg-faint)' }} />}
                    </td>
                    <td className="num" style={{
                      color: s.value < 0 ? 'var(--negative)' : 'var(--fg)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {fmtFull(s.value)}
                    </td>
                    <td className="num" style={{ color: 'var(--fg-muted)' }}>
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AllocationsPage;
