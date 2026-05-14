import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';
import { X, Plus, Trash2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { HelpHint } from '@/components/ui/help-hint';
import { sanitizeSourceName } from '@/lib/utils';
import { modalOverlay, modalContent, softSpring, errorBanner } from '@/lib/motion';

interface SourceEntry {
  id: string;
  name: string;
  value: string;
  currency: CurrencyCode;
  isSeeded?: boolean;
  isLiquid: boolean;
  volatType: string;
}

const STORAGE_KEY_ENTRIES = 'add-measurement-draft';

function loadDraft(): SourceEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENTRIES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDraft(entries: SourceEntry[]) {
  localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(entries));
}

export function AddMeasurementModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, addMeasurement, lastCurrencyBySource } = usePortfolio();
  const { currency: displayCurrency, allCurrencies } = useCurrency();
  // New rows default to the user's display currency — that's almost always
  // what they want to record values in. Seeded rows default to the source's
  // own last-known currency below.
  const defaultNewCurrency: CurrencyCode = displayCurrency.code;

  const [entries, setEntries] = useState<SourceEntry[]>(() => {
    if (data && data.facts.length > 0) {
      const latestDate = Math.max(...data.facts.map(f => f.date.getTime()));
      const latestFacts = data.facts.filter(f => f.date.getTime() === latestDate);
      const uniqueSources = new Map<string, number>();
      for (const f of latestFacts) {
        uniqueSources.set(f.idSource.trim(), f.sourceVl);
      }
      const liquidMap = new Map<string, boolean>();
      const volatMap = new Map<string, string>();
      if (data.refSources) {
        for (const rs of data.refSources) {
          liquidMap.set(rs.idSource.trim(), rs.transferableInDays);
          volatMap.set(rs.idSource.trim(), rs.volatType);
        }
      }
      return Array.from(uniqueSources.entries()).map(([name, value]) => ({
        id: crypto.randomUUID(),
        name,
        value: value === 0 ? '' : String(value),
        currency: lastCurrencyBySource.get(name) ?? defaultNewCurrency,
        isSeeded: true,
        isLiquid: liquidMap.get(name) ?? false,
        volatType: volatMap.get(name) ?? '',
      }));
    }
    const draft = loadDraft();
    if (draft.length > 0) return draft.map(d => ({ ...d, id: crypto.randomUUID(), volatType: d.volatType ?? '', currency: d.currency ?? defaultNewCurrency }));
    return [{ id: crypto.randomUUID(), name: '', value: '', currency: defaultNewCurrency, isSeeded: false, isLiquid: false, volatType: '' }];
  });

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  const updateEntries = (newEntries: SourceEntry[]) => {
    setEntries(newEntries);
    saveDraft(newEntries);
    setValidationError(null);
  };

  const handleAddSource = () => {
    updateEntries([...entries, { id: crypto.randomUUID(), name: '', value: '', currency: defaultNewCurrency, isSeeded: false, isLiquid: false, volatType: '' }]);
  };

  const handleRemoveSource = (index: number) => {
    if (entries[index].isSeeded) {
      setValidationError('Cannot remove pre-filled data sources');
      return;
    }
    updateEntries(entries.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: 'name' | 'value' | 'volatType', val: string) => {
    if (field === 'name' && entries[index].isSeeded) {
      setValidationError('Cannot edit pre-filled data source names');
      return;
    }
    if (field === 'volatType' && entries[index].isSeeded) {
      setValidationError('Edit volatility from Settings → Sources');
      return;
    }
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: val };
    updateEntries(updated);
  };

  const handleToggleLiquid = (index: number) => {
    if (entries[index].isSeeded) return;
    const updated = [...entries];
    updated[index] = { ...updated[index], isLiquid: !updated[index].isLiquid };
    updateEntries(updated);
  };

  const handleCurrencyChange = (index: number, code: CurrencyCode) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], currency: code };
    updateEntries(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setValidationError(null);
    try {
      const hasEmptyNames = entries.some(e => e.name.trim() === '' && e.value.trim() !== '');
      if (hasEmptyNames) {
        setValidationError('Source name cannot be empty');
        setSaving(false);
        return;
      }

      const validEntries = entries.filter(e => e.name.trim() !== '');

      for (const e of validEntries) {
        const { error } = sanitizeSourceName(e.name);
        if (error) {
          setValidationError(`"${e.name}": ${error}`);
          setSaving(false);
          return;
        }
      }

      const names = validEntries.map(e => sanitizeSourceName(e.name).value);
      const uniqueNames = new Set(names);

      if (uniqueNames.size !== names.length) {
        setValidationError('Duplicate source names are not allowed');
        setSaving(false);
        return;
      }

      const measurement: { name: string; value: number; currency: CurrencyCode; isLiquid: boolean; volatType: string }[] = [];
      for (const e of validEntries) {
        const raw = e.value.trim();
        let value = 0;
        if (raw !== '') {
          const normalized = raw.replace(',', '.');
          value = parseFloat(normalized);
          if (!Number.isFinite(value)) {
            setValidationError(`"${e.name}": invalid number "${raw}"`);
            setSaving(false);
            return;
          }
        }
        measurement.push({
          name: sanitizeSourceName(e.name).value,
          value,
          currency: e.currency,
          isLiquid: e.isLiquid,
          volatType: e.volatType,
        });
      }

      if (measurement.length === 0) {
        setSaving(false);
        return;
      }

      addMeasurement(measurement);
      localStorage.removeItem(STORAGE_KEY_ENTRIES);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const hasValidEntries = entries.some(e => e.name.trim() !== '');
  const today = format(new Date(), 'dd MMM yyyy');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center"
          aria-modal="true"
          role="dialog"
          aria-labelledby="add-measurement-title"
          variants={modalOverlay}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ background: 'oklch(0% 0 0 / 0.5)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            className="absolute inset-0"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            ref={trapRef}
            className="q-modal relative"
            style={{ width: 'min(560px, calc(100vw - 32px))' }}
            variants={modalContent}
          >
            {/* Header */}
            <div className="q-modal-head">
              <div>
                <div className="q-modal-title" id="add-measurement-title">Add measurement</div>
                <div className="q-modal-sub">Record your balances for {today}. Each source carries its own currency.</div>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="q-icon-btn"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="q-modal-body">
              <AnimatePresence>
                {validationError && (
                  <motion.div
                    variants={errorBanner}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    role="alert"
                    aria-live="polite"
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)',
                      borderRadius: 'var(--r-2)',
                      background: 'var(--negative-bg)',
                      padding: 'var(--s-2) var(--s-3)',
                      marginBottom: 'var(--s-3)',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--negative)',
                    }}
                  >
                    <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>{validationError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div style={{ maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', paddingRight: 2 }}>
                {entries.map((entry, index) => (
                  <motion.div
                    key={entry.id}
                    style={{
                      borderRadius: 'var(--r-3)',
                      border: '1px solid var(--border-raw)',
                      background: 'var(--surface-soft)',
                      padding: 'var(--s-3)',
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={softSpring}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                      <label className="q-input" style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={entry.name}
                          onChange={e => handleChange(index, 'name', e.target.value)}
                          placeholder="Source name"
                          disabled={entry.isSeeded}
                          aria-label="Source name"
                          style={{ opacity: entry.isSeeded ? 0.6 : 1 }}
                        />
                      </label>
                      <label className="q-input" style={{ width: 96, flexShrink: 0 }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={entry.value}
                          onChange={e => handleChange(index, 'value', e.target.value)}
                          placeholder="0"
                          style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
                          aria-label="Source value"
                        />
                      </label>
                      <label className="q-input" style={{ width: 96, flexShrink: 0 }}>
                        <select
                          value={entry.currency}
                          onChange={e => handleCurrencyChange(index, e.target.value as CurrencyCode)}
                          aria-label="Currency"
                          title="Currency this balance is recorded in"
                        >
                          {allCurrencies.map(c => (
                            <option key={c.code} value={c.code} title={c.name}>
                              {c.code} — {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveSource(index)}
                        disabled={entry.isSeeded}
                        className="q-icon-btn"
                        style={{ color: entry.isSeeded ? 'var(--fg-faint)' : undefined }}
                        title={entry.isSeeded ? 'Cannot remove pre-filled source' : 'Remove source'}
                        aria-label="Remove source"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div style={{ marginTop: 'var(--s-2)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px 16px', paddingLeft: 2 }}>
                      <div style={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', gap: 'var(--s-2)' }}>
                        <HelpHint
                          triggerWrapperClassName="inline-flex shrink-0"
                          content={<>Free-text label for how much this source's value fluctuates (e.g. <span className="mono">Stable</span>, <span className="mono">Volatile</span>). Drives the "% volatile" KPI. Leave blank for Unknown.</>}
                        >
                          <button type="button" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontWeight: 500, textDecoration: 'underline dotted', textUnderlineOffset: 4, cursor: 'help', background: 0, border: 0, fontFamily: 'inherit' }}>
                            Volatility
                          </button>
                        </HelpHint>
                        <input
                          type="text"
                          value={entry.volatType}
                          onChange={e => handleChange(index, 'volatType', e.target.value)}
                          placeholder={entry.isSeeded ? '—' : 'e.g. Volatile'}
                          disabled={entry.isSeeded}
                          title={entry.isSeeded ? 'Edit volatility from Settings → Sources' : undefined}
                          style={{
                            minWidth: 0, flex: 1, borderRadius: 'var(--r-1)',
                            border: '1px solid transparent', background: 'transparent',
                            padding: '2px var(--s-2)', fontSize: 'var(--text-xs)',
                            color: 'var(--fg)', fontFamily: 'inherit',
                            transition: `border-color var(--d-fast) var(--ease-soft), background var(--d-fast) var(--ease-soft)`,
                            outline: 'none', opacity: entry.isSeeded ? 0.5 : 1,
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-raw)'; e.currentTarget.style.background = 'var(--surface)'; }}
                          onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 'var(--s-2)' }}>
                        <HelpHint
                          content={<>Whether this source can be transferred to cash within a few days (e.g. savings account vs. pension plan). Drives the "% liquid" KPI.</>}
                        >
                          <button type="button" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontWeight: 500, textDecoration: 'underline dotted', textUnderlineOffset: 4, cursor: 'help', background: 0, border: 0, fontFamily: 'inherit' }}>
                            Liquid
                          </button>
                        </HelpHint>
                        {/* q-toggle */}
                        <button
                          type="button"
                          className={`q-toggle${entry.isLiquid ? ' is-on' : ''}`}
                          onClick={() => handleToggleLiquid(index)}
                          disabled={entry.isSeeded}
                          aria-checked={entry.isLiquid}
                          aria-label="Liquid"
                          role="switch"
                          style={{ opacity: entry.isSeeded ? 0.4 : 1, cursor: entry.isSeeded ? 'not-allowed' : undefined }}
                        >
                          <span className="q-toggle-track"><span className="q-toggle-thumb" /></span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddSource}
                className="q-btn q-btn--ghost q-btn--sm"
                style={{ width: '100%', marginTop: 'var(--s-3)', borderStyle: 'dashed', border: '1px dashed var(--border-raw)', borderRadius: 'var(--r-3)' }}
              >
                <Plus size={14} />
                Add data source
              </button>
            </div>

            {/* Footer */}
            <div className="q-modal-foot">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="q-btn q-btn--ghost q-btn--md"
              >
                Cancel
              </button>
              <motion.button
                type="button"
                onClick={handleSave}
                disabled={saving || !hasValidEntries}
                className="q-btn q-btn--primary q-btn--md"
                style={{ opacity: saving || !hasValidEntries ? 0.5 : 1 }}
                whileHover={{ scale: saving || !hasValidEntries ? 1 : 1.01 }}
                whileTap={{ scale: saving || !hasValidEntries ? 1 : 0.98 }}
              >
                {saving ? (
                  <>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--accent-fg-raw)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                    Saving…
                  </>
                ) : (
                  'Save measurement'
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
