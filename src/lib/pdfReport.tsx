/**
 * @module pdfReport
 *
 * Pure document tree + thin export wrapper for the one-page wealth report.
 * Mirrors the buildX/exportX shape in `exporter.ts` so it stays testable.
 *
 * The trajectory chart is rasterised to PNG outside of this module and passed
 * in as a data URL — see `components/export/PdfReportButton.tsx` for the
 * Recharts→canvas→PNG pipeline. We do not import Recharts here because
 * `@react-pdf/renderer` does not understand Recharts' SVG tree.
 *
 * IMPORTANT: this module is heavy (~1MB gz including the renderer). Import it
 * dynamically — see `PdfReportButton`.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Svg,
  Circle,
  Line,
  pdf,
} from '@react-pdf/renderer';
import type { Snapshot } from './types';
import { generateScenarioForecast } from './scenarioForecast';

export type ReportPeriod = 'this_year' | 'last_year' | 'all_time' | 'custom';

export interface ReportInput {
  /** User's display name from profile, or null for "Your portfolio". */
  userName: string | null;
  /** Date the report was generated. */
  generatedAt: Date;
  /** Period label rendered in the header (e.g. "1 Jan 2026 – 19 May 2026"). */
  periodLabel: string;
  /** Period identifier for analytics + filename. */
  period: ReportPeriod;
  /** Base currency code (e.g. "EUR"). */
  baseCurrency: string;
  /** Filtered snapshots inside the chosen period (ascending by date). */
  snapshotsInPeriod: Snapshot[];
  /** Full snapshot history — used for the conditional forecast & CAGR. */
  allSnapshots: Snapshot[];
  /** Top-N sources at period end, descending by value. */
  topSources: Array<{ name: string; value: number; percentOfTotal: number }>;
  /** Volatility split (0..100) for the allocation bar. */
  volatilitySplit: { volatile: number; nonVolatile: number };
  /** Liquidity split (0..100) for the allocation bar. */
  liquiditySplit: { liquid: number; illiquid: number };
  /** Pre-rasterised PNG of the trajectory chart, as a data URL. May be null. */
  trajectoryPng: string | null;
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 10,
    marginBottom: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brand: {
    fontFamily: 'Courier-Bold',
    fontSize: 16,
    letterSpacing: -0.4,
    color: '#111827',
  },
  meta: {
    textAlign: 'right',
    fontSize: 9,
    color: '#4b5563',
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 9,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  headlineValue: {
    fontSize: 24,
    fontWeight: 700,
    color: '#111827',
  },
  headlineSub: {
    fontSize: 10,
    color: '#374151',
    marginTop: 2,
  },
  splitLabel: {
    fontSize: 9,
    color: '#4b5563',
    marginBottom: 2,
  },
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
    marginBottom: 6,
  },
  barFill: {
    height: 10,
  },
  splitLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 9,
    color: '#374151',
    marginBottom: 8,
  },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 10,
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  sourceName: { flex: 1 },
  sourceValue: { textAlign: 'right', width: 90 },
  sourcePct: { textAlign: 'right', width: 50, color: '#4b5563' },
  trajectoryImg: {
    width: '100%',
    height: 180,
    objectFit: 'contain',
  },
  forecastBox: {
    backgroundColor: '#f9fafb',
    borderLeftWidth: 3,
    borderLeftColor: '#2563eb',
    padding: 8,
    fontSize: 10,
    color: '#1f2937',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: '#6b7280',
    textAlign: 'center',
  },
});

/**
 * Full-precision currency formatter for the PDF. Unlike the in-app shorthand
 * (€1.5k / €1.50M) this renders exact figures — a wealth report ends up in
 * front of advisors and tax accountants, who want the literal values.
 *
 * Locale 'en-GB' matches the codebase's British-English microcopy and gives a
 * predictable thousands separator regardless of the user's browser locale,
 * which matters because the document is generated client-side but consumed
 * downstream as a static PDF.
 */
function formatCurrencyBase(value: number, currency: string): string {
  if (!Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
    }).format(value);
  } catch {
    // Unknown ISO code (e.g. test fixture with "XXX") — fall back to a
    // currency-code prefix rather than throwing.
    return `${currency} ${value.toFixed(2)}`;
  }
}

