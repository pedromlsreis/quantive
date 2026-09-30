import { useEffect, useRef, useState } from 'react';
import { useFormat } from '@/hooks/useFormat';
import { useIsMobile } from '@/hooks/use-mobile';
import { axisMonth, formatDate, roundSig3 } from '@/lib/formatters';
import { niceTicks } from '@/lib/dashboardData';
import type { ForecastPoint } from '@/lib/forecast';
import type { Snapshot } from '@/lib/types';

// Left: y ticks. Right: direct labels at the end of the range.
const MARGIN = { top: 12, right: 112, bottom: 24, left: 56 };

/**
 * History as a solid line, the projection as a dashed one, and a shaded range
 * that widens with time. The range's end is labelled directly instead of
 * through a legend; "Today" is a plain rule.
 */
export function ForecastChart({ history, points }: { history: Snapshot[]; points: ForecastPoint[] }) {
  const f = useFormat();
  const isMobile = useIsMobile();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const height = isMobile ? 240 : 320;
  const margin = isMobile ? { ...MARGIN, right: 96, left: 48 } : MARGIN;
  const innerW = Math.max(120, w - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const t0 = history[0].date.getTime();
  const t1 = points[points.length - 1].date.getTime();
  const x = (d: Date) => margin.left + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * innerW;
  const all = [...history.map((s) => s.total), ...points.map((p) => p.upper), ...points.map((p) => p.lower)];
  const { ticks, lo, hi } = niceTicks(Math.min(...all), Math.max(...all), isMobile ? 4 : 5);
  const y = (v: number) => margin.top + innerH - ((v - lo) / Math.max(1, hi - lo)) * innerH;

  const lastHist = history[history.length - 1];
  const todayX = x(lastHist.date);
  const line = (pts: [number, number][]) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
  const histPath = line(history.map((s) => [x(s.date), y(s.total)]));
  const projPath = line([[todayX, y(lastHist.total)], ...points.map((p) => [x(p.date), y(p.forecast)] as [number, number])]);
  const band =
    line([[todayX, y(lastHist.total)], ...points.map((p) => [x(p.date), y(p.upper)] as [number, number])]) +
    points.slice().reverse().map((p) => `L${x(p.date).toFixed(1)} ${y(p.lower).toFixed(1)}`).join('') +
    'Z';

  const end = points[points.length - 1];
  const endX = x(end.date);
  // Direct labels, pushed at least 16px apart; a short leader joins each to its line.
  const labels = [
    { key: 'Upper', v: end.upper },
    { key: 'Central', v: end.forecast },
    { key: 'Lower', v: end.lower },
  ].map((l) => ({ ...l, y: y(l.v), ly: y(l.v) }));
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].ly - labels[i - 1].ly < 16) labels[i].ly = labels[i - 1].ly + 16;
  }

  const months = (end.date.getFullYear() - history[0].date.getFullYear()) * 12 + end.date.getMonth() - history[0].date.getMonth();
  const step = [3, 6, 12, 24].find((s) => months / s <= (isMobile ? 3 : 6)) ?? 24;
  const xTicks: Date[] = [];
  for (let d = new Date(history[0].date.getFullYear(), history[0].date.getMonth() + 1, 1); d <= end.date; d.setMonth(d.getMonth() + 1)) {
    const onStep = step <= 12 ? d.getMonth() % step === 0 : d.getMonth() === 0 && d.getFullYear() % 2 === 0;
    if (onStep) xTicks.push(new Date(d));
  }

  const summary = `Net worth from ${formatDate(history[0].date)} with a projection to ${formatDate(end.date)}: central ${f.money(roundSig3(end.forecast))}, range ${f.money(roundSig3(end.lower))} to ${f.money(roundSig3(end.upper))}.`;

  return (
    <div ref={wrapRef} className="q-chart-plot">
      <svg width={w} height={height} role="img" aria-label={summary}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={margin.left} x2={margin.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--border-soft-raw)" strokeWidth={1} />
            <text className="num" x={margin.left - 8} y={y(t) + 4} textAnchor="end" fill="var(--fg-subtle)" fontSize={11} style={{ fontFamily: 'var(--font-mono)' }}>
              {f.money(t, { compact: true })}
            </text>
          </g>
        ))}
        {xTicks.map((d, i) => (
          <text key={d.getTime()} x={x(d)} y={height - 6} textAnchor="middle" fill="var(--fg-subtle)" fontSize={11}>
            {axisMonth(d, d.getMonth() === 0 || i === 0)}
          </text>
        ))}
        <path d={band} fill="var(--accent-raw)" fillOpacity={0.1} />
        <line x1={todayX} x2={todayX} y1={margin.top} y2={margin.top + innerH} stroke="var(--border-strong-raw)" strokeWidth={1} />
        <text x={todayX + 6} y={margin.top + 10} fill="var(--fg-subtle)" fontSize={11}>Today</text>
        <path d={histPath} fill="none" stroke="var(--accent-raw)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={projPath} fill="none" stroke="var(--accent-raw)" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
        <circle cx={todayX} cy={y(lastHist.total)} r={4.5} fill="var(--accent-raw)" stroke="var(--bg)" strokeWidth={3} />
        {labels.map((l) => (
          <g key={l.key}>
            <line x1={endX + 2} x2={endX + 10} y1={l.y} y2={l.ly} stroke="var(--border-strong-raw)" strokeWidth={1} />
            <text x={endX + 14} y={l.ly + 4} fontSize={11} fill="var(--fg-muted)">
              {l.key} <tspan className="num" fill="var(--fg)" style={{ fontFamily: 'var(--font-mono)' }}>{f.money(l.v, { compact: true })}</tspan>
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
