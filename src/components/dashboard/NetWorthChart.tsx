import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot, Label } from 'recharts';
import { format } from 'date-fns';
import { PRIMARY_COLOR, POSITIVE_COLOR, GRID_COLOR, AXIS_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from '@/lib/chartColors';

export function NetWorthChart() {
  const { snapshots } = usePortfolio();
  const { fmt, fmtFull } = useCurrencyFormatter();

  if (snapshots.length === 0) return null;

  const chartData = snapshots.map((s, i) => ({
    key: i,
    date: format(s.date, 'MMM yyyy'),
    total: Math.round(s.total),
  }));

  // Find ATH index
  let athIdx = 0;
  for (let i = 1; i < chartData.length; i++) {
    if (chartData[i].total > chartData[athIdx].total) athIdx = i;
  }

  // Find best month increase index
  let bestMonthIdx = -1;
  let bestMonthGain = -Infinity;
  for (let i = 1; i < chartData.length; i++) {
    const gain = chartData[i].total - chartData[i - 1].total;
    if (gain > bestMonthGain) {
      bestMonthGain = gain;
      bestMonthIdx = i;
    }
  }

  // Build annotations
  const annotations: { idx: number; label: string; color: string }[] = [];
  if (athIdx === bestMonthIdx) {
    annotations.push({ idx: athIdx, label: 'ATH & Best month', color: PRIMARY_COLOR });
  } else {
    annotations.push({ idx: athIdx, label: 'All-time high', color: PRIMARY_COLOR });
    if (bestMonthIdx >= 0) {
      annotations.push({ idx: bestMonthIdx, label: 'Best month', color: POSITIVE_COLOR });
    }
  }

  const interval = Math.max(1, Math.floor(chartData.length / 12));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ backgroundColor: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <p style={{ color: AXIS_COLOR, fontSize: 12, marginBottom: 4 }}>{label}</p>
        <p style={{ color: '#e8ecf0', fontSize: 16, fontWeight: 700 }}>{fmtFull(payload[0].value)}</p>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6" style={{ overflow: 'visible' }}>
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">Net Worth Over Time</h3>
      <div className="h-[320px]" style={{ overflow: 'visible' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 35, right: 30, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PRIMARY_COLOR} stopOpacity={0.25} />
                <stop offset="95%" stopColor={PRIMARY_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="date" stroke={AXIS_COLOR} fontSize={11} interval={interval} tickMargin={8} />
            <YAxis stroke={AXIS_COLOR} fontSize={11} tickFormatter={(v) => fmt(v)} width={70} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="total" stroke={PRIMARY_COLOR} fill="url(#netWorthGradient)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: PRIMARY_COLOR }} />
            {annotations.map((a) => (
              <ReferenceDot key={`annotation-${a.idx}`} x={chartData[a.idx].date} y={chartData[a.idx].total} r={6} fill={a.color} stroke="hsl(222, 25%, 10%)" strokeWidth={2} isFront>
                <Label value={a.label} position="top" offset={12} style={{ fontSize: 11, fontWeight: 700, fill: a.color }} />
              </ReferenceDot>
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
