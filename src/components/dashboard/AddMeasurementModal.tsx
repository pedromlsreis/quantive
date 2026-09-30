import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { X, Plus, ChevronDown, Info } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useModalLayer } from '@/hooks/useModalLayer';
import { useFormat } from '@/hooks/useFormat';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';
import { useFxRates } from '@/hooks/useFxRates';
import { Sparkline } from '@/components/charts/Sparkline';
import { Notice } from '@/components/ui/Notice';
import { HelpHint } from '@/components/ui/help-hint';
import { Delta } from '@/components/dashboard/Delta';
import { sanitizeSourceName, parseLocalizedNumber, toEditable } from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import { ago, formatDate, formatDateShort, money, pct, type FmtCtx } from '@/lib/formatters';
import { CURRENCIES, type CurrencyConfig } from '@/lib/currencies';
import { SOURCE_CATEGORIES } from '@/lib/categories';
import { SNAPSHOT_SAVED_EVENT } from '@/lib/appEvents';
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

type Row =
  | { kind: 'existing'; meta: ExistingSourceMeta }
  | { kind: 'new'; source: NewSource };

/** The new-source form's fields, held here so Save can include or refuse them. */
interface SourceDraft {
  name: string;
  volatType: string;
  category: string;
  value: string;
  ccy: CurrencyCode;
  isLiquid: boolean;
}

const emptyDraft = (ccy: CurrencyCode): SourceDraft => ({
  name: '', volatType: 'Non-volatile', category: SOURCE_CATEGORIES[0], value: '', ccy, isLiquid: true,
});

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

function parseEntry(val: string | undefined): number | null {
  // Blank is "not entered", never 0: parseLocalizedNumber('') returns 0.
  if (!val || val.trim() === '') return null;
  const parsed = parseLocalizedNumber(val);
  return typeof parsed === 'number' ? parsed : null;
}

