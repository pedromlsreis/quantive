import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { X, Plus, Trash2, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { sanitizeSourceName } from '@/lib/utils';

interface SourceEntry {
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
      // Look up liquidity + volatility from refSources
      const liquidMap = new Map<string, boolean>();
      const volatMap = new Map<string, string>();
      if (data.refSources) {
        for (const rs of data.refSources) {
          liquidMap.set(rs.idSource.trim(), rs.transferableInDays);
          volatMap.set(rs.idSource.trim(), rs.volatType);
        }
      }
      return Array.from(uniqueSources.entries()).map(([name, value]) => ({
        name,
        value: value === 0 ? '' : String(value),
        isSeeded: true,
        isLiquid: liquidMap.get(name) ?? false,
        volatType: volatMap.get(name) ?? '',
      }));
    }
    const draft = loadDraft();
    if (draft.length > 0) return draft.map(d => ({ ...d, volatType: d.volatType ?? '' }));
    // First-time user: start with one empty row so they can type immediately.
    return [{ name: '', value: '', isSeeded: false, isLiquid: false, volatType: '' }];
  });

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateEntries = (newEntries: SourceEntry[]) => {
    setEntries(newEntries);
    saveDraft(newEntries);
    setValidationError(null);
  };

  const handleAddSource = () => {
    updateEntries([...entries, { name: '', value: '', isSeeded: false, isLiquid: false, volatType: '' }]);
  };

  const handleRemoveSource = (index: number) => {
    if (entries[index].isSeeded) {
      setValidationError('Cannot remove pre-filled data sources');
      return;
    }
    const updated = entries.filter((_, i) => i !== index);
    updateEntries(updated);
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

  const today = format(new Date(), 'dd MMM yyyy');

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="relative mx-4 w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">Add New Measurement</h2>
              <button
                onClick={() => { onOpenChange(false); navigate('/settings'); }}
                title="Change currency in preferences"
                className="group inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <span className="text-foreground">{currency.symbol}</span>
                <span>{currency.code}</span>
                <Settings className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
              </button>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Record your balances for {today}. All sources from your latest snapshot are pre-filled.
            </p>

            {validationError && (
              <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {validationError}
              </div>
            )}

            <TooltipProvider delayDuration={150}>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {entries.map((entry, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-border bg-secondary/30 p-2.5"
                  >
                    {/* Primary row: name + value + delete */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={entry.name}
                        onChange={e => handleChange(index, 'name', e.target.value)}
                        placeholder="Source name"
                        disabled={entry.isSeeded}
                        className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-60"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={entry.value}
                        onChange={e => handleChange(index, 'value', e.target.value)}
                        placeholder="0"
                        className="w-24 shrink-0 rounded-md border border-border bg-card px-3 py-1.5 text-right text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 sm:w-28"
                      />
                      <button
                        onClick={() => handleRemoveSource(index)}
                        disabled={entry.isSeeded}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                        title={entry.isSeeded ? "Cannot remove pre-filled source" : "Remove source"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Metadata row: volatility + liquid */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-0.5">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <label className="shrink-0 cursor-help text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-4">
                              Volatility
                            </label>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                            Free-text label for how much this source's value fluctuates (e.g. <span className="font-mono">Stable</span>, <span className="font-mono">Volatile</span>). Drives the "% volatile" KPI. Leave blank for Unknown.
                          </TooltipContent>
                        </Tooltip>
                        <input
                          type="text"
                          value={entry.volatType}
                          onChange={e => handleChange(index, 'volatType', e.target.value)}
                          placeholder={entry.isSeeded ? '—' : 'e.g. Volatile'}
                          disabled={entry.isSeeded}
                          title={entry.isSeeded ? 'Edit volatility from Settings → Sources' : undefined}
                          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-border focus:bg-card focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-60"
                        />
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <label className="cursor-help text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-4">
                              Liquid
                            </label>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                            Whether this source can be transferred to cash within a few days (e.g. savings account vs. pension plan). Drives the "% liquid" KPI.
                          </TooltipContent>
                        </Tooltip>
                        <Switch
                          checked={entry.isLiquid}
                          onCheckedChange={() => handleToggleLiquid(index)}
                          disabled={entry.isSeeded}
                          className="scale-90"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TooltipProvider>

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
