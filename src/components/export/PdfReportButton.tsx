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
import { FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { analytics } from '@/lib/analytics';
import type { Snapshot } from '@/lib/types';
import type { ReportInput, ReportPeriod } from '@/lib/pdfReport';

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
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { snaps: inRange, label: `${fmt(start)} – ${fmt(end)}` };
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

function topSourcesFrom(snap: Snapshot | undefined) {
  if (!snap || snap.total === 0) return [];
  const ranked = [...snap.sources].sort((a, b) => b.value - a.value);
  return ranked.slice(0, 5).map((s) => ({
    name: s.name,
    value: s.value,
    percentOfTotal: snap.total !== 0 ? (s.value / snap.total) * 100 : 0,
  }));
}

/**
 * Rasterise a minimal line chart of `(date,total)` pairs to a PNG data URL.
 * Uses a hand-rolled SVG path — vastly simpler than booting Recharts off
 * screen and keeps the rasterise pipeline deterministic across browsers.
 * (Recharts SVG inside @react-pdf doesn't survive cleanly; the plan's
 * "rasterise-to-PNG at generation time" is satisfied by producing PNG bytes
 * we then embed via the report's <Image> element.)
 */
async function rasteriseTrajectory(
  snaps: Snapshot[],
  width = 720,
  height = 280,
): Promise<string | null> {
  if (snaps.length < 2) return null;
  const xs = snaps.map((s) => s.date.getTime());
  const ys = snaps.map((s) => s.total);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const pad = 32;
  const project = (x: number, y: number): [number, number] => [
    pad + ((x - xMin) / xRange) * (width - pad * 2),
    height - pad - ((y - yMin) / yRange) * (height - pad * 2),
  ];
  const pathParts: string[] = [];
  snaps.forEach((s, i) => {
    const [px, py] = project(s.date.getTime(), s.total);
    pathParts.push(`${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`);
  });
  const startLabel = snaps[0].date.toISOString().slice(0, 10);
  const endLabel = snaps[snaps.length - 1].date.toISOString().slice(0, 10);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#e5e7eb" stroke-width="1"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#e5e7eb" stroke-width="1"/>
  <path d="${pathParts.join(' ')}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>
  <text x="${pad}" y="${height - 6}" font-family="Helvetica" font-size="10" fill="#6b7280">${startLabel}</text>
  <text x="${width - pad}" y="${height - 6}" text-anchor="end" font-family="Helvetica" font-size="10" fill="#6b7280">${endLabel}</text>
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
        console.warn('[PdfReportButton] rasterise failed', err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function PdfReportButtonInner() {
  const { allSnapshots } = usePortfolio();
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

  const handleGenerate = useCallback(async () => {
    if (noData) {
      toast.error('Add a measurement first to generate a report.');
      return;
    }
    setGenerating(true);
    try {
      const customS = period === 'custom' && customStart ? new Date(customStart) : undefined;
      const customE = period === 'custom' && customEnd ? new Date(customEnd) : undefined;
      const { snaps, label } = filterSnapshotsByPeriod(allSnapshots, period, customS, customE);
      if (snaps.length === 0) {
        toast.error('No snapshots fall within that period.');
        return;
      }
      const png = await rasteriseTrajectory(snaps);

      // Lazy-load the renderer + builder. The dynamic import is the
      // load-bearing line for bundle-size control: the chunk only enters
      // memory when the user actually clicks "Generate".
      const mod = await import('@/lib/pdfReport');

      const lastInPeriod = snaps[snaps.length - 1];
      const { vol, liq } = computeSplits(lastInPeriod);

      const input: ReportInput = {
        userName: null,
        generatedAt: new Date(),
        periodLabel: label,
        period,
        baseCurrency: currency.code,
        snapshotsInPeriod: snaps,
        allSnapshots,
        topSources: topSourcesFrom(lastInPeriod),
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
      await mod.exportWealthReport(input, `quantive_wealth_report_${stamp}.pdf`);

      analytics.pdfReportGenerated({
        period,
        hasForecast: cagr !== null,
        months,
      });

      toast.success('Report ready — check your downloads.');
      setOpen(false);
    } catch (err) {
      console.error('[PdfReportButton] generation failed', err);
      toast.error('PDF generation failed.');
    } finally {
      setGenerating(false);
    }
  }, [allSnapshots, currency, period, customStart, customEnd, noData]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={noData}
        className="q-btn q-btn--secondary q-btn--sm"
        data-testid="pdf-report-trigger"
        aria-label="Generate PDF wealth report"
      >
        <FileText className="h-3.5 w-3.5" />
        PDF report
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pdf-report-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={handleClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="q-card q-card--p-lg"
            style={{ maxWidth: 460, width: '100%', background: 'var(--bg, white)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--s-3)' }}>
              <div>
                <h3 id="pdf-report-modal-title" style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>
                  PDF wealth report
                </h3>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-subtle)', margin: '4px 0 0' }}>
                  One page, base currency {currency.code}. Generated locally — nothing leaves your browser.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="q-icon-btn"
                aria-label="Close"
                disabled={generating}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', marginBottom: 6 }}>
                Period
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {CHOICES.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
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
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <label style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                    From
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="q-input"
                      style={{ width: '100%', marginTop: 2 }}
                      disabled={generating}
                    />
                  </label>
                  <label style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                    To
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="q-input"
                      style={{ width: '100%', marginTop: 2 }}
                      disabled={generating}
                    />
                  </label>
                </div>
              )}
            </fieldset>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'var(--s-4)' }}>
              <button
                type="button"
                onClick={handleClose}
                className="q-btn q-btn--ghost q-btn--sm"
                disabled={generating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                className="q-btn q-btn--primary q-btn--sm"
                disabled={generating || noData}
                data-testid="pdf-report-generate"
              >
                {generating ? 'Generating…' : 'Generate report'}
              </button>
            </div>
          </div>
        </div>
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
