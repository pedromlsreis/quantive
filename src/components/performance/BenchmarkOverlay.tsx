import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { AlertTriangle } from 'lucide-react';
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

type OverlayChoice = 'off' | SeriesId;

const OVERLAY_OPTIONS: { value: OverlayChoice; label: string }[] = [
  { value: 'sp500',        label: 'S&P 500' },
  { value: 'inflation_eu', label: 'Inflation' },
  { value: 'off',          label: 'Off' },
];

const PERIOD_OPTIONS: { value: BenchmarkPeriod; label: string }[] = [
  { value: '6m',  label: '6m' },
  { value: '1y',  label: '1y' },
  { value: '3y',  label: '3y' },
];

const SERIES_LABEL: Record<SeriesId, string> = {
  inflation_eu: 'Inflation (HICP, euro area)',
  sp500:        'S&P 500',
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

function BenchmarkOverlayInner() {
  const { allSnapshots } = usePortfolio();
  const { series, ready, error } = useBenchmarks();
  const { has } = useEntitlements();
  const isPro = has('benchmarks');

  const [overlay, setOverlay] = useState<OverlayChoice>('sp500');
  const [period, setPeriod] = useState<BenchmarkPeriod>('3y');

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

  // For the benchmark overlay we sample the chosen series at the user's
  // visible snapshot dates, then rebase both series to 100 at the period
  // start.
  const chartData = useMemo(() => {
    if (userVisible.length === 0) return [] as Array<Record<string, number | string>>;

    const userRebased = rebaseToHundred(
      userVisible.map((s) => ({ date: s.date, value: s.value })),
    );

    let benchRebased: { date: string; raw: number; rebased: number }[] = [];
    if (overlay !== 'off') {
      const intersected = intersectByDate(
        series[overlay],
        userVisible.map((s) => s.date),
      );
      if (intersected.length > 0) {
        benchRebased = rebaseToHundred(intersected);
      }
    }

    const benchByDate = new Map(benchRebased.map((b) => [b.date, b]));

    return userRebased.map((u) => {
      const b = benchByDate.get(u.date);
      const row: Record<string, number | string> = {
        date: u.date,
        portfolio: Number(u.rebased.toFixed(2)),
        portfolio_raw: u.raw,
      };
      if (b) {
        row.benchmark = Number(b.rebased.toFixed(2));
        row.benchmark_raw = b.raw;
      }
      return row;
    });
  }, [userVisible, overlay, series]);

  const periodStartDate = chartData[0]?.date as string | undefined;

  const overlayLatest = overlay !== 'off' ? lastDate(series[overlay]) : null;
  const overlayStale = overlay !== 'off'
    ? isStale(series[overlay], now, DEFAULT_STALE_THRESHOLDS)
    : false;

  const onOverlayChange = (v: OverlayChoice) => {
    setOverlay(v);
    analytics.benchmarkOverlayToggled({ series: v, period });
  };

  const onPeriodChange = (v: BenchmarkPeriod) => {
    setPeriod(v);
    analytics.benchmarkOverlayToggled({ series: overlay, period: v });
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

  if (allSnapshots.length === 0) {
    return (
      <div className="q-card q-card--p-lg">
        <div className="q-section-head"><h2>Benchmark comparison</h2></div>
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-raw)', borderRadius: 'var(--r-3)' }}>
          <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)', margin: 0 }}>
            No snapshots yet — add measurements to compare against benchmarks.
          </p>
        </div>
      </div>
    );
  }

  type TooltipPayload = { value: number; dataKey: string; color: string; payload: Record<string, number | string> };
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) => {
    if (!active || !payload || payload.length === 0) return null;
    const portfolio = payload.find((p) => p.dataKey === 'portfolio')?.value;
    const benchmark = payload.find((p) => p.dataKey === 'benchmark')?.value;

    return (
      <div style={{ backgroundColor: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 8, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxWidth: 280 }}>
        <p style={{ color: AXIS_COLOR, fontSize: 11, margin: '0 0 6px' }}>{label ? formatDateLong(String(label)) : ''}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#e8ecf0' }}>
          <span>Your portfolio</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{typeof portfolio === 'number' ? portfolio.toFixed(1) : '—'}</span>
        </div>
        {overlay !== 'off' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#e8ecf0', marginTop: 2 }}>
            <span>{SERIES_LABEL[overlay]}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{typeof benchmark === 'number' ? benchmark.toFixed(1) : '—'}</span>
          </div>
        )}
        {periodStartDate && (
          <p style={{ fontSize: 10, color: AXIS_COLOR, margin: '8px 0 0', lineHeight: 1.4 }}>
            Both lines start at 100 on {formatDateLong(periodStartDate)}. A reading of 108 vs 112 means the other line returned 4 percentage points more over this period (12% vs 8%).
          </p>
        )}
        {overlay === 'sp500' && (
          <p style={{ fontSize: 10, color: AXIS_COLOR, margin: '6px 0 0', lineHeight: 1.4 }}>
            USD-denominated index; the gap reflects currency drift if your base is not USD.
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
          <div className="q-section-sub">Both lines start at 100 at the period start — read the gap in percentage points.</div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <QTabs<OverlayChoice>
            value={overlay}
            onChange={onOverlayChange}
            options={OVERLAY_OPTIONS}
            size="sm"
            ariaLabel="Benchmark overlay"
          />
          <QTabs<BenchmarkPeriod>
            value={period}
            onChange={onPeriodChange}
            options={PERIOD_OPTIONS}
            size="sm"
            ariaLabel="Period"
          />
        </div>
      </div>

      {overlayStale && overlayLatest && (
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
            Benchmark data hasn&rsquo;t refreshed since {formatDateLong(overlayLatest)} — values may be slightly behind.
          </span>
        </div>
      )}

      <div style={{ width: '100%', height: 340 }} role="img" aria-label="Benchmark overlay chart">
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
                if (value === 'benchmark' && overlay !== 'off') return SERIES_LABEL[overlay];
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
            {overlay !== 'off' && (
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="var(--series-5, hsl(50 70% 60%))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 'var(--s-3)', fontSize: 11, color: 'var(--fg-faint)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>
          {overlay === 'off'
            ? 'Toggle Inflation or S&P 500 above to overlay a reference series.'
            : (overlayLatest
                ? <>Last updated {formatDateLong(overlayLatest)}</>
                : 'Awaiting first ingest')}
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
