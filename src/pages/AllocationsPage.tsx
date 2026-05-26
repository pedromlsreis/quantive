import { useMemo, useState } from 'react';
import { Check, Snowflake } from 'lucide-react';
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
  const [view, setView] = useState<View>(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      return 'bars';
    }
    return 'treemap';
  });

  const aggregates = useMemo(() => {
    if (!snapshots.length) return null;
    const latest = snapshots[snapshots.length - 1];
    const positiveSources = latest.sources.filter((s) => s.value > 0);
    const negativeSources = latest.sources.filter((s) => s.value < 0);
    const totalAssets = positiveSources.reduce((sum, s) => sum + s.value, 0);
    const totalLiabilities = negativeSources.reduce((sum, s) => sum + Math.abs(s.value), 0);

    // Allocation aggregates are computed over assets only — mixing in a
    // liability would shrink the volatility/liquidity buckets it lives in
    // and silently misstate the asset mix.
    return {
      latest,
      positiveSources,
      negativeSources,
      totalAssets,
      totalLiabilities,
      byVolatility: aggregateBy(positiveSources, (s) => toTitleCase(s.volatType)),
      byLiquidity:  aggregateBy(positiveSources, (s) => (s.isLiquid ? 'Liquid' : 'Non-liquid')),
    };
  }, [snapshots]);

  if (isLoading) return <DashboardSkeleton />;
  if (!data) return <FileUpload />;
  if (!aggregates) return null;

  const { latest, positiveSources, negativeSources, totalAssets, totalLiabilities, byVolatility, byLiquidity } = aggregates;
  const netWorth = totalAssets - totalLiabilities;
  const treemapData = positiveSources.map((s) => ({ id: s.name, name: s.name, value: Math.round(s.value) }));

  // Donut shows the same data as treemap/bars (individual positive sources),
  // grouped: anything under 1.5% rolls into "Other" so the slice count stays legible.
  const donutData = (() => {
    const sorted = [...positiveSources].sort((a, b) => b.value - a.value);
    const threshold = totalAssets * 0.015;
    const major = sorted.filter((s) => s.value >= threshold);
    const minor = sorted.filter((s) => s.value <  threshold);
    const out = major.map((s) => ({ name: s.name, value: s.value }));
    if (minor.length) {
      const otherValue = minor.reduce((sum, s) => sum + s.value, 0);
      if (otherValue > 0) out.push({ name: `Other (${minor.length})`, value: otherValue });
    }
    return out;
  })();

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
          Allocations
        </h1>
        <p style={{ color: 'var(--fg-subtle)', fontSize: 14, margin: '6px 0 0' }}>
          How {fmtCompact(totalAssets, fmt)} of assets is distributed across {positiveSources.length} sources
          {negativeSources.length > 0 && (
            <>
              {' '}· Liabilities of {fmtCompact(totalLiabilities, fmt)} shown separately below
              {' '}· Net worth {fmtCompact(netWorth, fmt)}
            </>
          )}.
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
        {view === 'treemap' && <Treemap data={treemapData} height={260} fmt={fmt} />}
        {view === 'bars' && (
          <AllocationBars
            data={positiveSources
              .map((s) => ({ name: s.name, value: Math.round(s.value) }))
              .sort((a, b) => b.value - a.value)}
            fmt={fmt}
          />
        )}
        {view === 'donut' && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--s-6)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--s-4) 0',
            }}
          >
            <Donut data={donutData} size={260} thickness={32} />
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', minWidth: 280, maxWidth: 420, flex: '1 1 280px' }}>
              {donutData.map((d, i) => {
                const pct = totalAssets > 0 ? (d.value / totalAssets) * 100 : 0;
                return (
                  <li key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', fontSize: 'var(--text-sm)' }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: `var(--series-${(i % 8) + 1})`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.name}
                    </span>
                    <span className="num" style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                      {fmt(d.value)}
                    </span>
                    <span className="num" style={{ color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', width: 48, textAlign: 'right' }}>
                      {pct.toFixed(1)}%
                    </span>
                  </li>
                );
              })}
            </ul>
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

      {/* Asset table */}
      <div className="q-card q-card--p-none" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="q-table q-table--responsive">
            <thead>
              <tr>
                <th>Asset</th>
                <th data-col="secondary">Volatility</th>
                <th data-col="secondary">Liquid</th>
                <th className="num">Value</th>
                <th className="num" data-col="secondary">% of assets</th>
              </tr>
            </thead>
            <tbody>
              {positiveSources.map((s, i) => {
                const pct = totalAssets > 0 ? (s.value / totalAssets) * 100 : 0;
                return (
                  <tr key={s.name + i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 4, height: 28, borderRadius: 2, background: `var(--series-${(i % 8) + 1})`, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 500 }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                            {toTitleCase(s.volatType)} · {s.isLiquid ? 'Liquid' : 'Non-liquid'} · {pct.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-col="secondary">
                      <span className="q-badge q-badge--neutral">{toTitleCase(s.volatType)}</span>
                    </td>
                    <td data-col="secondary">
                      {s.isLiquid
                        ? <Check     size={14} style={{ color: 'var(--positive)' }} aria-label="Liquid" />
                        : <Snowflake size={14} style={{ color: 'var(--fg-faint)' }} aria-label="Non-liquid — frozen, slow to convert" />}
                    </td>
                    <td className="num" style={{ fontFamily: 'var(--font-mono)' }}>
                      {fmtFull(s.value)}
                    </td>
                    <td className="num" data-col="secondary" style={{ color: 'var(--fg-muted)' }}>
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Liabilities panel — only renders if any source is negative */}
      {negativeSources.length > 0 && (
        <div className="q-card q-card--p-lg">
          <div className="q-section-head">
            <div>
              <h2>Liabilities</h2>
              <div className="q-section-sub">
                Sources with a negative balance — kept out of allocation percentages so the asset mix stays honest.
              </div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="q-table q-table--responsive">
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="num">Owed</th>
                </tr>
              </thead>
              <tbody>
                {negativeSources.map((s, i) => (
                  <tr key={s.name + i}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                        {toTitleCase(s.volatType)} · {s.isLiquid ? 'Liquid' : 'Non-liquid'}
                      </div>
                    </td>
                    <td className="num" style={{ color: 'var(--negative)', fontFamily: 'var(--font-mono)' }}>
                      {fmtFull(s.value)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 500 }}>Total liabilities</td>
                  <td className="num" style={{ color: 'var(--negative)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {fmtFull(-totalLiabilities)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllocationsPage;