function periodChangeLine(
  snapshots: Snapshot[],
): { abs: number; pct: number | null } | null {
  if (snapshots.length < 2) return null;
  const first = snapshots[0].total;
  const last = snapshots[snapshots.length - 1].total;
  const abs = last - first;
  const pct = first !== 0 ? (abs / first) * 100 : null;
  return { abs, pct };
}

/**
 * Compute trailing 3-year CAGR using the user's own snapshot history.
 * Returns null when fewer than 24 months of history exist — the trigger for
 * omitting the forecast section entirely.
 */
export function trailingCagrFromSnapshots(snapshots: Snapshot[]): number | null {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const months =
    (last.date.getFullYear() - first.date.getFullYear()) * 12 +
    (last.date.getMonth() - first.date.getMonth());
  if (months < 24) return null;
  // Use the last 3 years if we have them, otherwise the full window.
  const cutoff = new Date(last.date);
  cutoff.setFullYear(cutoff.getFullYear() - 3);
  const window = sorted.filter((s) => s.date.getTime() >= cutoff.getTime());
  const w0 = window[0] ?? first;
  const w1 = window[window.length - 1] ?? last;
  const yrs =
    ((w1.date.getFullYear() - w0.date.getFullYear()) * 12 +
      (w1.date.getMonth() - w0.date.getMonth())) /
    12;
  if (yrs <= 0 || w0.total <= 0 || w1.total <= 0) return null;
  return Math.pow(w1.total / w0.total, 1 / yrs) - 1;
}

/**
 * Brand monogram rendered as react-pdf SVG primitives. Mirrors the in-app
 * `Monogram` component in `components/layout/Brand.tsx` — a circle, a
 * south-east stroke, and a filled inner dot. Kept inline (rather than importing
 * the React DOM SVG component) because `@react-pdf/renderer` requires its own
 * SVG namespace.
 */
const BRAND_ACCENT = '#318b61';

