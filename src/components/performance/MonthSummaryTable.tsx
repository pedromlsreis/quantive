import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useEntitlements } from '@/hooks/useEntitlements';
import { usePreferences } from '@/contexts/PreferencesContext';
import { UpsellCard } from '@/components/billing/UpsellCard';
import { analytics } from '@/lib/analytics';
import {
  applyFreeTierMask,
  buildMonthlyCsv,
  computeMonthlyRows,
  type MonthlyRow,
} from '@/lib/monthlyAggregate';

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function signColor(value: number | null): string | undefined {
  if (value === null || !Number.isFinite(value) || value === 0) return undefined;
  return value > 0 ? 'var(--positive, #16a34a)' : 'var(--negative, #dc2626)';
}

function maskedCell({ redacted, children }: { redacted: boolean; children: React.ReactNode }) {
  if (!redacted) return <>{children}</>;
  return (
    <>
      <span style={{ filter: 'blur(6px)', color: 'var(--fg-faint)' }} aria-hidden="true">••••</span>
      <span className="sr-only">redacted — upgrade to Pro to view</span>
    </>
  );
}

export function MonthSummaryTable() {
  const { allSnapshots } = usePortfolio();
  const { fmt, fmtFull } = useCurrencyFormatter();
  const { has } = useEntitlements();
  const { privacyMode } = usePreferences();

  const hasFullHistory = has('history.full');

  const masked = useMemo(() => {
    const rows = computeMonthlyRows(allSnapshots);
    if (hasFullHistory) {
      return rows.map((r) => ({ ...r, redacted: false }));
    }
    return applyFreeTierMask(rows);
  }, [allSnapshots, hasFullHistory]);

  // Newest-first.
  const sorted = useMemo(() => [...masked].reverse(), [masked]);

  const [exporting, setExporting] = useState(false);

  if (sorted.length === 0) {
    return (
      <section className="q-card q-card--p-lg">
        <div className="q-section-head">
          <h2>Month-by-month history</h2>
        </div>
        <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}>
          No snapshots yet — once you've recorded values for two months, this table fills in automatically.
        </p>
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
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `monthly_summary_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      analytics.momTableExported({
        rows: sorted.length,
        freeRedacted: sorted.filter((r) => r.redacted).length,
      });
    } catch (err) {
      console.error('[MonthSummaryTable] CSV export failed', err);
      toast.error('Could not download the CSV. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const numeric: React.CSSProperties = {
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  };

  const cellBlur: React.CSSProperties = privacyMode ? { filter: 'blur(6px)' } : {};

  return (
    <section className="q-card q-card--p-lg">
      <div className="q-section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s-3)' }}>
        <div>
          <h2 style={{ margin: 0 }}>Month-by-month history</h2>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', margin: '4px 0 0' }}>
            Last snapshot on or before each month's last day. Deltas compare to the previous month-end.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCsv}
          disabled={exporting}
          className="q-btn q-btn--secondary q-btn--sm"
          aria-label="Download as CSV"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="q-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface, var(--bg))', zIndex: 1 }}>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-raw)' }}>
              <th style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--fg-subtle)' }}>Month-end</th>
              <th style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--fg-subtle)', textAlign: 'right' }}>Net worth</th>
              <th style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--fg-subtle)', textAlign: 'right' }}>Δ month</th>
              <th style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--fg-subtle)', textAlign: 'right' }}>Δ year</th>
              <th style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--fg-subtle)', textAlign: 'right' }}>Annualised</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const redacted = row.redacted;
              return (
                <tr
                  key={row.monthEnd}
                  data-redacted={redacted ? 'true' : undefined}
                  style={{
                    borderBottom: '1px solid var(--border-raw)',
                    background: redacted ? 'var(--surface-soft)' : undefined,
                    opacity: redacted ? 0.85 : 1,
                  }}
                >
                  <td style={{ padding: '8px 12px', color: 'var(--fg)' }}>{row.monthEnd}</td>
                  <td style={{ ...numeric, padding: '8px 12px', ...cellBlur }}>
                    {maskedCell({ redacted, children: fmtFull(row.netWorth) })}
                  </td>
                  <td style={{ ...numeric, padding: '8px 12px', color: signColor(row.deltaMonthAbs), ...cellBlur }}>
                    {maskedCell({
                      redacted,
                      children: row.deltaMonthAbs === null ? '—' : (
                        <>
                          {row.deltaMonthAbs > 0 ? '+' : ''}{fmt(row.deltaMonthAbs)} ({formatPct(row.deltaMonthPct)})
                        </>
                      ),
                    })}
                  </td>
                  <td style={{ ...numeric, padding: '8px 12px', color: signColor(row.deltaYearAbs), ...cellBlur }}>
                    {maskedCell({
                      redacted,
                      children: row.deltaYearAbs === null ? '—' : (
                        <>
                          {row.deltaYearAbs > 0 ? '+' : ''}{fmt(row.deltaYearAbs)} ({formatPct(row.deltaYearPct)})
                        </>
                      ),
                    })}
                  </td>
                  <td style={{ ...numeric, padding: '8px 12px', color: signColor(row.annualisedPct), ...cellBlur }}>
                    {maskedCell({ redacted, children: formatPct(row.annualisedPct) })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!hasFullHistory && sorted.some((r) => r.redacted) && (
        <div style={{ marginTop: 'var(--s-4)' }}>
          <UpsellCard feature="history.full" compact />
        </div>
      )}
    </section>
  );
}
