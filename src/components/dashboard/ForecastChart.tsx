import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format } from 'date-fns';
import { generateForecast } from '@/lib/forecast';
import { PRIMARY_COLOR, POSITIVE_COLOR, GRID_COLOR, AXIS_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from '@/lib/chartColors';
import { Info } from 'lucide-react';
import { UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from '@/components/ui/alert';

const FORECAST_MODEL_DESCRIPTION =
  'Uses a Compound Annual Growth Rate (CAGR) model fitted to your historical net-worth data. ' +
  'The CAGR is converted into a monthly growth rate and projected 12 months forward. ' +
  'The uncertainty band is based on historical deviations from the CAGR trend, widening over time ' +
  'to reflect increasing uncertainty in longer-term projections.';

export function ForecastChart() {
  const { snapshots } = usePortfolio();
  const { fmt, fmtFull } = useCurrencyFormatter();

  // Show informational message instead of silently returning null
  if (snapshots.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Net Worth Forecast</h3>
            <p className="text-xs text-muted-foreground/70">12-month projection with confidence band</p>
          </div>
        </div>
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">No data available yet. Upload your portfolio to see forecasts.</p>
        </div>
      </div>
    );
  }

  if (snapshots.length < 3) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Net Worth Forecast</h3>
            <p className="text-xs text-muted-foreground/70">12-month projection with confidence band</p>
          </div>
        </div>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Forecast requires at least 3 monthly snapshots to generate a trend. You currently have
            <strong> {snapshots.length}</strong> snapshot{snapshots.length === 1 ? '' : 's'}. Upload more data or
            wait for additional months to be recorded.
          </AlertDescription>
        </Alert>
        <div className="mt-4 flex h-[120px] items-center justify-center rounded-lg border border-dashed">
          <p className="text-xs text-muted-foreground">
            {snapshots.length === 1 ? '1 more snapshot needed' : `${3 - snapshots.length} more snapshots needed`}
          </p>
        </div>
      </div>
    );
  }

  const forecastPoints = generateForecast(snapshots, 12);

  const chartData: { date: string; actual: number | null; forecast: number | null; upper: number | null; lower: number | null }[] = snapshots.map(s => ({
    date: format(s.date, 'MMM yyyy'),
    actual: Math.round(s.total),
    forecast: null,
    upper: null,
    lower: null,
  }));

  if (chartData.length > 0) {
    const last = chartData[chartData.length - 1];
    last.forecast = last.actual;
    last.upper = last.actual;
    last.lower = last.actual;
  }

  forecastPoints.forEach(f => {
    chartData.push({
      date: format(f.date, 'MMM yyyy'),
      actual: null,
      forecast: Math.round(f.forecast),
      upper: Math.round(f.upper),
      lower: Math.round(f.lower),
    });
  });

  const interval = Math.max(1, Math.floor(chartData.length / 6));

  const ForecastTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !Array.isArray(payload) || payload.length === 0) return null;

    const safe = payload.filter((p: any) => p && typeof p.value === 'number');
    if (safe.length === 0) return null;

    const actual = safe.find((p: any) => p.dataKey === 'actual');
    const forecast = safe.find((p: any) => p.dataKey === 'forecast');
    const upper = safe.find((p: any) => p.dataKey === 'upper');
    const lower = safe.find((p: any) => p.dataKey === 'lower');

    return (
      <div style={{ backgroundColor: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <p style={{ color: AXIS_COLOR, fontSize: 12, marginBottom: 4 }}>{label}</p>
        {actual && actual.value != null && <p style={{ color: PRIMARY_COLOR, fontSize: 14, fontWeight: 700 }}>Actual: {fmtFull(actual.value)}</p>}
        {forecast && forecast.value != null && <p style={{ color: POSITIVE_COLOR, fontSize: 14, fontWeight: 700 }}>Forecast: {fmtFull(forecast.value)}</p>}
        {upper && lower && upper.value != null && lower.value != null && (
          <p style={{ color: AXIS_COLOR, fontSize: 11, marginTop: 2 }}>Range: {fmtFull(lower.value)} – {fmtFull(upper.value)}</p>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6" role="img" aria-label="12-month net worth forecast with confidence band based on compound annual growth rate">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Net Worth Forecast</h3>
          <p className="text-xs text-muted-foreground/70">12-month projection with confidence band</p>
        </div>
        <TooltipProvider>
          <UITooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground/50 mt-0.5" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[300px] text-xs leading-relaxed">
              {FORECAST_MODEL_DESCRIPTION}
            </TooltipContent>
          </UITooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-5 rounded" style={{ backgroundColor: PRIMARY_COLOR }} />
          <span className="text-muted-foreground">Actual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-5 rounded" style={{ backgroundColor: POSITIVE_COLOR, opacity: 0.7 }} />
          <span className="text-muted-foreground">Forecast</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-5 rounded" style={{ backgroundColor: POSITIVE_COLOR, opacity: 0.12 }} />
          <span className="text-muted-foreground">Uncertainty band</span>
        </div>
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
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
            <XAxis dataKey="date" stroke={AXIS_COLOR} fontSize={11} interval={interval} tickMargin={8} angle={-40} textAnchor="end" />
            <YAxis stroke={AXIS_COLOR} fontSize={11} tickFormatter={(v) => fmt(v)} width={70} />
            <Tooltip content={<ForecastTooltip />} />
            <Area type="monotone" dataKey="upper" stroke="none" fill={POSITIVE_COLOR} fillOpacity={0.08} dot={false} connectNulls={false} activeDot={false} />
            <Area type="monotone" dataKey="lower" stroke="none" fill="hsl(222, 25%, 10%)" fillOpacity={1} dot={false} connectNulls={false} activeDot={false} />
            <Area type="monotone" dataKey="actual" stroke={PRIMARY_COLOR} fill="url(#actualForecastGradient)" strokeWidth={2} dot={false} connectNulls={false} />
            <Area type="monotone" dataKey="forecast" stroke={POSITIVE_COLOR} fill="url(#forecastGradient)" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
