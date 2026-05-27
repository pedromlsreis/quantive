import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';
import { useFxRates } from '@/hooks/useFxRates';
import { X, Plus, ChevronDown, RefreshCw, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Sparkline } from '@/components/charts/Sparkline';
import { Notice } from '@/components/ui/Notice';
import { UITooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { sanitizeSourceName, parseLocalizedNumber } from '@/lib/utils';
import { formatCurrency, formatFullCurrency } from '@/lib/formatters';
import { CURRENCIES } from '@/lib/currencies';
import { SOURCE_CATEGORIES } from '@/lib/categories';
import { modalOverlay, modalContent } from '@/lib/motion';
import type { FactRow } from '@/lib/types';

interface NewSource {
  id: string;          // synthetic id used as the map key during this session
  name: string;
  volatType: string;
  category: string;
  isLiquid: boolean;
  defaultCurrency: CurrencyCode;
}

interface ExistingSourceMeta {
  idSource: string;
  lastValue: number;
  lastCurrency: CurrencyCode;
  volatType: string;
  category: string;
  isLiquid: boolean;
  history: number[];
}

interface SavedRecap {
  date: Date;
  backfill: boolean;
  count: number;
  delta: number;
  deltaPct: number;
  total: number;
  newStreak: number;
}

const STORAGE_KEY_ENTRIES = 'add-measurement-draft';

interface PersistedDraft {
  date?: string;
  entries?: Record<string, string>;
  ccyOverrides?: Record<string, CurrencyCode>;
  newSources?: NewSource[];
}

function loadDraft(): PersistedDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENTRIES);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDraft(d: PersistedDraft) {
  try { localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(d)); } catch { /* private mode */ }
}

function fmtMoney(value: number, code: CurrencyCode, locale: string, compact: boolean): string {
  if (!Number.isFinite(value)) return '—';
  if (compact) return formatCurrency(value, CURRENCIES[code].symbol);
  return formatFullCurrency(value, code, locale);
}

