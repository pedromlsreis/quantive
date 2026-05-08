import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { X, Plus, Trash2, Settings, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Switch } from '@/components/ui/switch';
import { HelpHint } from '@/components/ui/help-hint';
import { sanitizeSourceName } from '@/lib/utils';
import { modalOverlay, modalContent, softSpring, errorBanner } from '@/lib/motion';

interface SourceEntry {
  id: string;
  name: string;
  value: string;
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
  const { data, addMeasurement } = usePortfolio();
  const { currency } = useCurrency();
  const navigate = useNavigate();

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
        isSeeded: true,
        isLiquid: liquidMap.get(name) ?? false,
        volatType: volatMap.get(name) ?? '',
      }));
    }
    const draft = loadDraft();
    if (draft.length > 0) return draft.map(d => ({ ...d, id: crypto.randomUUID(), volatType: d.volatType ?? '' }));
    return [{ id: crypto.randomUUID(), name: '', value: '', isSeeded: false, isLiquid: false, volatType: '' }];
  });

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateEntries = (newEntries: SourceEntry[]) => {
    setEntries(newEntries);
    saveDraft(newEntries);
    setValidationError(null);
  };

  const handleAddSource = () => {
    updateEntries([...entries, { id: crypto.randomUUID(), name: '', value: '', isSeeded: false, isLiquid: false, volatType: '' }]);
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

      const measurement: { name: string; value: number; isLiquid: boolean; volatType: string }[] = [];
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
  const inputBase =
    'min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          aria-modal="true"
          role="dialog"
          aria-label="Add New Measurement"
          variants={modalOverlay}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="absolute inset-0 bg-background/75 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            className="relative z-10 mx-4 mb-4 w-full max-w-xl sm:mb-0 rounded-2xl border border-border bg-card shadow-2xl"
            variants={modalContent}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">Add New Measurement</h2>
                  <button
                    onClick={() => { onOpenChange(false); navigate('/settings'); }}
                    title="Change currency in preferences"
                    className="group inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  >
                    <span className="text-foreground font-semibold">{currency.symbol}</span>
                    <span>{currency.code}</span>
                    <Settings className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Record your balances for {today}.
                </p>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-4">
              <AnimatePresence>
                {validationError && (
                  <motion.div
                    className="mb-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                    variants={errorBanner}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    role="alert"
                    aria-live="polite"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{validationError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                {entries.map((entry, index) => (
                  <motion.div
                    key={entry.id}
                    className="rounded-xl border border-border bg-secondary/20 p-3"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={softSpring}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={entry.name}
                        onChange={e => handleChange(index, 'name', e.target.value)}
                        placeholder="Source name"
                        disabled={entry.isSeeded}
                        className={`flex-1 ${inputBase}`}
                        aria-label="Source name"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={entry.value}
                        onChange={e => handleChange(index, 'value', e.target.value)}
                        placeholder="0"
                        className={`w-24 shrink-0 text-right sm:w-28 ${inputBase}`}
                        aria-label="Source value"
                      />
                      <button
                        onClick={() => handleRemoveSource(index)}
                        disabled={entry.isSeeded}
                        className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                        title={entry.isSeeded ? 'Cannot remove pre-filled source' : 'Remove source'}
                        aria-label="Remove source"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 pl-0.5">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <HelpHint
                          triggerWrapperClassName="inline-flex shrink-0"
                          content={<>Free-text label for how much this source's value fluctuates (e.g. <span className="font-mono">Stable</span>, <span className="font-mono">Volatile</span>). Drives the "% volatile" KPI. Leave blank for Unknown.</>}
                        >
                          <button
                            type="button"
                            className="cursor-help text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-4 focus:outline-none focus-visible:text-foreground"
                          >
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
                          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-border focus:bg-card focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                        />
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <HelpHint
                          content={<>Whether this source can be transferred to cash within a few days (e.g. savings account vs. pension plan). Drives the "% liquid" KPI.</>}
                        >
                          <button
                            type="button"
                            className="cursor-help text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-4 focus:outline-none focus-visible:text-foreground"
                          >
                            Liquid
                          </button>
                        </HelpHint>
                        <Switch
                          checked={entry.isLiquid}
                          onCheckedChange={() => handleToggleLiquid(index)}
                          disabled={entry.isSeeded}
                          className="scale-90"
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <button
                onClick={handleAddSource}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <Plus className="h-3.5 w-3.5" />
                Add data source
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                Cancel
              </button>
              <motion.button
                onClick={handleSave}
                disabled={saving || !hasValidEntries}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                {saving ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
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
