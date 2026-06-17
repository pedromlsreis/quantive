import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  Plus, Search, CornerDownLeft,
  Lock, LogOut, Download, Eye, EyeOff, UserPlus, KeyRound, MessageSquare,
} from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ALL_NAV_ITEMS } from '@/lib/nav-config';

type ResultKind = 'page' | 'source' | 'action';

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

interface ActionDef {
  id: string;
  label: string;
  /** Extra terms for fuzzy matching, beyond the visible label. */
  keywords: string;
  icon: React.ReactNode;
  run: () => void;
  /** Omit or `true` to show; `false` hides the action in the current state. */
  when?: boolean;
}

export function GlobalSearch({ onAdd, onSignUp, onFeedback }: { onAdd: () => void; onSignUp: () => void; onFeedback: () => void }) {
  const navigate = useNavigate();
  const { allSources, snapshots, isMockData } = usePortfolio();
  const { user, signOut } = useAuth();
  const { status, lock, hasRecovery } = useKeySession();
  const { privacyMode, setPrivacyMode } = usePreferences();

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
          icon: p.icon,
          run: () => navigate(p.to),
        });
      }
    }

    // Sources — only once the user has typed. On an empty palette they'd be an
    // arbitrary first-8 dump; pages + actions carry the discoverability, and
    // sources are something you look up by name, not browse blind.
    // A source absent from the latest snapshot is flagged "no value" rather
    // than implying a current figure. We don't surface the amount itself: it
    // would need currency formatting and privacy-mode handling, and the
    // palette is for navigation, not at-a-glance balances.
    if (q) {
      const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
      const valuedNames = new Set<string>();
      latest?.sources.forEach((s) => valuedNames.add(s.name));

      const sourceMatches = allSources.filter((s) => matches(s, q));
      for (const name of sourceMatches.slice(0, 8)) {
        out.push({
          kind: 'source',
          id: 'src:' + name,
          label: name,
          hint: valuedNames.has(name) ? undefined : 'No value',
          icon: <Database size={14} />,
          run: () => navigate(`/sources?q=${encodeURIComponent(name)}`),
        });
      }
    }

    // Actions — workspace commands. Each is keyword-matched and gated to the
    // states where it makes sense (e.g. Lock only while unlocked). In demo
    // mode the primary action mirrors the topbar's "sign up" swap.
    const actionDefs: ActionDef[] = [
      isMockData
        ? {
            id: 'action:signup',
            label: 'Sign up to track yours',
            keywords: 'sign up signup register create account add measurement track',
            icon: <UserPlus size={14} />,
            run: onSignUp,
          }
        : {
            id: 'action:add',
            label: 'Add measurement',
            keywords: 'add measurement new entry record snapshot',
            icon: <Plus size={14} />,
            run: onAdd,
          },
      {
        id: 'action:privacy',
        label: privacyMode ? 'Show values' : 'Hide values',
        keywords: 'privacy hide show values blur mask sensitive amounts',
        icon: privacyMode ? <Eye size={14} /> : <EyeOff size={14} />,
        run: () => setPrivacyMode(!privacyMode),
      },
      {
        id: 'action:export',
        label: 'Export data',
        keywords: 'export download csv excel xlsx pdf report backup data',
        icon: <Download size={14} />,
        run: () => navigate('/settings#export'),
        when: !!user,
      },
      {
        id: 'action:feedback',
        label: 'Send feedback',
        keywords: 'feedback contact support bug report suggestion idea help',
        icon: <MessageSquare size={14} />,
        run: onFeedback,
      },
      {
        id: 'action:recovery',
        label: 'Set up recovery code',
        keywords: 'recovery code backup mnemonic forgot password restore',
        icon: <KeyRound size={14} />,
        run: () => navigate('/settings#recovery'),
        when: !!user && hasRecovery === false,
      },
      {
        id: 'action:lock',
        label: 'Lock session',
        keywords: 'lock secure session privacy',
        icon: <Lock size={14} />,
        run: lock,
        when: status === 'unlocked-encrypted',
      },
      {
        id: 'action:signout',
        label: 'Sign out',
        keywords: 'sign out signout log out logout leave',
        icon: <LogOut size={14} />,
        run: () => { void signOut(); },
        when: !!user,
      },
    ];

    for (const a of actionDefs) {
      if (a.when === false) continue;
      if (matches(a.label + ' ' + a.keywords, q)) {
        out.push({ kind: 'action', id: a.id, label: a.label, icon: a.icon, run: a.run });
      }
    }

    return out;
  }, [
    query, allSources, snapshots, navigate, onAdd, onSignUp, onFeedback,
    isMockData, privacyMode, setPrivacyMode, user, hasRecovery, status, lock, signOut,
  ]);

  // Keep active index in range when results change.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const groups = useMemo(() => {
    const order: ResultKind[] = ['page', 'source', 'action'];
    const labels: Record<ResultKind, string> = {
      page: 'Pages',
      source: 'Sources',
      action: 'Actions',
    };
    return order
      .map((k) => ({ kind: k, label: labels[k], items: results.filter((r) => r.kind === k) }))
      .filter((g) => g.items.length > 0);
  }, [results]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // id → flat index, so each rendered option can find its position without an
  // O(n) indexOf per row.
  const flatIndexById = useMemo(() => {
    const m = new Map<string, number>();
    flatItems.forEach((it, i) => m.set(it.id, i));
    return m;
  }, [flatItems]);

  // Keep the active row visible while arrowing through a list taller than the
  // dropdown. aria-activedescendant alone doesn't scroll, because focus stays
  // on the input — the options never receive it.
  useEffect(() => {
    if (!open) return;
    const active = flatItems[activeIdx];
    if (!active) return;
    document.getElementById(`q-gs-${active.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIdx, flatItems]);

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
          placeholder="Search pages, sources, actions…  (/ or ⌘K)"
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
                  const flatIdx = flatIndexById.get(item.id) ?? -1;
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
