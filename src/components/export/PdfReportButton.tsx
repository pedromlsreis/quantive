/**
 * PDF report entry point. Lazy-loads the heavy `pdfReport.tsx` module (and
 * `@react-pdf/renderer` with it) only on first click. Gated by the
 * `export.pdf` entitlement via `<FeatureGate>`.
 *
 * The trajectory chart is rasterised here using a Recharts <LineChart>
 * rendered into a hidden off-screen container, then captured via the SVG's
 * own serialised markup → drawn onto a canvas → `canvas.toDataURL()`. We use
 * the SVG serialise route rather than html2canvas to keep the dependency
 * surface minimal and to side-step DOM-layout flakiness; Recharts emits
 * clean SVG that the browser can rasterise natively via
 * `<img src="data:image/svg+xml;...">`.
 */
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { useModalLayer } from '@/hooks/useModalLayer';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { analytics } from '@/lib/analytics';
import type { Snapshot } from '@/lib/types';
import type { ReportInput, ReportPeriod } from '@/lib/pdfReport';
import { axisMoney, formatDate, type FmtCtx } from '@/lib/formatters';
import type { CurrencyCode } from '@/lib/currencies';
import { niceTicks } from '@/lib/dashboardData';
import { buildSourceColors, printColor, sourceColor } from '@/lib/sourceColors';
import { PERSONAL_PORTFOLIO_ID, portfolioFileSuffix } from '@/lib/portfolios';

interface PeriodChoice {
  id: ReportPeriod;
  label: string;
}

const CHOICES: PeriodChoice[] = [
  { id: 'this_year', label: 'This year' },
  { id: 'last_year', label: 'Last year' },
  { id: 'all_time', label: 'All time' },
  { id: 'custom', label: 'Custom range' },
];

function filterSnapshotsByPeriod(
  snapshots: Snapshot[],
  period: ReportPeriod,
  customStart?: Date,
  customEnd?: Date,
): { snaps: Snapshot[]; label: string } {
  if (snapshots.length === 0) return { snaps: [], label: 'No data' };
  const sorted = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());
  const last = sorted[sorted.length - 1].date;
  let start: Date;
  let end: Date;
  switch (period) {
    case 'this_year':
      start = new Date(last.getFullYear(), 0, 1);
      end = last;
      break;
    case 'last_year':
      start = new Date(last.getFullYear() - 1, 0, 1);
      end = new Date(last.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      break;
    case 'all_time':
      start = sorted[0].date;
      end = last;
      break;
    case 'custom': {
      const rawEnd = customEnd ?? last;
      end = new Date(rawEnd);
      end.setHours(23, 59, 59, 999);
      start = customStart ?? sorted[0].date;
      break;
    }
  }
  const inRange = sorted.filter(
    (s) => s.date.getTime() >= start.getTime() && s.date.getTime() <= end.getTime(),
  );
  return { snaps: inRange, label: `${formatDate(start)} to ${formatDate(end)}` };
}

function computeSplits(snap: Snapshot | undefined): {
  vol: { volatile: number; nonVolatile: number };
  liq: { liquid: number; illiquid: number };
} {
  if (!snap || snap.total === 0) {
    return { vol: { volatile: 0, nonVolatile: 0 }, liq: { liquid: 0, illiquid: 0 } };
  }
  const total = snap.sources.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return { vol: { volatile: 0, nonVolatile: 0 }, liq: { liquid: 0, illiquid: 0 } };
  }
  const volatileSum = snap.sources
    .filter((s) => s.volatType.toLowerCase().includes('volatile') && !s.volatType.toLowerCase().includes('non'))
    .reduce((acc, s) => acc + s.value, 0);
  const liquidSum = snap.sources.filter((s) => s.isLiquid).reduce((acc, s) => acc + s.value, 0);
  return {
    vol: { volatile: (volatileSum / total) * 100, nonVolatile: 100 - (volatileSum / total) * 100 },
    liq: { liquid: (liquidSum / total) * 100, illiquid: 100 - (liquidSum / total) * 100 },
  };
}

