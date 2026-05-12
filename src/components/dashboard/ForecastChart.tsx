import { useRef, useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Info } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { generateForecast } from '@/lib/forecast';
import { HelpHint } from '@/components/ui/help-hint';
import { Alert, AlertDescription } from '@/components/ui/alert';

const HEIGHT = 320;
const MARGIN = { top: 32, right: 16, bottom: 32, left: 68 };

const FORECAST_MODEL_DESCRIPTION =
  'Uses a Compound Annual Growth Rate (CAGR) fitted to your historical net-worth data. ' +
  'The CAGR is projected 12 months forward; the uncertainty band widens over time to ' +
  'reflect increasing uncertainty in longer-term projections.';

function fmtCompact(v: number, fmt: (n: number) => string): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return fmt(Math.round(v / 100_000) * 100_000);
  if (abs >= 1_000)     return fmt(Math.round(v / 1_000) * 1_000);
  return fmt(v);
}

export function ForecastChart() {
  const { snapshots } = usePortfolio();
  const { fmt, fmtFull } = useCurrencyFormatter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.offsetWidth));
    ro.observe(el);
    setW(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  if (!snapshots.length) {
    return (
      <div className="q-card q-card--p-lg">
        <div className="q-section-head"><h2>Net Worth Forecast</h2></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, border: '1px dashed var(--border-raw)', borderRadius: 'var(--r-3)' }}>
          <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}>No data yet — upload your portfolio to see forecasts.</p>
        </div>
      </div>
    );
  }

  if (snapshots.length < 3) {
    return (
      <div className="q-card q-card--p-lg">
        <div className="q-section-head">
          <div>
            <h2>Net Worth Forecast</h2>
            <div className="q-section-sub">12-month projection with confidence band</div>
          </div>
        </div>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Forecast requires at least 3 monthly snapshots. You currently have <strong>{snapshots.length}</strong>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const history = snapshots;
  const forecastPoints = generateForecast(snapshots, 12);

  // Build combined date domain
  const allDates = [
    ...history.map(s => s.date.getTime()),
    ...forecastPoints.map(f => f.date.getTime()),
  ];
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const innerW = Math.max(100, w - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const dateScale = (d: Date) => MARGIN.left + ((d.getTime() - minDate) / (maxDate - minDate)) * innerW;

  const allValues = [
    ...history.map(s => s.total),
    ...forecastPoints.map(f => f.upper),
    ...forecastPoints.map(f => f.lower),
  ];
  const minV = Math.min(...allValues) * 0.95;
  const maxV = Math.max(...allValues) * 1.05;
  const yScale = (v: number) => MARGIN.top + innerH - ((v - minV) / (maxV - minV)) * innerH;

  const histPath = history.map((s, i) =>
    `${i === 0 ? 'M' : 'L'} ${dateScale(s.date).toFixed(1)} ${yScale(s.total).toFixed(1)}`
  ).join(' ');

  const joinX = dateScale(history[history.length - 1].date);
  const joinY = yScale(history[history.length - 1].total);

  const medianPath = forecastPoints.length
    ? `M ${joinX.toFixed(1)} ${joinY.toFixed(1)} ` +
      forecastPoints.map(f => `L ${dateScale(f.date).toFixed(1)} ${yScale(f.forecast).toFixed(1)}`).join(' ')
    : '';

  const coneOuterPath = forecastPoints.length
    ? `M ${joinX.toFixed(1)} ${joinY.toFixed(1)} ` +
      forecastPoints.map(f => `L ${dateScale(f.date).toFixed(1)} ${yScale(f.upper).toFixed(1)}`).join(' ') +
      ` L ${dateScale(forecastPoints[forecastPoints.length - 1].date)} ${yScale(forecastPoints[forecastPoints.length - 1].lower)}` +
      forecastPoints.slice().reverse().map(f => ` L ${dateScale(f.date).toFixed(1)} ${yScale(f.lower).toFixed(1)}`).join('') +
      ' Z'
    : '';

  const yTicks = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const v = minV + (maxV - minV) * (i / 4);
    return { v, y: yScale(v) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [minV, maxV, innerH]);

  // X-axis labels: ~5–6 total
  const allPoints = [...history, ...forecastPoints.map(f => ({ date: f.date, total: f.forecast }))];
  const xStep = Math.max(1, Math.floor(allPoints.length / 6));
  const xTicks = allPoints.filter((_, i) => i % xStep === 0 || i === allPoints.length - 1);

  return (
    <div className="q-card q-card--p-lg">
      <div className="q-section-head">
        <div>
          <h2>Net Worth Forecast</h2>
          <div className="q-section-sub">12-month projection with confidence band</div>
        </div>
        <HelpHint side="right" maxWidthClass="max-w-[300px]" content={FORECAST_MODEL_DESCRIPTION}>
          <button
            type="button"
            aria-label="About this forecast model"
            className="q-icon-btn"
            style={{ width: 24, height: 24 }}
          >
            <Info size={14} />
          </button>
        </HelpHint>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 20, height: 2, background: 'var(--accent-raw)', borderRadius: 1, display: 'inline-block' }} />
          Actual
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 20, height: 2, background: 'var(--accent-raw)', opacity: 0.6, borderRadius: 1, display: 'inline-block', borderTop: '2px dashed var(--accent-raw)' }} />
          Forecast
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 20, height: 8, background: 'var(--accent-soft-raw)', borderRadius: 2, display: 'inline-block' }} />
          Confidence band
        </span>
      </div>

      <div ref={wrapRef} className="q-chart-wrap">
        <svg width={w} height={HEIGHT} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="fc-hist-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stopColor="var(--accent-raw)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--accent-raw)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y grid */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={MARGIN.left} x2={MARGIN.left + innerW}
                y1={t.y} y2={t.y}
                stroke="var(--border-soft-raw)" strokeDasharray="2 4" strokeWidth="1"
              />
              <text
                x={MARGIN.left - 10} y={t.y + 3}
                textAnchor="end" fill="var(--fg-subtle)" fontSize="10"
                style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}
              >
                {fmtCompact(t.v, fmt)}
              </text>
            </g>
          ))}

          {/* X ticks */}
          {xTicks.map((pt, i) => (
            <text key={i} x={dateScale(pt.date)} y={HEIGHT - 8}
              textAnchor="middle" fill="var(--fg-subtle)" fontSize="10"
            >
              {format(pt.date, 'MMM yy')}
            </text>
          ))}

          {/* Today divider */}
          <line x1={joinX} x2={joinX} y1={MARGIN.top} y2={MARGIN.top + innerH}
            stroke="var(--border-strong-raw)" strokeDasharray="3 3" strokeWidth="1" />
          <rect x={joinX - 26} y={MARGIN.top - 18} width={52} height={16} rx={3}
            fill="var(--surface)" stroke="var(--border-raw)" />
          <text x={joinX} y={MARGIN.top - 7} textAnchor="middle"
            fill="var(--fg-subtle)" fontSize="10" letterSpacing="0.04em">TODAY</text>

          {/* Confidence cone */}
          {coneOuterPath && (
            <path d={coneOuterPath} fill="var(--accent-soft-raw)" opacity="0.5" />
          )}

          {/* History area */}
          <path
            d={`${histPath} L ${joinX} ${MARGIN.top + innerH} L ${MARGIN.left} ${MARGIN.top + innerH} Z`}
            fill="url(#fc-hist-area)"
          />

          {/* History line */}
          <path d={histPath} fill="none" stroke="var(--accent-raw)"
            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />

          {/* Median forecast dashed */}
          {medianPath && (
            <path d={medianPath} fill="none" stroke="var(--accent-raw)"
              strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" />
          )}
        </svg>
      </div>

      {/* Summary metrics */}
      {forecastPoints.length > 0 && (
        <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-raw)' }}>
          {[
            { label: 'Median (12 mo.)', value: forecastPoints[forecastPoints.length - 1].forecast, color: 'var(--accent-raw)' },
            { label: 'Optimistic (upper)', value: forecastPoints[forecastPoints.length - 1].upper, color: 'var(--positive)' },
            { label: 'Conservative (lower)', value: forecastPoints[forecastPoints.length - 1].lower, color: 'var(--fg-muted)' },
          ].map(m => (
            <div key={m.label}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 500, color: m.color, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                {fmtFull(m.value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
