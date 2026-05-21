import { useRef, useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useHistoryFloor } from '@/hooks/useHistoryFloor';
import { useIsMobile } from '@/hooks/use-mobile';
import { analytics } from '@/lib/analytics';
import { QTabs } from '@/components/ui/q-tabs';

const HEIGHT = 300;
const MARGIN = { top: 28, right: 16, bottom: 32, left: 64 };

type Period = '3m' | '6m' | '12m' | '24m' | 'all';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '3m',  label: '3m'  },
  { value: '6m',  label: '6m'  },
  { value: '12m', label: '12m' },
  { value: '24m', label: '24m' },
  { value: 'all', label: 'All' },
];

function fmtCompact(v: number, fmt: (n: number) => string): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return fmt(Math.round(v / 100_000) * 100_000).replace(/\.0+$/, '');
  if (abs >= 1_000)     return fmt(Math.round(v / 1_000) * 1_000).replace(/\.0+$/, '');
  return fmt(v);
}

export function NetWorthChart() {
  const { allSnapshots } = usePortfolio();
  const { fmt, fmtFull } = useCurrencyFormatter();
  const historyFloor = useHistoryFloor();
  const isMobile = useIsMobile();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);
  const [hover, setHover] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>('12m');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.offsetWidth));
    ro.observe(el);
    setW(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const snapshots = useMemo(() => {
    // Drop snapshots with non-finite totals (e.g. non-EUR sources while
    // fx_rates are still loading). NaNs propagate into the SVG scales and
    // produce "Expected length, NaN" console warnings otherwise.
    const finite = allSnapshots.filter(s => Number.isFinite(s.total));
    if (period === 'all') return finite;
    const months = period === '3m' ? 3 : period === '6m' ? 6 : period === '12m' ? 12 : 24;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return finite.filter(s => s.date >= cutoff);
  }, [allSnapshots, period]);

  if (!allSnapshots.length) return null;

  // Gate on the *filtered* count too: with non-EUR sources mid-FX-load the
  // filter above can drop everything, and the rest of the function assumes
  // a non-empty `snapshots` (Math.min(...[]) → Infinity → NaN coordinates).
  if (snapshots.length < 2) {
    return (
      <div className="q-card q-card--p-lg">
        <div className="q-section-head">
          <h2>Net worth over time</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, border: '1px dashed var(--border-raw)', borderRadius: 'var(--r-3)' }}>
          <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}>
            Add a measurement on another day to see your trend.
          </p>
        </div>
      </div>
    );
  }

  const values = snapshots.map(s => s.total);
  const minV = Math.min(...values) * 0.94;
  const maxV = Math.max(...values) * 1.04;
  const innerW = Math.max(100, w - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xStep = innerW / (snapshots.length - 1 || 1);
  const xScale = (i: number) => MARGIN.left + i * xStep;
  const yScale = (v: number) => MARGIN.top + innerH - ((v - minV) / (maxV - minV)) * innerH;

  const points = snapshots.map((s, i) => [xScale(i), yScale(s.total)] as [number, number]);

  // Split into ghost (older than floor) and visible (>= floor) ranges.
  // We render the ghost segment as a low-opacity preview and keep all
  // chart affordances (hover, markers, area fill) on the visible segment.
  const firstVisible = historyFloor
    ? snapshots.findIndex((s) => s.date >= historyFloor)
    : 0;
  const visibleStartIdx = firstVisible === -1 ? snapshots.length : firstVisible;
  const hasGhost = visibleStartIdx > 0;
  const hasVisible = visibleStartIdx < snapshots.length;

  const buildPath = (start: number, end: number) =>
    points
      .slice(start, end + 1)
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(' ');

  // Overlap by one point so the visual handoff between ghost and visible is seamless.
  const ghostPath = hasGhost
    ? buildPath(0, Math.min(visibleStartIdx, snapshots.length - 1))
    : '';
  const visibleLinePath = hasVisible ? buildPath(visibleStartIdx, snapshots.length - 1) : '';
  const visiblePoints = hasVisible ? points.slice(visibleStartIdx) : [];
  const areaPath = visiblePoints.length > 1
    ? `${visibleLinePath} L ${visiblePoints[visiblePoints.length - 1][0]} ${MARGIN.top + innerH} L ${visiblePoints[0][0]} ${MARGIN.top + innerH} Z`
    : '';

  // Markers and hover ignore the ghost range entirely.
  let athIdx = visibleStartIdx;
  if (hasVisible) {
    for (let i = visibleStartIdx; i < values.length; i++) {
      if (values[i] > values[athIdx]) athIdx = i;
    }
  }
  let bestMoIdx = -1, bestGain = -Infinity;
  for (let i = Math.max(visibleStartIdx, 1); i < values.length; i++) {
    const g = values[i] - values[i - 1];
    if (g > bestGain) { bestGain = g; bestMoIdx = i; }
  }

  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (maxV - minV) * (i / 4);
    return { v, y: yScale(v) };
  });

  const targetTicks = isMobile ? 4 : 6;
  const xTicks = snapshots
    .map((s, i) => ({ s, i }))
    .filter((_, i) => i % Math.max(1, Math.floor(snapshots.length / targetTicks)) === 0 || i === snapshots.length - 1);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - MARGIN.left;
    const idx = Math.round(x / xStep);
    if (idx >= visibleStartIdx && idx < snapshots.length) setHover(idx);
    else setHover(null);
  };

  const tooltipX = hover != null ? Math.min(Math.max(0, xScale(hover) - 72), w - 160) : 0;

  return (
    <div className="q-card q-card--p-lg">
      <div className="q-section-head">
        <div>
          <h2>Net worth over time</h2>
          <div className="q-section-sub">
            All sources · Hover to inspect any month
            {hasGhost && (
              <>
                {' · '}
                <Link
                  to="/pricing"
                  onClick={() => analytics.proGateHit({ feature: 'history.full' })}
                  style={{ color: 'var(--accent-raw)', textDecoration: 'none' }}
                >
                  Full history with Pro →
                </Link>
              </>
            )}
          </div>
        </div>
        <QTabs<Period>
          value={period}
          onChange={setPeriod}
          options={PERIOD_OPTIONS}
          size="sm"
          ariaLabel="Time period"
        />
      </div>

      <div
        ref={wrapRef}
        className="q-chart-wrap"
        style={{ userSelect: 'none' }}
        role="img"
        aria-label="Net worth over time chart"
      >
        <svg
          width={w}
          height={HEIGHT}
          style={{ display: 'block', overflow: 'visible' }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="nw-area-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stopColor="var(--accent-raw)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent-raw)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={MARGIN.left} x2={MARGIN.left + innerW}
                y1={t.y} y2={t.y}
                stroke="var(--border-soft-raw)" strokeDasharray="2 4" strokeWidth="1"
              />
              <text
                x={MARGIN.left - 10} y={t.y + 3}
                textAnchor="end" fill="var(--fg-subtle)"
                fontSize="10"
                style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}
              >
                {fmtCompact(t.v, fmt)}
              </text>
            </g>
          ))}

          {xTicks.map(({ s, i }) => (
            <text
              key={i}
              x={xScale(i)} y={HEIGHT - 8}
              textAnchor="middle" fill="var(--fg-subtle)" fontSize="10"
            >
              {format(s.date, 'MMM yy')}
            </text>
          ))}

          <path d={areaPath} fill="url(#nw-area-grad)" style={{ animation: 'q-path-fade 600ms ease-out' }} />

          {hasGhost && (
            <>
              <path
                d={ghostPath}
                fill="none"
                stroke="var(--fg-subtle)"
                strokeOpacity="0.4"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1={xScale(visibleStartIdx)} x2={xScale(visibleStartIdx)}
                y1={MARGIN.top} y2={MARGIN.top + innerH}
                stroke="var(--border-raw)"
                strokeDasharray="2 3"
                strokeWidth="1"
              />
            </>
          )}

          <path
            d={visibleLinePath}
            fill="none"
            stroke="var(--accent-raw)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animation: 'q-path-draw 1200ms cubic-bezier(0.22,1,0.36,1) forwards' }}
            pathLength="1"
          />

          {[
            { idx: athIdx,    label: 'ATH',      color: 'var(--accent-raw)' },
            { idx: bestMoIdx, label: 'Best mo.', color: 'var(--positive)' },
          ]
            .filter(a => hasVisible && a.idx >= visibleStartIdx && a.idx < snapshots.length && (a.label !== 'Best mo.' || a.idx !== athIdx))
            .map((a) => (
              <g key={a.label}>
                <circle cx={xScale(a.idx)} cy={yScale(values[a.idx])} r="4"
                  fill="var(--bg)" stroke={a.color} strokeWidth="1.5" />
                <line
                  x1={xScale(a.idx)} x2={xScale(a.idx)}
                  y1={yScale(values[a.idx]) - 6} y2={yScale(values[a.idx]) - 18}
                  stroke={a.color} strokeWidth="1" />
                <text
                  x={xScale(a.idx)} y={yScale(values[a.idx]) - 22}
                  textAnchor="middle" fontSize="10" fontWeight="500" fill={a.color}
                >
                  {a.label}
                </text>
              </g>
            ))}

          {hover != null && (
            <g>
              <line
                x1={xScale(hover)} x2={xScale(hover)}
                y1={MARGIN.top} y2={MARGIN.top + innerH}
                stroke="var(--fg-subtle)" strokeDasharray="2 3" strokeWidth="1"
              />
              <circle
                cx={xScale(hover)} cy={yScale(values[hover])} r="5"
                fill="var(--bg)" stroke="var(--accent-raw)" strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {hover != null && (
          <div style={{
            position: 'absolute',
            left: tooltipX,
            top: MARGIN.top - 4,
            background: 'var(--tooltip-bg)',
            border: '1px solid var(--tooltip-border)',
            borderRadius: 'var(--r-2)',
            padding: '8px 12px',
            color: 'var(--tooltip-fg, var(--fg))',
            fontSize: 12,
            minWidth: 140,
            pointerEvents: 'none',
            boxShadow: 'var(--shadow-md)',
            transform: 'translateY(-100%)',
            zIndex: 5,
          }}>
            <div style={{ color: 'var(--fg-subtle)', fontSize: 10, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {format(snapshots[hover].date, 'MMMM yyyy')}
            </div>
            <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 14, color: 'var(--fg)' }}>
              {fmtFull(snapshots[hover].total)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
