import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useFormat } from '@/hooks/useFormat';
import { useHistoryFloor } from '@/hooks/useHistoryFloor';
import { useIsMobile } from '@/hooks/use-mobile';
import { QTabs } from '@/components/ui/q-tabs';
import { ProGate } from '@/components/billing/UpsellCard';
import { axisMonth, formatDate, monthYear } from '@/lib/formatters';
import { niceTicks } from '@/lib/dashboardData';
import type { Snapshot } from '@/lib/types';

type Period = '3m' | '6m' | '12m' | '24m' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: '3m', label: '3m' },
  { value: '6m', label: '6m' },
  { value: '12m', label: '12m' },
  { value: '24m', label: '24m' },
  { value: 'all', label: 'All' },
];

// Plot plus the 24px x-axis band; y labels sit in a right-hand column.
const MARGIN = { top: 10, right: 60, bottom: 24, left: 0 };

/**
 * Net worth over the chosen range: a 2px line through every entry, round
 * ticks, and a readout above the plot instead of a floating tooltip. Pointer,
 * touch-scrub and keyboard (a slider over the plot) all move the same
 * readout; "Show table" gives the same numbers as rows.
 */
export function NetWorthChart() {
  const { allSnapshots } = usePortfolio();
  const f = useFormat();
  const floor = useHistoryFloor();
  const isMobile = useIsMobile();
  const plotRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [period, setPeriod] = useState<Period>('12m');
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [showTable]);

  const finite = useMemo(() => allSnapshots.filter((s) => Number.isFinite(s.total)), [allSnapshots]);
  // Free plans chart the rolling last 12 months; older entries stay saved.
  const allowed = useMemo(() => (floor ? finite.filter((s) => s.date >= floor) : finite), [finite, floor]);
  const hiddenMonths = useMemo(() => {
    if (!floor) return 0;
    return new Set(finite.filter((s) => s.date < floor).map((s) => `${s.date.getFullYear()}-${s.date.getMonth()}`)).size;
  }, [finite, floor]);

  const snaps = useMemo(() => {
    if (period === 'all' || !allowed.length) return allowed;
    const months = { '3m': 3, '6m': 6, '12m': 12, '24m': 24 }[period];
    const cutoff = new Date(allowed[allowed.length - 1].date);
    cutoff.setMonth(cutoff.getMonth() - months);
    return allowed.filter((s) => s.date >= cutoff);
  }, [allowed, period]);

  // A range change or new data invalidates the highlighted entry.
  useEffect(() => setActive(null), [snaps]);

  if (!allowed.length) return null;

  const gate = hiddenMonths > 0 ? (
    <ProGate
      feature="history.full"
      variant="row"
      title={`${hiddenMonths} earlier ${hiddenMonths === 1 ? 'month is' : 'months are'} saved`}
      body="The free plan charts your last 12 months. Pro shows every entry since you started."
    />
  ) : null;

  if (snaps.length < 2) {
    return (
      <section className="q-sec" aria-labelledby="nw-chart-title">
        <div className="q-sec-head"><h2 className="q-h2" id="nw-chart-title">Net worth over time</h2></div>
        <p className="q-body">Your history line starts with your second entry. Next month, your values will be pre-filled.</p>
        {gate}
      </section>
    );
  }

  const height = isMobile ? 220 : 280;
  const innerW = Math.max(120, w - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const t0 = snaps[0].date.getTime();
  const t1 = snaps[snaps.length - 1].date.getTime();
  const x = (d: Date) => MARGIN.left + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * innerW;
  const values = snaps.map((s) => s.total);
  const { ticks, lo, hi } = niceTicks(Math.min(...values), Math.max(...values), isMobile ? 4 : 5);
  const y = (v: number) => MARGIN.top + innerH - ((v - lo) / Math.max(1, hi - lo)) * innerH;
  const pts = snaps.map((s) => [x(s.date), y(s.total)] as const);
  const path = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');

  const monthTicks = xMonthTicks(snaps[0].date, snaps[snaps.length - 1].date, isMobile ? 3 : 6);

  let hiIdx = 0;
  let loIdx = 0;
  values.forEach((v, i) => {
    if (v > values[hiIdx]) hiIdx = i;
    if (v < values[loIdx]) loIdx = i;
  });

  const pointText = (i: number) => {
    const s = snaps[i];
    const prev = i > 0 ? snaps[i - 1] : null;
    const change = prev ? `, ${f.money(s.total - prev.total, { signed: true })} since the previous entry` : '';
    return `${f.money(s.total)} on ${formatDate(s.date)}${change}`;
  };
  // Amounts carry .num so privacy mode blurs them like every other figure.
  const rangeText = (
    <>
      {`${snaps.length} entries. Highest `}<span className="num">{f.money(values[hiIdx])}</span>
      {` on ${formatDate(snaps[hiIdx].date)}, lowest `}<span className="num">{f.money(values[loIdx])}</span>
      {` on ${formatDate(snaps[loIdx].date)}.`}
    </>
  );
  const summary = `Net worth, ${monthYear(snaps[0].date)} to ${monthYear(snaps[snaps.length - 1].date)}: ${f.money(values[0])} to ${f.money(values[values.length - 1])}.`;

  const nearest = (clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = clientX - rect.left;
    let best = 0;
    pts.forEach(([ptx], i) => { if (Math.abs(ptx - px) < Math.abs(pts[best][0] - px)) best = i; });
    return best;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const i = nearest(e.clientX);
    if (i != null) setActive(i);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = snaps.length - 1;
    const cur = active ?? last;
    const next =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? cur - 1
      : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? cur + 1
      : e.key === 'PageDown' ? cur - 12
      : e.key === 'PageUp' ? cur + 12
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (e.key === 'Escape') { setActive(null); return; }
    if (next == null) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(last, next));
    setActive(i);
  };

  const activePoint = active != null ? snaps[active] : null;

  return (
    <section className="q-sec" aria-labelledby="nw-chart-title">
      <div className="q-chart-head">
        <h2 className="q-h2" id="nw-chart-title">Net worth over time</h2>
        <QTabs<Period> value={period} onChange={setPeriod} options={PERIODS} size="sm" ariaLabel="Time period" />
      </div>

      <div className="q-chart-readout" aria-hidden="true">
        {activePoint ? (
          <ReadoutPoint snaps={snaps} i={active!} f={f} />
        ) : (
          <span>{rangeText}</span>
        )}
      </div>

      {showTable ? (
        <table className="q-table" style={{ marginBottom: 'var(--s-2)' }}>
          <caption className="sr-only">Net worth by entry, newest first</caption>
          <thead>
            <tr><th scope="col">Date</th><th scope="col" className="num">Net worth</th><th scope="col" className="num">Change</th></tr>
          </thead>
          <tbody>
            {[...snaps].reverse().map((s, ri) => {
              const i = snaps.length - 1 - ri;
              const change = i > 0 ? s.total - snaps[i - 1].total : null;
              return (
                <tr key={s.date.getTime()}>
                  <td><time dateTime={s.date.toISOString().slice(0, 10)}>{formatDate(s.date)}</time></td>
                  <td className="num">{f.money(s.total)}</td>
                  <td className={`num q-tone-${change == null ? 'zero' : f.tone(change)}`}>{change == null ? '—' : f.money(change, { signed: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div ref={plotRef} className="q-chart-plot">
          <svg width={w} height={height} role="img" aria-label={summary}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--border-soft-raw)" strokeWidth={1} />
                <text className="num" x={MARGIN.left + innerW + 10} y={y(t) + 4} fill="var(--fg-subtle)" fontSize={11} style={{ fontFamily: 'var(--font-mono)' }}>
                  {f.money(t, { compact: true })}
                </text>
              </g>
            ))}
            {monthTicks.map((d, i) => (
              <text key={d.getTime()} x={x(d)} y={height - 6} fill="var(--fg-subtle)" fontSize={11} textAnchor={i === 0 ? 'start' : 'middle'}>
                {axisMonth(d, d.getMonth() === 0 || i === 0)}
              </text>
            ))}
            <path d={path} fill="none" stroke="var(--accent-raw)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {snaps.length <= 24 && pts.slice(0, -1).map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r={3} fill="var(--accent-raw)" stroke="var(--bg)" strokeWidth={2} />
            ))}
            <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4.5} fill="var(--accent-raw)" stroke="var(--bg)" strokeWidth={3} />
            {active != null && (
              <g>
                <line x1={pts[active][0]} x2={pts[active][0]} y1={MARGIN.top} y2={MARGIN.top + innerH} stroke="var(--border-strong-raw)" strokeWidth={1} />
                <circle cx={pts[active][0]} cy={pts[active][1]} r={4.5} fill="var(--accent-raw)" stroke="var(--bg)" strokeWidth={2} />
              </g>
            )}
          </svg>
          <div
            className="q-chart-scrub"
            role="slider"
            tabIndex={0}
            aria-label="Net worth by entry"
            aria-valuemin={0}
            aria-valuemax={snaps.length - 1}
            aria-valuenow={active ?? snaps.length - 1}
            aria-valuetext={pointText(active ?? snaps.length - 1)}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerMove}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null); }}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
          />
        </div>
      )}

      <div className="q-chart-foot">
        <button type="button" className="q-link-btn" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)} style={{ fontSize: 12, marginLeft: 'auto' }}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {gate}
    </section>
  );
}

