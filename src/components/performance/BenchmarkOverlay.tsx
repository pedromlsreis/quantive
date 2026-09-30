import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useBenchmarks } from '@/hooks/useBenchmarks';
import { QTabs } from '@/components/ui/q-tabs';
import { useEntitlements } from '@/hooks/useEntitlements';
import { analytics } from '@/lib/analytics';
import { openComposer } from '@/lib/appEvents';
import { axisMonth, formatDate } from '@/lib/formatters';
import { niceTicks } from '@/lib/dashboardData';
import {
  type BenchmarkPeriod,
  type SeriesId,
  rebaseToHundred,
  intersectByDate,
  periodCutoff,
  filterByPeriod,
  isStale,
  lastDate,
  DEFAULT_STALE_THRESHOLDS,
} from '@/lib/benchmarkSeries';

const SERIES_OPTIONS: { value: SeriesId; label: string }[] = [
  { value: 'sp500',        label: 'S&P 500' },
  { value: 'inflation_eu', label: 'EU inflation' },
];

const PERIOD_OPTIONS: { value: BenchmarkPeriod; label: string }[] = [
  { value: '6m',  label: '6m' },
  { value: '1y',  label: '1y' },
  { value: '3y',  label: '3y' },
];

const SERIES_SHORT: Record<SeriesId, string> = {
  inflation_eu: 'EU inflation',
  sp500: 'S&P 500',
};

/** An index value (100 = the start of the range) to one decimal, or a dash when a series has no point that month. */
function indexText(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '—';
}

// Full names where there is room: legend, tooltip, notes.
const SERIES_LABEL: Record<SeriesId, string> = {
  inflation_eu: 'EU inflation (HICP)',
  sp500:        'S&P 500 (price, USD)',
};

// Solid lines; your line is the emerald one and the heaviest.
const SERIES_COLOR: Record<SeriesId, string> = {
  sp500:        'var(--series-2)',
  inflation_eu: 'var(--fg-muted)',
};

const AXIS_TICK = { fill: 'var(--fg-subtle)', fontSize: 11 };

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Free-tier preview: clamp the user series to the most recent 12 months only.
 * Pro users see the full intersected horizon.
 */
function clampLast12Months(points: { date: string; value: number }[]): { date: string; value: number }[] {
  if (points.length === 0) return [];
  const last = points[points.length - 1].date;
  const cutoff = new Date(`${last}T00:00:00Z`);
  cutoff.setMonth(cutoff.getMonth() - 12);
  const iso = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= iso);
}

function serialiseActive(active: ReadonlySet<SeriesId>): string {
  if (active.size === 0) return 'off';
  return [...active].sort().join('+');
}

/**
 * Your net worth against EU inflation and the S&P 500, each indexed to 100 at
 * the start of the range. Free plans compare the last 12 months; the page's
 * one Pro gate sits under the month table.
 */
