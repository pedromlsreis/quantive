import { useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { X, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface SourceEntry {
  name: string;
  value: string; // string to allow empty input
  isSeeded?: boolean; // flag to mark entries pre-filled from latest snapshot
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
  const { data, addMeasurement, allSources } = usePortfolio();

  const [entries, setEntries] = useState<SourceEntry[]>(() => {
    // Pre-populate with existing sources from latest snapshot
    if (data && data.facts.length > 0) {
      const latestDate = Math.max(...data.facts.map(f => f.date.getTime()));
      const latestFacts = data.facts.filter(f => f.date.getTime() === latestDate);
      const uniqueSources = new Map<string, number>();
      for (const f of latestFacts) {
        uniqueSources.set(f.idSource.trim(), f.sourceVl);
      }
      return Array.from(uniqueSources.entries()).map(([name, value]) => ({
        name,
        value: value === 0 ? '' : String(value),
        isSeeded: true, // mark as seeded - immutable
      }));
    }
    return loadDraft();
  });

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Persist draft to localStorage on every change
  const updateEntries = (newEntries: SourceEntry[]) => {
    setEntries(newEntries);
    saveDraft(newEntries);
    setValidationError(null); // clear error on change
  };

  const handleAddSource = () => {
    updateEntries([...entries, { name: '', value: '', isSeeded: false }]);
  };

  const handleRemoveSource = (index: number) => {
    // Prevent removing seeded entries
    if (entries[index].isSeeded) {
      setValidationError('Cannot remove pre-filled data sources');
      return;
    }
    const updated = entries.filter((_, i) => i !== index);
    updateEntries(updated);
  };

  const handleChange = (index: number, field: 'name' | 'value', val: string) => {
    // Prevent editing seeded entry names
    if (field === 'name' && entries[index].isSeeded) {
      setValidationError('Cannot edit pre-filled data source names');
      return;
    }
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: val };
    updateEntries(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setValidationError(null);
    try {
      // Filter out empty names first for processing
      const validEntries = entries.filter(e => e.name.trim() !== '');
      
      // Check for duplicates using Set
      const names = validEntries.map(e => e.name.trim());
      const uniqueNames = new Set(names);
      
      if (uniqueNames.size !== names.length) {
        setValidationError('Duplicate source names are not allowed');
        setSaving(false);
        return;
      }
      
      // Check for empty names in original entries
      const hasEmptyNames = entries.some(e => e.name.trim() === '' && e.value.trim() !== '');
      if (hasEmptyNames) {
        setValidationError('Source name cannot be empty');
        setSaving(false);
        return;
      }

      // Convert string values to numbers, treating empty as 0
      const measurement = validEntries
        .map(e => ({
          name: e.name.trim(),
          value: e.value.trim() === '' ? 0 : parseFloat(e.value),
        }));

      if (measurement.length === 0) {
        setSaving(false);
        return;
      }

      addMeasurement(measurement);
      // Clear draft on successful save
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
            {/* Close button */}
            <button
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="mb-1 text-lg font-bold text-foreground">Add New Measurement</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Record your balances for {today}. All sources from your latest snapshot are pre-filled.
            </p>

            {/* Validation error display */}
            {validationError && (
              <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {validationError}
              </div>
            )}

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
                    type="number"
                    value={entry.value}
                    onChange={e => handleChange(index, 'value', e.target.value)}
                    placeholder="0"
                    step="0.01"
                    className="w-32 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-right text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
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

            {/* Add new source */}
            <button
              onClick={handleAddSource}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Add data source
            </button>

            {/* Actions */}
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
