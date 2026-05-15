import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useIsMobile } from '@/hooks/use-mobile';
import { Treemap } from '@/components/charts/Treemap';
import { Snapshot, SourceDetail } from '@/lib/types';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      {sorted.map((d, i) => {
        const pct = (d.value / ceiling) * 100;
        return (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.name}
                </span>
                <span className="num" style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', flexShrink: 0, marginLeft: 'var(--s-2)' }}>
                  {fmt(d.value)}
                  <span style={{ color: 'var(--fg-faint)', marginLeft: 'var(--s-2)' }}>
                    {pct.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div style={{ marginTop: 'var(--s-1)', height: 4, borderRadius: 'var(--r-1)', background: 'var(--surface-strong)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: `var(--series-${(i % 8) + 1})`,
                    width: `${pct}%`,
                    borderRadius: 'var(--r-1)',
                    animation: `q-bar-grow var(--d-slow) var(--ease-out) ${i * 60}ms backwards`,
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

export function AllocationChartsView({ snapshots, fmt, isMobile }: AllocationChartsViewProps & { isMobile?: boolean }) {
  if (!snapshots.length) return null;

  const latest = snapshots[snapshots.length - 1];
  const sources = latest.sources;

  const treemapData = sources
    .filter((s) => s.value > 0)
    .map((s) => ({ id: s.name, name: s.name, value: Math.round(s.value) }));

  const sectionSub = `Snapshot of ${latest.date.toLocaleString('en', { month: 'long', year: 'numeric' })}`;
  const viewAllLink = (
    <Link
      to="/allocations"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--s-1)',
        fontSize: 'var(--text-sm)',
        color: 'var(--accent-raw)',
        textDecoration: 'none',
      }}
    >
      View all
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );

  if (isMobile) {
    return (
      <div className="q-card q-card--p-lg">
        <div className="q-section-head">
          <div>
            <h2>Allocation</h2>
            <div className="q-section-sub">{sectionSub}</div>
          </div>
          {viewAllLink}
        </div>
        <TopSourcesBars sources={sources} fmt={fmt} />
      </div>
    );
  }

  return (
    <div className="q-grid q-grid--allocation">
      {/* Treemap card (1.6fr) */}
      <div className="q-card q-card--p-lg">
        <div className="q-section-head">
          <div>
            <h2>Allocation</h2>
            <div className="q-section-sub">{sectionSub}</div>
          </div>
          {viewAllLink}
        </div>
        <Treemap data={treemapData} height={320} fmt={fmt} />
      </div>

      {/* Top sources card (1fr) */}
      <div className="q-card q-card--p-lg">
        <div className="q-section-head">
          <div>
            <h2>Top sources</h2>
            <div className="q-section-sub">By current value</div>
          </div>
        </div>
        <TopSourcesBars sources={sources} fmt={fmt} />
      </div>
    </div>
  );
}

export function AllocationCharts() {
  const { snapshots } = usePortfolio();
  const { fmt } = useCurrencyFormatter();
  const isMobile = useIsMobile();
  return <AllocationChartsView snapshots={snapshots} fmt={fmt} isMobile={isMobile} />;
}
