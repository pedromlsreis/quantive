import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MoreHorizontal, Search, Pencil, History, Droplet, Pause, Play, Tag, Type } from 'lucide-react';
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
  const { data, isLoading, allSnapshots, updateRefSource, renameSource, lastCurrencyBySource } = usePortfolio();
  const { fmtFull } = useCurrencyFormatter();
  const { currency } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(() => searchParams.get('q') ?? '');
  const [hideStopped, setHideStopped] = useState(true);

  const [editingVolat, setEditingVolat] = useState<string | null>(null);
  const [volatDraft, setVolatDraft] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [historySource, setHistorySource] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const categorySelectRef = useRef<HTMLSelectElement>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Set when the user picks a menu item that opens an inline editor. The
  // DropdownMenuContent's onCloseAutoFocus reads this and skips Radix's
  // default focus-restore-to-trigger — otherwise focus lands on the
  // trigger right after we focus the editor, fires onBlur on the editor,
  // and immediately unmounts it.
  const opensEditorRef = useRef(false);

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

  const startEditName = (idSource: string) => {
    setEditingName(idSource);
    setNameDraft(idSource);
  };

  const commitName = (idSource: string) => {
    const next = nameDraft.trim();
    if (next && next !== idSource) renameSource(idSource, next);
    setEditingName(null);
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
    if (!editingVolat) return;
    const raf = requestAnimationFrame(() => {
      const el = editInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [editingVolat]);

  // Defer to the next frame so Radix's dropdown-close focus restore (which
  // hands focus back to the trigger after onSelect) has already run by the
  // time we focus the input. Without this the trigger steals focus back and
  // the user has to click into the field manually.
  useEffect(() => {
    if (!editingName) return;
    const raf = requestAnimationFrame(() => {
      const el = nameInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [editingName]);

  // Same dance as editingName: defer focus to after Radix's onCloseAutoFocus
  // restore runs, then also open the native picker if the browser supports it
  // so the user sees the options without a second click.
  useEffect(() => {
    if (!editingCategory) return;
    const raf = requestAnimationFrame(() => {
      const el = categorySelectRef.current;
      if (!el) return;
      el.focus();
      try { el.showPicker?.(); } catch { /* not user-activated; focus alone is fine */ }
    });
    return () => cancelAnimationFrame(raf);
  }, [editingCategory]);

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

  const stoppedCount = useMemo(
    () => (data?.refSources ?? []).filter((rs) => rs.isPaused).length,
    [data],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = filter.trim().toLowerCase();
    return data.refSources
      .filter((rs) => !needle || rs.idSource.toLowerCase().includes(needle))
      .filter((rs) => !hideStopped || !rs.isPaused)
      .map((rs) => {
        const idSource = rs.idSource.trim();
        const entry = lastEntryBySource.get(idSource) ?? null;
        const series = last12.map((snap) => snap.sources.find((x) => x.name === idSource)?.value ?? 0);
        const positive = series.length > 1 ? series[series.length - 1] >= series[0] : true;
        // Show the "as of" date whenever the figure won't update on its own:
        // either the source is stopped (value frozen by user), or its last
        // measurement predates the latest portfolio snapshot date.
        const dateStale = !!(entry && latestSnapshot && entry.date.getTime() < latestSnapshot.date.getTime());
        const isStale = !!entry && (dateStale || !!rs.isPaused);
        return { refSource: rs, idSource, entry, series, positive, isStale };
      });
  }, [data, lastEntryBySource, last12, latestSnapshot, filter, hideStopped]);

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
            {hideStopped && stoppedCount > 0
              ? `${data.refSources.length - stoppedCount} of ${data.refSources.length} tracked · ${stoppedCount} stopped hidden`
              : `${data.refSources.length} accounts and assets tracked`}
          </p>
          <p style={{ color: 'var(--fg-faint)', fontSize: 12, margin: '4px 0 0', maxWidth: 620 }}>
            Tag each source as volatile (e.g. stocks, crypto) or stable (e.g. savings, bonds) to power volatility insights. Not sure? Leave it as unknown, you can change it any time.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {stoppedCount > 0 && (
            <button
              type="button"
              className={`q-toggle${hideStopped ? ' is-on' : ''}`}
              onClick={() => setHideStopped((v) => !v)}
              aria-checked={hideStopped}
              aria-label={`Hide stopped sources (${stoppedCount})`}
              role="switch"
            >
              <span className="q-toggle-track"><span className="q-toggle-thumb" /></span>
              <span className="q-toggle-label">
                Hide stopped
                <span className="q-toggle-sub">{stoppedCount} {stoppedCount === 1 ? 'source' : 'sources'}</span>
              </span>
            </button>
          )}
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
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {editingName === idSource ? (
                            <label className="q-input" style={{ height: 28, padding: '0 var(--s-2)', maxWidth: 280 }}>
                              <input
                                ref={nameInputRef}
                                value={nameDraft}
                                placeholder="Source name"
                                onChange={(e) => setNameDraft(e.target.value)}
                                onBlur={() => commitName(idSource)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                  if (e.key === 'Escape') {
                                    setEditingName(null);
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                                aria-label={`Rename ${idSource}`}
                                maxLength={100}
                              />
                            </label>
                          ) : (
                            <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                              {idSource}
                              {isPaused && <span className="q-badge q-badge--neutral" style={{ fontSize: 10 }}>Stopped</span>}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--fg-subtle)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {isEditingCat ? (
                              <select
                                ref={categorySelectRef}
                                className="q-input"
                                style={{ height: 24, padding: '0 var(--s-2)', fontSize: 11, maxWidth: 220 }}
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
                            ) : (
                              category || <span style={{ color: 'var(--fg-faint)' }}>Uncategorised</span>
                            )}
                            <span style={{ color: 'var(--fg-faint)' }}>·</span>
                            {isLiquid ? 'Liquid' : 'Non-liquid'}
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
                        <DropdownMenuContent
                          align="end"
                          className="w-56"
                          onCloseAutoFocus={(e) => {
                            if (opensEditorRef.current) {
                              e.preventDefault();
                              opensEditorRef.current = false;
                            }
                          }}
                        >
                          <DropdownMenuItem onSelect={() => { opensEditorRef.current = true; startEditName(idSource); }}>
                            <Type className="mr-2 h-3.5 w-3.5" />
                            Rename source
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setHistorySource(idSource)}>
                            <History className="mr-2 h-3.5 w-3.5" />
                            Edit values
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { opensEditorRef.current = true; setEditingCategory(idSource); }}>
                            <Tag className="mr-2 h-3.5 w-3.5" />
                            {category ? 'Edit category' : 'Set category'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { opensEditorRef.current = true; startEditVolat(idSource, refSource.volatType); }}>
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
                    {filter
                      ? `No sources match “${filter}”`
                      : hideStopped && stoppedCount > 0
                        ? 'All your sources are stopped — toggle “Hide stopped” off to show them.'
                        : 'No sources yet'}
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