export function AddMeasurementModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const { data, addMeasurement, allSnapshots, lastCurrencyBySource } = usePortfolio();
  // Drafts are plaintext (source names + in-progress values), so we only
  // persist them for guests, who already use localStorage as their offline
  // cache. Authed users go cloud-only; their drafts live in component state
  // for the session and are lost on reload. Acceptable trade — see
  // encryption.md §8.3 ("nothing user-tied is plaintext on disk").
  const persistDraft = !user;
  const { currency: displayCurrency, allCurrencies } = useCurrency();
  const { convertAt } = useFxRates();

  const todayIso = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const today = useMemo(() => {
    const [y, m, d] = todayIso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [todayIso]);

  const [date, setDate] = useState<string>(todayIso);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [ccyOverrides, setCcyOverrides] = useState<Record<string, CurrencyCode>>({});
  const [newSources, setNewSources] = useState<NewSource[]>([]);
  const [addingNew, setAddingNew] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRecap | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  // Paused sources are excluded from the modal: by definition their last
  // measurement is held forever, so the user should not be entering new
  // values for them. They still count toward net worth via existing facts.
  const pausedSourceIds = useMemo(() => {
    const s = new Set<string>();
    for (const rs of data?.refSources ?? []) {
      if (rs.isPaused) s.add(rs.idSource.trim());
    }
    return s;
  }, [data]);

  // Case-insensitive index of *every* existing source name (paused too),
  // used to block duplicate-name attempts in NewSourceForm.
  const existingNamesLower = useMemo(() => {
    const s = new Set<string>();
    for (const rs of data?.refSources ?? []) s.add(rs.idSource.trim().toLowerCase());
    for (const f of data?.facts ?? []) s.add(f.idSource.trim().toLowerCase());
    return s;
  }, [data]);

  const existingSources: ExistingSourceMeta[] = useMemo(() => {
    if (!data || data.facts.length === 0) return [];
    const liquidMap = new Map<string, boolean>();
    const volatMap = new Map<string, string>();
    const categoryMap = new Map<string, string>();
    for (const rs of data.refSources ?? []) {
      liquidMap.set(rs.idSource.trim(), rs.transferableInDays);
      volatMap.set(rs.idSource.trim(), rs.volatType);
      if (rs.category) categoryMap.set(rs.idSource.trim(), rs.category);
    }
    const byId = new Map<string, FactRow[]>();
    for (const f of data.facts) {
      const key = f.idSource.trim();
      if (pausedSourceIds.has(key)) continue;
      const arr = byId.get(key);
      if (arr) arr.push(f); else byId.set(key, [f]);
    }
    const result: ExistingSourceMeta[] = [];
    for (const [id, rows] of byId.entries()) {
      const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
      const latest = sorted[sorted.length - 1];
      const history = sorted.slice(-12).map(r => r.sourceVl);
      result.push({
        idSource: id,
        lastValue: latest.sourceVl,
        lastCurrency: latest.currency,
        volatType: volatMap.get(id) ?? '',
        category: categoryMap.get(id) ?? '',
        isLiquid: liquidMap.get(id) ?? false,
        history,
      });
    }
    return result.sort((a, b) => b.lastValue - a.lastValue);
  }, [data, pausedSourceIds]);

  type Row =
    | { kind: 'existing'; meta: ExistingSourceMeta }
    | { kind: 'new'; source: NewSource };

  const allRows: Row[] = useMemo(() => {
    const existing: Row[] = existingSources.map(meta => ({ kind: 'existing', meta }));
    const adding: Row[] = newSources.map(source => ({ kind: 'new', source }));
    return [...existing, ...adding];
  }, [existingSources, newSources]);

  const buildInitial = useCallback(() => {
    // Authed users never persisted a draft; skip the read so a stale draft
    // left behind by a previous guest session doesn't replay into the
    // post-signup modal.
    if (!persistDraft) return {} as PersistedDraft;
    return loadDraft();
  }, [persistDraft]);

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const d = buildInitial();
      setDate(d.date && d.date <= todayIso ? d.date : todayIso);
      setEntries(d.entries ?? {});
      setCcyOverrides(d.ccyOverrides ?? {});
      setNewSources(d.newSources ?? []);
      setAddingNew(false);
      setFocusedId(null);
      setSaved(null);
      setValidationError(null);
    }
    prevOpenRef.current = open;
  }, [open, buildInitial, todayIso]);

  useEffect(() => {
    if (!open) return;
    if (!persistDraft) return;
    saveDraft({ date, entries, ccyOverrides, newSources });
  }, [open, persistDraft, date, entries, ccyOverrides, newSources]);

  const isToday = date === todayIso;
  const isBackfill = !isToday;
  const measurementDate = useMemo(() => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [date]);
  const fmtFull = (d: Date) => d.toLocaleDateString(displayCurrency.locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const fmtShort = (d: Date) => d.toLocaleDateString(displayCurrency.locale, { month: 'short', day: 'numeric' });

  const parseEntry = (val: string | undefined): number | null => {
    if (!val || val.trim() === '') return null;
    const parsed = parseLocalizedNumber(val);
    return typeof parsed === 'number' ? parsed : null;
  };

  const rowKey = useCallback(
    (r: Row) => (r.kind === 'existing' ? r.meta.idSource : r.source.id),
    [],
  );
  const rowSourceCcy = useCallback(
    (r: Row): CurrencyCode =>
      r.kind === 'existing' ? r.meta.lastCurrency : r.source.defaultCurrency,
    [],
  );
  const ccyFor = useCallback(
    (r: Row): CurrencyCode => {
      const key = rowKey(r);
      return (
        ccyOverrides[key] ??
        (r.kind === 'existing' ? lastCurrencyBySource.get(r.meta.idSource) ?? r.meta.lastCurrency : r.source.defaultCurrency)
      );
    },
    [ccyOverrides, lastCurrencyBySource, rowKey],
  );
  const setCcyForRow = (r: Row, code: CurrencyCode) => {
    setCcyOverrides(prev => ({ ...prev, [rowKey(r)]: code }));
  };
  const entryValueFor = (r: Row) => entries[rowKey(r)] ?? '';

  const totalCount = allRows.length;
  const filledIds = useMemo(() => {
    const ids: string[] = [];
    for (const r of allRows) {
      if (parseEntry(entries[rowKey(r)]) !== null) ids.push(rowKey(r));
    }
    return ids;
  }, [allRows, entries, rowKey]);
  const filledCount = filledIds.length;

  // FX-aware total delta projected into the user's display currency.
  // Per-row: typed-in-typedCcy → typed-in-source-native → delta-in-source-native → delta-in-display.
  const totalDelta = useMemo(() => {
    let acc = 0;
    for (const r of allRows) {
      const v = parseEntry(entries[rowKey(r)]);
      if (v == null) continue;
      const typedCcy = ccyFor(r);
      const sourceCcy = rowSourceCcy(r);
      const last = r.kind === 'existing' ? r.meta.lastValue : 0;
      const typedInNative = convertAt(v, typedCcy, sourceCcy, today);
      const deltaInNative = (Number.isFinite(typedInNative) ? typedInNative : 0) - last;
      const deltaInDisplay = convertAt(deltaInNative, sourceCcy, displayCurrency.code, today);
      acc += Number.isFinite(deltaInDisplay) ? deltaInDisplay : 0;
    }
    return acc;
  }, [allRows, entries, ccyFor, rowKey, rowSourceCcy, convertAt, today, displayCurrency.code]);

  const latestSnapshot = allSnapshots.length > 0 ? allSnapshots[allSnapshots.length - 1] : null;
  const netWorth = latestSnapshot?.total ?? 0;
  const projectedTotal = netWorth + totalDelta;
  const totalPct = netWorth !== 0 ? totalDelta / netWorth : 0;

  const streak = allSnapshots.length;
  const daysSinceLast = latestSnapshot
    ? Math.max(0, Math.floor((today.getTime() - latestSnapshot.date.getTime()) / 86_400_000))
    : null;

  function setEntryFor(r: Row, val: string) {
    setEntries(prev => {
      const next = { ...prev };
      const k = rowKey(r);
      if (val === '' || val == null) delete next[k];
      else next[k] = val;
      return next;
    });
    setValidationError(null);
  }

  function addCustomSource(spec: { name: string; volatType: string; category: string; initialCcy: CurrencyCode; initialValue: string; isLiquid: boolean }) {
    const id = 'new:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const src: NewSource = {
      id,
      name: spec.name.trim(),
      volatType: spec.volatType.trim(),
      category: spec.category.trim(),
      isLiquid: spec.isLiquid,
      defaultCurrency: spec.initialCcy,
    };
    setNewSources(prev => [...prev, src]);
    setCcyOverrides(prev => ({ ...prev, [id]: spec.initialCcy }));
    if (spec.initialValue.trim()) {
      setEntries(prev => ({ ...prev, [id]: spec.initialValue.trim() }));
    }
    setAddingNew(false);
    setFocusedId(id);
  }

  async function handleSave() {
    if (filledCount === 0 || saving) return;
    setSaving(true);
    setValidationError(null);
    try {
      type Entry = { name: string; value: number; currency: CurrencyCode; isLiquid: boolean; volatType: string; category?: string };
      const payload: Entry[] = [];
      const seen = new Set<string>();
      let firstDuplicate: string | null = null;

      for (const r of allRows) {
        const raw = entries[rowKey(r)];
        const num = parseEntry(raw);
        if (num == null) continue;
        const name = r.kind === 'existing' ? r.meta.idSource : r.source.name;
        const { value: cleanName, error: nameErr } = sanitizeSourceName(name);
        if (nameErr) {
          setValidationError(`"${name}": ${nameErr}`);
          setSaving(false);
          return;
        }
        if (seen.has(cleanName)) {
          if (!firstDuplicate) firstDuplicate = cleanName;
        }
        seen.add(cleanName);
        payload.push({
          name: cleanName,
          value: num,
          currency: ccyFor(r),
          isLiquid: r.kind === 'existing' ? r.meta.isLiquid : r.source.isLiquid,
          volatType: r.kind === 'existing' ? r.meta.volatType : r.source.volatType,
          category: r.kind === 'existing' ? (r.meta.category || undefined) : (r.source.category || undefined),
        });
      }

      if (firstDuplicate) {
        setValidationError(`"${firstDuplicate}" appears more than once. Keep only one row per source.`);
        setSaving(false);
        return;
      }
      if (payload.length === 0) {
        setSaving(false);
        return;
      }

      if (isToday) {
        addMeasurement(payload);
      } else {
        addMeasurement(payload, { date: measurementDate });
      }

      setSaved({
        date: measurementDate,
        backfill: isBackfill,
        count: payload.length,
        delta: totalDelta,
        deltaPct: totalPct,
        total: projectedTotal,
        newStreak: streak + (isToday ? 1 : 0),
      });
      localStorage.removeItem(STORAGE_KEY_ENTRIES);
    } finally {
      setSaving(false);
    }
  }

  // Cmd/Ctrl+Enter saves
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 grid place-items-center q-modal-backdrop"
        aria-modal="true"
        role="dialog"
        aria-labelledby="add-measurement-title"
        variants={modalOverlay}
        initial="hidden"
        animate="visible"
        exit="exit"
        onKeyDown={handleKeyDown}
      >
        <motion.div
          className="absolute inset-0"
          onClick={() => onOpenChange(false)}
        />
        <motion.div
          ref={trapRef}
          className="q-modal q-add-modal relative"
          style={{ width: 'min(640px, calc(100vw - 32px))' }}
          variants={modalContent}
        >
          {saved ? (
            <SaveSuccessPanel
              saved={saved}
              displayCurrency={displayCurrency}
              onDone={() => onOpenChange(false)}
            />
          ) : (
            <>
              <div className="q-modal-head">
                <div>
                  <div className="q-modal-title" id="add-measurement-title">Add measurement</div>
                  <div className="q-modal-sub q-modal-sub--addmeasurement">
                    <span className="q-streak-pill">
                      <span className="q-streak-pill-dot" />
                      Monthly streak ·{' '}
                      <span style={{ color: 'var(--fg)' }}>
                        {streak} {streak === 1 ? 'month' : 'months'}
                      </span>
                    </span>
                    {latestSnapshot && (
                      <>
                        <span className="q-modal-sub-sep">·</span>
                        <span>
                          Last snapshot {fmtShort(latestSnapshot.date)}
                          {daysSinceLast != null && ` (${daysSinceLast}d ago)`}
                        </span>
                      </>
                    )}
                    {!latestSnapshot && (
                      <>
                        <span className="q-modal-sub-sep">·</span>
                        <span>First snapshot</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="q-icon-btn"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="q-modal-body">
                {validationError && (
                  <Notice variant="negative" role="alert" style={{ marginBottom: 'var(--s-3)' }}>
                    <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>{validationError}</span>
                  </Notice>
                )}

                <div style={{ marginBottom: 16 }}>
                  <span className="q-field-label" style={{ display: 'block', marginBottom: 6 }}>Snapshot date</span>
                  <DateSelector
                    date={date}
                    todayIso={todayIso}
                    isToday={isToday}
                    onChange={setDate}
                    fmtFull={fmtFull}
                  />
                </div>

                <div className="q-source-list-head">
                  <span className="q-field-label" style={{ margin: 0 }}>Sources</span>
                  <span className="q-source-list-count">
                    <strong style={{ color: filledCount > 0 ? 'var(--accent-raw)' : 'var(--fg-muted)' }}>{filledCount}</strong>
                    <span style={{ color: 'var(--fg-subtle)' }}> of {totalCount} entered</span>
                  </span>
                </div>
                <div className="q-source-list-progress">
                  <div
                    className="q-source-list-progress-fill"
                    style={{ width: `${(filledCount / Math.max(1, totalCount)) * 100}%` }}
                  />
                </div>

                <div className="q-source-list">
                  {allRows.map(r => (
                    <SourceEntryRow
                      key={rowKey(r)}
                      row={r}
                      value={entryValueFor(r)}
                      ccy={ccyFor(r)}
                      sourceCcy={rowSourceCcy(r)}
                      onChange={v => setEntryFor(r, v)}
                      onCcyChange={c => setCcyForRow(r, c)}
                      focused={focusedId === rowKey(r)}
                      onFocus={() => setFocusedId(rowKey(r))}
                      onBlur={() => setFocusedId(null)}
                      convertAt={convertAt}
                      today={today}
                      allCurrencies={allCurrencies}
                      displayCurrency={displayCurrency}
                    />
                  ))}

                  {addingNew ? (
                    <NewSourceForm
                      defaultCurrency={displayCurrency.code}
                      onCancel={() => setAddingNew(false)}
                      onAdd={addCustomSource}
                      allCurrencies={allCurrencies}
                      existingNamesLower={existingNamesLower}
                      pendingNamesLower={new Set(newSources.map(s => s.name.trim().toLowerCase()))}
                    />
                  ) : (
                    <button
                      type="button"
                      className="q-add-source-row"
                      onClick={() => setAddingNew(true)}
                    >
                      <span className="q-add-source-row-icon"><Plus size={14} /></span>
                      <span>Add a new source</span>
                      <span className="q-add-source-row-hint">Accounts, brokerages, crypto…</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="q-add-summary">
                <div className="q-add-summary-row">
                  <div className="q-add-summary-label">
                    {filledCount === 0
                      ? 'Snapshot impact'
                      : (isBackfill ? `Backfilling ${fmtFull(measurementDate)}` : 'After save')}
                  </div>
                  {filledCount === 0 ? (
                    <div className="q-add-summary-empty">Enter at least one value to preview the impact</div>
                  ) : (
                    <div className="q-add-summary-vals">
                      <span className="q-add-summary-total">
                        {formatFullCurrency(projectedTotal, displayCurrency.code, displayCurrency.locale)}
                      </span>
                      <span className={`q-add-summary-delta ${totalDelta >= 0 ? 'is-pos' : 'is-neg'}`}>
                        {totalDelta >= 0 ? '▲' : '▼'}{' '}
                        {totalDelta >= 0 ? '+' : '−'}
                        {formatCurrency(Math.abs(totalDelta), displayCurrency.symbol)}
                        <span className="q-add-summary-delta-pct">
                          {totalDelta >= 0 ? '+' : '−'}{(Math.abs(totalPct) * 100).toFixed(2)}%
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="q-modal-foot">
                <button type="button" onClick={() => onOpenChange(false)} className="q-btn q-btn--ghost q-btn--md">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={filledCount === 0 || saving}
                  className="q-btn q-btn--primary q-btn--md"
                  style={{ opacity: filledCount === 0 || saving ? 0.5 : 1 }}
                >
                  {saving ? 'Saving…' : 'Save measurement'}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Date selector ────────────────────────────────────────
function DateSelector({
  date, todayIso, isToday, onChange, fmtFull,
}: {
  date: string;
  todayIso: string;
  isToday: boolean;
  onChange: (v: string) => void;
  fmtFull: (d: Date) => string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [y, m, d] = date.split('-').map(Number);
  return (
    <button
      type="button"
      className={`q-date-button ${!isToday ? 'is-backfill' : ''}`}
      onClick={() => {
        const el = inputRef.current;
        if (!el) return;
        const maybe = el as HTMLInputElement & { showPicker?: () => void };
        if (typeof maybe.showPicker === 'function') maybe.showPicker();
        else el.focus();
      }}
    >
      <RefreshCw size={14} />
      <span className="q-date-button-label">
        {isToday && <span className="q-date-button-tag">Today ·</span>}
        <span className="q-date-button-date">{fmtFull(new Date(y, m - 1, d))}</span>
      </span>
      {!isToday && (
        <span className="q-date-button-backfill" aria-label="Backfill">
          <RefreshCw size={10} /> Backfill
        </span>
      )}
      <span style={{ flex: 1 }} />
      <ChevronDown size={14} />
      <input
        ref={inputRef}
        type="date"
        className="q-date-button-input"
        value={date}
        max={todayIso}
        onChange={(e) => {
          const v = e.target.value;
          if (v && v <= todayIso) onChange(v);
          else onChange(todayIso);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </button>
  );
}

// ── Per-source row ───────────────────────────────────────
type SrcRow =
  | { kind: 'existing'; meta: ExistingSourceMeta }
  | { kind: 'new'; source: NewSource };

function SourceEntryRow({
  row, value, ccy, sourceCcy, onChange, onCcyChange, focused, onFocus, onBlur,
  convertAt, today, allCurrencies, displayCurrency,
}: {
  row: SrcRow;
  value: string;
  ccy: CurrencyCode;
  sourceCcy: CurrencyCode;
  onChange: (v: string) => void;
  onCcyChange: (c: CurrencyCode) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  convertAt: (amount: number, from: CurrencyCode, to: CurrencyCode, date: Date) => number;
  today: Date;
  allCurrencies: import('@/lib/currencies').CurrencyConfig[];
  displayCurrency: import('@/lib/currencies').CurrencyConfig;
}) {
  const name = row.kind === 'existing' ? row.meta.idSource : row.source.name;
  const subMeta = row.kind === 'existing' ? row.meta.category : row.source.category;
  const lastValue = row.kind === 'existing' ? row.meta.lastValue : 0;
  const history = row.kind === 'existing' ? row.meta.history : [];
  const isNew = row.kind === 'new';

  // Empty input must NOT parse to 0 — `parseLocalizedNumber('')` returns 0,
  // which would cascade into delta = -lastValue and a misleading -100% badge.
  // Treat blank as "no value entered" so the row's delta column falls back
  // to the CSS placeholder "—".
  const parsed = (() => {
    if (!value || value.trim() === '') return null;
    const p = parseLocalizedNumber(value);
    return typeof p === 'number' ? p : null;
  })();
  const hasValue = parsed != null;

  const typedInNative = hasValue ? convertAt(parsed, ccy, sourceCcy, today) : 0;
  const delta = hasValue ? (Number.isFinite(typedInNative) ? typedInNative : 0) - lastValue : 0;
  const deltaPct = hasValue && lastValue !== 0 ? delta / Math.abs(lastValue) : 0;
  const isCrossCcy = ccy !== sourceCcy;
  const fxRate = isCrossCcy ? convertAt(1, ccy, sourceCcy, today) : 1;
  const sparkPositive = history.length > 1 ? history[history.length - 1] >= history[0] : true;

  const ccyConf = CURRENCIES[ccy];
  const sourceCcyConf = CURRENCIES[sourceCcy];

  // Always include the chosen ccy + source-native + display currency, then
  // fill out with the rest alphabetically. Keeps the dropdown sensible without
  // a huge list scroll.
  const orderedCurrencies = useMemo(() => {
    const seen = new Set<CurrencyCode>();
    const out: typeof allCurrencies = [];
    const push = (code: CurrencyCode) => {
      if (seen.has(code)) return;
      const cfg = allCurrencies.find(c => c.code === code);
      if (cfg) { out.push(cfg); seen.add(code); }
    };
    push(ccy);
    push(sourceCcy);
    push(displayCurrency.code);
    for (const c of [...allCurrencies].sort((a, b) => a.name.localeCompare(b.name))) push(c.code);
    return out;
  }, [allCurrencies, ccy, sourceCcy, displayCurrency.code]);

  return (
    <div className={`q-src-row ${hasValue ? 'is-filled' : ''} ${focused ? 'is-focused' : ''}`}>
      <div className="q-src-row-info">
        <div className="q-src-row-name">
          <span className="q-src-row-name-text">{name}</span>
          {isNew && <span className="q-src-row-newtag">NEW</span>}
        </div>
        {subMeta && <div className="q-src-row-meta">{subMeta}</div>}
      </div>
      <div className="q-src-row-spark">
        {history.length > 1 && history.some(h => h !== 0) && (
          <Sparkline values={history} width={72} height={22} positive={sparkPositive} />
        )}
      </div>
      <div className="q-src-row-last">
        {row.kind === 'existing'
          ? fmtMoney(lastValue, sourceCcy, sourceCcyConf.locale, true)
          : '—'}
      </div>
      <div className="q-src-row-input-wrap">
        <span className="q-src-row-arrow">{'→'}</span>
        <label className="q-src-row-input">
          <span className="q-src-row-ccy-wrap">
            <select
              className="q-src-row-ccy-select"
              value={ccy}
              onChange={(e) => onCcyChange(e.target.value as CurrencyCode)}
              aria-label={`Currency for ${name}`}
              title={`Currency · ${ccy}`}
            >
              {orderedCurrencies.map(c => (
                <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
              ))}
            </select>
            <span className="q-src-row-ccy" aria-hidden="true">{ccyConf.symbol}</span>
            <ChevronDown size={10} className="q-src-row-ccy-chev" aria-hidden="true" />
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder={'—'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-label={`Value for ${name}`}
          />
        </label>
      </div>
      <div className={`q-src-row-delta ${hasValue ? (delta >= 0 ? 'is-pos' : 'is-neg') : 'is-empty'}`}>
        {hasValue && (
          <>
            <span className="q-src-row-delta-abs">
              {delta >= 0 ? '+' : '−'}
              {fmtMoney(Math.abs(delta), sourceCcy, sourceCcyConf.locale, true)}
            </span>
            <span className="q-src-row-delta-pct">
              {delta >= 0 ? '+' : '−'}{(Math.abs(deltaPct) * 100).toFixed(1)}%
            </span>
            {isCrossCcy && Number.isFinite(fxRate) && (
              <span className="q-src-row-delta-fx" title="Converted at today's FX rate">
                via FX · 1 {ccy} = {fmtMoney(fxRate, sourceCcy, sourceCcyConf.locale, false)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Help-icon tooltip ────────────────────────────────────
// Native `title` was unreliable here: the `?` sits inside a <label>, and
// browsers can suppress a child element's tooltip in favour of the label/
// control's hover semantics. Radix renders via portal, so the tooltip is
// guaranteed to show regardless of the surrounding label.
function InfoTooltip({ label, content }: { label: string; content: string }) {
  // Wrap with a local Provider so the component is self-contained — it works
  // both inside App.tsx (which already mounts a Provider; nesting is fine)
  // and in tests that render the modal without the app shell.
  return (
    <TooltipProvider>
      <UITooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="q-new-src-info"
            aria-label={label}
            tabIndex={-1}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            ?
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-[260px] text-xs leading-snug">
          {content}
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}

// ── Inline new source form ───────────────────────────────
function NewSourceForm({
  defaultCurrency,
  onCancel,
  onAdd,
  allCurrencies,
  existingNamesLower,
  pendingNamesLower,
}: {
  defaultCurrency: CurrencyCode;
  onCancel: () => void;
  onAdd: (spec: { name: string; volatType: string; category: string; initialCcy: CurrencyCode; initialValue: string; isLiquid: boolean }) => void;
  allCurrencies: import('@/lib/currencies').CurrencyConfig[];
  existingNamesLower: Set<string>;
  pendingNamesLower: Set<string>;
}) {
  const [name, setName] = useState('');
  const [volatType, setVolatType] = useState('stable');
  const [category, setCategory] = useState<string>(SOURCE_CATEGORIES[0]);
  const [value, setValue] = useState('');
  const [ccy, setCcy] = useState<CurrencyCode>(defaultCurrency);
  const [isLiquid, setIsLiquid] = useState(true);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const trimmedLower = name.trim().toLowerCase();
  const nameTaken = trimmedLower.length > 0 && (existingNamesLower.has(trimmedLower) || pendingNamesLower.has(trimmedLower));
  const canAdd = name.trim().length > 1 && !nameTaken;
  const ccyConf = CURRENCIES[ccy];

  return (
    <div className="q-new-src-form">
      <div className="q-new-src-form-grid">
        <label className="q-new-src-field q-new-src-field--name">
          <span className="q-new-src-field-label">Name</span>
          <input
            ref={nameRef}
            type="text"
            placeholder="e.g. Bank of America Savings account"
            value={name}
            onChange={e => setName(e.target.value)}
            aria-invalid={nameTaken || undefined}
          />
          {nameTaken && (
            <span className="q-new-src-field-error" role="alert">
              A source called “{name.trim()}” already exists. Pick a different name.
            </span>
          )}
        </label>

        <label className="q-new-src-field">
          <span className="q-new-src-field-label">Category</span>
          <select
            className="q-new-src-freetext"
            value={category}
            onChange={e => setCategory(e.target.value)}
            aria-label="Source category"
          >
            {SOURCE_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="q-new-src-field">
          <span className="q-new-src-field-label">
            Volatility
            <InfoTooltip
              label="What is volatility?"
              content="How much the value tends to swing. Use 'stable' for cash, savings and bonds; 'volatile' for diversified ETFs; 'very_volatile' for single stocks or crypto. Free text — use your own term."
            />
          </span>
          <input
            type="text"
            className="q-new-src-freetext"
            list="q-volatility-suggestions"
            placeholder="Type freely — e.g. stable, volatile, speculative…"
            value={volatType}
            onChange={e => setVolatType(e.target.value)}
          />
          <datalist id="q-volatility-suggestions">
            <option value="stable" />
            <option value="volatile" />
            <option value="very_volatile" />
          </datalist>
        </label>

        <label className="q-new-src-field q-new-src-field--money">
          <span className="q-new-src-field-label">Initial value</span>
          <div className="q-new-src-field-money">
            <span className="q-new-src-field-ccy">{ccyConf.symbol}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={value}
              onChange={e => setValue(e.target.value)}
            />
            <select value={ccy} onChange={e => setCcy(e.target.value as CurrencyCode)} aria-label="Currency">
              {allCurrencies.map(c => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>
        </label>

        <div className="q-new-src-field q-new-src-field--toggle">
          <span className="q-new-src-field-label">
            Liquidity
            <InfoTooltip
              label="What is liquidity?"
              content="Liquid means you can convert it to cash in days, not months. Stocks, ETFs, crypto and savings are liquid. Real estate, pensions and locked-in plans are not."
            />
          </span>
          <div className="q-new-src-field-toggle-wrap">
            <button
              type="button"
              role="switch"
              aria-checked={isLiquid}
              aria-label="Liquid"
              onClick={() => setIsLiquid(v => !v)}
              className={`q-toggle${isLiquid ? ' is-on' : ''}`}
            >
              <span className="q-toggle-track"><span className="q-toggle-thumb" /></span>
            </button>
            <span className="q-new-src-field-toggle-label">
              {isLiquid ? 'Accessible in days' : 'Locked — months or more'}
            </span>
          </div>
        </div>
      </div>
      <div className="q-new-src-form-foot">
        <button type="button" onClick={onCancel} className="q-btn q-btn--ghost q-btn--sm">Cancel</button>
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => onAdd({ name, volatType, category, initialCcy: ccy, initialValue: value, isLiquid })}
          className="q-btn q-btn--primary q-btn--sm"
          style={{ opacity: canAdd ? 1 : 0.5 }}
        >
          Add source
        </button>
      </div>
    </div>
  );
}

// ── Success panel ────────────────────────────────────────
function SaveSuccessPanel({
  saved,
  displayCurrency,
  onDone,
}: {
  saved: SavedRecap;
  displayCurrency: import('@/lib/currencies').CurrencyConfig;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);
  const positive = saved.delta >= 0;
  const fmtFull = (d: Date) => d.toLocaleDateString(displayCurrency.locale, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  return (
    <div className="q-save-success">
      <div className="q-save-success-ring">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle cx="32" cy="32" r="29" fill="none" stroke="var(--accent-soft-raw)" strokeWidth="2" />
          <path
            d="M20 33 L29 42 L46 24"
            fill="none"
            stroke="var(--accent-raw)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ strokeDasharray: 60, strokeDashoffset: 60, animation: 'q-tick-draw 460ms 120ms var(--ease-out) forwards' }}
          />
        </svg>
      </div>
      <div className="q-save-success-title">
        {saved.backfill
          ? `Backfilled ${saved.count} ${saved.count === 1 ? 'source' : 'sources'}`
          : `Snapshot saved — ${saved.count} ${saved.count === 1 ? 'source' : 'sources'}`}
      </div>
      <div className="q-save-success-sub">{fmtFull(saved.date)}</div>
      <div className="q-save-success-stats">
        <div className="q-save-success-stat">
          <div className="q-save-success-stat-label">Net worth</div>
          <div className="q-save-success-stat-val">
            {formatFullCurrency(saved.total, displayCurrency.code, displayCurrency.locale)}
          </div>
        </div>
        <div className="q-save-success-stat">
          <div className="q-save-success-stat-label">Change</div>
          <div className={`q-save-success-stat-val ${positive ? 'is-pos' : 'is-neg'}`}>
            {positive ? '+' : '−'}
            {formatCurrency(Math.abs(saved.delta), displayCurrency.symbol)}
          </div>
        </div>
        {!saved.backfill && (
          <div className="q-save-success-stat">
            <div className="q-save-success-stat-label">Streak</div>
            <div className="q-save-success-stat-val">{saved.newStreak} mo</div>
          </div>
        )}
      </div>
      <div className="q-save-success-foot">
        <button type="button" onClick={onDone} className="q-btn q-btn--ghost q-btn--sm">Done</button>
      </div>
    </div>
  );
}
