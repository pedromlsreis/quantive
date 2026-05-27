import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MoreHorizontal, Search, Pencil, History, Droplet, Pause, Play, Tag } from 'lucide-react';
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
import { SOURCE_CATEGORIES } from '@/lib/categories';

const SourcesPage = () => {
  const { data, isLoading, allSnapshots, updateRefSource, lastCurrencyBySource } = usePortfolio();
  const { fmtFull } = useCurrencyFormatter();
  const { currency } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(() => searchParams.get('q') ?? '');

  const [editingVolat, setEditingVolat] = useState<string | null>(null);
  const [volatDraft, setVolatDraft] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [historySource, setHistorySource] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

  const refMeta = useMemo(() => {
    const m = new Map<string, { category?: string; isPaused?: boolean }>();
    for (const rs of data?.refSources ?? []) {
      m.set(rs.idSource.trim(), { category: rs.category, isPaused: rs.isPaused });
    }
    return m;
  }, [data]);

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

  const togglePaused = (idSource: string) => {
    const current = refMeta.get(idSource)?.isPaused ?? false;
    updateRefSource(idSource, { isPaused: !current });
  };

  const setCategoryFor = (idSource: string, category: string) => {
    updateRefSource(idSource, { category });
    setEditingCategory(null);
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

  const latestSnapshot = allSnapshots.length ? allSnapshots[allSnapshots.length - 1] : null;

  // Build a 12-month series per source for the sparklines.
  const last12 = useMemo(() => allSnapshots.slice(-12), [allSnapshots]);

  // Most recent value + date per source, across all snapshots. A paused or
  // skipped source still belongs on this page — we show its last known figure
  // with an "as of" hint when it isn't current.
  const lastEntryBySource = useMemo(() => {
    const m = new Map<string, { value: number; date: Date }>();
    for (let i = allSnapshots.length - 1; i >= 0; i--) {
      const snap = allSnapshots[i];
      for (const src of snap.sources) {
        if (!m.has(src.name)) m.set(src.name, { value: src.value, date: snap.date });
      }
    }
    return m;
  }, [allSnapshots]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = filter.trim().toLowerCase();
    return data.refSources
      .filter((rs) => !needle || rs.idSource.toLowerCase().includes(needle))
      .map((rs) => {
        const idSource = rs.idSource.trim();
        const entry = lastEntryBySource.get(idSource) ?? null;
        const series = last12.map((snap) => snap.sources.find((x) => x.name === idSource)?.value ?? 0);
        const positive = series.length > 1 ? series[series.length - 1] >= series[0] : true;
        const isStale = !!(entry && latestSnapshot && entry.date.getTime() < latestSnapshot.date.getTime());
        return { refSource: rs, idSource, entry, series, positive, isStale };
      });
  }, [data, lastEntryBySource, last12, latestSnapshot, filter]);

  if (isLoading) return <DashboardSkeleton />;
  if (!data) return <FileUpload />;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
            Sources
          </h1>
          <p style={{ color: 'var(--fg-subtle)', fontSize: 14, margin: '6px 0 0' }}>
            {data.refSources.length} accounts and assets tracked
          </p>
          <p style={{ color: 'var(--fg-faint)', fontSize: 12, margin: '4px 0 0', maxWidth: 620 }}>
            Tag each source as volatile (e.g. stocks, crypto) or stable (e.g. savings, bonds) to power volatility insights. Not sure? Leave it as unknown, you can change it any time.
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
              {rows.map(({ refSource, idSource, entry, series, positive, isStale }, i) => {
                const isEditing = editingVolat === idSource;
                const isPaused = !!refSource.isPaused;
                const category = refSource.category;
                const isEditingCat = editingCategory === idSource;
                const isLiquid = refSource.transferableInDays;
                const value = entry?.value ?? null;
                return (
                  <tr key={idSource + i} style={isPaused ? { opacity: 0.65 } : undefined}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 4, height: 28, borderRadius: 2, background: `var(--series-${(i % 8) + 1})`, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {idSource}
                            {isPaused && <span className="q-badge q-badge--neutral" style={{ fontSize: 10 }}>Stopped</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                            {category || <span style={{ color: 'var(--fg-faint)' }}>Uncategorised</span>}
                            <span style={{ margin: '0 6px', color: 'var(--fg-faint)' }}>·</span>
                            {isLiquid ? 'Liquid' : 'Non-liquid'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-col="secondary" style={{ width: 180 }}>
                      {isEditingCat ? (
                        <select
                          autoFocus
                          className="q-input"
                          style={{ height: 28, padding: '0 var(--s-2)' }}
                          defaultValue={category ?? ''}
                          onChange={(e) => setCategoryFor(idSource, e.target.value)}
                          onBlur={() => setEditingCategory(null)}
                          aria-label={`Category for ${idSource}`}
                        >
                          <option value="" disabled>Choose a category…</option>
                          {SOURCE_CATEGORIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      ) : isEditing ? (
                        <label className="q-input" style={{ height: 28, padding: '0 var(--s-2)' }}>
                          <input
                            ref={editInputRef}
                            value={volatDraft}
                            placeholder="e.g. volatile, stable"
                            onChange={(e) => setVolatDraft(e.target.value)}
                            onBlur={() => commitVolat(idSource, refSource.volatType)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') {
                                setEditingVolat(null);
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            aria-label={`Volatility for ${idSource}`}
                          />
                        </label>
                      ) : (
                        <span className="q-badge q-badge--neutral">{refSource.volatType.replace(/_/g, ' ')}</span>
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
                        const sourceCcy = lastCurrencyBySource.get(idSource) ?? currency.code;
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
                      {series.length > 1 && series.some(v => v !== 0)
                        ? <Sparkline values={series} positive={positive} width={80} height={24} />
                        : <span style={{ color: 'var(--fg-faint)', fontSize: 11 }}>—</span>}
                    </td>
                    <td className="num" style={{
                      color: value !== null && value < 0 ? 'var(--negative)' : 'var(--fg)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {value !== null ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span>{fmtFull(value)}</span>
                          {isStale && entry && (
                            <span style={{ fontSize: 10, color: 'var(--fg-faint)', fontFamily: 'var(--font-sans)', fontWeight: 400 }}>
                              as of {entry.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ color: 'var(--fg-faint)' }}>—</span>
                          <span style={{ fontSize: 10, color: 'var(--fg-faint)', fontFamily: 'var(--font-sans)', fontWeight: 400 }}>
                            No measurements yet
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ width: 40 }}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="q-icon-btn" aria-label={`Actions for ${idSource}`}>
                            <MoreHorizontal size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onSelect={() => setHistorySource(idSource)}>
                            <History className="mr-2 h-3.5 w-3.5" />
                            Edit values
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setEditingCategory(idSource)}>
                            <Tag className="mr-2 h-3.5 w-3.5" />
                            {category ? 'Edit category' : 'Set category'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => startEditVolat(idSource, refSource.volatType)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Edit volatility
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => updateRefSource(idSource, { isLiquid: !isLiquid })}
                          >
                            <Droplet className="mr-2 h-3.5 w-3.5" />
                            {isLiquid ? 'Mark as non-liquid' : 'Mark as liquid'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => togglePaused(idSource)}>
                            {isPaused
                              ? <><Play className="mr-2 h-3.5 w-3.5" />Resume measurements</>
                              : <><Pause className="mr-2 h-3.5 w-3.5" />Stop measurements</>}
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
                    {filter ? `No sources match “${filter}”` : 'No sources yet'}
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
