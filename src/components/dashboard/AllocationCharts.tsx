import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  ResponsiveContainer,
  Treemap,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import { CHART_COLORS, TOOLTIP_BG, TOOLTIP_BORDER, AXIS_COLOR } from '@/lib/chartColors';
import { formatCurrency, formatFullCurrency } from '@/lib/formatters';
import { SourceDetail } from '@/lib/types';

function aggregateByKey(
  sources: SourceDetail[],
  keyFn: (s: SourceDetail) => string
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

function DonutChart({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h4>
      <div className="h-[160px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={3} dataKey="value" stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 space-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-muted-foreground">{d.name}</span>
            </div>
            <span className="font-medium text-foreground">{((d.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Custom treemap content renderer
const TreemapContent = (props: any) => {
  const { x, y, width, height, name, value, index } = props;
  if (width < 4 || height < 4) return null;

  const color = CHART_COLORS[index % CHART_COLORS.length];
  const showLabel = width > 60 && height > 35;
  const showValue = width > 80 && height > 50;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={color} fillOpacity={0.85} stroke="hsl(222, 25%, 10%)" strokeWidth={2} />
      {showLabel && (
        <text x={x + width / 2} y={y + height / 2 - (showValue ? 8 : 0)} textAnchor="middle" dominantBaseline="central" fill="#e8ecf0" fontSize={11} fontWeight={600}>
          {name}
        </text>
      )}
      {showValue && (
        <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" dominantBaseline="central" fill="hsl(220, 12%, 60%)" fontSize={10}>
          {formatCurrency(value)}
        </text>
      )}
    </g>
  );
};

const TreemapTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ backgroundColor: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
      <p style={{ color: AXIS_COLOR, fontSize: 12, marginBottom: 4 }}>{d.name}</p>
      <p style={{ color: '#e8ecf0', fontSize: 14, fontWeight: 700 }}>{formatFullCurrency(d.value)}</p>
    </div>
  );
};

export function AllocationCharts() {
  const { snapshots } = usePortfolio();

  if (snapshots.length === 0) return null;

  const latest = snapshots[snapshots.length - 1];

  const treemapData = latest.sources
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({
      name: s.name,
      value: Math.round(s.value),
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));

  const volatData = aggregateByKey(latest.sources, s => s.volatType);
  const cryptoData = aggregateByKey(latest.sources, s => (s.isCrypto ? 'Crypto' : 'Traditional'));
  const liquidData = aggregateByKey(latest.sources, s => (s.isLiquid ? 'Liquid' : 'Non-Liquid'));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">Allocation by Source</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treemapData}
              dataKey="value"
              stroke="none"
              content={<TreemapContent />}
            >
              <Tooltip content={<TreemapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <DonutChart title="Volatility" data={volatData} />
        <DonutChart title="Asset Type" data={cryptoData} />
        <DonutChart title="Liquidity" data={liquidData} />
      </div>
    </div>
  );
}
