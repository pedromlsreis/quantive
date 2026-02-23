import { usePortfolio } from '@/contexts/PortfolioContext';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format } from 'date-fns';
import { generateForecast } from '@/lib/forecast';
import { formatCurrency, formatFullCurrency } from '@/lib/formatters';
import {
  PRIMARY_COLOR,
  POSITIVE_COLOR,
  GRID_COLOR,
  AXIS_COLOR,
  TOOLTIP_BG,
  TOOLTIP_BORDER,
} from '@/lib/chartColors';

const ForecastTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const actual = payload.find((p: any) => p.dataKey === 'actual');
  const forecast = payload.find((p: any) => p.dataKey === 'forecast');
  const upper = payload.find((p: any) => p.dataKey === 'upper');
  const lower = payload.find((p: any) => p.dataKey === 'lower');
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
      {actual?.value != null && (
        <p style={{ color: PRIMARY_COLOR, fontSize: 14, fontWeight: 700 }}>
          Actual: {formatFullCurrency(actual.value)}
        </p>
      )}
      {forecast?.value != null && (
        <p style={{ color: POSITIVE_COLOR, fontSize: 14, fontWeight: 700 }}>
          Forecast: {formatFullCurrency(forecast.value)}
        </p>
      )}
      {upper?.value != null && lower?.value != null && (
        <p style={{ color: AXIS_COLOR, fontSize: 11, marginTop: 2 }}>
          Range: {formatFullCurrency(lower.value)} – {formatFullCurrency(upper.value)}
        </p>
      )}
    </div>
  );
};

export function ForecastChart() {
  const { snapshots } = usePortfolio();

  if (snapshots.length < 3) return null;

  const forecastPoints = generateForecast(snapshots, 12);

  const chartData: {
    date: string;
    actual: number | null;
    forecast: number | null;
    upper: number | null;
    lower: number | null;
  }[] = snapshots.map(s => ({
    date: format(s.date, 'MMM yy'),
    actual: Math.round(s.total),
    forecast: null,
    upper: null,
    lower: null,
  }));

  // Transition point
  if (chartData.length > 0) {
    const last = chartData[chartData.length - 1];
    last.forecast = last.actual;
    last.upper = last.actual;
    last.lower = last.actual;
  }

  forecastPoints.forEach(f => {
    chartData.push({
      date: format(f.date, 'MMM yy'),
      actual: null,
      forecast: Math.round(f.forecast),
      upper: Math.round(f.upper),
      lower: Math.round(f.lower),
    });
  });

  const interval = Math.max(1, Math.floor(chartData.length / 12));

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Net Worth Forecast</h3>
          <p className="text-xs text-muted-foreground/70">12-month projection with confidence band</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-5 rounded" style={{ backgroundColor: PRIMARY_COLOR }} />
            <span className="text-muted-foreground">Actual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="h-0.5 w-5 rounded"
              style={{ backgroundColor: POSITIVE_COLOR, opacity: 0.7 }}
            />
            <span className="text-muted-foreground">Forecast</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-5 rounded"
              style={{ backgroundColor: POSITIVE_COLOR, opacity: 0.12 }}
            />
            <span className="text-muted-foreground">95% CI</span>
          </div>
        </div>
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="actualForecastGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PRIMARY_COLOR} stopOpacity={0.2} />
                <stop offset="95%" stopColor={PRIMARY_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={POSITIVE_COLOR} stopOpacity={0.15} />
                <stop offset="95%" stopColor={POSITIVE_COLOR} stopOpacity={0} />
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
            <Tooltip content={<ForecastTooltip />} />
            {/* Confidence band - upper */}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill={POSITIVE_COLOR}
              fillOpacity={0.08}
              dot={false}
              connectNulls={false}
              activeDot={false}
            />
            {/* Confidence band - lower (cuts out the bottom) */}
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="hsl(222, 25%, 10%)"
              fillOpacity={1}
              dot={false}
              connectNulls={false}
              activeDot={false}
            />
            <Area
              type="monotone"
              dataKey="actual"
              stroke={PRIMARY_COLOR}
              fill="url(#actualForecastGradient)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="forecast"
              stroke={POSITIVE_COLOR}
              fill="url(#forecastGradient)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
