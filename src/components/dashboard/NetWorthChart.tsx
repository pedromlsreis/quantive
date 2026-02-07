import { usePortfolio } from '@/contexts/PortfolioContext';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format } from 'date-fns';
import { formatCurrency, formatFullCurrency } from '@/lib/formatters';
import { PRIMARY_COLOR, GRID_COLOR, AXIS_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from '@/lib/chartColors';

const CustomTooltip = ({ active, payload, label }: any) => {
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
      <p style={{ color: AXIS_COLOR, fontSize: 12, marginBottom: 4 }}>{label}</p>
      <p style={{ color: '#e8ecf0', fontSize: 16, fontWeight: 700 }}>
        {formatFullCurrency(payload[0].value)}
      </p>
    </div>
  );
};

export function NetWorthChart() {
  const { snapshots } = usePortfolio();

  if (snapshots.length === 0) return null;

  const chartData = snapshots.map(s => ({
    date: format(s.date, 'MMM yyyy'),
    total: Math.round(s.total),
  }));

  const interval = Math.max(1, Math.floor(chartData.length / 12));

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">Net Worth Over Time</h3>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PRIMARY_COLOR} stopOpacity={0.25} />
                <stop offset="95%" stopColor={PRIMARY_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis
              dataKey="date"
              stroke={AXIS_COLOR}
              fontSize={11}
              interval={interval}
              tickMargin={8}
            />
            <YAxis
              stroke={AXIS_COLOR}
              fontSize={11}
              tickFormatter={(v) => formatCurrency(v)}
              width={70}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="total"
              stroke={PRIMARY_COLOR}
              fill="url(#netWorthGradient)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: PRIMARY_COLOR }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
