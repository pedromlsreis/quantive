import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { CHART_COLORS, GRID_COLOR, AXIS_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from '@/lib/chartColors';
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

const BarTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: TOOLTIP_BG,
        border: `1px solid ${TOOLTIP_BORDER}`,
        borderRadius: 8,
        padding: '12px 16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <p style={{ color: AXIS_COLOR, fontSize: 12, marginBottom: 4 }}>{payload[0]?.payload?.name}</p>
      <p style={{ color: '#e8ecf0', fontSize: 14, fontWeight: 700 }}>
        {formatFullCurrency(payload[0].value)}
      </p>
    </div>
  );
};

function DonutChart({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h4>
      <div className="h-[160px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={65}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
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
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="text-muted-foreground">{d.name}</span>
            </div>
            <span className="font-medium text-foreground">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AllocationCharts() {
  const { snapshots } = usePortfolio();

  if (snapshots.length === 0) return null;

  const latest = snapshots[snapshots.length - 1];

  const sourceData = latest.sources
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
        <div style={{ height: Math.max(200, sourceData.length * 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sourceData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
              <XAxis
                type="number"
                stroke={AXIS_COLOR}
                fontSize={11}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <YAxis type="category" dataKey="name" stroke={AXIS_COLOR} fontSize={11} width={100} />
              <Tooltip
                content={<BarTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                {sourceData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
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
