import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MoreHorizontal, Search, Pencil, History, Droplet } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useCurrency } from '@/contexts/CurrencyContext';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { Sparkline } from '@/components/charts/Sparkline';
import { MeasurementHistoryModal } from '@/components/sources/MeasurementHistoryModal';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { toTitleCase } from '@/lib/utils';

const SourcesPage = () => {
  const { data, isLoading, snapshots, updateRefSource, lastCurrencyBySource } = usePortfolio();
  const { fmtFull } = useCurrencyFormatter();
  const { currency } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(() => searchParams.get('q') ?? '');

  const [editingVolat, setEditingVolat] = useState<string | null>(null);
  const [volatDraft, setVolatDraft] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [historySource, setHistorySource] = useState<string | null>(null);

  const startEditVolat = (idSource: string, current: string) => {
    setEditingVolat(idSource);
    setVolatDraft(current.toLowerCase() === 'unknown' ? '' : current);
  };

  const commitVolat = (idSource: string, current: string) => {
    const next = volatDraft.trim();
    const original = current.toLowerCase() === 'unknown' ? '' : current;
    if (next !== original) updateRefSource(idSource, { volatType: next });
    setEditingVolat(null);
  };

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

  useEffect(() => {
    if (editingVolat) editInputRef.current?.focus();
  }, [editingVolat]);

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
          <p style={{ color: 'var(--fg-faint)', fontSize: 12, margin: '4px 0 0', maxWidth: 620 }}>
            Tag each source as volatile (e.g. stocks, crypto) or stable (e.g. savings, bonds) to power volatility insights. Not sure? Leave it as unknown — you can change it any time.
          </p>
        </div>
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
      </div>

      {/* Table */}
      <div className="q-card q-card--p-none" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="q-table q-table--responsive">
            <thead>
              <tr>
                <th>Source</th>
                <th data-col="secondary">Type</th>
                <th data-col="secondary">Currency</th>
                <th data-col="secondary">Last 12 mo.</th>
                <th className="num">Value</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ source: s, series, positive }, i) => {
                const isEditing = editingVolat === s.name;
                return (
                  <tr key={s.name + i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 4, height: 28, borderRadius: 2, background: `var(--series-${(i % 8) + 1})`, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 500 }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                            {s.isLiquid ? 'Liquid' : 'Non-liquid'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-col="secondary" style={{ width: 180 }}>
                      {isEditing ? (
                        <label className="q-input" style={{ height: 28, padding: '0 var(--s-2)' }}>
                          <input
                            ref={editInputRef}
                            value={volatDraft}
                            placeholder="e.g. Volatile, Stable"
                            onChange={(e) => setVolatDraft(e.target.value)}
                            onBlur={() => commitVolat(s.name, s.volatType)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') {
                                setEditingVolat(null);
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            aria-label={`Volatility for ${s.name}`}
                          />
                        </label>
                      ) : (
                        <span className="q-badge q-badge--neutral">{toTitleCase(s.volatType)}</span>
                      )}
                    </td>
                    <td data-col="secondary">
                      {(() => {
                        // Show the source's own currency (most-recent fact),
                        // not the global display currency. When the two
                        // differ, the Value column is FX-converted at the
                        // snapshot rate; hint at that with a small "→ EUR"
                        // suffix so the user can see why their USD broker
                        // shows a different number than their statement.
                        const sourceCcy = lastCurrencyBySource.get(s.name) ?? currency.code;
                        const converted = sourceCcy !== currency.code;
                        return (
                          <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                            {sourceCcy}
                            {converted && (
                              <span style={{ color: 'var(--fg-faint)' }}> → {currency.code}</span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td data-col="secondary" style={{ width: 100 }}>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="q-icon-btn" aria-label={`Actions for ${s.name}`}>
                            <MoreHorizontal size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onSelect={() => startEditVolat(s.name, s.volatType)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Edit volatility…
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => updateRefSource(s.name, { isLiquid: !s.isLiquid })}
                          >
                            <Droplet className="mr-2 h-3.5 w-3.5" />
                            {s.isLiquid ? 'Mark as non-liquid' : 'Mark as liquid'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setHistorySource(s.name)}>
                            <History className="mr-2 h-3.5 w-3.5" />
                            View measurements
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
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

      <MeasurementHistoryModal
        open={!!historySource}
        onOpenChange={(o) => { if (!o) setHistorySource(null); }}
        idSource={historySource}
      />
    </div>
  );
};

export default SourcesPage;