export function BenchmarkOverlay() {
  const { allSnapshots } = usePortfolio();
  const { series, ready, error } = useBenchmarks();
  const { has } = useEntitlements();
  const isPro = has('benchmarks');

  const [active, setActive] = useState<Set<SeriesId>>(() => new Set<SeriesId>(['inflation_eu']));
  // Free draws 12 months, so it starts on 1y and never offers 3y. Derived,
  // because entitlements can resolve after the first render.
  const [periodChoice, setPeriod] = useState<BenchmarkPeriod | null>(null);
  const period: BenchmarkPeriod = !isPro && periodChoice === '3y' ? '1y' : periodChoice ?? (isPro ? '3y' : '1y');
  const periodOptions = isPro ? PERIOD_OPTIONS : PERIOD_OPTIONS.filter((o) => o.value !== '3y');
  const [showTable, setShowTable] = useState(false);

  const activeList = useMemo(() => [...active] as SeriesId[], [active]);

  const userPoints = useMemo(
    () => allSnapshots.map((s) => ({
      // Anchor to UTC midnight ISO for clean string comparison.
      date: s.date.toISOString().slice(0, 10),
      value: s.total,
    })),
    [allSnapshots],
  );

  const now = useMemo(() => new Date(), []);
  const cutoff = useMemo(() => periodCutoff(period, now), [period, now]);

  // Apply period filter first, then free-tier preview clamp.
  const userInPeriod = useMemo(() => filterByPeriod(userPoints, cutoff), [userPoints, cutoff]);
  const userVisible = useMemo(
    () => (isPro ? userInPeriod : clampLast12Months(userInPeriod)),
    [userInPeriod, isPro],
  );

  // For the benchmark overlay we sample each chosen series at the user's
  // visible snapshot dates, then rebase each series to 100 at its own first
  // intersected date. When the user has no data we still mount the chart and
  // render the active benchmark series alone on a union of their dates so
  // the reference line isn't a dead surface — a centred CTA overlays the
  // empty portfolio line.
  const chartData = useMemo(() => {
    if (userVisible.length === 0) {
      if (activeList.length === 0) return [] as Array<Record<string, number | string>>;

      const rebasedBySeries: Partial<Record<SeriesId, { date: string; rebased: number; raw: number }[]>> = {};
      for (const s of activeList) {
        const inPeriod = filterByPeriod(series[s].points, cutoff);
        if (inPeriod.length > 0) rebasedBySeries[s] = rebaseToHundred(inPeriod);
      }

      const allDates = new Set<string>();
      for (const s of activeList) {
        const arr = rebasedBySeries[s];
        if (arr) for (const p of arr) allDates.add(p.date);
      }
      const sortedDates = [...allDates].sort();

      const byDate: Partial<Record<SeriesId, Map<string, { rebased: number; raw: number }>>> = {};
      for (const s of activeList) {
        const arr = rebasedBySeries[s];
        if (arr) byDate[s] = new Map(arr.map((p) => [p.date, { rebased: p.rebased, raw: p.raw }]));
      }

      return sortedDates.map((date) => {
        const row: Record<string, number | string> = { date };
        for (const s of activeList) {
          const v = byDate[s]?.get(date);
          if (v) {
            row[`benchmark_${s}`] = Number(v.rebased.toFixed(2));
            row[`benchmark_${s}_raw`] = v.raw;
          }
        }
        return row;
      });
    }

    const userRebased = rebaseToHundred(
      userVisible.map((s) => ({ date: s.date, value: s.value })),
    );

    const benchByDateBySeries: Partial<Record<SeriesId, Map<string, { rebased: number; raw: number }>>> = {};
    for (const s of activeList) {
      const intersected = intersectByDate(series[s], userVisible.map((u) => u.date));
      if (intersected.length > 0) {
        const rebased = rebaseToHundred(intersected);
        benchByDateBySeries[s] = new Map(rebased.map((b) => [b.date, { rebased: b.rebased, raw: b.raw }]));
      }
    }

    return userRebased.map((u) => {
      const row: Record<string, number | string> = {
        date: u.date,
        portfolio: Number(u.rebased.toFixed(2)),
        portfolio_raw: u.raw,
      };
      for (const s of activeList) {
        const b = benchByDateBySeries[s]?.get(u.date);
        if (b) {
          row[`benchmark_${s}`] = Number(b.rebased.toFixed(2));
          row[`benchmark_${s}_raw`] = b.raw;
        }
      }
      return row;
    });
  }, [userVisible, activeList, series, cutoff]);

  const hasUserData = userVisible.length > 0;

  const periodStartDate = chartData[0]?.date as string | undefined;

  // At most six month ticks; the index scale gets round 1/2/5 steps like
  // every other chart.
  const xTicks = useMemo(() => {
    const dates = chartData.map((d) => String(d.date));
    const step = Math.max(1, Math.ceil(dates.length / 6));
    return dates.filter((_, i) => i % step === 0);
  }, [chartData]);
  const yScale = useMemo(() => {
    // Only the plotted, rebased series: rows also carry raw values for the tooltip.
    const keys = ['portfolio', ...activeList.map((s) => `benchmark_${s}`)];
    const vals = chartData.flatMap((d) => keys.map((k) => d[k]).filter((v): v is number => typeof v === 'number'));
    return vals.length ? niceTicks(Math.min(...vals), Math.max(...vals), 5) : null;
  }, [chartData, activeList]);

  const staleSeries = useMemo(
    () => activeList.filter((s) => isStale(series[s], now, DEFAULT_STALE_THRESHOLDS)),
    [activeList, series, now],
  );

  const toggleSeries = (s: SeriesId) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      analytics.benchmarkOverlayToggled({ series: serialiseActive(next), period });
      return next;
    });
  };

  const clearActive = () => {
    if (active.size === 0) return;
    setActive(new Set());
    analytics.benchmarkOverlayToggled({ series: 'off', period });
  };

  const onPeriodChange = (v: BenchmarkPeriod) => {
    setPeriod(v);
    analytics.benchmarkOverlayToggled({ series: serialiseActive(active), period: v });
  };

  if (!ready) {
    return (
      <section className="q-sec" aria-labelledby="bench-title">
        <div className="q-sec-head"><h2 className="q-h2" id="bench-title">Benchmark comparison</h2></div>
        <p className="q-body" role="status">Loading benchmark data…</p>
      </section>
    );
  }

  type TooltipPayload = { value: number; dataKey: string; payload: Record<string, number | string> };
  const ChartTooltip = ({ active: tooltipActive, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) => {
    if (!tooltipActive || !payload || payload.length === 0) return null;
    const row = (name: string, key: string, color: string) => {
      const v = payload.find((p) => p.dataKey === key)?.value;
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span aria-hidden="true" style={{ width: 10, height: 2, background: color }} />
          <span className="num" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)', minWidth: '5ch' }}>
            {typeof v === 'number' ? v.toFixed(1) : '—'}
          </span>
          <span style={{ color: 'var(--fg-muted)' }}>{name}</span>
        </div>
      );
    };
    return (
      <div style={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 'var(--r-mark)', padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ color: 'var(--fg-subtle)' }}>{label ? formatDate(isoToDate(String(label))) : ''}</div>
        {hasUserData && row('Your net worth', 'portfolio', 'var(--accent-raw)')}
        {activeList.map((s) => row(SERIES_LABEL[s], `benchmark_${s}`, SERIES_COLOR[s]))}
      </div>
    );
  };

  const summary = (() => {
    const parts = ['Your net worth indexed to 100'];
    if (activeList.length > 0) parts.push(`compared with ${activeList.map((s) => SERIES_LABEL[s]).join(' and ')}`);
    if (periodStartDate) parts.push(`from ${formatDate(isoToDate(periodStartDate))}`);
    return `${parts.join(', ')}.`;
  })();

  return (
    <section className="q-sec" aria-labelledby="bench-title">
      <div className="q-chart-head">
        <div>
          <h2 className="q-h2" id="bench-title">Benchmark comparison</h2>
          <div className="q-sec-sub">
            {periodStartDate
              ? `All lines start at 100 on ${formatDate(isoToDate(periodStartDate))}. Your line also moves with money you added or withdrew.`
              : 'All lines start at 100 at the start of the range. Your line also moves with money you added or withdrew.'}
          </div>
        </div>
        <div className="q-tab-groups">
          <div className="q-tabs q-tabs--sm" role="group" aria-label="Benchmark overlay">
            {SERIES_OPTIONS.map((o) => (
              <button key={o.value} type="button" aria-pressed={active.has(o.value)} className="q-tab" onClick={() => toggleSeries(o.value)}>
                {o.label}
              </button>
            ))}
            <button type="button" aria-pressed={active.size === 0} className="q-tab" onClick={clearActive}>Off</button>
          </div>
          <QTabs<BenchmarkPeriod> value={period} onChange={onPeriodChange} options={periodOptions} size="sm" ariaLabel="Period" />
        </div>
      </div>

      {staleSeries.length > 0 && (
        <p role="status" className="q-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 var(--s-3)' }}>
          <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--warning)', flexShrink: 0 }} />
          {staleSeries.length === 1
            ? `${SERIES_LABEL[staleSeries[0]]} hasn't refreshed since ${formatDate(isoToDate(lastDate(series[staleSeries[0]]) ?? ''))}. Values may be slightly behind.`
            : "Some benchmark series haven't refreshed recently. Values may be slightly behind."}
        </p>
      )}

      <ul className="q-legend" aria-hidden="true">
        {hasUserData && <li><span className="q-legend-key" style={{ background: 'var(--accent-raw)' }} />Your net worth</li>}
        {activeList.map((s) => (
          <li key={s}><span className="q-legend-key" style={{ background: SERIES_COLOR[s] }} />{SERIES_LABEL[s]}</li>
        ))}
      </ul>

      {showTable ? (
        <div className="q-table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="q-table">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                {hasUserData && <th scope="col" className="num">Your net worth</th>}
                {activeList.map((sid) => <th key={sid} scope="col" className="num">{SERIES_SHORT[sid]}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...chartData].reverse().map((d) => (
                <tr key={String(d.date)}>
                  <td><time dateTime={String(d.date)}>{formatDate(isoToDate(String(d.date)))}</time></td>
                  {hasUserData && <td className="num">{indexText(d.portfolio)}</td>}
                  {activeList.map((sid) => <td key={sid} className="num">{indexText(d[`benchmark_${sid}`])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
      <div style={{ width: '100%', height: 300, position: 'relative' }} role="img" aria-label={summary}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border-soft-raw)" vertical={false} />
            <XAxis
              dataKey="date"
              ticks={xTicks}
              interval={0}
              tickFormatter={(v, i) => {
                // The year appears on the first tick and wherever it changes.
                const d = isoToDate(String(v));
                const prev = i > 0 ? isoToDate(xTicks[i - 1]) : null;
                return axisMonth(d, !prev || prev.getFullYear() !== d.getFullYear());
              }}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ ...AXIS_TICK, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              domain={yScale ? [yScale.lo, yScale.hi] : ['auto', 'auto']}
              ticks={yScale?.ticks}
              tickFormatter={(v) => String(Math.round(Number(v)))}
              width={36}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border-strong-raw)', strokeWidth: 1 }} />
            <Line type="linear" dataKey="portfolio" stroke="var(--accent-raw)" strokeWidth={2} dot={false} isAnimationActive={false} />
            {activeList.map((s) => (
              <Line key={s} type="linear" dataKey={`benchmark_${s}`} stroke={SERIES_COLOR[s]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>

        {!hasUserData && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <div style={{ background: 'var(--bg-elev-1)', border: '1px solid var(--border-raw)', borderRadius: 'var(--r-panel)', padding: 'var(--s-4) var(--s-5)', maxWidth: 360 }}>
              <p className="q-body" style={{ margin: 0 }}>Your line appears once you have entries in this range.</p>
              <button type="button" className="q-btn q-btn--secondary q-btn--md" style={{ marginTop: 'var(--s-3)' }} onClick={openComposer}>
                Add entry
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      <div className="q-chart-foot">
        <span>
          {activeList.length === 0
            ? 'Turn on EU inflation or the S&P 500 above to compare.'
            : (() => {
                const parts = activeList
                  .map((s) => {
                    const d = lastDate(series[s]);
                    return d ? `${SERIES_LABEL[s]} ${formatDate(isoToDate(d))}` : null;
                  })
                  .filter((x): x is string => x !== null);
                return parts.length > 0 ? `Last updated: ${parts.join(', ')}.` : 'Waiting for the first benchmark update.';
              })()}
        </span>
        {chartData.length > 0 && (
          <button type="button" className="q-link-btn" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)} style={{ fontSize: 12, marginLeft: 'auto' }}>
            {showTable ? 'Show chart' : 'Show table'}
          </button>
        )}
      </div>

      {error && <p className="q-sec-foot">{"Couldn't reach the benchmark feed. Try again later."}</p>}
    </section>
  );
}