function PdfMonogram({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={BRAND_ACCENT} strokeWidth={1.6} fill="none" />
      <Line
        x1="14.2"
        y1="14.2"
        x2="20.5"
        y2="20.5"
        stroke={BRAND_ACCENT}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Circle cx="12" cy="12" r="2.2" fill={BRAND_ACCENT} />
    </Svg>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- intentional: pure document-tree module mixes the builder with helpers; only entry point.
function HorizontalSplitBar({
  leftLabel,
  leftPct,
  rightLabel,
  rightPct,
  leftColor,
  rightColor,
}: {
  leftLabel: string;
  leftPct: number;
  rightLabel: string;
  rightPct: number;
  leftColor: string;
  rightColor: string;
}) {
  const safeLeft = Math.max(0, Math.min(100, leftPct));
  const safeRight = Math.max(0, Math.min(100, 100 - safeLeft));
  void rightPct;
  return (
    <View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${safeLeft}%`, backgroundColor: leftColor }]} />
        <View style={[styles.barFill, { width: `${safeRight}%`, backgroundColor: rightColor }]} />
      </View>
      <View style={styles.splitLegend}>
        <Text>{leftLabel} {safeLeft.toFixed(0)}%</Text>
        <Text>{rightLabel} {safeRight.toFixed(0)}%</Text>
      </View>
    </View>
  );
}

/**
 * Pure function returning the React element tree for the report. Used for
 * snapshot tests and by `exportWealthReport` for the actual download.
 */
export function buildWealthReport(input: ReportInput): React.ReactElement {
  const {
    userName,
    generatedAt,
    periodLabel,
    baseCurrency,
    snapshotsInPeriod,
    allSnapshots,
    topSources,
    volatilitySplit,
    liquiditySplit,
    trajectoryPng,
  } = input;

  const change = periodChangeLine(snapshotsInPeriod);
  const headlineValue =
    snapshotsInPeriod.length > 0
      ? snapshotsInPeriod[snapshotsInPeriod.length - 1].total
      : 0;

  const cagr = trailingCagrFromSnapshots(allSnapshots);
  const showForecast = cagr !== null;
  const forecast = showForecast
    ? generateScenarioForecast(
        allSnapshots.map((s) => ({ date: s.date, total: s.total })),
        36,
        cagr,
      )
    : [];
  const forecastEnd = forecast.length > 0 ? forecast[forecast.length - 1] : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 1. Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              <PdfMonogram size={16} />
              <Text style={styles.brand}>quantive</Text>
            </View>
            <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 4 }}>
              Wealth report — {userName ?? 'Your portfolio'}
            </Text>
          </View>
          <View style={styles.meta}>
            <Text>Generated {generatedAt.toISOString().slice(0, 10)}</Text>
            <Text>Period: {periodLabel}</Text>
          </View>
        </View>

        {/* 2. Headline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Net worth at period end</Text>
          <Text style={styles.headlineValue}>{formatCurrencyBase(headlineValue, baseCurrency)}</Text>
          {change && (
            <Text style={styles.headlineSub}>
              Period change: {change.abs >= 0 ? '+' : ''}
              {formatCurrencyBase(change.abs, baseCurrency)}
              {change.pct !== null ? ` (${change.pct >= 0 ? '+' : ''}${change.pct.toFixed(1)}%)` : ''}
            </Text>
          )}
        </View>

        {/* 3. Allocation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Allocation</Text>
          <Text style={styles.splitLabel}>Volatility split</Text>
          <HorizontalSplitBar
            leftLabel="Volatile"
            leftPct={volatilitySplit.volatile}
            rightLabel="Non-volatile"
            rightPct={volatilitySplit.nonVolatile}
            leftColor="#f97316"
            rightColor="#0ea5e9"
          />
          <Text style={styles.splitLabel}>Liquidity split</Text>
          <HorizontalSplitBar
            leftLabel="Liquid"
            leftPct={liquiditySplit.liquid}
            rightLabel="Illiquid"
            rightPct={liquiditySplit.illiquid}
            leftColor="#22c55e"
            rightColor="#a855f7"
          />
        </View>

        {/* 4. Trajectory */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trajectory</Text>
          {trajectoryPng ? (
            <Image src={trajectoryPng} style={styles.trajectoryImg} />
          ) : (
            <Text style={{ fontSize: 10, color: '#6b7280' }}>
              Chart unavailable — fewer than two snapshots in this period.
            </Text>
          )}
        </View>

        {/* 5. Top 5 sources */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top sources</Text>
          {topSources.slice(0, 5).map((s) => (
            <View key={s.name} style={styles.sourceRow}>
              <Text style={styles.sourceName}>{s.name}</Text>
              <Text style={styles.sourceValue}>{formatCurrencyBase(s.value, baseCurrency)}</Text>
              <Text style={styles.sourcePct}>{s.percentOfTotal.toFixed(1)}%</Text>
            </View>
          ))}
          {topSources.length === 0 && (
            <Text style={{ fontSize: 10, color: '#6b7280' }}>No sources recorded in this period.</Text>
          )}
        </View>

        {/* 6. Forecast — conditional */}
        {showForecast && forecastEnd && cagr !== null && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Forecast</Text>
            <View style={styles.forecastBox}>
              <Text>
                Based on your own {(cagr * 100).toFixed(1)}% trailing CAGR over the last 3 years — past performance, not a forecast.
              </Text>
              <Text style={{ marginTop: 4 }}>
                Projected net worth in 3 years: {formatCurrencyBase(forecastEnd.forecast, baseCurrency)}
                {' '}({formatCurrencyBase(forecastEnd.lower, baseCurrency)} – {formatCurrencyBase(forecastEnd.upper, baseCurrency)} band).
              </Text>
            </View>
          </View>
        )}

        {/* 7. Footer */}
        <Text style={styles.footer} fixed>
          Generated client-side. Not financial advice. usequantive.app
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Render the document tree to a Blob and trigger a browser download.
 * Returns the generated Blob for tests that want to assert on size or type.
 */
export async function exportWealthReport(
  input: ReportInput,
  filename = 'wealth_report.pdf',
): Promise<Blob> {
  const doc = buildWealthReport(input);
  const blob = await pdf(doc).toBlob();
  if (typeof document !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return blob;
}