function topSourcesFrom(snap: Snapshot | undefined, colors: Map<string, string>) {
  if (!snap || snap.total === 0) return [];
  const ranked = [...snap.sources].sort((a, b) => b.value - a.value);
  return ranked.slice(0, 5).map((s) => ({
    name: s.name,
    value: s.value,
    percentOfTotal: snap.total !== 0 ? (s.value / snap.total) * 100 : 0,
    color: printColor(sourceColor(colors, s.name)),
  }));
}

/** Money and date labels go inside SVG text, so escape markup characters. */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Rasterise the period's net worth line to a PNG data URL for the report:
 * hairline grid on round ticks, labels on the right, one emerald line with an
 * end dot, dates at both ends. Drawn at ~2x the printed size so it stays sharp.
 */
async function rasteriseTrajectory(
  snaps: Snapshot[],
  currency: CurrencyCode,
  width = 1020,
  height = 340,
): Promise<string | null> {
  if (snaps.length < 2) return null;
  const ctxFmt: FmtCtx = { currency, locale: 'en-GB' };
  const xs = snaps.map((s) => s.date.getTime());
  const ys = snaps.map((s) => s.total);
  const xMin = Math.min(...xs);
  const xRange = Math.max(...xs) - xMin || 1;
  const { ticks, lo, hi } = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const yRange = hi - lo || 1;
  const left = 8;
  const right = width - 150;
  const top = 16;
  const bottom = height - 44;
  const px = (x: number) => left + ((x - xMin) / xRange) * (right - left);
  const py = (y: number) => bottom - ((y - lo) / yRange) * (bottom - top);
  const path = snaps.map((s, i) => `${i === 0 ? 'M' : 'L'}${px(s.date.getTime()).toFixed(1)} ${py(s.total).toFixed(1)}`).join(' ');
  const lastSnap = snaps[snaps.length - 1];
  const font = 'font-family="Helvetica, Arial, sans-serif" font-size="19" fill="#6b665f"';
  const grid = ticks.map((t) => `
  <line x1="${left}" y1="${py(t).toFixed(1)}" x2="${right}" y2="${py(t).toFixed(1)}" stroke="#e8e6e2" stroke-width="1.5"/>
  <text x="${right + 16}" y="${(py(t) + 7).toFixed(1)}" ${font}>${escapeXml(axisMoney(t, ctxFmt))}</text>`).join('');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>${grid}
  <path d="${path}" fill="none" stroke="#008252" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${px(lastSnap.date.getTime()).toFixed(1)}" cy="${py(lastSnap.total).toFixed(1)}" r="7" fill="#008252"/>
  <text x="${left}" y="${height - 8}" ${font}>${escapeXml(formatDate(snaps[0].date))}</text>
  <text x="${right}" y="${height - 8}" text-anchor="end" ${font}>${escapeXml(formatDate(lastSnap.date))}</text>
</svg>`;

  // Render SVG → canvas → PNG. In SSR/test environments where Image is not
  // available, return null and let the report fall back to a textual note.
  if (typeof window === 'undefined' || typeof Image === 'undefined') return null;
  return await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.debug('[PdfReportButton] rasterise failed', err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function PdfReportButtonInner() {
  const { allSnapshots, activePortfolioId, activePortfolioName } = usePortfolio();
  const { currency } = useCurrency();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<ReportPeriod>('this_year');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [generating, setGenerating] = useState(false);

  const noData = allSnapshots.length === 0;

  const handleClose = useCallback(() => {
    if (generating) return;
    setOpen(false);
  }, [generating]);
  useModalLayer(open, handleClose);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  const handleGenerate = useCallback(async () => {
    if (noData) {
      toast.error('Add an entry first.');
      return;
    }
    setGenerating(true);
    try {
      const customS = period === 'custom' && customStart ? new Date(customStart) : undefined;
      const customE = period === 'custom' && customEnd ? new Date(customEnd) : undefined;
      const { snaps, label } = filterSnapshotsByPeriod(allSnapshots, period, customS, customE);
      if (snaps.length === 0) {
        toast.error('No entries fall in that period.');
        return;
      }
      const png = await rasteriseTrajectory(snaps, currency.code);

      // Lazy-load the renderer + builder. The dynamic import is the
      // load-bearing line for bundle-size control: the chunk only enters
      // memory when the user actually clicks "Generate".
      const mod = await import('@/lib/pdfReport');

      const lastInPeriod = snaps[snaps.length - 1];
      const { vol, liq } = computeSplits(lastInPeriod);

      const input: ReportInput = {
        userName: null,
        portfolioName: activePortfolioId === PERSONAL_PORTFOLIO_ID ? null : activePortfolioName,
        generatedAt: new Date(),
        periodLabel: label,
        period,
        baseCurrency: currency.code,
        snapshotsInPeriod: snaps,
        allSnapshots,
        topSources: topSourcesFrom(lastInPeriod, buildSourceColors(allSnapshots[allSnapshots.length - 1])),
        volatilitySplit: vol,
        liquiditySplit: liq,
        trajectoryPng: png,
      };

      const cagr = mod.trailingCagrFromSnapshots(allSnapshots);
      const months =
        allSnapshots.length >= 2
          ? Math.round(
              ((allSnapshots[allSnapshots.length - 1].date.getTime() - allSnapshots[0].date.getTime()) /
                (1000 * 60 * 60 * 24 * 30.4375)),
            )
          : 0;

      const stamp = new Date().toISOString().slice(0, 10);
      const suffix = portfolioFileSuffix(activePortfolioId, activePortfolioName);
      await mod.exportWealthReport(input, `quantive_net_worth_report${suffix}_${stamp}.pdf`);

      analytics.pdfReportGenerated({
        period,
        hasForecast: cagr !== null,
        months,
      });

      toast.success('Report downloaded');
      setOpen(false);
    } catch (err) {
      console.error('[PdfReportButton] generation failed', err);
      toast.error("Couldn't create the report. Try again.");
    } finally {
      setGenerating(false);
    }
  }, [allSnapshots, currency, period, customStart, customEnd, noData, activePortfolioId, activePortfolioName]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={noData}
        className="q-btn q-btn--secondary q-btn--md"
        data-testid="pdf-report-trigger"
        aria-label="Download PDF report"
      >
        PDF report
      </button>

      {open && createPortal(
        <div className="q-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
          <div
            ref={trapRef}
            className="q-modal"
            style={{ maxWidth: 460 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-report-modal-title"
            aria-describedby="pdf-report-modal-sub"
          >
            <div className="q-modal-head">
              <div>
                <h2 id="pdf-report-modal-title" className="q-modal-title">PDF report</h2>
                <p id="pdf-report-modal-sub" className="q-modal-sub">
                  {`One page in ${currency.code}, built in this browser. Nothing is uploaded.`}
                </p>
              </div>
              <button type="button" onClick={handleClose} className="q-icon-btn" aria-label="Close" disabled={generating}>
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            <div className="q-modal-body">
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="q-field-label" style={{ marginBottom: 'var(--s-2)' }}>Period</legend>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {CHOICES.map((c) => (
                    <label key={c.id} className="q-radio-row">
                      <input
                        type="radio"
                        name="pdf-period"
                        value={c.id}
                        checked={period === c.id}
                        onChange={() => setPeriod(c.id)}
                        disabled={generating}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
                {period === 'custom' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)', marginTop: 'var(--s-3)' }}>
                    <div className="q-field">
                      <label className="q-field-label" htmlFor="pdf-from">From</label>
                      <span className="q-input">
                        <input id="pdf-from" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} disabled={generating} />
                      </span>
                    </div>
                    <div className="q-field">
                      <label className="q-field-label" htmlFor="pdf-to">To</label>
                      <span className="q-input">
                        <input id="pdf-to" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} disabled={generating} />
                      </span>
                    </div>
                  </div>
                )}
              </fieldset>
            </div>

            <div className="q-modal-foot q-modal-foot--split">
              <button type="button" onClick={handleClose} className="q-btn q-btn--ghost q-btn--md" disabled={generating}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                className="q-btn q-btn--primary q-btn--md"
                disabled={generating || noData}
                data-testid="pdf-report-generate"
              >
                {generating ? 'Creating…' : 'Download report'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function PdfReportButton() {
  return (
    <FeatureGate feature="export.pdf" fallback={null}>
      <PdfReportButtonInner />
    </FeatureGate>
  );
}
