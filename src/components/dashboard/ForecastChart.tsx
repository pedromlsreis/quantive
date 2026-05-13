import { useRef, useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Info } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { generateScenarioForecast } from '@/lib/scenarioForecast';
import { HelpHint } from '@/components/ui/help-hint';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QTabs } from '@/components/ui/q-tabs';

const HEIGHT = 360;
const MARGIN = { top: 32, right: 16, bottom: 32, left: 68 };

export type ForecastScenario = 'conservative' | 'base' | 'optimistic';
export type ForecastHorizon = '1' | '3' | '5';

const SCENARIO_OPTIONS: { value: ForecastScenario; label: string }[] = [
  { value: 'conservative', label: '5%'   },
  { value: 'base',         label: '7.2%' },
  { value: 'optimistic',   label: '10%'  },
];

const HORIZON_OPTIONS: { value: ForecastHorizon; label: string }[] = [
  { value: '1', label: '1y' },
  { value: '3', label: '3y' },
  { value: '5', label: '5y' },
];

const SCENARIO_CAGR: Record<ForecastScenario, number> = {
  conservative: 0.05,
  base:         0.072,
  optimistic:   0.10,
};

const FORECAST_MODEL_DESCRIPTION =
  'Projects net worth at a chosen annualised CAGR (5% / 7.2% / 10%) starting from the latest ' +
  'snapshot. The confidence cone widens with √t based on historical residual variance — ' +
  'longer horizons are inherently less certain.';

interface ForecastChartProps {
  scenario?: ForecastScenario;
  horizon?: ForecastHorizon;
  onScenarioChange?: (s: ForecastScenario) => void;
  onHorizonChange?: (h: ForecastHorizon) => void;
}

function fmtCompact(v: number, fmt: (n: number) => string): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return fmt(Math.round(v / 100_000) * 100_000);
  if (abs >= 1_000)     return fmt(Math.round(v / 1_000) * 1_000);
  return fmt(v);
}

export function ForecastChart({
  scenario: scenarioProp,
  horizon: horizonProp,
  onScenarioChange,
  onHorizonChange,
}: ForecastChartProps = {}) {
  const { snapshots } = usePortfolio();
  const { fmt } = useCurrencyFormatter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);

  // Allow controlled OR uncontrolled use.
  const [scenarioState, setScenarioState] = useState<ForecastScenario>('base');
  const [horizonState, setHorizonState] = useState<ForecastHorizon>('3');
  const scenario = scenarioProp ?? scenarioState;
  const horizon = horizonProp ?? horizonState;
  const setScenario = (s: ForecastScenario) =>
    onScenarioChange ? onScenarioChange(s) : setScenarioState(s);
  const setHorizon = (h: ForecastHorizon) =>
    onHorizonChange ? onHorizonChange(h) : setHorizonState(h);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.offsetWidth));
    ro.observe(el);
    setW(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const months = Number(horizon) * 12;
  const forecastPoints = useMemo(
    () => generateScenarioForecast(snapshots, months, SCENARIO_CAGR[scenario]),
    [snapshots, months, scenario],
  );

  if (!snapshots.length) {
    return (
      <div className="q-card q-card--p-lg">
        <div className="q-section-head"><h2>Trajectory</h2></div>
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
            <h2>Trajectory</h2>
            <div className="q-section-sub">History (solid) and projection (dashed) with confidence bands</div>
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
  const allDates = [...history.map(s => s.date.getTime()), ...forecastPoints.map(f => f.date.getTime())];
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
    `${i === 0 ? 'M' : 'L'} ${dateScale(s.date).toFixed(1)} ${yScale(s.total).toFixed(1)}`,
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

  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (maxV - minV) * (i / 4);
    return { v, y: yScale(v) };
  });

  const allPoints = [...history, ...forecastPoints.map(f => ({ date: f.date, total: f.forecast }))];
  const xStep = Math.max(1, Math.floor(allPoints.length / 6));
  const xTicks = allPoints.filter((_, i) => i % xStep === 0 || i === allPoints.length - 1);

  return (
    <div className="q-card q-card--p-lg">
      <div className="q-section-head">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Trajectory
            <HelpHint side="right" maxWidthClass="max-w-[300px]" content={FORECAST_MODEL_DESCRIPTION}>
              <button type="button" aria-label="About this forecast model" className="q-icon-btn" style={{ width: 20, height: 20 }}>
                <Info size={12} />
              </button>
            </HelpHint>
          </h2>
          <div className="q-section-sub">History (solid) and projection (dashed) with confidence bands</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <QTabs<ForecastScenario>
            value={scenario}
            onChange={setScenario}
            options={SCENARIO_OPTIONS}
            size="sm"
            ariaLabel="Scenario CAGR"
          />
          <QTabs<ForecastHorizon>
            value={horizon}
            onChange={setHorizon}
            options={HORIZON_OPTIONS}
            size="sm"
            ariaLabel="Forecast horizon"
          />
        </div>
      </div>

      <div ref={wrapRef} className="q-chart-wrap">
        <svg width={w} height={HEIGHT} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="fc-hist-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stopColor="var(--accent-raw)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--accent-raw)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={t.y} y2={t.y}
                stroke="var(--border-soft-raw)" strokeDasharray="2 4" strokeWidth="1" />
              <text x={MARGIN.left - 10} y={t.y + 3} textAnchor="end" fill="var(--fg-subtle)" fontSize="10"
                style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>
                {fmtCompact(t.v, fmt)}
              </text>
            </g>
          ))}

          {xTicks.map((pt, i) => (
            <text key={i} x={dateScale(pt.date)} y={HEIGHT - 8}
              textAnchor="middle" fill="var(--fg-subtle)" fontSize="10">
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

          {coneOuterPath && <path d={coneOuterPath} fill="var(--accent-soft-raw)" opacity="0.5" />}

          <path
            d={`${histPath} L ${joinX} ${MARGIN.top + innerH} L ${MARGIN.left} ${MARGIN.top + innerH} Z`}
            fill="url(#fc-hist-area)"
          />
          <path d={histPath} fill="none" stroke="var(--accent-raw)"
            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />

          {medianPath && (
            <path d={medianPath} fill="none" stroke="var(--accent-raw)"
              strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" />
          )}
        </svg>
      </div>
    </div>
  );
}
