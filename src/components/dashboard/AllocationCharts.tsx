import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { Info } from 'lucide-react';
import { HelpHint } from '@/components/ui/help-hint';
import { Treemap } from '@/components/charts/Treemap';
import { Snapshot, SourceDetail } from '@/lib/types';
import { toTitleCase } from '@/lib/utils';

function aggregateByKey(
  sources: SourceDetail[],
  keyFn: (s: SourceDetail) => string,
): { name: string; value: number }[] {
  const groups = new Map<string, number>();
  sources.forEach(s => {
    const key = keyFn(s);
    groups.set(key, (groups.get(key) || 0) + s.value);
  });
  return Array.from(groups.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function Donut({ data, size = 140, thickness = 20 }: { data: { name: string; value: number }[]; size?: number; thickness?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - thickness / 2 - 2;
  const cx = size / 2, cy = size / 2;
  let angle = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const a0 = angle;
    const a1 = angle + (d.value / total) * Math.PI * 2;
    angle = a1;
    const gap = 0.02;
    const sa = a0 + gap, ea = a1 - gap;
    const x0 = cx + r * Math.cos(sa), y0 = cy + r * Math.sin(sa);
    const x1 = cx + r * Math.cos(ea), y1 = cy + r * Math.sin(ea);
    const large = ea - sa > Math.PI ? 1 : 0;
    return {
      d: `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      color: `var(--series-${(i % 8) + 1})`,
      name: d.name,
      pct: (d.value / total * 100).toFixed(0),
    };
  });

  return (
    <svg
      width={size}
      height={size}
      style={{ animation: 'q-arc-in 600ms cubic-bezier(0.22,1,0.36,1)' }}
    >
      {arcs.map((a, i) => (
        <path
          key={i}
          d={a.d}
          stroke={a.color}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          style={{ animation: `q-arc-in 600ms cubic-bezier(0.22,1,0.36,1) ${i * 80}ms backwards` }}
        />
      ))}
    </svg>
  );
}

function DonutCard({ title, data, description }: { title: string; data: { name: string; value: number }[]; description: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return null;

  return (
    <div className="q-card q-card--p-lg">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg)' }}>{title}</div>
        <HelpHint side="top" content={description}>
          <button type="button" aria-label="More info" className="q-icon-btn" style={{ width: 20, height: 20 }}>
            <Info size={12} />
          </button>
        </HelpHint>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Donut data={data} size={120} thickness={16} />
        <div style={{ flex: 1 }}>
          {data.map((d, i) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--series-${(i % 8) + 1})`, flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--fg-muted)' }}>{d.name}</span>
              <span className="num" style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {((d.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface AllocationChartsViewProps {
  snapshots: Snapshot[];
  fmt: (value: number) => string;
}

export function AllocationChartsView({ snapshots }: AllocationChartsViewProps) {
  if (!snapshots.length) return null;

  const latest = snapshots[snapshots.length - 1];

  const treemapData = latest.sources
    .filter(s => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .map(s => ({ id: s.name, name: s.name, value: Math.round(s.value) }));

  const volatData = aggregateByKey(latest.sources, s => toTitleCase(s.volatType));
  const liquidData = aggregateByKey(latest.sources, s => (s.isLiquid ? 'Liquid' : 'Non-Liquid'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div className="q-card q-card--p-lg" role="img" aria-label="Treemap showing portfolio allocation by source">
        <div className="q-section-head">
          <div>
            <h2>Allocation by source</h2>
            <div className="q-section-sub">Each rectangle = current value · Area proportional to weight</div>
          </div>
        </div>
        <Treemap data={treemapData} height={300} />
      </div>

      <div className="q-grid q-grid--2">
        <DonutCard
          title="Volatility"
          data={volatData}
          description="How stable each asset's value is over time. Volatile assets (stocks, crypto) swing more in price."
        />
        <DonutCard
          title="Liquidity"
          data={liquidData}
          description="How quickly you can convert each asset to cash. Liquid assets can be accessed within days."
        />
      </div>
    </div>
  );
}

export function AllocationCharts() {
  const { snapshots } = usePortfolio();
  const { fmt } = useCurrencyFormatter();
  return <AllocationChartsView snapshots={snapshots} fmt={fmt} />;
}
