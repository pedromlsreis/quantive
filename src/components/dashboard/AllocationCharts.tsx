import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { ResponsiveContainer, Treemap, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { CHART_COLORS, TREEMAP_COLORS, TOOLTIP_BG, TOOLTIP_BORDER, AXIS_COLOR } from '@/lib/chartColors';
import { SourceDetail } from '@/lib/types';
import { Info } from 'lucide-react';
import { UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

function DonutChart({ title, data, description }: { title: string; data: { name: string; value: number }[]; description: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4" role="img" aria-label={`Donut chart showing ${title.toLowerCase()} breakdown`}>
      <div className="mb-2 flex items-center gap-1.5">
        <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
        <TooltipProvider>
          <UITooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground/50" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
              {description}
            </TooltipContent>
          </UITooltip>
        </TooltipProvider>
      </div>
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
              <span className="text-foreground/80">{d.name}</span>
            </div>
            <span className="font-medium text-foreground">{((d.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AllocationCharts() {
  const { snapshots } = usePortfolio();
  const { fmt, fmtFull } = useCurrencyFormatter();

  if (snapshots.length === 0) return null;

  const latest = snapshots[snapshots.length - 1];

  const treemapData = latest.sources
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({ name: s.name, value: Math.round(s.value), fill: TREEMAP_COLORS[i % TREEMAP_COLORS.length] }));

  const volatData = aggregateByKey(latest.sources, s => s.volatType);
  const liquidData = aggregateByKey(latest.sources, s => (s.isLiquid ? 'Liquid' : 'Non-Liquid'));

  const TreemapContent = (props: any) => {
    const { x, y, width, height, name, value, index } = props;
    if (width < 4 || height < 4) return null;
    const color = TREEMAP_COLORS[index % TREEMAP_COLORS.length];
    const showLabel = width > 60 && height > 35;
    const showValue = width > 80 && height > 50;
    const pad = 8;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={4} fill={color} fillOpacity={0.9} stroke="hsl(222, 25%, 10%)" strokeWidth={2} />
        {showLabel && <text x={x + pad} y={y + pad + 12} textAnchor="start" fill="#e8ecf0" fontSize={11} fontWeight={600}>{name}</text>}
        {showValue && <text x={x + pad} y={y + pad + 26} textAnchor="start" fill="#e8ecf0" fontSize={10}>{fmt(value)}</text>}
      </g>
    );
  };

  const TreemapTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !Array.isArray(payload) || payload.length === 0) return null;
    const first = payload[0];
    if (!first || !first.payload) return null;
    const d = first.payload;
    return (
      <div style={{ backgroundColor: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <p style={{ color: AXIS_COLOR, fontSize: 12, marginBottom: 4 }}>{d.name}</p>
        <p style={{ color: '#e8ecf0', fontSize: 14, fontWeight: 700 }}>{fmtFull(d.value)}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6" role="img" aria-label="Treemap showing portfolio allocation breakdown by financial source">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">Allocation by Source</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={treemapData} dataKey="value" stroke="none" content={<TreemapContent />}>
              <Tooltip content={<TreemapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DonutChart title="Volatility" data={volatData} description="How stable each asset's value is over time. Volatile assets (stocks, crypto) swing more in price, while non-volatile assets (savings, bonds) remain steadier." />
        <DonutChart title="Liquidity" data={liquidData} description="How quickly you can convert each asset to cash. Liquid assets (savings, stocks) can be accessed within days, while non-liquid assets (real estate, locked funds) take longer." />
      </div>
    </div>
  );
}