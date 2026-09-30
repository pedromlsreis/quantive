import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MoreHorizontal, Search, Pencil, History, Droplet, Pause, Play, Tag, Type } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useFormat } from '@/hooks/useFormat';
import { useSourceColors } from '@/hooks/useSourceColors';
import { formatDate } from '@/lib/formatters';
import { sentenceCase } from '@/lib/utils';
import { PageSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { RouteEmpty } from '@/components/dashboard/EmptyState';
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
  const f = useFormat();
  const colorOf = useSourceColors();
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
  // Set when a menu item opens an inline editor: onCloseAutoFocus then skips
  // Radix's focus restore to the trigger, which would blur and unmount the
  // editor straight after it was focused.
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
  const last12 = useMemo(() => allSnapshots.slice(-12), [allSnapshots]);

  // Most recent value + date per source, across all snapshots. A stopped or
  // skipped source still belongs here, shown at its last known figure.
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
        // A month without an entry for this source is a gap, not a zero.
        const series = last12.map((snap) => snap.sources.find((x) => x.name === idSource)?.value ?? null);
        const present = series.filter((v): v is number => v !== null);
        const change = present.length > 1 ? present[present.length - 1] - present[0] : null;
        // "As of" whenever the figure won't update on its own: stopped, or
        // last measured before the latest snapshot.
        const dateStale = !!(entry && latestSnapshot && entry.date.getTime() < latestSnapshot.date.getTime());
        const isStale = !!entry && (dateStale || !!rs.isPaused);
        return { refSource: rs, idSource, entry, series, change, isStale };
      });
  }, [data, lastEntryBySource, last12, latestSnapshot, filter, hideStopped]);

  if (isLoading) return <PageSkeleton />;
  if (!data) return <RouteEmpty title="Sources" sentence="The accounts you track, with their latest value and currency." />;

  const total = data.refSources.length;
  const meta = hideStopped && stoppedCount > 0
    ? `${total - stoppedCount} of ${total} tracked, ${stoppedCount} stopped hidden`
    : `${total} ${total === 1 ? 'account' : 'accounts'} tracked`;

  return (
    <div>
      <header className="q-page-head">
        <h1 className="q-h1" tabIndex={-1}>Sources</h1>
        <p className="q-page-meta">{meta}</p>
        {/* Only while something is unset: a standing instruction would be boilerplate. */}
        {data.refSources.some((rs) => !rs.volatType || rs.volatType.toLowerCase() === 'unknown') && (
          <p className="q-page-lede">
            {"Some sources have no volatility set. Set it from each row's menu to split your assets by risk on Allocations."}
          </p>
        )}
      </header>

      <div className="q-toolbar">
        <label className="q-input q-toolbar-search">
          <span className="q-input-icon"><Search size={14} strokeWidth={1.75} aria-hidden="true" /></span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search sources"
            aria-label="Search sources"
          />
        </label>
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
            <span className="q-toggle-label">Hide stopped</span>
          </button>
        )}
      </div>

      <div className="q-table-scroll">
        <table className="q-table q-table--responsive">
          <caption className="sr-only">Every source with its volatility, currency, last 12 months and latest value</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col" data-col="secondary">Volatility</th>
              <th scope="col" data-col="secondary">Currency</th>
              <th scope="col" data-col="secondary">12 months</th>
              <th scope="col" className="num">Value</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ refSource, idSource, entry, series, change, isStale }) => {
              const isEditing = editingVolat === idSource;
              const isPaused = !!refSource.isPaused;
              const category = refSource.category;
              const isEditingCat = editingCategory === idSource;
              const isLiquid = refSource.transferableInDays;
              const value = entry?.value ?? null;
              const sourceCcy = lastCurrencyBySource.get(idSource) ?? f.currency.code;
              const changeTone = change === null ? 'zero' : f.tone(change);
              return (
                <tr key={idSource} className={isPaused ? 'is-stopped' : undefined}>
                  <td>
                    <div className="q-src">
                      <span className="q-src-swatch" aria-hidden="true" style={{ background: colorOf(idSource) }} />
                      <div style={{ minWidth: 0 }}>
                        {editingName === idSource ? (
                          <label className="q-input q-input--inline" style={{ maxWidth: 280 }}>
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
                          <div className="q-src-name">
                            {idSource}
                            {isPaused && <span className="q-tag">Stopped</span>}
                          </div>
                        )}
                        <div className="q-table-sub">
                          {isEditingCat ? (
                            <select
                              ref={categorySelectRef}
                              className="q-input q-input--inline"
                              style={{ maxWidth: 220 }}
                              defaultValue={category ?? ''}
                              onChange={(e) => setCategoryFor(idSource, e.target.value)}
                              onBlur={() => setEditingCategory(null)}
                              aria-label={`Category for ${idSource}`}
                            >
                              <option value="" disabled>Choose a category</option>
                              {SOURCE_CATEGORIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          ) : (
                            <>{category || 'Uncategorised'}, {isLiquid ? 'liquid' : 'non-liquid'}</>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-col="secondary" style={{ width: 160, color: 'var(--fg-muted)' }}>
                    {isEditing ? (
                      <label className="q-input q-input--inline">
                        <input
                          ref={editInputRef}
                          value={volatDraft}
                          placeholder="e.g. Non-volatile, Volatile"
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
                      sentenceCase(refSource.volatType)
                    )}
                  </td>
                  <td data-col="secondary" className="mono" style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
                    {/* The source's own currency; Value is converted at each snapshot's rate. */}
                    {sourceCcy}
                    {sourceCcy !== f.currency.code && <span style={{ color: 'var(--fg-subtle)' }}> to {f.currency.code}</span>}
                  </td>
                  <td data-col="secondary" style={{ width: 170 }}>
                    {change === null ? (
                      <span style={{ color: 'var(--fg-subtle)', fontSize: 13 }}>Needs two entries</span>
                    ) : (
                      <span className="q-spark-cell">
                        <Sparkline values={series} tone={changeTone} />
                        <span className={`num q-tone-${changeTone}`}>
                          {changeTone === 'zero' ? 'No change' : f.money(change, { signed: true, compact: true })}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className={`num${value !== null && value < 0 ? ' q-tone-neg' : ''}`}>
                    {value !== null ? f.money(value) : <span style={{ color: 'var(--fg-subtle)' }}>No entries yet</span>}
                    {value !== null && isStale && entry && (
                      <span className="q-table-sub" style={{ fontFamily: 'var(--font-sans)' }}>
                        as of {formatDate(entry.date)}
                      </span>
                    )}
                  </td>
                  <td style={{ width: 44 }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="q-icon-btn" aria-label={`Actions for ${idSource}`}>
                          <MoreHorizontal size={16} strokeWidth={1.75} />
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
                        <DropdownMenuItem onSelect={() => { opensEditorRef.current = true; startEditName(idSource); }} className="gap-2 min-h-9">
                          <Type size={14} strokeWidth={1.75} aria-hidden="true" /> Rename source
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setHistorySource(idSource)} className="gap-2 min-h-9">
                          <History size={14} strokeWidth={1.75} aria-hidden="true" /> Edit values
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { opensEditorRef.current = true; setEditingCategory(idSource); }} className="gap-2 min-h-9">
                          <Tag size={14} strokeWidth={1.75} aria-hidden="true" /> {category ? 'Edit category' : 'Set category'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { opensEditorRef.current = true; startEditVolat(idSource, refSource.volatType); }} className="gap-2 min-h-9">
                          <Pencil size={14} strokeWidth={1.75} aria-hidden="true" /> Edit volatility
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => updateRefSource(idSource, { isLiquid: !isLiquid })} className="gap-2 min-h-9">
                          <Droplet size={14} strokeWidth={1.75} aria-hidden="true" /> {isLiquid ? 'Mark as non-liquid' : 'Mark as liquid'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => togglePaused(idSource)} className="gap-2 min-h-9">
                          {isPaused
                            ? <><Play size={14} strokeWidth={1.75} aria-hidden="true" /> Resume tracking</>
                            : <><Pause size={14} strokeWidth={1.75} aria-hidden="true" /> Stop tracking</>}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 'var(--s-8) 0', color: 'var(--fg-subtle)' }}>
                  {filter
                    ? `No sources match "${filter}"`
                    : hideStopped && stoppedCount > 0
                      ? 'Every source is stopped. Turn off "Hide stopped" to see them.'
                      : 'No sources yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
