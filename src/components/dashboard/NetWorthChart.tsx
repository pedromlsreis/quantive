import { useRef, useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';

const HEIGHT = 300;
const MARGIN = { top: 28, right: 16, bottom: 32, left: 64 };

function fmtCompact(v: number, fmt: (n: number) => string): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return fmt(Math.round(v / 100_000) * 100_000).replace(/\.0+$/, '');
  if (abs >= 1_000)     return fmt(Math.round(v / 1_000) * 1_000).replace(/\.0+$/, '');
  return fmt(v);
}

export function NetWorthChart() {
  const { snapshots } = usePortfolio();
  const { fmt, fmtFull } = useCurrencyFormatter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.offsetWidth));
    ro.observe(el);
    setW(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  if (!snapshots.length) return null;

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
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1][0]} ${MARGIN.top + innerH} L ${points[0][0]} ${MARGIN.top + innerH} Z`;

  const athIdx = values.reduce((mx, v, i) => v > values[mx] ? i : mx, 0);
  let bestMoIdx = -1, bestGain = -Infinity;
  for (let i = 1; i < values.length; i++) {
    const g = values[i] - values[i - 1];
    if (g > bestGain) { bestGain = g; bestMoIdx = i; }
  }

  const yTicks = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const v = minV + (maxV - minV) * (i / 4);
    return { v, y: yScale(v) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [minV, maxV, innerH]);

  const xTicks = snapshots
    .map((s, i) => ({ s, i }))
    .filter((_, i) => i % Math.max(1, Math.floor(snapshots.length / 6)) === 0 || i === snapshots.length - 1);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - MARGIN.left;
    const idx = Math.round(x / xStep);
    if (idx >= 0 && idx < snapshots.length) setHover(idx);
  };

  const tooltipX = hover != null ? Math.min(Math.max(0, xScale(hover) - 72), w - 160) : 0;

  return (
    <div className="q-card q-card--p-lg">
      <div className="q-section-head">
        <div>
          <h2>Net worth over time</h2>
          <div className="q-section-sub">All sources · Hover to inspect any month</div>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="q-chart-wrap"
        style={{ userSelect: 'none' }}
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

          {/* Y grid + labels */}
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

          {/* X ticks */}
          {xTicks.map(({ s, i }) => (
            <text
              key={i}
              x={xScale(i)} y={HEIGHT - 8}
              textAnchor="middle" fill="var(--fg-subtle)" fontSize="10"
            >
              {format(s.date, 'MMM yy')}
            </text>
          ))}

          {/* Gradient area */}
          <path d={areaPath} fill="url(#nw-area-grad)" style={{ animation: 'q-path-fade 600ms ease-out' }} />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent-raw)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animation: 'q-path-draw 1200ms cubic-bezier(0.22,1,0.36,1) forwards' }}
            pathLength="1"
          />

          {/* ATH / Best month annotations */}
          {[
            { idx: athIdx,    label: 'ATH',      color: 'var(--accent-raw)' },
            { idx: bestMoIdx, label: 'Best mo.',  color: 'var(--positive)' },
          ].filter(a => a.idx > 0 && a.idx !== athIdx || a.label === 'ATH').map((a) => (
            a.idx < 0 ? null : (
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
            )
          ))}

          {/* Hover crosshair */}
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

        {/* Tooltip */}
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
