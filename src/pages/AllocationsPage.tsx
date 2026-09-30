import { useMemo, useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useFormat } from '@/hooks/useFormat';
import { useSourceColors } from '@/hooks/useSourceColors';
import { PageSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { RouteEmpty } from '@/components/dashboard/EmptyState';
import { Treemap } from '@/components/charts/Treemap';
import { AllocationBars } from '@/components/charts/AllocationBars';
import { QTabs } from '@/components/ui/q-tabs';
import { openComposer } from '@/lib/appEvents';
import { sentenceCase } from '@/lib/utils';
import type { SourceDetail } from '@/lib/types';

type View = 'treemap' | 'bars';

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'treemap', label: 'Treemap' },
  { value: 'bars', label: 'Bars' },
];

// Volatility is ordinal, so groups keep their natural order, not size order.
const VOLATILITY_ORDER = ['non-volatile', 'volatile', 'highly volatile'];

function groupBy(sources: SourceDetail[], keyFn: (s: SourceDetail) => string) {
  const groups = new Map<string, number>();
  sources.forEach((s) => groups.set(keyFn(s), (groups.get(keyFn(s)) || 0) + s.value));
  return Array.from(groups.entries())
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));
}

const AllocationsPage = () => {
  const { data, isLoading, snapshots } = usePortfolio();
  const f = useFormat();
  const colorOf = useSourceColors();
  const [view, setView] = useState<View>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'bars' : 'treemap',
  );

  const agg = useMemo(() => {
    if (!snapshots.length) return null;
    const latest = snapshots[snapshots.length - 1];
    const assets = latest.sources.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
    const liabilities = latest.sources.filter((s) => s.value < 0);
    const totalAssets = assets.reduce((sum, s) => sum + s.value, 0);
    const totalLiabilities = liabilities.reduce((sum, s) => sum + s.value, 0);
    // Shares are of assets only: mixing a liability into its volatility or
    // liquidity group would shrink that group and misstate the mix.
    const byVolatility = groupBy(assets, (s) => s.volatType.trim().toLowerCase())
      .sort((a, b) => {
        const ia = VOLATILITY_ORDER.indexOf(a.name);
        const ib = VOLATILITY_ORDER.indexOf(b.name);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map((g) => ({ ...g, name: sentenceCase(g.name) }));
    const byLiquidity = groupBy(assets, (s) => (s.isLiquid ? 'Liquid' : 'Non-liquid'));
    return { assets, liabilities, totalAssets, totalLiabilities, byVolatility, byLiquidity };
  }, [snapshots]);

  if (isLoading) return <PageSkeleton />;
  if (!data) return <RouteEmpty title="Allocations" sentence="How your net worth splits across sources, and how much of it is liquid." />;
  if (!agg) {
    return (
      <div className="q-empty">
        <h1 className="q-h1" tabIndex={-1}>Allocations</h1>
        <p className="q-page-lede">Your allocation appears once you add an entry.</p>
        <div className="q-empty-actions">
          <button type="button" className="q-btn q-btn--primary q-btn--lg" onClick={openComposer}>Add entry</button>
        </div>
      </div>
    );
  }

  const { assets, liabilities, totalAssets, totalLiabilities, byVolatility, byLiquidity } = agg;
  const money = (v: number) => f.money(v);

  return (
    <div>
      <header className="q-page-head">
        <h1 className="q-h1" tabIndex={-1}>Allocations</h1>
        <p className="q-page-lede">
          <span className="num">{f.money(totalAssets)}</span>
          {` of assets across ${assets.length} ${assets.length === 1 ? 'source' : 'sources'}.`}
        </p>
      </header>

      <section className="q-sec" aria-labelledby="map-title">
        <div className="q-sec-head">
          <div>
            <h2 className="q-h2" id="map-title">Portfolio map</h2>
            <div className="q-sec-sub">Each source sized by its value today.</div>
          </div>
          <QTabs<View> value={view} onChange={setView} options={VIEW_OPTIONS} size="sm" ariaLabel="View mode" />
        </div>
        {view === 'treemap' ? (
          <Treemap data={assets.map((s) => ({ id: s.name, name: s.name, value: s.value }))} height={300} fmt={money} colorOf={colorOf} />
        ) : (
          <AllocationBars data={assets.map((s) => ({ name: s.name, value: s.value }))} fmt={money} fmtPct={(v) => f.pct(v)} colorOf={colorOf} />
        )}
      </section>

      <div className="q-sec-pair q-sec-pair--even">
        <section className="q-sec" aria-labelledby="vol-title">
          <div className="q-sec-head"><h2 className="q-h2" id="vol-title">By volatility</h2></div>
          <AllocationBars data={byVolatility} fmt={money} fmtPct={(v) => f.pct(v)} />
        </section>
        <section className="q-sec" aria-labelledby="liq-title">
          <div className="q-sec-head"><h2 className="q-h2" id="liq-title">By liquidity</h2></div>
          <AllocationBars data={byLiquidity} fmt={money} fmtPct={(v) => f.pct(v)} />
        </section>
      </div>

      <section className="q-sec" aria-labelledby="sources-title">
        <div className="q-sec-head"><h2 className="q-h2" id="sources-title">By source</h2></div>
        <table className="q-table q-table--responsive">
          <caption className="sr-only">Assets by value, with volatility, liquidity and share of assets</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col" data-col="secondary">Volatility</th>
              <th scope="col" data-col="secondary">Liquidity</th>
              <th scope="col" className="num">Value</th>
              <th scope="col" className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((s) => (
              <tr key={s.name}>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span aria-hidden="true" style={{ width: 3, height: 20, background: colorOf(s.name), flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}>{s.name}</span>
                  </span>
                </td>
                <td data-col="secondary" style={{ color: 'var(--fg-muted)' }}>{sentenceCase(s.volatType)}</td>
                <td data-col="secondary" style={{ color: 'var(--fg-muted)' }}>{s.isLiquid ? 'Liquid' : 'Non-liquid'}</td>
                <td className="num">{f.money(s.value)}</td>
                <td className="num" style={{ color: 'var(--fg-muted)' }}>{f.pct((s.value / totalAssets) * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {liabilities.length > 0 && (
        <section className="q-sec" aria-labelledby="liab-title">
          <div className="q-sec-head">
            <div>
              <h2 className="q-h2" id="liab-title">Liabilities</h2>
              <div className="q-sec-sub">Not counted in the shares above.</div>
            </div>
          </div>
          <table className="q-table">
            <thead>
              <tr><th scope="col">Source</th><th scope="col" className="num">Owed</th></tr>
            </thead>
            <tbody>
              {liabilities.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="num">{f.money(s.value)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 500 }}>Total</td>
                <td className="num" style={{ fontWeight: 500 }}>{f.money(totalLiabilities)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};

export default AllocationsPage;