const coarsePointer = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function AddMeasurementModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const { data, addMeasurement, allSnapshots, lastCurrencyBySource } = usePortfolio();
  // Drafts are plaintext (source names + in-progress values), so only guests,
  // who already keep their data in localStorage, get one. Signed-in drafts
  // live in component state (encryption.md §8.3).
  const persistDraft = !user;
  const { currency: displayCurrency, allCurrencies } = useCurrency();
  const { convertAt } = useFxRates();
  const f = useFormat();
  const { pathname } = useLocation();
  const locale = f.ctx.locale;

  const todayIso = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const today = useMemo(() => {
    const [y, m, d] = todayIso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [todayIso]);

  const [date, setDate] = useState<string>(todayIso);
  const [entries, setEntries] = useState<Record<string, string>>({});
  // Last value per existing source (native currency) captured on open, so
  // carried rows can be told apart from edited ones.
  const [baseline, setBaseline] = useState<Record<string, number>>({});
  const [ccyOverrides, setCcyOverrides] = useState<Record<string, CurrencyCode>>({});
  const [newSources, setNewSources] = useState<NewSource[]>([]);
  const [addingNew, setAddingNewState] = useState(false);
  const [draft, setDraft] = useState<SourceDraft>(() => emptyDraft(displayCurrency.code));
  const setAddingNew = useCallback((open: boolean) => {
    if (open) setDraft(emptyDraft(displayCurrency.code));
    setAddingNewState(open);
  }, [displayCurrency.code]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Paused sources are excluded from the rows: their last value is held.
  const pausedSourceIds = useMemo(() => {
    const s = new Set<string>();
    for (const rs of data?.refSources ?? []) {
      if (rs.isPaused) s.add(rs.idSource.trim());
    }
    return s;
  }, [data]);

  // Every existing name (paused too), to block duplicates in NewSourceForm.
  const existingNamesLower = useMemo(() => {
    const s = new Set<string>();
    for (const rs of data?.refSources ?? []) s.add(rs.idSource.trim().toLowerCase());
    for (const fact of data?.facts ?? []) s.add(fact.idSource.trim().toLowerCase());
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
    for (const fact of data.facts) {
      const key = fact.idSource.trim();
      if (pausedSourceIds.has(key)) continue;
      const arr = byId.get(key);
      if (arr) arr.push(fact); else byId.set(key, [fact]);
    }
    const result: ExistingSourceMeta[] = [];
    for (const [id, rows] of byId.entries()) {
      const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
      const latest = sorted[sorted.length - 1];
      result.push({
        idSource: id,
        lastValue: latest.sourceVl,
        lastCurrency: latest.currency,
        volatType: volatMap.get(id) ?? '',
        category: categoryMap.get(id) ?? '',
        isLiquid: liquidMap.get(id) ?? false,
        history: sorted.slice(-12).map((r) => r.sourceVl),
      });
    }
    return result.sort((a, b) => b.lastValue - a.lastValue);
  }, [data, pausedSourceIds]);

  // Each snapshot is a full restatement, so paused sources are restated
  // invisibly at their last value on save; omitting them would drop their
  // balance from net worth.
  const pausedRestatement = useMemo(() => {
    if (!data) return [] as { name: string; value: number; currency: CurrencyCode; isLiquid: boolean; volatType: string; category?: string }[];
    const latestBySource = new Map<string, FactRow>();
    for (const fact of data.facts) {
      const key = fact.idSource.trim();
      if (!pausedSourceIds.has(key)) continue;
      const prev = latestBySource.get(key);
      if (!prev || fact.date.getTime() > prev.date.getTime()) latestBySource.set(key, fact);
    }
    const metaById = new Map((data.refSources ?? []).map((rs) => [rs.idSource.trim(), rs]));
    return [...latestBySource.entries()].map(([id, fact]) => {
      const meta = metaById.get(id);
      return {
        name: id,
        value: fact.sourceVl,
        currency: fact.currency,
        isLiquid: meta?.transferableInDays ?? false,
        volatType: meta?.volatType ?? '',
        category: meta?.category || undefined,
      };
    });
  }, [data, pausedSourceIds]);

  const allRows: Row[] = useMemo(() => [
    ...existingSources.map((meta): Row => ({ kind: 'existing', meta })),
    ...newSources.map((source): Row => ({ kind: 'new', source })),
  ], [existingSources, newSources]);

  // Initialised to false so a modal that mounts already open still seeds.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Signed-in users never persist a draft; skipping the read stops a
      // guest-era draft replaying after sign-up.
      const d = persistDraft ? loadDraft() : {};
      // Carry-forward: each existing source starts at its last value, so a
      // monthly update is "change what moved". A restored guest draft wins.
      const carried: Record<string, string> = {};
      const base: Record<string, number> = {};
      for (const s of existingSources) {
        // Written in the user's number locale, whatever the source's currency.
        carried[s.idSource] = toEditable(s.lastValue, locale);
        base[s.idSource] = s.lastValue;
      }
      setDate(d.date && d.date <= todayIso ? d.date : todayIso);
      setEntries({ ...carried, ...(d.entries ?? {}) });
      setBaseline(base);
      setCcyOverrides(d.ccyOverrides ?? {});
      setNewSources(d.newSources ?? []);
      // Nothing to carry: the first thing to do is name a source.
      setAddingNew(existingSources.length === 0 && (d.newSources ?? []).length === 0);
      setValidationError(null);
      setConfirmDiscard(false);
    }
    prevOpenRef.current = open;
  }, [open, persistDraft, todayIso, existingSources, locale, setAddingNew]);

  useEffect(() => {
    if (!open || !persistDraft) return;
    saveDraft({ date, entries, ccyOverrides, newSources });
  }, [open, persistDraft, date, entries, ccyOverrides, newSources]);

  const isBackfill = date !== todayIso;
  const measurementDate = useMemo(() => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [date]);

  const rowKey = useCallback((r: Row) => (r.kind === 'existing' ? r.meta.idSource : r.source.id), []);
  const rowSourceCcy = useCallback(
    (r: Row): CurrencyCode => (r.kind === 'existing' ? r.meta.lastCurrency : r.source.defaultCurrency),
    [],
  );
  const ccyFor = useCallback(
    (r: Row): CurrencyCode =>
      ccyOverrides[rowKey(r)] ??
      (r.kind === 'existing' ? lastCurrencyBySource.get(r.meta.idSource) ?? r.meta.lastCurrency : r.source.defaultCurrency),
    [ccyOverrides, lastCurrencyBySource, rowKey],
  );

  const filledCount = useMemo(
    () => allRows.filter((r) => parseEntry(entries[rowKey(r)]) !== null).length,
    [allRows, entries, rowKey],
  );

  // A row has changed when its value left the carried baseline, its currency
  // switched, it was cleared, or it is new. Carried rows still save.
  const hasCarryForward = Object.keys(baseline).length > 0;
  const changedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) {
      const key = rowKey(r);
      if (r.kind === 'new') { s.add(key); continue; }
      const overrode = ccyOverrides[key] != null && ccyOverrides[key] !== r.meta.lastCurrency;
      const v = parseEntry(entries[key]);
      const base = baseline[key];
      if (overrode || v == null || base == null || Math.abs(v - base) > 0.005) s.add(key);
    }
    return s;
  }, [allRows, entries, ccyOverrides, baseline, rowKey]);
  const changedCount = changedKeys.size;
  const unchangedCount = Math.max(0, filledCount - changedCount);

  // Each row's change, typed currency → source currency → display currency.
  const totalDelta = useMemo(() => {
    let acc = 0;
    for (const r of allRows) {
      const v = parseEntry(entries[rowKey(r)]);
      if (v == null) continue;
      const sourceCcy = rowSourceCcy(r);
      const last = r.kind === 'existing' ? r.meta.lastValue : 0;
      const typedInNative = convertAt(v, ccyFor(r), sourceCcy, today);
      const deltaInNative = (Number.isFinite(typedInNative) ? typedInNative : 0) - last;
      const deltaInDisplay = convertAt(deltaInNative, sourceCcy, displayCurrency.code, today);
      acc += Number.isFinite(deltaInDisplay) ? deltaInDisplay : 0;
    }
    return acc;
  }, [allRows, entries, ccyFor, rowKey, rowSourceCcy, convertAt, today, displayCurrency.code]);

  const latestSnapshot = allSnapshots.length > 0 ? allSnapshots[allSnapshots.length - 1] : null;
  const projectedTotal = (latestSnapshot?.total ?? 0) + totalDelta;

  const pendingNamesLower = useMemo(() => new Set(newSources.map((src) => src.name.trim().toLowerCase())), [newSources]);
  const draftNameLower = draft.name.trim().toLowerCase();
  const draftNameTaken = draftNameLower.length > 0 && (existingNamesLower.has(draftNameLower) || pendingNamesLower.has(draftNameLower));
  const draftCanAdd = draft.name.trim().length > 1 && !draftNameTaken;
  // A form the user has started counts as pending work for Save.
  const draftStarted = addingNew && (draft.name.trim() !== '' || draft.value.trim() !== '');

  const requestClose = useCallback(() => {
    // A second dismiss while the prompt shows means "keep editing".
    if (confirmDiscard) { setConfirmDiscard(false); return; }
    // Signed-in drafts are not kept, so closing with edits asks first.
    if (user && changedCount > 0) { setConfirmDiscard(true); return; }
    onOpenChange(false);
  }, [user, changedCount, confirmDiscard, onOpenChange]);

  // The prompt replaces the button that asked for it, so focus moves with it.
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmDiscard) keepEditingRef.current?.focus(); }, [confirmDiscard]);

  useModalLayer(open, requestClose);
  // Annotated: initialFocus reads trapRef, which would otherwise make its type circular.
  const trapRef: React.RefObject<HTMLDivElement> = useFocusTrap<HTMLDivElement>(open, {
    initialFocus: () => {
      const root = trapRef.current;
      const nameField = root?.querySelector<HTMLInputElement>('.q-new-src-form input');
      if (nameField) return nameField;
      // On touch, focusing an input would open the keyboard over the list.
      if (coarsePointer()) return titleRef.current;
      const first = root?.querySelector<HTMLInputElement>('.q-src-row input[inputmode="decimal"]');
      first?.select();
      return first;
    },
  });

  function setEntryFor(r: Row, val: string) {
    setEntries((prev) => {
      const next = { ...prev };
      const k = rowKey(r);
      if (val === '') delete next[k];
      else next[k] = val;
      return next;
    });
    setValidationError(null);
    setConfirmDiscard(false);
  }

  function removeNewSource(id: string) {
    const drop = <T,>(prev: Record<string, T>) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    };
    setNewSources((prev) => prev.filter((s) => s.id !== id));
    setEntries(drop);
    setCcyOverrides(drop);
    setValidationError(null);
  }

  function sourceFromDraft(): NewSource {
    return {
      id: 'new:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: draft.name.trim(),
      volatType: draft.volatType.trim(),
      category: draft.category.trim(),
      isLiquid: draft.isLiquid,
      defaultCurrency: draft.ccy,
    };
  }

  function addCustomSource() {
    if (!draftCanAdd) return;
    const src = sourceFromDraft();
    setNewSources((prev) => [...prev, src]);
    setCcyOverrides((prev) => ({ ...prev, [src.id]: draft.ccy }));
    if (draft.value.trim()) setEntries((prev) => ({ ...prev, [src.id]: draft.value.trim() }));
    setAddingNew(false);
  }

  function fail(message: string) {
    setValidationError(message);
    setSaving(false);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function handleSave() {
    if (saving || (allRows.length === 0 && !draftStarted)) return;
    // A started new-source form is either finished and saved with the rest,
    // or refused: saving without it would silently drop what was typed.
    let rows = allRows;
    let values = entries;
    let draftDisplay = 0;
    if (draftStarted) {
      const draftValue = parseEntry(draft.value);
      if (!draftCanAdd || draftValue == null) {
        fail('Finish or cancel the new source first.');
        return;
      }
      const src = sourceFromDraft();
      rows = [...allRows, { kind: 'new', source: src }];
      values = { ...entries, [src.id]: draft.value.trim() };
      const converted = convertAt(draftValue, draft.ccy, displayCurrency.code, today);
      draftDisplay = Number.isFinite(converted) ? converted : 0;
    }
    if (!rows.some((r) => parseEntry(values[rowKey(r)]) != null)) {
      fail('Enter a value for at least one source.');
      return;
    }
    setSaving(true);
    setValidationError(null);
    type Entry = { name: string; value: number; currency: CurrencyCode; isLiquid: boolean; volatType: string; category?: string };
    const payload: Entry[] = [];
    const seen = new Set<string>();
    let newSourceCount = 0;

    for (const r of rows) {
      const num = parseEntry(values[rowKey(r)]);
      if (num == null) continue;
      if (r.kind === 'new') newSourceCount++;
      const name = r.kind === 'existing' ? r.meta.idSource : r.source.name;
      const { value: cleanName, error: nameErr } = sanitizeSourceName(name);
      if (nameErr) return fail(`"${name}": ${nameErr}`);
      if (seen.has(cleanName)) return fail(`"${cleanName}" appears more than once. Keep one row per source.`);
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

    for (const p of pausedRestatement) {
      const { value: cleanName } = sanitizeSourceName(p.name);
      if (!cleanName || seen.has(cleanName)) continue;
      seen.add(cleanName);
      payload.push({ ...p, name: cleanName });
    }

    if (isBackfill) addMeasurement(payload, { date: measurementDate });
    else addMeasurement(payload);
    if (newSourceCount > 0) analytics.sourceCreated({ count: newSourceCount });
    try { localStorage.removeItem(STORAGE_KEY_ENTRIES); } catch { /* private mode */ }

    // An entry on or after the latest date becomes the new total, which the
    // overview hero shows and announces. A first entry has no hero yet (the
    // empty state is replaced), so it gets the toast, as does any other page.
    const becomesLatest = !latestSnapshot || measurementDate.getTime() >= startOfDay(latestSnapshot.date).getTime();
    if (becomesLatest) window.dispatchEvent(new Event(SNAPSHOT_SAVED_EVENT));
    if (!becomesLatest) toast.success(`Entry for ${formatDate(measurementDate)} saved`);
    else if (!latestSnapshot || pathname !== '/dashboard') {
      toast.success('Entry saved', { description: `Net worth ${f.money(projectedTotal + draftDisplay)}` });
    }

    setSaving(false);
    onOpenChange(false);
  }

  // Enter moves to the next value; on the last one it saves. Ctrl/Cmd+Enter saves anywhere.
  function onValueKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const inputs = Array.from(trapRef.current?.querySelectorAll<HTMLInputElement>('.q-src-row input[inputmode="decimal"]') ?? []);
    const next = inputs[inputs.indexOf(e.currentTarget) + 1];
    if (next) { next.focus(); next.select(); } else handleSave();
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  if (!open) return null;

  const sub = latestSnapshot
    ? `Last entry ${formatDate(latestSnapshot.date)}, ${ago(latestSnapshot.date, today)}.${
        existingSources.length > 0
          ? ` ${existingSources.length} ${existingSources.length === 1 ? 'source' : 'sources'} pre-filled; change what moved.`
          : ''}`
    : "Your first entry. Add each account with today's balance.";
  const deltaTone = f.tone(totalDelta);

  return createPortal(
    <div
      className="q-modal-backdrop q-add-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div
        ref={trapRef}
        className="q-modal q-add-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-measurement-title"
        aria-describedby="add-measurement-sub"
        onKeyDown={handleKeyDown}
      >
        <div className="q-modal-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="q-modal-title" id="add-measurement-title" ref={titleRef} tabIndex={-1}>Add entry</h2>
            <p className="q-modal-sub" id="add-measurement-sub">{sub}</p>
          </div>
          <button type="button" onClick={requestClose} className="q-icon-btn" aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="q-modal-body">
          {validationError && (
            <Notice variant="negative" role="alert" style={{ marginBottom: 'var(--s-4)' }}>
              <div ref={errorRef} tabIndex={-1} style={{ outline: 'none' }}>{validationError}</div>
            </Notice>
          )}

          <span className="q-add-label" id="add-date-label">Date</span>
          <DateField date={date} todayIso={todayIso} onChange={setDate} />

          <div className="q-source-list-head">
            <span className="q-add-label">Sources</span>
            {hasCarryForward && (
              <span className="q-source-list-count" data-testid="composer-count">
                {changedCount} changed, {unchangedCount} unchanged
              </span>
            )}
          </div>

          <div className="q-source-list">
            {allRows.map((r) => (
              <SourceEntryRow
                key={rowKey(r)}
                rowId={rowKey(r)}
                row={r}
                value={entries[rowKey(r)] ?? ''}
                ccy={ccyFor(r)}
                sourceCcy={rowSourceCcy(r)}
                changed={changedKeys.has(rowKey(r))}
                locale={f.ctx.locale}
                onChange={(v) => setEntryFor(r, v)}
                onCcyChange={(c) => setCcyOverrides((prev) => ({ ...prev, [rowKey(r)]: c }))}
                onKeyDown={onValueKeyDown}
                onRemove={r.kind === 'new' ? () => removeNewSource(r.source.id) : undefined}
                convertAt={convertAt}
                today={today}
                allCurrencies={allCurrencies}
                displayCurrency={displayCurrency}
              />
            ))}

            {addingNew ? (
              <NewSourceForm
                draft={draft}
                onChange={(patch) => { setDraft((d) => ({ ...d, ...patch })); setValidationError(null); }}
                nameTaken={draftNameTaken}
                canAdd={draftCanAdd}
                onCancel={() => setAddingNew(false)}
                onAdd={addCustomSource}
                allCurrencies={allCurrencies}
              />
            ) : (
              <button type="button" className="q-add-source-row" onClick={() => setAddingNew(true)}>
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                Add a new source
              </button>
            )}
          </div>
        </div>

        <div className="q-add-summary">
          <span className="q-add-label">
            {isBackfill ? `Net worth on ${formatDate(measurementDate)}` : 'Net worth after saving'}
          </span>
          {filledCount === 0 ? (
            <p className="q-add-summary-empty">Enter a value to see the new total.</p>
          ) : (
            <div className="q-add-summary-vals">
              <span className="q-add-summary-fig">
                <span className="q-single-rule" aria-hidden="true" />
                <span className="q-add-summary-total num">{f.money(projectedTotal)}</span>
              </span>
              {latestSnapshot && !isBackfill && (
                <span className="q-add-summary-delta">
                  {deltaTone === 'zero'
                    ? <span className="q-add-nochange">No change</span>
                    : <Delta text={f.money(totalDelta, { signed: true })} tone={deltaTone} />}
                  <span className="q-hero-delta-when">since {formatDateShort(latestSnapshot.date, today)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {confirmDiscard ? (
          <div className="q-modal-foot q-modal-foot--split">
            <span className="q-add-discard" role="alert">
              {`Discard ${changedCount} ${changedCount === 1 ? 'change' : 'changes'}?`}
            </span>
            <button ref={keepEditingRef} type="button" onClick={() => setConfirmDiscard(false)} className="q-btn q-btn--secondary q-btn--md">
              Keep editing
            </button>
            <button type="button" onClick={() => onOpenChange(false)} className="q-btn q-btn--danger q-btn--md">
              Discard
            </button>
          </div>
        ) : (
          <div className="q-modal-foot q-modal-foot--split">
            <span className="q-modal-shortcut">{isMac() ? '⌘ Enter to save' : 'Ctrl+Enter to save'}</span>
            <button type="button" onClick={requestClose} className="q-btn q-btn--ghost q-btn--md">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={(allRows.length === 0 && !draftStarted) || saving}
              className="q-btn q-btn--primary q-btn--md"
            >
              {saving ? 'Saving…' : 'Save entry'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** An exchange rate to 4 significant figures: 1 JPY is €0.006152, not €0.01. */
function fxText(rate: number, ctx: FmtCtx): string {
  return new Intl.NumberFormat(ctx.locale, {
    style: 'currency', currency: ctx.currency, maximumSignificantDigits: 4, minimumSignificantDigits: 4,
  }).format(rate);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ── Date ─────────────────────────────────────────────────
// The native input sits transparent over a formatted label, so the picker is
// the platform's but the date reads "29 Sep 2026" in every locale.
function DateField({ date, todayIso, onChange }: { date: string; todayIso: string; onChange: (v: string) => void }) {
  const [y, m, d] = date.split('-').map(Number);
  const isToday = date === todayIso;
  return (
    <div className="q-date-field">
      <span aria-hidden="true">{isToday ? `Today, ${formatDate(new Date(y, m - 1, d))}` : formatDate(new Date(y, m - 1, d))}</span>
      {!isToday && <span className="q-tag" aria-hidden="true">Past date</span>}
      <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      <input
        type="date"
        aria-labelledby="add-date-label"
        aria-describedby={isToday ? undefined : 'add-date-past'}
        value={date}
        max={todayIso}
        onClick={(e) => {
          const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
          try { el.showPicker?.(); } catch { /* not user-activated */ }
        }}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v && v <= todayIso ? v : todayIso);
        }}
      />
      {!isToday && <span id="add-date-past" className="sr-only">Past date: this entry is added to your history</span>}
    </div>
  );
}

// ── Per-source row ───────────────────────────────────────
function SourceEntryRow({
  rowId, row, value, ccy, sourceCcy, changed, locale, onChange, onCcyChange, onKeyDown, onRemove,
  convertAt, today, allCurrencies, displayCurrency,
}: {
  rowId: string;
  row: Row;
  value: string;
  ccy: CurrencyCode;
  sourceCcy: CurrencyCode;
  changed: boolean;
  locale: string;
  onChange: (v: string) => void;
  onCcyChange: (c: CurrencyCode) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onRemove?: () => void;
  convertAt: (amount: number, from: CurrencyCode, to: CurrencyCode, date: Date) => number;
  today: Date;
  allCurrencies: CurrencyConfig[];
  displayCurrency: CurrencyConfig;
}) {
  const isNew = row.kind === 'new';
  const name = row.kind === 'existing' ? row.meta.idSource : row.source.name;
  const subMeta = row.kind === 'existing' ? row.meta.category : row.source.category;
  const lastValue = row.kind === 'existing' ? row.meta.lastValue : 0;
  const history = row.kind === 'existing' ? row.meta.history : [];
  const deltaId = `delta-${rowId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const sourceCtx: FmtCtx = { currency: sourceCcy, locale };

  const parsed = parseEntry(value);
  const hasValue = parsed != null;
  const typedInNative = hasValue ? convertAt(parsed, ccy, sourceCcy, today) : 0;
  const delta = hasValue ? (Number.isFinite(typedInNative) ? typedInNative : 0) - lastValue : 0;
  const deltaPct = hasValue && lastValue !== 0 ? (delta / Math.abs(lastValue)) * 100 : 0;
  const isCrossCcy = ccy !== sourceCcy;
  const fxRate = isCrossCcy ? convertAt(1, ccy, sourceCcy, today) : 1;
  const tone = Math.abs(delta) < 0.005 ? 'zero' : delta > 0 ? 'pos' : 'neg';
  // Unchanged and new rows carry no delta: "New" says it, and a carried row has nothing to report.
  const showDelta = hasValue && changed && !isNew;
  const deltaClass = !hasValue ? 'is-empty' : !showDelta ? 'is-quiet' : `is-${tone}`;

  const spark = history.length > 1 ? history : [];
  const sparkTone = spark.length > 1 ? (spark[spark.length - 1] > spark[0] ? 'pos' : spark[spark.length - 1] < spark[0] ? 'neg' : 'zero') : 'zero';

  // The chosen, source and display currencies first, then the rest by name.
  const orderedCurrencies = useMemo(() => {
    const seen = new Set<CurrencyCode>();
    const out: CurrencyConfig[] = [];
    const push = (code: CurrencyCode) => {
      if (seen.has(code)) return;
      const cfg = allCurrencies.find((c) => c.code === code);
      if (cfg) { out.push(cfg); seen.add(code); }
    };
    push(ccy);
    push(sourceCcy);
    push(displayCurrency.code);
    for (const c of [...allCurrencies].sort((a, b) => a.name.localeCompare(b.name))) push(c.code);
    return out;
  }, [allCurrencies, ccy, sourceCcy, displayCurrency.code]);

  return (
    <div className={`q-src-row${hasValue ? ' is-filled' : ''}`}>
      <div className="q-src-row-info">
        <div className="q-src-row-name">
          <span className="q-src-row-name-text">{name}</span>
          {isNew && <span className="q-tag">New</span>}
          {isNew && onRemove && (
            <button type="button" className="q-src-row-remove" onClick={onRemove} aria-label={`Remove ${name}`}>
              <X size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {subMeta && <div className="q-src-row-meta">{subMeta}</div>}
      </div>
      <div className="q-src-row-spark">
        {spark.length > 1 && <Sparkline values={spark} tone={sparkTone} />}
      </div>
      <div className="q-src-row-last">
        {row.kind === 'existing' ? money(lastValue, sourceCtx) : ''}
      </div>
      <label className="q-src-row-input">
        <span className="q-src-row-ccy-wrap">
          <select
            className="q-src-row-ccy-select"
            value={ccy}
            onChange={(e) => onCcyChange(e.target.value as CurrencyCode)}
            aria-label={`Currency for ${name}`}
          >
            {orderedCurrencies.map((c) => (
              <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
            ))}
          </select>
          <span className="q-src-row-ccy" aria-hidden="true">{CURRENCIES[ccy].symbol}</span>
          <ChevronDown size={12} strokeWidth={1.75} className="q-src-row-ccy-chev" aria-hidden="true" />
        </span>
        <input
          type="text"
          inputMode="decimal"
          enterKeyHint="next"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={`Value for ${name}`}
          aria-describedby={showDelta ? deltaId : undefined}
        />
      </label>
      <div id={deltaId} className={`q-src-row-delta ${deltaClass}`}>
        {showDelta && (tone === 'zero' ? (
          <span>No change</span>
        ) : (
          <>
            <span className="q-src-row-delta-abs">{money(delta, sourceCtx, { signed: true, compact: true })}</span>
            {lastValue !== 0 && (
              <span className="q-src-row-delta-pct">{pct(deltaPct, sourceCtx, { signed: true })}</span>
            )}
          </>
        ))}
        {hasValue && isCrossCcy && Number.isFinite(fxRate) && (
          <span className="q-src-row-delta-fx">
            {`At 1 ${ccy} = ${fxText(fxRate, sourceCtx)}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Field help ───────────────────────────────────────────
function InfoTooltip({ label, content }: { label: string; content: string }) {
  return (
    <HelpHint side="top" content={content}>
      <button
        type="button"
        className="q-new-src-info"
        aria-label={label}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <Info size={16} strokeWidth={1.75} />
      </button>
    </HelpHint>
  );
}

// ── Inline new source form ───────────────────────────────
// Controlled: the composer holds the fields so Save can include or refuse them.
function NewSourceForm({
  draft,
  onChange,
  nameTaken,
  canAdd,
  onCancel,
  onAdd,
  allCurrencies,
}: {
  draft: SourceDraft;
  onChange: (patch: Partial<SourceDraft>) => void;
  nameTaken: boolean;
  canAdd: boolean;
  onCancel: () => void;
  onAdd: () => void;
  allCurrencies: CurrencyConfig[];
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  // Enter in a text field adds the source; it never saves the whole entry.
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); e.stopPropagation(); onAdd(); }
  };

  return (
    <div className="q-new-src-form">
      <div className="q-new-src-form-grid">
        <label className="q-new-src-field q-new-src-field--name">
          <span className="q-new-src-field-label">Name</span>
          <input
            ref={nameRef}
            type="text"
            placeholder="e.g. Savings account"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            onKeyDown={onEnter}
            aria-invalid={nameTaken || undefined}
          />
          {nameTaken && (
            <span className="q-new-src-field-error" role="alert">
              {`A source called "${draft.name.trim()}" already exists. Pick another name.`}
            </span>
          )}
        </label>

        <label className="q-new-src-field">
          <span className="q-new-src-field-label">Category</span>
          <select value={draft.category} onChange={(e) => onChange({ category: e.target.value })} aria-label="Source category">
            {SOURCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <div className="q-new-src-field">
          <span className="q-new-src-field-label">
            <label htmlFor="new-src-volatility">Volatility</label>
            <InfoTooltip
              label="What is volatility?"
              content="How much the value tends to swing. Non-volatile for cash, savings and bonds; volatile for funds; highly volatile for single shares or crypto."
            />
          </span>
          <input
            id="new-src-volatility"
            type="text"
            list="q-volatility-suggestions"
            placeholder="e.g. Non-volatile, Volatile"
            value={draft.volatType}
            onChange={(e) => onChange({ volatType: e.target.value })}
            onKeyDown={onEnter}
          />
          <datalist id="q-volatility-suggestions">
            {/* The same three names Allocations groups by. */}
            <option value="Non-volatile" />
            <option value="Volatile" />
            <option value="Highly volatile" />
          </datalist>
        </div>

        <label className="q-new-src-field q-new-src-field--money">
          <span className="q-new-src-field-label">Value today</span>
          <span className="q-new-src-field-money">
            <span className="q-new-src-field-ccy" aria-hidden="true">{CURRENCIES[draft.ccy].symbol}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={draft.value}
              onChange={(e) => onChange({ value: e.target.value })}
              onKeyDown={onEnter}
            />
            <select value={draft.ccy} onChange={(e) => onChange({ ccy: e.target.value as CurrencyCode })} aria-label="Currency">
              {allCurrencies.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </span>
        </label>

        <div className="q-new-src-field q-new-src-field--toggle">
          <span className="q-new-src-field-label">
            Liquidity
            <InfoTooltip
              label="What is liquidity?"
              content="Liquid means you can turn it into cash within days. Shares, funds, crypto and savings are liquid; property, pensions and locked-in plans are not."
            />
          </span>
          <span className="q-new-src-field-toggle-wrap">
            <span className="q-new-src-field-toggle-label">{draft.isLiquid ? 'Cash within days' : 'Months or longer'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.isLiquid}
              aria-label="Liquid"
              onClick={() => onChange({ isLiquid: !draft.isLiquid })}
              className={`q-toggle${draft.isLiquid ? ' is-on' : ''}`}
            >
              <span className="q-toggle-track"><span className="q-toggle-thumb" /></span>
            </button>
          </span>
        </div>
      </div>
      <div className="q-new-src-form-foot">
        <button type="button" onClick={onCancel} className="q-btn q-btn--ghost q-btn--md">Cancel</button>
        <button type="button" disabled={!canAdd} onClick={onAdd} className="q-btn q-btn--secondary q-btn--md">
          Add source
        </button>
      </div>
    </div>
  );
}
