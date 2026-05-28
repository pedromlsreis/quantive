import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { AlertTriangle, Plus } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useBenchmarks } from '@/hooks/useBenchmarks';
import { QTabs } from '@/components/ui/q-tabs';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { UpsellCard } from '@/components/billing/UpsellCard';
import { useEntitlements } from '@/hooks/useEntitlements';
import { fadeIn } from '@/lib/motion';
import { analytics } from '@/lib/analytics';
import { GRID_COLOR, AXIS_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from '@/lib/chartColors';
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
  { value: 'inflation_eu', label: 'Inflation EU' },
];

const PERIOD_OPTIONS: { value: BenchmarkPeriod; label: string }[] = [
  { value: '6m',  label: '6m' },
  { value: '1y',  label: '1y' },
  { value: '3y',  label: '3y' },
];

const SERIES_LABEL: Record<SeriesId, string> = {
  inflation_eu: 'Inflation EU (HICP)',
  sp500:        'S&P 500',
};

const SERIES_COLOR: Record<SeriesId, string> = {
  sp500:        'var(--series-5, hsl(50 70% 60%))',
  inflation_eu: 'var(--series-4, hsl(280 60% 65%))',
};

// Distinct dash patterns so the two reference lines stay distinguishable
// without relying on colour alone (WCAG: don't convey info by colour only).
const SERIES_DASH: Record<SeriesId, string> = {
  sp500:        '6 4',
  inflation_eu: '2 4',
};

function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
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

