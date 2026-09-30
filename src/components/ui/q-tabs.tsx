import { useRef, type KeyboardEvent } from 'react';

interface QTabOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Explains a disabled option (read by screen readers, shown as a tooltip). */
  hint?: string;
}

interface QTabsProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: QTabOption<T>[];
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

/**
 * Single-select tabs with a roving tabindex: Tab enters on the selected
 * option; arrows, Home and End move and select.
 */
export function QTabs<T extends string>({ value, onChange, options, size = 'md', ariaLabel }: QTabsProps<T>) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const enabled = options.filter((o) => !o.disabled);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = enabled.findIndex((o) => o.value === value);
    let next: QTabOption<T> | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(i + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    wrapRef.current?.querySelector<HTMLElement>(`[data-tab="${next.value}"]`)?.focus();
  };

  return (
    <div
      className={`q-tabs q-tabs--${size}`}
      ref={wrapRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          disabled={o.disabled}
          title={o.disabled ? o.hint : undefined}
          aria-description={o.disabled ? o.hint : undefined}
          data-tab={o.value}
          className={`q-tab${o.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
