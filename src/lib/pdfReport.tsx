/**
 * @module pdfReport
 *
 * Pure document tree + thin export wrapper for the one-page net worth report.
 * Mirrors the buildX/exportX shape in `exporter.ts` so it stays testable.
 *
 * The trajectory chart is rasterised to PNG outside this module and passed in
 * as a data URL (see `components/export/PdfReportButton.tsx`):
 * `@react-pdf/renderer` does not render browser SVG.
 *
 * IMPORTANT: this module is heavy (the renderer is ~1MB gz). Import it
 * dynamically, as `PdfReportButton` does.
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
  Font,
  pdf,
} from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { Snapshot } from './types';
import { generateScenarioForecast } from './scenarioForecast';
import { formatDate, money, pct, tone, type FmtCtx } from './formatters';
import type { CurrencyCode } from './currencies';

// Brand fonts: Geist for text, JetBrains Mono for figures and the wordmark,
// as in the app. WOFF, because @react-pdf parses TTF/WOFF but not WOFF2;
// Vite's `?url` resolves each to a hashed asset URL fetched at generation.
import GeistRegular from '@fontsource/geist/files/geist-latin-400-normal.woff?url';
import GeistMedium from '@fontsource/geist/files/geist-latin-500-normal.woff?url';
import JetBrainsMonoRegular from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import JetBrainsMonoMedium from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff?url';

Font.register({
  family: 'Geist',
  fonts: [
    { src: GeistRegular, fontWeight: 400 },
    { src: GeistMedium, fontWeight: 500 },
  ],
});
Font.register({
  family: 'JetBrains Mono',
  fonts: [
    { src: JetBrainsMonoRegular, fontWeight: 400 },
    { src: JetBrainsMonoMedium, fontWeight: 500 },
  ],
});

export type ReportPeriod = 'this_year' | 'last_year' | 'all_time' | 'custom';

export interface ReportInput {
  /** User's display name from profile, or null to leave the line out. */
  userName: string | null;
  /** Date the report was generated. */
  generatedAt: Date;
  /** Period label rendered in the header (e.g. "1 Jan 2026 to 19 May 2026"). */
  periodLabel: string;
  /** Period identifier for analytics + filename. */
  period: ReportPeriod;
  /** Base currency code (e.g. "EUR"). */
  baseCurrency: CurrencyCode;
  /** Filtered snapshots inside the chosen period (ascending by date). */
  snapshotsInPeriod: Snapshot[];
  /** Full snapshot history, used for the conditional forecast. */
  allSnapshots: Snapshot[];
  /** Largest sources at period end, descending by value; `color` is the source's print colour. */
  topSources: Array<{ name: string; value: number; percentOfTotal: number; color?: string }>;
  /** Volatility split (0..100). */
  volatilitySplit: { volatile: number; nonVolatile: number };
  /** Liquidity split (0..100). */
  liquiditySplit: { liquid: number; illiquid: number };
  /** Pre-rasterised PNG of the trajectory chart, as a data URL. May be null. */
  trajectoryPng: string | null;
}

// Print palette: the app's warm neutrals and one emerald, darkened for paper.
const INK = '#1d1a17';
const INK_MUTED = '#504c47';
const INK_SUBTLE = '#6b665f';
const RULE = '#dad7d3';
const EMERALD = '#008252';
const POSITIVE = '#00713e';
const NEGATIVE = '#ac312a';

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingHorizontal: 44, paddingBottom: 56, fontFamily: 'Geist', fontSize: 10, color: INK, backgroundColor: '#ffffff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 12, borderBottomWidth: 0.75, borderBottomColor: RULE },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brand: { fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 13, letterSpacing: -0.3, color: INK },
  headRight: { alignItems: 'flex-end' },
  docTitle: { fontSize: 11, fontWeight: 500, color: INK },
  meta: { fontSize: 9, color: INK_SUBTLE, marginTop: 3 },
  hero: { marginTop: 22 },
  label: { fontSize: 10, color: INK_SUBTLE },
  figureWrap: { alignSelf: 'flex-start', marginTop: 4 },
  figure: { fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 30, letterSpacing: -0.8, color: INK },
  ruleTop: { height: 0, borderTopWidth: 1.2, borderTopColor: EMERALD, marginTop: 4 },
  ruleBottom: { height: 0, borderTopWidth: 1.2, borderTopColor: EMERALD, marginTop: 2 },
  deltaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 },
  delta: { fontFamily: 'JetBrains Mono', fontSize: 11 },
  ledger: { flexDirection: 'row', marginTop: 18, borderTopWidth: 0.75, borderTopColor: RULE },
  ledgerCell: { flex: 1, paddingVertical: 8 },
  ledgerCellRuled: { flex: 1, paddingVertical: 8, paddingLeft: 12, borderLeftWidth: 0.75, borderLeftColor: RULE },
  ledgerValue: { fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 13, color: INK, marginTop: 2 },
  ledgerSub: { fontSize: 8.5, color: INK_SUBTLE, marginTop: 2 },
  section: { marginTop: 18, paddingTop: 10, borderTopWidth: 0.75, borderTopColor: RULE },
  sectionTitle: { fontSize: 11, fontWeight: 500, color: INK, marginBottom: 8 },
  trajectoryImg: { width: '100%', height: 170, objectFit: 'contain' },
  empty: { fontSize: 10, color: INK_SUBTLE },
  columns: { flexDirection: 'row', gap: 24 },
  colWide: { flex: 3 },
  colNarrow: { flex: 2 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  swatch: { width: 3, height: 11, marginRight: 7 },
  sourceName: { flex: 1, fontSize: 10, color: INK },
  sourceValue: { width: 84, textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 9.5, color: INK },
  sourcePct: { width: 42, textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 9, color: INK_SUBTLE },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  splitText: { fontSize: 9.5, color: INK_MUTED },
  splitPct: { fontFamily: 'JetBrains Mono', fontSize: 9.5, color: INK },
  splitTrack: { flexDirection: 'row', height: 4, backgroundColor: RULE, marginTop: 4, marginBottom: 12 },
  splitFill: { height: 4, backgroundColor: INK_MUTED },
  forecastFigure: { fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 16, color: INK },
  note: { fontSize: 9, lineHeight: 1.45, color: INK_SUBTLE, marginTop: 6, maxWidth: 420 },
  footer: { position: 'absolute', bottom: 26, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: INK_SUBTLE },
});

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

