import { useState, useRef, useEffect } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { ChevronDown, X, Calendar } from 'lucide-react';
import { FilterState } from '@/lib/types';

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (option: string) => {
    onChange(
      selected.includes(option)
        ? selected.filter(s => s !== option)
        : [...selected, option]
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded-full bg-primary/20 px-1.5 text-xs text-primary">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-popover p-2 shadow-xl">
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
          {options.map(option => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
                className="rounded border-border accent-primary"
              />
              {option}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ToggleFilter({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-secondary/50 p-0.5">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function FilterBar() {
  const { filters, updateFilters, allSources, allVolatTypes, dateRange } = usePortfolio();

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <input
          type="date"
          value={filters.dateRange[0]?.toISOString().slice(0, 10) || ''}
          min={dateRange?.[0]?.toISOString().slice(0, 10)}
          max={dateRange?.[1]?.toISOString().slice(0, 10)}
          onChange={(e) =>
            updateFilters({
              dateRange: [e.target.value ? new Date(e.target.value + 'T00:00:00') : null, filters.dateRange[1]],
            })
          }
          className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
        />
        <span className="text-muted-foreground">→</span>
        <input
          type="date"
          value={filters.dateRange[1]?.toISOString().slice(0, 10) || ''}
          min={dateRange?.[0]?.toISOString().slice(0, 10)}
          max={dateRange?.[1]?.toISOString().slice(0, 10)}
          onChange={(e) =>
            updateFilters({
              dateRange: [filters.dateRange[0], e.target.value ? new Date(e.target.value + 'T23:59:59') : null],
            })
          }
          className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
        />
      </div>

      <div className="h-6 w-px bg-border" />

      <MultiSelect
        label="Sources"
        options={allSources}
        selected={filters.sources}
        onChange={(v) => updateFilters({ sources: v })}
      />
      <ToggleFilter
        value={filters.volatTypes.length === 1 ? filters.volatTypes[0] : 'all'}
        options={[
          { value: 'all', label: 'All' },
          ...allVolatTypes.map(v => ({ value: v, label: v })),
        ]}
        onChange={(v) => updateFilters({ volatTypes: v === 'all' ? [] : [v] })}
      />

      <div className="h-6 w-px bg-border" />

      <ToggleFilter
        value={filters.cryptoFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'crypto', label: 'Crypto' },
          { value: 'non-crypto', label: 'Traditional' },
        ]}
        onChange={(v) => updateFilters({ cryptoFilter: v as FilterState['cryptoFilter'] })}
      />

      <ToggleFilter
        value={filters.liquidFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'liquid', label: 'Liquid' },
          { value: 'non-liquid', label: 'Non-Liquid' },
        ]}
        onChange={(v) => updateFilters({ liquidFilter: v as FilterState['liquidFilter'] })}
      />
    </div>
  );
}
