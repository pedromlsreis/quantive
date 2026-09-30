import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useFormat } from '@/hooks/useFormat';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ProGate } from '@/components/billing/UpsellCard';
import { analytics } from '@/lib/analytics';
import { monthYear } from '@/lib/formatters';
import {
  applyFreeTierMask,
  buildMonthlyCsv,
  computeMonthlyRows,
} from '@/lib/monthlyAggregate';

const INITIAL_ROWS = 12;

/** "2026-09-30" → a local Date (ISO strings parse as UTC midnight otherwise). */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Month-end net worth with the change on the month and over 12 months. Shows
 * the latest year and grows in place; no inner scroll. On the free plan the
 * older months collapse into one row, followed by the page's one Pro gate.
 */
export function MonthSummaryTable() {
  const { allSnapshots } = usePortfolio();
  const f = useFormat();
  const { has } = useEntitlements();
  const hasFullHistory = has('history.full');
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => {
    const monthly = computeMonthlyRows(allSnapshots);
    return hasFullHistory ? monthly.map((r) => ({ ...r, redacted: false })) : applyFreeTierMask(monthly);
  }, [allSnapshots, hasFullHistory]);

  // Newest first.
  const sorted = useMemo(() => [...rows].reverse(), [rows]);
  const visible = sorted.filter((r) => !r.redacted);
  const redacted = sorted.filter((r) => r.redacted);

  if (sorted.length === 0) {
    return (
      <section className="q-sec" aria-labelledby="months-title">
        <div className="q-sec-head"><h2 className="q-h2" id="months-title">Month-by-month history</h2></div>
        <p className="q-body">{"Once you've recorded values for two months, this table fills in."}</p>
      </section>
    );
  }

  const handleCsv = async () => {
    setExporting(true);
    try {
      const csv = buildMonthlyCsv(sorted);
      const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monthly_summary_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      analytics.momTableExported({ rows: sorted.length, freeRedacted: redacted.length });
    } catch (err) {
      console.error('[MonthSummaryTable] CSV export failed', err);
      toast.error("Couldn't download the CSV. Try again.");
    } finally {
      setExporting(false);
    }
  };

  const shown = showAll ? visible : visible.slice(0, INITIAL_ROWS);

  const change = (abs: number | null, pctValue: number | null) =>
    abs === null ? (
      <span style={{ color: 'var(--fg-faint)' }}>—</span>
    ) : (
      <>
        {f.money(abs, { signed: true })}
        {pctValue !== null && <span className="q-table-pct">{f.pct(pctValue, { signed: true })}</span>}
      </>
    );

  return (
    <section className="q-sec" aria-labelledby="months-title">
      <div className="q-sec-head">
        <div>
          <h2 className="q-h2" id="months-title">Month-by-month history</h2>
          <div className="q-sec-sub">{"Each month's last entry, compared with the month before and the same month a year earlier."}</div>
        </div>
        <button
          type="button"
          onClick={handleCsv}
          disabled={exporting}
          className="q-btn q-btn--secondary q-btn--sm"
          aria-label="Download CSV"
        >
          <Download size={14} strokeWidth={1.75} aria-hidden="true" />
          {exporting ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>

      <table className="q-table q-table--responsive">
        <caption className="sr-only">Net worth at each month end, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Month-end</th>
            <th scope="col" className="num">Net worth</th>
            <th scope="col" className="num">Month</th>
            <th scope="col" className="num" data-col="secondary">12 months</th>
            <th scope="col" className="num" data-col="secondary">Annualised</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.monthEnd}>
              <td><time dateTime={row.monthEnd.slice(0, 10)}>{monthYear(isoToDate(row.monthEnd))}</time></td>
              <td className="num">{f.money(row.netWorth)}</td>
              <td className={`num q-tone-${row.deltaMonthAbs === null ? 'zero' : f.tone(row.deltaMonthAbs)}`}>
                {change(row.deltaMonthAbs, row.deltaMonthPct)}
              </td>
              <td className={`num q-tone-${row.deltaYearAbs === null ? 'zero' : f.tone(row.deltaYearAbs)}`} data-col="secondary">
                {change(row.deltaYearAbs, row.deltaYearPct)}
              </td>
              <td className="num" data-col="secondary" style={{ color: 'var(--fg-muted)' }}>
                {row.annualisedPct === null ? '—' : f.pct(row.annualisedPct, { signed: true })}
              </td>
            </tr>
          ))}
          {redacted.length > 0 && (showAll || visible.length <= INITIAL_ROWS) && (
            <tr data-redacted="true">
              <td colSpan={5} style={{ color: 'var(--fg-subtle)' }}>
                {`${redacted.length} earlier ${redacted.length === 1 ? 'month' : 'months'} (${monthYear(isoToDate(redacted[redacted.length - 1].monthEnd))} to ${monthYear(isoToDate(redacted[0].monthEnd))}) ${redacted.length === 1 ? 'is' : 'are'} in Pro`}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {visible.length > INITIAL_ROWS && (
        <div className="q-row-foot">
          <button type="button" className="q-link-btn" style={{ fontSize: 13 }} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? 'Show the latest 12 months' : `Show all ${visible.length} months`}
          </button>
        </div>
      )}

      {!hasFullHistory && redacted.length > 0 && <ProGate feature="benchmarks" variant="row" />}
    </section>
  );
}
