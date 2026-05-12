import { useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { Treemap } from '@/components/charts/Treemap';
import { QTabs } from '@/components/ui/q-tabs';
import { Snapshot, SourceDetail } from '@/lib/types';
import { toTitleCase } from '@/lib/utils';

type AllocView = 'category' | 'vol' | 'liq';

const VIEW_OPTIONS: { value: AllocView; label: string }[] = [
  { value: 'category', label: 'By category'   },
  { value: 'vol',      label: 'By volatility' },
  { value: 'liq',      label: 'By liquidity'  },
];

function aggregateBy(
  sources: SourceDetail[],
  keyFn: (s: SourceDetail) => string,
): { id: string; name: string; value: number }[] {
  const groups = new Map<string, number>();
  sources.forEach((s) => {
    const key = keyFn(s);
    groups.set(key, (groups.get(key) || 0) + s.value);
  });
  return Array.from(groups.entries())
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ id: name, name, value }))
    .sort((a, b) => b.value - a.value);
}

function TopSourcesBars({
  sources,
  fmt,
}: {
  sources: SourceDetail[];
  fmt: (v: number) => string;
}) {
  const sorted = [...sources]
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  const total = sorted.reduce((s, d) => s + d.value, 0);
  const ceiling = total || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sorted.map((d, i) => {
        const pct = (d.value / ceiling) * 100;
        return (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.name}
                </span>
                <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 11, flexShrink: 0, marginLeft: 8 }}>
                  {fmt(d.value)}
                  <span style={{ color: 'var(--fg-faint)', marginLeft: 8 }}>
                    {pct.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: 'var(--surface-strong)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: `var(--series-${(i % 8) + 1})`,
                    width: `${pct}%`,
                    borderRadius: 2,
                    animation: `q-bar-grow 800ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms backwards`,
                    transformOrigin: 'left center',
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface AllocationChartsViewProps {
  snapshots: Snapshot[];
  fmt: (value: number) => string;
}

export function AllocationChartsView({ snapshots, fmt }: AllocationChartsViewProps) {
  const [view, setView] = useState<AllocView>('category');

  if (!snapshots.length) return null;

  const latest = snapshots[snapshots.length - 1];
  const sources = latest.sources;

  // Build treemap data based on view. "By category" = one cell per source,
  // since SourceDetail has no separate category field — each source IS its
  // own bucket from the user's spreadsheet perspective.
  const treemapData = (() => {
    if (view === 'category') {
      return sources
        .filter((s) => s.value > 0)
        .map((s) => ({ id: s.name, name: s.name, value: Math.round(s.value) }));
    }
    if (view === 'vol') {
      return aggregateBy(sources, (s) => toTitleCase(s.volatType));
    }
    return aggregateBy(sources, (s) => (s.isLiquid ? 'Liquid' : 'Non-Liquid'));
  })();

  return (
    <div className="q-grid q-grid--allocation">
      {/* Treemap card (1.6fr) */}
      <div className="q-card q-card--p-lg">
        <div className="q-section-head">
          <div>
            <h2>Allocation</h2>
            <div className="q-section-sub">
              Snapshot of {latest.date.toLocaleString('en', { month: 'long', year: 'numeric' })}
            </div>
          </div>
          <QTabs<AllocView>
            value={view}
            onChange={setView}
            options={VIEW_OPTIONS}
            size="sm"
            ariaLabel="Allocation grouping"
          />
        </div>
        <Treemap data={treemapData} height={320} />
      </div>

      {/* Top sources card (1fr) */}
      <div className="q-card q-card--p-lg">
        <div className="q-section-head">
          <div>
            <h2>Top sources</h2>
            <div className="q-section-sub">By current value</div>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <TopSourcesBars sources={sources} fmt={fmt} />
        </div>
      </div>
    </div>
  );
}

export function AllocationCharts() {
  const { snapshots } = usePortfolio();
  const { fmt } = useCurrencyFormatter();
  return <AllocationChartsView snapshots={snapshots} fmt={fmt} />;
}