function ReadoutPoint({ snaps, i, f }: { snaps: Snapshot[]; i: number; f: ReturnType<typeof useFormat> }) {
  const s = snaps[i];
  const change = i > 0 ? s.total - snaps[i - 1].total : null;
  return (
    <span>
      <span className="q-chart-readout-val num">{f.money(s.total)}</span>
      {' on '}{formatDate(s.date)}
      {change != null && (
        <>
          {', '}
          <span className={`num q-tone-${f.tone(change)}`}>{f.money(change, { signed: true })}</span>
          {' since the previous entry'}
        </>
      )}
    </span>
  );
}

/** First-of-month dates between `from` and `to`, spaced to about `target` labels. */
function xMonthTicks(from: Date, to: Date, target: number): Date[] {
  const span = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  const step = Math.max(1, [1, 2, 3, 6, 12, 24].find((s) => span / s <= target) ?? 24);
  const out: Date[] = [];
  const d = new Date(from.getFullYear(), from.getMonth() + (from.getDate() > 1 ? 1 : 0), 1);
  // Align to multiples of the step so labels land on Jan/Apr/Jul/Oct etc.
  while (d.getMonth() % step !== 0 && step <= 12) d.setMonth(d.getMonth() + 1);
  for (; d <= to; d.setMonth(d.getMonth() + step)) out.push(new Date(d));
  return out;
}
