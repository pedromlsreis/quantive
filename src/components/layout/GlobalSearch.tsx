import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Database,
  Plus, Search, CornerDownLeft,
} from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { toTitleCase } from '@/lib/utils';
import { ALL_NAV_ITEMS } from '@/lib/nav-config';

type ResultKind = 'page' | 'source' | 'volatType' | 'action';

interface Result {
  kind: ResultKind;
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

const SEARCH_ICON_SIZE = 14;

interface SearchablePage {
  label: string;
  to: string;
  icon: React.ReactNode;
  keywords: string;
}

// Legal / security / admin pages are intentionally omitted here — they are
// reachable from the footer (Security, Privacy, Terms, Impressum) and the
// sidebar user menu (Admin), so search stays focused on actual workspace
// navigation rather than casual browsing.
const PAGES: SearchablePage[] = ALL_NAV_ITEMS.map((item) => ({
  label: item.label,
  to: item.to,
  icon: <item.Icon size={SEARCH_ICON_SIZE} />,
  keywords: item.keywords ?? '',
}));

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function GlobalSearch({ onAdd }: { onAdd: () => void }) {
  const navigate = useNavigate();
  const { allSources, allVolatTypes, snapshots } = usePortfolio();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus shortcut: `/` or Cmd/Ctrl+K. Skip when user is typing elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
      const isSlash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!isCmdK && !isSlash) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
      if (isSlash && typing) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim();
    const out: Result[] = [];

    for (const p of PAGES) {
      if (matches(p.label + ' ' + p.keywords, q)) {
        out.push({
          kind: 'page',
          id: 'page:' + p.to,
          label: p.label,
          hint: 'Page',
          icon: p.icon,
          run: () => navigate(p.to),
        });
      }
    }

    // Sources — surface the live value when available.
    const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
    const valueByName = new Map<string, number>();
    latest?.sources.forEach((s) => valueByName.set(s.name, s.value));

    const sourceMatches = allSources.filter((s) => matches(s, q));
    for (const name of sourceMatches.slice(0, 8)) {
      const v = valueByName.get(name);
      out.push({
        kind: 'source',
        id: 'src:' + name,
        label: name,
        hint: v != null ? 'Source' : 'Source · no value yet',
        icon: <Database size={14} />,
        run: () => navigate(`/sources?q=${encodeURIComponent(name)}`),
      });
    }

    const typeMatches = allVolatTypes.filter((t) => matches(t, q));
    for (const t of typeMatches.slice(0, 4)) {
      out.push({
        kind: 'volatType',
        id: 'type:' + t,
        label: toTitleCase(t),
        hint: 'Volatility type · open allocations',
        icon: <PieChart size={14} />,
        run: () => navigate('/allocations'),
      });
    }

    // Action: only show "Add measurement" when query is empty or matches it.
    if (matches('add measurement new entry record', q)) {
      out.push({
        kind: 'action',
        id: 'action:add',
        label: 'Add measurement',
        hint: 'Action',
        icon: <Plus size={14} />,
        run: () => onAdd(),
      });
    }

    return out;
  }, [query, allSources, allVolatTypes, snapshots, navigate, onAdd]);

  // Keep active index in range when results change.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const groups = useMemo(() => {
    const order: ResultKind[] = ['page', 'source', 'volatType', 'action'];
    const labels: Record<ResultKind, string> = {
      page: 'Pages',
      source: 'Sources',
      volatType: 'Volatility types',
      action: 'Actions',
    };
    return order
      .map((k) => ({ kind: k, label: labels[k], items: results.filter((r) => r.kind === k) }))
      .filter((g) => g.items.length > 0);
  }, [results]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const selectAt = (idx: number) => {
    const item = flatItems[idx];
    if (!item) return;
    item.run();
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (flatItems.length === 0) return;
      e.preventDefault();
      selectAt(activeIdx);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div
      ref={rootRef}
      className="q-topbar-search"
    >
      <label
        className="q-input"
        style={{ height: 32, maxWidth: 320, width: '100%' }}
      >
        <span className="q-input-icon"><Search size={14} /></span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder="Search sources, pages…  (press /)"
          aria-label="Quick search"
          role="combobox"
          aria-expanded={open}
          aria-controls="q-global-search-results"
          aria-activedescendant={open && flatItems[activeIdx] ? `q-gs-${flatItems[activeIdx].id}` : undefined}
        />
      </label>

      {open && (
        <div
          id="q-global-search-results"
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: 'min(420px, calc(100vw - 32px))',
            maxHeight: 'min(60vh, 480px)',
            overflowY: 'auto',
            background: 'var(--bg-elev-1, var(--bg))',
            border: '1px solid var(--border-raw)',
            borderRadius: 'var(--r-3)',
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            zIndex: 60,
          }}
        >
          {flatItems.length === 0 ? (
            <div style={{
              padding: '12px 12px',
              color: 'var(--fg-subtle)',
              fontSize: 13,
            }}>
              No matches for &ldquo;{query}&rdquo;
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.kind} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--fg-faint)',
                    padding: '8px 10px 4px',
                  }}
                >
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const flatIdx = flatItems.indexOf(item);
                  const isActive = flatIdx === activeIdx;
                  return (
                    <button
                      key={item.id}
                      id={`q-gs-${item.id}`}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIdx(flatIdx)}
                      onMouseDown={(e) => { e.preventDefault(); selectAt(flatIdx); }}
                      className="q-nav-item"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 0,
                        background: isActive ? 'var(--surface-soft)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 'var(--r-2)',
                      }}
                    >
                      <span style={{ color: 'var(--fg-subtle)', display: 'inline-flex' }}>
                        {item.icon}
                      </span>
                      <span style={{ flex: 1, color: 'var(--fg)', fontSize: 13 }}>
                        {item.label}
                      </span>
                      {item.hint && (
                        <span style={{ color: 'var(--fg-faint)', fontSize: 11 }}>
                          {item.hint}
                        </span>
                      )}
                      {isActive && (
                        <CornerDownLeft
                          size={12}
                          style={{ color: 'var(--fg-faint)', flexShrink: 0 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
