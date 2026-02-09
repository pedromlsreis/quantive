import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { CHART_COLORS, GRID_COLOR, AXIS_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from '@/lib/chartColors';
import { formatCurrency, formatFullCurrency } from '@/lib/formatters';

export function StackedAreaChart() {
  const { snapshots } = usePortfolio();

  if (snapshots.length < 2) return null;

  // Get all unique source names
  const allSourceNames = [...new Set(snapshots.flatMap(s => s.sources.map(src => src.name)))].sort();

  // Build data: each row = { date, source1: val, source2: val, ... }
  const data = snapshots.map(snap => {
    const row: Record<string, any> = {
      date: snap.date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
    };
    allSourceNames.forEach(name => {
      const src = snap.sources.find(s => s.name === name);
      row[name] = src ? Math.round(src.value) : 0;
    });
    return row;
  });

  // Sort sources by their latest value (largest at bottom for visual stability)
  const latest = snapshots[snapshots.length - 1];
  const sortedSources = [...allSourceNames].sort((a, b) => {
    const aVal = latest.sources.find(s => s.name === a)?.value ?? 0;
    const bVal = latest.sources.find(s => s.name === b)?.value ?? 0;
    return bVal - aVal;
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);

    // Top 5 by value, rest grouped as "Others"
    const sorted = [...payload].filter((p: any) => p.value > 0).sort((a: any, b: any) => b.value - a.value);
    const top5 = sorted.slice(0, 5);
    const othersVal = sorted.slice(5).reduce((sum: number, p: any) => sum + (p.value || 0), 0);

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
        <p style={{ color: AXIS_COLOR, fontSize: 12, marginBottom: 8 }}>{label}</p>
        <p style={{ color: '#e8ecf0', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          Total: {formatFullCurrency(total)}
        </p>
        {top5.map((p: any) => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: p.fill || p.color }} />
            <span style={{ color: AXIS_COLOR, fontSize: 11 }}>{p.dataKey}</span>
            <span style={{ color: '#e8ecf0', fontSize: 11, fontWeight: 600, marginLeft: 'auto' }}>
              {formatFullCurrency(p.value)}
            </span>
          </div>
        ))}
        {othersVal > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: AXIS_COLOR }} />
            <span style={{ color: AXIS_COLOR, fontSize: 11 }}>Others</span>
            <span style={{ color: '#e8ecf0', fontSize: 11, fontWeight: 600, marginLeft: 'auto' }}>
              {formatFullCurrency(othersVal)}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">Source Breakdown Over Time</h3>
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="date" stroke={AXIS_COLOR} fontSize={11} />
            <YAxis stroke={AXIS_COLOR} fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
            <Tooltip content={<CustomTooltip />} />
            {sortedSources.map((name, i) => (
              <Area
                key={name}
                type="monotone"
                dataKey={name}
                stackId="1"
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={0.8}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
