import { useState, useRef, useEffect, useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { ChevronDown, X } from 'lucide-react';
import { FilterState } from '@/lib/types';
import { Slider } from '@/components/ui/slider';
import { format } from 'date-fns';
import { toTitleCase } from '@/lib/utils';

function MultiSelect({
  label,
  options,
  selected,
  onChange
}: {label: string;options: string[];selected: string[];onChange: (v: string[]) => void;}) {
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
      selected.includes(option) ?
      selected.filter((s) => s !== option) :
      [...selected, option]
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Filter by sources"
        aria-expanded={open}
        className="q-btn q-btn--secondary q-btn--sm">

        {label}
        {selected.length > 0 &&
        <span className="q-badge q-badge--accent" style={{ padding: '0 6px' }}>
            {selected.length}
          </span>
        }
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open &&
      <div
        className="absolute left-0 top-full z-50 w-56"
        style={{
          marginTop: 'var(--s-1)',
          background: 'var(--bg-elev-1)',
          border: '1px solid var(--border-raw)',
          borderRadius: 'var(--r-3)',
          padding: 'var(--s-2)',
          boxShadow: 'var(--shadow-md)',
        }}>
          {selected.length > 0 &&
        <button
          onClick={() => onChange([])}
          className="mb-1 flex w-full items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
          style={{ borderRadius: 'var(--r-2)' }}>

              <X className="h-3 w-3" /> Clear all
            </button>
        }
          {options.map((option) =>
        <label
          key={option}
          className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-secondary"
          style={{ borderRadius: 'var(--r-2)' }}>

              <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={() => toggle(option)}
            className="border-border accent-primary"
            style={{ borderRadius: 'var(--r-1)' }} />

              {option}
            </label>
        )}
        </div>
      }
    </div>);

}

function ToggleFilter({
  value,
  options,
  onChange
}: {value: string;options: {value: string;label: string;}[];onChange: (v: string) => void;}) {
  return (
    <div
      className="flex items-center gap-0.5 border bg-secondary/50 p-0.5"
      style={{ borderRadius: 'var(--r-3)', borderColor: 'var(--border-raw)' }}
      role="radiogroup" aria-label="Filter by type">
      {options.map((opt) =>
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        role="radio"
        aria-checked={value === opt.value}
        style={{ borderRadius: 'var(--r-2)' }}
        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
        value === opt.value ?
        'bg-primary text-primary-foreground' :
        'text-muted-foreground hover:text-foreground'}`
        }>
        
          {opt.label}
        </button>
      )}
    </div>);

}

function DateRangeSlider() {
  const { filters, updateFilters, dateRange } = usePortfolio();

  // Build monthly ticks from the full data range
  const months = useMemo(() => {
    if (!dateRange) return [];
    const result: Date[] = [];
    const current = new Date(dateRange[0].getFullYear(), dateRange[0].getMonth(), 1);
    const end = new Date(dateRange[1].getFullYear(), dateRange[1].getMonth(), 1);
    while (current <= end) {
      result.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }
    return result;
  }, [dateRange]);

  if (months.length < 2) return null;

  // Map current filter dates to slider indices
  const startIdx = filters.dateRange[0] ?
  months.findIndex((m) => m.getFullYear() === filters.dateRange[0]!.getFullYear() && m.getMonth() === filters.dateRange[0]!.getMonth()) :
  0;
  const endIdx = filters.dateRange[1] ?
  months.findIndex((m) => m.getFullYear() === filters.dateRange[1]!.getFullYear() && m.getMonth() === filters.dateRange[1]!.getMonth()) :
  months.length - 1;

  const safeStart = Math.max(0, startIdx === -1 ? 0 : startIdx);
  const safeEnd = Math.max(safeStart, endIdx === -1 ? months.length - 1 : endIdx);

  const handleChange = (values: number[]) => {
    const startMonth = months[values[0]];
    const endMonth = months[values[1]];
    updateFilters({
      dateRange: [
      new Date(startMonth.getFullYear(), startMonth.getMonth(), 1),
      new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0, 23, 59, 59)]

    });
  };

  const startLabel = format(months[safeStart], 'MMM yyyy');
  const endLabel = format(months[safeEnd], 'MMM yyyy');

  return (
    <div className="flex w-full items-center gap-3 sm:w-auto sm:min-w-[280px]" role="group" aria-label="Date range filter">
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{startLabel}</span>
      <Slider
        min={0}
        max={months.length - 1}
        step={1}
        value={[safeStart, safeEnd]}
        onValueChange={handleChange}
        className="flex-1" />

      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{endLabel}</span>
    </div>);

}

export function FilterBar() {
  const { filters, updateFilters, allSources, allVolatTypes } = usePortfolio();

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
      <DateRangeSlider />

      <div className="hidden h-6 w-px bg-border sm:block" />

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <MultiSelect
          label="Sources"
          options={allSources}
          selected={filters.sources}
          onChange={(v) => updateFilters({ sources: v })} />

        <ToggleFilter
          value={filters.volatTypes.length === 1 ? filters.volatTypes[0] : 'all'}
          options={[
          { value: 'all', label: 'All' },
          ...allVolatTypes.map((v) => ({ value: v, label: toTitleCase(v) }))]
          }
          onChange={(v) => updateFilters({ volatTypes: v === 'all' ? [] : [v] })} />

        <div className="hidden h-6 w-px bg-border sm:block" />

        <ToggleFilter
          value={filters.liquidFilter}
          options={[
          { value: 'all', label: 'All' },
          { value: 'liquid', label: 'Liquid' },
          { value: 'non-liquid', label: 'Non-liquid' }]
          }
          onChange={(v) => updateFilters({ liquidFilter: v as FilterState['liquidFilter'] })} />
      </div>
    </div>);

}