import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { TREEMAP_COLORS, GRID_COLOR, AXIS_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from '@/lib/chartColors';

export function StackedAreaChart() {
  const { snapshots } = usePortfolio();
  const { fmt, fmtFull } = useCurrencyFormatter();

  if (snapshots.length < 2) return null;

  const allSourceNames = [...new Set(snapshots.flatMap(s => s.sources.map(src => src.name)))].sort();

  const data = snapshots.map(snap => {
    const row: Record<string, string | number> = {
      date: snap.date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
    };
    allSourceNames.forEach(name => {
      const src = snap.sources.find(s => s.name === name);
      row[name] = src ? Math.round(src.value) : 0;
    });
    return row;
  });

  const latest = snapshots[snapshots.length - 1];
  const sortedSources = [...allSourceNames].sort((a, b) => {
    const aVal = latest.sources.find(s => s.name === a)?.value ?? 0;
    const bVal = latest.sources.find(s => s.name === b)?.value ?? 0;
    return bVal - aVal;
  });

  type StackTooltipPayload = {
    value?: number;
    dataKey?: string;
    fill?: string;
    color?: string;
  };
  type StackTooltipProps = {
    active?: boolean;
    payload?: StackTooltipPayload[];
    label?: string | number;
  };
  const CustomTooltip = ({ active, payload, label }: StackTooltipProps) => {
    if (!active || !payload || !Array.isArray(payload) || payload.length === 0) return null;

    const safe = payload.filter((p): p is StackTooltipPayload & { value: number } => !!p && typeof p.value === 'number');
    if (safe.length === 0) return null;

    const total = safe.reduce((sum, p) => sum + p.value, 0);
    const sorted = [...safe].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
    const top5 = sorted.slice(0, 5);
    const othersVal = sorted.slice(5).reduce((sum, p) => sum + p.value, 0);

    return (
      <div style={{ backgroundColor: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <p style={{ color: AXIS_COLOR, fontSize: 12, marginBottom: 8 }}>{label}</p>
        <p style={{ color: '#e8ecf0', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Total: {fmtFull(total)}</p>
        {top5.map((p) => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: p.fill || p.color }} />
            <span style={{ color: AXIS_COLOR, fontSize: 11 }}>{p.dataKey}</span>
            <span style={{ color: '#e8ecf0', fontSize: 11, fontWeight: 600, marginLeft: 'auto' }}>{fmtFull(p.value)}</span>
          </div>
        ))}
        {othersVal > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: AXIS_COLOR }} />
            <span style={{ color: AXIS_COLOR, fontSize: 11 }}>Others</span>
            <span style={{ color: '#e8ecf0', fontSize: 11, fontWeight: 600, marginLeft: 'auto' }}>{fmtFull(othersVal)}</span>
          </div>
        )}
      </div>
    );
  };

  const interval = Math.max(1, Math.floor(data.length / 6));

  return (
    <div className="rounded-xl border border-border bg-card p-6" role="img" aria-label="Stacked area chart showing how each financial source contributes to total net worth over time">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">Source Breakdown Over Time</h3>
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="date" stroke={AXIS_COLOR} fontSize={11} interval={interval} angle={-40} textAnchor="end" tickMargin={8} />
            <YAxis stroke={AXIS_COLOR} fontSize={11} tickFormatter={(v) => fmt(v)} />
            <Tooltip content={<CustomTooltip />} />
            {sortedSources.map((name, i) => (
              <Area key={name} type="monotone" dataKey={name} stackId="1" fill={TREEMAP_COLORS[i % TREEMAP_COLORS.length]} stroke={TREEMAP_COLORS[i % TREEMAP_COLORS.length]} fillOpacity={0.8} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
