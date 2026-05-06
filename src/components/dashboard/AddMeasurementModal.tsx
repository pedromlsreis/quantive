import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { X, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Switch } from '@/components/ui/switch';
import { sanitizeSourceName } from '@/lib/utils';

interface SourceEntry {
  name: string;
  value: string;
  isSeeded?: boolean;
  isLiquid: boolean;
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
      // Look up liquidity from refSources
      const liquidMap = new Map<string, boolean>();
      if (data.refSources) {
        for (const rs of data.refSources) {
          liquidMap.set(rs.idSource.trim(), rs.transferableInDays);
        }
      }
      return Array.from(uniqueSources.entries()).map(([name, value]) => ({
        name,
        value: value === 0 ? '' : String(value),
        isSeeded: true,
        isLiquid: liquidMap.get(name) ?? false,
      }));
    }
    const draft = loadDraft();
    if (draft.length > 0) return draft;
    // First-time user: start with one empty row so they can type immediately.
    return [{ name: '', value: '', isSeeded: false, isLiquid: false }];
  });

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateEntries = (newEntries: SourceEntry[]) => {
    setEntries(newEntries);
    saveDraft(newEntries);
    setValidationError(null);
  };

  const handleAddSource = () => {
    updateEntries([...entries, { name: '', value: '', isSeeded: false, isLiquid: false }]);
  };

  const handleRemoveSource = (index: number) => {
    if (entries[index].isSeeded) {
      setValidationError('Cannot remove pre-filled data sources');
      return;
    }
    const updated = entries.filter((_, i) => i !== index);
    updateEntries(updated);
  };

  const handleChange = (index: number, field: 'name' | 'value', val: string) => {
    if (field === 'name' && entries[index].isSeeded) {
      setValidationError('Cannot edit pre-filled data source names');
      return;
    }
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: val };
    updateEntries(updated);
  };

  const handleToggleLiquid = (index: number) => {
    if (entries[index].isSeeded) return; // liquidity is already set for seeded entries
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

      const measurement: { name: string; value: number; isLiquid: boolean }[] = [];
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

  const today = format(new Date(), 'dd MMM yyyy');

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="mb-1 text-lg font-bold text-foreground">Add New Measurement</h2>
            <p className="mb-1 text-sm text-muted-foreground">
              Record your balances for {today}. All sources from your latest snapshot are pre-filled.
            </p>
            <p className="mb-5 text-sm text-muted-foreground">
              Values are in{' '}
              <span className="font-medium text-foreground">{currency.code} ({currency.symbol})</span>.{' '}
              <button
                onClick={() => { onOpenChange(false); navigate('/settings'); }}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Change in preferences
              </button>
            </p>

            {validationError && (
              <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {validationError}
              </div>
            )}

            {/* Column headers */}
            <div className="mb-2 flex items-center gap-2 px-0.5 text-xs font-medium text-muted-foreground">
              <span className="flex-1">Source name</span>
              <span className="w-32 text-right">Value</span>
              <span className="w-16 text-center">Liquid</span>
              <span className="w-8" />
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {entries.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={entry.name}
                    onChange={e => handleChange(index, 'name', e.target.value)}
                    placeholder="Source name"
                    disabled={entry.isSeeded}
                    className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-60"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={entry.value}
                    onChange={e => handleChange(index, 'value', e.target.value)}
                    placeholder="0"
                    className="w-32 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-right text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
                  <div className="flex w-16 items-center justify-center">
                    <Switch
                      checked={entry.isLiquid}
                      onCheckedChange={() => handleToggleLiquid(index)}
                      disabled={entry.isSeeded}
                      className="scale-90"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveSource(index)}
                    disabled={entry.isSeeded}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                    title={entry.isSeeded ? "Cannot remove pre-filled source" : "Remove source"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddSource}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Add data source
            </button>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || entries.filter(e => e.name.trim() !== '').length === 0}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save measurement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