function BenchmarkOverlayInner() {
  const { allSnapshots } = usePortfolio();
  const { series, ready, error } = useBenchmarks();
  const { has } = useEntitlements();
  const isPro = has('benchmarks');

  const [active, setActive] = useState<Set<SeriesId>>(() => new Set<SeriesId>(['sp500']));
  const [period, setPeriod] = useState<BenchmarkPeriod>('3y');

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
      <div className="q-card q-card--p-lg">
        <div className="q-section-head"><h2>Benchmark comparison</h2></div>
        <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-subtle)', fontSize: 13 }}>
          Loading benchmark data…
        </div>
      </div>
    );
  }

  type TooltipPayload = { value: number; dataKey: string; color: string; payload: Record<string, number | string> };
  const CustomTooltip = ({ active: tooltipActive, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) => {
    if (!tooltipActive || !payload || payload.length === 0) return null;
    const portfolio = payload.find((p) => p.dataKey === 'portfolio')?.value;

    return (
      <div style={{ backgroundColor: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxWidth: 280 }}>
        <p style={{ color: AXIS_COLOR, fontSize: 11, margin: '0 0 6px' }}>{label ? formatDateLong(String(label)) : ''}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#e8ecf0' }}>
          <span>Your portfolio</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{typeof portfolio === 'number' ? portfolio.toFixed(1) : '—'}</span>
        </div>
        {activeList.map((s) => {
          const v = payload.find((p) => p.dataKey === `benchmark_${s}`)?.value;
          return (
            <div key={s} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#e8ecf0', marginTop: 2 }}>
              <span>{SERIES_LABEL[s]}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{typeof v === 'number' ? v.toFixed(1) : '—'}</span>
            </div>
          );
        })}
        {periodStartDate && (
          <p style={{ fontSize: 10, color: AXIS_COLOR, margin: '8px 0 0', lineHeight: 1.4 }}>
            All lines start at 100 on {formatDateLong(periodStartDate)}. A reading of 108 vs 112 means the other line returned 4 percentage points more over this period (12% vs 8%).
          </p>
        )}
        {active.has('sp500') && (
          <p style={{ fontSize: 10, color: AXIS_COLOR, margin: '6px 0 0', lineHeight: 1.4 }}>
            S&amp;P 500 is USD-denominated; its gap reflects currency drift if your base is not USD.
          </p>
        )}
      </div>
    );
  };

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="q-card q-card--p-lg"
    >
      <div className="q-section-head">
        <div>
          <h2>Benchmark comparison</h2>
          <div className="q-section-sub">All lines start at 100 at the period start — read the gap in percentage points.</div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <div
            className="q-tabs q-tabs--sm q-tabs--multi"
            role="group"
            aria-label="Benchmark overlay"
          >
            {SERIES_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={active.has(o.value)}
                data-tab={o.value}
                className="q-tab"
                onClick={() => toggleSeries(o.value)}
              >
                {o.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={active.size === 0}
              data-tab="off"
              className="q-tab"
              onClick={clearActive}
            >
              Off
            </button>
          </div>
          <QTabs<BenchmarkPeriod>
            value={period}
            onChange={onPeriodChange}
            options={PERIOD_OPTIONS}
            size="sm"
            ariaLabel="Period"
          />
        </div>
      </div>

      {staleSeries.length > 0 && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 12px',
            background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
            borderRadius: 'var(--r-2)',
            color: 'var(--fg)',
            fontSize: 12,
            marginBottom: 'var(--s-4)',
          }}
        >
          <AlertTriangle size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <span>
            {staleSeries.length === 1
              ? <>{SERIES_LABEL[staleSeries[0]]} hasn&rsquo;t refreshed since {formatDateLong(lastDate(series[staleSeries[0]]) ?? '')} — values may be slightly behind.</>
              : <>Some benchmark series haven&rsquo;t refreshed recently — values may be slightly behind.</>}
          </span>
        </div>
      )}

      <div
        style={{ width: '100%', height: 340, position: 'relative' }}
        role="img"
        aria-label={(() => {
          const parts = ['Line chart, your portfolio rebased to 100'];
          if (activeList.length > 0) {
            parts.push(`compared against ${activeList.map((s) => SERIES_LABEL[s]).join(' and ')}`);
          }
          parts.push(`over the last ${period}`);
          if (periodStartDate) parts.push(`starting ${formatDateLong(periodStartDate)}`);
          return `${parts.join(', ')}.`;
        })()}
      >
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => formatDateShort(String(v))}
              tick={{ fill: AXIS_COLOR, fontSize: 11 }}
              stroke={AXIS_COLOR}
              minTickGap={32}
            />
            <YAxis
              tick={{ fill: AXIS_COLOR, fontSize: 11 }}
              stroke={AXIS_COLOR}
              domain={['auto', 'auto']}
              tickFormatter={(v) => String(Math.round(Number(v)))}
              width={42}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="plainline"
              wrapperStyle={{ fontSize: 12, color: AXIS_COLOR }}
              formatter={(value: string) => {
                if (value === 'portfolio') return 'Your portfolio';
                if (value.startsWith('benchmark_')) {
                  const id = value.slice('benchmark_'.length) as SeriesId;
                  return SERIES_LABEL[id] ?? value;
                }
                return value;
              }}
            />
            <Line
              type="monotone"
              dataKey="portfolio"
              stroke="var(--accent-raw, hsl(220 90% 60%))"
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
            />
            {activeList.map((s) => (
              <Line
                key={s}
                type="monotone"
                dataKey={`benchmark_${s}`}
                stroke={SERIES_COLOR[s]}
                strokeWidth={1.5}
                strokeDasharray={SERIES_DASH[s]}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        {!hasUserData && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
            aria-live="polite"
          >
            <div
              style={{
                pointerEvents: 'auto',
                background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
                border: '1px solid var(--border-raw)',
                borderRadius: 'var(--r-3)',
                padding: 'var(--s-4) var(--s-5)',
                maxWidth: 360,
                textAlign: 'center',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                Your portfolio line isn&rsquo;t showing yet — add a few measurements to compare against the reference series.
              </p>
              <Link
                to="/dashboard"
                className="q-btn q-btn--primary q-btn--md"
                style={{ marginTop: 'var(--s-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} aria-hidden="true" />
                Add measurement
              </Link>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 'var(--s-3)', fontSize: 11, color: 'var(--fg-faint)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>
          {activeList.length === 0
            ? 'Toggle Inflation EU or S&P 500 above to overlay a reference series.'
            : (() => {
                const parts = activeList
                  .map((s) => {
                    const d = lastDate(series[s]);
                    return d ? `${SERIES_LABEL[s]} ${formatDateLong(d)}` : null;
                  })
                  .filter((x): x is string => x !== null);
                return parts.length > 0 ? <>Last updated · {parts.join(' · ')}</> : 'Awaiting first ingest';
              })()}
        </span>
        {!isPro && (
          <span>Showing the last 12 months. Upgrade to Pro for the full horizon.</span>
        )}
      </div>

      {!isPro && (
        <div style={{ marginTop: 'var(--s-4)' }}>
          <UpsellCard feature="benchmarks" compact />
        </div>
      )}

      {error && (
        <p style={{ marginTop: 'var(--s-3)', fontSize: 11, color: 'var(--fg-faint)' }}>
          Couldn&rsquo;t reach the benchmark feed — please try again later.
        </p>
      )}
    </motion.div>
  );
}

/**
 * BenchmarkOverlay — public entry. Free users see a 12-month preview with an
 * inline UpsellCard; Pro users get the full horizon. We do NOT wrap the whole
 * component in `<FeatureGate feature="benchmarks">` because the plan calls for
 * a visible 12-month preview rather than a hidden gate.
 *
 * The `FeatureGate` is still imported above so that callers can opt-in to a
 * stricter "no preview" mode by passing `strictGate`. Left unused in v1 but
 * keeps the contract explicit if Agent C / D need it.
 */
export function BenchmarkOverlay({ strictGate = false }: { strictGate?: boolean } = {}) {
  if (strictGate) {
    return (
      <FeatureGate feature="benchmarks">
        <BenchmarkOverlayInner />
      </FeatureGate>
    );
  }
  return <BenchmarkOverlayInner />;
}