// The pieces below are named (displayName) so tests can read the document
// tree by role rather than by style numbers.

// eslint-disable-next-line react-refresh/only-export-components -- document-tree module: helpers beside the builder.
function PdfMonogram({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={EMERALD} strokeWidth={1.6} fill="none" />
      <Line x1="14.2" y1="14.2" x2="20.5" y2="20.5" stroke={EMERALD} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx="12" cy="12" r="2.2" fill={EMERALD} />
    </Svg>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- document-tree module: helpers beside the builder.
function PdfSectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}
PdfSectionTitle.displayName = 'PdfSectionTitle';

// eslint-disable-next-line react-refresh/only-export-components -- document-tree module: helpers beside the builder.
function PdfFigure({ children }: { children: string }) {
  return (
    <View style={styles.figureWrap}>
      <Text style={styles.figure}>{children}</Text>
      {/* The one real total carries the double rule, as in the app. */}
      <View style={styles.ruleTop} />
      <View style={styles.ruleBottom} />
    </View>
  );
}
PdfFigure.displayName = 'PdfFigure';

// eslint-disable-next-line react-refresh/only-export-components -- document-tree module: helpers beside the builder.
function PdfSourceRow({ name, value, share, color }: { name: string; value: string; share: string; color: string }) {
  return (
    <View style={styles.sourceRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.sourceName}>{name}</Text>
      <Text style={styles.sourceValue}>{value}</Text>
      <Text style={styles.sourcePct}>{share}</Text>
    </View>
  );
}
PdfSourceRow.displayName = 'PdfSourceRow';

// eslint-disable-next-line react-refresh/only-export-components -- document-tree module: helpers beside the builder.
function PdfSplit({ left, right, leftPct }: { left: string; right: string; leftPct: number }) {
  const l = Math.max(0, Math.min(100, leftPct));
  return (
    <View>
      <View style={styles.splitRow}>
        <Text style={styles.splitText}>{left}</Text>
        <Text style={styles.splitPct}>{`${l.toFixed(0)}%`}</Text>
      </View>
      <View style={styles.splitRow}>
        <Text style={styles.splitText}>{right}</Text>
        <Text style={styles.splitPct}>{`${(100 - l).toFixed(0)}%`}</Text>
      </View>
      {/* Ordinal shares in ink: colour is reserved for source identity. */}
      <View style={styles.splitTrack}>
        <View style={[styles.splitFill, { width: `${l}%` }]} />
      </View>
    </View>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- document-tree module: helpers beside the builder.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section} wrap={false}>
      <PdfSectionTitle>{title}</PdfSectionTitle>
      {children}
    </View>
  );
}
Section.displayName = 'PdfSection';

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

  // en-GB on purpose: the document leaves the browser (advisers, accountants),
  // so it uses one predictable convention rather than the viewer's locale.
  const ctx: FmtCtx = { currency: baseCurrency, locale: 'en-GB' };
  const first = snapshotsInPeriod[0];
  const last = snapshotsInPeriod[snapshotsInPeriod.length - 1];
  const change = first && last && snapshotsInPeriod.length > 1 ? last.total - first.total : null;
  const changePct = change !== null && first.total !== 0 ? (change / first.total) * 100 : null;
  const changeTone = change === null ? 'zero' : tone(change);
  // The period's extremes: the allocation shares already have their own section.
  const high = snapshotsInPeriod.reduce<Snapshot | null>((m, s) => (!m || s.total > m.total ? s : m), null);
  const low = snapshotsInPeriod.reduce<Snapshot | null>((m, s) => (!m || s.total < m.total ? s : m), null);

  const cagr = trailingCagrFromSnapshots(allSnapshots);
  const forecast = cagr !== null
    ? generateScenarioForecast(allSnapshots.map((s) => ({ date: s.date, total: s.total })), 36, cagr)
    : [];
  const forecastEnd = forecast.length > 0 ? forecast[forecast.length - 1] : null;

  return (
    <Document title="Quantive net worth report" author="Quantive">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <PdfMonogram />
            <Text style={styles.brand}>quantive</Text>
          </View>
          <View style={styles.headRight}>
            <Text style={styles.docTitle}>Net worth report</Text>
            <Text style={styles.meta}>{periodLabel}</Text>
            {userName && <Text style={styles.meta}>{`Prepared for ${userName}`}</Text>}
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.label}>{last ? `Net worth on ${formatDate(last.date)}` : 'Net worth'}</Text>
          <PdfFigure>{money(last?.total ?? 0, ctx)}</PdfFigure>
          {change !== null && first && (
            <View style={styles.deltaRow}>
              <Text style={[styles.delta, { color: changeTone === 'pos' ? POSITIVE : changeTone === 'neg' ? NEGATIVE : INK_SUBTLE }]}>
                {changeTone === 'zero'
                  ? 'No change'
                  : `${money(change, ctx, { signed: true })}${changePct !== null ? ` (${pct(changePct, ctx, { signed: true })})` : ''}`}
              </Text>
              <Text style={styles.label}>{`since ${formatDate(first.date)}`}</Text>
            </View>
          )}
        </View>

        <View style={styles.ledger}>
          <View style={styles.ledgerCell}>
            <Text style={styles.label}>Highest</Text>
            <Text style={styles.ledgerValue}>{high ? money(high.total, ctx) : '—'}</Text>
            {high && <Text style={styles.ledgerSub}>{formatDate(high.date)}</Text>}
          </View>
          <View style={styles.ledgerCellRuled}>
            <Text style={styles.label}>Lowest</Text>
            <Text style={styles.ledgerValue}>{low ? money(low.total, ctx) : '—'}</Text>
            {low && <Text style={styles.ledgerSub}>{formatDate(low.date)}</Text>}
          </View>
          <View style={styles.ledgerCellRuled}>
            <Text style={styles.label}>Entries in this period</Text>
            <Text style={styles.ledgerValue}>{String(snapshotsInPeriod.length)}</Text>
          </View>
        </View>

        <Section title="Net worth over the period">
          {trajectoryPng ? (
            <Image src={trajectoryPng} style={styles.trajectoryImg} />
          ) : (
            <Text style={styles.empty}>The chart needs two entries in this period.</Text>
          )}
        </Section>

        <View style={[styles.section, styles.columns]} wrap={false}>
          <View style={styles.colWide}>
            <PdfSectionTitle>Largest sources</PdfSectionTitle>
            {topSources.length === 0 ? (
              <Text style={styles.empty}>No sources in this period.</Text>
            ) : (
              topSources.slice(0, 5).map((s) => (
                <PdfSourceRow
                  key={s.name}
                  name={s.name}
                  value={money(s.value, ctx)}
                  share={`${s.percentOfTotal.toFixed(1)}%`}
                  color={s.color ?? INK_SUBTLE}
                />
              ))
            )}
          </View>
          <View style={styles.colNarrow}>
            <PdfSectionTitle>Allocation</PdfSectionTitle>
            <PdfSplit left="Volatile" right="Non-volatile" leftPct={volatilitySplit.volatile} />
            <PdfSplit left="Liquid" right="Non-liquid" leftPct={liquiditySplit.liquid} />
          </View>
        </View>

        {forecastEnd && cagr !== null && (
          <Section title="In 3 years at your recent pace">
            <Text style={styles.forecastFigure}>{money(forecastEnd.forecast, ctx)}</Text>
            <Text style={styles.label}>{`range ${money(forecastEnd.lower, ctx)} to ${money(forecastEnd.upper, ctx)}`}</Text>
            <Text style={styles.note}>
              {`Your growth over the last three years, ${pct(cagr * 100, ctx)} a year, carried forward. The range comes from how your history has varied around that trend. A projection from past entries, not a prediction or advice.`}
            </Text>
          </Section>
        )}

        <View style={styles.footer} fixed>
          <Text>{`Built in your browser from your entries on ${formatDate(generatedAt)}. Not financial advice.`}</Text>
          <Text>usequantive.app</Text>
        </View>
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
  filename = 'net_worth_report.pdf',
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
