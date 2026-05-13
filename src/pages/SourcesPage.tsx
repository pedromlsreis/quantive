import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, MoreHorizontal, Search } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useCurrency } from '@/contexts/CurrencyContext';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { Sparkline } from '@/components/charts/Sparkline';
import { AddMeasurementModal } from '@/components/dashboard/AddMeasurementModal';
import { toTitleCase } from '@/lib/utils';

const SourcesPage = () => {
  const { data, isLoading, snapshots } = usePortfolio();
  const { fmtFull } = useCurrencyFormatter();
  const { currency } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(() => searchParams.get('q') ?? '');
  const [addOpen, setAddOpen] = useState(false);

  // Sync filter ← URL when navigated to with a different ?q=
  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    setFilter((prev) => (prev === q ? prev : q));
  }, [searchParams]);

  // Strip ?q= once the user clears or edits the input so the URL stays clean.
  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (filter === current) return;
    const next = new URLSearchParams(searchParams);
    if (filter) next.set('q', filter); else next.delete('q');
    setSearchParams(next, { replace: true });
  }, [filter, searchParams, setSearchParams]);

  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;

  // Build a 12-month series per source for the sparklines.
  const last12 = useMemo(() => snapshots.slice(-12), [snapshots]);

  const rows = useMemo(() => {
    if (!latest) return [];
    const needle = filter.trim().toLowerCase();
    return latest.sources
      .filter((s) => !needle || s.name.toLowerCase().includes(needle))
      .map((s) => {
        const series = last12.map((snap) => snap.sources.find((x) => x.name === s.name)?.value ?? 0);
        const positive = series.length > 1 ? series[series.length - 1] >= series[0] : true;
        return { source: s, series, positive };
      });
  }, [latest, last12, filter]);

  if (isLoading) return <DashboardSkeleton />;
  if (!data) return <FileUpload />;
  if (!latest) return null;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
            Sources
          </h1>
          <p style={{ color: 'var(--fg-subtle)', fontSize: 14, margin: '6px 0 0' }}>
            {latest.sources.length} accounts and assets tracked
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 240 }}>
            <label className="q-input" style={{ height: 32 }}>
              <span className="q-input-icon"><Search size={14} /></span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search sources"
                aria-label="Search sources"
              />
            </label>
          </div>
          <button
            className="q-btn q-btn--primary q-btn--sm"
            onClick={() => setAddOpen(true)}
            aria-label="Add measurement"
          >
            <Plus size={14} />
            <span>Add measurement</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="q-card q-card--p-none" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="q-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Currency</th>
                <th>Last 12 mo.</th>
                <th className="num">Value</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ source: s, series, positive }, i) => (
                <tr key={s.name + i}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 4, height: 28, borderRadius: 2, background: `var(--series-${(i % 8) + 1})`, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 500 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                          {toTitleCase(s.volatType)} · {s.isLiquid ? 'Liquid' : 'Non-Liquid'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="q-badge q-badge--neutral">{toTitleCase(s.volatType)}</span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{currency.code}</span>
                  </td>
                  <td style={{ width: 100 }}>
                    {series.length > 1
                      ? <Sparkline values={series} positive={positive} width={80} height={24} />
                      : <span style={{ color: 'var(--fg-faint)', fontSize: 11 }}>—</span>}
                  </td>
                  <td className="num" style={{
                    color: s.value < 0 ? 'var(--negative)' : 'var(--fg)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {fmtFull(s.value)}
                  </td>
                  <td style={{ width: 40 }}>
                    <button className="q-icon-btn" aria-label="More actions">
                      <MoreHorizontal size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--s-8)', color: 'var(--fg-subtle)' }}>
                    No sources match “{filter}”
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddMeasurementModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
};

export default SourcesPage;
